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

variable "worker_node_role" {
  type    = string
  default = "standby"
}

variable "convex_service_name" {
  type    = string
  default = "gvfx-convex"
}

variable "convex_port" {
  type    = number
  default = 3210
}

variable "market_gold_pairs" {
  type    = string
  default = "XAUTUSDT,PAXGUSDT,Gold-USDT"
}

variable "market_crypto_pairs" {
  type    = string
  default = "ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT"
}

variable "bingx_market_data_pairs" {
  type    = string
  default = "XAUTUSDT,PAXGUSDT,Gold-USDT,ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT"
}

variable "timescale_market_data_enabled" {
  type    = string
  default = "true"
}

variable "backfill_cron" {
  type    = string
  default = "15 * * * *"
}

variable "backfill_time_zone" {
  type    = string
  default = "UTC"
}

variable "bingx_full_backfill_max_batches" {
  type    = string
  default = "10000"
}

variable "bingx_full_backfill_open_gap_threshold" {
  type    = string
  default = "1"
}

variable "bingx_full_backfill_non_ok_source_threshold" {
  type    = string
  default = "1"
}

variable "bingx_full_backfill_force" {
  type    = string
  default = "false"
}

variable "bingx_full_backfill_alert_enabled" {
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
  default = "gvfx-bingx-full-backfill"
}

variable "ts_advertise_tags" {
  type    = string
  default = "tag:gvfx-app"
}

variable "secrets_var_path" {
  type    = string
  default = "nomad/jobs/gvfx/secrets"
}

job "gvfx-bingx-full-backfill" {
  region      = var.region
  namespace   = var.namespace
  datacenters = var.datacenters
  type        = "batch"

  periodic {
    cron             = var.backfill_cron
    prohibit_overlap = true
    time_zone        = var.backfill_time_zone
  }

  group "bingx-full-backfill" {
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
      attribute = "${meta.role}"
      operator  = "="
      value     = var.worker_node_role
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

    task "egress-guard" {
      lifecycle {
        hook = "prestart"
      }

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

    task "backfill" {
      driver = "docker"

      config {
        image    = var.backend_image
        command  = "bun"
        args     = ["run", "scripts/bingx-full-backfill.ts"]
        work_dir = var.backend_work_dir
      }

      env {
        MARKET_GOLD_PAIRS                      = var.market_gold_pairs
        MARKET_CRYPTO_PAIRS                    = var.market_crypto_pairs
        BINGX_MARKET_DATA_PAIRS                = var.bingx_market_data_pairs
        TIMESCALE_MARKET_DATA_ENABLED          = var.timescale_market_data_enabled
        BINGX_FULL_BACKFILL_ENABLED            = "true"
        BINGX_FULL_BACKFILL_FORCE              = var.bingx_full_backfill_force
        BINGX_FULL_BACKFILL_MAX_BATCHES        = var.bingx_full_backfill_max_batches
        BINGX_FULL_BACKFILL_OPEN_GAP_THRESHOLD = var.bingx_full_backfill_open_gap_threshold
        BINGX_FULL_BACKFILL_NON_OK_SOURCE_THRESHOLD = var.bingx_full_backfill_non_ok_source_threshold
        BINGX_FULL_BACKFILL_ALERT_ENABLED      = var.bingx_full_backfill_alert_enabled
      }

      template {
        destination = "secrets/backfill.env"
        env         = true
        change_mode = "noop"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
BINGX_API_KEY={{ printf "%q" .BINGX_API_KEY }}
BINGX_SECRET_KEY={{ printf "%q" .BINGX_SECRET_KEY }}
{{ $convexHost := "${var.convex_service_name}.service.nomad" -}}
{{ $convexPort := "${var.convex_port}" -}}
{{ with nomadService "${var.convex_service_name}" -}}
{{ with index . 0 -}}
{{ $convexHost = .Address -}}
{{ $convexPort = printf "%d" .Port -}}
{{ end -}}
{{ end -}}
CONVEX_URL={{ printf "%q" (printf "http://%s:%s" $convexHost $convexPort) }}
{{- with .TIMESCALE_URL }}
TIMESCALE_URL={{ printf "%q" . }}
{{- end }}
{{- end }}
EOT
      }

      resources {
        cpu    = 1200
        memory = 1536
      }
    }
  }
}
