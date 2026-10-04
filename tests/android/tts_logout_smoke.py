"""Cancel active synthetic speech by logging out on isolated memory API 3083."""
from pathlib import Path
driver=Path(__file__).with_name('favorites_smoke.py').read_text(encoding='utf-8').split('\ntokens=[]')[0]
exec(compile(driver,str(Path(__file__).with_name('favorites_smoke.py')),'exec'))
import threading
APP='pl.przejscie.app'
running=False
completed=False
def prefs(name):
    return {x.get('name'):x.text if x.tag=='string' else x.get('value') for x in ET.fromstring(adb('shell','run-as',APP,'cat','shared_prefs/'+name+'.xml'))}
def log(): return adb('logcat','-d','-s','PrzejscieSpeech:I','*:S')
def wait_for(f):
    until=time.time()+15
    while time.time()<until:
        if f(): return
        time.sleep(.2)
    raise AssertionError('Missing expected speech event')
try:
    check('Account test uses isolated memory API',a.api=='http://127.0.0.1:3083' and api('/api/health')['status']=='ok')
    email='android-tts-'+uuid.uuid4().hex[:10]+'@example.invalid'
    password='TtsSynthetic'+uuid.uuid4().hex
    token=api('/api/auth/register',{'email':email,'password':password,'displayName':'Test głosu'})['token']
    adb('shell','am','force-stop',APP); adb('shell','pm','clear',APP)
    adb('shell','input','keyevent','KEYCODE_WAKEUP'); adb('shell','input','keyevent','82')
    adb('shell','am','start','-W','-n',APP+'/pl.przejscie.phone.MainActivity'); time.sleep(2)
    if not any(n.get('text')=='Pomiń' for n in nodes(dump())):
        adb('shell','am','start','-W','-n',APP+'/pl.przejscie.phone.MainActivity'); time.sleep(2)
    tap('Pomiń',exact=True); login(email,password)
    nav('Trasa'); top(); choose('Skąd','Dluga 12'); choose('Dokąd','Florianska 1')
    tap('Wyznacz trasę',scroll=True); time.sleep(3)
    for p in ('ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','POST_NOTIFICATIONS'):
        adb('shell','pm','grant',APP,'android.permission.'+p)
    tap('Rozpocznij prowadzenie',scroll=True); time.sleep(2)
    route=json.loads(prefs('route')['json']); point=route['geometry']['coordinates'][0]
    running=True
    def gps():
        while running:
            adb('emu','geo','fix',str(point[0]),str(point[1])); time.sleep(2)
    thread=threading.Thread(target=gps,daemon=True); thread.start()
    adb('logcat','-c'); time.sleep(3)
    tap('Włącz głos'); wait_for(lambda:'onDone utterance=' in log())
    check('Signed-in guidance speaks a real synthesized instruction','onStart utterance=' in log())
    nav('Konto'); logout=find('Wyloguj z telefonu',scroll=True)
    step=max(0,int(prefs('guidance')['step'])-1)
    way=route['steps'][step]['wayPoints']; point=route['geometry']['coordinates'][min(way[0]+1,way[1])]
    wait_for(lambda:log().count(' onStart utterance=')>=2)
    tap_node(logout); time.sleep(1)
    check('Logout interrupts active utterance','onStop:true' in log() and prefs('guidance')['mode']=='stopped')
    count=log().count(' queued utterance='); time.sleep(5)
    check('No speech resumes after account removal',log().count(' queued utterance=')==count and 'payload' not in prefs('account'))
    check('Synthetic session was never uploaded',api('/api/trips/me',auth=token)['trips']==[])
    screen('tts-logout'); dump('tts-logout')
    (OUT/'tts-logout-events.log').write_text(log(),encoding='utf-8')
    completed=True
finally:
    running=False
    if 'thread' in globals(): thread.join(timeout=4)
    if token:
        try: api('/api/auth/logout',{},auth=token)
        except Exception: pass
    adb('shell','am','force-stop',APP); adb('shell','pm','clear',APP)
    (OUT/'tts-logout-results.json').write_text(json.dumps({'checks':checks,'completed':completed,
        'api':a.api,'scope':'isolated in-memory test account; emulator synthetic GPS only'},ensure_ascii=False,indent=2),encoding='utf-8')
