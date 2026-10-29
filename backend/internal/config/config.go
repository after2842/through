package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"
)

type Config struct {
	Env, Addr, DatabaseURL, StaticDir, MetricsToken string
	AllowedOrigins                                  map[string]bool
	CookieSecure                                    bool
	SessionTTL                                      time.Duration
}

func Load() (Config, error) { return Parse(os.Getenv) }
func Parse(get func(string) string) (Config, error) {
	c := Config{Env: get("THROUGH_ENV"), Addr: get("THROUGH_ADDR"), DatabaseURL: get("THROUGH_DATABASE_URL"), StaticDir: get("THROUGH_STATIC_DIR"), MetricsToken: get("THROUGH_METRICS_TOKEN"), AllowedOrigins: map[string]bool{}, SessionTTL: 8 * time.Hour}
	if c.Env == "" {
		c.Env = "production"
	}
	if c.Addr == "" {
		c.Addr = "127.0.0.1:8080"
	}
	// Intentionally fail closed: there is no production identity/vault/browser integration.
	if c.Env != "development" && c.Env != "test" {
		return c, fmt.Errorf("production identity and browser adapters are not configured; this build only permits explicit development or test mode")
	}
	if get("THROUGH_DEMO_AUTH") != "true" {
		return c, fmt.Errorf("THROUGH_DEMO_AUTH=true is required for the placeholder identity provider")
	}
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("THROUGH_DATABASE_URL is required")
	}
	parsed, err := url.Parse(c.DatabaseURL)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") || parsed.Host == "" {
		return c, fmt.Errorf("THROUGH_DATABASE_URL must be a PostgreSQL connection URL")
	}
	origins := get("THROUGH_ALLOWED_ORIGINS")
	if origins == "" {
		return c, fmt.Errorf("THROUGH_ALLOWED_ORIGINS must explicitly allow the frontend origin")
	}
	allTLS := true
	seenHTTPS := false
	for _, origin := range strings.Split(origins, ",") {
		origin = strings.TrimSpace(origin)
		u, e := url.Parse(origin)
		if e != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "http" && u.Scheme != "https") {
			return c, fmt.Errorf("allowed origins must be exact HTTP(S) origins without a path")
		}
		if u.Scheme == "http" {
			if u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "[::1]" && u.Hostname() != "::1" {
				return c, fmt.Errorf("plaintext HTTP origins must be loopback addresses")
			}
			allTLS = false
		} else {
			seenHTTPS = true
		}
		c.AllowedOrigins[origin] = true
	}
	if seenHTTPS && !allTLS {
		return c, fmt.Errorf("do not mix HTTP and HTTPS origins; HTTPS requires secure cookies")
	}
	c.CookieSecure = allTLS
	if c.MetricsToken != "" && len(c.MetricsToken) < 32 {
		return c, fmt.Errorf("THROUGH_METRICS_TOKEN must contain at least 32 characters")
	}
	return c, nil
}
