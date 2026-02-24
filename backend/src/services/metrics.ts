/**
 * Prometheus exposition format (text). No external dependency.
 * Use for API and worker when PROMETHEUS_METRICS_ENABLED or METRICS_PORT is set.
 */

const PREFIX = process.env.METRICS_PREFIX ?? "gvfx_";

const counters = new Map<string, number>();
const gauges = new Map<string, number>();

function key(name: string, labels: Record<string, string>) {
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `${name}{${parts.join(",")}}`;
}

export function counterInc(name: string, labels: Record<string, string> = {}, delta = 1) {
  const k = key(PREFIX + name, labels);
  counters.set(k, (counters.get(k) ?? 0) + delta);
}

export function gaugeSet(name: string, labels: Record<string, string>, value: number) {
  gauges.set(key(PREFIX + name, labels), value);
}

export function renderPrometheus(): string {
  const lines: string[] = [];
  for (const [k, v] of counters) {
    const match = k.match(/^([^{]+)(\{.*\})?$/);
    if (match) {
      const [, name, labelPart] = match;
      lines.push(`${name}${labelPart ?? ""} ${v}`);
    }
  }
  for (const [k, v] of gauges) {
    const match = k.match(/^([^{]+)(\{.*\})?$/);
    if (match) {
      const [, name, labelPart] = match;
      lines.push(`${name}${labelPart ?? ""} ${v}`);
    }
  }
  if (lines.length === 0) {
    lines.push(`${PREFIX}up 1`);
  }
  return lines.join("\n") + "\n";
}

export function metricsHandler(): Response {
  return new Response(renderPrometheus(), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}
