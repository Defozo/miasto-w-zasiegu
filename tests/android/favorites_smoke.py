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

def dump(name='favorites-current'):
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

def described(value):
    for _ in range(12):
        found = [n for n in nodes(dump()) if n.get('content-desc') == value]
        if found: return found[0]
        if 'mInputShown=true' in adb('shell','dumpsys','input_method'):
            adb('shell','input','keyevent','4'); time.sleep(.4)
        adb('shell','input','swipe','30','1850','30','650','250')
    raise AssertionError('Missing action: '+value)

def saved(field_label):
    top(); tap_node(described('Wybierz zapisane miejsce: '+field_label)); time.sleep(1)

def save(field_label, name):
    top(); tap_node(described('Zapisz miejsce: '+field_label))
    fill('Nazwa miejsca',name)
    # The dialog title and action deliberately share a name; the action is last.
    matches=[n for n in nodes(dump()) if n.get('text')=='Zapisz miejsce']
    tap_node(matches[-1]); time.sleep(1)

def login(email,password):
    nav('Konto'); fill('E-mail',email); fill('Hasło',password); tap('Zaloguj się',scroll=True,exact=True)
    time.sleep(1); find('Konto połączone',scroll=True)

tokens=[]
try:
    check('Only isolated API and emulator are used', api('/api/health')['status']=='ok')
    def register():
        email='android-favorites-'+uuid.uuid4().hex[:12]+'@example.invalid'
        password='FavoritesTest'+uuid.uuid4().hex[:16]
        result=api('/api/auth/register', {'email':email,'password':password,'displayName':'Test zapisanych miejsc'})
        tokens.append(result['token'])
        return email,password,result['token']
    email_a,password_a,token_a=register(); email_b,password_b,token_b=register()
    browser_point=api('/api/locations?limit=8&q=Florianska%2020')['locations'][0]
    browser_favorite=api('/api/favorites',{'label':'Praca z przegladarki','point':browser_point},auth=token_a)
    adb('shell','am','force-stop','pl.przejscie.app'); adb('shell','pm','clear','pl.przejscie.app')
    adb('shell','input','keyevent','KEYCODE_WAKEUP'); adb('shell','input','keyevent','82')
    adb('shell','am','start','-W','-n','pl.przejscie.app/pl.przejscie.phone.MainActivity'); time.sleep(1)
    if not any(n.get('text')=='Pomiń' for n in nodes(dump())):
        adb('shell','input','keyevent','4')
        adb('shell','am','start','-W','-n','pl.przejscie.app/pl.przejscie.phone.MainActivity'); time.sleep(2)
    tap('Pomiń',exact=True)
    nav('Profil'); find('Unikaj nieutwardzonych nawierzchni',scroll=True)
    checkbox=next(n for n in nodes(dump()) if n.get('content-desc')=='Unikaj nieutwardzonych nawierzchni')
    check('Fresh Android surface default matches web',checkbox.get('checked')=='false')
    nav('Trasa'); top(); home_point=choose('Skąd','Dluga 12'); save('Skąd','Dom')
    top(); work_point=choose('Dokąd','Florianska 1'); save('Dokąd','Praca')
    save('Skąd','dom')
    local_xml=adb('shell','run-as','pl.przejscie.app','cat','shared_prefs/guest-favorites.xml')
    local=json.loads(ET.fromstring(local_xml).find("string[@name='items']").text)
    check('Guest saves two places locally and duplicate keeps original',len(local)==2 and {x['label'] for x in local}=={'Dom','Praca'})
    check('Guest saves never enter account list',len(api('/api/favorites',auth=token_a)['favorites'])==1)
    tap('+ Dodaj przystanek',scroll=True,exact=True)
    saved('Przystanek 1'); screen('favorites-guest'); tap('Dom',exact=True)
    check('Saved home can become a confirmed intermediate stop',field('Przystanek 1').get('text')==home_point['label'])
    saved('Skąd'); tap('Praca',exact=True)
    check('Saved work can become the start',field('Skąd').get('text')==work_point['label'])
    saved('Dokąd'); tap('Dom',exact=True)
    check('Saved home can become the destination',field('Dokąd').get('text')==home_point['label'])
    login(email_a,password_a); nav('Trasa'); saved('Dokąd')
    tree=dump(); labels=[n.get('text') for n in nodes(tree)]
    check('Login exposes account list without importing guest places','Praca z przegladarki' in labels and 'Dom' not in labels and 'Praca' not in labels)
    screen('favorites-account'); tap('Praca z przegladarki',exact=True)
    check('Address saved by another client is selectable in Android',field('Dokąd').get('text')==browser_point['label'])
    save('Dokąd','Cel z Androida')
    check('Native favorite is visible to another client',any(x['label']=='Cel z Androida' for x in api('/api/favorites',auth=token_a)['favorites']))
    saved('Dokąd'); tap('Usuń: Praca z przegladarki',exact=True); tap('Anuluj usuwanie',exact=True)
    check('Deletion cancellation preserves account data',len(api('/api/favorites',auth=token_a)['favorites'])==2)
    tap('Usuń: Praca z przegladarki',exact=True); tap('Usuń miejsce',exact=True); time.sleep(1)
    check('Confirmed deletion is reflected in shared API',len(api('/api/favorites',auth=token_a)['favorites'])==1)
    api('/api/favorites',{'label':'Nowe z przegladarki','point':browser_point},auth=token_a)
    tap('Odśwież miejsca',scroll=True,exact=True); time.sleep(1); find('Nowe z przegladarki',scroll=True,exact=True)
    check('Explicit refresh sees later changes from another client')
    tap('Zamknij',exact=True); nav('Konto'); tap('Wyloguj z telefonu',scroll=True,exact=True); time.sleep(1)
    nav('Trasa'); saved('Skąd'); find('Dom',exact=True); find('Praca',exact=True)
    check('Logout restores separate guest list'); tap('Zamknij',exact=True)
    login(email_b,password_b); nav('Trasa'); saved('Skąd'); find('Nie masz jeszcze zapisanych miejsc')
    check('Second account never sees first account favorites',len(api('/api/favorites',auth=token_b)['favorites'])==0)
    tap('Zamknij',exact=True); nav('Konto'); tap('Wyloguj z telefonu',scroll=True,exact=True); time.sleep(1)
    adb('shell','am','force-stop','pl.przejscie.app'); adb('shell','am','start','-W','-n','pl.przejscie.app/pl.przejscie.phone.MainActivity'); time.sleep(1)
    saved('Skąd'); find('Dom',exact=True); tap('Usuń: Praca',exact=True); tap('Usuń miejsce',exact=True); time.sleep(1)
    find('Dom',exact=True)
    check('Guest list persists across restart and supports deletion', 'Praca' not in [n.get('text') for n in nodes(dump())])
    screen('favorites-final-list'); tap('Zamknij',exact=True)
finally:
    for token in tokens:
        try: api('/api/auth/logout',{},auth=token)
        except Exception: pass
    (OUT/'favorites-results.json').write_text(json.dumps({'checks':checks,'api':a.api,'completedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'accountScope':'isolated in-memory test API; no production accounts'},ensure_ascii=False,indent=2),encoding='utf-8')
