.PHONY: check check-frontend check-backend build-demo build-service sandbox-up sandbox-down

check: check-frontend check-backend

check-frontend:
	npm run typecheck
	npm run build:demo

check-backend:
	@test -n "$$THROUGH_TEST_DATABASE_URL" || (echo "Set THROUGH_TEST_DATABASE_URL to a dedicated test database." && exit 1)
	cd backend && go vet ./...
	cd backend && go test -race -count=1 ./...

build-demo:
	npm run build:demo

build-service:
	npm run build:service

sandbox-up: build-service
	docker compose -f backend/compose.yaml up --build

sandbox-down:
	docker compose -f backend/compose.yaml down
