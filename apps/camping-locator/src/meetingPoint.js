// Finding a fair place for a group to meet, given where each person lives.
//
// Two people have one obvious answer, solved exactly: the great-circle
// midpoint. For three or more, the answer is the true geographic middle of
// the homes — the average of their positions on the globe (spherical
// centroid). An earlier version instead minimised how *unequal* everyone's
// distances were, which sounds fair but misbehaves with a lopsided group:
// three East Coast homes plus one in Montana got pushed to the northern edge
// of the bounding box (Lake Superior), because from far enough away the three
// eastern homes all look about equally distant. The centroid is predictable
// and lands where people expect "the middle" to be.

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

// Average the homes as unit vectors on the sphere and project back to the
// surface. Unlike averaging raw lat/lng this stays correct across the
// antimeridian and doesn't drift as longitude separation grows.
export function sphericalCentroid(plots) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const [lat, lng] of plots) {
    const la = toRad(lat);
    const lo = toRad(lng);
    x += Math.cos(la) * Math.cos(lo);
    y += Math.cos(la) * Math.sin(lo);
    z += Math.sin(la);
  }
  return [toDeg(Math.atan2(z, Math.hypot(x, y))), toDeg(Math.atan2(y, x))];
}

export function fairMeetingPoint(plots) {
  if (plots.length < 2) return null;
  if (plots.length === 2) return greatCircleMidpoint(plots[0], plots[1]);
  return sphericalCentroid(plots);
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
