from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from typing import Any


@dataclass(frozen=True)
class FeatureSetConfig:
    version: str = "v1"
    include_news: bool = False
    include_ocr: bool = False
    technical: dict[str, Any] | None = None


def build_feature_set_label(config: FeatureSetConfig) -> str:
    parts = ["core"]
    if config.include_news:
        parts.append("news")
    if config.include_ocr:
        parts.append("ocr")
    if config.technical and config.technical.get("enabled"):
        parts.append("ta")
    return "+".join(parts)


def describe_feature_set(config: FeatureSetConfig) -> str:
    payload = {
        "version": config.version,
        "news": config.include_news,
        "ocr": config.include_ocr,
        "technical": config.technical or {"enabled": False},
    }
    return json.dumps(payload, sort_keys=True)


def parse_feature_set_label(label: str) -> FeatureSetConfig:
    tokens = {part.strip().lower() for part in label.split("+") if part.strip()}
    return FeatureSetConfig(
        version="v2" if "ta" in tokens else "v1",
        include_news="news" in tokens,
        include_ocr="ocr" in tokens,
        technical={"enabled": "ta" in tokens},
    )


def build_feature_schema_fingerprint(config: FeatureSetConfig) -> str:
    payload = {
        "version": config.version,
        "technical": config.technical or {"enabled": False},
    }
    return sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
