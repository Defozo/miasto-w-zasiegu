import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const state = {user:{id:'isolated-alice',displayName:'Konto testowe'},enabled:true,mode:'test',premium:false,premiumUntil:null,canManage:false,
  plans:{premium:{name:'Premium',amount:1000,interval:'month'},map:{name:'Mapa',amount:4900,interval:'month'},sponsored:{name:'Mapa i wyniki',amount:9900,interval:'month'}},
  subscriptions:[],currency:'pln',donationMinimum:500};

test('guest can read prices, navigate by keyboard and reach sign-in; desktop and mobile have no overflow or axe violations', async ({page}) => {
  await page.goto('/cennik');
  await expect(page.getByRole('heading',{name:'Mapa bez opłat. Opcje dodatkowe.'})).toBeVisible();
  await expect(page.getByText('Płatności uruchomimy wkrótce.',{exact:false})).toBeVisible();
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await expect(page.getByRole('button',{name:'Wybieram Premium'})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({path:`artifacts/pricing-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Wybieram Premium'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region',{name:'Premium',exact:true})).toBeFocused();
  await expect(page.getByRole('link',{name:'Zaloguj się i wróć do cennika'})).toHaveAttribute('href','/sign-in?return_to=%2Fcennik');
});

test('one-time support sends grosz and consent; it never requests a subscription', async ({page}) => {
  await page.route('**/api/billing/state',route => route.fulfill({json:state}));
  let submitted: Record<string,unknown> | undefined;
  await page.route('**/api/billing/checkout',async route => { submitted=route.request().postDataJSON(); await route.fulfill({status:503,json:{error:{message:'Izolowany test: przekierowanie zatrzymane.'}}}); });
  await page.goto('/cennik');
  await page.getByRole('button',{name:'Chcę wesprzeć'}).click();
  await page.getByLabel('Kwota jednorazowego wsparcia (zł)').fill('12.34');
  const button = page.getByRole('button',{name:'Przejdź do płatności Stripe'});
  await expect(button).toBeDisabled();
  await page.getByLabel('Potwierdzam jednorazową wpłatę w podanej kwocie.').check();
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Izolowany test');
  expect(submitted).toMatchObject({kind:'donation',amount:1234,acceptedTerms:true,expectedUserId:'isolated-alice'});
});

test('advertiser must select a real result and confirm authorization and recurring terms', async ({page}) => {
  await page.route('**/api/billing/state',route => route.fulfill({json:state}));
  await page.route('**/api/places?*',route => route.fulfill({json:{places:[{id:'isolated-place',name:'Kawiarnia testowa',address:'Dane przykładowe',category:'food'}]}}));
  let submitted: Record<string,unknown> | undefined;
  await page.route('**/api/billing/checkout',async route => {submitted=route.request().postDataJSON();await route.fulfill({json:{url:'https://untrusted.example/checkout'}});});
  await page.goto('/cennik');
  await page.getByRole('button',{name:'Promuj swój obiekt'}).click();
  const button = page.getByRole('button',{name:'Przejdź do płatności Stripe'});
  await expect(button).toBeDisabled();
  await page.getByLabel('Znajdź swój obiekt').fill('Kawiarnia');
  await page.getByRole('button',{name:'Kawiarnia testowa Dane przykładowe'}).click();
  await page.getByLabel('Mam prawo promować ten obiekt.').check();
  await expect(button).toBeDisabled();
  await page.getByLabel('Akceptuję cenę, miesięczne odnawianie',{exact:false}).check();
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Nieprawidłowy adres płatności');
  expect(submitted).toMatchObject({kind:'sponsored',placeId:'isolated-place',authorized:true,acceptedTerms:true});
  expect(page.url()).toContain('/cennik');
});

test('return page waits for provider confirmation and refresh retries confirmation', async ({page}) => {
  await page.route('**/api/billing/state',route=>route.fulfill({json:state}));
  let calls=0;
  await page.route('**/api/billing/confirm',route=>route.fulfill({json:{status:++calls===1?'pending':'paid',state:{...state,premium:calls>1}}}));
  await page.goto('/cennik?session_id=cs_isolated');
  await expect(page.getByRole('status')).toContainText('Płatność oczekuje na potwierdzenie');
  await page.getByRole('button',{name:'Odśwież status'}).click();
  await expect(page.getByRole('status')).toContainText('Płatność potwierdzona');
  await expect(page.getByRole('button',{name:'Zarządzaj Premium'})).toBeVisible();
  expect(calls).toBe(2);
});

test('scheduled cancellation displays the actual access cutoff instead of the later invoice period', async ({page}) => {
  const accessUntil = '2026-10-05T12:00:00.000Z';
  await page.route('**/api/billing/state', route => route.fulfill({json:{...state,premium:true,premiumUntil:accessUntil,canManage:true,
    subscriptions:[{id:'sub_isolated',kind:'premium',status:'active',active:true,paidUntil:'2026-11-03T12:00:00.000Z',accessUntil,cancelAtPeriodEnd:true}]}}));
  await page.goto('/cennik');
  const payments = page.getByRole('region',{name:'Twoje płatności'});
  await expect(payments).toContainText('Dostęp do 5.10.2026. Przedłużenie anulowane.');
  await expect(payments).not.toContainText('3.11.2026');
});
