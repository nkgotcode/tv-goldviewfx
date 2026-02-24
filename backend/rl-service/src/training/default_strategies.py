"""
Default strategies (day-1 baselines) – institutional spec 12.
Strategy A: EMA Trend (bar-based)
Strategy B: Bollinger Mean Reversion
Strategy C: Funding-aware overlay
"""

from __future__ import annotations

from typing import Any

# Strategy A: EMA Trend (bar-based)
# Timeframe: 1m; EMA fast: 20, EMA slow: 100; stop: 1.5×ATR(14), take profit: 3.0×ATR(14);
# Sizing: risk 2% equity per trade (capped by max notional)
STRATEGY_EMA_TREND: dict[str, Any] = {
    "id": "ema_trend",
    "label": "EMA Trend",
    "timeframe": "1m",
    "ema_fast": 20,
    "ema_slow": 100,
    "atr_period": 14,
    "stop_atr_mult": 1.5,
    "take_profit_atr_mult": 3.0,
    "risk_pct_equity_per_trade": 0.02,
    "max_notional_pct_cap": True,
}

# Strategy B: Bollinger Mean Reversion
# Timeframe: 5m; BB period: 20, std: 2.0;
# Entry: close outside band + RSI filter (RSI<30 long / RSI>70 short); exit: mid-band cross;
# Leverage cap: 2x
STRATEGY_BOLLINGER_MEAN_REV: dict[str, Any] = {
    "id": "bollinger_mean_rev",
    "label": "Bollinger Mean Reversion",
    "timeframe": "5m",
    "bb_period": 20,
    "bb_std": 2.0,
    "rsi_period": 14,
    "rsi_long_threshold": 30,
    "rsi_short_threshold": 70,
    "leverage_cap": 2.0,
}

# Strategy C: Funding-aware overlay
# Reduce exposure against the dominant funding direction:
# high positive funding → reduce longs, prefer shorts; high negative funding → reduce shorts, prefer longs
STRATEGY_FUNDING_OVERLAY: dict[str, Any] = {
    "id": "funding_overlay",
    "label": "Funding-aware overlay",
    "timeframe": "1m",
    "funding_threshold_positive": 0.0001,
    "funding_threshold_negative": -0.0001,
    "exposure_reduction_factor": 0.5,
}

DEFAULT_STRATEGIES: list[dict[str, Any]] = [
    STRATEGY_EMA_TREND,
    STRATEGY_BOLLINGER_MEAN_REV,
    STRATEGY_FUNDING_OVERLAY,
]


def get_strategy_by_id(strategy_id: str) -> dict[str, Any] | None:
    for s in DEFAULT_STRATEGIES:
        if s.get("id") == strategy_id:
            return s
    return None
