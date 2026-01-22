from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FeatureSetConfig:
    include_news: bool = False
    include_ocr: bool = False


def build_feature_set_label(config: FeatureSetConfig) -> str:
    parts = ["core"]
    if config.include_news:
        parts.append("news")
    if config.include_ocr:
        parts.append("ocr")
    return "+".join(parts)


def describe_feature_set(config: FeatureSetConfig) -> str:
    return f"news={config.include_news}, ocr={config.include_ocr}"


def parse_feature_set_label(label: str) -> FeatureSetConfig:
    tokens = {part.strip().lower() for part in label.split("+") if part.strip()}
    return FeatureSetConfig(
        include_news="news" in tokens,
        include_ocr="ocr" in tokens,
    )
