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

variable "frontend_port" {
  type    = number
  default = 3000
}

variable "frontend_image" {
  type    = string
  default = "ghcr.io/your-org/tv-goldviewfx-frontend:replace-with-git-sha"
}

variable "frontend_work_dir" {
  type    = string
  default = "/app/frontend"
}

variable "consul_service_name" {
  type    = string
  default = "gvfx-frontend"
}

variable "next_public_api_base_url" {
  type    = string
  default = "http://gvfx-api.service.nomad:8787"
}

variable "next_public_market_gold_pairs" {
  type    = string
  default = "XAUTUSDT,PAXGUSDT"
}

variable "next_public_market_crypto_pairs" {
  type    = string
  default = "ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT"
}

variable "frontend_required_rl_tier" {
  type    = string
  default = "primary"
}

variable "api_service_name" {
  type    = string
  default = "gvfx-api"
}

variable "api_service_port" {
  type    = number
  default = 8787
}

job "gvfx-frontend" {
  region      = var.region
  namespace   = var.namespace
  datacenters = var.datacenters
  type        = "service"

  group "frontend" {
    count = var.count

    constraint {
      attribute = "${meta.role}"
      operator  = "!="
      value     = "witness"
    }

    constraint {
      attribute = "${meta.rl_tier}"
      operator  = "="
      value     = var.frontend_required_rl_tier
    }

    constraint {
      operator = "distinct_hosts"
      value    = "true"
    }

    network {
      mode = "host"
      port "http" {
        static = var.frontend_port
        to     = var.frontend_port
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

    task "frontend" {
      driver = "docker"

      config {
        image    = var.frontend_image
        command  = "npm"
        args     = ["run", "start"]
        work_dir = var.frontend_work_dir
        ports    = ["http"]
      }

      env {
        PORT                            = "${var.frontend_port}"
        NEXT_PUBLIC_MARKET_GOLD_PAIRS   = var.next_public_market_gold_pairs
        NEXT_PUBLIC_MARKET_CRYPTO_PAIRS = var.next_public_market_crypto_pairs
      }

      template {
        destination = "secrets/frontend.env"
        env         = true
        change_mode = "restart"
        data        = <<-EOT
{{ $apiHost := "${var.api_service_name}.service.nomad" -}}
{{ $apiPort := "${var.api_service_port}" -}}
{{ with nomadService "${var.api_service_name}" -}}
{{ with index . 0 -}}
{{ $apiHost = .Address -}}
{{ $apiPort = printf "%d" .Port -}}
{{ end -}}
{{ end -}}
NEXT_PUBLIC_API_BASE_URL={{ printf "%q" (printf "http://%s:%s" $apiHost $apiPort) }}
EOT
      }

      resources {
        cpu    = 800
        memory = 1024
      }

      service {
        name = var.consul_service_name
        provider = "nomad"
        port = "http"

        check {
          type     = "http"
          path     = "/"
          interval = "10s"
          timeout  = "3s"
        }
      }
    }
  }
}
