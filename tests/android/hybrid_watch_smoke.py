"""Readability and disconnected-state checks on the dedicated Wear OS emulator."""
from pathlib import Path
import subprocess, os, time, json, re
import xml.etree.ElementTree as ET

ADB = str(Path(os.environ['LOCALAPPDATA']) / 'Android/Sdk/platform-tools/adb.exe')
SERIAL = 'emulator-5580'
PACKAGE = 'pl.przejscie.app.validation'
OUT = Path(__file__).resolve().parents[2] / 'artifacts/hybrid/wear'
OUT.mkdir(parents=True, exist_ok=True)
checks = []

def adb(*args, binary=False):
    r = subprocess.run([ADB, '-s', SERIAL, *args], capture_output=True, check=True, timeout=35)
    return r.stdout if binary else r.stdout.decode('utf-8', 'replace')
def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/hybrid-watch.xml')
    raw = adb('exec-out', 'cat', '/sdcard/hybrid-watch.xml')
    (OUT / 'current.xml').write_text(raw, encoding='utf-8')
    return ET.fromstring(raw)
def shot(name): (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
def top():
    for _ in range(3): adb('shell', 'input', 'swipe', '192', '100', '192', '310', '250')
    time.sleep(.3)
def tap(label):
    for _ in range(6):
        for node in tree().iter('node'):
            if label in (node.get('text', ''), node.get('content-desc', '')):
                x1,y1,x2,y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
                if y1 >= 10 and y2 <= 380 and x2 > x1:
                    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2));time.sleep(.4);return
        adb('shell', 'input', 'swipe', '192', '305', '192', '120', '300')
    raise AssertionError('Missing control: ' + label)
def text(): return ' '.join(n.get('text', '') for n in tree().iter('node'))
def wait_text(fragment):
    for _ in range(10):
        value = text()
        if fragment in value: return value
        time.sleep(.5)
    raise AssertionError('Missing state: ' + fragment + '; last: ' + value)
def check(label): checks.append(label); print('PASS ' + label, flush=True)

try:
    assert 'watch' in adb('shell', 'getprop', 'ro.build.characteristics')
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
    adb('shell', 'am', 'start', '-n', PACKAGE + '/pl.przejscie.wear.MainActivity')
    wait_text('Twoja trasa');top();shot('idle')
    assert 'Twoja trasa' in text();check('Native Wear OS idle screen is readable on a 192 dp round display')
    tap('Zobacz pokaz');top();shot('demo-right')
    value = text();assert 'POKAZ' in value and 'BEZ GPS' in value and '40 m' in value and 'Skręć w prawo' in value
    check('Demo labels, distance and right-turn instruction are present together')
    tap('Następny manewr');top();shot('demo-straight')
    assert 'Jedź prosto' in text();check('Next maneuver changes both the text and the displayed distance')
    tap('Zakończ pokaz');top()
    assert 'Twoja trasa' in text();check('Leaving demo returns to the real disconnected state')
    adb('shell', 'am', 'force-stop', PACKAGE)
    (OUT / 'guidance.xml').write_text('<?xml version="1.0" encoding="utf-8" standalone="yes" ?><map><string name="session">isolated-test</string><string name="mode">live</string><string name="instruction">TESTOWY MANEWR NIE POKAZYWAC</string><long name="sentAt" value="'+str(int(time.time()*1000))+'"/><int name="distanceM" value="123"/><int name="step" value="1"/><int name="total" value="3"/></map>', encoding='utf-8')
    adb('push', str(OUT / 'guidance.xml'), '/data/local/tmp/hybrid-guidance.xml')
    adb('shell', 'run-as', PACKAGE, 'mkdir', '-p', 'shared_prefs')
    adb('shell', 'run-as', PACKAGE, 'cp', '/data/local/tmp/hybrid-guidance.xml', 'shared_prefs/guidance.xml')
    adb('shell', 'am', 'start', '-n', PACKAGE + '/pl.przejscie.wear.MainActivity');wait_text('BRAK POŁĄCZENIA');top()
    value = text();assert 'BRAK POŁĄCZENIA' in value and 'TESTOWY MANEWR' not in value
    shot('disconnected');check('Even a fresh stored instruction stays hidden without a paired phone')
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');time.sleep(1);top();shot('large-text')
    assert 'Sprawdź telefon' in text();check('Disconnected warning remains available with enlarged system text')
    (OUT/'results.json').write_text(json.dumps({'passed': True, 'checks': checks, 'limitations': ['No phone/watch pairing', 'Demo and explicitly injected local test frame, not live Data Layer', 'No screen reader or physical watch test']}, ensure_ascii=False, indent=2), encoding='utf-8')
except Exception as error:
    shot('failure')
    (OUT/'results.json').write_text(json.dumps({'passed': False, 'checks': checks, 'error': str(error)}, ensure_ascii=False, indent=2), encoding='utf-8')
    raise
finally:
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0')
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'pm', 'clear', PACKAGE)
