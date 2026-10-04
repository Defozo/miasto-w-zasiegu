"""Emulator-only speech checks on an already planned, active GPS route.

Start guidance in the UI first. Polish offline voice data must be installed.
No account, trip or API writes. The optional PCM probe captures engine synthesis
callbacks, not a microphone or the host speaker. Leave the final app clean later.
"""
from pathlib import Path
import sys
sys.argv=['ux_audit.py','lifecycle']
driver=Path(__file__).with_name('ux_audit.py').read_text(encoding='utf-8').split('\ntry:\n')[0]
exec(compile(driver,str(Path(__file__).with_name('ux_audit.py')),'exec'))
import threading
import wave
import struct

def prefs(name):
    tree=ET.fromstring(adb('shell','run-as',APP,'cat','shared_prefs/'+name+'.xml'))
    return {x.get('name'): x.text if x.tag=='string' else x.get('value') for x in tree}

def logs(): return adb('logcat','-d','-s','PrzejscieSpeech:I','*:S')
def queued(): return logs().count(' queued utterance=')
def wait_for(predicate, seconds=15):
    deadline=time.time()+seconds
    while time.time()<deadline:
        if predicate(): return
        time.sleep(.3)
    raise AssertionError('Timed out waiting for speech event')

def check(name,condition=True):
    assert condition,name
    checks.append({'name':name,'status':'PASS'}); print('PASS '+name,flush=True)
    (OUT/'tts-results.json').write_text(json.dumps({'checks':checks,'completed':False,
        'scope':'emulator synthetic GPS; engine PCM, no speaker capture'},ensure_ascii=False,indent=2),encoding='utf-8')

route=json.loads(prefs('route')['json'])
session=prefs('guidance')['session']
index=max(0,int(prefs('guidance')['step'])-2)
pt=route['geometry']['coordinates'][route['steps'][index]['wayPoints'][0]]
running=True
wifi_before=adb('shell','settings','get','global','wifi_on').strip()
data_before=adb('shell','settings','get','global','mobile_data').strip()
def gps():
    while running:
        if pt is not None: adb('emu','geo','fix',str(pt[0]),str(pt[1]))
        time.sleep(2)
thread=threading.Thread(target=gps,daemon=True); thread.start()
try:
    adb('logcat','-c')
    adb('shell','run-as',APP,'touch','cache/tts-probe-enabled')
    # The debug-only probe checks this opt-in when synthesis begins.
    time.sleep(3)
    find('Włącz głos')
    check('Installed Polish voice remains off until explicit enable',queued()==0)
    tap('Włącz głos')
    wait_for(lambda:'onDone utterance=' in logs())
    check('Enable produces queued, onStart and onDone',queued()==1 and 'onStart utterance=' in logs())
    wav=adb('exec-out','run-as',APP,'cat','cache/tts-probe.wav',binary=True)
    (OUT/'tts-synthesis.wav').write_bytes(wav)
    metadata=json.loads(adb('shell','run-as',APP,'cat','cache/tts-probe.json'))
    with wave.open(str(OUT/'tts-synthesis.wav'),'rb') as audio:
        samples=struct.unpack('<'+'h'*audio.getnframes()*audio.getnchannels(),audio.readframes(audio.getnframes()))
        metadata['durationS']=audio.getnframes()/audio.getframerate()
        metadata['peakAmplitude']=max(abs(x) for x in samples)
    (OUT/'tts-synthesis.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    check('Engine produced non-silent Polish PCM audio',metadata['durationS']>1 and metadata['peakAmplitude']>100)
    check('Enable preserves GPS session',prefs('guidance')['session']==session)
    time.sleep(11)
    check('Repeated GPS and distance refresh do not repeat current instruction',queued()==1)
    adb('shell','svc','wifi','disable'); adb('shell','svc','data','disable')
    tap('Powtórz instrukcję')
    wait_for(lambda:logs().count(' onDone utterance=')==2)
    check('Manual repeat plays offline once in the same GPS session',queued()==2 and prefs('guidance')['session']==session)
    adb('shell','svc','wifi','enable' if wifi_before=='1' else 'disable')
    adb('shell','svc','data','enable' if data_before=='1' else 'disable')
    screenshot('tts-played')
    adb('shell','input','keyevent','3'); time.sleep(2)
    adb('shell','am','start','-W','-n',APP+'/pl.przejscie.phone.MainActivity'); time.sleep(2)
    check('Background and resume do not repeat an instruction',queued()==2)
    # Move to the middle of the next segment without jumping over maneuvers.
    index=max(0,int(prefs('guidance')['step'])-1)
    way=route['steps'][index]['wayPoints']
    pt=route['geometry']['coordinates'][min(way[0]+1,way[1])]
    wait_for(lambda:queued()==3)
    wait_for(lambda:logs().count(' onDone utterance=')==3)
    check('Moving to the next maneuver speaks it exactly once',queued()==3)
    tap('Powtórz instrukcję')
    wait_for(lambda:logs().count(' onStart utterance=')==4)
    adb('shell','am','start','-W','-n',APP+'/pl.przejscie.phone.FocusProbeActivity')
    wait_for(lambda:'focus_lost utterance=' in logs())
    time.sleep(4)
    check('Competing audio focus mutes and does not auto-resume',queued()==4 and 'onStop:true' in logs())
    find('Włącz głos')
    screenshot('tts-focus-lost')
    tap('Włącz głos'); wait_for(lambda:logs().count(' onDone utterance=')==4)
    tap('Wycisz głos')
    count=queued(); time.sleep(5)
    check('Mute stops automatic speech while GPS continues',queued()==count and prefs('guidance')['session']==session and prefs('guidance')['mode']=='live')
    screenshot('tts-muted')
    tap('Włącz głos'); wait_for(lambda:queued()==count+1)
    pt=None
    adb('shell','cmd','location','set-location-enabled','false')
    time.sleep(26)
    check('Old GPS pauses guidance and disables repeat',prefs('guidance')['mode']=='paused')
    tree=dump(); button=find('Powtórz instrukcję')
    parent=next((n for n in tree.iter('node') if any(k.get('text')=='Powtórz instrukcję' for k in list(n))),None)
    check('Stale position cannot be repeated',parent is not None and parent.get('enabled')=='false')
    screenshot('tts-gps-paused')
    count=queued(); adb('shell','cmd','location','set-location-enabled','true')
    way=route['steps'][index]['wayPoints']; pt=route['geometry']['coordinates'][min(way[0]+1,way[1])]
    time.sleep(6)
    check('GPS recovery does not replay the old maneuver',prefs('guidance')['mode']=='live' and queued()==count)
    find('Pozycja odzyskana. Możesz powtórzyć bieżącą instrukcję.')
    adb('shell','input','keyevent','KEYCODE_SLEEP')
    index=min(index+1,len(route['steps'])-2)
    way=route['steps'][index]['wayPoints']; pt=route['geometry']['coordinates'][min(way[0]+1,way[1])]
    wait_for(lambda:queued()==count+1)
    wait_for(lambda:'onDone utterance=' in logs().split(' queued utterance=')[-1])
    check('Next maneuver plays while emulator screen is locked',queued()==count+1)
    adb('shell','input','keyevent','KEYCODE_WAKEUP'); adb('shell','input','keyevent','82')
    tap('Zakończ',True); time.sleep(2)
    count=queued(); time.sleep(3)
    check('Stopping guidance ends speech and does not queue more',prefs('guidance')['mode']=='stopped' and queued()==count and 'ended utterance=' in logs())
    screenshot('tts-stopped')
    (OUT/'tts-events.log').write_text(adb('logcat','-d','-s','PrzejscieSpeech:I','PrzejscieFocusProbe:I','*:S'),encoding='utf-8')
    (OUT/'tts-results.json').write_text(json.dumps({'checks':checks,'completed':True,'session':session,
        'scope':'emulator synthetic GPS; no API writes; callbacks are not an acoustic speaker test',
        'completedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z')},ensure_ascii=False,indent=2),encoding='utf-8')
finally:
    running=False
    adb('shell','cmd','location','set-location-enabled','true')
    adb('shell','svc','wifi','enable' if wifi_before=='1' else 'disable')
    adb('shell','svc','data','enable' if data_before=='1' else 'disable')
    thread.join(timeout=4)
