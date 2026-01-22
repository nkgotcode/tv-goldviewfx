from __future__ import annotations

from fastapi import APIRouter

from features.extractors import extract_features
from models.action_mapper import map_action
from schemas import InferenceRequest, InferenceResponse, TradeDecision

router = APIRouter()


def _apply_risk_limits(decision: TradeDecision, request: InferenceRequest) -> tuple[TradeDecision, list[str]]:
    warnings: list[str] = []
    if request.risk_limits:
        if request.risk_limits.max_open_positions <= 0 or request.risk_limits.max_position_size <= 0:
            warnings.append("risk_limits_blocked")
            decision.action = "hold"
            decision.risk_check_result = "fail"
    return decision, warnings


@router.post("/inference", response_model=InferenceResponse)
def run_inference(payload: InferenceRequest) -> InferenceResponse:
    features = extract_features(payload.market, payload.ideas, payload.signals, payload.news, payload.ocr)
    score = features.get("aux_score", 0.0) + (features.get("price_change", 0.0) * 0.5)

    decision = map_action(score)
    decision, warnings = _apply_risk_limits(decision, payload)

    if not payload.learning_enabled:
        warnings.append("learning_disabled")

    return InferenceResponse(decision=decision, features=features, warnings=warnings, model_version=payload.policy_version)
