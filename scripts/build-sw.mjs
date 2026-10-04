import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const distDir = process.argv[2] || "dist";
async function walk(dir) {
  const all = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) all.push(...(await walk(full)));
    else all.push(full);
  }
  return all;
}
const files = (await walk(distDir)).filter(
  (f) =>
    /\.(html|js|css|svg|png|webp|woff2|webmanifest)$/.test(f) &&
    !f.endsWith("sw.js"),
);
const urls = files.map(
  (f) => "/" + path.relative(distDir, f).replaceAll("\\", "/"),
);
const hash = createHash("sha256");
for (const f of files) hash.update(await readFile(f));
const name = "przejscie-" + hash.digest("hex").slice(0, 12);
const code = `const CACHE=${JSON.stringify(name)};const ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('przejscie-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/embed/'))return;
if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));return;}
if(ASSETS.includes(u.pathname))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.pathname,{ignoreVary:true}))||fetch(event.request)));
});`;
await writeFile(path.join(distDir, "sw.js"), code);
console.log(
  `Service worker: ${urls.length} own assets; no API, external map tiles or imagery cached.`,
);
