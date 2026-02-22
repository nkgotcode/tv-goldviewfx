name        = "mbp-m3max"
datacenter  = "dc1"
data_dir    = "/opt/homebrew/var/lib/nomad"
bind_addr   = "0.0.0.0"
log_level   = "INFO"
enable_debug = false

advertise {
  http = "100.97.7.38"
  rpc  = "100.97.7.38"
  serf = "100.97.7.38"
}

server {
  enabled = false
}

client {
  enabled = true

  servers = [
    "100.103.201.10:4647",
    "100.83.150.39:4647",
    "100.110.26.124:4647",
  ]

  node_class = "general"

  meta {
    role    = "general"
    machine = "mbp-m3max"
  }

  options = {
    "driver.raw_exec.enable" = "1"
  }
}
