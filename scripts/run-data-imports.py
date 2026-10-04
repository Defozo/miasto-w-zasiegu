"""Scheduled ZTP and OSM refresh. No credentials, no modification of community data.

Windows Task Scheduler invokes this file directly through the OSM virtualenv.
OSM builds a complete generation, tests it, then atomically switches one pointer.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'server/data'
RUNTIME = ROOT / 'artifacts/runtime/imports'
POINTER = DATA / 'osm-current.json'
URL = 'https://download.geofabrik.de/europe/poland/malopolskie-latest.osm.pbf'
FILES = ('places.json', 'parkings.json', 'parking-access.json', 'locations.json', 'accessibility.json', 'accessibility.sqlite')


def now():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f'.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


@contextmanager
def job_lock(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as lock:
        lock.seek(0)
        if os.name == 'nt':
            import msvcrt
            if path.stat().st_size == 0:
                lock.write(b'0')
                lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def run(command, log, timeout=3600):
    log.write('\n' + json.dumps({'at': now(), 'command': [str(c) for c in command]}) + '\n')
    log.flush()
    result = subprocess.run([str(c) for c in command], cwd=ROOT, stdout=log, stderr=log, timeout=timeout,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    if result.returncode:
        raise RuntimeError(f'{Path(command[0]).name} {Path(command[1]).name} exited {result.returncode}; see run log')


def download_pbf(target):
    with urllib.request.urlopen(URL + '.md5', timeout=60) as response:
        checksum = response.read(2048).decode('ascii').split()[0].lower()
    if not re.fullmatch('[0-9a-f]{32}', checksum):
        raise ValueError('Invalid published checksum')
    digest, sha, size = hashlib.md5(), hashlib.sha256(), 0
    with urllib.request.urlopen(URL, timeout=120) as response, target.open('wb') as output:
        length = int(response.headers.get('Content-Length', 0))
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > 1024 ** 3:
                raise ValueError('OSM download exceeded 1 GiB limit')
            output.write(chunk)
            digest.update(chunk)
            sha.update(chunk)
    if (length and length != size) or size < 1024 ** 2 or digest.hexdigest() != checksum:
        raise ValueError('Incomplete OSM download or checksum mismatch; previous generation preserved')
    return {'url': URL, 'downloadedAt': now(), 'bytes': size, 'md5': checksum, 'sha256': sha.hexdigest()}


def active_directory(data=DATA):
    pointer = data / 'osm-current.json'
    if not pointer.exists():
        return data
    current = read_json(pointer)
    if current.get('schemaVersion') != 1 or not re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{8}', current.get('generation', '')):
        raise ValueError('Invalid OSM generation pointer')
    return data / 'osm-generations' / current['generation']


def validate_generation(directory, previous):
    counts, stamps = {}, []
    for filename, field in [('places.json', 'places'), ('parkings.json', 'places'), ('locations.json', 'locations'), ('accessibility.json', 'features')]:
        value = read_json(directory / filename)
        rows = value[field]
        if not isinstance(rows, list) or not rows or len({row['id'] for row in rows}) != len(rows):
            raise ValueError(f'Empty or duplicate records in {filename}')
        if field != 'features':
            for row in rows:
                p = row.get('coordinates')
                if not isinstance(p, list) or len(p) != 2 or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in p):
                    raise ValueError(f'Invalid coordinates in {filename}')
        if previous and (previous / filename).exists():
            old = read_json(previous / filename)
            if len(rows) < len(old[field]) * .7:
                raise ValueError(f'Unexpected record drop in {filename}; manual review required')
            old_stamp = old['source'].get('snapshotDate') or old['source'].get('snapshotAt')
            new_stamp = value['source'].get('snapshotDate') or value['source'].get('snapshotAt')
            if old_stamp and new_stamp and datetime.fromisoformat(new_stamp.replace('Z', '+00:00')) < datetime.fromisoformat(old_stamp.replace('Z', '+00:00')):
                raise ValueError('Source snapshot moved backwards')
        counts[filename] = len(rows)
        stamps.append(value['source'].get('snapshotDate') or value['source'].get('snapshotAt'))
    overlay = read_json(directory / 'parking-access.json')
    stamps.append(overlay['snapshotAt'])
    if len(set(stamps)) != 1 or not stamps[0]:
        raise ValueError('OSM layers use different snapshots')
    stamp = datetime.fromisoformat(stamps[0].replace('Z', '+00:00'))
    age = datetime.now(timezone.utc) - stamp
    if not -timedelta(minutes=5) <= age <= timedelta(days=8):
        raise ValueError('OSM snapshot is stale or future-dated')
    parking_ids = {p['id'] for p in read_json(directory / 'parkings.json')['places']}
    if set(overlay['records']) != parking_ids:
        raise ValueError('Parking topology does not cover the imported parking set')
    with sqlite3.connect((directory / 'accessibility.sqlite').as_uri() + '?mode=ro', uri=True) as db:
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('SELECT count(*) FROM features').fetchone()[0] != counts['accessibility.json']:
            raise ValueError('Accessibility index is incomplete')
        if json.loads(db.execute('SELECT data FROM metadata').fetchone()[0])['snapshotAt'] != stamps[0]:
            raise ValueError('Accessibility index uses a different snapshot')
    return {'counts': counts, 'snapshotAt': stamps[0]}


def verify_live(generation, base='http://127.0.0.2:4180', attempts=40):
    for _ in range(attempts):
        try:
            # A film review has a separate 127.0.0.1 listener on the same port.
            # This loopback address reaches the public wildcard listener while
            # the Host header still satisfies its ingress allowlist.
            request = urllib.request.Request(base + '/api/health', headers={'Host': 'localhost'} if base.startswith('http://127.0.0.2:') else {})
            with urllib.request.urlopen(request, timeout=10) as response:
                health = json.load(response)
            if health.get('database') == 'ready' and health.get('osmGeneration') == generation and health.get('places', 0) > 1000 and health.get('accessibilityFeatures', 0) > 1000:
                return health
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise RuntimeError(f'API did not load generation {generation}')


def activate_generation(pointer, value, restart, verify):
    before = read_json(pointer) if pointer.exists() else None
    atomic_json(pointer, value)
    try:
        restart()
        return verify(value['generation'])
    except Exception:
        if before is None:
            pointer.unlink(missing_ok=True)
        else:
            atomic_json(pointer, before)
        restart()
        verify(before['generation'] if before else None)
        raise


def import_ztp(log, phase):
    failures, result = [], {}
    for dataset in ('stops', 'parkings'):
        phase('import-' + dataset)
        try:
            run(['node', f'scripts/import-municipal-{dataset}.mjs'], log, timeout=600)
            data = read_json(DATA / f'municipal-{dataset}.json')
            if data['sync']['status'] != 'success' or not data['places']:
                raise ValueError('Import did not return a successful snapshot')
            result[dataset] = {'count': len(data['places']), 'lastSuccessAt': data['sync']['lastSuccessAt']}
        except Exception as error:
            failures.append(str(error))
    if failures:
        raise RuntimeError('; '.join(failures))
    return result


def import_osm(log, phase, run_id):
    directory = DATA / 'osm-generations' / run_id
    directory.mkdir(parents=True)
    pbf = directory / 'source.osm.pbf'
    phase('download')
    download = download_pbf(pbf)
    atomic_json(directory / 'download.json', download)
    phase('places')
    run([sys.executable, 'scripts/import-pois.py', '--input', pbf, '--output', directory / 'places.json'], log)
    # Same parser and source: derive parking rows without a second full PBF pass.
    places = read_json(directory / 'places.json')
    parkings = {**places, 'places': [p for p in places['places'] if p.get('placeType') == 'parking']}
    atomic_json(directory / 'parkings.json', parkings)
    del places, parkings
    for label, script, extra, output in [
        ('parking-topology', 'scripts/import-parking-access.py', ['--parkings', directory / 'parkings.json'], 'parking-access.json'),
        ('addresses', 'server/import-locations.py', [], 'locations.json'),
        ('accessibility', 'scripts/import-accessibility.py', [], 'accessibility.json'),
    ]:
        phase(label)
        run([sys.executable, script, '--input', pbf, '--output', directory / output, *extra], log)
    return activate_prepared_osm(log, phase, run_id)


def activate_prepared_osm(log, phase, generation):
    if not re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{8}', generation):
        raise ValueError('Invalid generation identifier')
    directory = DATA / 'osm-generations' / generation
    download = read_json(directory / 'download.json')
    phase('validation')
    validation = validate_generation(directory, active_directory())
    run(['node', 'scripts/check-import-generation.mjs', directory], log, timeout=120)
    atomic_json(directory / 'validation.json', validation)
    (directory / 'source.osm.pbf').unlink(missing_ok=True)  # The ORS source stays intact.
    phase('activation')
    restart = lambda: run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/restart-public-for-import.ps1'], log, timeout=90)
    health = activate_generation(POINTER, {'schemaVersion': 1, 'generation': generation, 'activatedAt': now(), **validation}, restart, verify_live)
    phase('public-verification')
    public = verify_live(generation, 'https://miastowzasiegu.pl', attempts=3)
    return {'generation': generation, **validation, 'download': download, 'publicHealth': public, 'localHealth': health}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', choices=['ztp', 'osm'])
    parser.add_argument('--resume-generation', help='Revalidate and activate an already prepared OSM generation without downloading again')
    args = parser.parse_args()
    if args.resume_generation and args.job != 'osm':
        parser.error('--resume-generation applies only to OSM')
    RUNTIME.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8]
    status_path = RUNTIME / (args.job + '.json')
    try:
        with job_lock(RUNTIME / (args.job + '.lock')):
            previous = read_json(status_path) if status_path.exists() else {}
            state = {'job': args.job, 'runId': run_id, 'status': 'running', 'startedAt': now(),
                     'lastSuccessAt': previous.get('lastSuccessAt'), 'lastSuccessfulResult': previous.get('lastSuccessfulResult')}
            def phase(value):
                state.update(phase=value, updatedAt=now())
                atomic_json(status_path, state)
            phase('starting')
            with (RUNTIME / f'{args.job}-{run_id}.log').open('w', encoding='utf-8') as log:
                try:
                    result = import_ztp(log, phase) if args.job == 'ztp' else (
                        activate_prepared_osm(log, phase, args.resume_generation) if args.resume_generation else import_osm(log, phase, run_id))
                    state.update(status='success', result=result, lastSuccessfulResult=result, lastSuccessAt=now(), error=None)
                except Exception as error:
                    state.update(status='error', error=str(error))
                state.update(finishedAt=now())
                atomic_json(status_path, state)
                atomic_json(RUNTIME / f'{args.job}-{run_id}.json', state)
            print(json.dumps(state, ensure_ascii=False))
            return 0 if state['status'] == 'success' else 1
    except OSError as error:
        print(json.dumps({'job': args.job, 'status': 'locked-or-unavailable', 'error': str(error)}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
