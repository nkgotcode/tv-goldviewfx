import postgres from "postgres";

let sqlClient: postgres.Sql | null = null;

function envInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getTimescaleSql(requiredBy: string) {
  const url = process.env.TIMESCALE_URL;
  if (!url) {
    throw new Error(`TIMESCALE_URL is required when ${requiredBy}`);
  }
  if (!sqlClient) {
    const max = envInt("TIMESCALE_POOL_MAX", 2);
    sqlClient = postgres(url, {
      max,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => {},
    });
  }
  return sqlClient;
}
