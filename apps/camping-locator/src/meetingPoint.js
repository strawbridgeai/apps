// Finding a fair place for a group to meet, given where each person lives.
//
// Two people have one obvious answer, so that case is solved exactly: the
// great-circle midpoint. Three or more has no single "correct" answer, and
// the intuitive one — a point exactly equidistant from everybody — is a trap.
// Three nearly-collinear homes are all equidistant from a circumcenter that
// can sit hundreds of miles away, which is technically perfect and useless in
// practice. So the search below minimises how *unequal* the distances are
// while staying inside the box the homes span, which keeps the answer both
// even-handed and somewhere the group would actually drive to.

const EARTH_RADIUS_MI = 3958.8;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function haversineMiles(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Real great-circle midpoint rather than the average of the two coordinates,
// which drifts off the true halfway line as longitude separation grows.
export function greatCircleMidpoint(a, b) {
  const lat1 = toRad(a[0]);
  const lng1 = toRad(a[1]);
  const lat2 = toRad(b[0]);
  const dLng = toRad(b[1] - a[1]);

  const bx = Math.cos(lat2) * Math.cos(dLng);
  const by = Math.cos(lat2) * Math.sin(dLng);
  const lat3 = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2)
  );
  const lng3 = lng1 + Math.atan2(by, Math.cos(lat1) + bx);
  return [toDeg(lat3), ((toDeg(lng3) + 540) % 360) - 180];
}

export function distancesFrom(point, plots) {
  return plots.map((p) => haversineMiles(point, p));
}

// How uneven a candidate is (the number being minimised), plus the mean used
// only to break ties between candidates that are equally even.
function evaluate(point, plots) {
  const d = distancesFrom(point, plots);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of d) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { spread: max - min, mean: sum / d.length };
}

function isBetter(a, b) {
  if (Math.abs(a.spread - b.spread) > 1e-9) return a.spread < b.spread;
  return a.mean < b.mean;
}

const STEP_DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Hill-climb with a shrinking step. The objective has no closed form once the
// answer is constrained to the bounding box, and with a handful of homes this
// converges in well under a millisecond — no solver dependency needed.
export function fairMeetingPoint(plots) {
  if (plots.length < 2) return null;
  if (plots.length === 2) return greatCircleMidpoint(plots[0], plots[1]);

  const lats = plots.map((p) => p[0]);
  const lngs = plots.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const clamp = (point) => [
    Math.min(maxLat, Math.max(minLat, point[0])),
    Math.min(maxLng, Math.max(minLng, point[1])),
  ];

  let best = clamp([
    lats.reduce((s, v) => s + v, 0) / lats.length,
    lngs.reduce((s, v) => s + v, 0) / lngs.length,
  ]);
  let bestScore = evaluate(best, plots);

  let step = Math.max(maxLat - minLat, maxLng - minLng) / 4 || 0.01;
  for (let i = 0; i < 200 && step > 1e-7; i++) {
    let moved = false;
    for (const [dLat, dLng] of STEP_DIRECTIONS) {
      const candidate = clamp([best[0] + dLat * step, best[1] + dLng * step]);
      const score = evaluate(candidate, plots);
      if (isBetter(score, bestScore)) {
        best = candidate;
        bestScore = score;
        moved = true;
      }
    }
    if (!moved) step /= 2;
  }

  return best;
}

// Summary the UI shows so the result is inspectable rather than a mystery pin:
// how far each person travels, and how uneven that is.
export function meetingSummary(plots) {
  const point = fairMeetingPoint(plots);
  if (!point) return null;
  const distances = distancesFrom(point, plots);
  return {
    point,
    distances,
    min: Math.min(...distances),
    max: Math.max(...distances),
    spread: Math.max(...distances) - Math.min(...distances),
    exact: plots.length === 2,
  };
}
