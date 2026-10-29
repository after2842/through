.PHONY: run build test integration check
run:
	go run ./cmd/through
build:
	CGO_ENABLED=0 go build -trimpath -o through ./cmd/through
test:
	go test -race ./...
integration:
	@test -n "$(THROUGH_TEST_DATABASE_URL)" || (echo "Set THROUGH_TEST_DATABASE_URL to an isolated test database" && exit 1)
	go test -race -count=1 ./...
check:
	@test -z "$$(gofmt -l cmd internal)" || (echo "Run gofmt" && exit 1)
	go vet ./...
	go test -race ./...
