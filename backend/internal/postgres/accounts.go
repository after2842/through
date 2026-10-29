package postgres

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"through/backend/internal/core"
)

func auditAccount(ctx context.Context, tx pgx.Tx, p *core.Principal, action, target, accountID string) error {
	_, e := tx.Exec(ctx, "INSERT INTO audit_events(workspace_id,actor_id,action,target,account_id) VALUES($1,$2,$3,$4,$5)", p.WorkspaceID, p.UserID, action, target, accountID)
	return e
}

// AddAccount preserves the original single-agent demo contract. New connections
// use CreateAccount; legacy rows do not gain a fictional submitted username.
func (s *Store) AddAccount(ctx context.Context, p *core.Principal, service, agent string) error {
	if !core.ValidAccount(service, agent) {
		return core.Invalid("Choose a supported account and agent.")
	}
	return s.addAccount(ctx, p, core.AccountInput{Service: service, Origin: core.ServiceOrigins[service], Agents: []string{agent}}, true)
}

func (s *Store) CreateAccount(ctx context.Context, p *core.Principal, input core.AccountInput) error {
	input, e := input.Normalize()
	if e != nil {
		return e
	}
	return s.addAccount(ctx, p, input, false)
}

func (s *Store) addAccount(ctx context.Context, p *core.Principal, input core.AccountInput, legacy bool) error {
	return s.mutate(ctx, p, true, func(tx pgx.Tx) error {
		id := core.NewID()
		var legacyAgent *string
		if legacy {
			legacyAgent = &input.Agents[0]
		}
		_, e := tx.Exec(ctx, "INSERT INTO accounts(id,workspace_id,service,agent,origin,username,legacy_agent) VALUES($1,$2,$3,$4,$5,$6,$7)", id, p.WorkspaceID, input.Service, input.Agents[0], input.Origin, input.Username, legacyAgent)
		var pe *pgconn.PgError
		if errors.As(e, &pe) && pe.Code == "23505" {
			return core.ErrDuplicate
		}
		if e != nil {
			return e
		}
		if e = replaceAgents(ctx, tx, p, id, input.Agents); e != nil {
			return e
		}
		return auditAccount(ctx, tx, p, "account.connected", input.Service+" / "+strings.Join(input.Agents, ", "), id)
	})
}

func replaceAgents(ctx context.Context, tx pgx.Tx, p *core.Principal, id string, agents []string) error {
	if _, e := tx.Exec(ctx, "DELETE FROM account_agents WHERE workspace_id=$1 AND account_id=$2", p.WorkspaceID, id); e != nil {
		return e
	}
	for position, agent := range agents {
		if _, e := tx.Exec(ctx, "INSERT INTO account_agents(workspace_id,account_id,agent,position) VALUES($1,$2,$3,$4)", p.WorkspaceID, id, agent, position); e != nil {
			return e
		}
	}
	return nil
}

func (s *Store) SetAccountAgents(ctx context.Context, p *core.Principal, id string, agents []string) error {
	agents, e := core.AccountAgents(agents, false)
	if e != nil {
		return e
	}
	return s.editAccountAgents(ctx, p, id, func([]string) []string { return agents })
}

// SetAccountAgent changes one permission against current state inside the
// policy lock. A stale browser cannot accidentally regrant a different agent
// when another administrator has revoked it since the page was loaded.
func (s *Store) SetAccountAgent(ctx context.Context, p *core.Principal, id, agent string, allowed bool) error {
	if !core.ValidAgent(agent) {
		return core.Invalid("Choose a supported agent.")
	}
	return s.editAccountAgents(ctx, p, id, func(previous []string) []string {
		agents := slices.Clone(previous)
		if allowed {
			if !slices.Contains(agents, agent) {
				agents = append(agents, agent)
			}
			return agents
		}
		return slices.DeleteFunc(agents, func(value string) bool { return value == agent })
	})
}

func (s *Store) editAccountAgents(ctx context.Context, p *core.Principal, id string, change func([]string) []string) error {
	return s.mutate(ctx, p, true, func(tx pgx.Tx) error {
		var service string
		var previous []string
		e := tx.QueryRow(ctx, `SELECT a.service,ARRAY(SELECT agent FROM account_agents g WHERE g.workspace_id=a.workspace_id AND g.account_id=a.id ORDER BY position) FROM accounts a WHERE a.workspace_id=$1 AND a.id=$2 AND a.revoked_at IS NULL`, p.WorkspaceID, id).Scan(&service, &previous)
		if errors.Is(e, pgx.ErrNoRows) {
			return core.ErrNotFound
		}
		if e != nil {
			return e
		}
		agents := change(previous)
		if slices.Equal(previous, agents) {
			return nil
		}
		if e = replaceAgents(ctx, tx, p, id, agents); e != nil {
			return e
		}
		first := ""
		if len(agents) > 0 {
			first = agents[0]
		}
		if _, e = tx.Exec(ctx, "UPDATE accounts SET agent=$1 WHERE workspace_id=$2 AND id=$3", first, p.WorkspaceID, id); e != nil {
			return e
		}
		return auditAccount(ctx, tx, p, "account.agents_updated", service+" / "+agentSummary(previous)+" → "+agentSummary(agents), id)
	})
}

func agentSummary(agents []string) string {
	if len(agents) == 0 {
		return "No agents"
	}
	return strings.Join(agents, ", ")
}

// UpdateCredential changes simulated metadata only. There is no secret input,
// credential storage, remote reset, or vault/browser provider call in this API.
func (s *Store) UpdateCredential(ctx context.Context, p *core.Principal, id string) error {
	return s.mutate(ctx, p, true, func(tx pgx.Tx) error {
		var service string
		e := tx.QueryRow(ctx, "UPDATE accounts SET credential_version=credential_version+1,credential_updated_at=now() WHERE workspace_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING service", p.WorkspaceID, id).Scan(&service)
		if errors.Is(e, pgx.ErrNoRows) {
			return core.ErrNotFound
		}
		if e != nil {
			return e
		}
		return auditAccount(ctx, tx, p, "credential.updated", service, id)
	})
}
