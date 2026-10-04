import sharp from 'sharp';

// Synthetic input used only in isolated tests, never as a community observation.
export function reportPhotoFixture(withGps = true) {
  const exif = { IFD0: { Artist: 'Synthetic private test metadata' } };
  if (withGps) exif.IFD3 = { GPSLatitudeRef: 'N', GPSLatitude: '50/1 3/1 36/1', GPSLongitudeRef: 'E', GPSLongitude: '19/1 56/1 24/1' };
  return sharp({ create: { width: 96, height: 64, channels: 3, background: '#97a697' } }).withExif(exif).jpeg().toBuffer();
}
