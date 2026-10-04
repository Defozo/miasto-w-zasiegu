import { randomUUID } from 'node:crypto';
import { ApiError, coordinates } from './routing.mjs';
import { PASSPORT_CATEGORIES, PASSPORT_FIELD_DEFINITIONS, PASSPORT_MAX_ENTRANCES,
  emptyPassportContent, emptyPassportFields } from '../shared/place-passports.mjs';

const categories = new Set(PASSPORT_CATEGORIES.map(item => item.value));
const definitions = new Map(PASSPORT_FIELD_DEFINITIONS.map(item => [item.key, item]));
const metadataKeys = ['name', 'category', 'address', 'coordinates', 'website'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (status, code, message, details) => { throw new ApiError(status, code, message, details); };

function text(value, label, max, { optional = false, empty = false } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (!empty && !value.trim()))
    fail(400, 'INVALID_PASSPORT', `${label}: podaj poprawny tekst do ${max} znaków.`);
  return value.trim();
}

function url(value, label) {
  const input = text(value, label, 2048, { optional: true });
  if (input === null) return null;
  let parsed;
  try { parsed = new URL(input); } catch { /* Bounded validation error below. */ }
  if (!parsed || !['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
    fail(400, 'INVALID_PASSPORT', `${label}: podaj adres HTTP lub HTTPS bez danych logowania.`);
  return parsed.href;
}

function observedDate(value, now) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value))
    fail(400, 'INVALID_PASSPORT', 'Data obserwacji musi być datą kalendarzową lub datą ISO w UTC.');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value.slice(0, 10) || parsed > now)
    fail(400, 'INVALID_PASSPORT', 'Podaj istniejącą datę obserwacji, która nie jest w przyszłości.');
  return value.length === 10 ? value : new Date(parsed).toISOString();
}

function parseFields(raw, now) {
  if (!isObject(raw) || Object.keys(raw).some(key => !definitions.has(key)))
    fail(400, 'INVALID_PASSPORT', 'Niepoprawna lista informacji o dostępności.');
  return Object.fromEntries(PASSPORT_FIELD_DEFINITIONS.map(definition => {
    const input = raw[definition.key] ?? { value: null };
    if (!isObject(input)) fail(400, 'INVALID_PASSPORT', `${definition.label}: niepoprawna informacja.`);
    let value = input.value ?? null;
    if (value !== null) {
      if (definition.type === 'choice' && !['yes', 'no', 'limited'].includes(value))
        fail(400, 'INVALID_PASSPORT', `${definition.label}: wybierz Tak, Nie, Częściowo lub Nie wiem.`);
      if (definition.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < definition.min || value > definition.max))
        fail(400, 'INVALID_PASSPORT', `${definition.label}: podaj liczbę od ${definition.min} do ${definition.max} cm.`);
      if (definition.type === 'text') value = text(value, definition.label, 1200, { optional: true });
    }
    return [definition.key, { value, sourceLabel: text(input.sourceLabel, 'Opis źródła', 200, { optional: true }),
      sourceUrl: url(input.sourceUrl, 'Adres źródła'), observedAt: observedDate(input.observedAt, now) }];
  }));
}

export function validatePassportContent(raw, { publish = false, now = Date.now() } = {}) {
  if (!isObject(raw) || !isObject(raw.place) || !Array.isArray(raw.entrances) || raw.entrances.length > PASSPORT_MAX_ENTRANCES)
    fail(400, 'INVALID_PASSPORT', `Podaj dane obiektu i nie więcej niż ${PASSPORT_MAX_ENTRANCES} wejść.`);
  const place = { name: text(raw.place.name, 'Nazwa obiektu', 200, { empty: !publish }),
    category: raw.place.category, address: text(raw.place.address, 'Adres obiektu', 300, { empty: true }),
    coordinates: raw.place.coordinates == null ? null : [...coordinates(raw.place.coordinates)],
    website: url(raw.place.website, 'Strona obiektu') };
  if (!categories.has(place.category)) fail(400, 'INVALID_PASSPORT', 'Wybierz kategorię obiektu.');
  if (publish && !place.coordinates) fail(400, 'INVALID_PASSPORT', 'Wskaż położenie obiektu przed publikacją.');
  const entranceIds = new Set();
  const entrances = raw.entrances.map(entrance => {
    if (!isObject(entrance) || typeof entrance.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(entrance.id) || entranceIds.has(entrance.id))
      fail(400, 'INVALID_PASSPORT', 'Każde wejście musi mieć osobny identyfikator.');
    entranceIds.add(entrance.id);
    return { id: entrance.id, label: text(entrance.label, 'Nazwa wejścia', 160, { empty: !publish }),
      coordinates: entrance.coordinates == null ? null : [...coordinates(entrance.coordinates)], fields: parseFields(entrance.fields, now) };
  });
  return { place, fields: parseFields(raw.fields, now), entrances };
}

export function ensurePlacePassportSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS place_passports (
    place_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, content_json TEXT NOT NULL,
    source_snapshot_json TEXT, created_at TEXT NOT NULL, published_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS place_passport_drafts (
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL, user_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, base_revision INTEGER NOT NULL,
      content_json TEXT NOT NULL, base_content_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(place_id,user_id));
    CREATE INDEX IF NOT EXISTS passport_drafts_user ON place_passport_drafts(user_id,updated_at);
    CREATE TABLE IF NOT EXISTS place_passport_revisions (
      place_id TEXT NOT NULL, revision INTEGER NOT NULL, user_id TEXT NOT NULL, author_name TEXT NOT NULL,
      content_json TEXT NOT NULL, changes_json TEXT NOT NULL, published_at TEXT NOT NULL,
      PRIMARY KEY(place_id,revision));
    CREATE INDEX IF NOT EXISTS passport_revisions_user ON place_passport_revisions(user_id,published_at);
    CREATE TABLE IF NOT EXISTS place_passport_evidence (
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL, scope TEXT NOT NULL, field_key TEXT NOT NULL,
      value_json TEXT NOT NULL, source_label TEXT NOT NULL, source_url TEXT,
      user_id TEXT NOT NULL, author_name TEXT NOT NULL, observed_at TEXT, website_url TEXT,
      published_at TEXT NOT NULL, created_revision INTEGER NOT NULL, retired_revision INTEGER);
    CREATE INDEX IF NOT EXISTS passport_evidence_current ON place_passport_evidence(place_id,retired_revision,scope,field_key);`);
}

function sourceFields(place) {
  const fields = emptyPassportFields();
  if (!place) return fields;
  for (const key of ['wheelchair', 'widthCm', 'surface', 'toilet', 'entranceNotes']) {
    const value = place.access?.[key];
    if (value !== undefined && value !== null && value !== '' && value !== 'unknown') fields[key].value = value;
  }
  if (place.openingHours) fields.openingHours.value = place.openingHours;
  if (place.placeType === 'bench') fields.restingPlace.value = 'yes';
  return fields;
}

function sourceEvidence(place, key, value) {
  if (value === null || value === undefined || value === '') return null;
  const source = place.provenance;
  return { id: `source:${place.id}:${key}`, value,
    source: { kind: place.id.startsWith('ztp-') || source?.datasetId === 'ztp-kmk-stops' ? 'municipal' : 'osm',
      label: place.sourceLabel || source?.publisher || 'Dane źródłowe', url: place.sourceUrl || source?.recordUrl || null },
    author: null, observedAt: null, recordUpdatedAt: source?.recordUpdatedAt || place.osmUpdatedAt || null,
    publishedAt: source?.importedAt || source?.fetchedAt || null, siteVerification: null };
}

function factView(evidence) {
  const known = evidence.filter(item => item.value !== null);
  const values = new Set(known.map(item => JSON.stringify(item.value)));
  return { value: values.size === 1 ? known[0].value : null,
    status: values.size > 1 ? 'conflict' : values.size === 0 ? 'unknown' : known.some(item => item.source.kind === 'user') ? 'unverified' : 'source-only',
    evidence };
}

function draftView(row) {
  return { id: row.id, placeId: row.place_id, draftVersion: row.version, baseRevision: row.base_revision,
    content: JSON.parse(row.content_json), createdAt: row.created_at, updatedAt: row.updated_at };
}

function version(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(400, 'INVALID_VERSION', `Podaj poprawną wersję ${label}.`);
  return value;
}

/** The source reader is captured before the root wires catalogue projections into the store. */
export function createPlacePassportService({ db, store, ...context }, options = {}) {
  ensurePlacePassportSchema(db);
  const readSourcePlace = store.place.bind(store), now = options.now ?? context.now ?? Date.now;
  const verification = options.siteVerification ?? context.siteVerification;
  const head = id => db.prepare('SELECT * FROM place_passports WHERE place_id=?').get(id);

  function evidenceView(row) {
    return { id: row.id, value: JSON.parse(row.value_json),
      source: { kind: 'user', label: row.source_label, url: row.source_url },
      author: { displayName: row.author_name }, observedAt: row.observed_at, recordUpdatedAt: null,
      publishedAt: row.published_at, siteVerification: verification?.getBadge(row.user_id, row.website_url) ?? null };
  }

  function getPassport(id) {
    const row = head(id), currentSource = readSourcePlace(id);
    if (!row && !currentSource) return null;
    const savedSource = row?.source_snapshot_json ? JSON.parse(row.source_snapshot_json) : null;
    const source = currentSource ?? (savedSource ? { ...savedSource, provenance: savedSource.provenance ? { ...savedSource.provenance, stale: true, syncStatus: 'missing' } : undefined } : null);
    const content = row ? JSON.parse(row.content_json) : { place: { name: source.name, category: source.category,
      address: source.address ?? '', coordinates: source.coordinates, website: source.website ?? null }, entrances: [] };
    const assertions = db.prepare('SELECT * FROM place_passport_evidence WHERE place_id=? AND retired_revision IS NULL ORDER BY created_revision,id').all(id);
    const externalFields = sourceFields(source);
    function fields(scope) {
      return Object.fromEntries(PASSPORT_FIELD_DEFINITIONS.map(({ key }) => {
        const external = scope === '$place' && source ? sourceEvidence(source, key, externalFields[key].value) : null;
        const evidence = [...(external ? [external] : []), ...assertions.filter(item => item.scope === scope && item.field_key === key).map(evidenceView)];
        return [key, factView(evidence)];
      }));
    }
    const metadataEvidence = Object.fromEntries(metadataKeys.map(key => {
      const original = source?.[key];
      const value = Array.isArray(original) ? JSON.stringify(original) : original ?? null;
      const external = source ? sourceEvidence(source, `place.${key}`, value) : null;
      return [key, [...(external ? [external] : []), ...assertions.filter(item => item.scope === '$metadata' && item.field_key === key).map(evidenceView)]];
    }));
    const place = Object.fromEntries(metadataKeys.map(key => {
      const latest = assertions.filter(item => item.scope === '$metadata' && item.field_key === key).at(-1);
      const chosen = latest ? JSON.parse(latest.value_json) : source?.[key] ?? content.place[key];
      return [key, key === 'coordinates' && typeof chosen === 'string' ? JSON.parse(chosen) : chosen];
    }));
    return { placeId: id, revision: row?.revision ?? 0, publishedAt: row?.published_at ?? null,
      place: { id, ...place }, fields: fields('$place'),
      entrances: content.entrances.map(entrance => ({ id: entrance.id, label: entrance.label, coordinates: entrance.coordinates,
        fields: fields(entrance.id), metadataEvidence: {
          label: assertions.filter(item => item.scope === entrance.id && item.field_key === '$label').map(evidenceView),
          coordinates: assertions.filter(item => item.scope === entrance.id && item.field_key === '$coordinates').map(evidenceView),
        } })), sourcePlace: source, metadataEvidence };
  }

  function draftContent(passport) {
    if (!passport) return emptyPassportContent();
    const copyFields = fields => Object.fromEntries(PASSPORT_FIELD_DEFINITIONS.map(({ key }) => [key,
      { value: fields[key].value, sourceLabel: null, sourceUrl: null, observedAt: null }]));
    const { id: _id, ...place } = passport.place;
    return { place, fields: copyFields(passport.fields), entrances: passport.entrances.map(entrance => ({
      id: entrance.id, label: entrance.label, coordinates: entrance.coordinates, fields: copyFields(entrance.fields) })) };
  }

  function ownedDraft(id, user) {
    const row = db.prepare('SELECT * FROM place_passport_drafts WHERE id=? AND user_id=?').get(id, user.id);
    if (!row) fail(404, 'DRAFT_NOT_FOUND', 'Nie znaleziono Twojego szkicu.');
    return row;
  }

  function createDraft(user, placeId) {
    if (placeId !== undefined && (typeof placeId !== 'string' || !placeId || placeId.length > 160))
      fail(400, 'INVALID_PASSPORT', 'Niepoprawny identyfikator obiektu.');
    if (placeId) {
      const previous = db.prepare('SELECT * FROM place_passport_drafts WHERE place_id=? AND user_id=?').get(placeId, user.id);
      if (previous) return draftView(previous);
    }
    if (db.prepare('SELECT count(*) AS n FROM place_passport_drafts WHERE user_id=?').get(user.id).n >= 50)
      fail(409, 'DRAFT_LIMIT', 'W prototypie możesz mieć maksymalnie 50 szkiców.');
    const passport = placeId ? getPassport(placeId) : null;
    if (placeId && !passport) fail(404, 'NOT_FOUND', 'Nie znaleziono obiektu.');
    const id = randomUUID(), targetId = placeId ?? `community-place-${randomUUID()}`;
    const content = JSON.stringify(draftContent(passport)), timestamp = new Date(now()).toISOString();
    db.prepare('INSERT INTO place_passport_drafts(id,place_id,user_id,version,base_revision,content_json,base_content_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, targetId, user.id, 1, passport?.revision ?? 0, content, content, timestamp, timestamp);
    return draftView(ownedDraft(id, user));
  }

  function saveDraft(id, user, body) {
    const expected = version(body.expectedDraftVersion, 'szkicu');
    ownedDraft(id, user);
    const content = validatePassportContent(body.content, { now: now() });
    const result = db.prepare('UPDATE place_passport_drafts SET content_json=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?')
      .run(JSON.stringify(content), new Date(now()).toISOString(), id, user.id, expected);
    if (!result.changes) fail(409, 'DRAFT_CONFLICT', 'Ten szkic zmienił się w innej karcie. Wczytaj jego aktualną wersję.',
      { draftVersion: ownedDraft(id, user).version });
    return draftView(ownedDraft(id, user));
  }

  // Apply the author's explicit changes to a fresh base. A rebase only saves a
  // draft: reviewing it and publishing remain separate user actions.
  function rebaseDraft(id, user, body) {
    const expectedDraft = version(body.expectedDraftVersion, 'szkicu');
    const expectedPublished = version(body.expectedPublishedRevision, 'publikacji');
    db.exec('BEGIN IMMEDIATE');
    try {
      const draft = ownedDraft(id, user), current = getPassport(draft.place_id);
      if (draft.version !== expectedDraft) fail(409, 'DRAFT_CONFLICT', 'Szkic zmienił się w innej karcie. Wczytaj aktualną wersję.', { draftVersion: draft.version });
      if (!current || current.revision !== expectedPublished)
        fail(409, 'PASSPORT_CONFLICT', 'Obiekt zmienił się ponownie. Wczytaj aktualną wersję przed połączeniem zmian.', { currentRevision: current?.revision ?? 0 });
      const fresh = draftContent(current), merged = structuredClone(fresh);
      const base = JSON.parse(draft.base_content_json), ours = JSON.parse(draft.content_json);
      for (const key of metadataKeys) if (!same(base.place[key], ours.place[key])) merged.place[key] = ours.place[key];
      const mergeFields = (target, before, after) => {
        for (const { key } of PASSPORT_FIELD_DEFINITIONS)
          if (!same(before?.[key] ?? emptyPassportFields()[key], after[key])) target[key] = after[key];
      };
      mergeFields(merged.fields, base.fields, ours.fields);
      for (const entrance of ours.entrances) {
        const previous = base.entrances.find(item => item.id === entrance.id);
        let target = merged.entrances.find(item => item.id === entrance.id);
        if (!previous) {
          if (target) fail(409, 'ENTRANCE_CONFLICT', 'To samo wejście zostało dodane w dwóch szkicach. Nadaj nowemu wejściu osobny identyfikator.');
          merged.entrances.push(structuredClone(entrance));
          continue;
        }
        if (!target) {
          if (same(previous, entrance)) continue;
          // An explicitly edited entrance remains in the author's draft even
          // when another revision removed it. The preview exposes that choice.
          target = { ...structuredClone(entrance), fields: emptyPassportFields() };
          merged.entrances.push(target);
        }
        for (const key of ['label', 'coordinates']) if (!same(previous[key], entrance[key])) target[key] = entrance[key];
        mergeFields(target.fields, previous.fields, entrance.fields);
      }
      const removed = new Set(base.entrances.filter(item => !ours.entrances.some(entrance => entrance.id === item.id)).map(item => item.id));
      merged.entrances = merged.entrances.filter(item => !removed.has(item.id));
      validatePassportContent(merged, { now: now() });
      db.prepare('UPDATE place_passport_drafts SET version=version+1,base_revision=?,content_json=?,base_content_json=?,updated_at=? WHERE id=? AND user_id=?')
        .run(expectedPublished, JSON.stringify(merged), JSON.stringify(fresh), new Date(now()).toISOString(), id, user.id);
      const saved = draftView(ownedDraft(id, user));
      db.exec('COMMIT');
      return saved;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function publishDraft(id, user, body) {
    const expectedDraft = version(body.expectedDraftVersion, 'szkicu');
    const expectedPublished = version(body.expectedPublishedRevision, 'publikacji');
    db.exec('BEGIN IMMEDIATE');
    let result;
    try {
      const draft = ownedDraft(id, user), current = head(draft.place_id);
      if (draft.version !== expectedDraft) fail(409, 'DRAFT_CONFLICT', 'Szkic zmienił się w innej karcie. Wczytaj aktualną wersję.', { draftVersion: draft.version });
      if ((current?.revision ?? 0) !== expectedPublished || draft.base_revision !== expectedPublished)
        fail(409, 'PASSPORT_CONFLICT', 'Inna osoba opublikowała nową wersję obiektu. Twój szkic został zachowany. Wczytaj aktualne dane i porównaj zmiany.',
          { currentRevision: current?.revision ?? 0, baseRevision: draft.base_revision });
      const timestamp = new Date(now()).toISOString(), revision = expectedPublished + 1;
      const content = validatePassportContent(JSON.parse(draft.content_json), { publish: true, now: now() });
      const base = JSON.parse(draft.base_content_json), changes = [];
      const authorName = typeof user.displayName === 'string' && user.displayName.trim() ? user.displayName.trim().slice(0, 60) : 'Użytkownik';
      const retire = db.prepare('UPDATE place_passport_evidence SET retired_revision=? WHERE place_id=? AND scope=? AND field_key=? AND user_id=? AND retired_revision IS NULL');
      const insert = db.prepare('INSERT INTO place_passport_evidence(id,place_id,scope,field_key,value_json,source_label,source_url,user_id,author_name,observed_at,website_url,published_at,created_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const writeEvidence = (scope, key, input, path) => {
        retire.run(revision, draft.place_id, scope, key, user.id);
        insert.run(randomUUID(), draft.place_id, scope, key, JSON.stringify(input.value),
          input.sourceLabel ?? 'Dane dodane przez użytkownika', input.sourceUrl ?? null,
          user.id, authorName, input.observedAt ?? null, content.place.website, timestamp, revision);
        changes.push(path);
      };
      for (const key of metadataKeys) {
        if (!same(content.place[key], base.place[key])) writeEvidence('$metadata', key,
          { value: Array.isArray(content.place[key]) ? JSON.stringify(content.place[key]) : content.place[key] }, `place.${key}`);
      }
      const changedFields = (scope, fields, previous, prefix) => {
        for (const { key } of PASSPORT_FIELD_DEFINITIONS)
          if (!same(fields[key], previous?.[key] ?? emptyPassportFields()[key])) writeEvidence(scope, key, fields[key], `${prefix}.${key}`);
      };
      changedFields('$place', content.fields, base.fields, 'fields');
      for (const entrance of content.entrances) {
        const previous = base.entrances.find(item => item.id === entrance.id);
        for (const key of ['label', 'coordinates']) if (!previous || !same(entrance[key], previous[key]))
          writeEvidence(entrance.id, `$${key}`, { value: Array.isArray(entrance[key]) ? JSON.stringify(entrance[key]) : entrance[key] }, `entrances.${entrance.id}.${key}`);
        changedFields(entrance.id, entrance.fields, previous?.fields, `entrances.${entrance.id}.fields`);
      }
      for (const previous of base.entrances) if (!content.entrances.some(item => item.id === previous.id)) changes.push(`entrances.${previous.id}.removed`);
      const serialized = JSON.stringify(content), source = readSourcePlace(draft.place_id);
      db.prepare(`INSERT INTO place_passports(place_id,revision,content_json,source_snapshot_json,created_at,published_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(place_id) DO UPDATE SET revision=excluded.revision,content_json=excluded.content_json,
        source_snapshot_json=COALESCE(excluded.source_snapshot_json,place_passports.source_snapshot_json),published_at=excluded.published_at`)
        .run(draft.place_id, revision, serialized, source ? JSON.stringify(source) : null, timestamp, timestamp);
      db.prepare('INSERT INTO place_passport_revisions(place_id,revision,user_id,author_name,content_json,changes_json,published_at) VALUES(?,?,?,?,?,?,?)')
        .run(draft.place_id, revision, user.id, authorName, serialized, JSON.stringify(changes), timestamp);
      db.prepare('UPDATE place_passport_drafts SET version=version+1,base_revision=?,content_json=?,base_content_json=?,updated_at=? WHERE id=? AND user_id=?')
        .run(revision, serialized, serialized, timestamp, id, user.id);
      result = { passport: getPassport(draft.place_id), draft: draftView(ownedDraft(id, user)) };
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return result;
  }

  function getPlace(id) {
    const passport = getPassport(id);
    if (!passport) return null;
    if (!passport.revision) return passport.sourcePlace;
    const base = passport.sourcePlace ?? {};
    const value = key => passport.fields[key].value;
    return { ...base, ...passport.place,
      description: value('entranceNotes') ?? base.description ?? 'Informacje o obiekcie dodane przez użytkowników.',
      access: { ...(base.access ?? {}), wheelchair: value('wheelchair') ?? 'unknown', widthCm: value('widthCm'),
        thresholdCm: value('thresholdCm'), stepFree: value('steps') === 'no' ? true : value('steps') === 'yes' ? false : null,
        surface: value('surface'), toilet: value('toilet') ?? 'unknown', entranceNotes: value('entranceNotes') ?? '' },
      openingHours: value('openingHours'), passportRevision: passport.revision,
      passportUrl: `/embed/places/${encodeURIComponent(id)}`,
      // The projection combines sources. Do not label newly edited fields as
      // an OSM/ZTP record or reuse a source's verification date for them.
      provenance: undefined,
      sourceLabel: 'Paszport obiektu · źródła i autorzy przy poszczególnych informacjach',
      sourceUrl: passport.place.website ?? '', verifiedAt: null,
      coordinateKind: same(passport.place.coordinates, base.coordinates) ? base.coordinateKind ?? 'source-point' : 'source-point' };
  }

  function publishedPlaces() {
    return db.prepare('SELECT place_id FROM place_passports ORDER BY place_id').all().map(row => getPlace(row.place_id));
  }

  return {
    getPassport, getPlace, publishedPlaces,
    projectPlaces(places) { const merged = new Map(places.map(place => [place.id, place])); for (const place of publishedPlaces()) merged.set(place.id, place); return [...merged.values()]; },
    createDraft, saveDraft, rebaseDraft, publishDraft,
    getDraft: (id, user) => draftView(ownedDraft(id, user)),
    mine(user) {
      const drafts = db.prepare('SELECT * FROM place_passport_drafts WHERE user_id=? ORDER BY updated_at DESC,id').all(user.id).map(draftView);
      const places = db.prepare('SELECT DISTINCT p.place_id,p.revision,p.published_at,p.content_json FROM place_passports p JOIN place_passport_revisions r ON p.place_id=r.place_id WHERE r.user_id=? ORDER BY p.published_at DESC').all(user.id)
        .map(row => ({ placeId: row.place_id, name: JSON.parse(row.content_json).place.name, revision: row.revision, publishedAt: row.published_at }));
      return { drafts, places };
    },
    history(id) {
      if (!getPassport(id)) fail(404, 'NOT_FOUND', 'Nie znaleziono obiektu.');
      return { placeId: id, revisions: db.prepare('SELECT revision,author_name,changes_json,published_at FROM place_passport_revisions WHERE place_id=? ORDER BY revision DESC').all(id)
        .map(row => ({ revision: row.revision, publishedAt: row.published_at, author: { displayName: row.author_name }, changedFields: JSON.parse(row.changes_json) })) };
    },
    revision(id, number) {
      if (!Number.isSafeInteger(number) || number < 1) fail(400, 'INVALID_VERSION', 'Podaj poprawny numer opublikowanej wersji.');
      const row = db.prepare('SELECT revision,author_name,content_json,changes_json,published_at FROM place_passport_revisions WHERE place_id=? AND revision=?').get(id, number);
      if (!row) fail(404, 'NOT_FOUND', 'Nie znaleziono opublikowanej wersji.');
      return { placeId: id, revision: row.revision, publishedAt: row.published_at, author: { displayName: row.author_name },
        changedFields: JSON.parse(row.changes_json), content: JSON.parse(row.content_json) };
    },
  };
}

export function registerPlacePassportRoutes(app, context, options = {}) {
  const service = createPlacePassportService(context, options);
  app.use('/api/place-passports', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function owner(req) {
    const user = context.getUser(req);
    if (!user) fail(401, 'AUTH_REQUIRED', 'Zaloguj się, aby dodać obiekt lub poprawić jego dane.');
    const expected = req.method === 'GET' ? req.query.expectedUserId : req.body?.expectedUserId;
    if (expected !== undefined && expected !== user.id) fail(409, 'ACCOUNT_CHANGED', 'Konto zmieniło się w innej karcie. Wczytaj widok ponownie.');
    return user;
  }
  app.get('/api/place-passports/mine', (req, res) => res.json(service.mine(owner(req))));
  app.post('/api/place-passports/drafts', (req, res) => res.status(201).json(service.createDraft(owner(req), req.body?.placeId)));
  app.get('/api/place-passports/drafts/:id', (req, res) => res.json(service.getDraft(req.params.id, owner(req))));
  app.put('/api/place-passports/drafts/:id', (req, res) => res.json(service.saveDraft(req.params.id, owner(req), req.body ?? {})));
  app.post('/api/place-passports/drafts/:id/rebase', (req, res) => res.json(service.rebaseDraft(req.params.id, owner(req), req.body ?? {})));
  app.post('/api/place-passports/drafts/:id/publish', (req, res) => res.json(service.publishDraft(req.params.id, owner(req), req.body ?? {})));
  app.get('/api/place-passports/:placeId/history', (req, res) => res.json(service.history(req.params.placeId)));
  app.get('/api/place-passports/:placeId/history/:revision', (req, res) => res.json(service.revision(req.params.placeId, Number(req.params.revision))));
  app.get('/api/place-passports/:placeId', (req, res) => {
    const passport = service.getPassport(req.params.placeId);
    if (!passport) fail(404, 'NOT_FOUND', 'Nie znaleziono obiektu.');
    res.json(passport);
  });
  return service;
}
