import { ApiError } from './routing.mjs';
export function parseArea(query) {
  function numbers(value, length) {
    if (typeof value !== 'string' || value.split(',').some(x => !x.trim())) throw new ApiError(400, 'INVALID_AREA', 'Niepoprawny obszar mapy.');
    const values = value.split(',').map(Number);
    if (values.length !== length || values.some(x => !Number.isFinite(x))) throw new ApiError(400, 'INVALID_AREA', 'Niepoprawny obszar mapy.');
    return values;
  }
  const bbox = query.bbox === undefined ? null : numbers(query.bbox, 4);
  if (bbox && (bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90))
    throw new ApiError(400, 'INVALID_AREA', 'Niepoprawny obszar mapy.');
  const near = query.near === undefined ? bbox ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] : [19.938, 50.061] : numbers(query.near, 2);
  if (Math.abs(near[0]) > 180 || Math.abs(near[1]) > 90) throw new ApiError(400, 'INVALID_AREA', 'Niepoprawny punkt odniesienia.');
  return { bbox, near, contains: point => !bbox || point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3] };
}
