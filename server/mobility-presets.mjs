import { randomUUID } from 'node:crypto';
import { requireUser, validateProfile } from './auth.mjs';
import { ApiError } from './routing.mjs';

export const EQUIPMENT_KINDS = ['manual', 'power', 'walker', 'stroller', 'walking'];
const text = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const url = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
export function cleanEquipment(raw) {
  if (!raw) return null;
  return { name: text(raw.name), manufacturer: text(raw.manufacturer), variant: text(raw.variant, 300),
    parameters: (Array.isArray(raw.parameters) ? raw.parameters : []).slice(0, 12).map(p => ({
      label: text(p.label), value: text(p.value, 200), sourceUrl: url(p.sourceUrl), quote: text(p.quote, 220),
      origin: p.origin === 'measurement' ? 'measurement' : 'documentation', checkedAt: text(p.checkedAt, 40),
    })).filter(p => p.label && p.value) };
}
export function validatePresets(body) {
  if (!Array.isArray(body?.presets) || body.presets.length > 12) throw new ApiError(400, 'INVALID_PRESETS', 'Możesz zapisać do 12 zestawów.');
  const ids = new Set();
  const presets = body.presets.map(p => {
    if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) || ids.has(p.id) || !EQUIPMENT_KINDS.includes(p.kind) || !text(p.name, 80))
      throw new ApiError(400, 'INVALID_PRESETS', 'Sprawdź nazwę i rodzaj każdego zestawu.');
    ids.add(p.id);
    const profile = validateProfile({ ...p.profile, mobility: p.kind === 'walker' ? 'walking' : p.kind });
    return { id: p.id, name: text(p.name, 80), kind: p.kind, profile, equipment: cleanEquipment(p.equipment) };
  });
  const activePresetId = body.activePresetId ?? null;
  if ((presets.length && !ids.has(activePresetId)) || (!presets.length && activePresetId !== null))
    throw new ApiError(400, 'INVALID_PRESETS', 'Wybierz aktywny zestaw.');
  return { presets, activePresetId, usesCar: body.usesCar === true };
}
export function registerMobilityPresets(app, { db }) {
  db.exec('CREATE TABLE IF NOT EXISTS mobility_presets (user_id TEXT PRIMARY KEY, document TEXT NOT NULL)');
  function read(userId) {
    const user = db.prepare('SELECT profile_json,profile_version FROM users WHERE id=?').get(userId);
    if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Zaloguj się ponownie.');
    const row = db.prepare('SELECT document FROM mobility_presets WHERE user_id=?').get(userId);
    let doc = row ? JSON.parse(row.document) : { presets: [], activePresetId: null, usesCar: false };
    if (!row && user.profile_json) {
      const profile = JSON.parse(user.profile_json);
      doc = { ...doc, presets: [{ id: 'legacy', name: 'Mój zestaw', kind: profile.mobility, profile, equipment: null }], activePresetId: 'legacy' };
    }
    return { ...doc, version: user.profile_version };
  }
  function save(userId, raw, expectedVersion) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new ApiError(400, 'INVALID_VERSION', 'Brak wersji zestawów.');
    const document = validatePresets(raw);
    const current = read(userId);
    if (current.version !== expectedVersion) throw new ApiError(409, 'PRESET_CONFLICT', 'Zestawy zmieniły się na innym urządzeniu. Wczytaj aktualne dane przed zapisaniem.', current);
    const active = document.presets.find(p => p.id === document.activePresetId);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = db.prepare('UPDATE users SET profile_json=?,profile_version=profile_version+1 WHERE id=? AND profile_version=?')
        .run(active ? JSON.stringify(active.profile) : null, userId, expectedVersion);
      if (!result.changes) throw new ApiError(409, 'PRESET_CONFLICT', 'Zestawy zmieniły się na innym urządzeniu.');
      db.prepare('INSERT INTO mobility_presets VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET document=excluded.document').run(userId, JSON.stringify(document));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ...document, version: expectedVersion + 1 };
  }
  function saveLegacy(userId, profile, version) {
    const doc = read(userId);
    if (doc.version !== version) throw new ApiError(409, 'PROFILE_CONFLICT', 'Profil zmienił się na innym urządzeniu.', { profile: doc.presets.find(p => p.id === doc.activePresetId)?.profile || null, profileVersion: doc.version });
    const id = doc.activePresetId || randomUUID();
    const old = doc.presets.find(p => p.id === id);
    const kind = old?.kind === 'walker' && profile.mobility === 'walking' ? 'walker' : profile.mobility;
    const preset = { ...old, id, name: old?.name || 'Mój zestaw', kind, profile, equipment: old?.equipment || null };
    const next = save(userId, { ...doc, presets: [...doc.presets.filter(p => p.id !== id), preset], activePresetId: id }, version);
    return { profile, profileVersion: next.version };
  }
  app.get('/api/mobility-presets', (req, res) => res.json(read(requireUser(req).id)));
  app.put('/api/mobility-presets', (req, res) => res.json(save(requireUser(req).id, req.body, req.body?.expectedVersion)));
  return { read, save, saveLegacy };
}
