from __future__ import annotations

import json
import tempfile
from dataclasses import dataclass
from typing import Any

from hashlib import sha256


@dataclass
class ModelMetadata:
    version_id: str
    artifact_uri: str | None = None
    artifact_checksum: str | None = None
    artifact_size_bytes: int | None = None
    metadata: dict[str, Any] | None = None


class ModelRegistry:
    def __init__(self) -> None:
        self._models: dict[str, Any] = {}
        self._metadata: dict[str, ModelMetadata] = {}

    def register(self, version_id: str, model: Any, metadata: ModelMetadata | None = None) -> None:
        self._models[version_id] = model
        if metadata:
            self._metadata[version_id] = metadata

    def get(self, version_id: str) -> Any:
        if version_id not in self._models:
            raise KeyError(f"Model version not found: {version_id}")
        return self._models[version_id]

    def has(self, version_id: str) -> bool:
        return version_id in self._models

    def load_from_json(self, version_id: str, json_path: str) -> Any:
        with open(json_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        self.register(version_id, payload)
        return payload

    def load_from_bytes(self, version_id: str, payload: bytes, metadata: ModelMetadata | None = None) -> Any:
        model = load_sb3_model_from_bytes(payload)
        self.register(version_id, model, metadata=metadata)
        return model

    def load_from_file(self, version_id: str, file_path: str, metadata: ModelMetadata | None = None) -> Any:
        model = load_sb3_model(file_path)
        self.register(version_id, model, metadata=metadata)
        return model

    def metadata(self, version_id: str) -> ModelMetadata | None:
        return self._metadata.get(version_id)

    def ensure_loaded(
        self,
        version_id: str,
        payload: bytes | None = None,
        file_path: str | None = None,
        metadata: ModelMetadata | None = None,
    ) -> Any:
        if self.has(version_id):
            return self.get(version_id)
        if payload is not None:
            return self.load_from_bytes(version_id, payload, metadata=metadata)
        if file_path is not None:
            return self.load_from_file(version_id, file_path, metadata=metadata)
        raise KeyError(f"Model version not found: {version_id}")


def _hash_bytes(payload: bytes) -> str:
    digest = sha256()
    digest.update(payload)
    return digest.hexdigest()


def load_sb3_model(file_path: str) -> Any:
    try:
        from stable_baselines3 import PPO
    except Exception as exc:  # pragma: no cover - optional dependency guard
        raise RuntimeError("stable-baselines3 is required to load models") from exc
    return PPO.load(file_path)


def load_sb3_model_from_bytes(payload: bytes) -> Any:
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=True) as handle:
        handle.write(payload)
        handle.flush()
        return load_sb3_model(handle.name)
