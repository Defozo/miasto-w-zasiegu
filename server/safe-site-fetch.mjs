import { lookup } from 'node:dns/promises';
import { Agent, request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { ApiError } from './routing.mjs';

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blockedV4.addSubnet(network, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
for (const [network, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]])
  blockedV6.addSubnet(network, prefix, 'ipv6');

export function isPublicSiteAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  // A positive global-unicast check also rejects mapped IPv4, NAT64 and local IPv6.
  return family === 6 && globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
}

export function normalizeSiteUrl(value, { allowQuery = false } = {}) {
  let url;
  if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f\u007f]/u.test(value))
    throw new ApiError(400, 'INVALID_SITE_URL', 'Podaj publiczny adres HTTPS strony obiektu.');
  try { url = new URL(value); } catch { /* The validation below returns a bounded error. */ }
  const host = url?.hostname ?? '';
  if (!url || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      (!allowQuery && /[?#]/.test(value)) || isIP(host.replace(/^\[|\]$/g, '')) || host.length > 253 ||
      !host.includes('.') || host.endsWith('.') || host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion|lan|home)$/i.test(host))
    throw new ApiError(400, 'INVALID_SITE_URL', 'Użyj publicznej domeny HTTPS, bez danych logowania, parametrów, fragmentu ani niestandardowego portu.');
  return { host, verificationUrl: `https://${host}/` };
}

export async function resolveSiteAddresses(host, { signal } = {}) {
  if (signal?.aborted) throw signal.reason;
  // Use the OS resolver, including Windows encrypted-DNS configuration. No ADDRCONFIG
  // or V4MAPPED hints: inspect every returned A/AAAA address before pinning one.
  const addresses = await lookup(host, { all: true, family: 0, hints: 0, verbatim: true });
  // getaddrinfo itself cannot be cancelled, but a late answer must never start HTTP.
  if (signal?.aborted) throw signal.reason;
  return addresses;
}

const canonicalAddress = address => isIP(address) === 6 ? new URL(`https://[${address}]/`).hostname : address;
const unavailable = () => new ApiError(502, 'SITE_FETCH_FAILED', 'Nie udało się bezpiecznie pobrać strony HTTPS. Sprawdź adres i certyfikat strony.');

function readPinnedHtml(host, selected, { requestImpl, signal, maxResponseBytes, path = '/', allowPlainText = false }) {
  const agent = new Agent({ keepAlive: false, maxCachedSessions: 0, proxyEnv: {} });
  return new Promise((resolve, reject) => {
    let request, response, settled = false;
    function finish(error, html) {
      if (settled) return;
      settled = true;
      if (error) { response?.destroy(); request?.destroy(); reject(error); }
      else resolve(html);
    }
    const lookup = (hostname, options, callback) => {
      if (hostname !== host) return callback(unavailable());
      // No second DNS query: even all-address connection attempts receive only this checked IP.
      if (options?.all) callback(null, [selected]);
      else callback(null, selected.address, selected.family);
    };
    try {
      request = requestImpl({
        protocol: 'https:', hostname: host, port: 443, path, method: 'GET',
        family: selected.family, autoSelectFamily: false, lookup, agent, signal,
        servername: host, rejectUnauthorized: true, maxHeaderSize: 16384,
        headers: { Host: host, Accept: 'text/html', 'Accept-Encoding': 'identity', 'User-Agent': 'Przejscie-Site-Verification/1.0' },
      }, incoming => {
        response = incoming;
        incoming.on('error', () => finish(signal.aborted ? signal.reason : unavailable()));
        incoming.on('aborted', () => finish(unavailable()));
        if (incoming.statusCode >= 300 && incoming.statusCode < 400)
          return finish(new ApiError(422, 'SITE_REDIRECT', 'Strona przekierowuje na inny adres. Utwórz potwierdzenie dla końcowej domeny HTTPS.', { location: incoming.headers.location }));
        if (incoming.statusCode !== 200)
          return finish(new ApiError(502, 'SITE_HTTP_ERROR', 'Strona nie zwróciła poprawnej odpowiedzi. Spróbuj ponownie później.'));
        if (!(allowPlainText ? /^text\/(?:html|plain)(?:\s*;|\s*$)/i : /^text\/html(?:\s*;|\s*$)/i).test(String(incoming.headers['content-type'] ?? '')))
          return finish(new ApiError(422, 'SITE_NOT_HTML', 'Pod wskazanym adresem nie znaleziono strony HTML.'));
        const encoding = incoming.headers['content-encoding'];
        if (encoding && String(encoding).toLowerCase() !== 'identity')
          return finish(new ApiError(422, 'SITE_UNSUPPORTED_ENCODING', 'Strona nie udostępnia nieskompresowanej odpowiedzi HTML potrzebnej do sprawdzenia.'));
        const length = Number(incoming.headers['content-length']);
        if (Number.isFinite(length) && length > maxResponseBytes)
          return finish(new ApiError(502, 'SITE_RESPONSE_TOO_LARGE', 'Strona jest zbyt duża do bezpiecznego sprawdzenia.'));
        let bytes = 0;
        const chunks = [];
        incoming.on('data', chunk => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > maxResponseBytes)
            return finish(new ApiError(502, 'SITE_RESPONSE_TOO_LARGE', 'Strona jest zbyt duża do bezpiecznego sprawdzenia.'));
          chunks.push(Buffer.from(chunk));
        });
        incoming.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
      });
      request.on('socket', socket => socket.once('secureConnect', () => {
        if (!isPublicSiteAddress(socket.remoteAddress) || canonicalAddress(socket.remoteAddress) !== canonicalAddress(selected.address))
          finish(new ApiError(400, 'SITE_ADDRESS_BLOCKED', 'Domena nie wskazuje wyłącznie na publiczne adresy internetowe.'));
      }));
      request.on('error', () => finish(signal.aborted ? signal.reason : unavailable()));
      request.end();
    } catch { finish(unavailable()); }
  }).finally(() => agent.destroy());
}

export async function fetchSiteHtml(value, {
  resolveAddresses = resolveSiteAddresses, requestImpl = httpsRequest,
  timeoutMs = 8000, maxResponseBytes = 512 * 1024,
  fullPage = false, allowPlainText = false,
} = {}) {
  const { host } = normalizeSiteUrl(value, { allowQuery: fullPage });
  const controller = new AbortController();
  const timeoutError = new ApiError(504, 'SITE_TIMEOUT', 'Sprawdzenie strony przekroczyło limit czasu. Spróbuj ponownie później.');
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  let onAbort;
  const aborted = new Promise((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([aborted, (async () => {
      let addresses;
      try { addresses = await resolveAddresses(host, { signal: controller.signal }); }
      catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, 'SITE_DNS_UNAVAILABLE', 'Nie udało się sprawdzić adresów domeny. Spróbuj ponownie później.');
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!Array.isArray(addresses) || !addresses.length || addresses.length > 64 || addresses.some(record =>
        !record || typeof record.address !== 'string' || ![4, 6].includes(record.family) ||
        isIP(record.address) !== record.family || !isPublicSiteAddress(record.address)))
        throw new ApiError(400, 'SITE_ADDRESS_BLOCKED', 'Domena nie wskazuje wyłącznie na publiczne adresy internetowe.');
      const selected = addresses.find(record => record.family === 4) ?? addresses[0];
      return readPinnedHtml(host, selected, { requestImpl, signal: controller.signal, maxResponseBytes, path: fullPage ? new URL(value).pathname + new URL(value).search : '/', allowPlainText });
    })()]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    controller.abort();
  }
}

// Every redirect repeats DNS validation and pins the selected public address.
export async function fetchPublicPage(value, options = {}) {
  let url = new URL(value).href;
  for (let redirect = 0; redirect < 4; redirect++) {
    normalizeSiteUrl(url, { allowQuery: true });
    try { return { url, html: await fetchSiteHtml(url, { ...options, fullPage: true }) }; }
    catch (error) {
      if (error.code !== 'SITE_REDIRECT' || !error.details?.location) throw error;
      url = new URL(error.details.location, url).href;
    }
  }
  throw new ApiError(502, 'SITE_REDIRECT_LIMIT', 'Strona ma zbyt wiele przekierowań. Otwórz źródło samodzielnie.');
}
