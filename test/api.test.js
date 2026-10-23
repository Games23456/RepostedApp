'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../server');

const VIDEO = 'https://www.tiktok.com/@dancer/video/7311111111111111111';
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

// Stand-in for TikTok / Instagram so tests run offline.
const fetched = [];
async function fakeFetch(url, opts = {}) {
  fetched.push(url);
  if (url.startsWith('https://vm.tiktok.com/')) {
    return new Response(null, { status: 301, headers: { location: VIDEO + '?_r=1&_t=abc' } });
  }
  if (url.startsWith('https://www.tiktok.com/oembed')) {
    assert.ok(url.includes(encodeURIComponent(VIDEO)), 'oEmbed called with canonical URL');
    return Response.json({ title: 'best dance ever', author_unique_id: 'dancer', thumbnail_url: 'https://p16-sign.tiktokcdn-us.com/thumb.png' });
  }
  if (url.startsWith('https://p16-sign.tiktokcdn-us.com/')) {
    return new Response(PNG, { headers: { 'content-type': 'image/png' } });
  }
  if (url.startsWith('https://www.instagram.com/')) {
    assert.match(opts.headers['user-agent'], /facebookexternalhit/);
    return new Response('<html><head><meta property="og:title" content="Ava on Instagram: &quot;sunset vibes&quot;"><meta property="og:image" content="https://scontent.cdninstagram.com/x.png"></head></html>', { headers: { 'content-type': 'text/html' } });
  }
  if (url.startsWith('https://scontent.cdninstagram.com/')) {
    return new Response(PNG, { headers: { 'content-type': 'image/png' } });
  }
  throw new Error('unexpected fetch ' + url);
}

async function startApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reposted-'));
  const { server } = createApp({ dataDir, fetchImpl: fakeFetch });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, token) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { server, base, call, dataDir };
}

const until = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

test('full flow: create, join, repost, dedupe, lookup, previews, permissions', async (t) => {
  const { server, base, call, dataDir } = await startApp();
  t.after(() => { server.close(); server.closeAllConnections(); });

  // Create + join
  const created = await call('POST', '/api/groups', { groupName: 'The Squad', name: 'Jonah' });
  assert.equal(created.status, 200);
  const jonah = created.body.token;
  const code = created.body.group.code;
  assert.match(code, /^[A-Z2-9]{6}$/);

  const badCode = await call('POST', '/api/join', { code: 'ZZZZZZ', name: 'Ava' });
  assert.equal(badCode.status, 404);

  const joined = await call('POST', '/api/join', { code: code.toLowerCase(), name: 'Ava' });
  assert.equal(joined.status, 200);
  const ava = joined.body.token;
  assert.equal(joined.body.members.length, 2);

  const dupe = await call('POST', '/api/join', { code, name: 'ava' });
  assert.equal(dupe.status, 409, 'names are unique per group');

  // Realtime: listen for changes as Ava
  const ctrl = new AbortController();
  const events = await fetch(`${base}/api/events?token=${ava}`, { signal: ctrl.signal });
  const reader = events.body.getReader();
  let streamText = '';
  const pump = (async () => {
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; streamText += Buffer.from(value).toString(); } } catch { /* aborted */ }
  })();

  // Jonah shares a TikTok short link straight from the share sheet
  const posted = await call('POST', '/api/reposts', { text: 'lol watch this https://vm.tiktok.com/ZMabc123/', note: 'omg' }, jonah);
  assert.equal(posted.status, 200);
  assert.equal(posted.body.key, 'tiktok:7311111111111111111');
  assert.equal(posted.body.already, false);
  await until(() => streamText.includes('"changed"'));

  // Ava posts the long form of the same video: groups with Jonah's
  const lookup = await call('GET', `/api/lookup?text=${encodeURIComponent(VIDEO + '?is_from_webapp=1')}`, null, ava);
  assert.deepEqual(lookup.body.reposters, [created.body.me.id]);
  await call('POST', '/api/reposts', { text: VIDEO }, ava);
  const again = await call('POST', '/api/reposts', { text: VIDEO, note: 'so good' }, ava);
  assert.equal(again.body.already, true);

  // Preview gets fetched and the thumbnail cached locally
  const feed = await until(async () => {
    const f = await call('GET', '/api/feed', null, jonah);
    return f.body.items[0]?.title ? f.body : null;
  });
  assert.equal(feed.items.length, 1);
  const item = feed.items[0];
  assert.equal(item.title, 'best dance ever');
  assert.equal(item.author, '@dancer');
  assert.equal(item.reposts.length, 2);
  assert.equal(item.reposts[0].note, 'so good');
  assert.match(item.thumb, /^\/thumbs\/[a-f0-9]{40}\.png$/);
  const thumb = await fetch(base + item.thumb);
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers.get('content-type'), 'image/png');

  // Instagram preview via Open Graph
  await call('POST', '/api/reposts', { text: 'https://www.instagram.com/reel/C9xyz/?igsh=abc' }, ava);
  const ig = await until(async () => {
    const f = await call('GET', '/api/feed', null, ava);
    const it = f.body.items.find((i) => i.platform === 'instagram');
    return it && !it.loading ? it : null;
  });
  assert.equal(ig.title, 'sunset vibes');
  assert.equal(ig.author, 'Ava');

  // Plain links are never fetched by the server
  const before = fetched.length;
  await call('POST', '/api/reposts', { text: 'http://169.254.169.254/latest/meta-data' }, ava);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fetched.length, before);

  // Permissions
  const avasRepost = item.reposts.find((r) => r.memberId === joined.body.me.id);
  assert.equal((await call('DELETE', `/api/reposts/${avasRepost.id}`, null, jonah)).status, 403);
  assert.equal((await call('DELETE', `/api/reposts/${avasRepost.id}`, null, ava)).status, 200);
  assert.equal((await call('GET', '/api/feed', null, 'nope')).status, 401);
  assert.equal((await call('POST', '/api/reposts', { text: 'hello' }, ava)).status, 400);

  // Another group can't see this group's reposts
  const other = await call('POST', '/api/groups', { groupName: 'Work', name: 'Sam' });
  assert.equal((await call('GET', '/api/feed', null, other.body.token)).body.items.length, 0);

  // Second-device sign in
  const dev = await call('POST', '/api/device-link', null, jonah);
  const me2 = await call('GET', '/api/me', null, dev.body.token);
  assert.equal(me2.body.me.name, 'Jonah');

  // Persisted to disk and reloaded
  ctrl.abort();
  await pump;
  await new Promise((r) => { server.close(r); server.closeAllConnections(); });
  const reloaded = createApp({ dataDir, fetchImpl: fakeFetch });
  t.after(() => { reloaded.server.close(); reloaded.server.closeAllConnections(); });
  await new Promise((r) => reloaded.server.listen(0, r));
  const res = await fetch(`http://127.0.0.1:${reloaded.server.address().port}/api/feed`, { headers: { authorization: `Bearer ${jonah}` } });
  const data = await res.json();
  assert.equal(data.items.length, 3);
});

test('serves the app and blocks path traversal', async (t) => {
  const { server, base } = await startApp();
  t.after(() => { server.close(); server.closeAllConnections(); });
  for (const p of ['/', '/share?url=x', '/join/ABC123']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<title>Reposted<\/title>/);
  }
  assert.equal((await fetch(base + '/manifest.webmanifest')).headers.get('content-type'), 'application/manifest+json');
  assert.equal((await fetch(base + '/..%2fserver.js')).status, 404);
  assert.equal((await fetch(base + '/thumbs/../../server.js')).status, 404);
});
