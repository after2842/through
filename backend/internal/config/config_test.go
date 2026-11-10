package config

import "testing"

func TestConfigFailsClosed(t *testing.T) {
	base := map[string]string{"THROUGH_ENV": "development", "THROUGH_DEMO_AUTH": "true", "THROUGH_DATABASE_URL": "postgres://localhost/test", "THROUGH_ALLOWED_ORIGINS": "http://127.0.0.1:8080"}
	for _, test := range []struct {
		name, key, value string
		ok               bool
	}{{"valid", "", "", true}, {"production", "THROUGH_ENV", "production", false}, {"default production", "THROUGH_ENV", "", false}, {"demo disabled", "THROUGH_DEMO_AUTH", "false", false}, {"missing database", "THROUGH_DATABASE_URL", "", false}, {"missing origins", "THROUGH_ALLOWED_ORIGINS", "", false}, {"wildcard origin", "THROUGH_ALLOWED_ORIGINS", "*", false}, {"plain remote origin", "THROUGH_ALLOWED_ORIGINS", "http://example.com", false}, {"origin path", "THROUGH_ALLOWED_ORIGINS", "https://example.com/", false}, {"TLS origin", "THROUGH_ALLOWED_ORIGINS", "https://example.com", true}, {"mixed HTTP and HTTPS", "THROUGH_ALLOWED_ORIGINS", "http://127.0.0.1:8080,https://example.com", false}, {"short metrics token", "THROUGH_METRICS_TOKEN", "short", false}, {"public origin not allowed", "THROUGH_PUBLIC_ORIGIN", "https://other.example.com", false}, {"public origin allowed", "THROUGH_PUBLIC_ORIGIN", "http://127.0.0.1:8080", true}, {"multiline challenge", "THROUGH_OPENAI_APPS_CHALLENGE", "a\nb", false}} {
		t.Run(test.name, func(t *testing.T) {
			env := map[string]string{}
			for k, v := range base {
				env[k] = v
			}
			if test.key != "" {
				env[test.key] = test.value
			}
			c, e := Parse(func(k string) string { return env[k] })
			if (e == nil) != test.ok {
				t.Fatalf("unexpected config result: %v", e)
			}
			if test.name == "TLS origin" && (!c.CookieSecure || c.PublicOrigin != "https://example.com") {
				t.Fatal("HTTPS must use secure cookies and default the public origin")
			}
		})
	}
}
