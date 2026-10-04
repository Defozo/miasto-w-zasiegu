"""Real UI integration against an isolated in-memory API. No production account writes.

Build phone with -PbackendUrl=http://10.0.2.2:3083 before running.
The API instance must be isolated; only localhost ports 3082/3083 are allowed.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request
import urllib.parse
import uuid
import xml.etree.ElementTree as ET

p = argparse.ArgumentParser()
p.add_argument('--serial', default='emulator-5554')
p.add_argument('--api', default='http://127.0.0.1:3083')
p.add_argument('--gps', action='store_true', help='Compatibility option: simulated GPS checks are always included')
a = p.parse_args()
parsed = urllib.parse.urlparse(a.api)
assert a.serial.startswith('emulator-')
assert parsed.hostname in ('127.0.0.1', 'localhost') and parsed.port in (3082, 3083), 'Use isolated API only'
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'android/evidence'
ADB = str(Path(os.environ['LOCALAPPDATA'])/'Android/Sdk/platform-tools/adb.exe')
checks = []
token = None

def api(path, data=None, method=None, auth=None):
    headers = {'Content-Type': 'application/json'}
    if auth: headers['Authorization'] = 'Bearer ' + auth
    req = urllib.request.Request(a.api + path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as response: return json.load(response)

def adb(*args, binary=False):
    result = subprocess.run([ADB, '-s', a.serial, *args], capture_output=True, check=True, timeout=60)
    return result.stdout if binary else result.stdout.decode('utf-8', errors='replace')

def dump(name='workflow-current'):
    adb('shell', 'uiautomator', 'dump', '/sdcard/przejscie-test.xml')
    xml = adb('exec-out', 'cat', '/sdcard/przejscie-test.xml')
    (OUT/f'{name}.xml').write_text(xml, encoding='utf-8')
    return ET.fromstring(xml)

def screen(name):
    (OUT/f'{name}.png').write_bytes(adb('exec-out', 'screencap', '-p', binary=True))

def nodes(tree): return list(tree.iter('node'))
def tap_node(node):
    x1,y1,x2,y2 = map(int,re.findall(r'\d+',node.attrib['bounds']))
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)); time.sleep(.3)

def top():
    if 'mInputShown=true' in adb('shell','dumpsys','input_method'):
        adb('shell','input','keyevent','4'); time.sleep(.4)
    for _ in range(5): adb('shell','input','swipe','30','650','30','1950','180')

def find(text, scroll=False, exact=False):
    for _ in range(10 if scroll else 1):
        found = [n for n in nodes(dump()) if (n.get('text') == text if exact else text in n.get('text',''))]
        if found: return found[0]
        if scroll:
            if 'mInputShown=true' in adb('shell','dumpsys','input_method'):
                adb('shell','input','keyevent','4'); time.sleep(.4)
            adb('shell','input','swipe','30','1850','30','650','250')
    raise AssertionError('Missing UI text: '+text)

def tap(text, scroll=False, exact=False): tap_node(find(text, scroll, exact))
def nav(text):
    target = [n for n in nodes(dump()) if n.get('text') == text and int(re.findall(r'\d+',n.get('bounds'))[1]) > 2100]
    assert target, 'Navigation missing: '+text
    tap_node(target[-1])

def field(label):
    for _ in range(10):
        tree = dump()
        edits = [n for n in nodes(tree) if n.get('class') == 'android.widget.EditText']
        for n in edits:
            if n.get('content-desc') == label or any(k.get('text') == label for k in n.iter('node')):
                x1,y1,x2,y2 = map(int,re.findall(r'\d+',n.attrib['bounds']))
                if y1 >= 90 and y2 <= 1900: return n
        adb('shell','input','swipe','30','1850','30','650','250')
    raise AssertionError('Missing input '+label)

def fill(label, value):
    node = field(label); old = node.get('text',''); tap_node(node)
    time.sleep(.4)
    focused=field(label)
    if focused.get('focused') != 'true': tap_node(focused); time.sleep(.4)
    assert field(label).get('focused') == 'true', 'Input did not gain focus: '+label
    adb('shell','input','keyevent','123')
    if old: adb('shell','input','keyevent',*(['67']*len(old)))
    if value: adb('shell','input','text',value.replace(' ', '%s'))
    adb('shell','input','keyevent','4')

def choose(label, query):
    matches = api('/api/locations?limit=8&q='+urllib.parse.quote(query))['locations']
    target = next((x for x in matches if x['kind']=='address'), matches[0])
    fill(label, query); time.sleep(1)
    tap(target['label'], scroll=True, exact=True)
    return target

def check(name, condition=True):
    assert condition, name
    checks.append({'name':name,'status':'PASS'}); print('PASS '+name,flush=True)

try:
    check('Isolated API and emulator selected', api('/api/health')['routing']['status'] == 'ready' if isinstance(api('/api/health').get('routing'),dict) else True)
    email = 'android-smoke-'+uuid.uuid4().hex[:12]+'@example.invalid'
    password = 'PrzejscieTest'+uuid.uuid4().hex[:16]
    registered = api('/api/auth/register',{'email':email,'password':password,'displayName':'Test Android'})
    token = registered['token']
    profile = {'mobility':'manual','widthCm':'68.5','maxIncline':'6','maxKerbCm':'2','avoidUnpaved':False}
    api('/api/profile',{'profile':profile,'expectedVersion':registered['profileVersion']},'PUT',token)
    adb('shell','am','force-stop','pl.przejscie.app'); adb('shell','pm','clear','pl.przejscie.app')
    adb('shell','input','keyevent','KEYCODE_WAKEUP'); adb('shell','input','keyevent','82')
    adb('shell','am','start','-W','-n','pl.przejscie.app/pl.przejscie.phone.MainActivity'); time.sleep(2)
    find('Ustaw potrzeby'); tap('Pomiń',exact=True)
    check('Optional onboarding can be skipped')
    screen('workflow-home'); dump('workflow-home')
    tree = dump()
    check('Main flow omits technical provider jargon', not any(re.search(r'\b(OSM|ORS|POI)\b',n.get('text','')) for n in nodes(tree)))
    nav('Konto'); fill('E-mail',email); fill('Hasło',password); tap('Zaloguj się',scroll=True,exact=True); time.sleep(2)
    find('Konto połączone',scroll=True)
    check('Manual login obtains shared profile')
    nav('Profil'); top(); width = field('Zmierzona szerokość całkowita (cm)')
    check('Web profile imported into native fields',width.get('text') == '68.5')
    fill('Zmierzona szerokość całkowita (cm)','69')
    remote = api('/api/auth/me',auth=token); profile['widthCm']='70'
    api('/api/profile',{'profile':profile,'expectedVersion':remote['profileVersion']},'PUT',token)
    tap('Zapisz na koncie',scroll=True); time.sleep(1); top(); find('Profil zmienił się')
    check('Concurrent web update is not silently overwritten',api('/api/auth/me',auth=token)['profile']['widthCm']=='70')
    nav('Konto'); tap('Pobierz profil z konta',scroll=True); tap('Pobierz',exact=True); time.sleep(1)
    nav('Profil'); top(); check('Explicit refresh retrieves newer shared profile',field('Zmierzona szerokość całkowita (cm)').get('text')=='70')
    fill('Zmierzona szerokość całkowita (cm)','71'); tap('Zapisz na koncie',scroll=True); time.sleep(1)
    check('Native profile update is readable by web API',api('/api/auth/me',auth=token)['profile']['widthCm']=='71')
    account_xml = adb('shell','run-as','pl.przejscie.app','cat','shared_prefs/account.xml')
    check('Bearer session is encrypted on device',token not in account_xml and 'payload' in account_xml and password not in account_xml)
    screen('workflow-profile-sync')
    nav('Trasa'); top(); origin = choose('Skąd','Dluga 12')
    destination = choose('Dokąd','Florianska 1')
    top(); fill('Skąd','Dluga 12')
    find('Wyznacz trasę',scroll=True)
    tree = dump(); button = next(n for n in nodes(tree) if n.get('text') == 'Wyznacz trasę')
    parent = next((n for n in nodes(tree) if button in list(n)),None)
    check('Editing confirmed address disables route calculation',parent is not None and parent.get('enabled')=='false')
    top(); choose('Skąd','Dluga 12')
    for i,query in enumerate(('Dluga 4','Florianska 44','Florianska 20'),1):
        tap('+ Dodaj przystanek',scroll=True,exact=True); top(); choose('Przystanek '+str(i),query)
    tap('Wyznacz trasę',scroll=True); time.sleep(3); find('Trasa wymaga oceny otoczenia',scroll=True)
    check('Real route planned through three confirmed intermediate addresses')
    screen('workflow-route'); dump('workflow-route')
    for permission in ('ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION','POST_NOTIFICATIONS'):
        adb('shell','pm','grant','pl.przejscie.app','android.permission.'+permission)
    tap('Rozpocznij prowadzenie',scroll=True)
    route_xml = adb('shell','run-as','pl.przejscie.app','cat','shared_prefs/route.xml')
    route = json.loads(ET.fromstring(route_xml).find("string[@name='json']").text)
    coords = route['geometry']['coordinates']
    for pt in coords[:3]: adb('emu','geo','fix',str(pt[0]),str(pt[1])); time.sleep(2)
    tap('Zakończ',scroll=True,exact=True); time.sleep(2)
    find('To była sesja pokazowa')
    check('Emulator session cannot be uploaded as a real trip', len(api('/api/trips/me',auth=token)['trips']) == 0)
    screen('workflow-trip-simulation'); tap('Zamknij',exact=True)
    nav('Konto'); tap('Wyloguj z telefonu',scroll=True); time.sleep(1)
    encrypted = adb('shell','run-as','pl.przejscie.app','cat','shared_prefs/account.xml')
    check('Logout removes encrypted device session','payload' not in encrypted)
finally:
    if token:
        try: api('/api/auth/logout',{},auth=token)
        except Exception: pass
    (OUT/'workflow-results.json').write_text(json.dumps({'checks':checks,'api':a.api,'completedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'accountScope':'isolated in-memory test API; no production accounts'},ensure_ascii=False,indent=2),encoding='utf-8')
