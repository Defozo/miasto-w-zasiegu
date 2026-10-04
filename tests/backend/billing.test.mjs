import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Stripe from 'stripe';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createBilling } from '../../server/billing.mjs';
import { matchesPlaceFilters, DEFAULT_PLACE_FILTERS } from '../../shared/place-filters.mjs';

const fixtures = [];
after(async () => { for (const f of fixtures) { await new Promise(resolve => f.server.close(resolve)); f.db.close(); } });
async function fixture({ disabled = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,display_name TEXT); INSERT INTO users VALUES('alice','Firma Alice'),('bob','Bob');");
  let timestamp = Date.now();
  const sessions = new Map(), subscriptions = new Map(), invoices = new Map(), charges = new Map();
  const calls = [];
  const stripe = {
    webhooks: Stripe.webhooks,
    customers: { create: async data => ({ id: `cus_${data.metadata.user_id}` }) },
    prices: {list: async ({lookup_keys: [lookup]}) => { const kind=lookup.split('_')[2];return {data:[{id:`price_${kind}`,unit_amount:{premium:1000,map:4900,sponsored:9900}[kind],currency:'pln',product:`miastowzasiegu_${kind}_v1`,recurring:{interval:'month',interval_count:1}}]}; }},
    checkout: { sessions: {
      create: async (data, opts) => {
        calls.push({ data, opts });
        const session = { ...data, id: `cs_test_${calls.length}`, url: `https://checkout.stripe.com/c/pay/test_${calls.length}`, status: 'open', livemode: false };
        sessions.set(session.id, session); return session;
      }, retrieve: async id => { if (!sessions.has(id)) throw new Error('Missing session'); return sessions.get(id); },
      expire: async id => { const session = sessions.get(id); session.status = 'expired'; return session; },
    } },
    subscriptions: { retrieve: async id => { const sub = subscriptions.get(id); return { ...sub, latest_invoice: invoices.get(sub.latest_invoice) }; } },
    invoices: { retrieve: async id => invoices.get(id) },
    charges: { retrieve: async id => charges.get(id) },
    billingPortal: { sessions: { create: async data => ({ url: `https://billing.stripe.com/p/session/${data.customer}` }) } },
  };
  const places = [
    { id: 'near', name: 'Bliższy sklep', category: 'services', coordinates: [19.93, 50.06], access: { stepFree: true } },
    { id: 'far', name: 'Dalszy sklep', category: 'services', coordinates: [19.94, 50.06], access: { stepFree: true } },
    { id: 'stairs', name: 'Sklep ze schodami', category: 'services', coordinates: [19.95, 50.06], access: { stepFree: false } },
  ];
  const getUser = req => req.get('x-test-user') ? { id: req.get('x-test-user'), displayName: req.get('x-test-user'), email: 'test@example.invalid' } : null;
  const billing = createBilling({ db, store: { place: id => places.find(p => p.id === id) }, getUser }, { stripe: disabled ? null : stripe, secretKey: '', webhookSecret: disabled ? '' : 'whsec_isolated_test', live: false, now: () => timestamp });
  const app = express(); billing.webhook(app); app.use(express.json()); billing.routes(app);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: { code: error.code || 'INTERNAL', message: error.message } }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/billing`;
  const f = { db, server, sessions, subscriptions, invoices, charges, calls, places, billing, stripe,
    now: () => timestamp, advance: ms => { timestamp += ms; },
    async request(path, body, user = 'alice') {
      const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(user ? { 'x-test-user': user } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    },
    async event(type, object, eventId = randomUUID(), signed = true, live = false) {
      const payload = JSON.stringify({ id: eventId, type, data: { object }, livemode: live });
      const header = signed ? Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_isolated_test' }) : 'invalid';
      const r = await fetch(base + '/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload });
      return { status: r.status, body: await r.json() };
    },
    async buy(kind = 'premium', placeId, user = 'alice') {
      const r = await f.request('/checkout', { kind, placeId, acceptedTerms: true, authorized: true }, user);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const session = [...sessions.values()].at(-1), order = db.prepare('SELECT * FROM billing_orders WHERE session_id=?').get(session.id);
      const subId = `sub_${session.id}`, invoiceId = `in_${session.id}`, itemId = `si_${session.id}`;
      const invoice = { id: invoiceId, status: 'paid', amount_paid: order.amount, currency: 'pln', livemode: false,
        parent: { subscription_details: { subscription: subId } }, payment_intent: `pi_${session.id}`,
        lines: { data: [{ amount: order.amount, parent: { subscription_item_details: { subscription_item: itemId } }, period: { end: Math.floor((timestamp + 30 * 86400000) / 1000) } }] } };
      const sub = { id: subId, metadata: { order_id: order.id }, customer: order.customer_id, livemode: false, status: 'active', cancel_at_period_end: false,
        latest_invoice: invoiceId, items: { data: [{ id: itemId, quantity: 1, price: { currency: 'pln', unit_amount: order.amount, recurring: { interval: 'month', interval_count: 1 } } }] } };
      invoices.set(invoiceId, invoice); subscriptions.set(subId, sub);
      Object.assign(session, { status: 'complete', subscription: subId, payment_status: 'paid', currency: 'pln', amount_total: order.amount });
      return { session, sub, invoice, order };
    },
  };
  fixtures.push(f); return f;
}

test('checkout requires identity, terms, server price and actual authorized business place', async () => {
  const f = await fixture();
  assert.equal((await f.request('/checkout', { kind: 'premium', acceptedTerms: true }, null)).status, 401);
  assert.equal((await f.request('/checkout', { kind: 'premium' })).status, 400);
  assert.equal((await f.request('/checkout', { kind: 'map', placeId: 'invented', authorized: true, acceptedTerms: true })).status, 400);
  const r = await f.request('/checkout', { kind: 'premium', amount: 1, acceptedTerms: true, success_url: 'https://evil.invalid' });
  assert.equal(r.status, 200);
  assert.equal(f.calls[0].data.line_items[0].price, 'price_premium');
  assert.equal(f.calls[0].data.success_url, 'https://miastowzasiegu.pl/cennik?session_id={CHECKOUT_SESSION_ID}');
  assert.match(f.calls[0].data.integration_identifier, /^mwz-premium-[a-z]{8}$/);
  assert.equal((await f.request('/state')).body.premium, false);
  const replay = await f.request('/checkout', { kind: 'premium', acceptedTerms: true });
  assert.equal(replay.body.url, r.body.url); assert.equal(f.calls.length, 1);
});

test('parallel retries and an old still-open Checkout cannot create a second subscription', async () => {
  const f = await fixture();
  const body = { kind: 'premium', acceptedTerms: true };
  const results = await Promise.all([f.request('/checkout', body), f.request('/checkout', body)]);
  assert.equal(results[0].body.url, results[1].body.url);
  assert.equal(f.calls.length, 1);
  f.advance(32 * 60_000);
  assert.equal((await f.request('/checkout', body)).body.url, results[0].body.url);
  assert.equal(f.calls.length, 1);
});

test('changing a pending advertising package expires its old Checkout before creating the replacement', async () => {
  const f = await fixture();
  const body = { kind: 'map', placeId: 'near', acceptedTerms: true, authorized: true };
  await f.request('/checkout', body);
  const previous = [...f.sessions.values()][0];
  const result = await f.request('/checkout', { ...body, kind: 'sponsored' });
  assert.equal(result.status, 200);
  assert.equal(previous.status, 'expired');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].data.line_items[0].price, 'price_sponsored');
});

test('signed, paid confirmation grants Premium once; forged callbacks and other accounts cannot', async () => {
  const f = await fixture(), { session, sub } = await f.buy();
  assert.equal((await f.event('checkout.session.completed', session, 'forged', false)).status, 400);
  assert.equal((await f.request('/state')).body.premium, false);
  assert.equal((await f.request('/confirm', { sessionId: session.id }, 'bob')).status, 404);
  assert.equal((await f.event('checkout.session.completed', session, 'valid')).status, 200);
  assert.equal((await f.request('/state')).body.premium, true);
  await f.event('checkout.session.completed', session, 'valid');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM billing_invoices').get().n, 1);
  assert.equal((await f.request('/state', undefined, 'bob')).body.premium, false);
  assert.equal((await f.request('/checkout', { kind: 'premium', acceptedTerms: true })).status, 409);
  assert.equal((await f.request('/portal', {})).body.url, 'https://billing.stripe.com/p/session/cus_alice');
  assert.equal((await f.request('/portal', {}, 'bob')).status, 404);
  sub.cancel_at_period_end = true;
  await f.event('customer.subscription.updated', sub);
  assert.equal((await f.request('/state')).body.premium, true);
  assert.equal((await f.request('/state')).body.subscriptions[0].cancelAtPeriodEnd, true);
});

test('unpaid renewal never extends Premium; current provider state wins over delayed events', async () => {
  const f = await fixture(), { session, sub, invoice } = await f.buy();
  await f.event('checkout.session.completed', session);
  const firstUntil = (await f.request('/state')).body.premiumUntil;
  const renewal = structuredClone(invoice); renewal.id = 'in_renewal'; renewal.status = 'open'; renewal.amount_paid = 0;
  renewal.lines.data[0].period.end += 30 * 86400;
  f.invoices.set(renewal.id, renewal); sub.latest_invoice = renewal.id; sub.status = 'past_due';
  await f.event('invoice.payment_failed', renewal);
  assert.equal((await f.request('/state')).body.premiumUntil, firstUntil);
  f.advance(31 * 86400000);
  assert.equal((await f.request('/state')).body.premium, false);
  renewal.status = 'paid'; renewal.amount_paid = 1000; sub.status = 'active';
  await f.event('invoice.paid', renewal);
  assert.equal((await f.request('/state')).body.premium, true);
  sub.status = 'canceled';
  await f.event('customer.subscription.deleted', sub);
  await f.event('customer.subscription.updated', { ...sub, status: 'active' });
  assert.equal((await f.request('/state')).body.premium, false);
});

test('unpaid checkout and wrong environment cannot grant Premium; return page verifies provider', async () => {
  const f = await fixture(), { session, invoice } = await f.buy();
  invoice.status = 'open'; invoice.amount_paid = 0;
  await f.event('checkout.session.completed', session);
  assert.equal((await f.request('/state')).body.premium, false);
  invoice.status = 'paid'; invoice.amount_paid = 1000;
  await f.event('invoice.paid', invoice, 'live_wrong', true, true);
  assert.equal((await f.request('/state')).body.premium, false);
  const result = await f.request('/confirm', { sessionId: session.id });
  assert.equal(result.body.status, 'paid'); assert.equal(result.body.state.premium, true);
});

test('refund revokes paid access and cannot be undone by replaying a paid invoice', async () => {
  const f = await fixture(), { session, invoice } = await f.buy();
  await f.event('checkout.session.completed', session);
  const charge = { id: 'ch_refund', payment_intent: invoice.payment_intent, refunded: true, amount: 1000, amount_refunded: 1000 };
  f.charges.set(charge.id, charge);
  await f.event('charge.refunded', charge);
  assert.equal((await f.request('/state')).body.premium, false);
  await f.event('invoice.paid', invoice);
  assert.equal((await f.request('/state')).body.premium, false);
});

test('partial refunds revoke underpaid periods regardless of webhook delivery order', async () => {
  for (const refundFirst of [true, false]) {
    const f = await fixture(), { invoice } = await f.buy();
    const charge = { id: 'ch_partial', payment_intent: invoice.payment_intent, amount: 1000, amount_refunded: 100, refunded: false };
    f.charges.set(charge.id, charge);
    if (!refundFirst) await f.event('invoice.paid', invoice);
    await f.event('charge.refunded', charge);
    await f.event('invoice.paid', invoice);
    assert.equal((await f.request('/state')).body.premium, false);
  }
});

test('current Invoice Payments API links paid invoices to later refunds', async () => {
  const f = await fixture(), {session,invoice} = await f.buy();
  const intent = invoice.payment_intent;
  delete invoice.payment_intent;
  f.stripe.invoicePayments = {list: async ({invoice: id}) => {
    assert.equal(id, invoice.id);
    return {data:[{status:'paid',payment:{type:'payment_intent',payment_intent:intent}}]};
  }};
  await f.event('checkout.session.completed', session);
  assert.equal((await f.request('/state')).body.premium, true);
  const charge = {id:'ch_modern_refund',payment_intent:intent,amount:1000,amount_refunded:1000,refunded:true};
  f.charges.set(charge.id, charge);
  await f.event('charge.refunded', charge);
  assert.equal((await f.request('/state')).body.premium, false);
});

test('missing or mismatched Stripe catalog prices fail before creating a checkout', async () => {
  const valid = { id: 'price_premium', unit_amount: 1000, currency: 'pln', product: 'miastowzasiegu_premium_v1', recurring: { interval: 'month', interval_count: 1 } };
  for (const price of [null, {...valid,unit_amount:10000}, {...valid,currency:'eur'}, {...valid,product:'unrelated_product'}, {...valid,recurring:{interval:'year',interval_count:1}}, {...valid,recurring:{interval:'month',interval_count:2}}]) {
    const f = await fixture();
    f.stripe.prices.list = async () => ({data:price?[price]:[]});
    assert.equal((await f.request('/checkout',{kind:'premium',acceptedTerms:true})).status,503);
    assert.equal(f.calls.length,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM billing_orders').get().count,0);
  }
});

test('scheduled flexible cancellation is shown and expires at cancel_at', async () => {
  const f = await fixture(), { session, sub, invoice } = await f.buy();
  sub.cancel_at = Math.floor((f.now() + 86400000) / 1000);
  await f.event('checkout.session.completed', session);
  const state = (await f.request('/state')).body;
  assert.equal(state.premium, true);
  assert.equal(state.subscriptions[0].cancelAtPeriodEnd, true);
  assert.equal(state.premiumUntil, new Date(sub.cancel_at * 1000).toISOString());
  assert.equal(state.subscriptions[0].accessUntil, state.premiumUntil);
  assert.equal(state.subscriptions[0].paidUntil, new Date(invoice.lines.data[0].period.end * 1000).toISOString());
  f.advance(86400001);
  assert.equal((await f.request('/state')).body.premium, false);
});

test('withdrawing a scheduled cancellation restores the full paid access period', async () => {
  const f = await fixture(), { session, sub, invoice } = await f.buy();
  sub.cancel_at = Math.floor((f.now() + 86400000) / 1000);
  await f.event('checkout.session.completed', session);
  sub.cancel_at = null;
  await f.event('customer.subscription.updated', sub);
  f.advance(86400001);
  const state = (await f.request('/state')).body;
  assert.equal(state.premium, true);
  assert.equal(state.subscriptions[0].cancelAtPeriodEnd, false);
  assert.equal(state.premiumUntil, new Date(invoice.lines.data[0].period.end * 1000).toISOString());
});

test('a canceled ad stops at cancel_at even before the deletion webhook arrives', async () => {
  const f = await fixture(), { session, sub } = await f.buy('sponsored', 'far');
  sub.cancel_at = Math.floor((f.now() + 86400000) / 1000);
  await f.event('checkout.session.completed', session);
  assert.equal(f.billing.promote(f.places, null, {recommendations:true})[0].promotion.recommendation, true);
  f.advance(86400001);
  assert.equal(f.billing.promote(f.places, null, {recommendations:true}).some(place => place.promotion), false);
});

test('another advertiser with a map plan cannot mask an active sponsored plan for the same place', async () => {
  const f = await fixture();
  const sponsored = await f.buy('sponsored', 'far'); await f.event('checkout.session.completed', sponsored.session);
  const map = await f.buy('map', 'far', 'bob'); await f.event('checkout.session.completed', map.session);
  const promoted = f.billing.promote(f.places, null, {recommendations: true});
  assert.equal(promoted[0].id, 'far');
  assert.equal(promoted[0].promotion.recommendation, true);
});

test('ads retain real coordinates, stay within filters and disappear for Premium without removing places', async () => {
  const f = await fixture();
  const ad = await f.buy('sponsored', 'far'); await f.event('checkout.session.completed', ad.session);
  const another = await f.buy('sponsored', 'stairs'); await f.event('checkout.session.completed', another.session);
  const suitable = f.places.filter(p => matchesPlaceFilters(p, { ...DEFAULT_PLACE_FILTERS, stepFree: true }));
  const result = f.billing.promote(suitable, null, { recommendations: true });
  assert.equal(result[0].id, 'far'); assert.equal(result[0].promotion.recommendation, true);
  assert.deepEqual(result[0].coordinates, f.places[1].coordinates);
  assert.equal(result.some(p => p.id === 'stairs'), false);
  const premium = await f.buy('premium', undefined, 'bob'); await f.event('checkout.session.completed', premium.session);
  const organic = f.billing.promote(suitable, { id: 'bob' }, { recommendations: true });
  assert.deepEqual(organic.map(p => p.id), ['near', 'far']);
  assert.equal(organic.some(p => p.promotion), false);
  assert.equal(f.places.some(p => p.promotion), false);
});

test('donations validate whole grosz, are one-time and do not grant a subscription', async () => {
  const f = await fixture();
  for (const amount of [0, 499, 100001, 1000.5, '1000']) assert.equal((await f.request('/checkout', { kind: 'donation', amount, acceptedTerms: true })).status, 400);
  assert.equal((await f.request('/checkout', { kind: 'donation', amount: 2500, acceptedTerms: true })).status, 200);
  const session = [...f.sessions.values()][0];
  assert.equal(session.mode, 'payment'); assert.equal(session.line_items[0].price_data.recurring, undefined);
  Object.assign(session, { status: 'complete', payment_status: 'paid', currency: 'pln', amount_total: 2500 });
  await f.event('checkout.session.completed', session);
  assert.equal((await f.request('/state')).body.premium, false);
  assert.equal(f.db.prepare('SELECT status FROM billing_orders').get().status, 'paid');
});

test('unconfigured Stripe shows prices but never accepts a purchase', async () => {
  const f = await fixture({ disabled: true });
  const result = await f.request('/state');
  assert.equal(result.body.enabled, false); assert.equal(result.body.plans.premium.amount, 1000);
  assert.equal((await f.request('/checkout', { kind: 'premium', acceptedTerms: true })).status, 503);
});
