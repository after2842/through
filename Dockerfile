# One deployable image: the Next.js export (service mode) served by the Go API.
# backend/Dockerfile builds the API alone for local Compose use.
FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.ts tsconfig.json next-env.d.ts ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
ARG NEXT_PUBLIC_SUPPORT_EMAIL=""
ENV NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL NEXT_TELEMETRY_DISABLED=1
RUN npm run build:service

FROM golang:1.27.3-alpine AS api
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /through ./cmd/through

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=api /through /through
COPY --from=web /web/out /site
ENV THROUGH_ADDR=0.0.0.0:8080 THROUGH_STATIC_DIR=/site
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/through"]
