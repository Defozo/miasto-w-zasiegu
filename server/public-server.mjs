import express from 'express';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from './index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAINS = new Set(['miastowzasiegu.pl', 'www.miastowzasiegu.pl']);
const normalizeIp = ip => ip?.replace(/^::ffff:/, '');
const isLoopback = ip => ['127.0.0.1', '::1'].includes(normalizeIp(ip));

export function createPublicApp({ api = createApp(), distPath = resolve(ROOT, 'dist'), proxyIp = '192.168.31.163' } = {}) {
  const front = express();
  front.disable('x-powered-by');
  api.set('trust proxy', ip => normalizeIp(ip) === proxyIp || isLoopback(ip));
  front.use((req, res, next) => {
    const peer = normalizeIp(req.socket.remoteAddress);
    if (peer !== proxyIp && !isLoopback(peer)) return res.status(403).send('Proxy access required.');
    const hostname = (req.headers.host || '').split(':')[0].toLowerCase();
    if (!DOMAINS.has(hostname) && !(isLoopback(peer) && ['localhost', '127.0.0.1'].includes(hostname))) {
      return res.status(421).send('Unknown host.');
    }
    next();
  });
  front.use(api);
  front.use('/assets', express.static(resolve(distPath, 'assets'), { immutable: true, maxAge: '1y', dotfiles: 'deny' }));
  // A game-only release can coexist with the current main application. A full
  // application build removes this optional entry and uses the shared entry again.
  front.get('/gra', (req, res, next) => {
    const gameEntry = resolve(distPath, 'iskry/index.html');
    if (!req.accepts('html') || !existsSync(gameEntry)) return next();
    res.set('Cache-Control', 'no-cache').sendFile(gameEntry);
  });
  front.use(express.static(distPath, { index: false, maxAge: 0, dotfiles: 'deny' }));
  front.get('/{*path}', (req, res, next) => {
    if (extname(req.path) || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache').sendFile(resolve(distPath, 'index.html'));
  });
  return front;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) throw new Error('Build the web application first: npm run build');
  const api = createApp();
  const front = createPublicApp({ api });
  const server = front.listen(4180, '0.0.0.0', () => console.log('Miasto w zasiegu: port 4180; ingress restricted to Nginx Proxy Manager.'));
  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => {
    api.locals.store.close();
    process.exit(0);
  }));
}
