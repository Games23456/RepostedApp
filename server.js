'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./lib/store');
const links = require('./lib/links');
const preview = require('./lib/preview');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const COLORS = ['#ff5a5f', '#ff9f1c', '#f7c548', '#2ec4b6', '#3a86ff', '#8338ec', '#ff006e', '#06d6a0', '#118ab2', '#ef476f', '#7b2cbf', '#fb5607'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon',
};
const THUMB_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const SPA_ROUTES = /^\/(share|join\/[A-Za-z0-9]+)?\/?$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const id = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function cleanText(v, max, field) {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (field && !s) throw new HttpError(400, `Please enter ${field}.`);
  if (s.length > max) throw new HttpError(400, `${field ? field[0].toUpperCase() + field.slice(1) : 'That'} is too long (max ${max} characters).`);
  return s;
}

function createApp({ dataDir = path.join(__dirname, 'data'), fetchImpl = fetch, persist = true } = {}) {
  const store = new Store(persist ? path.join(dataDir, 'db.json') : null);
  const db = store.data;
  const thumbDir = path.join(dataDir, 'thumbs');
  const publicDir = path.join(__dirname, 'public');
  const listeners = new Map(); // groupId -> Set<res>
  const inflight = new Set();
  const resolveCache = new Map();
  const buckets = new Map();

  // ---------- helpers ----------

  function newCode() {
    const taken = new Set(Object.values(db.groups).map((g) => g.code));
    for (;;) {
      let code = '';
      const bytes = crypto.randomBytes(6);
      for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (!taken.has(code)) return code;
    }
  }

  function addMember(group, name) {
    const lower = name.toLowerCase();
    const inGroup = Object.values(db.members).filter((m) => m.groupId === group.id);
    if (inGroup.some((m) => m.name.toLowerCase() === lower)) {
      throw new HttpError(409, `Someone in ${group.name} is already called "${name}". Try a different name — or if that's you on another phone, open "Use on another device" there.`);
    }
    if (inGroup.length >= 100) throw new HttpError(400, 'This group is full (100 people).');
    const used = new Set(inGroup.map((m) => m.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[inGroup.length % COLORS.length];
    const token = id(24);
    const member = { id: id(), groupId: group.id, name, color, tokenHash: hashToken(token), createdAt: Date.now() };
    db.members[member.id] = member;
    store.save();
    return { member, token };
  }

  function auth(req, url) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token');
    if (!token) throw new HttpError(401, 'Not signed in.');
    const h = hashToken(token);
    const member = Object.values(db.members).find((m) => m.tokenHash === h || (m.extraTokens || []).includes(h));
    if (!member) throw new HttpError(401, 'This device was signed out of the group.');
    const group = db.groups[member.groupId];
    if (!group) throw new HttpError(401, 'That group no longer exists.');
    return { member, group };
  }

  const publicMember = (m) => ({ id: m.id, name: m.name, color: m.color, joinedAt: m.createdAt });
  const publicGroup = (g) => ({ id: g.id, name: g.name, code: g.code, createdAt: g.createdAt });

  function rateLimit(req) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    const b = buckets.get(ip) || { tokens: 40, at: now };
    b.tokens = Math.min(40, b.tokens + ((now - b.at) / 60000) * 40);
    b.at = now;
    if (b.tokens < 1) throw new HttpError(429, 'Slow down a little and try again in a moment.');
    b.tokens -= 1;
    buckets.set(ip, b);
  }

  function broadcast(groupId) {
    const set = listeners.get(groupId);
    if (!set) return;
    for (const res of set) res.write(`data: {"type":"changed"}\n\n`);
  }

  async function identifyText(text) {
    const raw = links.extractUrl(text);
    if (!raw) throw new HttpError(400, "That doesn't look like a link. Copy the link from TikTok, Instagram, etc. and paste it here.");
    let url = raw;
    if (links.needsResolve(raw)) {
      if (resolveCache.has(raw)) url = resolveCache.get(raw);
      else {
        try {
          url = await preview.resolveRedirects(raw, fetchImpl);
          resolveCache.set(raw, url);
          if (resolveCache.size > 5000) resolveCache.delete(resolveCache.keys().next().value);
        } catch {
          url = raw; // Still works: identical short links group together.
        }
      }
    }
    return links.identify(url);
  }

  function ensureItem(info) {
    let item = db.items[info.key];
    if (!item) {
      item = { key: info.key, platform: info.platform, url: info.url, author: info.author || null, title: null, thumb: null, status: 'pending', fetchedAt: 0 };
      db.items[info.key] = item;
      store.save();
    }
    const stale = item.status === 'failed' && Date.now() - item.fetchedAt > 60 * 60 * 1000;
    if ((item.status === 'pending' || stale) && !inflight.has(item.key)) enrich(item);
    return item;
  }

  async function enrich(item) {
    if (item.platform === 'link') { item.status = 'done'; return; }
    inflight.add(item.key);
    try {
      const p = await preview.fetchPreview(item.platform, item.url, fetchImpl);
      if (p.title) item.title = p.title;
      if (p.author) item.author = p.author;
      if (p.thumbUrl) {
        const img = await preview.downloadThumb(p.thumbUrl, fetchImpl);
        if (img) {
          const name = crypto.createHash('sha1').update(item.key).digest('hex') + THUMB_EXT[img.type];
          if (persist) {
            fs.mkdirSync(thumbDir, { recursive: true });
            fs.writeFileSync(path.join(thumbDir, name), img.buf);
          }
          item.thumb = '/thumbs/' + name;
        } else if (!item.thumb) {
          item.thumb = p.thumbUrl;
        }
      }
      item.status = p.title || p.thumbUrl ? 'done' : 'failed';
    } catch {
      item.status = 'failed';
    } finally {
      item.fetchedAt = Date.now();
      inflight.delete(item.key);
      store.save();
      const groups = new Set(Object.values(db.reposts).filter((r) => r.key === item.key).map((r) => r.groupId));
      for (const g of groups) broadcast(g);
    }
  }

  function buildFeed(group) {
    const byKey = new Map();
    for (const r of Object.values(db.reposts)) {
      if (r.groupId !== group.id) continue;
      if (!byKey.has(r.key)) byKey.set(r.key, []);
      byKey.get(r.key).push(r);
    }
    const items = [];
    for (const [key, reps] of byKey) {
      const it = db.items[key] || { key, platform: 'link', url: reps[0].url };
      reps.sort((a, b) => b.createdAt - a.createdAt);
      items.push({
        key,
        platform: it.platform,
        url: it.url,
        title: it.title || null,
        author: it.author || null,
        thumb: it.thumb || null,
        loading: it.status === 'pending',
        lastAt: reps[0].createdAt,
        reposts: reps.map((r) => ({ id: r.id, memberId: r.memberId, note: r.note || '', createdAt: r.createdAt })),
      });
    }
    items.sort((a, b) => b.lastAt - a.lastAt);
    return items.slice(0, 300);
  }

  function groupPayload(member, group) {
    const members = Object.values(db.members).filter((m) => m.groupId === group.id).sort((a, b) => a.createdAt - b.createdAt).map(publicMember);
    return { me: publicMember(member), group: publicGroup(group), members };
  }

  // ---------- routes ----------

  async function api(req, res, url, body) {
    const { pathname } = url;
    const method = req.method;

    if (method === 'GET' && pathname === '/api/health') return { ok: true };

    if (method === 'POST' && pathname === '/api/groups') {
      rateLimit(req);
      const groupName = cleanText(body.groupName, 40, 'a group name');
      const name = cleanText(body.name, 24, 'your name');
      const group = { id: id(), name: groupName, code: newCode(), createdAt: Date.now() };
      db.groups[group.id] = group;
      const { member, token } = addMember(group, name);
      return { token, ...groupPayload(member, group) };
    }

    if (method === 'POST' && pathname === '/api/join') {
      rateLimit(req);
      const code = cleanText(body.code, 12, 'the group code').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const name = cleanText(body.name, 24, 'your name');
      const group = Object.values(db.groups).find((g) => g.code === code);
      if (!group) throw new HttpError(404, "Couldn't find a group with that code. Double-check it with whoever invited you.");
      const { member, token } = addMember(group, name);
      broadcast(group.id);
      return { token, ...groupPayload(member, group) };
    }

    if (method === 'GET' && pathname === '/api/events') {
      const { group } = auth(req, url);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 3000\n\n');
      if (!listeners.has(group.id)) listeners.set(group.id, new Set());
      listeners.get(group.id).add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); listeners.get(group.id)?.delete(res); });
      return undefined;
    }

    const { member, group } = auth(req, url);

    if (method === 'GET' && pathname === '/api/me') return groupPayload(member, group);

    if (method === 'PATCH' && pathname === '/api/me') {
      rateLimit(req);
      const name = cleanText(body.name, 24, 'your name');
      const clash = Object.values(db.members).some((m) => m.groupId === group.id && m.id !== member.id && m.name.toLowerCase() === name.toLowerCase());
      if (clash) throw new HttpError(409, `Someone is already called "${name}".`);
      member.name = name;
      store.save();
      broadcast(group.id);
      return groupPayload(member, group);
    }

    if (method === 'DELETE' && pathname === '/api/me') {
      for (const [rid, r] of Object.entries(db.reposts)) if (r.memberId === member.id) delete db.reposts[rid];
      delete db.members[member.id];
      if (!Object.values(db.members).some((m) => m.groupId === group.id)) delete db.groups[group.id];
      store.save();
      broadcast(group.id);
      return { ok: true };
    }

    if (method === 'POST' && pathname === '/api/device-link') {
      // Issue a fresh sign-in token for a second device, keeping this one signed in.
      rateLimit(req);
      const token = id(24);
      member.extraTokens = (member.extraTokens || []).slice(-4);
      member.extraTokens.push(hashToken(token));
      store.save();
      return { token };
    }

    if (method === 'GET' && pathname === '/api/feed') {
      return { ...groupPayload(member, group), items: buildFeed(group) };
    }

    if (method === 'GET' && pathname === '/api/lookup') {
      const info = await identifyText(url.searchParams.get('text') || '');
      const reposters = Object.values(db.reposts)
        .filter((r) => r.groupId === group.id && r.key === info.key)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((r) => r.memberId);
      return { key: info.key, platform: info.platform, reposters };
    }

    if (method === 'POST' && pathname === '/api/reposts') {
      rateLimit(req);
      const note = cleanText(body.note, 200);
      const info = await identifyText(typeof body.text === 'string' ? body.text.slice(0, 2000) : '');
      const item = ensureItem(info);
      let repost = Object.values(db.reposts).find((r) => r.groupId === group.id && r.memberId === member.id && r.key === info.key);
      const already = !!repost;
      if (repost) {
        if (note) repost.note = note;
      } else {
        repost = { id: id(), groupId: group.id, memberId: member.id, key: info.key, url: item.url, note, createdAt: Date.now() };
        db.reposts[repost.id] = repost;
      }
      store.save();
      broadcast(group.id);
      return { already, key: info.key, repostId: repost.id };
    }

    const del = pathname.match(/^\/api\/reposts\/([\w-]+)$/);
    if (method === 'DELETE' && del) {
      const r = db.reposts[del[1]];
      if (!r || r.groupId !== group.id) throw new HttpError(404, 'That repost is already gone.');
      if (r.memberId !== member.id) throw new HttpError(403, 'You can only remove your own reposts.');
      delete db.reposts[r.id];
      store.save();
      broadcast(group.id);
      return { ok: true };
    }

    throw new HttpError(404, 'Not found.');
  }

  function serveFile(res, file, cache) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': st.size,
        'cache-control': cache,
        'x-content-type-options': 'nosniff',
      });
      fs.createReadStream(file).pipe(res);
    });
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 16 * 1024) { reject(new HttpError(413, 'Request too large.')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Bad request.')); }
      });
      req.on('error', reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    try {
      if (pathname.startsWith('/api/')) {
        const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : {};
        const out = await api(req, res, url, body);
        if (out === undefined) return;
        const json = JSON.stringify(out);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(json);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
      if (pathname.startsWith('/thumbs/')) {
        const name = path.basename(pathname);
        if (!/^[a-f0-9]{40}\.(jpg|png|webp|gif|avif)$/.test(name)) throw new HttpError(404, 'Not found.');
        return serveFile(res, path.join(thumbDir, name), 'public, max-age=31536000, immutable');
      }
      if (SPA_ROUTES.test(pathname)) return serveFile(res, path.join(publicDir, 'index.html'), 'no-cache');
      const file = path.normalize(path.join(publicDir, pathname));
      if (!file.startsWith(publicDir + path.sep)) throw new HttpError(404, 'Not found.');
      return serveFile(res, file, pathname === '/sw.js' ? 'no-cache' : 'public, max-age=300');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) return res.end();
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong on our end. Try again.' : err.message }));
    }
  });

  server.on('close', () => store.flush());
  return { server, store };
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { server, store } = createApp({ dataDir: process.env.DATA_DIR || path.join(__dirname, 'data') });
  server.listen(port, () => console.log(`Reposted is running on http://localhost:${port}`));
  const shutdown = () => { store.flush(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
