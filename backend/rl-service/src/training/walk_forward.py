from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WalkForwardFold:
    fold: int
    train_start: int
    train_end: int
    test_start: int
    test_end: int


def build_walk_forward_folds(
    total_windows: int,
    folds: int,
    purge_bars: int = 0,
    embargo_bars: int = 0,
    min_train_bars: int | None = None,
    strict: bool = True,
) -> list[WalkForwardFold]:
    if total_windows <= 1:
        if strict:
            raise ValueError("Not enough windows for walk-forward evaluation")
        return []
    if folds <= 0:
        raise ValueError("folds must be positive")
    purge = max(0, purge_bars)
    embargo = max(0, embargo_bars)
    train_min = max(1, min_train_bars or total_windows // (folds + 1))

    available = total_windows - train_min
    if available <= 0:
        if strict:
            raise ValueError("Insufficient windows for requested min_train_bars")
        return []

    test_span = max(1, available // folds)
    result: list[WalkForwardFold] = []
    train_end = train_min
    for fold in range(1, folds + 1):
        test_start = train_end + purge
        test_end = min(total_windows, test_start + test_span)
        if test_start >= test_end:
            break
        result.append(
            WalkForwardFold(
                fold=fold,
                train_start=0,
                train_end=train_end,
                test_start=test_start,
                test_end=test_end,
            )
        )
        train_end = min(total_windows, test_end + embargo)
        if train_end >= total_windows:
            break

    if strict and len(result) < folds:
        raise ValueError("Unable to construct requested walk-forward folds")
    return result
