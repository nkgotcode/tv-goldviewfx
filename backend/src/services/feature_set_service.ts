import { createHash } from "node:crypto";
import {
  findFeatureSetVersionByLabel,
  getFeatureSetVersion,
  insertFeatureSetVersion,
  listFeatureSetVersions,
  updateFeatureSetVersion,
} from "../db/repositories/feature_set_versions";
import type { FeatureSetContract, TaIndicatorConfig } from "../types/rl";

export type FeatureSetConfig = {
  version?: "v1" | "v2";
  includeNews: boolean;
  includeOcr: boolean;
  technical?: {
    enabled?: boolean;
    criticalFields?: string[];
    indicators?: TaIndicatorConfig[];
  };
};

export function buildFeatureSetLabel(config: FeatureSetConfig) {
  const parts = ["core"];
  if (config.includeNews) parts.push("news");
  if (config.includeOcr) parts.push("ocr");
  if (config.technical?.enabled) parts.push("ta");
  return parts.join("+");
}

function defaultIndicators(): TaIndicatorConfig[] {
  return [
    { name: "sma", params: { period: 20 } },
    { name: "ema", params: { period: 21 } },
    { name: "rsi", params: { period: 14 } },
    { name: "atr", params: { period: 14 } },
    { name: "macd", params: { fastperiod: 12, slowperiod: 26, signalperiod: 9 } },
  ];
}

function normalizeTechnical(config?: FeatureSetConfig["technical"]): FeatureSetContract["technical"] {
  const enabled = Boolean(config?.enabled);
  if (!enabled) {
    return { enabled: false, indicators: [], criticalFields: [] };
  }
  return {
    enabled: true,
    criticalFields: Array.isArray(config?.criticalFields) ? config?.criticalFields : ["last_price", "price_change"],
    indicators: Array.isArray(config?.indicators) && config.indicators.length > 0 ? config.indicators : defaultIndicators(),
  };
}

function normalizeFeatureSet(config: FeatureSetConfig): FeatureSetContract {
  const technical = normalizeTechnical(config.technical);
  return {
    version: config.version ?? (technical.enabled ? "v2" : "v1"),
    includeNews: Boolean(config.includeNews),
    includeOcr: Boolean(config.includeOcr),
    technical,
  };
}

export function describeFeatureSet(config: FeatureSetConfig) {
  const normalized = normalizeFeatureSet(config);
  return JSON.stringify(
    {
      version: normalized.version,
      news: normalized.includeNews,
      ocr: normalized.includeOcr,
      technical: normalized.technical,
    },
    null,
    0,
  );
}

export function parseFeatureSetConfig(label: string, description?: string | null): FeatureSetConfig {
  if (description) {
    try {
      const parsed = JSON.parse(description) as Record<string, unknown>;
      const technical = (parsed.technical ?? {}) as Record<string, unknown>;
      return normalizeFeatureSet({
        version: parsed.version === "v2" ? "v2" : "v1",
        includeNews: Boolean(parsed.news),
        includeOcr: Boolean(parsed.ocr),
        technical: {
          enabled: Boolean(technical.enabled),
          criticalFields: Array.isArray(technical.criticalFields)
            ? technical.criticalFields.map((value) => String(value))
            : undefined,
          indicators: Array.isArray(technical.indicators)
            ? technical.indicators.map((entry) => {
                const indicator = entry as Record<string, unknown>;
                return {
                  name: String(indicator.name ?? ""),
                  params: typeof indicator.params === "object" && indicator.params !== null
                    ? Object.fromEntries(
                        Object.entries(indicator.params as Record<string, unknown>).map(([key, value]) => [
                          key,
                          Number(value),
                        ]),
                      )
                    : undefined,
                  outputNames: Array.isArray(indicator.outputNames)
                    ? indicator.outputNames.map((value) => String(value))
                    : undefined,
                } satisfies TaIndicatorConfig;
              })
            : undefined,
        },
      });
    } catch {
      // fall through to label parse
    }
  }
  const tokens = label.split("+").map((token) => token.trim().toLowerCase());
  return normalizeFeatureSet({
    includeNews: tokens.includes("news"),
    includeOcr: tokens.includes("ocr"),
    technical: {
      enabled: tokens.includes("ta"),
    },
  });
}

export function getFeatureSchemaFingerprint(config: FeatureSetConfig) {
  const normalized = normalizeFeatureSet(config);
  const fingerprintInput = {
    version: normalized.version,
    technical: normalized.technical,
  };
  return createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex");
}

export async function resolveFeatureSetVersion(config: FeatureSetConfig) {
  const normalized = normalizeFeatureSet(config);
  const label = buildFeatureSetLabel(normalized);
  const existing = await findFeatureSetVersionByLabel(label);
  if (existing) {
    return updateFeatureSetVersion(existing.id, {
      description: describeFeatureSet(normalized),
    });
  }
  return insertFeatureSetVersion({
    label,
    description: describeFeatureSet(normalized),
  });
}

export async function getFeatureSetConfigById(id?: string | null): Promise<FeatureSetConfig> {
  if (!id) {
    return {
      version: "v2",
      includeNews: true,
      includeOcr: false,
      technical: {
        enabled: true,
        indicators: defaultIndicators(),
        criticalFields: ["last_price", "price_change", "sma_20", "ema_21", "rsi_14", "atr_14"],
      },
    };
  }
  const version = await getFeatureSetVersion(id);
  return parseFeatureSetConfig(version.label, version.description ?? null);
}

export async function listFeatureSets() {
  const versions = await listFeatureSetVersions();
  return [...versions].sort((left, right) => {
    const leftTime = Date.parse((left.updated_at ?? left.created_at ?? "") as string) || 0;
    const rightTime = Date.parse((right.updated_at ?? right.created_at ?? "") as string) || 0;
    return rightTime - leftTime;
  });
}
