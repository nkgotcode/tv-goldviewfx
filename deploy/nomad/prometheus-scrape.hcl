# Prometheus scrape config for tv-goldviewfx (Nomad service discovery).
# Use with a Prometheus instance that can resolve Nomad service names
# (e.g. Prometheus running in the same Nomad cluster with nomad_sd_configs,
# or Consul DNS for gvfx-api.service.nomad, gvfx-worker, gvfx-rl-service).
#
# API: expose metrics on same server as main app at GET /metrics (no extra port).
# Worker: set METRICS_PORT in gvfx-worker job (e.g. 9091) and add port "metrics" block.
# RL service: GET /metrics on same port as health (9101).
#
# Example scrape_configs for prometheus.yml:
#
# scrape_configs:
#   - job_name: 'gvfx-api'
#     metrics_path: /metrics
#     static_configs:
#       - targets: ['gvfx-api.service.nomad:8787']
#     # Or use Nomad service discovery:
#     # nomad_sd_configs:
#     #   - server: 'http://nomad.service.consul:4646'
#     #     refresh_interval: 30s
#     # relabel_configs:
#     #   - source_labels: [__meta_nomad_task_group]
#     #     regex: api
#     #     action: keep
#
#   - job_name: 'gvfx-worker'
#     metrics_path: /metrics
#     static_configs:
#       - targets: ['gvfx-worker.service.nomad:9091']
#     # METRICS_PORT=9091 must be set and port "metrics" 9091 in gvfx-worker.nomad.hcl
#
#   - job_name: 'gvfx-rl-service'
#     metrics_path: /metrics
#     static_configs:
#       - targets: ['gvfx-rl-service.service.nomad:9101']
