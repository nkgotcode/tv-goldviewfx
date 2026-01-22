import pytest
from pydantic import ValidationError

from schemas import InferenceRequest


def test_inference_request_rejects_invalid_pair():
    payload = {
        "pair": "INVALID",
        "market": {"pair": "INVALID", "candles": []},
    }

    with pytest.raises(ValidationError):
        InferenceRequest(**payload)
