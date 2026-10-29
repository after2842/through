package core

import (
	"net"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// These origins describe illustrative account choices, not installed adapters.
var ServiceOrigins = map[string]string{
	"GitHub": "https://github.com", "Linear": "https://linear.app", "Notion": "https://www.notion.so",
	"Figma": "https://www.figma.com", "Slack": "https://app.slack.com", "Google Workspace": "https://accounts.google.com",
	"Microsoft 365": "https://login.microsoftonline.com", "Atlassian": "https://id.atlassian.com", "Airtable": "https://airtable.com",
	"Asana": "https://app.asana.com", "Vercel": "https://vercel.com", "Dropbox": "https://www.dropbox.com",
	"HubSpot": "https://app.hubspot.com", "Salesforce": "https://login.salesforce.com",
}

type AccountInput struct {
	Service  string   `json:"service"`
	Origin   string   `json:"origin"`
	Username string   `json:"username"`
	Agents   []string `json:"agents"`
}

func ValidAgent(value string) bool { return value == "Claude" || value == "Codex" || value == "Cursor" }

func AccountAgents(agents []string, requireOne bool) ([]string, error) {
	if len(agents) > 3 || (requireOne && len(agents) == 0) {
		return nil, Invalid("Choose at least one agent and no more than three.")
	}
	result := make([]string, 0, len(agents))
	seen := map[string]bool{}
	for _, agent := range agents {
		if !ValidAgent(agent) || seen[agent] {
			return nil, Invalid("Choose each supported agent only once.")
		}
		seen[agent] = true
		result = append(result, agent)
	}
	return result, nil
}

var domainLabel = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
var domainTLD = regexp.MustCompile(`^[a-z]{2,63}$|^xn--[a-z0-9-]{2,59}$`)

// AccountOrigin validates syntax only. It never resolves DNS or fetches a URL,
// and a public-looking hostname is not evidence of a verified browser origin.
func AccountOrigin(value string) (string, error) {
	value = strings.TrimSpace(value)
	u, e := url.Parse(value)
	if e != nil || u.Scheme != "https" || u.User != nil || u.Opaque != "" || u.Host == "" || u.Host != u.Hostname() || (u.Path != "" && u.Path != "/") || u.RawPath != "" || u.RawQuery != "" || u.ForceQuery || strings.Contains(value, "#") {
		return "", Invalid("Use an HTTPS domain without a path, port, query, or sign-in information.")
	}
	host := strings.ToLower(u.Hostname())
	if len(host) > 253 || net.ParseIP(host) != nil {
		return "", Invalid("Use a public website domain.")
	}
	for _, suffix := range []string{"localhost", "local", "internal", "test", "invalid", "home", "lan", "intranet", "corp"} {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return "", Invalid("Use a public website domain.")
		}
	}
	labels := strings.Split(host, ".")
	if len(labels) < 2 || !domainTLD.MatchString(labels[len(labels)-1]) {
		return "", Invalid("Use a public website domain.")
	}
	for _, label := range labels {
		if !domainLabel.MatchString(label) {
			return "", Invalid("Use a valid website domain.")
		}
	}
	return "https://" + host, nil
}

func accountText(value string, max int, message string) (string, error) {
	if !utf8.ValidString(value) {
		return "", Invalid(message)
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return "", Invalid(message)
		}
	}
	value = strings.TrimSpace(value)
	if value == "" || utf8.RuneCountInString(value) > max {
		return "", Invalid(message)
	}
	return value, nil
}

func (input AccountInput) Normalize() (AccountInput, error) {
	var e error
	if input.Service, e = accountText(input.Service, 80, "Use a platform name between 1 and 80 characters, without control characters."); e != nil {
		return input, e
	}
	if input.Username, e = accountText(input.Username, 254, "Use an account email or username between 1 and 254 characters, without control characters."); e != nil {
		return input, e
	}
	if input.Origin, e = AccountOrigin(input.Origin); e != nil {
		return input, e
	}
	if expected, known := ServiceOrigins[input.Service]; known && expected != input.Origin {
		return input, Invalid("Use this platform's listed sign-in domain, or give a custom platform its own name.")
	}
	input.Agents, e = AccountAgents(input.Agents, true)
	return input, e
}
