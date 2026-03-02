# Evaluation Failure Taxonomy (Nautilus + Walk-Forward)

This taxonomy summarizes dominant fail patterns observed in the current evaluation pipeline (backend + RL service), including explicit reason codes now emitted in metadata.

## 1) Dataset/window construction failures

- `no_evaluation_windows_generated`
  - Trigger: effective `window_size` is larger than available rows after feature build/downsampling.
  - Typical symptoms: `No evaluation windows generated` error before Nautilus run.
  - Remediation: widen period, reduce `window_size`, or enable autoscaled window/stride.

- `max_parameters_exceeded` (upstream fetch/build pressure)
  - Trigger: overly large feature requests can exceed DB parameter limits.
  - Remediation: split period into smaller windows; keep autosizing/capped windows enabled.

## 2) Interval matrix failures (base + context intervals)

- `unsupported_interval`
  - Trigger: interval not supported by resampling logic.
  - Remediation: use minute/hour/day intervals.

- `interval_shorter_than_base`
  - Trigger: context interval smaller than base interval.
  - Remediation: use smaller base interval or remove shorter contexts.

- `interval_not_multiple_of_base`
  - Trigger: context interval is not a clean multiple of base interval.
  - Remediation: choose harmonic intervals (e.g. 5m -> 15m, 1h, 4h).

- `insufficient_rows`
  - Trigger: too few rows for interval-level backtest (`< max(window+1,10)`).
  - Remediation: widen period, reduce folds, reduce window.

- `backtest_failed`
  - Trigger: Nautilus runtime failure for specific interval/strategy/venue combination.
  - Remediation: inspect per-interval diagnostics and rerun with narrower matrix.

## 3) Walk-forward failures

- `fold_execution_failed`
  - Trigger: fold-specific matrix execution fails and strict mode is disabled.
  - Remediation: inspect fold diagnostics; reduce fold count or relax constraints.

- Fold-level `insufficient_rows`
  - Trigger: fold test slice too short for configured `window_size`.
  - Remediation: reduce folds, reduce `min_train_bars`, widen period.

- Hard-fail conditions (strict mode)
  - Trigger: no valid fold ranges or fold execution error with `strict=true`.
  - Remediation: rerun with `strict=false` to collect diagnostics and adjust config.

## 4) Promotion gate failures (not engine failures)

- `insufficient_trade_count`
- `win_rate_below_threshold`
- `net_pnl_non_positive`
- `drawdown_too_high`

These indicate evaluation completed but failed promotion criteria. They are not infrastructure failures; remediation is strategy/config tuning or wider sampling windows.

## 5) RL SB3 readiness-specific failures

- Missing artifact when `rl_sb3_market` is selected.
- Missing `feature_schema_fingerprint` for SB3 strategy runs.
- Under-sampled runs failing minimum trade threshold checks.

Use metadata `sb3_readiness` to determine gating status and required fixes before promotion.
