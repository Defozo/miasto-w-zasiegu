"""Check the actual APK package and compiled backend before distributing it."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('apk', type=Path)
parser.add_argument('--package', required=True)
parser.add_argument('--backend', required=True)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
sdk = Path(os.environ.get('ANDROID_HOME') or Path(os.environ['LOCALAPPDATA']) / 'Android/Sdk')
aapt = sorted((sdk / 'build-tools').glob('*/aapt.exe'), reverse=True)[0]
badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
package = re.search(r"package: name='([^']+)'", badging).group(1)
with zipfile.ZipFile(args.apk) as archive:
    dex = b''.join(archive.read(name) for name in archive.namelist() if name.endswith('.dex'))
known_backends = ['http://127.0.0.1:3081', 'http://127.0.0.1:3082', 'http://10.0.2.2:3081', 'https://miastowzasiegu.pl']
found = [url for url in known_backends if url.encode() in dex]
if args.backend.encode() not in dex or package != args.package or any(url != args.backend for url in found):
    raise SystemExit(f'APK configuration mismatch: package={package}, compiled backends={found}')
with args.apk.open('rb') as file:
    digest = hashlib.file_digest(file, 'sha256').hexdigest()
result = {'apk': str(args.apk.resolve()), 'package': package, 'backend': args.backend, 'sha256': digest}
encoded = json.dumps(result, ensure_ascii=False, indent=2)
if args.output:
    args.output.write_text(encoded + '\n', encoding='utf-8')
print(encoded)
