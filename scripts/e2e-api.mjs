import {createApp} from '../server/index.mjs';
import {createAuth} from '../tests/helpers/local-auth.mjs';
const unavailable = async () => { throw new Error('SEARCH_NOT_CONFIGURED'); };
const app=createApp({dbPath:':memory:',parkingsPath:'server/data/parkings.json',authFactory:createAuth,billingOptions:{secretKey:'',webhookSecret:''},reportPhotoOptions:{analyze:unavailable},placeResearchOptions:{research:unavailable},equipmentResearchOptions:{discover:unavailable,identify:unavailable,converse:unavailable},wheelchairSearchOptions:{discover:unavailable},mountRoutes(app){
  app.get('/api/test-environment',(_req,res)=>res.json({isolated:true,storage:'memory',externalAi:false}));
  app.get('/api/auth/config',(_req,res)=>res.json({provider:'clerk',configured:false,publishableKey:''}));
}});app.listen(Number(process.env.PORT) || 3082,'127.0.0.1',()=>console.log('Isolated end-to-end API; local auth fixture, no external AI calls'));
