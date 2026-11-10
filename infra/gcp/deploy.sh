#!/usr/bin/env bash
# Provision (or update) the through sandbox on Google Cloud and roll out a new image.
#
#   ./deploy.sh <project-id> [region]
#
# Requires: terraform >= 1.6, gcloud signed in (gcloud auth login and
# gcloud auth application-default login), and billing enabled on the project.
# Optional: SUPPORT_EMAIL=help@example.com to show a support address on the site.
set -euo pipefail
cd "$(dirname "$0")"

project="${1:?Usage: ./deploy.sh <project-id> [region]}"
region="${2:-us-central1}"
vars="deploy.auto.tfvars"

write_vars() {
  {
    echo "project_id = \"$project\""
    echo "region     = \"$region\""
    [ -n "${1:-}" ] && echo "image      = \"$1\""
  } > "$vars"
}

# Keep the image from the previous deploy, if any, while infrastructure updates.
current_image=""
if [ -f "$vars" ]; then
  current_image="$(sed -n 's/^image *= *"\(.*\)"$/\1/p' "$vars")"
fi
write_vars "$current_image"

terraform init -input=false
echo "==> Creating or updating infrastructure"
terraform apply -input=false

repository="$(terraform output -raw image_repository)"
tag="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
image="$repository/through:$tag"

echo "==> Building $image with Cloud Build"
gcloud builds submit ../.. --project "$project" --config cloudbuild.yaml \
  --substitutions "_IMAGE=$image,_SUPPORT_EMAIL=${SUPPORT_EMAIL:-}"

echo "==> Rolling Cloud Run to the new image"
write_vars "$image"
terraform apply -input=false -auto-approve

origin="$(terraform output -raw service_url)"
echo
echo "through sandbox: $origin"
echo "MCP endpoint:    $origin/mcp"
echo "Health:          $(curl -fsS "$origin/readyz" 2>/dev/null || echo 'not ready yet; check Cloud Run logs')"
