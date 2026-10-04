import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { EquipmentJob } from '../../web/src/types';

async function fixture(page: Page, { kind = 'power', fail = false }: { kind?: 'power' | 'manual'; fail?: boolean } = {}) {
  const sent: string[] = [];
  const messages: NonNullable<EquipmentJob['messages']> = [];
  let serial = 0, failed = false;
  let current: EquipmentJob;
  const evidence = {
    name: 'CAMELEON (dane testowe)', manufacturer: 'Vitea Care', variant: 'Rozmiary 16, 18 lub 20 cali',
    widthCm: null, widthLabel: '59 cm, 64 cm lub 70 cm', notes: 'Izolowane dane testowe. Tolerancja ±1 cm. Promień skrętu nieznany.', checkedAt: '2026-10-03T10:00:00Z',
    sources: [{ title: 'Dokumentacja testowa', url: 'https://manufacturer.example/cameleon' }],
    parameters: [{ label: 'Szerokość całkowita', value: '59 cm, 64 cm lub 70 cm', sourceUrl: 'https://manufacturer.example/cameleon', quote: 'Test width table' }],
  };
  function answer(text: string, initial = false) {
    current = { id: 'chat-fixture', kind, status: 'needs_reply', phase: 'review', conversational: true, messages: [...messages],
      message: '', suggestions: [], canApply: false, identifiedKind: 'manual', equipment: evidence };
    if (fail && !failed) {
      failed = true; current.status = 'failed'; current.message = 'Nie udało się uzyskać odpowiedzi. Spróbuj ponownie.'; return;
    }
    if (initial && kind === 'power') {
      current.message = 'Dane testowe: CAMELEON jest wózkiem manualnym. Czy to Twój sprzęt?';
      current.suggestions = ['Tak, to wózek manualny', 'Mam inny model', 'Nie wiem'];
    } else if (/18|20|bez rozmiaru/.test(text)) {
      const width = /bez rozmiaru/.test(text) ? null : text.includes('20') ? 70 : 64;
      current.status = 'complete'; current.canApply = true;
      current.message = width ? 'Sprawdź dane wybranego rozmiaru i zatwierdź parametry.' : 'Zostawimy szerokość niepodaną.';
      current.equipment = { ...evidence, variant: width ? `Rozmiar ${width === 70 ? '20' : '18'} cali` : 'Rozmiar nieznany', widthCm: width, widthLabel: width ? `${width} cm` : evidence.widthLabel,
        parameters: [{ ...evidence.parameters[0], value: width ? `${width} cm` : evidence.widthLabel }] };
    } else if (text === 'Nie wiem') {
      current.message = 'Sprawdź oznaczenie na ramie albo kontynuuj bez rozmiaru. Nie przyjmiemy zgadywanej szerokości.';
      current.suggestions = ['Kontynuuj bez rozmiaru', 'Sprawdzę etykietę'];
    } else {
      current.message = 'Który rozmiar masz? 16 cali ma 59 cm szerokości, 18 cali 64 cm, a 20 cali 70 cm.';
      current.suggestions = ['16 cali', '18 cali', '20 cali', 'Nie wiem'];
    }
    messages.push({ id: String(++serial), role: 'assistant', text: current.message });
    current.messages = [...messages];
  }
  await page.route('**/api/equipment/research', async route => {
    const body = route.request().postDataJSON();
    expect(body.conversational).toBe(true);
    sent.push(body.query);
    messages.push({ id: String(++serial), role: 'user', text: body.query });
    answer(body.query, true);
    await route.fulfill({ status: 202, json: { ...current, status: 'searching', canApply: false, messages: messages.slice(0, 1) } });
  });
  await page.route('**/api/equipment/research/chat-fixture?*', route => route.fulfill({ json: current }));
  await page.route('**/api/equipment/research/chat-fixture/messages', async route => {
    const body = route.request().postDataJSON();
    if (!body.retry) {
      sent.push(body.text);
      messages.push({ id: String(++serial), role: 'user', text: body.text });
    }
    answer(body.retry ? '18 cali' : body.text);
    await route.fulfill({ status: 202, json: { ...current, status: 'searching', canApply: false } });
  });
  return sent;
}
async function openChat(page: Page, kind = 'Wózek elektryczny') {
  await page.goto('/app');
  await page.getByRole('radio', { name: kind, exact: true }).check();
  await page.getByRole('button', { name: 'Dalej', exact: true }).click();
  await page.getByLabel('Producent i model', { exact: true }).fill('Cameleon');
  await page.getByLabel('Producent i model', { exact: true }).press('Enter');
}

test('chat combines model-generated choices and typed answers, then explicitly applies the corrected kind and size', async ({ page }) => {
  const sent = await fixture(page);
  await openChat(page);
  const width = page.getByLabel('Szerokość całkowita z wyposażeniem');
  await expect(page.getByRole('button', { name: 'Użyj tych parametrów' })).toHaveCount(0);
  const choice = page.getByRole('button', { name: 'Tak, to wózek manualny', exact: true });
  await choice.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '18 cali', exact: true })).toBeVisible();
  await page.getByLabel('Twoja odpowiedź', { exact: true }).fill('Na etykiecie jest 18 cali');
  await page.getByRole('button', { name: 'Wyślij odpowiedź', exact: true }).click();
  const apply = page.getByRole('button', { name: 'Użyj tych parametrów' });
  await expect(apply).toBeVisible();
  await expect(width).toHaveValue('');
  await expect(page.getByRole('link', { name: 'Dokumentacja testowa' })).toHaveAttribute('href', 'https://manufacturer.example/cameleon');
  await apply.click();
  await expect(width).toHaveValue('64');
  await expect(page.getByLabel('Nazwa zestawu', { exact: true })).toHaveValue('Wózek manualny');

  await page.getByLabel('Twoja odpowiedź', { exact: true }).fill('Poprawka, to jednak 20 cali');
  await page.getByLabel('Twoja odpowiedź', { exact: true }).press('Enter');
  await apply.click(); await expect(width).toHaveValue('70');
  await width.fill('75');
  await page.getByLabel('Twoja odpowiedź', { exact: true }).fill('Sprawdź jeszcze 18 cali');
  await page.getByLabel('Twoja odpowiedź', { exact: true }).press('Enter');
  await apply.click(); await expect(width).toHaveValue('75');
  expect(sent).toEqual(['Cameleon', 'Tak, to wózek manualny', 'Na etykiecie jest 18 cali', 'Poprawka, to jednak 20 cali', 'Sprawdź jeszcze 18 cali']);
  await page.getByRole('button', { name: 'Zastosuj i pokaż mapę' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('przejscie-guest-presets-v1')!));
  expect(saved.presets[0].kind).toBe('manual'); expect(saved.presets[0].profile.widthCm).toBe('75');
});

test('unknown size stays unknown and mobile chat works with keyboard and accessible labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, { kind: 'manual' });
  await openChat(page, 'Wózek manualny');
  await page.getByRole('button', { name: 'Nie wiem', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Rozmowa o sprzęcie' })).toContainText('Sprawdź oznaczenie');
  await page.getByRole('button', { name: 'Kontynuuj bez rozmiaru', exact: true }).click();
  await expect(page.getByText('Nie wpiszemy jednej szerokości.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Użyj tych parametrów' }).click();
  await expect(page.getByLabel('Szerokość całkowita z wyposażeniem')).toHaveValue('');
  const audit = await new AxeBuilder({ page }).include('.setup-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.locator('.setup-dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('.equipment-chat').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/equipment-chat-mobile.png' });
});

test('failed provider can retry the same turn; chat resumes when the editor is reopened', async ({ page }) => {
  const sent = await fixture(page, { kind: 'manual', fail: true });
  await openChat(page, 'Wózek manualny');
  await page.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Użyj tych parametrów' })).toBeVisible();
  expect(sent).toEqual(['Cameleon']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.research-ready').click();
  await expect(page.getByRole('log')).toContainText('Cameleon');
  await expect(page.getByRole('button', { name: 'Użyj tych parametrów' })).toBeVisible();
  await page.getByRole('button', { name: 'Nowa rozmowa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Użyj tych parametrów' })).toHaveCount(0);
  await expect(page.getByLabel('Producent i model', { exact: true })).toHaveValue('');
});
