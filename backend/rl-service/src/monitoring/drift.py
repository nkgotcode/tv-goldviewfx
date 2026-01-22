from __future__ import annotations


def check_drift(baseline_value: float, current_value: float, threshold: float) -> dict[str, float | bool]:
    delta = current_value - baseline_value
    drifted = abs(delta) >= threshold
    return {"drifted": drifted, "delta": delta}
