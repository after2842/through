package core

import (
	"strings"
	"testing"
)

func TestAccountOriginBoundary(t *testing.T) {
	for _, value := range []string{"https://Portal.Example.com/", " https://portal.example.com "} {
		got, err := AccountOrigin(value)
		if err != nil || got != "https://portal.example.com" {
			t.Fatalf("origin normalization: %q %v", got, err)
		}
	}
	for _, value := range []string{
		"portal.example.com", "http://example.com", "https://example.com:443", "https://example.com:",
		"https://user@example.com", "https://user:secret@example.com", "https://example.com/login", "https://example.com//",
		"https://example.com/%2f", "https://example.com?", "https://example.com?q=one", "https://example.com#", "https://example.com#one",
		"https://127.0.0.1", "https://127.1", "https://2130706433", "https://[::1]", "https://10.2.3.4", "https://localhost",
		"https://one.local", "https://one.internal", "https://one.localhost", "https://one.test", "https://one.invalid",
		"https://one.home", "https://one.lan", "https://one.intranet", "https://one.corp", "https://example.com.",
		"https://bad_name.example.com", "https://-bad.example.com", "https://bad-.example.com", "https://bad..example.com",
		"https://例え.com", "https://" + strings.Repeat("a", 64) + ".com", "javascript:alert(1)",
	} {
		if got, err := AccountOrigin(value); err == nil {
			t.Errorf("unsafe origin accepted: %q as %q", value, got)
		}
	}
}

func TestConnectionInputBoundsAndKnownPlatformBinding(t *testing.T) {
	valid := AccountInput{Service: "Custom portal", Origin: "https://portal.example.com", Username: "Alex", Agents: []string{"Claude", "Codex", "Cursor"}}
	for _, change := range []func(*AccountInput){
		func(i *AccountInput) { i.Service = "" },
		func(i *AccountInput) { i.Service = strings.Repeat("界", 81) },
		func(i *AccountInput) { i.Service = "Portal\nOther" },
		func(i *AccountInput) { i.Username = " " },
		func(i *AccountInput) { i.Username = strings.Repeat("界", 255) },
		func(i *AccountInput) { i.Username = "Alex\u0000" },
		func(i *AccountInput) { i.Agents = nil },
		func(i *AccountInput) { i.Agents = []string{"Claude", "Claude"} },
		func(i *AccountInput) { i.Agents = []string{"Unknown"} },
		func(i *AccountInput) { i.Service = "GitHub" },
	} {
		input := valid
		change(&input)
		if _, err := input.Normalize(); err == nil {
			t.Fatalf("invalid input accepted: %#v", input)
		}
	}
	for service, origin := range ServiceOrigins {
		if _, err := (AccountInput{Service: service, Origin: origin, Username: "alex@example.com", Agents: []string{"Codex"}}).Normalize(); err != nil {
			t.Fatalf("catalog entry %s rejected: %v", service, err)
		}
	}
}
