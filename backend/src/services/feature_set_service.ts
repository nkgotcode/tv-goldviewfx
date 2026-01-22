import {
  findFeatureSetVersionByLabel,
  getFeatureSetVersion,
  insertFeatureSetVersion,
  listFeatureSetVersions,
} from "../db/repositories/feature_set_versions";

export type FeatureSetConfig = {
  includeNews: boolean;
  includeOcr: boolean;
};

export function buildFeatureSetLabel(config: FeatureSetConfig) {
  const parts = ["core"];
  if (config.includeNews) parts.push("news");
  if (config.includeOcr) parts.push("ocr");
  return parts.join("+");
}

export function describeFeatureSet(config: FeatureSetConfig) {
  return JSON.stringify({ news: config.includeNews, ocr: config.includeOcr });
}

export function parseFeatureSetConfig(label: string, description?: string | null): FeatureSetConfig {
  if (description) {
    try {
      const parsed = JSON.parse(description);
      return {
        includeNews: Boolean(parsed.news),
        includeOcr: Boolean(parsed.ocr),
      };
    } catch {
      // fall through to label parse
    }
  }
  const tokens = label.split("+").map((token) => token.trim().toLowerCase());
  return {
    includeNews: tokens.includes("news"),
    includeOcr: tokens.includes("ocr"),
  };
}

export async function resolveFeatureSetVersion(config: FeatureSetConfig) {
  const label = buildFeatureSetLabel(config);
  const existing = await findFeatureSetVersionByLabel(label);
  if (existing) {
    return existing;
  }
  return insertFeatureSetVersion({
    label,
    description: describeFeatureSet(config),
  });
}

export async function getFeatureSetConfigById(id?: string | null): Promise<FeatureSetConfig> {
  if (!id) {
    return { includeNews: true, includeOcr: false };
  }
  const version = await getFeatureSetVersion(id);
  return parseFeatureSetConfig(version.label, version.description ?? null);
}

export async function listFeatureSets() {
  return listFeatureSetVersions();
}
