'use strict';

// Turns whatever someone pastes or shares ("Check this out! https://vm.tiktok.com/ZM123/")
// into a stable identity for the post, so the same video always groups together no
// matter which link variant each friend used.

const PLATFORMS = {
  tiktok: { label: 'TikTok' },
  instagram: { label: 'Instagram' },
  youtube: { label: 'YouTube' },
  x: { label: 'X' },
  threads: { label: 'Threads' },
  snapchat: { label: 'Snapchat' },
  reddit: { label: 'Reddit' },
  pinterest: { label: 'Pinterest' },
  facebook: { label: 'Facebook' },
  link: { label: 'Link' },
};

// Short-link hosts that only redirect to the real post. The server follows these.
const SHORT_HOSTS = new Set([
  'vm.tiktok.com', 'vt.tiktok.com',
  't.snapchat.com', 'pin.it', 't.co', 'fb.watch',
]);

// Hosts the server is willing to contact while resolving redirects and fetching
// previews. Anything else is never fetched, which keeps the server from being used
// to probe arbitrary URLs.
const PLATFORM_DOMAINS = [
  'tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be', 'x.com', 'twitter.com',
  'threads.net', 'threads.com', 'snapchat.com', 'reddit.com', 'redd.it',
  'pinterest.com', 'pin.it', 't.co', 'facebook.com', 'fb.watch',
];

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|igsh$|igshid$|si$|feature$|is_from_webapp$|sender_device$|_r$|_t$|share_|mibextid$|ref$|ref_src$|s$|t$)/i;

function hostMatches(host, domains) {
  host = host.toLowerCase();
  return domains.some((d) => host === d || host.endsWith('.' + d));
}

function isPlatformHost(host) {
  return hostMatches(host, PLATFORM_DOMAINS);
}

// Pull the first http(s) URL out of arbitrary shared text.
function extractUrl(text) {
  if (!text) return null;
  const m = String(text).match(/https?:\/\/[^\s<>"'`]+/i);
  let raw = m ? m[0] : null;
  if (!raw) {
    // People sometimes paste "tiktok.com/@x/video/1" without a scheme.
    const bare = String(text).match(/(?:^|\s)((?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"'`]*)/i);
    if (!bare) return null;
    raw = 'https://' + bare[1];
  }
  raw = raw.replace(/[),.!?;:\]]+$/, '');
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function needsResolve(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (SHORT_HOSTS.has(host)) return true;
  if (host === 'tiktok.com' && /^\/t\//.test(u.pathname)) return true;
  if (host === 'instagram.com' && /^\/share\//.test(u.pathname)) return true;
  if (host === 'facebook.com' && /^\/share\//.test(u.pathname)) return true;
  if (host === 'reddit.com' && /^\/r\/[^/]+\/s\//.test(u.pathname)) return true;
  return false;
}

function cleanUrl(u) {
  const out = new URL(u.toString());
  out.hash = '';
  for (const k of [...out.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(k)) out.searchParams.delete(k);
  }
  return out;
}

// Identify the platform and a stable key for a (resolved) URL.
function identify(url) {
  const u = cleanUrl(new URL(url));
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const after = (seg) => {
    const i = parts.findIndex((p) => p.toLowerCase() === seg);
    return i >= 0 ? parts[i + 1] : undefined;
  };
  const make = (platform, id, canonical) => ({
    platform,
    key: id ? `${platform}:${id}` : `${platform}:${normalizedPath(u)}`,
    url: canonical || u.toString(),
    author: undefined,
  });

  if (hostMatches(host, ['tiktok.com'])) {
    const id = after('video') || after('photo') || (parts[0] === 'v' && parts[1] && parts[1].replace(/\.html$/, ''));
    const user = parts[0] && parts[0].startsWith('@') ? parts[0] : null;
    if (id && /^\d+$/.test(id)) {
      const kind = after('photo') ? 'photo' : 'video';
      const r = make('tiktok', id, user ? `https://www.tiktok.com/${user}/${kind}/${id}` : `https://www.tiktok.com/video/${id}`);
      r.author = user || undefined;
      return r;
    }
    return make('tiktok');
  }

  if (hostMatches(host, ['instagram.com'])) {
    const code = after('p') || after('reel') || after('reels') || after('tv');
    if (code) {
      const kind = after('p') ? 'p' : after('tv') ? 'tv' : 'reel';
      return make('instagram', code, `https://www.instagram.com/${kind}/${code}/`);
    }
    return make('instagram');
  }

  if (hostMatches(host, ['youtube.com', 'youtu.be'])) {
    let id = null;
    if (host === 'youtu.be') id = parts[0];
    else id = u.searchParams.get('v') || after('shorts') || after('live') || after('embed');
    if (id && /^[\w-]{6,}$/.test(id)) {
      const isShort = !!after('shorts');
      return make('youtube', id, isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);
    }
    return make('youtube');
  }

  if (hostMatches(host, ['x.com', 'twitter.com', 'fxtwitter.com', 'vxtwitter.com', 'fixupx.com'])) {
    const id = after('status');
    if (id && /^\d+$/.test(id)) {
      const user = parts[0] && parts[0] !== 'i' ? parts[0] : 'i';
      const r = make('x', id, `https://x.com/${user}/status/${id}`);
      if (user !== 'i') r.author = '@' + user;
      return r;
    }
    return make('x');
  }

  if (hostMatches(host, ['threads.net', 'threads.com'])) {
    const code = after('post');
    if (code) {
      const user = parts[0] && parts[0].startsWith('@') ? parts[0] : null;
      const r = make('threads', code, user ? `https://www.threads.net/${user}/post/${code}` : undefined);
      r.author = user || undefined;
      return r;
    }
    return make('threads');
  }

  if (hostMatches(host, ['snapchat.com'])) {
    const id = after('spotlight');
    return id ? make('snapchat', id, `https://www.snapchat.com/spotlight/${id}`) : make('snapchat');
  }

  if (hostMatches(host, ['reddit.com', 'redd.it'])) {
    const id = host === 'redd.it' ? parts[0] : after('comments');
    return id ? make('reddit', id, `https://www.reddit.com/comments/${id}`) : make('reddit');
  }

  if (hostMatches(host, ['pinterest.com'])) {
    const id = after('pin');
    return id ? make('pinterest', id, `https://www.pinterest.com/pin/${id}/`) : make('pinterest');
  }

  if (hostMatches(host, ['facebook.com', 'fb.watch'])) {
    const id = after('reel') || after('videos') || u.searchParams.get('v');
    return id ? make('facebook', id) : make('facebook');
  }

  return make('link');
}

function normalizedPath(u) {
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const qs = u.searchParams.toString();
  return host + path + (qs ? '?' + qs : '');
}

module.exports = { PLATFORMS, extractUrl, needsResolve, identify, isPlatformHost, hostMatches };
