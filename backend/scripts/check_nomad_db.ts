import postgres from "postgres";

const url = "postgres://bingx:bingx@100.83.150.39:5433/bingx?sslmode=disable";

async function run() {
    try {
        const sql = postgres(url, { connect_timeout: 5 });
        const counts = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;

        const tables = counts.map(r => r.table_name);

        for (const table of tables) {
            if (table.includes('candle') || table.includes('market_data')) {
                const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`;
                console.log(`\nTable: ${table}`);
                console.log(`Columns: ${columns.map(c => c.column_name).join(', ')}`);

                let timeCol = columns.find(c => ['time', 'ts', 'timestamp', 'open_time', 'start_time'].includes(c.column_name))?.column_name || 'time';

                let query = `SELECT pair, interval, count(*) as count, min(${timeCol}) as first_candle, max(${timeCol}) as last_candle FROM ${table} GROUP BY pair, interval ORDER BY count DESC LIMIT 20`;
                try {
                    const stats = await sql.unsafe(query);
                    console.table(stats);
                } catch (e) {
                    console.log(`Error querying ${table}: ${e.message}`);
                }
            }
        }

        if (tables.includes('retry_queue')) {
            const jobStats = await sql.unsafe(`SELECT job_type, status, count(*) FROM retry_queue GROUP BY job_type, status ORDER BY job_type`);
            console.log(`\n============================\nretry_queue statistics:\n============================`);
            console.table(jobStats);
        }

        process.exit(0);
    } catch (e) {
        console.error(`Failed: ${e.message}`);
        process.exit(1);
    }
}

run();
