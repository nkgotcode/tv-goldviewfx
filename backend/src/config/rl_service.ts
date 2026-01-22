import { z } from "zod";

const rlServiceSchema = z.object({
  RL_SERVICE_URL: z.string().url().default("http://localhost:9101"),
  RL_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  RL_SERVICE_API_KEY: z.string().optional(),
  RL_SERVICE_HEALTH_PATH: z.string().default("/health"),
  RL_SERVICE_MOCK: z.preprocess((value) => {
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(normalized)) return true;
      if (["0", "false", "no", "off", ""].includes(normalized)) return false;
    }
    return value;
  }, z.boolean().default(false)),
});

export type RlServiceConfig = {
  url: string;
  timeoutMs: number;
  apiKey?: string;
  healthPath: string;
  mock: boolean;
};

export function loadRlServiceConfig(env = process.env): RlServiceConfig {
  const parsed = rlServiceSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid RL service configuration: ${message}`);
  }

  return {
    url: parsed.data.RL_SERVICE_URL,
    timeoutMs: parsed.data.RL_SERVICE_TIMEOUT_MS,
    apiKey: parsed.data.RL_SERVICE_API_KEY,
    healthPath: parsed.data.RL_SERVICE_HEALTH_PATH,
    mock: parsed.data.RL_SERVICE_MOCK,
  };
}
