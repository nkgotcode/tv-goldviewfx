variable "region" {
  type    = string
  default = "global"
}

variable "namespace" {
  type    = string
  default = "default"
}

variable "datacenters" {
  type    = list(string)
  default = ["dc1"]
}

variable "convex_image" {
  type    = string
  default = "ghcr.io/get-convex/convex-backend:replace-with-git-sha"
}

variable "convex_port" {
  type    = number
  default = 3210
}

variable "convex_site_proxy_port" {
  type    = number
  default = 3211
}

variable "convex_data_dir" {
  type    = string
  default = "/var/lib/nomad/gvfx/convex"
}

variable "consul_service_name" {
  type    = string
  default = "gvfx-convex"
}

variable "consul_site_service_name" {
  type    = string
  default = "gvfx-convex-site"
}

variable "postgres_service_name" {
  type    = string
  default = "gvfx-postgres"
}

variable "objectstore_service_name" {
  type    = string
  default = "gvfx-objectstore"
}

variable "instance_name" {
  type    = string
  default = "tv-goldviewfx"
}

variable "postgres_host" {
  type    = string
  default = "gvfx-postgres.service.nomad"
}

variable "postgres_port" {
  type    = number
  default = 55432
}

variable "objectstore_host" {
  type    = string
  default = "gvfx-objectstore.service.nomad"
}

variable "objectstore_port" {
  type    = number
  default = 9000
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "secrets_var_path" {
  type    = string
  default = "nomad/jobs/gvfx/secrets"
}

variable "stateful_required_role" {
  type    = string
  default = "true"
}

variable "convex_node_role" {
  type    = string
  default = "standby"
}

job "gvfx-convex" {
  region      = var.region
  namespace   = var.namespace
  datacenters = var.datacenters
  type        = "service"

  group "convex" {
    count = 1

    constraint {
      attribute = "${meta.role}"
      operator  = "!="
      value     = "witness"
    }

    constraint {
      attribute = "${meta.stateful}"
      operator  = "="
      value     = var.stateful_required_role
    }

    constraint {
      attribute = "${meta.role}"
      operator  = "="
      value     = var.convex_node_role
    }

    network {
      mode = "host"

      port "http" {
        static = var.convex_port
        to     = var.convex_port
      }

      port "site" {
        static = var.convex_site_proxy_port
        to     = var.convex_site_proxy_port
      }
    }

    restart {
      attempts = 5
      interval = "30m"
      delay    = "20s"
      mode     = "delay"
    }

    reschedule {
      attempts       = 0
      unlimited      = true
      delay          = "30s"
      delay_function = "exponential"
      max_delay      = "10m"
    }

    task "convex" {
      driver = "docker"

      config {
        image = var.convex_image
        ports = ["http", "site"]
        volumes = ["${var.convex_data_dir}:/convex/data"]
      }

      env {
        INSTANCE_NAME        = var.instance_name
        DO_NOT_REQUIRE_SSL   = "true"
        RUST_LOG             = "info"
        AWS_REGION           = var.aws_region
        AWS_S3_DISABLE_SSE   = "true"
      }

      template {
        destination = "secrets/convex.env"
        env         = true
        change_mode = "restart"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
INSTANCE_SECRET={{ printf "%q" .CONVEX_INSTANCE_SECRET }}
POSTGRES_USER={{ printf "%q" .POSTGRES_USER }}
POSTGRES_PASSWORD={{ printf "%q" .POSTGRES_PASSWORD }}
POSTGRES_DB={{ printf "%q" .POSTGRES_DB }}
CONVEX_CLOUD_ORIGIN={{ printf "%q" (printf "http://%s:%s" (env "NOMAD_IP_http") (env "NOMAD_PORT_http")) }}
CONVEX_SITE_ORIGIN={{ printf "%q" (printf "http://%s:%s" (env "NOMAD_IP_site") (env "NOMAD_PORT_site")) }}
{{ $pgHost := "${var.postgres_host}" -}}
{{ $pgPort := "${var.postgres_port}" -}}
{{ with nomadService "${var.postgres_service_name}" -}}
{{ with index . 0 -}}
{{ $pgHost = .Address -}}
{{ $pgPort = printf "%d" .Port -}}
{{ end -}}
{{ end -}}
POSTGRES_URL={{ printf "%q" (printf "postgres://%s:%s@%s:%s" .POSTGRES_USER .POSTGRES_PASSWORD $pgHost $pgPort) }}
{{ $s3Host := "${var.objectstore_host}" -}}
{{ $s3Port := "${var.objectstore_port}" -}}
{{ with nomadService "${var.objectstore_service_name}" -}}
{{ with index . 0 -}}
{{ $s3Host = .Address -}}
{{ $s3Port = printf "%d" .Port -}}
{{ end -}}
{{ end -}}
S3_ENDPOINT_URL={{ printf "%q" (printf "http://%s:%s" $s3Host $s3Port) }}
AWS_ACCESS_KEY_ID={{ printf "%q" .MINIO_ROOT_USER }}
AWS_SECRET_ACCESS_KEY={{ printf "%q" .MINIO_ROOT_PASSWORD }}
S3_STORAGE_EXPORTS_BUCKET={{ printf "%q" .CONVEX_EXPORTS_BUCKET }}
S3_STORAGE_FILES_BUCKET={{ printf "%q" .CONVEX_FILES_BUCKET }}
S3_STORAGE_MODULES_BUCKET={{ printf "%q" .CONVEX_MODULES_BUCKET }}
S3_STORAGE_SEARCH_BUCKET={{ printf "%q" .CONVEX_SEARCH_BUCKET }}
S3_STORAGE_SNAPSHOT_IMPORTS_BUCKET={{ printf "%q" .CONVEX_SNAPSHOT_IMPORTS_BUCKET }}
{{- end }}
EOT
      }

      resources {
        cpu    = 600
        memory = 768
      }

      service {
        name = var.consul_service_name
        provider = "nomad"
        address_mode = "host"
        port = "http"

        check {
          type     = "http"
          path     = "/version"
          interval = "10s"
          timeout  = "3s"
        }
      }

      service {
        name = var.consul_site_service_name
        provider = "nomad"
        address_mode = "host"
        port = "site"

        check {
          type     = "tcp"
          interval = "10s"
          timeout  = "3s"
        }
      }
    }
  }
}
