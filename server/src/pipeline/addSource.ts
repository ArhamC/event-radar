import { pool } from '../db/pool';
import { ADAPTERS } from './run';

// Usage: npm run add-source -- "<name>" <url> [--type=ical] [--venue="Name" --address="123 St, London, ON"] [--auto-approve]
// Types: ical (any .ics feed), western (uwo.ca events JSON), tourism-london (londontourism.ca),
//        eventbrite (organizer page URL or ID; needs EVENTBRITE_TOKEN), lpl (London Public Library),
//        squarespace (a Squarespace events page), wix-events (a Wix Events page),
//        london-music-hall (londonmusichall.com, incl. Rum Runners)
// --venue/--address: the venue for events that don't carry their own location (single-venue sites)
async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const [name, url] = args.filter((a) => !a.startsWith('--'));
  const type = flag('type') ?? 'ical';
  if (!name || !url || !ADAPTERS[type]) {
    console.error(`Usage: npm run add-source -- "<name>" <url> [--type=${Object.keys(ADAPTERS).join('|')}] [--venue=... --address=...] [--auto-approve]`);
    process.exitCode = 1;
    return;
  }
  const config = { ...(flag('venue') && { venueName: flag('venue') }), ...(flag('address') && { address: flag('address') }) };
  const { rows } = await pool.query(
    `INSERT INTO sources (name, type, url, auto_approve, config) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, type, url, args.includes('--auto-approve'), config]
  );
  console.log(`added ${type} source #${rows[0].id}: ${name}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
