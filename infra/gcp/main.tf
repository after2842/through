# Minimal hosting for the through sandbox: one Cloud Run service (web app, API,
# OAuth and MCP endpoint) and one small Cloud SQL PostgreSQL instance.
#
# The service runs in the application's explicit development/demo mode. The Go
# server refuses production mode until real identity, vault and browser
# adapters exist; this configuration does not change that.

data "google_project" "this" {
  project_id = var.project_id
}

locals {
  services = ["run.googleapis.com", "sqladmin.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "cloudbuild.googleapis.com"]
  # Cloud Run's deterministic URL, known before the service exists.
  run_origin      = "https://${var.name}-${data.google_project.this.number}.${var.region}.run.app"
  origin          = var.public_origin != "" ? var.public_origin : local.run_origin
  allowed_origins = join(",", distinct([local.origin, local.run_origin]))
}

resource "google_project_service" "enabled" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  repository_id = var.name
  location      = var.region
  format        = "DOCKER"
  description   = "through container images"
  depends_on    = [google_project_service.enabled]
}

# ---- Database ---------------------------------------------------------------------

resource "google_sql_database_instance" "db" {
  name                = "${var.name}-db"
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = var.deletion_protection

  settings {
    edition           = "ENTERPRISE" # shared-core tiers require ENTERPRISE
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 10
    disk_autoresize   = true

    ip_configuration {
      # Public IP with no authorized networks: only the Cloud SQL connector
      # (IAM-authorized, encrypted) used by Cloud Run can connect.
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled = true
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_sql_database" "app" {
  name     = "through"
  instance = google_sql_database_instance.db.name
}

resource "random_password" "db" {
  length  = 40
  special = false
}

resource "google_sql_user" "app" {
  name     = "through"
  instance = google_sql_database_instance.db.name
  password = random_password.db.result
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${var.name}-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  # Unix socket provided by Cloud Run's Cloud SQL connector; the connector
  # encrypts the connection, so the socket itself does not use TLS.
  secret_data = "postgres://${google_sql_user.app.name}:${random_password.db.result}@localhost/${google_sql_database.app.name}?host=/cloudsql/${google_sql_database_instance.db.connection_name}&sslmode=disable"
}

# ---- Service identity ---------------------------------------------------------------

resource "google_service_account" "run" {
  account_id   = "${var.name}-run"
  display_name = "through Cloud Run service"
}

resource "google_project_iam_member" "run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_secret_manager_secret_iam_member" "run_reads_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

# ---- Cloud Run --------------------------------------------------------------------

resource "google_cloud_run_v2_service" "app" {
  name                 = var.name
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
  deletion_protection  = false
  invoker_iam_disabled = true # public web app; the app enforces its own auth

  template {
    service_account = google_service_account.run.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.db.connection_name]
      }
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true # billed only while handling requests
        startup_cpu_boost = true
      }

      env {
        name  = "THROUGH_ENV"
        value = "development"
      }
      env {
        name  = "THROUGH_DEMO_AUTH"
        value = "true"
      }
      env {
        name  = "THROUGH_ADDR"
        value = "0.0.0.0:8080"
      }
      env {
        name  = "THROUGH_STATIC_DIR"
        value = "/site"
      }
      env {
        name  = "THROUGH_ALLOWED_ORIGINS"
        value = local.allowed_origins
      }
      env {
        name  = "THROUGH_PUBLIC_ORIGIN"
        value = local.origin
      }
      env {
        name  = "THROUGH_OPENAI_APPS_CHALLENGE"
        value = var.openai_apps_challenge
      }
      env {
        name = "THROUGH_DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  depends_on = [
    google_project_service.enabled,
    google_project_iam_member.run_sql_client,
    google_secret_manager_secret_iam_member.run_reads_database_url,
    google_secret_manager_secret_version.database_url,
  ]
}
