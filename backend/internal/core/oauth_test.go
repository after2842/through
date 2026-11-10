package core

import "testing"

func TestRedirectURIValidation(t *testing.T) {
	for _, ok := range []string{"https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector_platform_oauth_redirect", "http://localhost:3118/callback", "http://127.0.0.1/callback", "http://[::1]:9000/cb", "cursor://anysphere.cursor-mcp/oauth/callback"} {
		if _, e := RedirectURI(ok); e != nil {
			t.Fatalf("rejected %s", ok)
		}
	}
	for _, bad := range []string{"", "http://example.com/cb", "https://claude.ai/cb#frag", "javascript:alert(1)", "data:text/html,x", "https://user@claude.ai/cb", "https://localhost/cb", "file:///etc/passwd", "https:///nohost", "https://claude.ai/a b"} {
		if _, e := RedirectURI(bad); e == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestRedirectMatchesLoopbackOnAnyPort(t *testing.T) {
	registered := []string{"http://localhost/callback", "https://claude.ai/api/mcp/auth_callback"}
	if !RedirectMatches(registered, "http://localhost:49152/callback") || !RedirectMatches(registered, "https://claude.ai/api/mcp/auth_callback") {
		t.Fatal("expected match")
	}
	for _, requested := range []string{"http://localhost:49152/other", "http://127.0.0.1:49152/callback", "https://claude.ai/api/mcp/auth_callback/", "https://claude.ai:8443/api/mcp/auth_callback", "https://evil.example/api/mcp/auth_callback"} {
		if RedirectMatches(registered, requested) {
			t.Fatalf("unexpected match %s", requested)
		}
	}
}

func TestPKCEAndScope(t *testing.T) {
	// RFC 7636 appendix B.
	if !VerifyPKCE("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM") {
		t.Fatal("RFC 7636 vector failed")
	}
	if VerifyPKCE("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXX", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM") || VerifyPKCE("short", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM") {
		t.Fatal("bad verifier accepted")
	}
	for in, want := range map[string]string{"": "through", "through": "through", "offline_access through": "through offline_access", "through through": "through"} {
		got, e := Scope(in)
		if e != nil || got != want {
			t.Fatalf("Scope(%q)=%q,%v", in, got, e)
		}
	}
	if _, e := Scope("admin"); e == nil {
		t.Fatal("unknown scope accepted")
	}
	if ClientName("  Claude\n\x00 Code ") != "Claude Code" || ClientName("") != "MCP client" {
		t.Fatal("client name not sanitized")
	}
}
