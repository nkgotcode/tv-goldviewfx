from __future__ import annotations

from datetime import datetime
from typing import Iterable

from schemas import AuxiliarySignal


def _coerce_timestamp(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value)


def build_news_inputs(items: Iterable[dict]) -> list[AuxiliarySignal]:
    signals: list[AuxiliarySignal] = []
    for item in items:
        signals.append(
            AuxiliarySignal(
                source=item.get("source", "news"),
                timestamp=_coerce_timestamp(item["timestamp"]),
                score=float(item.get("score", 0.0)),
                confidence=item.get("confidence"),
                metadata=item.get("metadata") or {},
            )
        )
    return signals


def build_ocr_inputs(items: Iterable[dict]) -> list[AuxiliarySignal]:
    signals: list[AuxiliarySignal] = []
    for item in items:
        metadata = dict(item.get("metadata") or {})
        if "text" in item:
            metadata.setdefault("text", item.get("text"))
        signals.append(
            AuxiliarySignal(
                source=item.get("source", "ocr_text"),
                timestamp=_coerce_timestamp(item["timestamp"]),
                score=float(item.get("score", 0.0)),
                confidence=item.get("confidence"),
                metadata=metadata,
            )
        )
    return signals
