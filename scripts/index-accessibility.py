"""Build an indexed, read-only-at-runtime snapshot from the OSM GeoJSON import."""
import json
import sqlite3
from pathlib import Path


def build_index(source):
    source = Path(source)
    target = source.with_suffix('.sqlite')
    temporary = source.with_suffix('.building.sqlite')
    temporary.unlink(missing_ok=True)
    data = json.loads(source.read_text(encoding='utf-8'))
    db = sqlite3.connect(temporary)
    db.executescript('CREATE TABLE metadata(data TEXT NOT NULL); CREATE TABLE features(rowid INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL); CREATE VIRTUAL TABLE bounds USING rtree(rowid,min_x,max_x,min_y,max_y);')
    db.execute('INSERT INTO metadata VALUES(?)', (json.dumps(data['source']),))
    for i, f in enumerate(data['features'], 1):
        ps = [f['geometry']['coordinates']] if f['geometry']['type'] == 'Point' else f['geometry']['coordinates']
        xs, ys = [p[0] for p in ps], [p[1] for p in ps]
        db.execute('INSERT INTO features VALUES(?,?,?,?)', (i, f['id'], f['properties']['kind'], json.dumps(f, ensure_ascii=False, separators=(',', ':'))))
        db.execute('INSERT INTO bounds VALUES(?,?,?,?,?)', (i, min(xs), max(xs), min(ys), max(ys)))
    db.commit()
    count = len(data['features'])
    db.close()
    temporary.replace(target)
    print(json.dumps({'indexed': count, 'path': str(target), 'bytes': target.stat().st_size}))


if __name__ == '__main__':
    build_index(Path(__file__).resolve().parents[1] / 'server/data/accessibility.json')
