output "service_url" {
  description = "Public origin of the web app, OAuth issuer and MCP resource."
  value       = local.origin
}

output "mcp_url" {
  description = "Add this URL as a custom connector in Claude or ChatGPT."
  value       = "${local.origin}/mcp"
}

output "run_url" {
  description = "URL Cloud Run reports for the service."
  value       = google_cloud_run_v2_service.app.uri
}

output "image_repository" {
  description = "Artifact Registry path for through images."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "database_instance" {
  description = "Cloud SQL connection name."
  value       = google_sql_database_instance.db.connection_name
}
