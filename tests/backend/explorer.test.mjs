import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { ensureObservationSchema } from '../../server/observations.mjs';
import { registerExplorerRoutes } from '../../server/explorer.mjs';

const fixtures = [];
after(async () => { for (const f of fixtures) { await new Promise(resolve => f.server.close(resolve)); f.db.close(); } });
async function fixture() {
  const db = new DatabaseSync(':memory:'); ensureObservationSchema(db);
  db.exec('CREATE TABLE report_events(id TEXT PRIMARY KEY,report_id TEXT,user_id TEXT,action TEXT,description TEXT,created_at TEXT)');
  let timestamp = Date.now(); const reports = [];
  const places = [{ id: 'fixture-entrance', name: 'Wyłącznie miejsce testowe', address: 'Adres testowy', coordinates: [19.938,50.061], access: { stepFree: null, widthCm: null, entranceNotes: 'Środek obiektu, nie wejście.' }, sourceUrl: 'https://example.invalid' }];
  const store = { reports: () => reports, places: () => places, getReport: id => reports.find(r => r.id === id), confirmReport(id,userId,action,description) {
    const report = reports.find(r => r.id === id), idEvent = `event-${db.prepare('SELECT count(*) n FROM report_events').get().n}`;
    db.prepare('INSERT INTO report_events VALUES(?,?,?,?,?,?)').run(idEvent,id,userId,action,description,new Date(timestamp).toISOString());
    const next = { ...report, history: [...report.history, { action, description, observedAt: new Date(timestamp).toISOString() }], stale: action !== 'confirm', disputed: action === 'dispute', lastConfirmedAt: action === 'confirm' ? new Date(timestamp).toISOString() : report.lastConfirmedAt };
    reports[reports.indexOf(report)] = next; return next;
  } };
  const app = express(); app.use(express.json());
  const service = registerExplorerRoutes(app, { db, store, now: () => timestamp, getUser: req => req.get('x-test-user') ? { id: req.get('x-test-user'), displayName: 'Testowy odkrywca' } : null });
  app.use((e,req,res,next) => res.status(e.status || 500).json({ error: { message: e.message, code: e.code } }));
  const server = await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)); });
  const f = { db, server, service, reports, advance: seconds => { timestamp += seconds*1000; },
    report(index=0, extra={}) { return { id:`r-${index}`,userId:'alice',kind:'entrance',coordinates:[19.938+index*.004,50.061],description:`Przy wejściu numer ${index} jest niski próg oraz szerokie drzwi otwierane ręcznie.`,observedAt:new Date(timestamp).toISOString(),createdAt:new Date(timestamp).toISOString(),...extra }; },
    stale(extra={}) { const r={...this.report(100),coordinates:[19.938,50.061],userId:'bob',status:'active',title:'Wejście',stale:true,disputed:false,history:[],lastConfirmedAt:new Date(timestamp-100*86400000).toISOString(),...extra};reports.push(r);return r; },
    async req(path,body,user='alice') { const response=await fetch(`http://127.0.0.1:${server.address().port}/api/game${path}`,{ method:body===undefined?'GET':'POST',headers:{...(user?{'x-test-user':user}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}) });return { status:response.status,body:await response.json() }; }
  }; fixtures.push(f); return f;
}
const alice={id:'alice',displayName:'Alicja'};
test('shared rewards are durable, idempotent, user scoped and cannot be selected before earning',async()=>{
  const f=await fixture();
  assert.equal((await f.req('/showcase',{expectedUserId:'alice',featured:['first'],theme:'mint'})).status,400);
  assert.equal(f.service.awardReport(alice,f.report()).awarded,15);
  assert.equal(f.service.awardReport(alice,f.report()).awarded,0);
  const state=(await f.req('/explorer')).body;
  assert.equal(state.stats.xp,15);assert.equal(state.badges.find(b=>b.id==='first').level,1);
  assert.equal((await f.req('/explorer',undefined,'bob')).body.stats.xp,0);
  assert.equal((await f.req('/showcase',{expectedUserId:'bob',featured:['first'],theme:'mint'})).status,409);
  assert.equal((await f.req('/showcase',{expectedUserId:'alice',featured:['first'],theme:'night'})).status,400);
  assert.equal((await f.req('/showcase',{expectedUserId:'alice',featured:['first'],theme:'mint'})).status,200);
  assert.deepEqual((await f.req('/explorer')).body.featured,['first']);
});
test('reward limits do not award copies, stale photos, anonymous contributions or rapid spam',async()=>{
  const f=await fixture();
  assert.equal(f.service.awardReport(null,f.report()).awarded,0);
  assert.equal(f.service.awardReport(alice,f.report(0,{observedAt:'2020-01-01T00:00:00Z'})).awarded,0);
  assert.equal(f.service.awardReport(alice,f.report()).awarded,15);
  assert.equal(f.service.awardReport(alice,f.report(1)).awarded,0);
  f.advance(100);
  assert.equal(f.service.awardReport(alice,f.report(2,{description:f.report().description})).awarded,0);
  assert.equal(f.service.awardReport(alice,f.report(3,{coordinates:f.report().coordinates})).awarded,0);
  for(let i=1;i<=4;i++){assert.equal(f.service.awardReport(alice,f.report(i)).awarded,15);f.advance(100);}
  assert.equal(f.service.awardReport(alice,f.report(6)).awarded,0);
  assert.equal((await f.req('/explorer')).body.dailyRemaining,0);
});
test('missions use missing fields and real stale/conflict state, never map import dates',async()=>{
  const f=await fixture();f.stale();
  const missions=(await f.req('/quests')).body.missions;
  assert.equal(missions[0].type,'refresh');assert.match(missions[0].reason,/ponownego/);
  const discover=missions.find(m=>m.type==='discover');assert(discover);assert.equal(discover.lastObservedAt,null);
  assert.equal((await f.req('/quests?lon=0&lat=0')).status,400);
});
test('same and changed checks earn equally, and stale revision or same person cannot be rewarded again',async()=>{
  for(const answer of ['same','changed']){
    const f=await fixture();const report=f.stale({description:'Roboty przy wejściu'});const mission=(await f.req('/quests')).body.missions[0];
    const body={expectedUserId:'alice',reportId:report.id,revision:mission.revision,answer,coordinates:report.coordinates,observedNow:true,description:'Na miejscu dokładnie obejrzałem wejście oraz warunki przejścia przy drzwiach.'};
    assert.equal((await f.req('/recheck',{...body,revision:'old'})).status,409);
    assert.equal((await f.req('/recheck',{...body,coordinates:[19.8,50.1]})).status,400);
    const result=await f.req('/recheck',body);assert.equal(result.status,200);assert.equal(result.body.reward.awarded,25);
    assert.equal(result.body.state.stats.refreshes,1);
    assert.equal((await f.req('/recheck',body)).status,409);
    assert.equal((await f.req('/quests')).body.missions.some(m=>m.reportId===report.id),false);
    assert.equal(f.service.awardFeedback({id:'bob'},report,'confirm','').awarded,0);
  }
});
test('measured dimensions count, photo guesses and empty measurements do not',async()=>{
  const f=await fixture();
  f.service.awardReport(alice,f.report(0,{measurement:'estimated',widthCm:85}));f.advance(100);
  f.service.awardReport(alice,f.report(1,{measurement:'measured',widthCm:85}));
  assert.equal((await f.req('/explorer')).body.stats.measurements,1);
  assert.equal((await f.req('/explorer')).body.stats.xp,35);
  f.advance(100);
  assert.equal(f.service.awardReport(alice,f.report(2,{measurement:'measured',heightCm:0})).awarded,20);
  f.advance(100);
  assert.equal(f.service.awardReport(alice,f.report(3,{measurement:'measured',heightCm:null})).awarded,15);
});
