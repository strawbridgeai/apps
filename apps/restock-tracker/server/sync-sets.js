#!/usr/bin/env node
// Manual/one-off runner for the catalog sync the service performs on its own
// schedule (set-sync.js). Useful for two things: `--dry-run` to see exactly
// which upstream sets the filters accept or reject without touching the DB,
// and a forced immediate run right after a release, instead of waiting out
// the 6-hour interval.
//
//   node server/sync-sets.js --dry-run     # decide nothing, print everything
//   node server/sync-sets.js               # real run
//   node server/sync-sets.js --status      # last run + catalog counts
//
// Run it as the service user so the SQLite files keep their ownership:
//   sudo -u restocktracker DATA_DIR=/var/lib/restock-tracker/data \
//     node /var/lib/restock-tracker/app/sync-sets.js
const { syncSets, syncStatus } = require('./set-sync.js');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

if (args.includes('--status')) {
  console.log(JSON.stringify(syncStatus(), null, 2));
  process.exit(0);
}

syncSets({ dryRun, verbose: true }).then((summary) => {
  console.log('');
  console.log(`${dryRun ? '[dry run] ' : ''}evaluated ${summary.evaluated} upstream sets in ${summary.durationMs}ms`);
  console.log(`  detail fetches: ${summary.fetched}${summary.deferred ? ` (${summary.deferred} deferred to next run)` : ''}`);
  console.log(`  rejected: ${summary.rejected}`);
  console.log(`  relinked: ${summary.updated.length}${summary.updated.length ? ` (${summary.updated.join(', ')})` : ''}`);
  console.log(`  ${dryRun ? 'would add' : 'added'}: ${summary.added.length}`);
  for (const s of summary.added) console.log(`    + ${s.id} - ${s.name} (${s.series}, ${s.releaseDate})`);
  if (!summary.ok) console.log(`  ERROR: ${summary.error}`);
  process.exit(summary.ok ? 0 : 1);
});
