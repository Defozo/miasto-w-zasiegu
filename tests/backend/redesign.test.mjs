import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { createAuth } from '../helpers/local-auth.mjs';
import { registerMobilityPresets, validatePresets } from '../../server/mobility-presets.mjs';
import { registerEquipmentResearch, prepareEquipmentImage } from '../../server/equipment-research.mjs';
import { calculateJourney, driveRoute } from '../../server/journeys.mjs';
import { ApiError } from '../../server/routing.mjs';
import { parseArea } from '../../server/place-area.mjs';
const opened = [];
after(async () => { for (const {server,db} of opened) { await new Promise(r => server.close(r)); db.close(); } });
const profile = {mobility:'manual',widthCm:'68',maxIncline:'6',maxKerbCm:'2',avoidUnpaved:false};
const preset = (id,kind='manual') => ({id,name:id,kind,profile:{...profile,mobility:kind==='walker'?'walking':kind},equipment:null});
async function service(equipment={}) {
  const db = new DatabaseSync(':memory:'), app=express(), auth=createAuth(db);
  const context={db,auth}; app.locals.context=context; app.use(express.json({limit:'9mb'})); auth.registerRoutes(app);
  context.mobilityPresets=registerMobilityPresets(app,context); registerEquipmentResearch(app,context,equipment);
  app.use((e,req,res,next)=>res.status(e.status||500).json({error:{code:e.code,message:e.message,details:e.details}}));
  const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));}); opened.push({server,db});
  return async(path,body,token,method=body?'POST':'GET') => {
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,body:await r.json()};
  };
}
async function user(call,name) {const r=await call('/auth/register',{email:`${name}@example.test`,password:'fixture-long-password',displayName:name});assert.equal(r.status,201);return r.body.token;}
test('presets preserve guest isolation, account isolation, legacy projection and version conflicts',async()=>{
  const call=await service(), a=await user(call,'alice'), b=await user(call,'bob');
  assert.equal((await call('/mobility-presets')).status,401);
  assert.equal((await call('/profile',{profile,expectedVersion:0},a,'PUT')).status,200);
  const first=(await call('/mobility-presets',null,a)).body; assert.equal(first.presets.length,1); assert.equal(first.presets[0].profile.widthCm,'68');
  const saved=await call('/mobility-presets',{presets:[...first.presets,preset('walker','walker')],activePresetId:'walker',usesCar:true,expectedVersion:first.version},a,'PUT');
  assert.equal(saved.status,200); assert.equal(saved.body.presets.length,2);
  assert.equal((await call('/auth/me',null,a)).body.profile.mobility,'walking');
  assert.equal((await call('/mobility-presets',null,b)).body.presets.length,0);
  assert.equal((await call('/mobility-presets',{...saved.body,expectedVersion:first.version},a,'PUT')).status,409);
  const old=await call('/profile',{profile,expectedVersion:0},a,'PUT');assert.equal(old.body.error.code,'PROFILE_CONFLICT');
  assert.equal((await call('/profile',{profile:{...profile,mobility:'walking',widthCm:'70'},expectedVersion:saved.body.version},a,'PUT')).status,200);
  const after=(await call('/mobility-presets',null,a)).body; assert.equal(after.presets.find(p=>p.id==='walker').kind,'walker');assert.equal(after.presets.find(p=>p.id==='walker').profile.widthCm,'70');
});
test('invalid and duplicate presets do not create a partially valid collection',()=>{
  assert.throws(()=>validatePresets({presets:[preset('same'),preset('same')],activePresetId:'same'}));
  assert.throws(()=>validatePresets({presets:[preset('one')],activePresetId:'missing'}));
  assert.throws(()=>validatePresets({presets:[{...preset('x'),kind:'unicycle'}],activePresetId:'x'}));
});
test('photos are reencoded without location metadata and malformed input is rejected',async()=>{
  const source=await sharp({create:{width:32,height:32,channels:3,background:'#aaa'}}).jpeg().withExif({IFD0:{Artist:'private-fixture'}}).toBuffer();
  const result=await prepareEquipmentImage(`data:image/jpeg;base64,${source.toString('base64')}`);
  assert.equal((await sharp(Buffer.from(result.split(',')[1],'base64')).metadata()).exif,undefined);
  await assert.rejects(prepareEquipmentImage('data:image/jpeg;base64,broken'),e=>e.code==='INVALID_IMAGE');
});
test('photo recognition returns candidates only, never invents dimensions; jobs require ownership',async()=>{
  let resolve; const waiting=new Promise(r=>resolve=r);
  const call=await service({identify:async()=>{await waiting;return {candidates:[{name:'A',manufacturer:'Maker',reason:'Visible label'},{name:'B',manufacturer:'Maker',reason:'Uncertain variant'}],message:'Wybierz model'};}});
  const bytes=await sharp({create:{width:5,height:5,channels:3,background:'#eee'}}).png().toBuffer();
  const clientId='fixture-client-1234567890';
  const r=await call('/equipment/research',{kind:'stroller',image:`data:image/png;base64,${bytes.toString('base64')}`,clientId}); assert.equal(r.status,202);
  assert.equal(r.body.status,'searching');assert(!JSON.stringify(r.body).includes('base64'));
  assert.equal((await call(`/equipment/research/${r.body.id}?clientId=someone-else`)).status,404);
  resolve(); await new Promise(r=>setTimeout(r,15));
  const done=(await call(`/equipment/research/${r.body.id}?clientId=${clientId}`)).body;
  assert.equal(done.status,'needs_choice'); assert.equal(done.candidates.length,2); assert.equal(done.equipment,undefined);
});
test('equipment provider errors leave a reviewable failure and manual entry available',async()=>{
  const call=await service({discover:async()=>{throw new Error('provider secret should not leak');}});
  const clientId='fixture-client-1234567890';const r=await call('/equipment/research',{kind:'walker',query:'Model ABC',clientId});
  const done=(await call(`/equipment/research/${r.body.id}?clientId=${clientId}`)).body;assert.equal(done.status,'failed');assert(!JSON.stringify(done).includes('secret'));
});
const body={mode:'car',start:[19.93,50.06],end:[19.94,50.06],profile:{mobility:'manual',widthCm:68,maxIncline:6,maxKerbCm:2}};
const parking=(id,lon,extra={})=>({id,coordinates:[lon,50.06],access:{wheelchair:'unknown'},parking:{},...extra});
const route={distanceM:500,durationS:300,steps:[],geometry:{type:'LineString',coordinates:[[19.93,50.06],[19.94,50.06]]}};
test('journeys rank onward travel and label unknown transfer while preserving strict needs',async()=>{
  const widths=[];const r=await calculateJourney(body,[parking('near',19.939),parking('better',19.938)],[],{drive:async()=>route,onward:async input=>{widths.push(input.profile.widthCm);return {...route,distanceM:input.start[0]===19.938?300:900};}});
  assert.equal(r.alternatives[0].id,'better');assert.deepEqual(widths,[68,68]);assert.equal(r.alternatives[0].status,'incomplete');assert.equal(r.alternatives[0].transfer.alightingPoint,null);
});
test('blocked parking is excluded, failed onward candidate does not hide viable alternatives',async()=>{
  const r=await calculateJourney(body,[parking('private',19.9399,{accessRestriction:'private'}),parking('blocked',19.939),parking('ok',19.938)],[],{drive:async()=>route,onward:async input=>{if(input.start[0]===19.939)throw new ApiError(422,'NO_ROUTE','Blocked');return route;}});
  assert.deepEqual(r.alternatives.map(x=>x.id),['ok']);assert.equal(r.unavailable[0].parkingId,'blocked');
  await assert.rejects(calculateJourney(body,[parking('x',19.938)],[],{drive:async()=>route,onward:async()=>{throw new ApiError(422,'NO_ROUTE','No');}}),e=>e.code==='NO_JOURNEY');
});
test('driving uses its dedicated engine and does not substitute wheelchair routing on failure',async()=>{
  let requested='';await assert.rejects(driveRoute(body.start,body.end,{driveBase:'http://driving.test/ors',fetchImpl:async(url,init)=>{requested=url;assert.equal(JSON.parse(init.body).coordinates.length,2);return new Response('{}',{status:503});}}),e=>e.code==='CAR_ROUTE_UNAVAILABLE');
  assert.match(requested,/driving\.test.*driving-car/);
});
test('map area and reference point are validated and never expanded silently',()=>{
  const a=parseArea({bbox:'19.9,50,20,50.1'});assert(a.contains([19.95,50.05]));assert(!a.contains([20.1,50.05]));
  assert.throws(()=>parseArea({bbox:'20,50,19,51'}));assert.throws(()=>parseArea({near:'x,50'}));
});
