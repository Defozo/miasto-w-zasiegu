// Local metric projection for Krakow. Geometry stays GeoJSON [longitude, latitude].
const X = 111320 * Math.cos(50.06 * Math.PI / 180), Y = 111320;
export const metricDistance = (a, b) => Math.hypot((a[0] - b[0]) * X, (a[1] - b[1]) * Y);
export function projectPoint(p, a, b) {
  const dx = (b[0] - a[0]) * X, dy = (b[1] - a[1]) * Y;
  const t = Math.max(0, Math.min(1, (((p[0] - a[0]) * X * dx + (p[1] - a[1]) * Y * dy) / (dx * dx + dy * dy)) || 0));
  const point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return { point, t, distance: metricDistance(p, point) };
}
export function nearestOnLine(p, line) {
  let best = { distance: Infinity, along: 0, index: 0, point: line[0], t: 0 }, along = 0;
  for (let i = 1; i < line.length; i++) {
    const q = projectPoint(p, line[i - 1], line[i]), length = metricDistance(line[i - 1], line[i]);
    if (q.distance < best.distance) best = { ...q, along: along + q.t * length, index: i - 1 };
    along += length;
  }
  return best;
}
export const geometryPoints = g => g.type === 'Point' ? [g.coordinates] : g.type === 'Polygon' ? g.coordinates[0] : g.coordinates;
export function bounds(g, padding = 0) {
  const ps = geometryPoints(g), xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
  return [Math.min(...xs) - padding / X, Math.min(...ys) - padding / Y, Math.max(...xs) + padding / X, Math.max(...ys) + padding / Y];
}
export const boundsOverlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export function segmentIntersection(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-16) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * rx, a[1] + t * ry] : null;
}
export function inPolygon(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function lineTouchesGeometry(line, geometry, toleranceM = 2) {
  if (!boundsOverlap(bounds({ type: 'LineString', coordinates: line }, toleranceM), bounds(geometry))) return false;
  const points = geometryPoints(geometry);
  if (geometry.type === 'Point') return nearestOnLine(points[0], line).distance <= toleranceM;
  if (geometry.type === 'Polygon' && line.some(p => inPolygon(p, points))) return true;
  if (points.some(p => nearestOnLine(p, line).distance <= toleranceM) || line.some(p => nearestOnLine(p, points).distance <= toleranceM)) return true;
  for (let i = 1; i < line.length; i++) for (let j = 1; j < points.length; j++) if (segmentIntersection(line[i - 1], line[i], points[j - 1], points[j])) return true;
  return false;
}
export function segmentBox(a, b, halfWidth = 0.65) {
  const dx = (b[0] - a[0]) * X, dy = (b[1] - a[1]) * Y, length = Math.hypot(dx, dy);
  if (length < 0.1) return null;
  const nx = -dy / length * halfWidth / X, ny = dx / length * halfWidth / Y;
  const ring = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
  return [ring.concat([ring[0]])];
}
export function lineLength(points) { return points.slice(1).reduce((n, p, i) => n + metricDistance(points[i], p), 0); }
