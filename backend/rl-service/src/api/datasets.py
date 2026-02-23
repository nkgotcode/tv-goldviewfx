from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, HTTPException

from data.dataset_builder import build_dataset
from schemas import DatasetPreviewResponse, DatasetRequest, DatasetVersionPayload

router = APIRouter()


def _parse_interval_seconds(interval: str) -> int:
    if interval.endswith("m"):
        return int(interval[:-1]) * 60
    if interval.endswith("h"):
        return int(interval[:-1]) * 60 * 60
    if interval.endswith("d"):
        return int(interval[:-1]) * 60 * 60 * 24
    raise ValueError("Unsupported interval")


def _build_features(request: DatasetRequest) -> list[dict]:
    if request.features:
        return request.features
    step_seconds = _parse_interval_seconds(request.interval)
    total_seconds = (request.end_at - request.start_at).total_seconds()
    count = int(total_seconds // step_seconds)
    if count <= 0:
        return []
    features: list[dict] = []
    base_price_map = {
        "XAUTUSDT": 2300.0,
        "PAXGUSDT": 2300.0,
        "ALGO-USDT": 0.2,
        "BTC-USDT": 60000.0,
        "ETH-USDT": 3000.0,
        "SOL-USDT": 120.0,
        "XRP-USDT": 0.7,
        "BNB-USDT": 500.0,
    }
    base_price = base_price_map.get(str(request.pair), 1000.0)
    for idx in range(count):
        timestamp = request.start_at + timedelta(seconds=idx * step_seconds)
        price = base_price + idx * 0.2
        features.append(
            {
                "timestamp": timestamp.isoformat(),
                "open": price,
                "high": price + 0.4,
                "low": price - 0.4,
                "close": price + 0.2,
                "volume": 100 + idx,
            }
        )
    return features


@router.post("/datasets/preview", response_model=DatasetPreviewResponse)
def build_dataset_preview(payload: DatasetRequest) -> DatasetPreviewResponse:
    try:
        features = _build_features(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not features:
        raise HTTPException(status_code=400, detail="No features available for dataset window")

    result = build_dataset(
        features,
        window_size=payload.window_size,
        stride=payload.stride,
        metadata={
            "pair": payload.pair,
            "interval": payload.interval,
            "start_at": payload.start_at,
            "end_at": payload.end_at,
            "feature_set_version_id": payload.feature_set_version_id,
            "feature_schema_fingerprint": payload.feature_schema_fingerprint,
        },
    )

    version = DatasetVersionPayload(**result["dataset_version"])
    return DatasetPreviewResponse(version=version, window_count=len(result["windows"]))
