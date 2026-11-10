// Package core defines the API's public values and integration boundaries.
package core

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/mail"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string { return e.Code }

var (
	ErrUnauthorized       = &Error{"unauthorized", "Sign in to continue.", 401}
	ErrForbidden          = &Error{"forbidden", "You do not have permission to do that.", 403}
	ErrChallenge          = &Error{"invalid_challenge", "That code could not be verified. Request a new code if needed.", 401}
	ErrChallengeExpired   = &Error{"challenge_expired", "This code has expired or was already used. Start again to request a new code.", 401}
	ErrChallengeExhausted = &Error{"challenge_exhausted", "Too many incorrect codes. Start again to request a new code.", 401}
	ErrNotFound           = &Error{"not_found", "That resource was not found.", 404}
	ErrDuplicate          = &Error{"duplicate_account", "That account is already connected. Manage its agent permissions from the connection.", 409}
	ErrPaused             = &Error{"access_paused", "Account access is paused.", 403}
	ErrConflict           = &Error{"idempotency_conflict", "This request key was already used for a different operation.", 409}
	ErrRateLimit          = &Error{"rate_limited", "Too many attempts. Try again later.", 429}
)

func Invalid(message string) error { return &Error{"invalid_request", message, 400} }
func NewID() string                { return rand.Text() }
func Hash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func Email(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	a, e := mail.ParseAddress(value)
	if e != nil || a.Address != value || len(value) > 254 || !strings.Contains(value, ".") {
		return "", Invalid("Enter a valid email address.")
	}
	return value, nil
}

// DisplayName accepts an optional name, never a credential or identity proof.
// Count Unicode code points instead of bytes so non-ASCII names have the same limit.
func DisplayName(value string) (string, error) {
	if !utf8.ValidString(value) {
		return "", Invalid("Enter a valid display name.")
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return "", Invalid("Display names cannot contain control characters.")
		}
	}
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) > 80 {
		return "", Invalid("Use 80 characters or fewer for your display name.")
	}
	return value, nil
}

func ValidAccount(service, agent string) bool {
	_, ok := ServiceOrigins[service]
	return ok && ValidAgent(agent)
}
func CanWrite(role string) bool { return role == "owner" || role == "admin" }

type User struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
}
type Workspace struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	AccessPaused bool   `json:"accessPaused"`
}
type Account struct {
	ID                  string    `json:"id"`
	Service             string    `json:"service"`
	Agent               string    `json:"agent"`
	Agents              []string  `json:"agents"`
	Origin              string    `json:"origin"`
	Username            string    `json:"username"`
	CreatedAt           time.Time `json:"createdAt"`
	CredentialUpdatedAt time.Time `json:"credentialUpdatedAt"`
	CredentialVersion   int       `json:"credentialVersion"`
	Simulated           bool      `json:"simulated"`
}
type Session struct {
	User      User      `json:"user"`
	Workspace Workspace `json:"workspace"`
	Accounts  []Account `json:"accounts"`
	CSRFToken string    `json:"csrfToken"`
	Mode      string    `json:"mode"`
	ExpiresAt time.Time `json:"expiresAt"`
}
type Challenge struct {
	ID        string    `json:"challengeId"`
	ExpiresAt time.Time `json:"expiresAt"`
	Mode      string    `json:"mode"`
}
type AuthResult struct {
	Session *Session
	Token   string
}
type Principal struct{ UserID, WorkspaceID, SessionHash, CSRFToken, Role string }
type AuditEvent struct {
	ID         int64     `json:"id"`
	Action     string    `json:"action"`
	ActorEmail string    `json:"actorEmail"`
	OccurredAt time.Time `json:"occurredAt"`
	Target     string    `json:"target,omitempty"`
	AccountID  string    `json:"accountId,omitempty"`
}
type AuditPage struct {
	Events     []AuditEvent `json:"events"`
	NextCursor string       `json:"nextCursor,omitempty"`
}
type HandoffInput struct {
	AccountID        string `json:"accountId"`
	Agent            string `json:"agent"`
	TargetOrigin     string `json:"targetOrigin"`
	BrowserSessionID string `json:"browserSessionId"`
	TabID            string `json:"tabId"`
}
type Handoff struct {
	ID               string    `json:"id"`
	AccountID        string    `json:"accountId"`
	Agent            string    `json:"agent"`
	TargetOrigin     string    `json:"targetOrigin"`
	BrowserSessionID string    `json:"browserSessionId"`
	TabID            string    `json:"tabId"`
	Status           string    `json:"status"`
	Simulated        bool      `json:"simulated"`
	CreatedAt        time.Time `json:"createdAt"`
	ExpiresAt        time.Time `json:"expiresAt"`
}

func (i HandoffInput) Validate() error {
	if i.AccountID == "" || len(i.AccountID) > 64 || len(i.TargetOrigin) > 261 || len(i.BrowserSessionID) < 1 || len(i.BrowserSessionID) > 128 || len(i.TabID) < 1 || len(i.TabID) > 128 {
		return Invalid("Provide a connected account and a bounded browser session and tab ID.")
	}
	for _, v := range []string{i.BrowserSessionID, i.TabID} {
		for _, r := range v {
			if r < 33 || r > 126 {
				return Invalid("Browser identifiers must contain printable ASCII without spaces.")
			}
		}
	}
	return nil
}

type Store interface {
	Ping(context.Context) error
	CreateChallenge(context.Context, string) (*Challenge, error)
	VerifyChallenge(context.Context, string, string) (*AuthResult, error)
	Authenticate(context.Context, string) (*Principal, error)
	Session(context.Context, *Principal) (*Session, error)
	Logout(context.Context, *Principal) error
	LogoutOthers(context.Context, *Principal) (int64, error)
	UpdateProfile(context.Context, *Principal, string) error
	AddAccount(context.Context, *Principal, string, string) error
	CreateAccount(context.Context, *Principal, AccountInput) error
	SetAccountAgents(context.Context, *Principal, string, []string) error
	SetAccountAgent(context.Context, *Principal, string, string, bool) error
	UpdateCredential(context.Context, *Principal, string) error
	RemoveAccount(context.Context, *Principal, string) error
	SetPaused(context.Context, *Principal, bool) error
	Audit(context.Context, *Principal, int64, int, ...string) (*AuditPage, error)
	CreateHandoff(context.Context, *Principal, HandoffInput, string) (*Handoff, bool, error)
	Handoff(context.Context, *Principal, string) (*Handoff, error)

	// Agent connections: OAuth 2.1 for MCP clients. Access tokens authenticate
	// only through AuthenticateBearer; Authenticate (cookies) rejects them.
	RegisterClient(ctx context.Context, name string, redirectURIs []string) (*OAuthClient, error)
	OAuthClient(ctx context.Context, id string) (*OAuthClient, error)
	CreateAuthCode(context.Context, *Principal, AuthCodeInput) (string, error)
	ExchangeCode(ctx context.Context, code, clientID, redirectURI, verifier string) (*TokenSet, error)
	RefreshTokens(ctx context.Context, refreshToken, clientID string) (*TokenSet, error)
	AuthenticateBearer(ctx context.Context, token string) (*Principal, string, error)
	AgentConnections(context.Context, *Principal) ([]AgentConnection, error)
	RevokeAgentConnection(context.Context, *Principal, string) error
}

// IdentityProvider never receives a password. A production provider must perform
// its own enrollment, verification, recovery, and anti-abuse protocol.
type IdentityProvider interface {
	Verify(context.Context, string) error
	Name() string
}
type DemoIdentity struct{}

func (DemoIdentity) Name() string { return "demo" }
func (DemoIdentity) Verify(_ context.Context, code string) error {
	if code != "0000" {
		return ErrChallenge
	}
	return nil
}

// BrowserAdapter only receives non-secret, bounded grants. It must never return
// credentials, tokens, or browser contents. The only included adapter is a stub.
type BrowserAdapter interface {
	Consume(context.Context, Handoff) (string, error)
	Name() string
}
type PlaceholderBrowser struct{}

func (PlaceholderBrowser) Name() string { return "placeholder" }
func (PlaceholderBrowser) Consume(_ context.Context, h Handoff) (string, error) {
	if h.ID == "" {
		return "", errors.New("missing grant")
	}
	return "simulated", nil
}
