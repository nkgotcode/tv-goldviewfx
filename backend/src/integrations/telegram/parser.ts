export function normalizeTelegramContent(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function summarizeTelegramContent(value: string, maxLength = 240) {
  const normalized = normalizeTelegramContent(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}
