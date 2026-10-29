# Build from backend/. This API image does not contain the Next.js export.
FROM golang:1.27.3-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /through ./cmd/through

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /through /through
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/through"]
