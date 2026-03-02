import postgres from "postgres";

const url = "postgres://bingx:bingx@100.83.150.39:5433/bingx?sslmode=disable";

async function run() {
    try {
        const sql = postgres(url, { connect_timeout: 5 });

        // Querying all intervals across bingx_candles breakdown by pair
        const candleStats = await sql`
        SELECT pair, interval, count(*) as total_candles, min(open_time) as earliest_candle, max(open_time) as latest_candle 
        FROM bingx_candles 
        GROUP BY pair, interval 
        ORDER BY 
            pair ASC,
            CASE interval
                WHEN '1m' THEN 1
                WHEN '3m' THEN 2
                WHEN '5m' THEN 3
                WHEN '15m' THEN 4
                WHEN '30m' THEN 5
                WHEN '1h' THEN 6
                WHEN '2h' THEN 7
                WHEN '4h' THEN 8
                WHEN '6h' THEN 9
                WHEN '12h' THEN 10
                WHEN '1d' THEN 11
                WHEN '3d' THEN 12
                WHEN '1w' THEN 13
                WHEN '1M' THEN 14
                ELSE 99
            END ASC
        `;

        console.log(`\n============================\n[${new Date().toISOString()}] bingx_candles Summary:\n============================`);
        console.table(candleStats);

        const summaries = [
            { table: 'bingx_trades', timeCol: 'executed_at' },
            { table: 'bingx_funding_rates', timeCol: 'funding_time' },
            { table: 'bingx_open_interest', timeCol: 'captured_at' },
            { table: 'bingx_mark_index_prices', timeCol: 'captured_at' },
            { table: 'bingx_tickers', timeCol: 'captured_at' },
        ];

        for (const s of summaries) {
            try {
                const stats = await sql.unsafe(`
                    SELECT pair, count(*) as count, min(${s.timeCol}) as earliest_record, max(${s.timeCol}) as latest_record 
                    FROM ${s.table} 
                    GROUP BY pair 
                    ORDER BY pair ASC
                `);
                console.log(`\n============================\n${s.table} Summary:\n============================`);
                console.table(stats);
            } catch (e) {
                console.log(`Failed to query ${s.table}: ${e.message}`);
            }
        }

        process.exit(0);
    } catch (e) {
        console.error(`Failed: ${e.message}`);
        process.exit(1);
    }
}

run();
