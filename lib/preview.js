'use strict';

const { isPlatformHost, hostMatches, needsResolve } = require('./links');

const UA_BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// Instagram, Threads and friends serve proper Open Graph tags to link-preview bots.
const UA_PREVIEW = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

const THUMB_HOSTS = [
  'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ibyteimg.com', 'muscdn.com', 'byteimg.com',
  'ytimg.com', 'ggpht.com', 'cdninstagram.com', 'fbcdn.net', 'twimg.com',
  'redd.it', 'redditmedia.com', 'redditstatic.com', 'pinimg.com', 'sc-cdn.net', 'snapchat.com',
];

const MAX_THUMB_BYTES = 3 * 1024 * 1024;

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

// Follow redirects by hand so every hop can be checked against the allowlist.
async function resolveRedirects(url, fetchImpl = fetch, { hops = 6, timeoutMs = 6000 } = {}) {
  let current = url;
  for (let i = 0; i < hops; i++) {
    // Stop as soon as we've landed on a real post URL; no need to load the page itself.
    if (i > 0 && !needsResolve(current)) return current;
    const host = new URL(current).hostname;
    if (!isPlatformHost(host)) return current;
    const t = withTimeout(timeoutMs);
    let res;
    try {
      res = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': UA_BROWSER, accept: 'text/html' },
        signal: t.signal,
      });
    } catch (err) {
      if (i === 0) throw err;
      return current;
    } finally {
      t.done();
    }
    const loc = res.headers.get('location');
    if (res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {});
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return current;
  }
  return current;
}

async function getJson(url, fetchImpl, timeoutMs = 6000) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA_BROWSER, accept: 'application/json' }, signal: t.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    t.done();
  }
}

async function getHtml(url, fetchImpl, timeoutMs = 6000) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA_PREVIEW, accept: 'text/html' }, signal: t.signal });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 600000);
  } catch {
    return null;
  } finally {
    t.done();
  }
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function metaTag(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = html.match(re);
  if (!tag) return null;
  const c = tag[0].match(/content=["']([^"']*)["']/i);
  return c ? decodeEntities(c[1]).trim() : null;
}

function stripTags(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function clip(s, n) {
  if (!s) return undefined;
  s = s.trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Returns { title, author, thumbUrl } with whatever could be found. Never throws.
async function fetchPreview(platform, url, fetchImpl = fetch) {
  try {
    if (platform === 'tiktok') {
      const j = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, fetchImpl);
      if (j) return { title: clip(j.title, 200), author: j.author_unique_id ? '@' + j.author_unique_id : j.author_name, thumbUrl: j.thumbnail_url };
    }
    if (platform === 'youtube') {
      const j = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, fetchImpl);
      if (j) return { title: clip(j.title, 200), author: j.author_name, thumbUrl: j.thumbnail_url };
    }
    if (platform === 'x') {
      const j = await getJson(`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(url)}`, fetchImpl);
      if (j) {
        const p = (j.html || '').match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        return { title: clip(p ? stripTags(p[1]) : '', 200), author: j.author_name };
      }
    }
    if (platform === 'reddit') {
      const j = await getJson(`https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`, fetchImpl);
      if (j) return { title: clip(j.title, 200), author: j.author_name ? 'u/' + j.author_name : undefined, thumbUrl: j.thumbnail_url };
    }
    // Everyone else (and fallback when an oEmbed endpoint is down): Open Graph tags.
    if (!isPlatformHost(new URL(url).hostname)) return {};
    const html = await getHtml(url, fetchImpl);
    if (!html) return {};
    let title = metaTag(html, 'og:title') || metaTag(html, 'twitter:title');
    const desc = metaTag(html, 'og:description') || metaTag(html, 'description');
    let author;
    if (platform === 'instagram' && title) {
      // "Name on Instagram: "caption"" → author + caption
      const m = title.match(/^(.*?) on Instagram:\s*["“]?([\s\S]*?)["”]?$/);
      if (m) { author = m[1]; title = m[2]; }
    }
    if (!title || /^(instagram|threads|tiktok|snapchat|pinterest)$/i.test(title)) title = desc;
    return { title: clip(title, 200), author, thumbUrl: metaTag(html, 'og:image') || undefined };
  } catch {
    return {};
  }
}

// Download a thumbnail so it keeps working after the platform's signed URL expires.
async function downloadThumb(thumbUrl, fetchImpl = fetch) {
  let u;
  try { u = new URL(thumbUrl); } catch { return null; }
  if (u.protocol !== 'https:' || !hostMatches(u.hostname, THUMB_HOSTS)) return null;
  const t = withTimeout(8000);
  try {
    const res = await fetchImpl(u.toString(), { headers: { 'user-agent': UA_BROWSER }, signal: t.signal });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_THUMB_BYTES) return null;
    return { buf, type };
  } catch {
    return null;
  } finally {
    t.done();
  }
}

module.exports = { resolveRedirects, fetchPreview, downloadThumb, metaTag };
