package core

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// OAuthScope is the single scope an agent connection receives. offline_access
// is accepted because some clients request it to obtain a refresh token.
const OAuthScope = "through"

const (
	AccessTokenTTL  = time.Hour
	RefreshTokenTTL = 30 * 24 * time.Hour
	AuthCodeTTL     = 5 * time.Minute
)

// OAuthError is an RFC 6749 error, kept apart from API errors because the token
// and registration endpoints have their own wire format.
type OAuthError struct {
	Code        string
	Description string
	Status      int
}

func (e *OAuthError) Error() string { return e.Code }

func OAuthInvalid(code, description string) error {
	return &OAuthError{Code: code, Description: description, Status: 400}
}

var ErrInvalidGrant = &OAuthError{Code: "invalid_grant", Description: "The authorization code or refresh token is invalid, expired, or already used.", Status: 400}
var ErrInvalidClient = &OAuthError{Code: "invalid_client", Description: "Unknown client.", Status: 401}

type OAuthClient struct {
	ID           string    `json:"client_id"`
	Name         string    `json:"client_name"`
	RedirectURIs []string  `json:"redirect_uris"`
	CreatedAt    time.Time `json:"-"`
}

type AuthCodeInput struct {
	ClientID, RedirectURI, CodeChallenge, Scope, Agent string
}

type TokenSet struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
}

// AgentConnection is an OAuth grant as the web app shows it. Client names are
// self-reported by the registering client and are never treated as identity.
type AgentConnection struct {
	ID           string     `json:"id"`
	ClientName   string     `json:"clientName"`
	RedirectHost string     `json:"redirectHost"`
	Agent        string     `json:"agent"`
	UserEmail    string     `json:"userEmail"`
	Mine         bool       `json:"mine"`
	CreatedAt    time.Time  `json:"createdAt"`
	LastUsedAt   *time.Time `json:"lastUsedAt"`
}

// ClientName accepts the self-reported DCR name for display only.
func ClientName(value string) string {
	var b strings.Builder
	for _, r := range value {
		if !unicode.IsControl(r) {
			b.WriteRune(r)
		}
	}
	name := strings.Join(strings.Fields(b.String()), " ")
	if !utf8.ValidString(name) || name == "" {
		return "MCP client"
	}
	if utf8.RuneCountInString(name) > 80 {
		name = string([]rune(name)[:80])
	}
	return name
}

var customScheme = regexp.MustCompile(`^[a-z][a-z0-9+.-]{1,62}$`)
var blockedSchemes = map[string]bool{"javascript": true, "data": true, "file": true, "vbscript": true, "blob": true, "about": true, "ftp": true, "ws": true, "wss": true, "http": true, "https": true, "mailto": true, "tel": true, "filesystem": true}

func isLoopback(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

// RedirectURI validates a URI a client registers. HTTPS is required except for
// RFC 8252 loopback redirects and private-use schemes of native apps.
func RedirectURI(value string) (*url.URL, error) {
	invalid := OAuthInvalid("invalid_redirect_uri", "Use an HTTPS redirect URI, an http loopback URI, or a private-use app scheme, without a fragment.")
	if value == "" || len(value) > 512 || strings.ContainsAny(value, " \t\r\n#\\") {
		return nil, invalid
	}
	u, e := url.Parse(value)
	if e != nil || u.Fragment != "" || u.User != nil {
		return nil, invalid
	}
	switch {
	case u.Scheme == "https":
		if u.Host == "" || u.Opaque != "" || isLoopback(u.Hostname()) {
			return nil, invalid
		}
	case u.Scheme == "http":
		if !isLoopback(u.Hostname()) || u.Opaque != "" {
			return nil, invalid
		}
	default:
		if !customScheme.MatchString(u.Scheme) || blockedSchemes[u.Scheme] {
			return nil, invalid
		}
	}
	return u, nil
}

// RedirectMatches compares a requested redirect with a registered one. Loopback
// redirects match on any port (RFC 8252 section 7.3); everything else is exact.
func RedirectMatches(registered []string, requested string) bool {
	want, e := RedirectURI(requested)
	if e != nil {
		return false
	}
	for _, candidate := range registered {
		if candidate == requested {
			return true
		}
		have, e := url.Parse(candidate)
		if e != nil || have.Scheme != "http" || want.Scheme != "http" {
			continue
		}
		if have.Hostname() == want.Hostname() && isLoopback(want.Hostname()) && have.EscapedPath() == want.EscapedPath() && have.RawQuery == want.RawQuery {
			return true
		}
	}
	return false
}

// RedirectLabel is what the consent screen shows the user for a redirect URI.
func RedirectLabel(value string) string {
	u, e := url.Parse(value)
	if e != nil {
		return ""
	}
	if u.Scheme == "https" || u.Scheme == "http" {
		return u.Hostname()
	}
	return u.Scheme + ":"
}

// RedirectOrigin is the CSP form-action source that lets the consent form's
// redirect reach the client.
func RedirectOrigin(value string) string {
	u, e := url.Parse(value)
	if e != nil {
		return ""
	}
	if u.Scheme == "https" || u.Scheme == "http" {
		return u.Scheme + "://" + u.Host
	}
	return u.Scheme + ":"
}

var pkcePattern = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)

func ValidCodeChallenge(challenge string) bool { return pkcePattern.MatchString(challenge) }

// VerifyPKCE checks an S256 code verifier against its stored challenge.
func VerifyPKCE(verifier, challenge string) bool {
	if !pkcePattern.MatchString(verifier) {
		return false
	}
	sum := sha256.Sum256([]byte(verifier))
	computed := base64.RawURLEncoding.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(computed), []byte(challenge)) == 1
}

// Scope normalizes a requested scope. An empty request receives the default.
func Scope(value string) (string, error) {
	granted := []string{OAuthScope}
	for _, item := range strings.Fields(value) {
		switch item {
		case OAuthScope:
		case "offline_access":
			if len(granted) == 1 {
				granted = append(granted, item)
			}
		default:
			return "", OAuthInvalid("invalid_scope", "Request the \"through\" scope.")
		}
	}
	return strings.Join(granted, " "), nil
}
