"""
Normalized data lake: write Nautilus domain objects to Parquet catalog structure
compatible with ParquetDataCatalog. Use for Nautilus-ready normalized layer.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from nautilus_trader.model.data import Bar
    from nautilus_trader.model.identifiers import InstrumentId
    from nautilus_trader.model.instruments.base import Instrument


def write_normalized_catalog(
    catalog_path: str | Path,
    instrument: Instrument,
    bars: list[Bar],
) -> str:
    """
    Write one instrument and its bars to a ParquetDataCatalog at catalog_path.
    Returns the resolved catalog path.
    """
    from nautilus_trader.persistence.catalog.parquet import ParquetDataCatalog

    path = Path(catalog_path).resolve()
    path.mkdir(parents=True, exist_ok=True)
    catalog = ParquetDataCatalog(str(path))
    catalog.write_data([instrument])
    if bars:
        catalog.write_data(bars)
    return str(path)


def list_catalog_instruments(catalog_path: str | Path) -> list[str]:
    """List instrument IDs present in a ParquetDataCatalog (by scanning parquet dirs)."""
    from nautilus_trader.persistence.catalog.parquet import ParquetDataCatalog

    path = Path(catalog_path).resolve()
    if not path.is_dir():
        return []
    catalog = ParquetDataCatalog(str(path))
    try:
        return [str(i) for i in catalog.instrument_ids()]
    except Exception:
        return []


def load_bars_from_catalog(
    catalog_path: str | Path,
    instrument_id: str | InstrumentId,
    bar_type_str: str | None = None,
) -> list[dict[str, Any]]:
    """
    Load bars from catalog for an instrument (and optional bar_type).
    Returns list of dicts with open, high, low, close, volume, ts_event for compatibility.
    """
    from nautilus_trader.model.identifiers import InstrumentId
    from nautilus_trader.persistence.catalog.parquet import ParquetDataCatalog

    path = Path(catalog_path).resolve()
    if not path.is_dir():
        return []
    catalog = ParquetDataCatalog(str(path))
    iid = instrument_id if isinstance(instrument_id, InstrumentId) else InstrumentId.from_str(str(instrument_id))
    try:
        data = catalog.bars(instrument_id=iid, bar_type=bar_type_str) if bar_type_str else catalog.bars(instrument_id=iid)
    except Exception:
        return []
    out: list[dict[str, Any]] = []
    for bar in data:
        out.append({
            "open": float(bar.open),
            "high": float(bar.high),
            "low": float(bar.low),
            "close": float(bar.close),
            "volume": float(bar.volume),
            "ts_event": bar.ts_event,
            "timestamp": _ts_nanos_to_iso(bar.ts_event),
        })
    return out


def _ts_nanos_to_iso(ts_nanos: int) -> str:
    from datetime import datetime, timezone
    ts_sec = ts_nanos / 1_000_000_000
    return datetime.fromtimestamp(ts_sec, tz=timezone.utc).isoformat().replace("+00:00", "Z")
