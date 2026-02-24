/**
 * Live trading safety defaults (institutional spec 9.2).
 * Hard risk limits: max leverage, position notional, exposure, daily loss, drawdown, kill switch.
 */

export const LIVE_SAFETY_DEFAULTS = {
  /** Max leverage 3x */
  MAX_LEVERAGE: 3,
  /** Max position notional: 10% equity per instrument */
  MAX_POSITION_NOTIONAL_PCT_EQUITY: 0.1,
  /** Max total exposure: 30% equity across all instruments */
  MAX_TOTAL_EXPOSURE_PCT_EQUITY: 0.3,
  /** Daily loss limit: 2% equity → auto-disable trading */
  DAILY_LOSS_LIMIT_PCT_EQUITY: 0.02,
  /** Max drawdown (24h peak): 5% → auto-disable */
  MAX_DRAWDOWN_24H_PCT: 0.05,
  /** Kill switch: cancel orders + flatten */
  KILL_SWITCH_FLATTEN: true,
  /** Prefer post-only limit entries; markets only for emergency exits */
  PREFER_POST_ONLY_LIMIT: true,
} as const;

export type LiveSafetyDefaults = typeof LIVE_SAFETY_DEFAULTS;
