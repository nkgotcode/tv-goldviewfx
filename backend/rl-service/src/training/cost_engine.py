"""
Cost engine: apply maker/taker fees per fill, funding at funding timestamps.
Track separately: gross PnL, fees, funding, slippage (estimated vs fill model).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FillCost:
    """Cost applied to a single fill."""

    notional: float
    side: str  # "buy" | "sell"
    is_maker: bool
    maker_fee_bps: float
    taker_fee_bps: float
    slippage_bps: float

    @property
    def fee_bps(self) -> float:
        return self.maker_fee_bps if self.is_maker else self.taker_fee_bps

    @property
    def fee(self) -> float:
        return self.notional * (self.fee_bps / 10_000.0)

    @property
    def slippage(self) -> float:
        return self.notional * (self.slippage_bps / 10_000.0)

    @property
    def total_cost(self) -> float:
        return self.fee + self.slippage


@dataclass
class FundingTransfer:
    """Funding payment at a funding timestamp."""

    position_size: float  # signed: long > 0, short < 0
    mark_price: float
    funding_rate: float
    payment: float  # position_size * mark_price * funding_rate (signed)


@dataclass
class CostEngineResult:
    """Aggregated cost attribution for a backtest or eval window."""

    gross_pnl: float = 0.0
    fees: float = 0.0
    funding: float = 0.0
    slippage: float = 0.0
    net_pnl: float = 0.0
    fills: list[FillCost] = field(default_factory=list)
    funding_transfers: list[FundingTransfer] = field(default_factory=list)

    def add_fill(self, fill: FillCost) -> None:
        self.fills.append(fill)
        self.fees += fill.fee
        self.slippage += fill.slippage

    def add_funding(self, transfer: FundingTransfer) -> None:
        self.funding_transfers.append(transfer)
        self.funding += transfer.payment

    def set_gross_pnl(self, gross_pnl: float) -> None:
        self.gross_pnl = gross_pnl
        self.net_pnl = gross_pnl - self.fees - self.funding - self.slippage

    def recompute_net(self) -> None:
        self.net_pnl = self.gross_pnl - self.fees - self.funding - self.slippage


def apply_fill_cost(
    notional: float,
    side: str,
    is_maker: bool,
    maker_fee_bps: float = 2.0,
    taker_fee_bps: float = 4.0,
    slippage_bps: float = 1.0,
) -> FillCost:
    """Create FillCost for a single fill."""
    return FillCost(
        notional=notional,
        side=side,
        is_maker=is_maker,
        maker_fee_bps=maker_fee_bps,
        taker_fee_bps=taker_fee_bps,
        slippage_bps=slippage_bps,
    )


def funding_payment(position_size: float, mark_price: float, funding_rate: float) -> FundingTransfer:
    """Compute funding payment at a funding timestamp."""
    payment = position_size * mark_price * funding_rate
    return FundingTransfer(
        position_size=position_size,
        mark_price=mark_price,
        funding_rate=funding_rate,
        payment=payment,
    )


def cost_engine_from_backtest_stats(stats: dict[str, Any]) -> CostEngineResult:
    """
    Build CostEngineResult from Nautilus backtest stats when available.
    Falls back to zero costs if stats do not expose fee/funding breakdown.
    """
    result = CostEngineResult()
    if not stats:
        return result
    # Nautilus may expose total_fees, total_funding, etc.
    result.gross_pnl = float(stats.get("total_pnl", 0.0) or 0.0)
    result.fees = float(stats.get("total_fees", 0.0) or 0.0)
    result.funding = float(stats.get("total_funding", 0.0) or 0.0)
    result.slippage = float(stats.get("slippage", 0.0) or 0.0)
    result.recompute_net()
    return result
