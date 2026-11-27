// Minimaler Supabase-Nachbau (GoTrue/PostgREST/Storage-Teilmenge) NUR für UI-Tests.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import pg from 'pg';

const pool = new pg.Pool({ host: '/tmp/pgt', port: 5499, user: 'postgres', database: process.env.DB || 'demo' });
const STATIC = process.env.STATIC_DIR;
const users = new Map(); // email -> {id,password}
const tokens = new Map(); // token -> userId
const files = new Map(); // path -> {type, buf}
export function addFile(path, type, buf) { files.set(path, { type, buf }); }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: u.id, role: 'authenticated', aud: 'authenticated', exp: now + 36000, email: u.email, session_id: u.id })}.sig`;
  tokens.set(access, u.id);
  return {
    access_token: access, token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'r-' + u.id,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() },
  };
}

const ident = (s) => '"' + String(s).replace(/"/g, '""') + '"';

async function withUser(uid, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (uid) {
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      await c.query('set local role authenticated');
    } else await c.query('set local role anon');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function parseFilter(col, expr, params) {
  const m = expr.match(/^(not\.)?(eq|neq|lt|lte|gt|gte|ilike|like|is|in)\.(.*)$/s);
  if (!m) throw new Error('bad filter ' + expr);
  const [, not, op, raw] = m;
  let sql;
  if (op === 'is') sql = `${ident(col)} is ${raw === 'null' ? 'null' : raw === 'true' ? 'true' : 'false'}`;
  else if (op === 'in') {
    const vals = raw.replace(/^\(|\)$/g, '').split(',');
    sql = `${ident(col)}::text = any($${params.push(vals)})`;
  } else {
    const o = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=', ilike: 'ilike', like: 'like' }[op];
    const v = op.endsWith('like') ? raw.replace(/\*/g, '%') : raw;
    sql = `${ident(col)}::text ${o} $${params.push(v)}`;
    if (['lt', 'lte', 'gt', 'gte'].includes(op)) sql = `${ident(col)} ${o} $${params.length}`;
  }
  return not ? `not (${sql})` : sql;
}

function splitTop(s) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

async function rest(uid, method, table, q, body, headers) {
  const params = [];
  const where = [];
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    if (k === 'or') {
      const parts = splitTop(v.replace(/^\(|\)$/g, '')).map((p) => {
        const i = p.indexOf('.');
        return parseFilter(p.slice(0, i), p.slice(i + 1), params);
      });
      where.push('(' + parts.join(' or ') + ')');
    } else where.push(parseFilter(k, v, params));
  }
  const w = where.length ? ' where ' + where.join(' and ') : '';
  const sel = q.get('select') || '*';
  let cols = 't.*';
  const embed = sel.match(/(\w+)\(\*\)/);
  if (embed) cols += `, (select to_jsonb(e) from public.${ident(embed[1])} e where e.id = t.model_id) as ${ident(embed[1])}`;
  const single = (headers.accept || '').includes('vnd.pgrst.object');
  let sql;
  if (method === 'GET') {
    const order = q.get('order') ? ' order by ' + q.get('order').split(',').map((o) => {
      const [c, dir, nulls] = o.split('.');
      return `${ident(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls ? (nulls === 'nullslast' ? ' nulls last' : ' nulls first') : ''}`;
    }).join(', ') : '';
    sql = `select to_jsonb(x) as j from (select ${cols} from public.${ident(table)} t${w}${order}${q.get('limit') ? ' limit ' + Number(q.get('limit')) : ''}${q.get('offset') ? ' offset ' + Number(q.get('offset')) : ''}) x`;
  } else if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const keys = Object.keys(rows[0]);
    const vals = rows.map((r) => '(' + keys.map((k) => `$${params.push(Array.isArray(r[k]) ? r[k] : r[k])}`).join(',') + ')').join(',');
    let conflict = '';
    if (q.get('on_conflict') && (headers.prefer || '').includes('merge-duplicates')) {
      const oc = q.get('on_conflict').split(',');
      conflict = ` on conflict (${oc.map(ident).join(',')}) do update set ${keys.filter((k) => !oc.includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`;
    }
    sql = `with t as (insert into public.${ident(table)} (${keys.map(ident).join(',')}) values ${vals}${conflict} returning *) select to_jsonb(x) as j from (select ${cols} from t) x`;
  } else if (method === 'PATCH') {
    const keys = Object.keys(body);
    const set = keys.map((k) => `${ident(k)} = $${params.push(body[k])}`).join(', ');
    sql = `with t as (update public.${ident(table)} t set ${set}${w} returning *) select to_jsonb(x) as j from (select ${cols} from t) x`;
  } else if (method === 'DELETE') {
    sql = `with t as (delete from public.${ident(table)} t${w} returning *) select to_jsonb(x) as j from (select ${cols} from t) x`;
  }
  const res = await withUser(uid, (c) => c.query(sql, params));
  res.rows = res.rows.map((r) => r.j);
  if (single) {
    if (res.rows.length !== 1) return { status: 406, body: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    return { status: 200, body: res.rows[0] };
  }
  return { status: method === 'POST' ? 201 : 200, body: res.rows };
}

async function rpc(uid, fn, args) {
  const info = await pool.query(
    `select p.proretset, t.typname, p.prokind from pg_proc p join pg_type t on t.oid = p.prorettype join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname=$1 limit 1`, [fn]);
  if (!info.rows.length) return { status: 404, body: { message: 'function not found' } };
  const { proretset, typname } = info.rows[0];
  const keys = Object.keys(args || {});
  const params = keys.map((k) => args[k]);
  const call = `public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`;
  if (proretset || typname === 'record') {
    const r = await withUser(uid, (c) => c.query(`select to_jsonb(q) as j from ${call} q`, params));
    return { status: 200, body: r.rows.map((x) => x.j) };
  }
  const r = await withUser(uid, (c) => c.query(`select ${call} as r`, params));
  return { status: 200, body: typname === 'void' ? null : r.rows[0].r };
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' });
  res.end(type === 'application/json' ? (body === undefined || body === null ? 'null' : JSON.stringify(body)) : body);
}

const readBody = (req) => new Promise((r) => { const ch = []; req.on('data', (c) => ch.push(c)); req.on('end', () => r(Buffer.concat(ch))); });

export function startApi(port = 54321) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
      const url = new URL(req.url, 'http://x');
      const raw = await readBody(req);
      const auth = (req.headers.authorization || '').replace('Bearer ', '');
      const uid = tokens.get(auth) || null;
      const p = url.pathname;
      if (p === '/auth/v1/token' || p === '/auth/v1/signup') {
        const b = JSON.parse(raw.toString() || '{}');
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          const id = b.refresh_token.slice(2);
          const u = [...users.values()].find((x) => x.id === id);
          return send(res, 200, session(u));
        }
        const u = users.get(b.email);
        if (!u || u.password !== b.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
        return send(res, 200, session(u));
      }
      if (p === '/auth/v1/user') {
        const u = [...users.values()].find((x) => x.id === uid);
        return u ? send(res, 200, session(u).user) : send(res, 401, { msg: 'no' });
      }
      if (p === '/auth/v1/logout') return send(res, 204, '', 'text/plain');
      if (p.startsWith('/rest/v1/rpc/')) {
        const r = await rpc(uid, p.slice('/rest/v1/rpc/'.length), JSON.parse(raw.toString() || '{}'));
        return send(res, r.status, r.body);
      }
      if (p.startsWith('/rest/v1/')) {
        const r = await rest(uid, req.method, p.slice('/rest/v1/'.length), url.searchParams, raw.length ? JSON.parse(raw.toString()) : null, req.headers);
        return send(res, r.status, r.body);
      }
      if (p.startsWith('/storage/v1/object/public/photos/')) {
        const f = files.get(decodeURIComponent(p.slice('/storage/v1/object/public/photos/'.length)));
        return f ? send(res, 200, f.buf, f.type) : send(res, 404, { message: 'not found' });
      }
      if (p.startsWith('/storage/v1/object/photos/')) {
        const path = decodeURIComponent(p.slice('/storage/v1/object/photos/'.length));
        files.set(path, { type: req.headers['content-type'] || 'image/jpeg', buf: raw });
        return send(res, 200, { Key: 'photos/' + path });
      }
      return send(res, 404, { message: 'not mocked: ' + p });
    } catch (e) {
      console.error('ERR', req.method, req.url, e.message);
      return send(res, 400, { message: e.message, code: e.code ?? 'P0001', details: null, hint: null });
    }
  }).listen(port);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
export function startStatic(port = 8081) {
  return http.createServer((req, res) => {
    let p = join(STATIC, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!existsSync(p) || statSync(p).isDirectory()) p = existsSync(p + '.html') ? p + '.html' : join(STATIC, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  }).listen(port);
}

export function addUser(email, password, id) { users.set(email, { email, password, id }); }
