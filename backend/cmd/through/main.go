package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"through/backend/internal/config"
	"through/backend/internal/httpapi"
	"through/backend/internal/postgres"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if e := run(log); e != nil {
		log.Error("service stopped", "reason", e.Error())
		os.Exit(1)
	}
}
func run(log *slog.Logger) error {
	cfg, e := config.Load()
	if e != nil {
		return e
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	dbcfg, e := pgxpool.ParseConfig(cfg.DatabaseURL)
	if e != nil {
		return errors.New("invalid database configuration")
	}
	dbcfg.MaxConns = 20
	dbcfg.MinConns = 2
	dbcfg.MaxConnLifetime = 30 * time.Minute
	dbcfg.ConnConfig.ConnectTimeout = 5 * time.Second
	dbcfg.ConnConfig.RuntimeParams["statement_timeout"] = "10000"
	dbcfg.ConnConfig.RuntimeParams["idle_in_transaction_session_timeout"] = "15000"
	pool, e := pgxpool.NewWithConfig(ctx, dbcfg)
	if e != nil {
		return errors.New("database initialization failed")
	}
	defer pool.Close()
	startupCtx, startupCancel := context.WithTimeout(ctx, 30*time.Second)
	defer startupCancel()
	if e = pool.Ping(startupCtx); e != nil {
		return errors.New("database connection failed")
	}
	if e = postgres.Migrate(startupCtx, pool); e != nil {
		return errors.New("database migration failed")
	}
	store := postgres.New(pool, cfg.SessionTTL)
	api, e := httpapi.New(store, cfg, log)
	if e != nil {
		return errors.New("static export directory cannot be opened")
	}
	defer api.Close()
	server := &http.Server{Addr: cfg.Addr, Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	failures := make(chan error, 1)
	go func() {
		log.Info("service listening", "address", cfg.Addr, "mode", "demo", "external_integrations", "placeholder")
		failures <- server.ListenAndServe()
	}()
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case e = <-failures:
			if !errors.Is(e, http.ErrServerClosed) {
				return errors.New("HTTP listener failed")
			}
			return nil
		case <-ticker.C:
			cleanupCtx, done := context.WithTimeout(ctx, 10*time.Second)
			if e = store.Cleanup(cleanupCtx); e != nil {
				log.Error("ephemeral state cleanup failed")
			}
			done()
		case <-ctx.Done():
			shutdownCtx, done := context.WithTimeout(context.Background(), 10*time.Second)
			defer done()
			log.Info("service shutting down")
			return server.Shutdown(shutdownCtx)
		}
	}
}
