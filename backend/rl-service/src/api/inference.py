from __future__ import annotations

from fastapi import APIRouter

from features.extractors import extract_features, vectorize_features
from models.action_mapper import map_action
from models.artifact_loader import decode_base64, fetch_artifact
from models.registry import ModelMetadata, ModelRegistry
from schemas import InferenceRequest, InferenceResponse, TradeDecision

router = APIRouter()
registry = ModelRegistry()


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
    warnings: list[str] = []

    decision: TradeDecision
    model_version = payload.policy_version
    if payload.policy_version and (
        payload.artifact_base64 or payload.artifact_download_url
    ):
        if payload.artifact_base64:
            artifact = decode_base64(payload.artifact_base64)
        else:
            artifact = fetch_artifact(
                payload.artifact_download_url,
                expected_checksum=payload.artifact_checksum,
            )
        metadata = ModelMetadata(
            version_id=payload.policy_version,
            artifact_uri=payload.artifact_uri,
            artifact_checksum=payload.artifact_checksum or artifact.checksum,
            artifact_size_bytes=len(artifact.data),
        )
        model = registry.ensure_loaded(
            payload.policy_version,
            payload=artifact.data,
            metadata=metadata,
        )
        try:
            import numpy as np

            obs = np.array(vectorize_features(features), dtype=float)
            action, _ = model.predict(obs, deterministic=True)
            score = float(action) if hasattr(action, "__float__") else float(action[0])
        except Exception as exc:
            warnings.append(f"model_inference_failed:{exc}")
            score = features.get("aux_score", 0.0) + (features.get("price_change", 0.0) * 0.5)
    else:
        warnings.append("model_unavailable")
        score = features.get("aux_score", 0.0) + (features.get("price_change", 0.0) * 0.5)

    decision = map_action(score)
    decision, warnings = _apply_risk_limits(decision, payload)

    if not payload.learning_enabled:
        warnings.append("learning_disabled")

    return InferenceResponse(decision=decision, features=features, warnings=warnings, model_version=model_version)
