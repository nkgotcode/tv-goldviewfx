import base64
import pytest

import models.artifact_loader as artifact_loader


class _DummyResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return b"artifact-bytes"


def test_decode_base64_returns_checksum():
    payload = base64.b64encode(b"artifact-bytes").decode("utf-8")
    decoded = artifact_loader.decode_base64(payload)

    assert decoded.data == b"artifact-bytes"
    assert decoded.checksum is not None


def test_fetch_artifact_checksum_mismatch(monkeypatch):
    monkeypatch.setattr(artifact_loader, "urlopen", lambda *_args, **_kwargs: _DummyResponse())

    with pytest.raises(ValueError, match="Artifact checksum mismatch"):
        artifact_loader.fetch_artifact("http://example.com/artifact", expected_checksum="bad-checksum")
