#!/usr/bin/env node
/**
 * Importiert Schnellladestationen (>= 50 kW) nach Supabase.
 *
 * Quellen:
 *  1. Ladesäulenregister der Bundesnetzagentur (CSV, kostenlos, CC BY 4.0)
 *     https://www.bundesnetzagentur.de/ladesaeulenkarte → "Ladesäulenregister (CSV)"
 *  2. Open Charge Map API (kostenloser API-Key nötig: https://openchargemap.org/site/develop)
 *
 * Aufruf:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/import-stations.mjs --bnetza ./Ladesaeulenregister.csv [--ocm-key KEY] [--dry-run]
 *
 * Standorte mit mehreren Ladeeinrichtungen werden zu EINER Station zusammengefasst
 * (gleicher Betreiber, Koordinaten auf ~10 m gerundet). OCM-Einträge, die näher als
 * 75 m an einer BNetzA-Station liegen, werden als Dublette verworfen.
 *
 * Lizenzhinweis: BNetzA-Daten sind CC BY 4.0 → Quellenangabe im Impressum/About der App.
 * OCM-Daten sind CC BY-SA 4.0 bzw. je nach Datenquelle eingeschränkt → vor kommerzieller
 * Nutzung die Lizenzbedingungen prüfen.
 */
import { readFileSync } from 'node:fs';

const MIN_KW = 50;
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = args.includes('--dry-run');

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
const num = (v) => {
  if (v == null) return NaN;
  const s = String(v).trim().replace(/\./g, (m, i, str) => (str.includes(',') ? '' : m)).replace(',', '.');
  return Number.parseFloat(s);
};
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');

const HIGHWAY_RE = /(autobahn|rastanlage|raststätte|raststaette|rasthof|autohof|\bbab\b|\ba\s?\d{1,3}\b|tank\s?&\s?rast)/i;

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Einfacher CSV-Parser (Semikolon, Anführungszeichen, Zeilenumbrüche in Feldern). */
export function parseCsv(text, sep = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Liest die BNetzA-CSV robust gegenüber wechselnden Spaltennamen/Vorspann-Zeilen. */
export function parseBnetza(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = parseCsv(text);
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'breitengrad'));
  if (headerIdx < 0) throw new Error('Kopfzeile mit "Breitengrad" nicht gefunden – falsche Datei?');
  const header = rows[headerIdx].map(norm);
  const col = (...names) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n || h.startsWith(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = {
    id: col('ladeeinrichtungsid', 'id'),
    operator: col('betreiber', 'anzeigenamekarte'),
    display: col('anzeigenamekarte'),
    street: col('strasse'),
    houseNo: col('hausnummer'),
    zip: col('postleitzahl'),
    city: col('ort'),
    lat: col('breitengrad'),
    lng: col('laengengrad', 'langengrad'),
    power: col('nennleistungladeeinrichtung', 'anschlussleistung'),
    points: col('anzahlladepunkte'),
    status: col('status'),
    place: col('standortbezeichnung', 'informationenzumparkraum', 'parkraum'),
  };
  if (c.lat < 0 || c.lng < 0 || c.power < 0) throw new Error('Pflichtspalten (Koordinaten/Leistung) fehlen.');

  const sites = new Map();
  for (const r of rows.slice(headerIdx + 1)) {
    if (r.length < header.length / 2) continue;
    const lat = num(r[c.lat]);
    const lng = num(r[c.lng]);
    const kw = num(r[c.power]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(kw)) continue;
    if (lat < 47 || lat > 55.2 || lng < 5.8 || lng > 15.1) continue; // grob Deutschland
    if (c.status >= 0 && /ausser|außer|stillgelegt/i.test(r[c.status] ?? '')) continue;
    const operator = (r[c.operator] ?? '').trim();
    const key = `${norm(operator)}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    const street = [r[c.street], r[c.houseNo]].filter(Boolean).join(' ').trim();
    const site = sites.get(key) ?? {
      source: 'bnetza',
      source_id: key,
      name: '',
      operator: operator || null,
      street: street || null,
      postcode: (r[c.zip] ?? '').trim() || null,
      city: (r[c.city] ?? '').trim() || null,
      lat, lng,
      max_power_kw: 0,
      num_points: 0,
      is_highway: false,
    };
    site.max_power_kw = Math.max(site.max_power_kw, kw);
    site.num_points += Number.parseInt(r[c.points], 10) || 1;
    const text = [r[c.display], r[c.place], street, operator].join(' ');
    if (HIGHWAY_RE.test(text)) site.is_highway = true;
    if (!site.name) site.name = ((c.display >= 0 && r[c.display]) || operator || 'Ladestation').trim();
    sites.set(key, site);
  }
  return [...sites.values()]
    .filter((s) => s.max_power_kw >= MIN_KW)
    .map((s) => ({ ...s, name: s.city ? `${s.name} – ${s.city}` : s.name }));
}

async function fetchOcm(key) {
  const out = [];
  // OCM liefert max. ~10.000 pro Abfrage → Deutschland in Kacheln abfragen
  for (let lat = 47; lat < 55.2; lat += 1) {
    for (let lng = 5.8; lng < 15.1; lng += 1.5) {
      const bbox = `(${lat},${lng}),(${lat + 1},${lng + 1.5})`;
      const url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=DE&minpowerkw=${MIN_KW}&maxresults=5000&compact=true&verbose=false&boundingbox=${encodeURIComponent(bbox)}`;
      const res = await fetch(url, { headers: { 'X-API-Key': key, 'User-Agent': 'chargeduett-station-import' } });
      if (!res.ok) throw new Error(`OCM HTTP ${res.status}`);
      for (const p of await res.json()) {
        const a = p.AddressInfo ?? {};
        const kw = Math.max(0, ...(p.Connections ?? []).map((x) => x.PowerKW ?? 0));
        if (kw < MIN_KW || !Number.isFinite(a.Latitude)) continue;
        const text = `${a.Title ?? ''} ${a.AddressLine1 ?? ''} ${a.AccessComments ?? ''}`;
        out.push({
          source: 'ocm',
          source_id: String(p.ID),
          name: a.Town ? `${a.Title ?? 'Ladestation'} – ${a.Town}` : (a.Title ?? 'Ladestation'),
          operator: p.OperatorInfo?.Title ?? null,
          street: a.AddressLine1 ?? null,
          postcode: a.Postcode ?? null,
          city: a.Town ?? null,
          lat: a.Latitude,
          lng: a.Longitude,
          max_power_kw: kw,
          num_points: p.NumberOfPoints ?? (p.Connections ?? []).length ?? null,
          is_highway: HIGHWAY_RE.test(text),
        });
      }
      await new Promise((r) => setTimeout(r, 300)); // API schonen
    }
  }
  return out;
}

/** Entfernt OCM-Einträge, die in < 75 m Abstand zu einer BNetzA-Station liegen. */
export function dedupe(primary, secondary, meters = 75) {
  const grid = new Map();
  const cell = (lat, lng) => `${Math.floor(lat * 500)}|${Math.floor(lng * 300)}`; // ~220 m Zellen
  for (const s of primary) {
    const k = cell(s.lat, s.lng);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(s);
  }
  return secondary.filter((s) => {
    const cy = Math.floor(s.lat * 500);
    const cx = Math.floor(s.lng * 300);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const p of grid.get(`${cy + dy}|${cx + dx}`) ?? [])
          if (haversine(p, s) < meters) return false;
    return true;
  });
}

async function upsert(stations) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.');
  const rows = stations.map(({ lat, lng, ...s }) => ({
    ...s,
    location: `SRID=4326;POINT(${lng} ${lat})`,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const res = await fetch(`${url}/rest/v1/charging_stations?on_conflict=source,source_id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!res.ok) throw new Error(`Upsert fehlgeschlagen (${res.status}): ${await res.text()}`);
    process.stdout.write(`\r${Math.min(i + 500, rows.length)}/${rows.length} hochgeladen`);
  }
  process.stdout.write('\n');
}

async function main() {
  const bnetzaPath = arg('--bnetza');
  const ocmKey = arg('--ocm-key') ?? process.env.OCM_API_KEY;
  if (!bnetzaPath && !ocmKey) {
    console.error('Mindestens --bnetza <csv> oder --ocm-key <key> angeben.');
    process.exit(1);
  }
  let stations = [];
  if (bnetzaPath) {
    const buf = readFileSync(bnetzaPath);
    // Ältere Exporte sind Windows-1252 kodiert
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    stations = parseBnetza(text);
    console.log(`BNetzA: ${stations.length} Schnelllade-Standorte (>= ${MIN_KW} kW)`);
  }
  if (ocmKey) {
    const ocm = await fetchOcm(ocmKey);
    const extra = dedupe(stations, ocm);
    console.log(`OCM: ${ocm.length} Standorte, davon ${extra.length} neu (nicht im BNetzA-Register)`);
    stations = stations.concat(extra);
  }
  console.log(`Autobahn-nah erkannt: ${stations.filter((s) => s.is_highway).length}`);
  if (DRY) {
    console.log(JSON.stringify(stations.slice(0, 3), null, 2));
    return;
  }
  await upsert(stations);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
