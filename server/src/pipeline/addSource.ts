import { pool } from '../db/pool';

// Usage: npm run add-source -- "Library events" https://example.org/events.ics [--auto-approve]
async function main() {
  const [name, url, flag] = process.argv.slice(2);
  if (!name || !url) {
    console.error('Usage: npm run add-source -- "<name>" <ics-url> [--auto-approve]');
    process.exitCode = 1;
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO sources (name, type, url, auto_approve) VALUES ($1, 'ical', $2, $3) RETURNING id`,
    [name, url, flag === '--auto-approve']
  );
  console.log(`added source #${rows[0].id}: ${name}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
