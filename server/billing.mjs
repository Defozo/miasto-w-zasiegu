import express from 'express';
import Stripe from 'stripe';
import { randomUUID, createHash } from 'node:crypto';
import { ApiError } from './routing.mjs';

export const BILLING_PLANS = Object.freeze({
  premium: { name: 'Miasto w zasięgu Premium', amount: 1000, interval: 'month' },
  map: { name: 'Reklama miejsca na mapie', amount: 4900, interval: 'month' },
  sponsored: { name: 'Reklama na mapie i sponsorowane wyniki', amount: 9900, interval: 'month' },
});
export const billingProductId = kind => `miastowzasiegu_${kind}_v1`;
export const billingPriceLookup = kind => `mwz_v1_${kind}_pln_${BILLING_PLANS[kind].amount}_month`;
export const STRIPE_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'];
const idOf = value => typeof value === 'string' ? value : value?.id;
const invoiceSubscription = invoice => idOf(invoice.parent?.subscription_details?.subscription ?? invoice.subscription);
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const allowedBusiness = new Set(['food', 'services', 'accommodation', 'culture']);

export function createBilling(context, options = {}) {
  const { db, store, getUser } = context;
  const now = options.now ?? Date.now;
  const secretKey = options.secretKey ?? process.env.MIASTO_W_ZASIEGU_STRIPE_SECRET_KEY ?? process.env.MIASTOWZASIEGU_STRIPE_SECRET_KEY ?? '';
  const webhookSecret = options.webhookSecret ?? process.env.MIASTOWZASIEGU_STRIPE_WEBHOOK_SECRET ?? '';
  const stripe = options.stripe ?? (secretKey ? new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15000 }) : null);
  const live = options.live ?? /^(sk|rk)_live_/.test(secretKey);
  const origin = options.origin ?? process.env.BILLING_PUBLIC_URL ?? 'https://miastowzasiegu.pl';
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || (parsedOrigin.protocol !== 'https:' && !['http://localhost', 'http://127.0.0.1'].some(local => origin === local || origin.startsWith(local + ':')))) throw new Error('BILLING_PUBLIC_URL must be an exact HTTPS origin (or local HTTP).');
  const enabled = Boolean(stripe && webhookSecret);
  db.exec(`CREATE TABLE IF NOT EXISTS billing_customers(user_id TEXT NOT NULL, customer_id TEXT NOT NULL UNIQUE, live INTEGER NOT NULL, PRIMARY KEY(user_id,live));
    CREATE TABLE IF NOT EXISTS billing_orders(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, place_id TEXT,
      amount INTEGER NOT NULL, status TEXT NOT NULL, session_id TEXT UNIQUE, session_url TEXT, customer_id TEXT,
      created_at INTEGER NOT NULL, live INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS billing_orders_owner ON billing_orders(user_id,created_at);
    CREATE TABLE IF NOT EXISTS billing_subscriptions(id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL,
      kind TEXT NOT NULL, place_id TEXT, status TEXT NOT NULL, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, live INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_invoices(id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, paid_until INTEGER NOT NULL,
      payment_intent_id TEXT, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS billing_events(id TEXT PRIMARY KEY, processed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_revocations(payment_intent_id TEXT PRIMARY KEY, revoked INTEGER NOT NULL);
  `);
  if (db.prepare('PRAGMA table_info(billing_customers)').all().filter(column => column.pk).length === 1) {
    db.exec(`BEGIN; ALTER TABLE billing_customers RENAME TO billing_customers_previous;
      CREATE TABLE billing_customers(user_id TEXT NOT NULL,customer_id TEXT NOT NULL UNIQUE,live INTEGER NOT NULL,PRIMARY KEY(user_id,live));
      INSERT INTO billing_customers SELECT * FROM billing_customers_previous;
      DROP TABLE billing_customers_previous; COMMIT;`);
  }
  if (!db.prepare('PRAGMA table_info(billing_subscriptions)').all().some(column => column.name === 'cancel_at')) db.exec('ALTER TABLE billing_subscriptions ADD COLUMN cancel_at INTEGER');
  if (!db.prepare('PRAGMA table_info(billing_revocations)').all().some(column => column.name === 'remaining_amount')) db.exec('ALTER TABLE billing_revocations ADD COLUMN remaining_amount INTEGER');
  // Serialize provider updates per process: retrieving current provider state avoids
  // applying stale subscription payloads when webhooks arrive out of order.
  let queue = Promise.resolve();
  const priceIds = new Map();
  const serial = task => { const next = queue.then(task); queue = next.catch(() => {}); return next; };
  async function recurringPrice(kind) {
    if (priceIds.has(kind)) return priceIds.get(kind);
    const prices = await stripe.prices.list({lookup_keys: [billingPriceLookup(kind)],active: true,limit: 1});
    const price = prices.data[0];
    if (!price || price.unit_amount !== BILLING_PLANS[kind].amount || price.currency !== 'pln' || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1 || idOf(price.product) !== billingProductId(kind)) {
      fail(503, 'BILLING_CATALOG_UNAVAILABLE', 'Ta oferta nie jest jeszcze gotowa do płatności. Nie pobraliśmy opłaty.');
    }
    priceIds.set(kind, price.id);
    return price.id;
  }
  function requireStripe() { if (!enabled) fail(503, 'BILLING_UNAVAILABLE', 'Płatności są jeszcze przygotowywane. Nie pobraliśmy żadnej opłaty.'); }
  function requireAccount(req) {
    const user = getUser(req);
    if (!user) fail(401, 'AUTH_REQUIRED', 'Zaloguj się, aby połączyć płatność z kontem.');
    if (req.body?.expectedUserId !== undefined && req.body.expectedUserId !== user.id) fail(409, 'ACCOUNT_CHANGED', 'Konto zmieniło się. Odśwież stronę przed płatnością.');
    return user;
  }
  function subscriptions(userId) {
    return db.prepare(`SELECT s.*, COALESCE(MAX(CASE WHEN i.revoked=0 AND COALESCE(r.revoked,0)=0 AND (r.remaining_amount IS NULL OR r.remaining_amount>=o.amount) THEN i.paid_until ELSE 0 END),0) AS paid_until
      FROM billing_subscriptions s JOIN billing_orders o ON o.id=s.order_id LEFT JOIN billing_invoices i ON i.subscription_id=s.id
      LEFT JOIN billing_revocations r ON r.payment_intent_id=i.payment_intent_id
      WHERE s.user_id=? AND s.live=? GROUP BY s.id`).all(userId, Number(live));
  }
  const accessUntil = sub => sub.cancel_at ? Math.min(sub.paid_until, sub.cancel_at) : sub.paid_until;
  const active = sub => ['active', 'past_due'].includes(sub.status) && accessUntil(sub) > now();
  function state(user) {
    const list = user ? subscriptions(user.id) : [];
    const premium = list.filter(sub => sub.kind === 'premium' && active(sub)).sort((a, b) => accessUntil(b) - accessUntil(a))[0];
    return { user: user ? { id: user.id, displayName: user.displayName } : null, enabled, mode: enabled ? (live ? 'live' : 'test') : 'unavailable',
      premium: Boolean(premium), premiumUntil: premium ? new Date(accessUntil(premium)).toISOString() : null,
      subscriptions: list.map(sub => ({ id: sub.id, kind: sub.kind, placeId: sub.place_id, placeName: sub.place_id ? store.place(sub.place_id)?.name ?? 'Obiekt' : null,
        status: sub.status, active: active(sub), paidUntil: sub.paid_until ? new Date(sub.paid_until).toISOString() : null,
        accessUntil: accessUntil(sub) ? new Date(accessUntil(sub)).toISOString() : null, cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at) })),
      canManage: Boolean(user && db.prepare('SELECT 1 FROM billing_customers WHERE user_id=? AND live=?').get(user.id, Number(live))),
      plans: BILLING_PLANS, donationMinimum: 500, currency: 'pln' };
  }
  async function customer(user) {
    const row = db.prepare('SELECT * FROM billing_customers WHERE user_id=? AND live=?').get(user.id, Number(live));
    if (row) return row.customer_id;
    const result = await stripe.customers.create({ ...(user.email ? { email: user.email } : {}), name: user.displayName,
      metadata: { app: 'miastowzasiegu', user_id: user.id } }, { idempotencyKey: 'mwz-customer-' + createHash('sha256').update(user.id).digest('hex') });
    db.prepare('INSERT OR IGNORE INTO billing_customers(user_id,customer_id,live) VALUES(?,?,?)').run(user.id, result.id, Number(live));
    return result.id;
  }
  async function syncSubscription(subscriptionId, invoiceId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
    const order = db.prepare('SELECT * FROM billing_orders WHERE id=? AND live=?').get(sub.metadata?.order_id ?? '', Number(live));
    if (!order || order.kind === 'donation' || idOf(sub.customer) !== order.customer_id || sub.livemode !== live) return;
    const item = sub.items?.data?.[0];
    if (sub.items?.data?.length !== 1 || item.quantity !== 1 || item.price?.currency !== 'pln' || item.price.unit_amount !== order.amount || item.price.recurring?.interval !== 'month' || item.price.recurring?.interval_count !== 1) return;
    db.prepare(`INSERT INTO billing_subscriptions(id,order_id,user_id,kind,place_id,status,cancel_at_period_end,live,cancel_at) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,cancel_at=excluded.cancel_at`)
      .run(sub.id, order.id, order.user_id, order.kind, order.place_id, sub.status, Number(Boolean(sub.cancel_at_period_end)), Number(live), sub.cancel_at ? sub.cancel_at * 1000 : null);
    const invoices = [];
    if (sub.latest_invoice) invoices.push(typeof sub.latest_invoice === 'string' ? await stripe.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice);
    if (invoiceId && !invoices.some(invoice => invoice.id === invoiceId)) invoices.push(await stripe.invoices.retrieve(invoiceId));
    for (const invoice of invoices) {
      if (invoice.status !== 'paid' || invoice.amount_paid < order.amount || invoice.currency !== 'pln' || invoice.livemode !== live || invoiceSubscription(invoice) !== sub.id) continue;
      const matchingLines = (invoice.lines?.data ?? []).filter(line => idOf(line.parent?.subscription_item_details?.subscription_item ?? line.subscription_item) === item.id && line.amount >= order.amount);
      const end = Math.max(0, ...matchingLines.map(line => (line.period?.end ?? 0) * 1000));
      if (!end) continue;
      let intent = idOf(invoice.payment_intent);
      if (!intent && stripe.invoicePayments) {
        const payments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 10 });
        intent = idOf(payments.data.find(payment => payment.status === 'paid' && payment.payment?.type === 'payment_intent')?.payment?.payment_intent);
      }
      db.prepare('INSERT INTO billing_invoices(id,subscription_id,paid_until,payment_intent_id) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payment_intent_id=COALESCE(excluded.payment_intent_id,billing_invoices.payment_intent_id)')
        .run(invoice.id, sub.id, end, intent ?? null);
      db.prepare("UPDATE billing_orders SET status='paid' WHERE id=?").run(order.id);
    }
  }
  async function syncSession(sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const order = db.prepare('SELECT * FROM billing_orders WHERE id=? AND live=?').get(session.metadata?.order_id ?? '', Number(live));
    if (!order || (order.session_id && order.session_id !== session.id) || session.client_reference_id !== order.user_id || idOf(session.customer) !== order.customer_id || session.livemode !== live) return;
    if (!order.session_id) db.prepare('UPDATE billing_orders SET session_id=? WHERE id=?').run(session.id, order.id);
    if (order.kind === 'donation' && session.mode === 'payment' && session.payment_status === 'paid' && session.currency === 'pln' && session.amount_total === order.amount) {
      db.prepare("UPDATE billing_orders SET status='paid' WHERE id=?").run(order.id);
    } else if (order.kind !== 'donation' && session.mode === 'subscription' && session.subscription) {
      await syncSubscription(idOf(session.subscription));
    } else if (session.status === 'expired') db.prepare("UPDATE billing_orders SET status='expired' WHERE id=? AND status!='paid'").run(order.id);
  }
  async function processEvent(event) {
    if (event.livemode !== live || db.prepare('SELECT 1 FROM billing_events WHERE id=?').get(event.id)) return;
    const object = event.data.object;
    if (event.type.startsWith('checkout.session.')) await syncSession(object.id);
    else if (event.type.startsWith('customer.subscription.')) await syncSubscription(object.id);
    else if (event.type.startsWith('invoice.')) { const sub = invoiceSubscription(object); if (sub) await syncSubscription(sub, object.id); }
    else if (event.type.startsWith('charge.')) {
      const charge = await stripe.charges.retrieve(event.type === 'charge.refunded' ? object.id : idOf(object.charge));
      const intent = idOf(charge.payment_intent);
      const dispute = event.type.startsWith('charge.dispute.') ? await stripe.disputes.retrieve(object.id) : null;
      if (intent) db.prepare('INSERT INTO billing_revocations(payment_intent_id,revoked,remaining_amount) VALUES(?,?,?) ON CONFLICT(payment_intent_id) DO UPDATE SET revoked=excluded.revoked,remaining_amount=excluded.remaining_amount')
        .run(intent, Number(charge.refunded || Boolean(dispute && !['won', 'warning_closed'].includes(dispute.status)) || Boolean(charge.disputed && !dispute)), charge.amount - charge.amount_refunded);
    }
    db.prepare('INSERT OR IGNORE INTO billing_events(id,processed_at) VALUES(?,?)').run(event.id, now());
  }
  function webhook(app) {
    app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '512kb' }), async (req, res) => {
      requireStripe();
      let event;
      try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret); }
      catch { fail(400, 'INVALID_STRIPE_SIGNATURE', 'Nieprawidłowy podpis powiadomienia płatności.'); }
      if (STRIPE_EVENTS.includes(event.type)) await serial(() => processEvent(event));
      res.json({ received: true });
    });
  }
  function routes(app) {
    app.get('/api/billing/state', (req, res) => res.json(state(getUser(req))));
    app.post('/api/billing/checkout', async (req, res) => {
      const user = requireAccount(req); requireStripe();
      const { kind, placeId, amount, acceptedTerms } = req.body ?? {};
      if (!(Object.hasOwn(BILLING_PLANS, kind ?? '') || kind === 'donation') || acceptedTerms !== true) fail(400, 'INVALID_CHECKOUT', 'Wybierz ofertę i zaakceptuj warunki płatności.');
      let price = BILLING_PLANS[kind]?.amount;
      if (kind === 'donation') {
        if (!Number.isSafeInteger(amount) || amount < 500 || amount > 100000) fail(400, 'INVALID_AMOUNT', 'Jednorazowe wsparcie: od 5 do 1000 zł.');
        price = amount;
      }
      const ad = kind === 'map' || kind === 'sponsored';
      if (ad && (typeof placeId !== 'string' || !allowedBusiness.has(store.place(placeId)?.category) || req.body.authorized !== true)) fail(400, 'INVALID_AD_PLACE', 'Wybierz obiekt i potwierdź uprawnienie do jego promowania.');
      const result = await serial(async () => {
        const duplicate = subscriptions(user.id).find(sub => !['canceled', 'incomplete_expired'].includes(sub.status) && (kind === 'premium' ? sub.kind === kind : ad && sub.place_id === placeId));
        if (duplicate) fail(409, 'ALREADY_SUBSCRIBED', 'Ten abonament jest już na Twoim koncie. Przejdź do zarządzania płatnościami.');
        let order = db.prepare("SELECT * FROM billing_orders WHERE user_id=? AND live=? AND status IN ('creating','pending') AND (kind=? OR (?=1 AND kind IN ('map','sponsored'))) AND COALESCE(place_id,'')=? ORDER BY created_at DESC LIMIT 1")
          .get(user.id, Number(live), kind, Number(ad), ad ? placeId : '');
        if (order?.session_id) {
          const remote = await stripe.checkout.sessions.retrieve(order.session_id);
          if (remote.status === 'open' && order.amount === price && order.kind === kind) return { url: remote.url };
          if (remote.status === 'open') {
            await stripe.checkout.sessions.expire(remote.id);
            db.prepare("UPDATE billing_orders SET status='expired' WHERE id=?").run(order.id);
          }
          await syncSession(remote.id);
          if (remote.status === 'complete') fail(409, 'CHECKOUT_COMPLETED', 'Płatność została zakończona. Odśwież status konta.');
          order = null;
        }
        if (order && (order.amount !== price || order.kind !== kind)) fail(409, 'CHECKOUT_PENDING', 'Poprzednia płatność jest jeszcze przygotowywana. Ponów poprzedni wybór, aby sprawdzić jej status.');
        const priceId = kind === 'donation' ? null : await recurringPrice(kind);
        const customerId = await customer(user);
        if (!order) {
          const count = db.prepare('SELECT COUNT(*) AS n FROM billing_orders WHERE user_id=? AND created_at>?').get(user.id, now() - 3600_000).n;
          if (count >= 12) fail(429, 'CHECKOUT_LIMIT', 'Zbyt wiele prób płatności. Spróbuj później.');
          order = { id: randomUUID(), user_id: user.id, kind, amount: price, place_id: ad ? placeId : null, customer_id: customerId, created_at: now() };
          db.prepare("INSERT INTO billing_orders(id,user_id,kind,place_id,amount,status,customer_id,created_at,live) VALUES(?,?,?,?,?,'creating',?,?,?)")
            .run(order.id, user.id, kind, order.place_id, price, customerId, order.created_at, Number(live));
        }
        const metadata = { app: 'miastowzasiegu', order_id: order.id };
        const session = await stripe.checkout.sessions.create({ mode: kind === 'donation' ? 'payment' : 'subscription', customer: customerId,
          client_reference_id: user.id, metadata, locale: 'pl',
          integration_identifier: `mwz-${kind}-${Array.from(createHash('sha256').update(order.id).digest().subarray(0, 8), byte => String.fromCharCode(97 + byte % 26)).join('')}`,
          success_url: `${origin}/cennik?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/cennik?payment=canceled`,
          ...(kind === 'donation' ? { payment_intent_data: { metadata } } : { subscription_data: { metadata } }),
          ...(ad ? {custom_text: {submit: {message: `Promowany obiekt: ${store.place(placeId).name}. Emisja zależy od obszaru mapy i filtrów.`}},
            tax_id_collection: {enabled: true},customer_update: {name: 'auto',address: 'auto'},billing_address_collection: 'required'} : {}),
          line_items: [{ quantity: 1, ...(priceId ? {price: priceId} : {price_data: {currency: 'pln',unit_amount: price,product: billingProductId('donation')}}) }],
        }, { idempotencyKey: `mwz-checkout-${order.id}` });
        db.prepare("UPDATE billing_orders SET status='pending',session_id=?,session_url=? WHERE id=?").run(session.id, session.url, order.id);
        return { url: session.url };
      });
      res.json(result);
    });
    app.post('/api/billing/confirm', async (req, res) => {
      const user = requireAccount(req); requireStripe();
      if (typeof req.body?.sessionId !== 'string' || req.body.sessionId.length > 255) fail(400, 'INVALID_SESSION', 'Nieprawidłowa płatność.');
      const order = db.prepare('SELECT * FROM billing_orders WHERE session_id=? AND user_id=? AND live=?').get(req.body.sessionId, user.id, Number(live));
      if (!order) fail(404, 'PAYMENT_NOT_FOUND', 'Nie znaleziono tej płatności na Twoim koncie.');
      await serial(() => syncSession(order.session_id));
      res.json({ status: db.prepare('SELECT status FROM billing_orders WHERE id=?').get(order.id).status, state: state(user) });
    });
    app.post('/api/billing/portal', async (req, res) => {
      const user = requireAccount(req); requireStripe();
      const row = db.prepare('SELECT * FROM billing_customers WHERE user_id=? AND live=?').get(user.id, Number(live));
      if (!row) fail(404, 'BILLING_ACCOUNT_NOT_FOUND', 'Nie masz jeszcze płatności do zarządzania.');
      const session = await stripe.billingPortal.sessions.create({ customer: row.customer_id, return_url: `${origin}/cennik`,
        ...(process.env.MIASTOWZASIEGU_STRIPE_PORTAL_CONFIG ? { configuration: process.env.MIASTOWZASIEGU_STRIPE_PORTAL_CONFIG } : {}) });
      res.json({ url: session.url });
    });
  }
  function promote(places, user, { recommendations = false } = {}) {
    if (state(user).premium) return places;
    const campaigns = db.prepare(`SELECT s.place_id,s.kind,u.display_name AS advertiser FROM billing_subscriptions s
      JOIN users u ON u.id=s.user_id JOIN billing_orders o ON o.id=s.order_id JOIN billing_invoices i ON i.subscription_id=s.id
      LEFT JOIN billing_revocations r ON r.payment_intent_id=i.payment_intent_id
      WHERE s.kind IN ('map','sponsored') AND s.status IN ('active','past_due') AND s.live=? AND i.paid_until>? AND (s.cancel_at IS NULL OR s.cancel_at>?) AND i.revoked=0 AND COALESCE(r.revoked,0)=0 AND (r.remaining_amount IS NULL OR r.remaining_amount>=o.amount)
      GROUP BY s.place_id,s.kind ORDER BY s.kind DESC,s.place_id`).all(Number(live), now(), now());
    const byId = new Map();
    for (const campaign of campaigns) if (!byId.has(campaign.place_id) || campaign.kind === 'sponsored') byId.set(campaign.place_id, campaign);
    // Call only AFTER category, location and accessibility filters. Source facts stay untouched.
    let count = 0, recommended = 0;
    const enriched = places.map(place => {
      const campaign = byId.get(place.id);
      if (!campaign || count >= 5) return place;
      count++;
      const recommendation = recommendations && campaign.kind === 'sponsored' && recommended++ < 2;
      return { ...place, promotion: { label: 'Sponsorowane', advertiser: campaign.advertiser, recommendation } };
    });
    return [...enriched.filter(p => p.promotion?.recommendation), ...enriched.filter(p => !p.promotion?.recommendation)];
  }
  return { webhook, routes, state, promote };
}
