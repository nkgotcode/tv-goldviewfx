from __future__ import annotations

from schemas import TradeDecision


def map_action(score: float, threshold: float = 0.2) -> TradeDecision:
    if score >= threshold:
        action = "long"
    elif score <= -threshold:
        action = "short"
    else:
        action = "hold"

    confidence = min(1.0, abs(score))
    return TradeDecision(action=action, confidence_score=confidence, risk_check_result="pass")
