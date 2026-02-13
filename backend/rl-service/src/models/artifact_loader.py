from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class ArtifactPayload:
    data: bytes
    checksum: str | None = None


def _compute_checksum(payload: bytes) -> str:
    digest = hashlib.sha256()
    digest.update(payload)
    return digest.hexdigest()


def decode_base64(payload: str) -> ArtifactPayload:
    data = base64.b64decode(payload.encode("utf-8"))
    return ArtifactPayload(data=data, checksum=_compute_checksum(data))


def fetch_artifact(url: str, expected_checksum: str | None = None, timeout_s: int = 20) -> ArtifactPayload:
    request = Request(url, headers={"Accept": "*/*"})
    with urlopen(request, timeout=timeout_s) as response:
        data = response.read()
    checksum = _compute_checksum(data)
    if expected_checksum and checksum != expected_checksum:
        raise ValueError("Artifact checksum mismatch")
    return ArtifactPayload(data=data, checksum=checksum)


def serialize_metadata(metadata: dict) -> str:
    return json.dumps(metadata, sort_keys=True)
