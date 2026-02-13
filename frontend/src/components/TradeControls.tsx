"use client";

import { useEffect, useState } from "react";
import { fetchAgentConfig, updateAgentConfig, type AgentConfig } from "../services/ops";

export default function TradeControls() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await fetchAgentConfig();
        if (mounted) setConfig(data);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load trade configuration.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="empty">Loading trade controls…</div>;
  }

  if (error) {
    return <div className="empty">{error}</div>;
  }

  if (!config) {
    return <div className="empty">Trade configuration unavailable.</div>;
  }

  const updateConfig = async (payload: Partial<AgentConfig>) => {
    setMessage(null);
    const updated = await updateAgentConfig(payload);
    setConfig(updated);
    setMessage("Configuration updated.");
  };

  const buildPayload = () => ({
    enabled: config.enabled,
    mode: config.mode,
    max_position_size: config.max_position_size,
    daily_loss_limit: config.daily_loss_limit,
    allowed_instruments: config.allowed_instruments,
    kill_switch: config.kill_switch,
    min_confidence_score: config.min_confidence_score,
    allowed_source_ids: config.allowed_source_ids,
    promotion_required: config.promotion_required,
    promotion_min_trades: config.promotion_min_trades,
    promotion_min_win_rate: config.promotion_min_win_rate,
    promotion_min_net_pnl: config.promotion_min_net_pnl,
    promotion_max_drawdown: config.promotion_max_drawdown,
  });

  const toggleMode = async () => {
    if (config.mode === "paper") {
      const confirmed = window.confirm("Switch to LIVE trading mode?");
      if (!confirmed) return;
      await updateConfig({ mode: "live" });
    } else {
      await updateConfig({ mode: "paper" });
    }
  };

  const toggleKillSwitch = async () => {
    await updateConfig({ kill_switch: !config.kill_switch });
  };

  const togglePromotionGate = async () => {
    await updateConfig({ promotion_required: !config.promotion_required });
  };

  return (
    <section className="table-card">
      <h3>Trade Controls</h3>
      <p>Control paper/live execution, safety gates, and signal source policy.</p>
      <div className="control-grid">
        <div className="control-row">
          <label>Agent Enabled</label>
          <button type="button" className="secondary" onClick={() => updateConfig({ enabled: !config.enabled })}>
            {config.enabled ? "Disable Agent" : "Enable Agent"}
          </button>
        </div>
        <div className="control-row">
          <label>Mode</label>
          <button type="button" className="secondary" onClick={toggleMode}>
            {config.mode === "paper" ? "Switch to Live" : "Switch to Paper"}
          </button>
        </div>
        <div className="control-row">
          <label>Kill Switch</label>
          <button type="button" className="secondary" onClick={toggleKillSwitch}>
            {config.kill_switch ? "Disable" : "Enable"}
          </button>
        </div>
        <div className="control-row">
          <label>Max Position Size</label>
          <input
            type="number"
            value={config.max_position_size}
            onChange={(event) =>
              setConfig({ ...config, max_position_size: Number(event.target.value) })
            }
          />
        </div>
        <div className="control-row">
          <label>Daily Loss Limit</label>
          <input
            type="number"
            value={config.daily_loss_limit}
            onChange={(event) =>
              setConfig({ ...config, daily_loss_limit: Number(event.target.value) })
            }
          />
        </div>
        <div className="control-row">
          <label>Min Confidence</label>
          <input
            value={config.min_confidence_score ?? 0}
            onChange={(event) =>
              setConfig({ ...config, min_confidence_score: Number(event.target.value) })
            }
          />
        </div>
        <div className="control-row">
          <label>Allowed Instruments</label>
          <textarea
            value={(config.allowed_instruments ?? []).join(",")}
            onChange={(event) =>
              setConfig({
                ...config,
                allowed_instruments: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
            placeholder="GOLD-USDT, XAUTUSDT"
          />
        </div>
        <div className="control-row">
          <label>Allowed Sources</label>
          <textarea
            value={(config.allowed_source_ids ?? []).join(",")}
            onChange={(event) =>
              setConfig({
                ...config,
                allowed_source_ids: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
            placeholder="UUID list"
          />
        </div>
        <div className="control-row">
          <label>Promotion Gate</label>
          <button type="button" className="secondary" onClick={togglePromotionGate}>
            {config.promotion_required ? "Disable" : "Enable"}
          </button>
        </div>
        <div className="control-row">
          <label>Min Trades</label>
          <input
            value={config.promotion_min_trades ?? 0}
            onChange={(event) =>
              setConfig({ ...config, promotion_min_trades: Number(event.target.value) })
            }
          />
        </div>
        <div className="control-row">
          <label>Min Win Rate</label>
          <input
            value={config.promotion_min_win_rate ?? 0}
            onChange={(event) =>
              setConfig({ ...config, promotion_min_win_rate: Number(event.target.value) })
            }
          />
        </div>
        <div className="control-row">
          <label>Min Net PnL</label>
          <input
            value={config.promotion_min_net_pnl ?? 0}
            onChange={(event) =>
              setConfig({ ...config, promotion_min_net_pnl: Number(event.target.value) })
            }
          />
        </div>
        <div className="control-row">
          <label>Max Drawdown</label>
          <input
            value={config.promotion_max_drawdown ?? 0}
            onChange={(event) =>
              setConfig({ ...config, promotion_max_drawdown: Number(event.target.value) })
            }
          />
        </div>
      </div>
      <div className="control-actions">
        <button type="button" className="primary" onClick={() => updateConfig(buildPayload())}>
          Save Controls
        </button>
      </div>
      {message ? <div className="inline-muted">{message}</div> : null}
    </section>
  );
}
