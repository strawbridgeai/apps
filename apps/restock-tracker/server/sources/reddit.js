// Community-sourced "restock is coming"/"in stock now" signal, pulled from
// r/PokemonRestocks's public RSS feed. This is the practical Walmart signal
// for this app — Walmart's own site is behind an active PerimeterX "press
// and hold" human-verification challenge that blocks even a real headless
// browser on the very first request (confirmed live, 2026-09-02), so
// there's no direct-polling provider for it here, unlike Target/Best Buy.
// Approach adapted from github.com/LJK2git/Pokemon-alerts-matrix
// (monitor.py/config.json): per-retailer url_patterns + allow/block keyword
// lists matched against a post's title+summary+link.
const Parser = require('rss-parser');

const parser = new Parser({
  headers: { 'User-Agent': 'restock-tracker (personal use; contact via strawbridgeai.com)' },
  timeout: 10000,
});

// A post older than this when first seen is treated as a stale repost, not
// a real new sighting - Reddit's RSS can resurface old posts on cache
// weirdness/mod-queue approval regardless of *why*, age alone is a
// reliable second filter (same reasoning as the reference bot).
const MAX_POST_AGE_MS = 15 * 60 * 1000;

function buildKeywordPattern(keywords) {
  if (!keywords.length) return null;
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?<![a-z])(${escaped.join('|')})(?![a-z])`, 'i');
}

const SITES = [
  {
    retailer: 'target',
    urlPatterns: ['target.com', 'target'],
    allow: buildKeywordPattern([
      'in stock', 'back in stock', 'restocked', 'live now',
      'just dropped', 'add to cart', 'available now',
    ]),
    block: buildKeywordPattern(['sold out', 'out of stock', 'cancelled', 'canceled', 'joke', 'april fools']),
  },
  {
    retailer: 'bestbuy',
    urlPatterns: ['bestbuy.com', 'best buy'],
    allow: buildKeywordPattern([
      'raffle', 'raffle is open', 'raffle is live', 'raffle started',
      'special sale', 'exclusive sale', 'sale event', 'invite', 'in stock', 'add to cart',
    ]),
    block: buildKeywordPattern(['raffle closed', 'raffle ended', 'sold out', 'cancelled', 'canceled']),
  },
  {
    retailer: 'walmart',
    urlPatterns: ['walmart.com', 'walmart'],
    allow: buildKeywordPattern([
      'in stock', 'back in stock', 'restocked', 'live now',
      'just dropped', 'add to cart', 'available now',
    ]),
    block: buildKeywordPattern(['sold out', 'out of stock', 'cancelled', 'canceled']),
  },
];

function extractHaystack(item) {
  const parts = [item.title || '', item.contentSnippet || item.content || '', item.link || ''];
  return parts.join(' ');
}

// Returns a list of { retailer, matchedKeyword } for every site this post
// satisfies: its retailer/URL is mentioned, an allow keyword hits, and no
// block keyword hits.
function evaluatePost(item) {
  const haystack = extractHaystack(item).toLowerCase();
  const fired = [];
  for (const site of SITES) {
    if (!site.urlPatterns.some((p) => haystack.includes(p))) continue;
    if (site.block && site.block.test(haystack)) continue;
    const allowMatch = site.allow && site.allow.exec(haystack);
    if (!allowMatch) continue;
    fired.push({ retailer: site.retailer, matchedKeyword: allowMatch[1] });
  }
  return fired;
}

// feedUrls: string[]. Returns [{ postId, retailer, title, url, matchedKeyword, postedAt }]
// for every (post, retailer) match across all feeds, oldest-safe-filtered.
async function fetchSightings(feedUrls) {
  const now = Date.now();
  const out = [];
  for (const feedUrl of feedUrls) {
    let feed;
    try {
      feed = await parser.parseURL(feedUrl);
    } catch (err) {
      console.error(`[reddit] feed fetch failed (${feedUrl}):`, err.message);
      continue;
    }
    for (const item of feed.items || []) {
      const postedAt = item.isoDate ? Date.parse(item.isoDate) : now;
      if (!Number.isFinite(postedAt) || now - postedAt > MAX_POST_AGE_MS) continue;
      const postId = item.guid || item.id || item.link;
      if (!postId) continue;
      for (const match of evaluatePost(item)) {
        out.push({
          postId: `${postId}:${match.retailer}`,
          retailer: match.retailer,
          title: item.title || '(untitled post)',
          url: item.link || feedUrl,
          matchedKeyword: match.matchedKeyword,
          postedAt,
        });
      }
    }
  }
  return out;
}

module.exports = { fetchSightings };
