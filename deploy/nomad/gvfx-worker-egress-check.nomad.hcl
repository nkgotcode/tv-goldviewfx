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

variable "backend_image" {
  type    = string
  default = "ghcr.io/your-org/tv-goldviewfx-backend:replace-with-git-sha"
}

variable "backend_work_dir" {
  type    = string
  default = "/app/backend"
}

variable "tailscale_image" {
  type    = string
  default = "tailscale/tailscale:v1.80.3"
}

variable "egress_worker_required_flag" {
  type    = string
  default = "true"
}

variable "ts_exit_node_primary" {
  type    = string
  default = ""
}

variable "ts_exit_node_fallbacks" {
  type    = string
  default = ""
}

variable "ts_egress_expected_ips" {
  type    = string
  default = ""
}

variable "ts_hostname" {
  type    = string
  default = "gvfx-worker-egress-check"
}

variable "ts_advertise_tags" {
  type    = string
  default = "tag:gvfx-app"
}

variable "secrets_var_path" {
  type    = string
  default = "nomad/jobs/gvfx/secrets"
}

job "gvfx-worker-egress-check" {
  region      = var.region
  namespace   = var.namespace
  datacenters = var.datacenters
  type        = "batch"

  group "egress-check" {
    count = 1

    constraint {
      attribute = "${meta.role}"
      operator  = "!="
      value     = "witness"
    }

    constraint {
      attribute = "${meta.egress_worker}"
      operator  = "="
      value     = var.egress_worker_required_flag
    }

    constraint {
      attribute = "${attr.kernel.name}"
      operator  = "="
      value     = "linux"
    }

    network {
      mode = "host"
    }

    restart {
      attempts = 0
      mode     = "fail"
    }

    task "tailscale" {
      lifecycle {
        hook    = "prestart"
        sidecar = true
      }

      driver = "docker"

      config {
        image   = var.tailscale_image
        command = "sh"
        args = [
          "-ec",
          "mkdir -p /alloc/tailscale && exec tailscaled --state=/alloc/tailscale/tailscaled.state --socket=/alloc/tailscale/tailscaled.sock",
        ]

        cap_add = [
          "NET_ADMIN",
          "NET_RAW",
        ]

        devices = [
          {
            host_path          = "/dev/net/tun"
            container_path     = "/dev/net/tun"
            cgroup_permissions = "rwm"
          }
        ]
      }

      resources {
        cpu    = 100
        memory = 128
      }
    }

    task "check" {
      driver = "docker"

      config {
        image    = var.backend_image
        command  = "sh"
        args     = ["-ec", "exec /app/scripts/tailscale/worker-egress-guard.sh"]
        work_dir = var.backend_work_dir
      }

      env {
        TS_SOCKET              = "/alloc/tailscale/tailscaled.sock"
        TS_EXIT_NODE_PRIMARY   = var.ts_exit_node_primary
        TS_EXIT_NODE_FALLBACKS = var.ts_exit_node_fallbacks
        TS_EGRESS_EXPECTED_IPS = var.ts_egress_expected_ips
        TS_HOSTNAME            = var.ts_hostname
        TS_ADVERTISE_TAGS      = var.ts_advertise_tags
        TS_GUARD_STATE_FILE    = "/alloc/tailscale/egress-selected"
        TS_ACCEPT_ROUTES       = "true"
        TS_ACCEPT_DNS          = "false"
      }

      template {
        destination = "secrets/tailscale.env"
        env         = true
        change_mode = "noop"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
TS_AUTHKEY={{ printf "%q" .TS_AUTHKEY }}
{{- end }}
EOT
      }

      resources {
        cpu    = 200
        memory = 256
      }
    }
  }
}
