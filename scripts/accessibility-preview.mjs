// Loopback-only preview. All reports and accounts are isolated in memory.
import { createApp } from '../server/index.mjs';
import { createPublicApp } from '../server/public-server.mjs';
import { createAuth } from '../tests/helpers/local-auth.mjs';
const api = createApp({ dbPath: ':memory:', authFactory: createAuth,
  accessibilityPath: 'server/data/accessibility.json', parkingsPath: 'server/data/parkings.json',
  mountRoutes(app) { app.get('/api/test-environment', (_req, res) => res.json({ isolated: true, storage: 'memory', label: 'Accessibility QA' })); },
});
createPublicApp({ api }).listen(4194, '127.0.0.1', () => console.log('Isolated accessibility preview: http://127.0.0.1:4194/app'));
