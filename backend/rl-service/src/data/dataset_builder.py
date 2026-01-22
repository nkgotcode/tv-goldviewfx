from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Iterable
from uuid import uuid4


def build_feature_windows(features: list[dict], window_size: int, stride: int = 1) -> list[list[dict]]:
    if window_size <= 0:
        raise ValueError("window_size must be positive")
    if stride <= 0:
        raise ValueError("stride must be positive")

    if len(features) < window_size:
        return []

    windows: list[list[dict]] = []
    for start in range(0, len(features) - window_size + 1, stride):
        windows.append(features[start : start + window_size])
    return windows


def _serialize_payload(payload: object) -> str:
    return json.dumps(payload, sort_keys=True, default=str)


def compute_dataset_checksum(windows: list[list[dict]], metadata: dict) -> str:
    digest = hashlib.sha256()
    digest.update(_serialize_payload(metadata).encode())
    digest.update(_serialize_payload(windows).encode())
    return digest.hexdigest()


def build_dataset(
    features: list[dict],
    window_size: int,
    stride: int = 1,
    metadata: dict | None = None,
) -> dict:
    windows = build_feature_windows(features, window_size, stride)
    dataset_version = None
    if metadata:
        dataset_version = {
            "id": str(uuid4()),
            "pair": metadata.get("pair"),
            "interval": metadata.get("interval", "1m"),
            "start_at": metadata.get("start_at"),
            "end_at": metadata.get("end_at"),
            "checksum": compute_dataset_checksum(windows, metadata),
            "feature_set_version_id": metadata.get("feature_set_version_id"),
            "created_at": datetime.utcnow(),
        }
    return {
        "window_size": window_size,
        "stride": stride,
        "windows": windows,
        "dataset_version": dataset_version,
    }
