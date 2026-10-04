import { createHash } from 'node:crypto';
import { ApiError, distance, coordinates } from './routing.mjs';

const DAY = 86400000;
const normalize = text => text.toLocaleLowerCase('pl').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const hash = text => createHash('sha256').update(normalize(text)).digest('hex');
const useful = text => typeof text === 'string' && text.trim().length >= 35 && text.length <= 800 && normalize(text).split(' ').length >= 6 && new Set(normalize(text).split(' ')).size >= 5;
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
export const BADGES = [
  { id: 'first', name: 'Pierwszy trop', detail: 'Własne obserwacje, które trafiły na mapę.', thresholds: [1, 5, 20], metric: 'discoveries', icon: 'compass', color: 'mint' },
  { id: 'fresh', name: 'Świeże spojrzenie', detail: 'Ponowne sprawdzenia informacji wymagających aktualizacji.', thresholds: [1, 5, 15], metric: 'refreshes', icon: 'refresh', color: 'blue' },
  { id: 'measure', name: 'Oko do detalu', detail: 'Obserwacje z rzeczywistym pomiarem na miejscu.', thresholds: [1, 3, 10], metric: 'measurements', icon: 'ruler', color: 'orange' },
  { id: 'rest', name: 'Przystanek', detail: 'Opisane miejsca odpoczynku i warunki przy nich.', thresholds: [1, 5, 15], metric: 'rests', icon: 'bench', color: 'pink' },
  { id: 'door', name: 'Właściwe drzwi', detail: 'Obserwacje konkretnych wejść, progów i schodów.', thresholds: [1, 5, 15], metric: 'entrances', icon: 'door', color: 'violet' },
  { id: 'variety', name: 'Szeroki kadr', detail: 'Różne rodzaje obserwacji. Każdy szczegół się liczy.', thresholds: [2, 4, 6], metric: 'variety', icon: 'layers', color: 'yellow' },
];
const RANKS = [{ name: 'Na starcie', xp: 0 }, { name: 'Odkrywca', xp: 40 }, { name: 'Tropiciel', xp: 120 }, { name: 'Znawca okolicy', xp: 300 }, { name: 'Kronikarz miasta', xp: 700 }, { name: 'Miejska legenda', xp: 1500 }];
const THEMES = [{ id: 'mint', name: 'Miejski neon', xp: 0 }, { id: 'sunset', name: 'Złota godzina', xp: 120 }, { id: 'night', name: 'Nocny szlak', xp: 300 }];

export function registerExplorerRoutes(app, context) {
  const { db, store, getUser, now = Date.now } = context;
  db.exec(`CREATE TABLE IF NOT EXISTS explorer_awards (
    event_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_id TEXT NOT NULL,
    activity TEXT NOT NULL, kind TEXT NOT NULL, lon REAL NOT NULL, lat REAL NOT NULL,
    description_hash TEXT NOT NULL, points INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS explorer_awards_user ON explorer_awards(user_id,created_at);
    CREATE TABLE IF NOT EXISTS explorer_showcase(user_id TEXT PRIMARY KEY, featured TEXT NOT NULL DEFAULT '[]', theme TEXT NOT NULL DEFAULT 'mint');`);
  // Preserve previously earned city progress once; training never enters this ledger.
  for (const [table, column, source] of [['game_claims', 'report_id', 'report'], ['game_observation_claims', 'observation_id', 'observation']]) {
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
      const records = source === 'report' ? 'reports' : 'observations';
      db.exec(`INSERT OR IGNORE INTO explorer_awards SELECT '${source}:' || g.${column},g.user_id,g.${column},
        CASE WHEN g.kind='width' THEN 'measure' ELSE 'discover' END,g.kind,r.lon,r.lat,g.description_hash,g.points,g.created_at
        FROM ${table} g JOIN ${records} r ON r.id=g.${column}`);
    }
  }
  const history = userId => userId ? db.prepare('SELECT * FROM explorer_awards WHERE user_id=? ORDER BY created_at,event_key').all(userId) : [];
  const userRequired = req => {
    const user = getUser(req);
    if (!user) fail(401, 'AUTH_REQUIRED', 'Zaloguj się, aby zapisać swoje odkrycia i odznaki.');
    if (req.body?.expectedUserId !== user.id) fail(409, 'ACCOUNT_CHANGED', 'Konto się zmieniło. Odśwież widok przed zapisem.');
    return user;
  };
  function state(user) {
    const rows = history(user?.id), xp = rows.reduce((sum, row) => sum + row.points, 0);
    const discoveries = rows.filter(row => row.activity !== 'refresh');
    const stats = { xp, contributions: rows.length, discoveries: discoveries.length, refreshes: rows.filter(row => row.activity === 'refresh').length,
      measurements: rows.filter(row => row.activity === 'measure').length, rests: discoveries.filter(row => row.kind === 'rest_place').length,
      entrances: discoveries.filter(row => ['entrance', 'kerb', 'steps', 'step_free_entrance'].includes(row.kind)).length,
      variety: new Set(discoveries.map(row => row.kind)).size };
    const badges = BADGES.map(badge => { const count = stats[badge.metric], level = badge.thresholds.filter(t => count >= t).length;
      return { ...badge, count, level, next: badge.thresholds[level] ?? null }; });
    const saved = user ? db.prepare('SELECT * FROM explorer_showcase WHERE user_id=?').get(user.id) : null;
    const unlocked = badges.filter(b => b.level > 0).map(b => b.id);
    const featured = saved ? JSON.parse(saved.featured).filter(id => unlocked.includes(id)) : unlocked.slice(0, 3);
    const rankIndex = RANKS.findLastIndex(rank => xp >= rank.xp);
    return { user: user ? { id: user.id, displayName: user.displayName } : null, stats, badges, featured,
      rank: RANKS[rankIndex], nextRank: RANKS[rankIndex + 1] ?? null, themes: THEMES, theme: saved?.theme ?? 'mint',
      dailyRemaining: Math.max(0, 5 - rows.filter(row => now() - Date.parse(row.created_at) < DAY).length),
      recent: rows.slice(-8).reverse().map(row => ({ id: row.event_key, activity: row.activity, kind: row.kind, points: row.points, at: row.created_at })),
      notice: 'Odznaki pokazują wkład w informacje społeczności. Nie potwierdzają dostępności miejsc ani niezależnego audytu.' };
  }
  function award(user, event) {
    const no = reason => ({ awarded: 0, reason });
    if (!user) return no('Zaloguj się przy kolejnym odkryciu, aby zbierać odznaki.');
    if (db.prepare('SELECT event_key FROM explorer_awards WHERE event_key=?').get(event.key)) return no('Ten wkład już otrzymał punkty.');
    const age = now() - Date.parse(event.observedAt);
    if (!Number.isFinite(age) || age < -60000 || age > DAY) return no('Punkty przyznajemy za obserwacje z ostatnich 24 godzin.');
    if (!useful(event.description)) return no('Do odznak liczą się konkretne opisy: minimum 35 znaków i 6 słów.');
    const rows = history(user.id), fingerprint = hash(event.description);
    if (event.activity === 'refresh' ? rows.some(r => r.source_id === event.sourceId && r.activity === 'refresh' && now() - Date.parse(r.created_at) < 7 * DAY)
      : rows.some(r => r.activity !== 'refresh' && (r.description_hash === fingerprint || r.kind === event.kind && distance([r.lon, r.lat], event.point) < 35)))
      return no('Ta obserwacja lub niedawne sprawdzenie tego miejsca już otrzymały punkty.');
    if (rows.filter(r => now() - Date.parse(r.created_at) < DAY).length >= 5) return no('Pięć nagród w 24 godziny. Zapis nadal pomaga innym.');
    if (rows.some(r => now() - Date.parse(r.created_at) < 90000)) return no('Zapisano informację. Kolejne punkty można zdobyć po 90 sekundach od poprzedniej nagrody.');
    const before = state(user);
    db.prepare('INSERT INTO explorer_awards VALUES(?,?,?,?,?,?,?,?,?,?)').run(event.key, user.id, event.sourceId, event.activity, event.kind,
      ...event.point, fingerprint, event.points, new Date(now()).toISOString());
    const after = state(user);
    return { awarded: event.points, badges: after.badges.filter((b, i) => b.level > before.badges[i].level).map(b => b.name),
      rankUp: before.rank.name !== after.rank.name ? after.rank.name : null, reason: 'Twój wkład zasilił profil Iskier.' };
  }
  function awardReport(user, report) {
    const measured = report.measurement === 'measured' && [report.widthCm, report.heightCm, report.inclinePercent].some(v => typeof v === 'number' && v >= 0);
    return award(user, { key: `report:${report.id}`, sourceId: report.id, activity: measured ? 'measure' : 'discover', kind: report.kind,
      point: report.coordinates, description: report.description, observedAt: report.observedAt || report.createdAt, points: measured ? 20 : 15 });
  }
  function awardObservation(user, row) {
    return award(user, { key: `observation:${row.id}`, sourceId: row.id, activity: 'discover', kind: row.type,
      point: [row.lon, row.lat], description: row.description, observedAt: row.observed_at, points: 15 });
  }
  function needsCheck(report) { return report.status === 'active' && (report.stale || report.disputed); }
  function awardFeedback(user, before, action, description) {
    if (!user || before.userId === user.id || !needsCheck(before)) return { awarded: 0, reason: 'To sprawdzenie nie wymagało nagradzanej aktualizacji.' };
    const event = db.prepare('SELECT id,created_at FROM report_events WHERE report_id=? AND user_id=? AND action=? ORDER BY created_at DESC,id DESC LIMIT 1').get(before.id, user.id, action);
    if (!event) return { awarded: 0, reason: 'Brak zapisanego sprawdzenia.' };
    return award(user, { key: `feedback:${event.id}`, sourceId: before.id, activity: 'refresh', kind: before.kind,
      point: before.coordinates, description: action === 'confirm' && !useful(description) ? before.description : description,
      observedAt: event.created_at, points: 25 });
  }
  app.get('/api/game/explorer', (req, res) => res.json(state(getUser(req))));
  app.post('/api/game/showcase', (req, res) => {
    const user = userRequired(req), current = state(user), { featured, theme } = req.body;
    if (!Array.isArray(featured) || featured.length > 3 || new Set(featured).size !== featured.length || featured.some(id => !current.badges.some(b => b.id === id && b.level > 0)))
      fail(400, 'INVALID_SHOWCASE', 'Wybierz do trzech zdobytych odznak.');
    if (!THEMES.some(t => t.id === theme && current.stats.xp >= t.xp)) fail(400, 'THEME_LOCKED', 'Ten styl karty nie jest jeszcze odblokowany.');
    db.prepare('INSERT INTO explorer_showcase VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET featured=excluded.featured,theme=excluded.theme').run(user.id, JSON.stringify(featured), theme);
    res.json(state(user));
  });
  app.get('/api/game/quests', (req, res) => {
    const q = req.query.q ?? '', user = getUser(req);
    if (typeof q !== 'string' || q.length > 100) fail(400, 'INVALID_INPUT', 'Szukaj krótszą nazwą miejsca.');
    const center = req.query.lon === undefined && req.query.lat === undefined ? [19.938, 50.061] : [Number(req.query.lon), Number(req.query.lat)];
    coordinates(center);
    const query = normalize(q), own = history(user?.id), match = text => !query || normalize(text).includes(query);
    const allReports = store.reports();
    const activeRest = db.prepare("SELECT lon,lat FROM observations WHERE type='rest_place' AND status='active' AND valid_until>?").all(new Date(now()).toISOString());
    const reports = allReports.filter(r => needsCheck(r) && r.userId !== user?.id && match(`${r.description} ${r.title}`)
      && !own.some(a => a.activity === 'refresh' && a.source_id === r.id && now() - Date.parse(a.created_at) < 7 * DAY));
    const missions = reports.map(r => ({ id: `refresh:${r.id}`, type: 'refresh', kind: r.kind, title: r.disputed ? 'Sprawdź rozbieżność' : 'Daj tej informacji nową datę',
      reason: r.disputed ? 'W opisie tego miejsca zgłoszono zmianę. Potrzebna jest kolejna obserwacja.' : 'Poprzednia obserwacja wymaga ponownego sprawdzenia.',
      points: 25, place: r.title, coordinates: r.coordinates, distanceM: Math.round(distance(center, r.coordinates)),
      reportId: r.id, description: r.description, lastObservedAt: r.lastConfirmedAt || r.observedAt, revision: hash(JSON.stringify([r.description, r.lastConfirmedAt, r.disputed, r.history])),
      sourceUrl: null, priority: r.disputed ? 0 : 1 }));
    const places = store.places().filter(p => match(`${p.name} ${p.address}`) && (p.placeType === 'bench' || p.access?.stepFree == null || p.access?.widthCm == null))
      .sort((a, b) => distance(center, a.coordinates) - distance(center, b.coordinates)).slice(0, 32);
    for (const p of places) {
      const rest = p.placeType === 'bench', kind = rest ? 'rest_place' : 'entrance';
      if (own.some(a => a.kind === kind && a.activity !== 'refresh' && distance([a.lon, a.lat], p.coordinates) < 35)) continue;
      // Source metadata is never presented as the date of a field observation.
      const existing = allReports.some(r => r.status === 'active' && !r.stale && r.kind === kind && distance(r.coordinates, p.coordinates) < 35);
      const good = rest && activeRest.some(o => distance([o.lon, o.lat], p.coordinates) < 35);
      if (existing || good) continue;
      missions.push({ id: `discover:${p.id}`, type: 'discover', kind, title: rest ? 'Znajdź dobry przystanek' : 'Przyjrzyj się wejściu',
        reason: rest ? 'Brakuje aktualnej obserwacji ławki i dojścia do niej.' : 'Brakuje informacji o schodach lub pomiaru wejścia. Opisz konkretne drzwi i warunki przy nich.',
        points: 15, place: p.name, address: p.address, coordinates: p.coordinates, distanceM: Math.round(distance(center, p.coordinates)),
        lastObservedAt: null, sourceUrl: p.sourceUrl || null, priority: 2 });
    }
    missions.sort((a, b) => a.priority - b.priority || a.distanceM - b.distanceM);
    res.json({ missions: missions.slice(0, 18), center, notice: 'Odległość w linii prostej. Punkt katalogowy może różnić się od wejścia. Wybierz miejsce, do którego możesz bezpiecznie dotrzeć.' });
  });
  app.post('/api/game/recheck', (req, res) => {
    const user = userRequired(req), data = req.body;
    if (typeof data.reportId !== 'string' || data.reportId.length > 100) fail(400, 'INVALID_RECHECK', 'Wybierz aktualną misję z listy.');
    const report = store.getReport(data.reportId);
    if (!report) fail(404, 'NOT_FOUND', 'Nie znaleziono obserwacji.');
    if (report.userId === user.id) fail(400, 'OWN_RECHECK', 'Swoją obserwację popraw w głównej aplikacji. Ta misja dotyczy ponownego spojrzenia innej osoby.');
    const revision = hash(JSON.stringify([report.description, report.lastConfirmedAt, report.disputed, report.history]));
    if (!needsCheck(report) || data.revision !== revision) fail(409, 'QUEST_CHANGED', 'Ktoś już zaktualizował tę informację. Odśwież listę misji.');
    if (!['same', 'changed'].includes(data.answer) || data.observedNow !== true || !useful(data.description)) fail(400, 'INVALID_RECHECK', 'Wybierz wynik i opisz aktualną obserwację: minimum 35 znaków i 6 słów.');
    coordinates(data.coordinates);
    if (distance(data.coordinates, report.coordinates) > 180) fail(400, 'WRONG_LOCATION', 'Wskaż rzeczywiste miejsce przy tym zgłoszeniu, do 180 m od punktu.');
    const action = data.answer === 'same' ? 'confirm' : 'dispute';
    const updated = store.confirmReport(report.id, user.id, action, data.description);
    const reward = awardFeedback(user, report, action, data.description);
    res.json({ reportId: updated.id, reward, state: state(user), notice: 'Zapisano kolejną obserwację społeczności. Sprzeczność wymaga wyjaśnienia, a potwierdzenie nie jest audytem.' });
  });
  return { state, awardReport, awardObservation, awardFeedback };
}
