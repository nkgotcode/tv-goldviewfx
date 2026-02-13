export function normalizeInstrument(instrument: string) {
  const trimmed = instrument?.trim() ?? "";
  const upper = trimmed.toUpperCase();
  const compact = upper.replace(/[^A-Z0-9]/g, "");
  return { canonical: upper, compact };
}

export function isInstrumentAllowed(instrument: string, allowed?: string[] | null) {
  if (!allowed || allowed.length === 0) {
    return true;
  }
  const target = normalizeInstrument(instrument);
  for (const entry of allowed) {
    const normalized = normalizeInstrument(entry);
    if (normalized.canonical === target.canonical || normalized.compact === target.compact) {
      return true;
    }
  }
  return false;
}

export function assertInstrumentAllowed(instrument: string, allowed?: string[] | null) {
  if (!isInstrumentAllowed(instrument, allowed)) {
    throw new Error(`Instrument ${instrument} is not allowed by agent configuration.`);
  }
}
