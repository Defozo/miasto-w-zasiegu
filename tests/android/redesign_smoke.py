"""UI checks in the separate validation application; never clear production app data."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--serial', default='emulator-5554')
args = parser.parse_args()
PACKAGE = 'pl.przejscie.app.validation'
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts' / ('android-redesign-' + args.serial.replace(':', '-'))
OUT.mkdir(parents=True, exist_ok=True)
ADB = str(Path(os.environ['LOCALAPPDATA']) / 'Android/Sdk/platform-tools/adb.exe')
checks = []
failure = None

def adb(*values, binary=False):
    r = subprocess.run([ADB, '-s', args.serial, *values], capture_output=True, check=True, timeout=35)
    return r.stdout if binary else r.stdout.decode('utf-8', errors='replace')

def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/przejscie-validation.xml')
    text = adb('exec-out', 'cat', '/sdcard/przejscie-validation.xml')
    (OUT/'current.xml').write_text(text, encoding='utf-8')
    return ET.fromstring(text)

def bounds(node):
    return list(map(int, re.findall(r'\d+', node.get('bounds', ''))))

def touch(node):
    x1,y1,x2,y2 = bounds(node)
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    time.sleep(.3)

def find(label, exact=True, scroll=False):
    for _ in range(10):
        root = tree()
        found = [n for n in root.iter('node') if n.get('class') != 'android.widget.EditText' and (label in (n.get('text',''),n.get('content-desc','')) if exact else label in (n.get('text','')+' '+n.get('content-desc','')))]
        if found: return found[0]
        if scroll:
            w,h = [int(n) for n in re.findall(r'\d+', adb('shell','wm','size'))][-2:]
            adb('shell','input','swipe',str(w//2),str(int(h*.77)),str(w//2),str(int(h*.3)),'250')
        time.sleep(.5)
    raise AssertionError('Missing: '+label)

def tap(label, **kw): touch(find(label, **kw))

def fill(label, value):
    for n in tree().iter('node'):
        if n.get('class') == 'android.widget.EditText' and (label in n.get('text','') or label in n.get('content-desc','') or any(label in x.get('text','') for x in n.iter('node'))):
            touch(n); adb('shell','input','keyevent','KEYCODE_MOVE_END')
            old=n.get('text','')
            if old and old!=label: adb('shell','input','keyevent',*(['KEYCODE_DEL']*min(len(old),100)))
            adb('shell','input','text',value.replace(' ','%s')); time.sleep(.5); return
    raise AssertionError('Input: '+label)

def screenshot(name): (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p',binary=True))
def check(label): checks.append(label); print('PASS '+label,flush=True)

try:
    with urllib.request.urlopen('http://127.0.0.1:3082/api/test-environment') as response: assert json.load(response)['isolated']
    assert 'package:' in adb('shell','pm','path',PACKAGE), 'Install the validationBuild APK first'
    adb('reverse','tcp:3082','tcp:3082')
    adb('shell','am','force-stop',PACKAGE); adb('shell','pm','clear',PACKAGE)
    adb('shell','input','keyevent','KEYCODE_WAKEUP')
    adb('shell','am','start','-W','-n',PACKAGE+'/pl.przejscie.phone.MainActivity')
    find('Jak się poruszasz?'); screenshot('onboarding'); tap('Pomiń na razie')
    find('Miejsce lub adres'); check('One skip opens the native map without account or GPS'); screenshot('map')
    tap('Profil'); tap('Dodaj zestaw'); tap('Wózek elektryczny'); tap('Dalej',scroll=True)
    tap('Wpisz parametry',scroll=True); fill('Nazwa zestawu','Elektryczny test')
    adb('shell','input','keyevent','KEYCODE_BACK')
    tap('Zastosuj i pokaż mapę',scroll=True); find('Miejsce lub adres')
    check('Manual preset saves and returns to the map')
    tap('Profil'); find('Elektryczny test',exact=False); tap('Dodaj zestaw'); tap('Pieszo',scroll=True); tap('Dalej',scroll=True)
    tap('Zastosuj i pokaż mapę',scroll=True); check('A second preset can be stored independently')
    fill('Miejsce lub adres','Wawel'); adb('shell','input','keyevent','KEYCODE_BACK')
    tap('Pokaż listę'); tap('Wawel',scroll=True)
    find('Toaleta:',exact=False,scroll=True); screenshot('place'); tap('Zapisz',scroll=True)
    find('Zapisano miejsce.',scroll=True); check('Place facts and save work before navigation')
    tap('Nawiguj',scroll=True); find('Auto + dalszy odcinek'); check('Navigation opens a plan instead of starting GPS')
    screenshot('journey')
    adb('shell','am','force-stop',PACKAGE); adb('shell','am','start','-W','-n',PACKAGE+'/pl.przejscie.phone.MainActivity')
    find('Miejsce lub adres'); tap('Profil'); find('Elektryczny test',exact=False)
    check('Presets survive process restart; onboarding does not repeat')
    tap('Zapisane'); find('Wawel',exact=False); check('Saved places survive process restart')
except BaseException as error:
    failure = str(error)
    raise
finally:
    screenshot('final')
    (OUT/'results.json').write_text(json.dumps({'serial':args.serial,'package':PACKAGE,'checks':checks,'complete':len(checks)==7 and failure is None,'failure':failure},ensure_ascii=False,indent=2),encoding='utf-8')
