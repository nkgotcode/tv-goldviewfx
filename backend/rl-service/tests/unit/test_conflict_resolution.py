from datetime import datetime, timezone

from features.extractors import resolve_signal_conflicts
from schemas import AuxiliarySignal


def test_conflict_resolution_neutralizes_close_scores():
    timestamp = datetime.now(tz=timezone.utc)
    signals = [
        AuxiliarySignal(source="ideas", timestamp=timestamp, score=0.6, confidence=1.0),
        AuxiliarySignal(source="news", timestamp=timestamp, score=-0.55, confidence=1.0),
    ]

    resolved = resolve_signal_conflicts(signals, neutral_band=0.1)
    assert resolved == 0.0


def test_conflict_resolution_prefers_stronger_bias():
    timestamp = datetime.now(tz=timezone.utc)
    signals = [
        AuxiliarySignal(source="signals", timestamp=timestamp, score=0.8, confidence=1.0),
        AuxiliarySignal(source="news", timestamp=timestamp, score=-0.2, confidence=1.0),
    ]

    resolved = resolve_signal_conflicts(signals, neutral_band=0.1)
    assert resolved > 0
