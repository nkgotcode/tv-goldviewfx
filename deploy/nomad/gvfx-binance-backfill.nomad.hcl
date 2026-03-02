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
  default = "ghcr.io/nkgotcode/tv-goldviewfx-backend:nomad-202602270745-fc59982-timescalehardening5"
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

variable "binance_market_data_pairs" {
  type    = string
  default = "ALGOUSDT,BNBUSDT,BTCUSDT,ETHUSDT,PAXGUSDT,SOLUSDT,XRPUSDT"
}

variable "binance_ingest_intervals" {
  type    = string
  default = "1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M"
}

variable "timescale_market_data_enabled" {
  type    = string
  default = "true"
}

variable "binance_backfill_max_batches" {
  type    = string
  default = "50000"
}

variable "backfill_cron" {
  type    = string
  default = "*/5 * * * *"
}

variable "backfill_time_zone" {
  type    = string
  default = "UTC"
}

variable "ts_exit_node_primary" {
  type    = string
  default = "100.110.26.124"
}

variable "ts_exit_node_fallbacks" {
  type    = string
  default = ""
}

variable "ts_egress_expected_ips" {
  type    = string
  default = "98.215.103.11,216.238.95.214,14.169.120.106"
}

variable "ts_hostname" {
  type    = string
  default = "gvfx-binance-backfill"
}

variable "ts_advertise_tags" {
  type    = string
  default = "tag:gvfx-app"
}

variable "secrets_var_path" {
  type    = string
  default = "nomad/jobs/gvfx/secrets"
}

job "gvfx-binance-backfill" {
  region      = var.region
  namespace   = var.namespace
  datacenters = var.datacenters
  type        = "batch"

  periodic {
    crons            = [var.backfill_cron]
    prohibit_overlap = true
    time_zone        = var.backfill_time_zone
  }

  group "binance-backfill" {
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
        args     = ["run", "scripts/binance-full-backfill.ts"]
        work_dir = var.backend_work_dir
      }

      env {
        BINANCE_MARKET_DATA_ENABLED       = "true"
        BINANCE_BACKFILL_ENABLED          = "true"
        BINANCE_MARKET_DATA_PAIRS         = var.binance_market_data_pairs
        BINANCE_INGEST_INTERVALS          = var.binance_ingest_intervals
        BINANCE_BACKFILL_MAX_BATCHES      = var.binance_backfill_max_batches
        TIMESCALE_MARKET_DATA_ENABLED     = var.timescale_market_data_enabled
        TIMESCALE_POOL_MAX                = "2"
        DISABLE_TEST_DATA_IN_DB           = "true"
        E2E_RUN                           = "0"
        BINGX_MARKET_DATA_MOCK            = "false"
        TRADINGVIEW_USE_HTML              = "false"
        TRADINGVIEW_HTML_PATH             = ""
        TELEGRAM_MESSAGES_PATH            = ""
      }

      template {
        destination = "secrets/backfill.env"
        env         = true
        change_mode = "noop"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
BINANCE_API_KEY={{ printf "%q" .BINANCE_API_KEY }}
BINANCE_SECRET_KEY={{ printf "%q" .BINANCE_SECRET_KEY }}
{{- with .TIMESCALE_URL }}
TIMESCALE_URL={{ printf "%q" . }}
{{- end }}
{{- end }}
EOT
      }

      resources {
        cpu    = 1200
        memory = 2048
      }
    }
  }
}
