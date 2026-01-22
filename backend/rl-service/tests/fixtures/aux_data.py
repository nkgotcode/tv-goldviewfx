from __future__ import annotations

from datetime import datetime, timedelta, timezone


def build_signal(source: str, score: float, minutes_ago: int = 5):
    timestamp = datetime.now(tz=timezone.utc) - timedelta(minutes=minutes_ago)
    return {
        "source": source,
        "timestamp": timestamp.isoformat(),
        "score": score,
        "confidence": 0.7,
        "metadata": {"note": f"synthetic-{source}"},
    }


def build_signals():
    return [
        build_signal("ideas", 0.6, minutes_ago=10),
        build_signal("signals", 0.4, minutes_ago=7),
        build_signal("news", -0.3, minutes_ago=3),
    ]


DEFAULT_SIGNALS = build_signals()
