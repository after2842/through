variable "project_id" {
  description = "Google Cloud project ID. Billing must be enabled."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Cloud SQL and Artifact Registry."
  type        = string
  default     = "us-central1"
}

variable "name" {
  description = "Name prefix for every resource. Also the Cloud Run service name."
  type        = string
  default     = "through"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.name))
    error_message = "Use 2-21 lowercase letters, digits or hyphens, starting with a letter."
  }
}

variable "image" {
  description = "Container image to run. deploy.sh sets this; the default is Google's placeholder so the first apply can create the service before an image exists."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "public_origin" {
  description = "Optional canonical HTTPS origin once a custom domain is mapped, e.g. https://app.example.com. Empty uses the Cloud Run URL."
  type        = string
  default     = ""
  validation {
    condition     = var.public_origin == "" || can(regex("^https://[a-z0-9.-]+$", var.public_origin))
    error_message = "Use an HTTPS origin with no path or trailing slash."
  }
}

variable "min_instances" {
  description = "Minimum Cloud Run instances. 0 scales to zero when idle (cheapest); 1 avoids cold starts during directory review."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum Cloud Run instances."
  type        = number
  default     = 2
}

variable "db_tier" {
  description = "Cloud SQL machine tier. db-f1-micro is the smallest shared-core tier (no SLA)."
  type        = string
  default     = "db-f1-micro"
}

variable "deletion_protection" {
  description = "Prevent Terraform from deleting the database instance. Set false before terraform destroy."
  type        = bool
  default     = true
}

variable "openai_apps_challenge" {
  description = "Optional token OpenAI shows during plugin domain verification; served at /.well-known/openai-apps-challenge."
  type        = string
  default     = ""
  sensitive   = true
}
