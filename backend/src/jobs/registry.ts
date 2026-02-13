import { registerJob } from "./scheduler";
import { runTradingViewSync } from "../services/tradingview_sync";
import { runEnrichmentJob } from "./enrichment_job";
import { runTelegramIngestJob } from "./telegram_ingest_job";
import { runBingxMarketDataJob } from "./bingx_market_data";
import { runDataSourceMonitor } from "./data_source_monitor";
import { runTopicClusteringJob } from "./topic_clustering";
import { runNewsIngestJob } from "./news_ingest_job";
import { runOcrJob } from "./ocr_job";
import { runDataGapMonitorJob } from "./data_gap_monitor";
import { runTradeReconciliationJob } from "./trade_reconciliation";
import { runRetryQueueJob } from "./retry_queue";
import { runOnlineLearningJob } from "./online_learning_job";

export function registerCoreJobs() {
  const intervalMinutes = Number.parseInt(process.env.TRADINGVIEW_SYNC_INTERVAL_MIN ?? "60", 10);
  registerJob({
    name: "tradingview-sync",
    intervalMs: intervalMinutes * 60 * 1000,
    handler: () => runTradingViewSync({ trigger: "schedule" }),
  });

  const enrichmentInterval = Number.parseInt(process.env.ENRICHMENT_INTERVAL_MIN ?? "120", 10);
  registerJob({
    name: "enrichment-run",
    intervalMs: enrichmentInterval * 60 * 1000,
    handler: () => runEnrichmentJob(),
  });

  const telegramInterval = Number.parseInt(process.env.TELEGRAM_INGEST_INTERVAL_MIN ?? "60", 10);
  registerJob({
    name: "telegram-ingest",
    intervalMs: telegramInterval * 60 * 1000,
    handler: () => runTelegramIngestJob(),
  });

  const bingxInterval = Number.parseInt(process.env.BINGX_MARKET_DATA_INTERVAL_MIN ?? "1", 10);
  registerJob({
    name: "bingx-market-data",
    intervalMs: bingxInterval * 60 * 1000,
    handler: () => runBingxMarketDataJob(),
  });

  const topicInterval = Number.parseInt(process.env.TOPIC_CLUSTER_INTERVAL_MIN ?? "720", 10);
  registerJob({
    name: "topic-clustering",
    intervalMs: topicInterval * 60 * 1000,
    handler: () => runTopicClusteringJob(),
  });

  const newsInterval = Number.parseInt(process.env.NEWS_INGEST_INTERVAL_MIN ?? "360", 10);
  registerJob({
    name: "news-ingest",
    intervalMs: newsInterval * 60 * 1000,
    handler: () => runNewsIngestJob(),
  });

  const ocrInterval = Number.parseInt(process.env.OCR_INTERVAL_MIN ?? "360", 10);
  registerJob({
    name: "ocr-enrichment",
    intervalMs: ocrInterval * 60 * 1000,
    handler: () => runOcrJob(),
  });

  const dataSourceInterval = Number.parseInt(process.env.DATA_SOURCE_MONITOR_INTERVAL_MIN ?? "5", 10);
  registerJob({
    name: "data-source-monitor",
    intervalMs: dataSourceInterval * 60 * 1000,
    handler: () => runDataSourceMonitor(),
  });

  const gapInterval = Number.parseInt(process.env.DATA_GAP_MONITOR_INTERVAL_MIN ?? "15", 10);
  registerJob({
    name: "data-gap-monitor",
    intervalMs: gapInterval * 60 * 1000,
    handler: () => runDataGapMonitorJob(),
  });

  const reconcileInterval = Number.parseInt(process.env.TRADE_RECONCILE_INTERVAL_MIN ?? "5", 10);
  registerJob({
    name: "trade-reconciliation",
    intervalMs: reconcileInterval * 60 * 1000,
    handler: () => runTradeReconciliationJob(),
  });

  const retryIntervalSec = Number.parseInt(process.env.RETRY_QUEUE_INTERVAL_SEC ?? "30", 10);
  registerJob({
    name: "retry-queue",
    intervalMs: retryIntervalSec * 1000,
    handler: () => runRetryQueueJob(),
  });

  const learningInterval = Number.parseInt(process.env.RL_ONLINE_LEARNING_INTERVAL_MIN ?? "60", 10);
  registerJob({
    name: "online-learning",
    intervalMs: learningInterval * 60 * 1000,
    handler: () => runOnlineLearningJob(),
  });
}
