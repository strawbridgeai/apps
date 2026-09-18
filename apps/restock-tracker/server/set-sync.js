// Keeps the set catalog current on its own. Sets used to be a one-time
// hardcoded seed (seed.js), so a release like the 30th anniversary sets
// simply never appeared until someone hand-edited the seed and redeployed -
// which is not a thing a restock app can afford, since the set you want on
// the radar is almost always the one that dropped this week.
//
// Source is TCGdex (api.tcgdex.net), chosen over api.pokemontcg.io because
// the latter has been answering 502 and, when it is up, lags new sets by
// weeks. TCGdex needs no API key, its /v2/en feed is English-only (so
// Japan-exclusive sets never enter the catalog), and it already carried both
// 30th sets on release day.
//
// What TCGdex does NOT carry is product/SKU data - it catalogs cards, not
// sealed goods - so `productTypes` for an auto-added set is a shape-based
// guess (see defaultProductTypes) that a human can correct in the DB later.
// Everything else (name, series, release date, card count) is upstream fact.
const { db, isoToHumanDate, getMeta, setMeta } = require('./db.js');

const UPSTREAM_BASE = (process.env.TCGDEX_BASE || 'https://api.tcgdex.net/v2/en').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number(process.env.SET_SYNC_TIMEOUT_MS || 15000);

// How far back the catalog reaches. Restocking a set released four years ago
// is not a real activity, and an unbounded window would put all 220 upstream
// sets (Base Set included) in a picker meant to be scanned by eye.
const WINDOW_MONTHS_BACK = Number(process.env.SET_SYNC_WINDOW_MONTHS || 36);
// Far enough ahead to catch an announced set, not so far that a rumored
// date years out clutters the picker.
const WINDOW_MONTHS_AHEAD = 18;

// Below this, a "set" is a promo sheet or an energy insert, not something
// that ships as sealed product anyone hunts. Counts total, not `official`:
// a freshly released premium product (30th Classic Collection) can sit at
// official=0 for a while before TCGdex finishes cataloging it.
const MIN_CARD_COUNT = 20;

// Pokémon TCG Pocket is a phone game. Its "sets" have no physical existence,
// so they can never be restocked - and upstream ships more of them than it
// does real expansions, which would swamp the picker.
const DIGITAL_SERIES = new Set(['tcgp']);
// Promo/misc/tie-in series: no standalone retail release to track.
const NON_RETAIL_SERIES = new Set(['misc', 'mc', 'tk', 'pop']);
// 'Gallery' and 'Energy' sets are catalog subsets of another set and a
// filler-card sheet respectively - neither is ever sold as its own sealed
// product. They currently fall out on the date window or the card count
// anyway ('Silver Tempest Trainer Gallery', 'Mega Evolution Energy'), which
// is luck rather than intent: a future one inside the window with 20+ cards
// would otherwise land in the picker as something to go hunt for.
const NON_RETAIL_NAME = /\bpromos?\b|black star|trainer kit|theme deck|\bgallery\b|\benerg(y|ies)\b|\bdeck$/i;

// Detail fetches are one request per never-before-seen upstream id. Steady
// state is 0-2 of those, but a first run (or an upstream id reshuffle) could
// want 200+, so spend a bounded amount per run and let the rest arrive on
// the next one rather than hammering a free API. The feed is walked
// newest-first (see syncSets) so the budget always covers the sets that can
// actually still be in the window.
const DETAIL_BUDGET = Number(process.env.SET_SYNC_DETAIL_BUDGET || 60);
const DETAIL_DELAY_MS = 150;

// An upstream set with no announced date yet ("TBA") is worth re-checking
// periodically, since that is exactly how a future set first shows up.
const UNDATED_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(path) {
  const res = await fetch(`${UPSTREAM_BASE}${path}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: 'application/json', 'user-agent': 'restock-radar/1.0 (+https://strawbridgeai.com)' },
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

// Local ids follow `{serieId}-{slug(name)}`, which is not a new convention -
// it is what every hand-written seed row already uses ('me-pitch-black',
// 'sv-white-flare', 'sv-151'). Deriving the same string is what lets a sync
// recognize the 15 seeded sets as already-present instead of inserting
// near-duplicates beside them.
const slug = (value) =>
  String(value).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const localIdFor = (serieId, name) => `${slug(serieId)}-${slug(name)}`;

// Deterministic pick from a fixed palette so a set keeps the same accent
// across re-syncs and across the two deploy targets. Hues are drawn from the
// same range the seeded accents use.
const ACCENT_PALETTE = [
  '#e1ae36', '#7cf5c4', '#c65bff', '#5bd6ff', '#ff6b6b', '#ffb703',
  '#78d7c7', '#8bb8ff', '#b9a0ff', '#ff9eb5', '#ffd166', '#ff7a45',
];
function accentFor(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

// Best guess from set size, since upstream has no SKU data. Main expansions
// ship the full booster lineup; the smaller special sets are typically
// box-only. Wrong guesses are cosmetic here - productTypes only populates
// the dropdown on the report form, and that field accepts any string.
function defaultProductTypes(cardCount) {
  return cardCount >= 100
    ? ['Booster Pack', 'Elite Trainer Box', 'Booster Bundle']
    : ['Elite Trainer Box', 'Booster Bundle', 'Mini Tin'];
}

function monthsFromNow(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Structural rejections are permanent facts about the set (it is a digital
// set, a promo sheet, too small) and stay cached forever. A date-window
// rejection is only true as of today, so it is re-decided on every run from
// the cached fields - no network needed.
function structuralRejection({ serieId, name, cardCount }) {
  if (DIGITAL_SERIES.has(serieId)) return 'digital-only series';
  if (NON_RETAIL_SERIES.has(serieId)) return 'non-retail series';
  if (NON_RETAIL_NAME.test(name)) return 'promo or non-retail product';
  if (!(cardCount >= MIN_CARD_COUNT)) return `only ${cardCount || 0} cards`;
  return null;
}

// The back edge of the window slides forward with time, so a set already
// older than it can never re-enter and its rejection is permanent - which is
// what retires the ~100 pre-2023 sets from being reconsidered every run. The
// other two are genuinely provisional: an undated set gets a date, and a set
// dated far out eventually comes close.
function dateRejection(releaseIso) {
  if (!releaseIso) return { reason: 'no release date announced yet', permanent: false };
  if (releaseIso < monthsFromNow(-WINDOW_MONTHS_BACK)) return { reason: `released before the ${WINDOW_MONTHS_BACK}-month window`, permanent: true };
  if (releaseIso > monthsFromNow(WINDOW_MONTHS_AHEAD)) return { reason: 'release date too far out', permanent: false };
  return null;
}

const selectLog = db.prepare('SELECT * FROM set_sync_log WHERE upstream_id = ?');
const upsertLog = db.prepare(`
  INSERT INTO set_sync_log (upstream_id, upstream_name, serie_id, serie_name, release_iso, card_count, verdict, reason, local_id, checked_at)
  VALUES (@upstreamId, @upstreamName, @serieId, @serieName, @releaseIso, @cardCount, @verdict, @reason, @localId, @checkedAt)
  ON CONFLICT(upstream_id) DO UPDATE SET
    upstream_name = excluded.upstream_name, serie_id = excluded.serie_id, serie_name = excluded.serie_name,
    release_iso = excluded.release_iso, card_count = excluded.card_count, verdict = excluded.verdict,
    reason = excluded.reason, local_id = excluded.local_id, checked_at = excluded.checked_at
`);
const selectSet = db.prepare('SELECT id, upstream_id, release_iso, source FROM pokemon_sets WHERE id = ?');
const insertSet = db.prepare(`
  INSERT INTO pokemon_sets (id, name, series, release_date, product_types, accent, release_iso, upstream_id, source, added_at, card_count)
  VALUES (@id, @name, @series, @releaseDate, @productTypes, @accent, @releaseIso, @upstreamId, 'tcgdex', @addedAt, @cardCount)
`);
// Reconciling an already-present set is deliberately split by who owns the
// row, because the first version of this reconciled everything and quietly
// moved White Flare and Black Bolt off their real US street date (July 18,
// 2025) onto upstream's 2025-07-17. Upstream dates are good enough to sort
// by and wrong often enough - by a day, around street dates - that they
// must not overwrite a date a human entered.
//
// So: the upstream link and card count are always recorded (they are the
// sync's own bookkeeping),
const linkUpstream = db.prepare('UPDATE pokemon_sets SET upstream_id = @upstreamId, card_count = @cardCount WHERE id = @id');
// a missing release_iso is filled in but never corrected (the WHERE clause
// is the guard, not the caller),
const backfillIso = db.prepare('UPDATE pokemon_sets SET release_iso = @releaseIso WHERE id = @id AND release_iso IS NULL');
// and dates are only kept current for rows the sync created itself, where
// there is no hand-entered value to lose and a delayed release still needs
// to be able to move.
const refreshOwnedDates = db.prepare("UPDATE pokemon_sets SET release_iso = @releaseIso, release_date = @releaseDate WHERE id = @id AND source = 'tcgdex'");

async function syncSets({ dryRun = false, verbose = false } = {}) {
  const startedAt = Date.now();
  const summary = { ok: true, added: [], updated: [], rejected: 0, evaluated: 0, fetched: 0, deferred: 0, error: null };
  const log = (...args) => { if (verbose) console.log(...args); };

  try {
    const upstreamSets = await getJson('/sets');
    if (!Array.isArray(upstreamSets)) throw new Error('unexpected /sets payload');

    // Newest-first. The feed arrives in chronological order starting at Base
    // Set (1999), and walking it that way spent the whole detail budget on
    // sets two decades outside the window while the actual new releases at
    // the tail were deferred to a later run - the one thing this sync exists
    // to catch same-day.
    for (const brief of [...upstreamSets].reverse()) {
      const upstreamId = String(brief?.id || '');
      if (!upstreamId) continue;
      summary.evaluated += 1;

      const cached = selectLog.get(upstreamId);
      // The brief listing already carries name + card count, enough to
      // dismiss the digital sets and promo sheets without ever asking for
      // detail - which is most of the feed.
      const briefCount = brief?.cardCount?.total ?? 0;
      const briefName = String(brief?.name || upstreamId);

      let record = cached;
      const cacheIsUsable =
        cached &&
        cached.verdict !== 'rejected-structural' &&
        (cached.release_iso || Date.now() - cached.checked_at < UNDATED_RECHECK_MS);

      if (cached?.verdict === 'rejected-structural') { summary.rejected += 1; continue; }

      if (!cacheIsUsable) {
        // Dismiss what the brief listing alone already disqualifies, so a
        // first run does not spend its detail budget on TCG Pocket sets.
        const earlyReject = NON_RETAIL_NAME.test(briefName) ? 'promo or non-retail product'
          : !(briefCount >= MIN_CARD_COUNT) ? `only ${briefCount} cards`
          : null;
        if (earlyReject) {
          if (!dryRun) upsertLog.run({
            upstreamId, upstreamName: briefName, serieId: null, serieName: null, releaseIso: null,
            cardCount: briefCount, verdict: 'rejected-structural', reason: earlyReject, localId: null, checkedAt: Date.now(),
          });
          summary.rejected += 1;
          log(`  skip  ${upstreamId} (${briefName}) - ${earlyReject}`);
          continue;
        }

        if (summary.fetched >= DETAIL_BUDGET) { summary.deferred += 1; continue; }
        let detail;
        try {
          detail = await getJson(`/sets/${encodeURIComponent(upstreamId)}`);
          summary.fetched += 1;
          await sleep(DETAIL_DELAY_MS);
        } catch (err) {
          // One unreachable set detail should not abandon the whole run, and
          // leaving it uncached means the next run retries it.
          log(`  warn  ${upstreamId} detail failed: ${err.message}`);
          continue;
        }

        record = {
          upstream_id: upstreamId,
          upstream_name: String(detail?.name || briefName),
          serie_id: detail?.serie?.id ? String(detail.serie.id) : null,
          serie_name: detail?.serie?.name ? String(detail.serie.name) : null,
          release_iso: /^\d{4}-\d{2}-\d{2}$/.test(String(detail?.releaseDate || '')) ? String(detail.releaseDate) : null,
          card_count: detail?.cardCount?.total ?? briefCount,
          checked_at: Date.now(),
        };

        const structural = structuralRejection({ serieId: record.serie_id, name: record.upstream_name, cardCount: record.card_count });
        if (structural) {
          if (!dryRun) upsertLog.run({ ...toLogParams(record), verdict: 'rejected-structural', reason: structural, localId: null });
          summary.rejected += 1;
          log(`  skip  ${upstreamId} (${record.upstream_name}) - ${structural}`);
          continue;
        }
      }

      if (!record.serie_id) { summary.rejected += 1; continue; }

      const dateReject = dateRejection(record.release_iso);
      if (dateReject) {
        if (!dryRun) upsertLog.run({
          ...toLogParams(record),
          verdict: dateReject.permanent ? 'rejected-structural' : 'rejected',
          reason: dateReject.reason,
          localId: null,
        });
        summary.rejected += 1;
        log(`  skip  ${upstreamId} (${record.upstream_name}) - ${dateReject.reason}`);
        continue;
      }

      const localId = localIdFor(record.serie_id, record.upstream_name);
      const existing = selectSet.get(localId);
      const releaseDate = isoToHumanDate(record.release_iso);

      if (existing) {
        const owned = existing.source === 'tcgdex';
        const changed = existing.upstream_id !== upstreamId
          || (owned && existing.release_iso !== record.release_iso)
          || (!owned && !existing.release_iso && record.release_iso);
        if (changed) {
          if (!dryRun) {
            db.transaction(() => {
              linkUpstream.run({ id: localId, upstreamId, cardCount: record.card_count });
              if (owned) refreshOwnedDates.run({ id: localId, releaseIso: record.release_iso, releaseDate });
              else backfillIso.run({ id: localId, releaseIso: record.release_iso });
            })();
          }
          summary.updated.push(localId);
          log(`  link  ${localId} <- ${upstreamId}${owned ? '' : ' (dates left as entered)'}`);
        }
        if (!dryRun) upsertLog.run({ ...toLogParams(record), verdict: 'existing', reason: 'already in catalog', localId });
        continue;
      }

      if (!dryRun) {
        db.transaction(() => {
          insertSet.run({
            id: localId,
            name: record.upstream_name,
            series: record.serie_name || record.serie_id,
            releaseDate,
            productTypes: JSON.stringify(defaultProductTypes(record.card_count)),
            accent: accentFor(localId),
            releaseIso: record.release_iso,
            upstreamId,
            addedAt: Date.now(),
            cardCount: record.card_count,
          });
          upsertLog.run({ ...toLogParams(record), verdict: 'added', reason: 'new set', localId });
        })();
      }
      summary.added.push({ id: localId, name: record.upstream_name, series: record.serie_name, releaseDate });
      console.log(`[set-sync] added ${localId} - ${record.upstream_name} (${record.serie_name}, ${releaseDate})`);
    }
  } catch (err) {
    summary.ok = false;
    summary.error = err.message;
    console.error(`[set-sync] run failed: ${err.message}`);
  }

  summary.durationMs = Date.now() - startedAt;
  if (!dryRun) {
    setMeta('set_sync_last_run_at', String(startedAt));
    setMeta('set_sync_last_status', summary.ok ? 'ok' : 'error');
    setMeta('set_sync_last_error', summary.error || '');
    setMeta('set_sync_last_added', String(summary.added.length));
    if (summary.ok) setMeta('set_sync_last_success_at', String(startedAt));
  }
  return summary;
}

function toLogParams(record) {
  return {
    upstreamId: record.upstream_id,
    upstreamName: record.upstream_name,
    serieId: record.serie_id,
    serieName: record.serie_name,
    releaseIso: record.release_iso,
    cardCount: record.card_count,
    checkedAt: record.checked_at,
  };
}

function syncStatus() {
  const lastRunAt = Number(getMeta('set_sync_last_run_at') || 0) || null;
  const lastSuccessAt = Number(getMeta('set_sync_last_success_at') || 0) || null;
  return {
    enabled: process.env.SET_SYNC_ENABLED !== '0',
    lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
    lastSuccessAt: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null,
    lastStatus: getMeta('set_sync_last_status'),
    lastAdded: Number(getMeta('set_sync_last_added') || 0),
    catalogSize: db.prepare('SELECT COUNT(*) AS n FROM pokemon_sets').get().n,
    autoAdded: db.prepare("SELECT COUNT(*) AS n FROM pokemon_sets WHERE source = 'tcgdex'").get().n,
  };
}

// Interval is deliberately not a systemd timer: the service is already a
// long-running process holding this SQLite file, so an in-process schedule
// needs no second unit, no second copy of the env, and no separate writer.
// Hourly rather than the original 6h. A steady-state run is one HTTP request
// and ~250ms because every verdict is cached, so the cost of checking more
// often is close to nothing, and 6h meant a set that went up mid-morning
// could sit unnoticed until the afternoon.
const DEFAULT_INTERVAL_MS = Number(process.env.SET_SYNC_INTERVAL_MS) || 60 * 60 * 1000;
const BOOT_DELAY_MS = 60 * 1000;

function startSetSync() {
  if (process.env.SET_SYNC_ENABLED === '0') {
    console.log('[set-sync] disabled via SET_SYNC_ENABLED=0');
    return;
  }
  const intervalMs = DEFAULT_INTERVAL_MS;
  const run = () => {
    // Never let a sync failure reach the process: an unreachable upstream
    // must degrade to "catalog is stale", not a restart loop that also takes
    // down the stock reports.
    syncSets().catch((err) => console.error(`[set-sync] unhandled: ${err.message}`));
  };
  setTimeout(run, BOOT_DELAY_MS).unref?.();
  setInterval(run, intervalMs);
  console.log(`[set-sync] scheduled every ${Math.round(intervalMs / 60000)}m (first run in ${BOOT_DELAY_MS / 1000}s)`);
}

module.exports = { syncSets, syncStatus, startSetSync, localIdFor, accentFor, defaultProductTypes };
