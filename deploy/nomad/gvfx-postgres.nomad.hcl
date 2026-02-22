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

variable "postgres_image" {
  type    = string
  default = "postgres:16.6-alpine"
}

variable "postgres_port" {
  type    = number
  default = 55432
}

variable "postgres_data_dir" {
  type    = string
  default = "/var/lib/nomad/gvfx/postgres"
}

variable "consul_service_name" {
  type    = string
  default = "gvfx-postgres"
}

variable "secrets_var_path" {
  type    = string
  default = "nomad/jobs/gvfx/secrets"
}

variable "stateful_required_role" {
  type    = string
  default = "true"
}

variable "app_postgres_db" {
  type    = string
  default = "tv_goldviewfx"
}

variable "postgres_node_role" {
  type    = string
  default = "standby"
}

job "gvfx-postgres" {
  region      = var.region
  namespace   = var.namespace
  datacenters = var.datacenters
  type        = "service"

  group "postgres" {
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
      value     = var.postgres_node_role
    }

    network {
      mode = "host"
      port "db" {
        static = var.postgres_port
        to     = 5432
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

    task "postgres" {
      driver = "docker"

      config {
        image   = var.postgres_image
        ports   = ["db"]
        volumes = ["${var.postgres_data_dir}:/var/lib/postgresql/data"]
      }

      env {
        PGDATA = "/var/lib/postgresql/data/pgdata"
      }

      template {
        destination = "secrets/postgres.env"
        env         = true
        change_mode = "restart"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
POSTGRES_DB={{ printf "%q" .POSTGRES_DB }}
POSTGRES_USER={{ printf "%q" .POSTGRES_USER }}
POSTGRES_PASSWORD={{ printf "%q" .POSTGRES_PASSWORD }}
{{- end }}
EOT
      }

      resources {
        cpu    = 500
        memory = 512
      }

      service {
        name = var.consul_service_name
        provider = "nomad"
        port = "db"

        check {
          type     = "tcp"
          interval = "10s"
          timeout  = "2s"
        }
      }
    }

    task "bootstrap-app-db" {
      lifecycle {
        hook = "poststart"
      }

      driver = "docker"

      config {
        image      = var.postgres_image
        entrypoint = ["/bin/sh", "-ec"]
        args = [<<-EOS
for i in $(seq 1 60); do
  if psql "postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$NOMAD_ADDR_db/postgres" -tAc "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! psql "postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$NOMAD_ADDR_db/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='${var.app_postgres_db}'" | grep -q 1; then
  psql "postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$NOMAD_ADDR_db/postgres" -c "CREATE DATABASE ${var.app_postgres_db} OWNER \\\"$POSTGRES_USER\\\";"
fi
EOS
        ]
      }

      template {
        destination = "secrets/postgres-bootstrap.env"
        env         = true
        change_mode = "noop"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
POSTGRES_USER={{ printf "%q" .POSTGRES_USER }}
POSTGRES_PASSWORD={{ printf "%q" .POSTGRES_PASSWORD }}
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
