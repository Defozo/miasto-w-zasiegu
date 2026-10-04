"""Verify private address drafts across account changes using only isolated API 3083.

Build with -PbackendUrl=http://10.0.2.2:3083. This script creates test accounts in
the caller-provided in-memory API and clears the emulator app after verification.
"""
from pathlib import Path

# Share the established emulator driver, without running its favorites scenario.
driver=Path(__file__).with_name('favorites_smoke.py').read_text(encoding='utf-8').split('\ntokens=[]')[0]
exec(compile(driver,str(Path(__file__).with_name('favorites_smoke.py')),'exec'))

def blank_route():
    nav('Trasa'); top()
    first=field('Skąd').get('text')
    last=field('Dokąd').get('text')
    top()
    texts=[n.get('text','') for n in nodes(dump())]
    return first=='' and last=='' and not any('Przystanek 1'==text for text in texts)

def recreate():
    old=adb('shell','settings','get','global','always_finish_activities').strip()
    try:
        adb('shell','settings','put','global','always_finish_activities','1')
        adb('shell','input','keyevent','3'); time.sleep(1)
        adb('shell','am','start','-W','-n','pl.przejscie.app/pl.przejscie.phone.MainActivity'); time.sleep(1)
    finally:
        if old=='null': adb('shell','settings','delete','global','always_finish_activities')
        else: adb('shell','settings','put','global','always_finish_activities',old)

tokens=[]
try:
    check('Only emulator and explicitly isolated API are used',api('/api/health')['status']=='ok')
    users=[]
    for suffix in ('a','b'):
        email='android-draft-'+suffix+'-'+uuid.uuid4().hex[:10]+'@example.invalid'
        password='DraftAudit'+uuid.uuid4().hex
        response=api('/api/auth/register',{'email':email,'password':password,'displayName':'Test szkicu '+suffix})
        tokens.append(response['token']); users.append((email,password))
    adb('shell','am','force-stop','pl.przejscie.app'); adb('shell','pm','clear','pl.przejscie.app')
    adb('shell','am','start','-W','-n','pl.przejscie.app/pl.przejscie.phone.MainActivity'); time.sleep(1)
    if not any(n.get('text')=='Pomiń' for n in nodes(dump())):
        adb('shell','am','start','-W','-n','pl.przejscie.app/pl.przejscie.phone.MainActivity'); time.sleep(2)
    tap('Pomiń',exact=True)
    login(*users[0]); nav('Trasa'); top()
    first=choose('Skąd','Dluga 12')
    top(); fill('Dokąd','Prywatny cel A'); tap('+ Dodaj przystanek',scroll=True,exact=True)
    top(); fill('Przystanek 1','Prywatny przystanek A')
    recreate(); top()
    check('Account A confirmed start survives activity recreation',field('Skąd').get('text')==first['label'])
    check('Account A typed stop survives activity recreation',field('Przystanek 1').get('text')=='Prywatny przystanek A')
    nav('Konto'); tap('Wyloguj z telefonu',scroll=True,exact=True); time.sleep(1)
    check('Logout clears start destination and stop',blank_route()); screen('ux-draft-guest-cleared')
    recreate(); check('Guest cannot restore account A draft',blank_route())
    login(*users[1]); check('Account B starts without account A addresses',blank_route()); screen('ux-draft-account-b-cleared')
    top(); fill('Skąd','Prywatny adres B'); recreate(); top()
    check('Account B keeps its own typed draft after recreation',field('Skąd').get('text')=='Prywatny adres B')
    nav('Konto'); tap('Wyloguj z telefonu',scroll=True,exact=True); time.sleep(1)
    login(*users[0]); check('Returning to account A does not inherit account B draft',blank_route())
finally:
    for token in tokens:
        try: api('/api/auth/logout',{},auth=token)
        except Exception: pass
    (OUT/'ux-draft-privacy-results.json').write_text(json.dumps({'api':a.api,'completed':len(checks)==8,'expectedChecks':8,'checks':checks,'database':'isolated in-memory'},ensure_ascii=False,indent=2),encoding='utf-8')
    adb('shell','am','force-stop','pl.przejscie.app'); adb('shell','pm','clear','pl.przejscie.app')
