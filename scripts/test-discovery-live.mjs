import { discoverWheelchair } from '../server/wheelchair-search.mjs';
import { writeFile } from 'node:fs/promises';
const query=process.argv[2]||'WHILL Model C2';
try {const result=await discoverWheelchair(query);await writeFile('artifacts/wheelchair-discovery-live.json',JSON.stringify({query,checkedAt:new Date().toISOString(),result},null,2));console.log(JSON.stringify({found:Boolean(result),name:result?.name,widthLabel:result?.widthLabel,parameters:result?.parameters.length,sources:result?.sources}));}catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}
