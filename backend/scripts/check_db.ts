import postgres from "postgres";

const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

async function run() {
  try {
    const counts = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log("Tables:", counts.map(r => r.table_name));

    if (counts.some(r => r.table_name === 'candles' || r.table_name === 'market_candles' || r.table_name === 'bingx_candles')) {
      const tableName = counts.find(r => r.table_name.includes('candle')).table_name;
      const candleStats = await sql.unsafe(`
        SELECT pair, interval, COUNT(*) as cnt, MIN(start_time) as first_candle, MAX(start_time) as last_candle 
        FROM ${tableName} 
        GROUP BY pair, interval 
        ORDER BY pair, interval
      `);
      console.log(`\nTable ${tableName} Stats:`);
      console.table(candleStats);
    }
    
    // Check if there are ingestion jobs or ingest_metrics
    if (counts.some(r => r.table_name.includes('job') || r.table_name.includes('ingest'))) {
      const jobTable = counts.find(r => r.table_name.includes('job') || r.table_name.includes('ingest') || r.table_name.includes('ops')).table_name;
      console.log(`\nFound table loosely related to jobs: ${jobTable}`);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
