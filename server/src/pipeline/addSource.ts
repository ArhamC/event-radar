import { pool } from '../db/pool';
import { ADAPTERS } from './run';

// Usage: npm run add-source -- "Library events" https://example.org/events.ics [--type=ical] [--auto-approve]
// Types: ical (any .ics feed), western (uwo.ca events JSON), tourism-london (londontourism.ca),
//        eventbrite (organizer page URL or ID; needs EVENTBRITE_TOKEN)
async function main() {
  const args = process.argv.slice(2);
  const [name, url] = args.filter((a) => !a.startsWith('--'));
  const type = args.find((a) => a.startsWith('--type='))?.slice('--type='.length) ?? 'ical';
  if (!name || !url || !ADAPTERS[type]) {
    console.error(`Usage: npm run add-source -- "<name>" <url> [--type=${Object.keys(ADAPTERS).join('|')}] [--auto-approve]`);
    process.exitCode = 1;
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO sources (name, type, url, auto_approve) VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, type, url, args.includes('--auto-approve')]
  );
  console.log(`added ${type} source #${rows[0].id}: ${name}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
