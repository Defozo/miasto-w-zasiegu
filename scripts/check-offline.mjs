import { chromium } from '@playwright/test';
const browser=await chromium.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});page.on('pageerror',e=>console.log('PAGEERROR',e.message));page.on('requestfailed',r=>console.log('FAILED',r.url(),r.failure()?.errorText));
await page.goto('http://127.0.0.1:4173/app');await page.waitForSelector('.place-card');await page.evaluate(()=>navigator.serviceWorker.ready);
await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
console.log('SW',await page.evaluate(async()=>({controller:navigator.serviceWorker.controller?.scriptURL,keys:await caches.keys(),html:(await (await caches.match('/index.html'))?.text())?.slice(0,160)})));
await context.setOffline(true);const response=await page.reload();console.log('NAV',response?.status(),response?.url());
try{await page.getByRole('heading',{name:'Dokąd dziś?'}).waitFor({timeout:10000});}catch{}
console.log('DOM',await page.content());await page.screenshot({path:'artifacts/offline-diagnostic.png'});await browser.close();
