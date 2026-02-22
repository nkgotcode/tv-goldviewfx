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

variable "count" {
  type    = number
  default = 1
}

variable "rl_service_port" {
  type    = number
  default = 9101
}

variable "rl_service_image" {
  type    = string
  default = "ghcr.io/your-org/tv-goldviewfx-rl-service:replace-with-git-sha"
}

variable "rl_service_work_dir" {
  type    = string
  default = "/app/backend/rl-service"
}

variable "consul_service_name" {
  type    = string
  default = "gvfx-rl-service"
}

variable "convex_url" {
  type    = string
  default = "http://gvfx-convex.service.nomad:3210"
}

variable "convex_service_name" {
  type    = string
  default = "gvfx-convex"
}

variable "convex_port" {
  type    = number
  default = 3210
}

variable "secrets_var_path" {
  type    = string
  default = "nomad/jobs/gvfx/secrets"
}

variable "rl_required_flag" {
  type    = string
  default = "true"
}

variable "rl_primary_marker_value" {
  type    = string
  default = "primary"
}

job "gvfx-rl-service" {
  region      = var.region
  namespace   = var.namespace
  datacenters = var.datacenters
  type        = "service"

  group "rl-service" {
    count = var.count

    constraint {
      attribute = "${meta.role}"
      operator  = "!="
      value     = "witness"
    }

    constraint {
      attribute = "${meta.gpu}"
      operator  = "="
      value     = var.rl_required_flag
    }

    constraint {
      attribute = "${attr.cpu.arch}"
      operator  = "="
      value     = "amd64"
    }

    affinity {
      attribute = "${meta.rl_tier}"
      operator  = "="
      value     = var.rl_primary_marker_value
      weight    = 100
    }

    network {
      mode = "host"
      port "http" {
        static = var.rl_service_port
        to     = var.rl_service_port
      }
    }

    update {
      max_parallel      = 1
      min_healthy_time  = "15s"
      healthy_deadline  = "5m"
      progress_deadline = "10m"
      canary            = 0
      auto_revert       = true
      auto_promote      = false
    }

    restart {
      attempts = 5
      interval = "30m"
      delay    = "15s"
      mode     = "delay"
    }

    reschedule {
      attempts       = 0
      unlimited      = true
      delay          = "30s"
      delay_function = "exponential"
      max_delay      = "10m"
    }

    task "rl-service" {
      driver = "docker"

      config {
        image    = var.rl_service_image
        command  = "sh"
        args = [
          "-ec",
          "if [ -n \"$CONVEX_SERVICE_ADDRESS\" ]; then tmp_hosts=\"/tmp/hosts.$$\"; awk '!/^[0-9a-fA-F:.]+[[:space:]]+gvfx-convex\\.service\\.nomad([[:space:]]|$)/' /etc/hosts > \"$tmp_hosts\" 2>/dev/null || cp /etc/hosts \"$tmp_hosts\"; echo \"$CONVEX_SERVICE_ADDRESS gvfx-convex.service.nomad\" >> \"$tmp_hosts\"; cat \"$tmp_hosts\" > /etc/hosts; rm -f \"$tmp_hosts\"; fi; exec /app/backend/rl-service/.venv/bin/uvicorn server:app --host 0.0.0.0 --port ${var.rl_service_port}",
        ]
        work_dir = var.rl_service_work_dir
        ports    = ["http"]
      }

      env {
        RL_SERVICE_PORT = "${var.rl_service_port}"
      }

      template {
        destination = "secrets/rl.env"
        env         = true
        change_mode = "restart"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
OPENAI_API_KEY={{ printf "%q" .OPENAI_API_KEY }}
OPENAI_BASE_URL={{ printf "%q" .OPENAI_BASE_URL }}
OPENAI_MODEL={{ printf "%q" .OPENAI_MODEL }}
OPENROUTER_REFERER={{ printf "%q" .OPENROUTER_REFERER }}
OPENROUTER_TITLE={{ printf "%q" .OPENROUTER_TITLE }}
{{ $convexHost := "${var.convex_service_name}.service.nomad" -}}
{{ $convexPort := "${var.convex_port}" -}}
{{ with nomadService "${var.convex_service_name}" -}}
{{ with index . 0 -}}
{{ $convexHost = .Address -}}
{{ $convexPort = printf "%d" .Port -}}
{{ end -}}
{{ end -}}
CONVEX_URL={{ printf "%q" (printf "http://%s:%s" $convexHost $convexPort) }}
{{- end }}
EOT
      }

      template {
        destination = "secrets/convex_host.env"
        env         = true
        change_mode = "restart"
        data        = <<-EOT
{{ $convexHost := "" -}}
{{ with nomadService "${var.convex_service_name}" -}}
{{ with index . 0 -}}
{{ $convexHost = .Address -}}
{{ end -}}
{{ end -}}
CONVEX_SERVICE_ADDRESS={{ printf "%q" $convexHost }}
EOT
      }

      resources {
        cpu    = 1200
        memory = 2048
      }

      service {
        name = var.consul_service_name
        provider = "nomad"
        address_mode = "host"
        port = "http"

        check {
          type     = "http"
          path     = "/health"
          interval = "10s"
          timeout  = "2s"
        }
      }
    }
  }
}
