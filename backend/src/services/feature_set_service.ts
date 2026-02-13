import {
  findFeatureSetVersionByLabel,
  getFeatureSetVersion,
  insertFeatureSetVersion,
  listFeatureSetVersions,
  updateFeatureSetVersion,
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
    return updateFeatureSetVersion(existing.id, {});
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
  const versions = await listFeatureSetVersions();
  return [...versions].sort((left, right) => {
    const leftTime = Date.parse((left.updated_at ?? left.created_at ?? "") as string) || 0;
    const rightTime = Date.parse((right.updated_at ?? right.created_at ?? "") as string) || 0;
    return rightTime - leftTime;
  });
}
