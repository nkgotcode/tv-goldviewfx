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

variable "rl_service_name" {
  type    = string
  default = "gvfx-rl-service"
}

variable "rl_service_port" {
  type    = number
  default = 9101
}

variable "market_gold_pairs" {
  type    = string
  default = "XAUTUSDT,PAXGUSDT"
}

variable "market_crypto_pairs" {
  type    = string
  default = "ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT"
}

variable "bingx_market_data_pairs" {
  type    = string
  default = "XAUTUSDT,PAXGUSDT,ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT"
}

variable "timescale_market_data_enabled" {
  type    = string
  default = "true"
}

variable "rl_online_learning_enabled" {
  type    = string
  default = "true"
}

variable "rl_service_timeout_ms" {
  type    = number
  default = 300000
}

variable "rl_online_learning_decision_threshold" {
  type    = number
  default = 0.35
}

variable "rl_online_learning_interval_min" {
  type    = number
  default = 60
}

variable "rl_online_learning_interval" {
  type    = string
  default = "5m"
}

variable "rl_online_learning_context_intervals" {
  type    = string
  default = "15m,1h,4h"
}

variable "rl_online_learning_pairs" {
  type    = string
  default = "XAUTUSDT,PAXGUSDT,BTC-USDT,ETH-USDT,SOL-USDT,ALGO-USDT,XRP-USDT,BNB-USDT"
}

variable "rl_online_learning_min_win_rate" {
  type    = number
  default = 0.62
}

variable "rl_online_learning_min_net_pnl" {
  type    = number
  default = 0
}

variable "rl_online_learning_max_drawdown" {
  type    = number
  default = 0.12
}

variable "rl_online_learning_min_trade_count" {
  type    = number
  default = 25
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
  default = "gvfx-worker"
}

variable "ts_advertise_tags" {
  type    = string
  default = "tag:gvfx-app"
}

variable "secrets_var_path" {
  type    = string
  default = "nomad/jobs/gvfx/secrets"
}

job "gvfx-worker" {
  region      = var.region
  namespace   = var.namespace
  datacenters = var.datacenters
  type        = "service"

  group "worker" {
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

    update {
      max_parallel      = 1
      min_healthy_time  = "20s"
      healthy_deadline  = "5m"
      progress_deadline = "15m"
      auto_revert       = true
    }

    restart {
      attempts = 10
      interval = "1h"
      delay    = "20s"
      mode     = "delay"
    }

    reschedule {
      attempts       = 0
      unlimited      = true
      delay          = "30s"
      delay_function = "exponential"
      max_delay      = "15m"
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
        cpu    = 200
        memory = 256
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
        TS_SOCKET             = "/alloc/tailscale/tailscaled.sock"
        TS_EXIT_NODE_PRIMARY  = var.ts_exit_node_primary
        TS_EXIT_NODE_FALLBACKS = var.ts_exit_node_fallbacks
        TS_EGRESS_EXPECTED_IPS = var.ts_egress_expected_ips
        TS_HOSTNAME           = var.ts_hostname
        TS_ADVERTISE_TAGS     = var.ts_advertise_tags
        TS_GUARD_STATE_FILE   = "/alloc/tailscale/egress-selected"
        TS_ACCEPT_ROUTES      = "true"
        TS_ACCEPT_DNS         = "false"
      }

      template {
        destination = "secrets/tailscale.env"
        env         = true
        change_mode = "restart"
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

    task "worker" {
      driver = "docker"

      config {
        image    = var.backend_image
        command  = "bun"
        args     = ["run", "src/jobs/worker.ts"]
        work_dir = var.backend_work_dir
      }

      env {
        NODE_ENV                = "production"
        MARKET_GOLD_PAIRS       = var.market_gold_pairs
        MARKET_CRYPTO_PAIRS     = var.market_crypto_pairs
        BINGX_MARKET_DATA_PAIRS = var.bingx_market_data_pairs
        BINGX_WS_ENABLED        = "true"
        TIMESCALE_MARKET_DATA_ENABLED = var.timescale_market_data_enabled
        RL_ONLINE_LEARNING_ENABLED = var.rl_online_learning_enabled
        RL_ONLINE_LEARNING_INTERVAL_MIN = "${var.rl_online_learning_interval_min}"
        RL_ONLINE_LEARNING_INTERVAL = var.rl_online_learning_interval
        RL_ONLINE_LEARNING_CONTEXT_INTERVALS = var.rl_online_learning_context_intervals
        RL_ONLINE_LEARNING_PAIRS = var.rl_online_learning_pairs
        RL_ONLINE_LEARNING_MIN_WIN_RATE = "${var.rl_online_learning_min_win_rate}"
        RL_ONLINE_LEARNING_MIN_NET_PNL = "${var.rl_online_learning_min_net_pnl}"
        RL_ONLINE_LEARNING_MAX_DRAWDOWN = "${var.rl_online_learning_max_drawdown}"
        RL_ONLINE_LEARNING_MIN_TRADE_COUNT = "${var.rl_online_learning_min_trade_count}"
        RL_SERVICE_TIMEOUT_MS = "${var.rl_service_timeout_ms}"
        RL_ONLINE_LEARNING_DECISION_THRESHOLD = "${var.rl_online_learning_decision_threshold}"
        DISABLE_TEST_DATA_IN_DB = "true"
        E2E_RUN                 = "0"
        BINGX_MARKET_DATA_MOCK  = "false"
        TRADINGVIEW_USE_HTML    = "false"
        TRADINGVIEW_HTML_PATH   = ""
        TELEGRAM_MESSAGES_PATH  = ""
      }

      template {
        destination = "secrets/worker.env"
        env         = true
        change_mode = "restart"
        data        = <<-EOT
{{- with nomadVar "${var.secrets_var_path}" }}
API_TOKEN={{ printf "%q" .API_TOKEN }}
BINGX_API_KEY={{ printf "%q" .BINGX_API_KEY }}
BINGX_SECRET_KEY={{ printf "%q" .BINGX_SECRET_KEY }}
TELEGRAM_API_ID={{ printf "%q" .TELEGRAM_API_ID }}
TELEGRAM_API_HASH={{ printf "%q" .TELEGRAM_API_HASH }}
TELEGRAM_SESSION={{ printf "%q" .TELEGRAM_SESSION }}
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
{{ $rlHost := "${var.rl_service_name}.service.nomad" -}}
{{ $rlPort := "${var.rl_service_port}" -}}
{{ with nomadService "${var.rl_service_name}" -}}
{{ with index . 0 -}}
{{ $rlHost = .Address -}}
{{ $rlPort = printf "%d" .Port -}}
{{ end -}}
{{ end -}}
RL_SERVICE_URL={{ printf "%q" (printf "http://%s:%s" $rlHost $rlPort) }}
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
