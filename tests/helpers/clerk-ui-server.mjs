import { app as unusedApp, createApp } from '../../server/index.mjs';
unusedApp.locals.store.close();
const app = createApp({ dbPath: ':memory:', authOptions: { publishableKey: '', secretKey: '' },
  wheelchairSearchOptions: { discover: async () => { throw new Error('Disabled in auth UI tests'); } } });
const server = app.listen(3191, '127.0.0.1', () => console.log('Clerk UI tests: isolated API on 3191'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { app.locals.store.close(); process.exit(); }));
