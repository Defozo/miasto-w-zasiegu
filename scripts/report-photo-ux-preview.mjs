// Disposable, loopback-only UX preview. Reports are never written to the live database.
import { resolve } from 'node:path';
import { createApp } from '../server/index.mjs';
import { createPublicApp } from '../server/public-server.mjs';
import { createAuth } from '../tests/helpers/local-auth.mjs';

const unavailable = async () => { throw new Error('SEARCH_NOT_CONFIGURED'); };
const api = createApp({
  dbPath: ':memory:', authFactory: createAuth,
  accessibilityPath: 'server/data/accessibility.json', parkingsPath: 'server/data/parkings.json',
  billingOptions: { secretKey: '', webhookSecret: '' },
  reportPhotoOptions: { analyze: async () => ({
    observations: [{ kind: 'obstacle', description: 'Dane testowe: przeszkoda przy przejściu.',
      effect: 'barrier', duration: 'temporary', suggestedGeometry: 'Point',
      evidence: 'Przykładowa odpowiedź w odizolowanym podglądzie.',
      uncertainty: 'Sprawdź miejsce i warunki.' }],
    message: 'Dane testowe: przykładowa propozycja do sprawdzenia.',
    notice: 'Ten podgląd używa odpowiedzi testowej. Zdjęcie nie jest wysyłane do zewnętrznej usługi.',
  }) },
  placeResearchOptions: { research: unavailable },
  equipmentResearchOptions: { discover: unavailable, identify: unavailable, converse: unavailable },
  wheelchairSearchOptions: { discover: unavailable },
  mountRoutes(app) {
    app.get('/api/test-environment', (_req, res) => res.json({ isolated: true, storage: 'memory', externalAi: false }));
  },
});
const distPath = resolve(process.env.UX_PREVIEW_DIST || 'artifacts/report-photo-ux-preview-dist');
const port = Number(process.env.UX_PREVIEW_PORT) || 4195;
createPublicApp({ api, distPath }).listen(port, '127.0.0.1', () => {
  console.log(`Disposable UX preview: http://127.0.0.1:${port}/`);
});
