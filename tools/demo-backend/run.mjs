import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { addFile, addUser, startApi, startStatic } from './server.mjs';

const OUT = process.env.OUT;
mkdirSync(OUT, { recursive: true });
const api = startApi(54321);
const web = startStatic(8081);

addUser('max@demo.chargeduett', 'demo12345', '00000000-0000-0000-0000-000000000001');
addUser('neu@demo.chargeduett', 'demo12345', '00000000-0000-0000-0000-000000000007');

const browser = await chromium.launch();

// Illustrierte Platzhalter-Avatare (keine echten Personen)
const people = { max: ['M', '#1f6feb', '#00b37e'], lena: ['L', '#ff7a59', '#ffc400'], jonas: ['J', '#6f42c1', '#1f6feb'], sophie: ['S', '#e5484d', '#ff9ec7'], kemal: ['K', '#0b1f2a', '#00b37e'], anja: ['A', '#2da44e', '#bfe8c8'] };
{
  const p = await browser.newPage({ viewport: { width: 600, height: 800 } });
  for (const [name, [ch, a, b]] of Object.entries(people)) {
    await p.setContent(`<body style="margin:0"><div id="c" style="width:600px;height:800px;background:linear-gradient(160deg,${a},${b});display:flex;align-items:center;justify-content:center;font:900 300px system-ui;color:rgba(255,255,255,.9)">
      <svg width="420" height="560" viewBox="0 0 42 56"><circle cx="21" cy="18" r="10" fill="rgba(255,255,255,.85)"/><path d="M3 56c0-12 8-20 18-20s18 8 18 20z" fill="rgba(255,255,255,.85)"/><text x="21" y="22" font-size="10" text-anchor="middle" fill="${a}" font-family="system-ui" font-weight="900">${ch}</text></svg></div></body>`);
    addFile(`seed/${name}.png`, 'image/png', await p.locator('#c').screenshot());
  }
  await p.close();
}

const ctxOpts = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'de-DE',
  geolocation: { latitude: 50.0501, longitude: 8.6002 },
  permissions: ['geolocation'],
  isMobile: true,
  hasTouch: true,
};
const shot = async (page, name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
};
const errors = [];

// --- Neuer Nutzer: Login + Onboarding
{
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await page.goto('http://localhost:8081/');
  await page.getByPlaceholder('E-Mail').waitFor();
  await shot(page, '01-login');
  await page.getByPlaceholder('E-Mail').fill('neu@demo.chargeduett');
  await page.getByPlaceholder(/Passwort/).fill('demo12345');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByText('Willkommen bei Charge Duett').waitFor();
  await page.getByPlaceholder('Vorname').fill('Clara');
  await page.getByPlaceholder('24.12.1990').fill('12.04.1993');
  await page.getByText('Frau', { exact: true }).click();
  await shot(page, '02-onboarding-1');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByText('Wofür nutzt du Charge Duett?').waitFor();
  await page.getByText('+', { exact: true }).click();
  await page.getByText('Mann', { exact: true }).click();
  await shot(page, '03-onboarding-2');
  // Validierung testen: unter 18
  await page.getByRole('button', { name: 'Zurück' }).click();
  await page.getByPlaceholder('24.12.1990').fill('01.01.2015');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByText('Charge Duett ist erst ab 18 Jahren.').waitFor();
  console.log('ok: underage validation');
  await ctx.close();
}

// --- Bestehender Nutzer Max
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/realtime|websocket|WebSocket/i.test(m.text())) errors.push('console ' + m.text()); });
await page.goto('http://localhost:8081/');
await page.getByPlaceholder('E-Mail').fill('max@demo.chargeduett');
await page.getByPlaceholder(/Passwort/).fill('demo12345');
await page.getByRole('button', { name: 'Anmelden' }).click();
await page.getByText('Schnelllader in deiner Nähe').waitFor();
await page.getByText('Rastanlage Lindenhain Ost (Demo)').waitFor();
await shot(page, '04-laden-vor-checkin');

await page.getByRole('button', { name: /einchecken/ }).click();
await page.getByText('Du lädst gerade an').waitFor();
await shot(page, '05-eingecheckt');

await page.getByRole('button', { name: 'Leute entdecken' }).click();
await page.getByText(/Lena, \d+/).waitFor();
await shot(page, '06-entdecken');

// Like auf Lena → Match
for (let i = 0; i < 4; i++) {
  await page.getByRole('button', { name: 'Verbinden' }).click();
  try { await page.getByText('Es hat gefunkt! ⚡').waitFor({ timeout: 2500 }); break; } catch { console.log('kein Match, weiter'); }
}
await page.getByText('Es hat gefunkt! ⚡').waitFor();
await shot(page, '07-match');
await page.getByRole('button', { name: 'Nachricht schreiben' }).click();
await page.getByPlaceholder('Nachricht …').waitFor();
await page.getByPlaceholder('Nachricht …').fill('Hi Lena! Auch an der Lindenhain-Säule? Kaffee im Rasthaus? ☕');
await page.getByLabel('Senden').click();
await page.getByText(/Kaffee im Rasthaus/).waitFor();
await shot(page, '08-chat');
await page.goBack();

// Networking-Modus: andere Kandidaten
await page.getByText('Networking', { exact: true }).first().click();
await page.getByText(/Jonas, \d+|Kemal, \d+/).first().waitFor();
await shot(page, '09-entdecken-networking');

await page.getByRole('tab', { name: /Kontakte/ }).click().catch(() => page.getByText('Kontakte').last().click());
await page.getByText(/Lena, \d+/).waitFor();
await shot(page, '10-kontakte');

await page.getByRole('tab', { name: /Fahrzeuge/ }).click().catch(() => page.getByText('Fahrzeuge').last().click());
await page.getByText('E-Auto-Ranking').waitFor();
await page.getByText('Silberpfeil').waitFor();
await shot(page, '11-fahrzeuge');
await page.getByText('E-Auto-Ranking').scrollIntoViewIfNeeded();
await shot(page, '12-ranking');
await page.getByText('Hyundai Ioniq 5 84 kWh').click();
await page.getByText('Technische Daten (Richtwerte)').waitFor();
await shot(page, '13-modell-detail');
await page.goBack();

// Eigenes Modell bewerten
await page.getByRole('button', { name: 'Bewerten' }).first().click();
await page.getByText('Deine Bewertung').waitFor();
const stars = page.locator('[aria-label="5"]:not([aria-disabled="true"])');
await stars.first().waitFor();
const n = await stars.count();
for (let i = 0; i < n; i++) await stars.nth(i).click();
await page.waitForTimeout(500);
await page.getByPlaceholder('Dein Erfahrungsbericht (optional)').fill('Riesiger Kofferraum, lädt zuverlässig. Software manchmal träge.');
await page.getByRole('button', { name: 'Bewerten' }).click();
await page.getByText('Riesiger Kofferraum', { exact: false }).last().waitFor();
await page.getByText('Deine Bewertung').scrollIntoViewIfNeeded();
await shot(page, '14-eigene-bewertung');
await page.goBack();

await page.getByRole('tab', { name: /Profil/ }).click().catch(() => page.getByText('Profil').last().click());
await page.getByText('Datenschutz & Konto').waitFor();
await shot(page, '15-profil');
await page.getByText('Datenschutz & Konto').click();
await page.getByText('Einwilligungen', { exact: true }).waitFor();
await shot(page, '16-datenschutz');

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
api.close();
web.close();
process.exit(0);
