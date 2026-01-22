import Layout from "../../../components/Layout";
import { fetchTradeDetail } from "../../../services/api";

export default async function TradeDetailPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const { id } = await Promise.resolve(params);
  const trade = await fetchTradeDetail(id);

  return (
    <Layout>
      <section className="hero">
        <h1>Trade Detail</h1>
        <p>{trade.instrument} • {trade.status}</p>
      </section>
      <section className="card">
        <p>Quantity: {trade.quantity}</p>
        <p>Mode: {trade.mode}</p>
        <p>Created: {trade.created_at}</p>
      </section>
    </Layout>
  );
}
