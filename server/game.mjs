import { createHash } from 'node:crypto';
import { ApiError, distance } from './routing.mjs';
import { ensureObservationSchema } from './observations.mjs';

export const GAME_ITEMS = [
  { id: 'flowers', name: 'Łąka iskier', cost: 15, description: 'Mały wybuch koloru dla Twojego ogrodu.', icon: 'flower' },
  { id: 'lantern', name: 'Lampion odkrywcy', cost: 25, description: 'Ciepłe światło na spokojne wieczory.', icon: 'lantern' },
  { id: 'pond', name: 'Sadzawka spokoju', cost: 35, description: 'Kawałek błękitnego nieba pośród zieleni.', icon: 'pond' },
  { id: 'tree', name: 'Drzewo opowieści', cost: 45, description: 'Duże drzewo dla małych, dobrych odkryć.', icon: 'tree' },
];
const MISSION_TYPES = {
  rest_place: { source: 'observation', title: 'Odkryj przystanek odpoczynku', subtitle: 'Dobre miejsca też zasługują na iskry.', points: 15, instruction: 'Jeżeli widzisz ławkę lub inne rzeczywiste miejsce odpoczynku, opisz jego położenie, oparcie i dojście. Nie zakładaj, że dojście jest dostępne dla każdego. Zapis trafi do dobrych odkryć, nie do przeszkód.' },
  step_free_entrance: { source: 'observation', title: 'Znajdź wejście bez schodów', subtitle: 'Pokaż drogę do właściwych drzwi.', points: 15, instruction: 'Sprawdź dojście do konkretnego wejścia. Jeżeli nie ma schodów, opisz które to drzwi, ewentualny próg, otwarcie i ograniczenia. Sam brak schodów nie potwierdza pełnej dostępności.' },
  lift_working: { source: 'observation', title: 'Zauważ działającą windę', subtitle: 'Liczy się to, co sprawdzono teraz.', points: 15, instruction: 'Zapisz wyłącznie działanie windy rzeczywiście sprawdzone w tej chwili. Opisz dokładne położenie i obsługiwane poziomy. Nie wchodź do miejsc zamkniętych i nie obiecuj dalszego działania windy. Brak możliwości sprawdzenia oznacza pominięcie misji.' },
  width: { title: 'Wypatrz przewężenie', subtitle: 'Dokładny pomiar robi różnicę.', points: 20, instruction: 'Jeżeli widzisz przewężenie utrudniające przejście, zmierz wolną szerokość miarą. Opisz dokładny punkt i sposób pomiaru. Nie szacuj wymiaru ze zdjęcia.' },
  surface: { title: 'Czytaj nawierzchnię', subtitle: 'Zauważ to, czego nie widać na mapie.', points: 15, instruction: 'Jeżeli nawierzchnia jest uszkodzona lub wyraźnie utrudnia przejazd, opisz materiał, nierówność i jej dokładne położenie. Nie zgłaszaj dobrej nawierzchni jako bariery.' },
  kerb: { title: 'Znajdź trudny próg', subtitle: 'Mały szczegół, duża różnica.', points: 15, instruction: 'Jeżeli zauważysz trudny krawężnik lub stopień, wskaż dokładne miejsce i opisz problem. Jeśli podajesz wysokość, zmierz ją i dodaj jednostkę. Bez przeszkody nie twórz zgłoszenia.' },
};
const normalize = text => text.toLocaleLowerCase('pl').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fingerprint = text => createHash('sha256').update(normalize(text)).digest('hex');
const number = value => Number(value) || 0;
const fail = (status, code, message) => { throw new ApiError(status, code, message); };

export function registerGameRoutes(app, { db, store, getUser, now = Date.now }) {
  ensureObservationSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS game_claims (
    report_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mission_id TEXT NOT NULL,
    target_id TEXT NOT NULL, kind TEXT NOT NULL, points INTEGER NOT NULL,
    description_hash TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(user_id,target_id,kind), UNIQUE(user_id,description_hash));
    CREATE INDEX IF NOT EXISTS game_claims_user ON game_claims(user_id,created_at);
    CREATE TABLE IF NOT EXISTS game_observation_claims (
      observation_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mission_id TEXT NOT NULL,
      target_id TEXT NOT NULL, kind TEXT NOT NULL, points INTEGER NOT NULL,
      description_hash TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(user_id,target_id,kind), UNIQUE(user_id,description_hash));
    CREATE INDEX IF NOT EXISTS game_observation_claims_user ON game_observation_claims(user_id,created_at);
    CREATE TABLE IF NOT EXISTS game_unlocks (
      user_id TEXT NOT NULL,item_id TEXT NOT NULL,cost INTEGER NOT NULL,
      created_at TEXT NOT NULL,PRIMARY KEY(user_id,item_id));
    CREATE TABLE IF NOT EXISTS game_decorations (
      user_id TEXT NOT NULL,slot INTEGER NOT NULL,item_id TEXT NOT NULL,
      PRIMARY KEY(user_id,slot));`);

  const requireUser = req => {
    const user = getUser(req);
    if (!user) fail(401, 'GAME_LOGIN_REQUIRED', 'Zaloguj się, aby zbierać iskry za prawdziwe obserwacje. Trening działa bez konta.');
    if (req.body?.expectedUserId !== undefined && req.body.expectedUserId !== user.id) fail(409, 'ACCOUNT_CHANGED', 'Konto zmieniło się w innej karcie. Odśwież grę przed zapisaniem postępu.');
    return user;
  };
  function claims(userId) {
    return db.prepare(`SELECT g.report_id AS source_id,g.user_id,g.mission_id,g.target_id,g.kind,g.points,g.description_hash,g.created_at,r.lon,r.lat
      FROM game_claims g JOIN reports r ON r.id=g.report_id WHERE g.user_id=?
      UNION ALL
      SELECT g.observation_id AS source_id,g.user_id,g.mission_id,g.target_id,g.kind,g.points,g.description_hash,g.created_at,o.lon,o.lat
      FROM game_observation_claims g JOIN observations o ON o.id=g.observation_id WHERE g.user_id=?
      ORDER BY created_at,source_id`).all(userId, userId);
  }
  function state(user) {
    if (!user) return { authenticated: false, earned: 0, spent: 0, balance: 0, observations: 0, kinds: [], claimedMissions: [], unlocked: [], decorations: [], items: GAME_ITEMS };
    const history = claims(user.id);
    const unlocks = db.prepare('SELECT item_id,cost FROM game_unlocks WHERE user_id=?').all(user.id);
    const earned = history.reduce((sum, row) => sum + number(row.points), 0);
    const spent = unlocks.reduce((sum, row) => sum + number(row.cost), 0);
    return { authenticated: true, earned, spent, balance: earned - spent, observations: history.length,
      kinds: [...new Set(history.map(row => row.kind))], claimedMissions: history.map(row => row.mission_id),
      unlocked: unlocks.map(row => row.item_id),
      decorations: db.prepare('SELECT slot,item_id AS itemId FROM game_decorations WHERE user_id=? ORDER BY slot').all(user.id), items: GAME_ITEMS };
  }
  function mission(id) {
    if (typeof id !== 'string' || id.length > 220) fail(400, 'INVALID_MISSION', 'Wybierz misję z aktualnej listy.');
    const split = id.indexOf(':'), kind = id.slice(0, split), targetId = id.slice(split + 1);
    const template = Object.hasOwn(MISSION_TYPES, kind) ? MISSION_TYPES[kind] : null, place = split > 0 && template ? store.place(targetId) : null;
    if (!place || !Array.isArray(place.coordinates)) fail(400, 'INVALID_MISSION', 'Ta misja nie istnieje. Odśwież listę.');
    return { id, kind, targetId, source: 'report', target: { id: place.id, name: place.name, coordinates: place.coordinates, address: place.address, sourceUrl: place.sourceUrl }, ...template };
  }
  app.get('/api/game/state', (req, res) => res.json(state(getUser(req))));
  app.get('/api/game/missions', (req, res) => {
    const q = req.query.q ?? '';
    if (typeof q !== 'string' || q.length > 100) fail(400, 'INVALID_INPUT', 'Szukaj krótszą nazwą miejsca.');
    const hasCenter = req.query.lon !== undefined || req.query.lat !== undefined;
    const center = hasCenter ? [Number(req.query.lon), Number(req.query.lat)] : [19.938, 50.061];
    if (hasCenter && (typeof req.query.lon !== 'string' || typeof req.query.lat !== 'string' || !center.every(Number.isFinite) || center[0] < 18 || center[0] > 22 || center[1] < 49 || center[1] > 51)) fail(400, 'INVALID_INPUT', 'Wybierz poprawną okolicę w Krakowie.');
    const current = state(getUser(req));
    const targets = store.places().filter(place => !q || normalize(`${place.name} ${place.address}`).includes(normalize(q)))
      .sort((a, b) => distance(a.coordinates, center) - distance(b.coordinates, center)).slice(0, 8);
    const missions = targets.flatMap(place => Object.keys(MISSION_TYPES).map(kind => mission(`${kind}:${place.id}`)))
      .filter(item => !current.claimedMissions.includes(item.id));
    res.json({ missions, notice: 'Dobre odkrycia zapisujemy osobno od przeszkód. Punkty oznaczają walidację zapisu, nie potwierdzenie dostępności ani zmianę tras. Zapisuj tylko fakty, które rzeczywiście sprawdzono.' });
  });
  app.post('/api/game/claim', (req, res) => {
    const user = requireUser(req), data = req.body;
    const hasReport = data && Object.hasOwn(data, 'reportId'), hasObservation = data && Object.hasOwn(data, 'observationId');
    const sourceId = hasObservation ? data.observationId : data?.reportId;
    if (!data || hasReport === hasObservation || typeof sourceId !== 'string' || !sourceId.length || sourceId.length > 100)
      fail(400, 'INVALID_INPUT', 'Podaj dokładnie jeden identyfikator: własnego zgłoszenia albo dobrego odkrycia.');
    const selected = mission(data.missionId), positive = Boolean(hasObservation);
    if (selected.source !== (positive ? 'observation' : 'report')) fail(400, 'MISSION_SOURCE_MISMATCH', 'Dobre odkrycie i przeszkoda to różne rodzaje zapisu. Wybierz właściwą misję.');
    const table = positive ? 'game_observation_claims' : 'game_claims', column = positive ? 'observation_id' : 'report_id';
    let outcome;
    db.exec('BEGIN IMMEDIATE');
    try {
      const record = positive
        ? db.prepare('SELECT *,type AS kind,observed_at AS created_at,NULL AS width_cm FROM observations WHERE id=?').get(sourceId)
        : db.prepare('SELECT * FROM reports WHERE id=?').get(sourceId);
      if (!record) fail(404, positive ? 'OBSERVATION_NOT_FOUND' : 'REPORT_NOT_FOUND', 'Nie znaleziono zapisu obserwacji.');
      if (!record.user_id || record.user_id !== user.id) fail(403, positive ? 'OBSERVATION_NOT_OWNED' : 'REPORT_NOT_OWNED', 'Punkty można otrzymać wyłącznie za własną obserwację dodaną po zalogowaniu.');
      const existing = db.prepare(`SELECT * FROM ${table} WHERE ${column}=?`).get(sourceId);
      if (existing) {
        if (existing.mission_id !== selected.id) fail(409, 'REPORT_ALREADY_CLAIMED', 'Ta obserwacja została już wykorzystana w innej misji.');
        outcome = { awarded: 0, varietyBonus: 0, alreadyClaimed: true };
      } else {
        if (record.status !== 'active') fail(409, positive ? 'OBSERVATION_NOT_ACTIVE' : 'REPORT_NOT_ACTIVE', 'Zapis został wycofany lub rozwiązany. Nie przyznajemy nowych punktów.');
        const timestamp = now(), age = timestamp - Date.parse(record.created_at);
        if (!Number.isFinite(age) || age < -60000 || age > 86400000 || (positive && Date.parse(record.valid_until) <= timestamp))
          fail(409, positive ? 'OBSERVATION_NOT_FRESH' : 'REPORT_NOT_FRESH', 'Do misji można przypisać tylko aktualną obserwację z ostatnich 24 godzin.');
        if (record.kind !== selected.kind) fail(400, 'MISSION_KIND_MISMATCH', 'Rodzaj obserwacji nie pasuje do wybranej misji.');
        const point = [Number(record.lon), Number(record.lat)];
        if (!point.every(Number.isFinite) || distance(point, selected.target.coordinates) > 180) fail(400, 'MISSION_LOCATION_MISMATCH', 'Obserwacja musi dotyczyć okolicy wybranego miejsca, do 180 m od jego punktu na mapie.');
        const words = normalize(record.description).split(' ').filter(Boolean);
        if (record.description.trim().length < 35 || words.length < 6 || new Set(words).size < 5)
          fail(400, 'OBSERVATION_TOO_VAGUE', 'Dodaj konkretny opis: co zauważono i gdzie dokładnie. Minimum 35 znaków i 6 słów.');
        if (selected.kind === 'width' && (!Number.isFinite(record.width_cm) || record.width_cm < 20 || record.width_cm > 400))
          fail(400, 'MEASUREMENT_REQUIRED', 'Misja pomiarowa wymaga zmierzonej szerokości od 20 do 400 cm.');
        const hash = fingerprint(record.description), previous = claims(user.id);
        if (previous.some(row => (row.target_id === selected.targetId && row.kind === selected.kind) || row.description_hash === hash ||
          (row.kind === selected.kind && distance([Number(row.lon), Number(row.lat)], point) < 35)))
          fail(409, 'DUPLICATE_OBSERVATION', 'Ten rodzaj obserwacji w tym miejscu lub ten sam opis już otrzymał punkty. Nie dodawaj kopii.');
        if (previous.filter(row => timestamp - Date.parse(row.created_at) < 86400000).length >= 5)
          fail(429, 'GAME_DAILY_LIMIT', 'Pięć nagród w ciągu 24 godzin to wspólny limit dobrych odkryć i przeszkód. Ogród pozostaje dostępny.');
        if (previous.some(row => timestamp - Date.parse(row.created_at) < 90000))
          fail(429, 'GAME_TOO_FAST', 'Nie musisz się spieszyć. Kolejne punkty przyznamy po krótkiej przerwie od poprzedniej obserwacji.');
        const kinds = new Set(previous.map(row => row.kind));
        const varietyBonus = kinds.size === 2 && !kinds.has(selected.kind) ? 10 : 0, awarded = selected.points + varietyBonus;
        db.prepare(`INSERT INTO ${table}(${column},user_id,mission_id,target_id,kind,points,description_hash,created_at) VALUES(?,?,?,?,?,?,?,?)`)
          .run(sourceId, user.id, selected.id, selected.targetId, selected.kind, awarded, hash, new Date(timestamp).toISOString());
        outcome = { awarded, varietyBonus, alreadyClaimed: false };
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      if (String(error.code).includes('CONSTRAINT') || String(error.message).includes('UNIQUE')) fail(409, 'DUPLICATE_OBSERVATION', 'Ta obserwacja otrzymała już punkty.');
      throw error;
    }
    res.status(outcome.alreadyClaimed ? 200 : 201).json({ ...outcome, state: state(user) });
  });
  app.post('/api/game/decorate', (req, res) => {
    const user = requireUser(req), { itemId, slot } = req.body ?? {};
    const item = GAME_ITEMS.find(value => value.id === itemId);
    if (!item || !Number.isInteger(slot) || slot < 0 || slot > 3) fail(400, 'INVALID_DECORATION', 'Wybierz ozdobę i jedną z czterech grządek.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = state(user);
      if (!current.unlocked.includes(itemId)) {
        if (current.balance < item.cost) fail(409, 'NOT_ENOUGH_SPARKS', 'Na tę ozdobę potrzeba więcej iskier. Już odblokowane ozdoby możesz przestawiać bez kosztu.');
        db.prepare('INSERT INTO game_unlocks(user_id,item_id,cost,created_at) VALUES(?,?,?,?)').run(user.id, item.id, item.cost, new Date(now()).toISOString());
      }
      db.prepare('INSERT INTO game_decorations(user_id,slot,item_id) VALUES(?,?,?) ON CONFLICT(user_id,slot) DO UPDATE SET item_id=excluded.item_id').run(user.id, slot, item.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ state: state(user) });
  });
}

export default registerGameRoutes;
