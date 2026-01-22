import { useState } from "react";
import { createRiskLimitSet, type RiskLimitSet } from "../../services/rl_agent";

type RiskLimitsFormProps = {
  onCreated?: (limit: RiskLimitSet) => void;
};

export default function RiskLimitsForm({ onCreated }: RiskLimitsFormProps) {
  const [name, setName] = useState("");
  const [maxPositionSize, setMaxPositionSize] = useState("1");
  const [leverageCap, setLeverageCap] = useState("3");
  const [maxDailyLoss, setMaxDailyLoss] = useState("500");
  const [maxDrawdown, setMaxDrawdown] = useState("800");
  const [maxOpenPositions, setMaxOpenPositions] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const created = await createRiskLimitSet({
        name: name.trim() || `Limits ${new Date().toLocaleDateString()}`,
        maxPositionSize: Number(maxPositionSize),
        leverageCap: Number(leverageCap),
        maxDailyLoss: Number(maxDailyLoss),
        maxDrawdown: Number(maxDrawdown),
        maxOpenPositions: Number(maxOpenPositions),
      });
      onCreated?.(created);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create risk limits.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="section-stack" onSubmit={onSubmit}>
      <div className="form-grid">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Gold Day Session" />
        </label>
        <label>
          Max Position Size
          <input
            type="number"
            step="0.01"
            value={maxPositionSize}
            onChange={(event) => setMaxPositionSize(event.target.value)}
          />
        </label>
        <label>
          Leverage Cap
          <input type="number" value={leverageCap} onChange={(event) => setLeverageCap(event.target.value)} />
        </label>
        <label>
          Max Daily Loss
          <input type="number" value={maxDailyLoss} onChange={(event) => setMaxDailyLoss(event.target.value)} />
        </label>
        <label>
          Max Drawdown
          <input type="number" value={maxDrawdown} onChange={(event) => setMaxDrawdown(event.target.value)} />
        </label>
        <label>
          Max Open Positions
          <input
            type="number"
            value={maxOpenPositions}
            onChange={(event) => setMaxOpenPositions(event.target.value)}
          />
        </label>
      </div>
      {error ? <div className="inline-muted">{error}</div> : null}
      <div className="action-row">
        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Create Risk Limit Set"}
        </button>
      </div>
    </form>
  );
}
