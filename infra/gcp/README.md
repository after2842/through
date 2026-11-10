# through on Google Cloud (sandbox)

Minimal hosting for the through **sandbox**: one Cloud Run service that serves the web app, the API, OAuth, and the MCP endpoint, plus one small Cloud SQL PostgreSQL instance. The service runs in the app's explicit development mode (demo sign-in with `0000`). The Go server refuses production mode until real identity, vault, and browser adapters exist, and this configuration does not change that.

| Resource | Purpose | Approximate cost |
|---|---|---|
| Cloud Run `through` | Web app, `/api/v1`, `/oauth/*`, `/mcp`; scales to zero by default | Free tier covers light use |
| Cloud SQL `through-db` | PostgreSQL 17, `db-f1-micro`, 10 GB SSD, daily backups | About $10–12/month |
| Artifact Registry `through` | Container images | Cents/month |
| Secret Manager `through-database-url` | Database connection string | Free tier |
| Service account `through-run` | Cloud SQL client and secret access only | — |

Prices change; check the Google Cloud pricing calculator. Set `min_instances = 1` (about $10–20/month more) if cold starts matter, for example during a directory review.

## Deploy

Prerequisites: a project with billing enabled, [Terraform](https://developer.hashicorp.com/terraform/install) 1.6+, and the gcloud CLI signed in.

```sh
gcloud auth login
gcloud auth application-default login
cd infra/gcp
./deploy.sh YOUR_PROJECT_ID            # region defaults to us-central1
```

The script:

1. Runs `terraform apply` (you confirm the plan). The first run enables APIs and creates everything; Cloud Run starts with Google's placeholder image.
2. Builds the repository's root `Dockerfile` with Cloud Build and pushes it to Artifact Registry.
3. Applies again with the new image and prints the site and MCP URLs.

Run it again to deploy a new version. Each run tags the image with the current commit. It stores the project, region, and image in `deploy.auto.tfvars` (git-ignored) so later `terraform plan` and `terraform apply` runs use them.

Set `SUPPORT_EMAIL=help@example.com ./deploy.sh …` to show a support address on the privacy and terms pages; otherwise they point to the GitHub issue tracker.

## After deploying

- Open the printed URL, sign in with any email and `0000`, and connect a fictional account.
- Add the printed MCP URL (`…/mcp`) as a custom connector in Claude (Settings → Connectors) or in ChatGPT developer mode. You'll be sent to through to sign in and choose which agent the connection signs in as.
- Regenerate the plugin manifests with the real URL: `npm run plugin -- "$(terraform -chdir=infra/gcp output -raw service_url)"`, then commit `plugin/through`.

## Custom domain

Map a domain to the service (`gcloud beta run domain-mappings create --service through --domain app.example.com --region us-central1`, then add the DNS records it shows). When the certificate is active, set `public_origin = "https://app.example.com"` in `deploy.auto.tfvars` or `terraform.tfvars` and apply. The Cloud Run URL keeps working and stays an allowed origin, but the OAuth issuer and MCP URL move to the custom domain, so reconnect any existing connectors.

## OpenAI domain verification

When OpenAI's portal shows a verification token, set `openai_apps_challenge = "…"` in a git-ignored `terraform.tfvars` and apply. The service serves it at `/.well-known/openai-apps-challenge`.

## Security notes

- Terraform state contains the generated database password. Keep state private; for shared use, enable the commented `gcs` backend in `versions.tf`.
- Cloud SQL has a public IP but no authorized networks. Only Cloud SQL connectors with the `cloudsql.client` role, here the Cloud Run service account, can connect, and connections are encrypted.
- The app's per-IP rate limits see Cloud Run's front end rather than the client, so they act as coarse global limits. Put a trusted rate limiter in front before inviting real traffic.
- Migrations run at startup with the application user. Before any production release, follow the gates in `backend/README.md`.

## Tear down

```sh
cd infra/gcp
terraform apply -var deletion_protection=false   # allow the database to be deleted
terraform destroy
```

This deletes the database and its backups. APIs stay enabled.
