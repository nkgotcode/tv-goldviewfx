from datetime import datetime, timezone

from data.feature_inputs import build_news_inputs, build_ocr_inputs


def test_build_news_inputs_maps_scores():
    now = datetime.now(tz=timezone.utc).isoformat()
    items = [{"source": "news", "timestamp": now, "score": 0.4, "confidence": 0.8}]
    signals = build_news_inputs(items)
    assert len(signals) == 1
    assert signals[0].source == "news"
    assert signals[0].score == 0.4
    assert signals[0].confidence == 0.8


def test_build_ocr_inputs_includes_text_metadata():
    now = datetime.now(tz=timezone.utc).isoformat()
    items = [{"source": "ocr_text", "timestamp": now, "score": 0.1, "confidence": 0.5, "text": "signal"}]
    signals = build_ocr_inputs(items)
    assert len(signals) == 1
    assert signals[0].metadata.get("text") == "signal"
