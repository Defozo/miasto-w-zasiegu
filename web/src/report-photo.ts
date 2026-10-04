import type { BarrierReport, Coordinates, ObservationGeometry } from './types';

export interface PhotoSuggestion {
  kind: BarrierReport['kind'];
  description: string;
  effect: NonNullable<BarrierReport['effect']>;
  duration: NonNullable<BarrierReport['duration']>;
  suggestedGeometry: ObservationGeometry['type'];
  evidence: string;
  uncertainty: string;
}
export interface PhotoJob {
  id: string;
  status: 'analyzing' | 'complete' | 'failed';
  message: string;
  result: { observations: PhotoSuggestion[]; message: string; notice: string } | null;
}
export const inReportArea = (p: Coordinates) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] >= 19.75 && p[0] <= 20.25 && p[1] >= 49.9 && p[1] <= 50.2;

export async function prepareReportPhoto(file: File): Promise<{ image: string; gps: Coordinates | null }> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Wybierz zdjęcie do 20 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Wybierz JPEG, PNG lub WebP. Zdjęcie HEIC wyeksportuj jako JPEG.');
  // GPS is read on this device only, before the image loses all its metadata.
  const gpsPromise = import('exifr').then(exifr => exifr.gps(file)).catch(() => null);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Nie udało się otworzyć zdjęcia. Wybierz inny plik.'); }
  let image: string;
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error('Wybierz zdjęcie o rozdzielczości do 40 megapikseli.');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Nie udało się przygotować zdjęcia w tej przeglądarce.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    image = canvas.toDataURL('image/jpeg', .85);
  } finally { bitmap.close(); }
  const raw = await gpsPromise;
  const gps: Coordinates | null = raw && Number.isFinite(raw.longitude) && Number.isFinite(raw.latitude) ? [raw.longitude, raw.latitude] : null;
  return { image, gps };
}
