terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # State holds the generated database password. For shared use, keep state in
  # a private GCS bucket instead of on one laptop:
  # backend "gcs" {
  #   bucket = "YOUR-STATE-BUCKET"
  #   prefix = "through/sandbox"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
