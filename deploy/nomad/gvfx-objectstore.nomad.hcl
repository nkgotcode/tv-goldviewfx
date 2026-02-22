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

variable "objectstore_image" {
  type    = string
  default = "minio/minio:RELEASE.2025-01-20T14-49-07Z"
}

variable "mc_image" {
  type    = string
  default = "minio/mc:RELEASE.2025-01-17T23-25-50Z"
}

variable "objectstore_data_dir" {
  type    = string
  default = "/var/lib/nomad/gvfx/objectstore"
}

variable "api_port" {
  type    = number
  default = 9000
}

variable "console_port" {
  type    = number
  default = 9001
}

variable "consul_service_name" {
  type    = string
  default = "gvfx-objectstore"
}

variable "secrets_var_path" {
  type    = string
  default = "nomad/jobs/gvfx/secrets"
}

variable "stateful_required_role" {
  type    = string
  default = "true"
}

variable "objectstore_node_role" {
  type    = string
  default = "standby"
}

job "gvfx-objectstore" {
  region      = var.region
  namespace   = var.namespace
  datacenters = var.datacenters
  type        = "service"

  group "objectstore" {
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
      value     = var.objectstore_node_role
    }

    network {
      mode = "host"

      port "s3" {
        static = var.api_port
        to     = var.api_port
      }

      port "console" {
        static = var.console_port
        to     = var.console_port
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

    task "minio" {
      driver = "docker"

      config {
        image   = var.objectstore_image
        command = "server"
        args    = ["/data", "--address", ":${var.api_port}", "--console-address", ":${var.console_port}"]
        ports   = ["s3", "console"]
        volumes = ["${var.objectstore_data_dir}:/data"]
      }

      template {
        destination = "secrets/minio.env"
        env         = true
        change_mode = "restart"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
MINIO_ROOT_USER={{ printf "%q" .MINIO_ROOT_USER }}
MINIO_ROOT_PASSWORD={{ printf "%q" .MINIO_ROOT_PASSWORD }}
{{- end }}
EOT
      }

      resources {
        cpu    = 300
        memory = 256
      }

      service {
        name = var.consul_service_name
        provider = "nomad"
        port = "s3"

        check {
          type     = "http"
          path     = "/minio/health/live"
          interval = "10s"
          timeout  = "3s"
        }
      }
    }

    task "bootstrap" {
      lifecycle {
        hook = "poststart"
      }

      driver = "docker"

      config {
        image   = var.mc_image
        entrypoint = ["/bin/sh", "-ec"]
        args = ["for i in $(seq 1 30); do mc alias set local \"http://$NOMAD_ADDR_s3\" \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" && break; sleep 2; done && mc mb --ignore-existing local/$CONVEX_EXPORTS_BUCKET && mc mb --ignore-existing local/$CONVEX_FILES_BUCKET && mc mb --ignore-existing local/$CONVEX_MODULES_BUCKET && mc mb --ignore-existing local/$CONVEX_SEARCH_BUCKET && mc mb --ignore-existing local/$CONVEX_SNAPSHOT_IMPORTS_BUCKET"]
      }

      template {
        destination = "secrets/bootstrap.env"
        env         = true
        change_mode = "noop"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
MINIO_ROOT_USER={{ printf "%q" .MINIO_ROOT_USER }}
MINIO_ROOT_PASSWORD={{ printf "%q" .MINIO_ROOT_PASSWORD }}
CONVEX_FILES_BUCKET={{ printf "%q" .CONVEX_FILES_BUCKET }}
CONVEX_EXPORTS_BUCKET={{ printf "%q" .CONVEX_EXPORTS_BUCKET }}
CONVEX_MODULES_BUCKET={{ printf "%q" .CONVEX_MODULES_BUCKET }}
CONVEX_SEARCH_BUCKET={{ printf "%q" .CONVEX_SEARCH_BUCKET }}
CONVEX_SNAPSHOT_IMPORTS_BUCKET={{ printf "%q" .CONVEX_SNAPSHOT_IMPORTS_BUCKET }}
{{- end }}
EOT
      }

      resources {
        cpu    = 100
        memory = 64
      }
    }
  }
}
