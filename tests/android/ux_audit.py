"""Read-only API / emulator-only lifecycle and accessibility smoke checks.

No accounts, favorites or trips are sent. Run against the standard phone build.
Temporary Android display/network settings are restored in finally blocks.
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
import xml.etree.ElementTree as ET

p = argparse.ArgumentParser()
p.add_argument('mode', choices=['baseline', 'lifecycle', 'small', 'offline', 'gps'])
p.add_argument('--serial', default='emulator-5554')
a = p.parse_args()
assert a.serial.startswith('emulator-'), 'Physical devices are not supported by this test'
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'android/evidence'
ADB = str(Path(os.environ['LOCALAPPDATA']) / 'Android/Sdk/platform-tools/adb.exe')
APP = 'pl.przejscie.app'
checks = []
observations = []

def adb(*args, binary=False):
    result = subprocess.run([ADB, '-s', a.serial, *args], capture_output=True, check=True, timeout=60)
    return result.stdout if binary else result.stdout.decode('utf-8', errors='replace')

def dimensions():
    matches = re.findall(r'(\d+)x(\d+)', adb('shell', 'wm', 'size'))
    return tuple(map(int, matches[-1]))

def dump(name='ux-current'):
    adb('shell', 'uiautomator', 'dump', '/sdcard/przejscie-ux.xml')
    xml = adb('exec-out', 'cat', '/sdcard/przejscie-ux.xml')
    (OUT / (name + '.xml')).write_text(xml, encoding='utf-8')
    return ET.fromstring(xml)

def screenshot(name):
    dump(name)
    (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))

def bounds(n): return list(map(int, re.findall(r'\d+', n.get('bounds'))))
def tap_node(n):
    x1,y1,x2,y2 = bounds(n)
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)); time.sleep(.4)

def hide_keyboard():
    if 'mInputShown=true' in adb('shell','dumpsys','input_method'):
        adb('shell','input','keyevent','4'); time.sleep(.4)

def scroll(down=True):
    hide_keyboard(); w,h=dimensions()
    y1,y2=(int(h*.70),int(h*.38)) if down else (int(h*.35),int(h*.73))
    adb('shell','input','swipe','20',str(y1),'20',str(y2),'220')

def top():
    for _ in range(8): scroll(False)

def find(text, scrolling=False, contains=False):
    for _ in range(24 if scrolling else 1):
        ns=[n for n in dump().iter('node') if (text in n.get('text','') if contains else text == n.get('text'))]
        if ns: return ns[-1]
        if scrolling: scroll()
    raise AssertionError('Missing UI text: '+text)

def tap(text, scrolling=False, contains=False): tap_node(find(text, scrolling, contains))
def nav(text):
    hide_keyboard(); _,h=dimensions()
    ns=[n for n in dump().iter('node') if n.get('text')==text and bounds(n)[1]>h*.80]
    assert ns, 'Missing tab '+text
    tap_node(ns[-1])

def field(label):
    _,h=dimensions()
    for _ in range(24):
        above=False
        for n in dump().iter('node'):
            if n.get('class')=='android.widget.EditText' and (n.get('content-desc')==label or any(k.get('text')==label for k in n.iter('node'))):
                _,y1,_,y2=bounds(n)
                if y1>h*.05 and y2<h*.80: return n
                if y1<=h*.05: above=True
        scroll(not above)
    raise AssertionError('Missing input '+label)

def fill(label,value):
    n=field(label); old=n.get('text',''); tap_node(n)
    focused=field(label)
    if focused.get('focused')!='true': tap_node(focused)
    assert field(label).get('focused')=='true', label+' is not focused'
    adb('shell','input','keyevent','123')
    if old: adb('shell','input','keyevent',*(['67']*len(old)))
    if value: adb('shell','input','text',value.replace(' ','%s'))
    hide_keyboard()

def choose(label,query):
    with urllib.request.urlopen('http://127.0.0.1:3081/api/locations?limit=8&q='+urllib.parse.quote(query)) as r:
        locations=json.load(r)['locations']
    target=next((x for x in locations if x['kind']=='address'),locations[0])
    fill(label,query); time.sleep(1); tap(target['label'],True)
    return target['label']

def start():
    adb('shell','input','keyevent','KEYCODE_WAKEUP'); adb('shell','input','keyevent','82')
    adb('shell','am','start','-W','-n',APP+'/pl.przejscie.phone.MainActivity'); time.sleep(1)
    tree=dump()
    if not any(n.get('package')==APP for n in tree.iter('node')):
        adb('shell','am','start','-W','-n',APP+'/pl.przejscie.phone.MainActivity'); time.sleep(2); tree=dump()
    skip=[n for n in tree.iter('node') if n.get('text')=='Pomiń']
    if skip: tap_node(skip[0])

def check(name,condition=True):
    assert condition,name
    checks.append({'name':name,'status':'PASS'}); print('PASS '+name,flush=True)

def prepare():
    start(); nav('Trasa'); top()
    first=choose('Skąd','Dluga 12')
    last=choose('Dokąd','Florianska 1')
    tap('+ Dodaj przystanek',True)
    top(); via=choose('Przystanek 1','Florianska 20')
    return first,last,via

def expected_fields(labels):
    top(); first=field('Skąd').get('text')
    via=field('Przystanek 1').get('text')
    last=field('Dokąd').get('text')
    return (first,last,via)==labels

try:
    adb('shell','am','force-stop',APP)
    adb('shell','pm','clear',APP)
    if a.mode in ('baseline','lifecycle'):
        labels=prepare(); screenshot('ux-'+a.mode+'-before')
        adb('shell','input','keyevent','3'); time.sleep(1); start()
        check('Home/resume preserves all three confirmed addresses',expected_fields(labels))
        nav('Profil'); adb('shell','input','keyevent','4'); time.sleep(1)
        foreground=bool(re.search(r'(?:topResumedActivity=|ResumedActivity:)[^\n]*'+re.escape(APP),adb('shell','dumpsys','activity','activities')))
        screenshot('ux-'+a.mode+'-back')
        if a.mode=='baseline':
            print('OBSERVATION Back from Profile keeps app foreground: '+str(foreground),flush=True)
            observations.append({'name':'Back from Profile keeps app foreground','actual':foreground})
        else:
            check('Back from Profile returns to route in app',foreground)
            find('Dokąd chcesz',True,True)
        start(); nav('Trasa')
        previous=adb('shell','settings','get','global','always_finish_activities').strip()
        try:
            adb('shell','settings','put','global','always_finish_activities','1')
            adb('shell','input','keyevent','3'); time.sleep(1); start()
            screenshot('ux-'+a.mode+'-recreated')
            if a.mode=='baseline':
                top(); print('OBSERVATION restored start='+repr(field('Skąd').get('text')),flush=True)
                observations.append({'name':'Restored start after activity recreation','actual':field('Skąd').get('text'),'expected':labels[0]})
            else:
                check('Activity recreation preserves addresses and confirmed points',expected_fields(labels))
                tap('Wyznacz trasę',True); time.sleep(3)
                find('Trasa wymaga oceny otoczenia',True)
                check('Restored confirmed points can calculate a real API route')
                nav('Profil'); fill('Zmierzona szerokość całkowita (cm)','68.5')
                adb('shell','input','keyevent','3'); time.sleep(1); start()
                check('Unsaved needs survive activity recreation',field('Zmierzona szerokość całkowita (cm)').get('text')=='68.5')
                nav('Trasa'); top(); fill('Skąd','Nowy adres')
                adb('shell','input','keyevent','3'); time.sleep(1); start(); top()
                check('Unconfirmed typed draft survives activity recreation',field('Skąd').get('text')=='Nowy adres')
                find('Wyznacz trasę',True)
                tree=dump('ux-restored-unconfirmed')
                parents={child:parent for parent in tree.iter() for child in parent}
                node=next(n for n in tree.iter('node') if n.get('text')=='Wyznacz trasę')
                while node.get('clickable')!='true': node=parents[node]
                check('Restored unconfirmed text cannot enable routing',node.get('enabled')=='false')
        finally:
            if previous=='null': adb('shell','settings','delete','global','always_finish_activities')
            else: adb('shell','settings','put','global','always_finish_activities',previous)
    elif a.mode=='small':
        start(); nav('Trasa'); top()
        original_font=adb('shell','settings','get','system','font_scale').strip()
        try:
            adb('shell','wm','size','720x1600'); adb('shell','wm','density','360')
            adb('shell','settings','put','system','font_scale','1.5'); time.sleep(2)
            top(); screenshot('ux-small-large-font-top')
            check('Start field reachable at 320 dp and font scale 1.5',field('Skąd') is not None)
            check('Destination field reachable at 320 dp and font scale 1.5',field('Dokąd') is not None)
            tap('+ Dodaj przystanek',True); top()
            check('Intermediate field reachable at 320 dp and font scale 1.5',field('Przystanek 1') is not None)
            screenshot('ux-small-large-font-via')
            tap('Wyznacz trasę',True); screenshot('ux-small-large-font-bottom')
            nav('Konto'); check('Account remains reachable with large text',field('E-mail') is not None)
            nav('Trasa')
        finally:
            adb('shell','wm','size','reset'); adb('shell','wm','density','reset')
            adb('shell','settings','put','system','font_scale',original_font)
    elif a.mode=='gps':
        start(); nav('Trasa'); top(); tap('Użyj mojej lokalizacji',True)
        denied=[n for n in dump().iter('node') if n.get('resource-id','').endswith('permission_deny_button')]
        assert denied,'Expected fresh GPS permission dialog'; tap_node(denied[0])
        top(); find('Nie udostępniono dokładnej lokalizacji.',True,True); screenshot('ux-gps-denied')
        check('GPS denial explains manual address alternative')
        top(); selected=choose('Skąd','Dluga 12')
        top(); check('Manual address selection works after GPS denial',field('Skąd').get('text')==selected)
        check('GPS denial never starts guidance service','ServiceRecord{' not in adb('shell','dumpsys','activity','services',APP))
    elif a.mode=='offline':
        start(); nav('Trasa'); top()
        try:
            adb('shell','svc','wifi','disable'); adb('shell','svc','data','disable'); time.sleep(1)
            fill('Skąd','Dluga 12'); time.sleep(14)
            find('Nie udało się pobrać podpowiedzi.',True,True); screenshot('ux-api-unavailable')
            check('Unavailable network shows an address lookup error')
        finally:
            adb('shell','svc','wifi','enable'); adb('shell','svc','data','enable'); time.sleep(3)
        tap('Spróbuj ponownie',True); time.sleep(1)
        find('Długa 12',True,True); screenshot('ux-api-retry-restored')
        check('Retry after network restoration recovers without retyping')
finally:
    expected={'baseline':1,'lifecycle':7,'small':4,'offline':2,'gps':3}[a.mode]
    (OUT/('ux-'+a.mode+'-results.json')).write_text(json.dumps({'mode':a.mode,'completed':len(checks)==expected,'expectedChecks':expected,'checks':checks,'observations':observations},ensure_ascii=False,indent=2),encoding='utf-8')
