from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass
class ModelMetadata:
    version_id: str
    artifact_uri: str | None = None
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

    def load_from_json(self, version_id: str, json_path: str) -> Any:
        with open(json_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        self.register(version_id, payload)
        return payload

    def metadata(self, version_id: str) -> ModelMetadata | None:
        return self._metadata.get(version_id)
