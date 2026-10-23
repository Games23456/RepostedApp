'use strict';

// ---------- constants ----------

const PLATFORMS = {
  tiktok: { label: 'TikTok', color: '#fe2c55', bg: 'linear-gradient(135deg,#111,#2b2b2b)', fg: '#fff', glyph: 'T' },
  instagram: { label: 'Instagram', color: '#e1306c', bg: 'linear-gradient(135deg,#feda75,#fa7e1e 30%,#d62976 60%,#962fbf 85%,#4f5bd5)', fg: '#fff', glyph: 'IG' },
  youtube: { label: 'YouTube', color: '#ff0033', bg: 'linear-gradient(135deg,#ff0033,#b0001f)', fg: '#fff', glyph: '▶' },
  x: { label: 'X', color: '#8a8a96', bg: 'linear-gradient(135deg,#000,#333)', fg: '#fff', glyph: 'X' },
  threads: { label: 'Threads', color: '#8a8a96', bg: 'linear-gradient(135deg,#000,#3a3a3a)', fg: '#fff', glyph: '@' },
  snapchat: { label: 'Snapchat', color: '#f5d800', bg: 'linear-gradient(135deg,#fffc00,#f5d800)', fg: '#111', glyph: 'S' },
  reddit: { label: 'Reddit', color: '#ff4500', bg: 'linear-gradient(135deg,#ff5700,#ff4500)', fg: '#fff', glyph: 'r/' },
  pinterest: { label: 'Pinterest', color: '#e60023', bg: 'linear-gradient(135deg,#e60023,#ad081b)', fg: '#fff', glyph: 'P' },
  facebook: { label: 'Facebook', color: '#1877f2', bg: 'linear-gradient(135deg,#1877f2,#0b5fcc)', fg: '#fff', glyph: 'f' },
  link: { label: 'Link', color: '#8a8a96', bg: 'linear-gradient(135deg,#6b6b76,#3d3d45)', fg: '#fff', glyph: '↗' },
};

const ICONS = {
  repost: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  play: '<path d="M8 5v14l11-7z"/>',
};

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

// ---------- small utilities ----------

function icon(name) {
  const span = document.createElement('span');
  span.style.display = 'contents';
  const fill = name === 'play' ? 'currentColor' : 'none';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span.firstChild;
}

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k.startsWith('--')) el.style.setProperty(k, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const storage = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

let toastTimer;
function toast(msg, kind) {
  $toast.textContent = msg;
  $toast.className = 'show' + (kind === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.className = ''; }, 2600);
}

function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  const first = (w) => [...w][0] || '';
  return (parts.length > 1 ? first(parts[0]) + first(parts[parts.length - 1]) : first(parts[0])) || '?';
}

function avatar(member, cls) {
  return h('span', { class: 'avatar' + (cls ? ' ' + cls : ''), '--c': member?.color || '#888', title: member?.name || 'Former member' }, initials(member?.name || '?'));
}

function avatarStack(members, max = 3) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return h('span', { class: 'stack' }, shown.map((m) => avatar(m)), extra > 0 ? h('span', { class: 'avatar more' }, `+${extra}`) : null);
}

function looksLikeLink(text) {
  return /https?:\/\/\S+|(?:^|\s)[a-z0-9-]+\.[a-z]{2,}\/\S*/i.test(text);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ---------- state ----------

const state = {
  sessions: storage.get('reposted.sessions', []),
  active: storage.get('reposted.active', 0),
  data: null,
  filter: { platform: 'all', member: null },
  seenBaseline: 0,
  events: null,
  pendingShare: null,
  welcome: { mode: null, code: '', adding: false },
};

function session() { return state.sessions[state.active] || null; }

function saveSessions() {
  if (state.active >= state.sessions.length) state.active = 0;
  storage.set('reposted.sessions', state.sessions);
  storage.set('reposted.active', state.active);
}

function addSession(res) {
  const existing = state.sessions.findIndex((s) => s.groupId === res.group.id);
  const entry = { token: res.token, groupId: res.group.id, groupName: res.group.name, code: res.group.code };
  if (existing >= 0) { state.sessions[existing] = entry; state.active = existing; } else { state.sessions.push(entry); state.active = state.sessions.length - 1; }
  saveSessions();
}

function dropSession(index) {
  state.sessions.splice(index, 1);
  state.active = 0;
  saveSessions();
}

// ---------- API ----------

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function api(method, path, body, token = session()?.token) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(navigator.onLine ? "Couldn't reach the server. Try again." : "You're offline.", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error || 'Something went wrong.', res.status);
  return json;
}

function handleAuthError(err) {
  if (err.status !== 401) return false;
  const lost = session();
  dropSession(state.active);
  toast(lost ? `You're no longer in ${lost.groupName}.` : err.message, 'error');
  boot();
  return true;
}

// ---------- realtime ----------

let refreshTimer;
function scheduleRefresh(delay = 150) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, delay);
}

async function refresh() {
  const s = session();
  if (!s) return;
  try {
    const data = await api('GET', '/api/feed');
    if (session() !== s) return;
    state.data = data;
    if (s.groupName !== data.group.name || s.code !== data.group.code) { s.groupName = data.group.name; s.code = data.group.code; saveSessions(); }
    renderHeader();
    renderChips();
    renderFeed();
    updateTitle();
    // Keep polling while any preview is still loading.
    if (data.items.some((i) => i.loading)) scheduleRefresh(4000);
  } catch (err) {
    if (!handleAuthError(err) && !state.data) renderLoadError(err);
  }
}

function connectEvents() {
  state.events?.close();
  const s = session();
  if (!s || !('EventSource' in window)) return;
  const es = new EventSource(`/api/events?token=${encodeURIComponent(s.token)}`);
  es.onmessage = () => scheduleRefresh();
  es.onopen = () => scheduleRefresh(0);
  state.events = es;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    scheduleRefresh(0);
    if (state.events?.readyState === 2) connectEvents();
  } else {
    markSeen();
  }
});
window.addEventListener('pagehide', markSeen);
window.addEventListener('online', () => { connectEvents(); scheduleRefresh(0); });
setInterval(() => { if (document.visibilityState === 'visible') scheduleRefresh(0); }, 60000);

function seenKey() { return `reposted.seen.${session()?.groupId}`; }
function markSeen() { if (session()) storage.set(seenKey(), Date.now()); }

function isNew(item) {
  const latest = item.reposts[0];
  return item.lastAt > state.seenBaseline && latest && latest.memberId !== state.data.me.id;
}

function updateTitle() {
  const n = state.data ? state.data.items.filter(isNew).length : 0;
  document.title = n ? `(${n}) Reposted` : 'Reposted';
}

// ---------- welcome / onboarding ----------

function renderWelcome() {
  state.events?.close();
  document.title = 'Reposted';
  const w = state.welcome;
  if (!w.mode) w.mode = w.code ? 'join' : 'start';

  const error = h('div', { class: 'error' });
  const nameInput = h('input', { class: 'field', id: 'name', placeholder: 'e.g. Jonah', maxlength: 24, autocomplete: 'nickname', autocapitalize: 'words', enterkeyhint: 'go' });
  nameInput.value = storage.get('reposted.lastName', '');
  const codeInput = h('input', { class: 'field code-field', id: 'code', placeholder: 'ABC123', maxlength: 8, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  codeInput.value = w.code;
  const groupInput = h('input', { class: 'field', id: 'gname', placeholder: 'e.g. The Group Chat', maxlength: 40, autocapitalize: 'words' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, w.mode === 'join' ? 'Join group' : 'Create group');

  const form = h('form', { class: 'form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    submit.replaceChildren(h('span', { class: 'spinner' }));
    try {
      const name = nameInput.value.trim();
      const res = w.mode === 'join'
        ? await api('POST', '/api/join', { code: codeInput.value, name }, null)
        : await api('POST', '/api/groups', { groupName: groupInput.value, name }, null);
      storage.set('reposted.lastName', name);
      addSession(res);
      state.welcome = { mode: null, code: '', adding: false };
      await enterGroup();
      if (w.mode === 'start') openInvite(true);
      else toast(`You're in! Welcome to ${res.group.name}`);
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
      submit.textContent = w.mode === 'join' ? 'Join group' : 'Create group';
    }
  } },
  w.mode === 'join'
    ? [h('label', { for: 'code' }, 'Group code'), codeInput]
    : [h('label', { for: 'gname' }, 'Group name'), groupInput],
  h('label', { for: 'name' }, 'Your name'), nameInput,
  error, submit);

  const tab = (mode, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(w.mode === mode), onclick: () => { w.mode = mode; renderWelcome(); } }, label);

  $app.replaceChildren(h('main', { class: 'welcome' },
    w.adding ? h('button', { class: 'btn btn-ghost', style: { padding: 0, marginBottom: '20px' }, onclick: () => { state.welcome.adding = false; boot(); } }, '← Back') : null,
    h('img', { class: 'logo', src: '/icons/icon.svg', alt: '' }),
    h('h1', {}, 'See what your friends ', h('span', {}, 'repost'), '.'),
    h('p', { class: 'lede' }, 'One private feed for your group’s TikToks, Reels, Shorts and more. Know exactly who reposted what.'),
    h('div', { class: 'seg', role: 'tablist' }, tab('join', 'Join a group'), tab('start', 'Start a group')),
    form,
    h('p', { class: 'fineprint' }, 'No TikTok or Instagram login needed, ever. Your accounts stay safe.'),
  ));
  (w.mode === 'join' && !codeInput.value ? codeInput : w.mode === 'start' ? groupInput : nameInput).focus({ preventScroll: true });
}

// ---------- main screen ----------

let refs = {};

async function enterGroup() {
  state.data = null;
  state.filter = { platform: 'all', member: null };
  state.seenBaseline = storage.get(seenKey(), Date.now());
  renderShell();
  connectEvents();
  await refresh();
  if (state.pendingShare) {
    const text = state.pendingShare;
    state.pendingShare = null;
    try { sessionStorage.removeItem('reposted.pendingShare'); } catch { /* ignore */ }
    await postRepost(text, '');
  }
}

function renderShell() {
  const s = session();
  refs = {};
  refs.groupName = h('span', {}, s.groupName);
  refs.groupSub = h('div', { class: 'gsub' }, ' ');
  refs.people = h('button', { class: 'people-btn', 'aria-label': 'People in this group', onclick: openPeople });

  const topbar = h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
    h('button', { class: 'group-btn', onclick: openMenu, 'aria-label': 'Groups and settings' },
      h('img', { class: 'logo', src: '/icons/icon.svg', alt: '' }),
      h('div', { class: 'names' }, h('div', { class: 'gname' }, refs.groupName, h('span', { class: 'chev' }, icon('chevron'))), refs.groupSub),
    ),
    refs.people,
    h('button', { class: 'pill-btn', onclick: () => openInvite(false), 'aria-label': 'Invite friends' }, icon('userPlus'), h('span', { class: 'pill-label' }, 'Invite')),
  ));

  // Composer
  const input = h('input', { class: 'field', type: 'text', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Paste a link', autocomplete: 'off', enterkeyhint: 'send', 'aria-label': 'Link to repost' });
  const note = h('input', { class: 'field note-field hidden', placeholder: 'Add a note (optional)', maxlength: 200, enterkeyhint: 'send', 'aria-label': 'Note' });
  const hint = h('div', { class: 'hint' }, 'Reposted something? Drop the link here so your friends see it.');
  const pasteBtn = h('button', { class: 'btn btn-soft', type: 'button', 'aria-label': 'Paste from clipboard' }, icon('paste'), 'Paste');
  const postBtn = h('button', { class: 'btn btn-primary hidden', type: 'submit' }, icon('repost'), 'Post');
  refs.composer = { input, note, hint, pasteBtn, postBtn };

  const sync = () => {
    const has = input.value.trim().length > 0;
    note.classList.toggle('hidden', !has);
    postBtn.classList.toggle('hidden', !has);
    pasteBtn.classList.toggle('hidden', has);
    lookupSoon();
  };
  input.addEventListener('input', sync);
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !looksLikeLink(text)) { toast('Your clipboard doesn’t have a link. Copy one first.'); return; }
      input.value = text.trim();
      sync();
      lookup();
      note.focus();
    } catch {
      input.focus();
      toast('Long-press the box and tap Paste');
    }
  });

  const form = h('form', { class: 'composer', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    postBtn.disabled = true;
    const ok = await postRepost(text, note.value.trim());
    postBtn.disabled = false;
    if (ok) {
      input.value = '';
      note.value = '';
      sync();
      input.blur(); note.blur();
    }
  } }, h('div', { class: 'composer-row' }, input, pasteBtn, postBtn), note, hint);

  refs.chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Filter' });
  refs.feed = h('section', { class: 'feed', 'aria-label': 'Reposts' }, loadingCards());

  $app.replaceChildren(topbar, h('main', { class: 'wrap' }, form, refs.chips, refs.feed));
}

function loadingCards() {
  return [0, 1].map(() => h('div', { class: 'card' },
    h('div', { class: 'post' }, h('div', { class: 'thumb loading' }), h('div', { class: 'post-body' }, h('div', { class: 'badge' }, '·····'), h('div', { class: 'post-title placeholder' }, 'Loading…')))));
}

function renderLoadError(err) {
  if (!refs.feed) return;
  refs.feed.replaceChildren(h('div', { class: 'empty' },
    h('h3', {}, 'Can’t load the feed'), h('p', {}, err.message),
    h('button', { class: 'btn btn-soft', onclick: () => { refs.feed.replaceChildren(...loadingCards()); refresh(); } }, 'Try again')));
}

let lookupTimer;
let lookupSeq = 0;
function lookupSoon() {
  clearTimeout(lookupTimer);
  lookupTimer = setTimeout(lookup, 350);
}

async function lookup() {
  clearTimeout(lookupTimer);
  const { input, hint } = refs.composer || {};
  if (!input) return;
  const text = input.value.trim();
  const seq = ++lookupSeq;
  if (!text) { hint.replaceChildren('Reposted something? Drop the link here so your friends see it.'); return; }
  if (!looksLikeLink(text)) { hint.replaceChildren('Paste the full link (Share → Copy link in the app).'); return; }
  try {
    const res = await api('GET', `/api/lookup?text=${encodeURIComponent(text)}`);
    if (seq !== lookupSeq) return;
    const p = PLATFORMS[res.platform] || PLATFORMS.link;
    const badge = h('span', { class: 'badge', '--pc': p.color }, h('i'), p.label);
    const who = res.reposters.map(memberById).filter(Boolean);
    if (!who.length) hint.replaceChildren(badge, 'Nobody in the group has reposted this yet.');
    else hint.replaceChildren(badge, avatarStack(who, 4), h('span', {}, 'Already reposted by ', h('b', {}, namesList(who)), '.'));
  } catch (err) {
    if (seq !== lookupSeq) return;
    if (handleAuthError(err)) return;
    hint.replaceChildren(err.message);
  }
}

async function postRepost(text, note) {
  try {
    const res = await api('POST', '/api/reposts', { text, note });
    toast(res.already ? (note ? 'Note updated' : 'You already reposted this') : `Posted to ${session().groupName}`);
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(12);
    await refresh();
    return true;
  } catch (err) {
    if (!handleAuthError(err)) toast(err.message, 'error');
    return false;
  }
}

function memberById(id) {
  return state.data?.members.find((m) => m.id === id) || null;
}

function displayName(m) {
  if (!m) return 'Someone';
  return m.id === state.data.me.id ? 'You' : m.name;
}

function namesList(members, max = 3) {
  const names = members.map(displayName);
  if (names.length === 1) return names[0];
  if (names.length <= max) return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  const rest = names.length - (max - 1);
  return names.slice(0, max - 1).join(', ') + ` and ${rest} others`;
}

function renderHeader() {
  const { group, members } = state.data;
  refs.groupName.textContent = group.name;
  refs.groupSub.textContent = `${members.length} ${members.length === 1 ? 'person' : 'people'}`;
  refs.people.replaceChildren(avatarStack(members, 3));
}

function renderChips() {
  const { items } = state.data;
  const counts = {};
  for (const it of items) counts[it.platform] = (counts[it.platform] || 0) + 1;
  const platforms = Object.keys(PLATFORMS).filter((p) => counts[p]);
  if (state.filter.platform !== 'all' && !counts[state.filter.platform]) state.filter.platform = 'all';

  const chip = (key, label, extra) => h('button', {
    class: 'chip', 'aria-pressed': String(state.filter.platform === key),
    onclick: () => { state.filter.platform = key; renderChips(); renderFeed(); },
  }, extra || null, label);

  const chips = [];
  const fm = state.filter.member && memberById(state.filter.member);
  if (fm) {
    chips.push(h('button', { class: 'chip', 'aria-pressed': 'true', onclick: () => { state.filter.member = null; renderChips(); renderFeed(); } },
      avatar(fm), fm.id === state.data.me.id ? 'Your reposts' : fm.name, h('span', { class: 'x' }, '✕')));
  }
  if (platforms.length > 1 || fm) {
    chips.push(chip('all', 'All'));
    for (const p of platforms) chips.push(chip(p, PLATFORMS[p].label));
  }
  refs.chips.replaceChildren(...chips);
  refs.chips.classList.toggle('hidden', chips.length === 0);
}

function renderFeed() {
  const { items, me, members } = state.data;
  const visible = items.filter((it) =>
    (state.filter.platform === 'all' || it.platform === state.filter.platform) &&
    (!state.filter.member || it.reposts.some((r) => r.memberId === state.filter.member)));

  if (!items.length) {
    refs.feed.replaceChildren(h('div', { class: 'empty' },
      h('div', { class: 'art' }, icon('repost')),
      h('h3', {}, members.length > 1 ? 'No reposts yet' : 'It’s quiet in here'),
      h('p', {}, members.length > 1
        ? 'Next time you repost something, copy its link and paste it above. Everyone here will see it.'
        : 'Invite your friends, then paste links to the stuff you repost. You’ll all see who reposted what.'),
      h('div', { class: 'btn-row', style: { flexWrap: 'wrap', justifyContent: 'center' } },
        members.length > 1 ? null : h('button', { class: 'btn btn-primary', onclick: () => openInvite(false) }, icon('userPlus'), 'Invite friends'),
        h('button', { class: 'btn btn-soft', onclick: openHelp }, icon('help'), 'How it works'))));
    return;
  }
  if (!visible.length) {
    refs.feed.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Nothing matches this filter.')));
    return;
  }
  refs.feed.replaceChildren(...visible.map((it) => card(it, me)));
}

function thumbFor(it) {
  const p = PLATFORMS[it.platform] || PLATFORMS.link;
  const fallback = () => h('div', { class: 'thumb fallback', style: { background: p.bg, color: p.fg } }, p.glyph);
  if (it.loading && !it.thumb) return h('div', { class: 'thumb loading' });
  if (!it.thumb) return fallback();
  const img = h('img', { src: it.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
  const box = h('div', { class: 'thumb' }, img, h('span', { class: 'play' }, icon('play')));
  img.addEventListener('error', () => box.replaceWith(fallback()));
  return box;
}

function card(it, me) {
  const p = PLATFORMS[it.platform] || PLATFORMS.link;
  const reposters = it.reposts.map((r) => memberById(r.memberId)).filter(Boolean);
  const mine = it.reposts.find((r) => r.memberId === me.id);
  const host = (() => { try { return new URL(it.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();

  const who = h('button', { class: 'who', onclick: () => openReposters(it) },
    avatarStack(reposters, 3),
    h('span', { class: 'who-text' }, h('b', {}, namesList(reposters)), ' reposted'),
    h('span', { class: 'who-time' }, timeAgo(it.lastAt)));

  const post = h('a', { class: 'post', href: it.url, target: '_blank', rel: 'noopener noreferrer' },
    thumbFor(it),
    h('div', { class: 'post-body' },
      h('span', { class: 'badge', '--pc': p.color }, h('i'), p.label),
      it.title ? h('div', { class: 'post-title' }, it.title) : h('div', { class: 'post-title placeholder' }, it.loading ? 'Loading preview…' : (it.platform === 'link' ? host : `${p.label} post`)),
      it.author ? h('div', { class: 'post-author' }, it.author) : null));

  const notes = it.reposts.filter((r) => r.note);
  const notesEl = notes.length ? h('div', { class: 'notes' }, notes.map((r) => h('div', { class: 'note' }, h('b', {}, displayName(memberById(r.memberId))), ' ', r.note))) : null;

  const actions = h('div', { class: 'actions' },
    h('a', { class: 'btn btn-soft', href: it.url, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), it.platform === 'link' ? 'Open' : `Open in ${p.label}`),
    h('span', { class: 'spacer' }),
    mine
      ? [h('span', { class: 'you-reposted' }, icon('check'), 'Reposted'),
         h('button', { class: 'btn btn-ghost', onclick: async (e) => {
           e.currentTarget.disabled = true;
           try { await api('DELETE', `/api/reposts/${mine.id}`); toast('Removed'); await refresh(); } catch (err) { if (!handleAuthError(err)) toast(err.message, 'error'); }
         } }, 'Undo')]
      : h('button', { class: 'btn btn-soft', onclick: async (e) => { e.currentTarget.disabled = true; await postRepost(it.url, ''); } }, icon('repost'), 'I reposted too'));

  return h('article', { class: 'card' + (isNew(it) ? ' new' : '') }, who, post, notesEl, actions);
}

// ---------- sheets ----------

function openSheet(...content) {
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grabber' }), ...content);
  const backdrop = h('div', { class: 'backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, sheet);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() { backdrop.remove(); document.removeEventListener('keydown', onKey); }
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  // Swipe down to dismiss.
  let startY = null;
  sheet.addEventListener('touchstart', (e) => { startY = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    startY = null;
    if (dy > 90) close(); else sheet.style.transform = '';
  });
  return { close, sheet };
}

function openInvite(fresh) {
  const { group } = state.data || { group: { name: session().groupName, code: '' } };
  const link = `${location.origin}/join/${group.code}`;
  const msg = `Join "${group.name}" on Reposted so we can see what each other reposts: ${link}`;
  openSheet(
    h('h2', {}, fresh ? 'Your group is ready 🎉' : 'Invite friends'),
    h('p', { class: 'sub' }, 'Send them the link, or have them tap “Join a group” and enter this code:'),
    h('div', { class: 'code-box' }, group.code),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-soft', onclick: async () => { toast((await copyText(link)) ? 'Link copied' : 'Couldn’t copy'); } }, icon('copy'), 'Copy link'),
      navigator.share ? h('button', { class: 'btn btn-primary', onclick: () => navigator.share({ title: 'Reposted', text: msg }).catch(() => {}) }, icon('share'), 'Share') : null),
  );
}

function openPeople() {
  const { members, items, me } = state.data;
  const count = (id) => items.filter((it) => it.reposts.some((r) => r.memberId === id)).length;
  const s = openSheet(
    h('h2', {}, 'People'),
    h('p', { class: 'sub' }, 'Tap someone to see everything they’ve reposted.'),
    h('div', { class: 'list' }, members.map((m) => h('button', { class: 'row row-btn', onclick: () => {
      state.filter.member = m.id;
      s.close();
      renderChips(); renderFeed();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } },
      avatar(m, 'lg'),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, m.id === me.id ? `${m.name} (you)` : m.name), h('div', { class: 'meta' }, `${count(m.id)} reposts`)),
      state.filter.member === m.id ? h('span', { class: 'check' }, icon('check')) : null))),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', onclick: () => { s.close(); openInvite(false); } }, icon('userPlus'), 'Invite friends')),
  );
}

function openReposters(it) {
  const p = PLATFORMS[it.platform] || PLATFORMS.link;
  openSheet(
    h('h2', {}, 'Who reposted this'),
    h('p', { class: 'sub' }, it.title || `${p.label} post`),
    h('div', { class: 'list' }, [...it.reposts].reverse().map((r) => {
      const m = memberById(r.memberId);
      return h('div', { class: 'row' },
        avatar(m, 'lg'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, displayName(m)), r.note ? h('div', { class: 'meta' }, `“${r.note}”`) : null),
        h('div', { class: 'meta' }, timeAgo(r.createdAt)));
    })),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-soft', href: it.url, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), `Open in ${p.label}`)),
  );
}

function openMenu() {
  const me = state.data?.me;
  const s = openSheet(
    h('h2', {}, 'Groups'),
    h('div', { class: 'list' }, state.sessions.map((g, i) => h('button', { class: 'row row-btn', onclick: () => {
      s.close();
      if (i === state.active) return;
      markSeen();
      state.active = i;
      saveSessions();
      enterGroup();
    } },
      h('img', { src: '/icons/icon.svg', alt: '', style: { width: '36px', height: '36px', borderRadius: '10px' } }),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, g.groupName)),
      i === state.active ? h('span', { class: 'check' }, icon('check')) : null))),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-soft', onclick: () => {
      s.close();
      state.welcome = { mode: 'join', code: '', adding: true };
      renderWelcome();
    } }, icon('plus'), 'Join or start another group')),

    h('div', { class: 'section' }, h('div', { class: 'section-title' }, 'You'),
      me ? nameEditor(me) : null,
      h('div', { class: 'list' },
        h('button', { class: 'row row-btn', onclick: () => { s.close(); openHelp(); } },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, 'How to add reposts'), h('div', { class: 'meta' }, 'From TikTok, Instagram, YouTube and more'))),
        h('button', { class: 'row row-btn', onclick: () => { s.close(); openDeviceLink(); } },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Use on another device'), h('div', { class: 'meta' }, 'Sign in on your laptop or a new phone'))),
        h('button', { class: 'row row-btn', onclick: () => { s.close(); leaveGroup(); } },
          h('div', { class: 'grow' }, h('div', { class: 'title', style: { color: 'var(--danger)' } }, 'Leave group'), h('div', { class: 'meta' }, 'Removes you and your reposts'))))),
  );
}

function nameEditor(me) {
  const input = h('input', { class: 'field', value: me.name, maxlength: 24, 'aria-label': 'Your name', autocapitalize: 'words' });
  const save = h('button', { class: 'btn btn-soft', type: 'submit' }, 'Save');
  return h('form', { class: 'composer-row', style: { marginBottom: '8px' }, onsubmit: async (e) => {
    e.preventDefault();
    if (input.value.trim() === me.name) return;
    save.disabled = true;
    try { await api('PATCH', '/api/me', { name: input.value }); storage.set('reposted.lastName', input.value.trim()); toast('Name updated'); await refresh(); } catch (err) { if (!handleAuthError(err)) toast(err.message, 'error'); }
    save.disabled = false;
  } }, input, save);
}

async function openDeviceLink() {
  try {
    const { token } = await api('POST', '/api/device-link');
    const link = `${location.origin}/#device=${token}`;
    openSheet(
      h('h2', {}, 'Use on another device'),
      h('p', { class: 'sub' }, 'Open this link on your other device to sign in as you. Anyone with it can post as you, so only send it to yourself.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', onclick: async () => { toast((await copyText(link)) ? 'Link copied' : 'Couldn’t copy'); } }, icon('copy'), 'Copy sign-in link')),
    );
  } catch (err) {
    if (!handleAuthError(err)) toast(err.message, 'error');
  }
}

async function leaveGroup() {
  const name = session().groupName;
  if (!confirm(`Leave ${name}? Your reposts will be removed from the group.`)) return;
  try {
    await api('DELETE', '/api/me');
    dropSession(state.active);
    toast(`You left ${name}`);
    boot();
  } catch (err) {
    if (!handleAuthError(err)) toast(err.message, 'error');
  }
}

function openHelp() {
  const isAndroid = /android/i.test(navigator.userAgent);
  const body = h('div');
  const ios = () => h('ol', { class: 'steps' },
    h('li', {}, 'In TikTok, Instagram or YouTube, tap Share on what you reposted, then Copy link.'),
    h('li', {}, 'Open Reposted and tap Paste. Add a note if you want, then tap Post.'),
    h('li', {}, 'Tip: in Safari, tap Share → Add to Home Screen so Reposted opens like a normal app.'));
  const android = () => h('ol', { class: 'steps' },
    h('li', {}, 'Install Reposted: in Chrome, tap ⋮ → Install app (or Add to Home screen).'),
    h('li', {}, 'In TikTok, Instagram or YouTube, tap Share → More (or the ⋯ icon) → Reposted.'),
    h('li', {}, 'That’s it. It posts to your group instantly. Copy link + Paste works too.'));
  const tabs = h('div', { class: 'tabs' });
  const show = (which) => {
    tabs.replaceChildren(
      h('button', { class: 'chip', 'aria-pressed': String(which === 'ios'), onclick: () => show('ios') }, 'iPhone'),
      h('button', { class: 'chip', 'aria-pressed': String(which === 'android'), onclick: () => show('android') }, 'Android'));
    body.replaceChildren(which === 'ios' ? ios() : android());
  };
  show(isAndroid ? 'android' : 'ios');
  openSheet(
    h('h2', {}, 'How to add reposts'),
    h('p', { class: 'sub' }, 'TikTok and Instagram don’t let any app see reposts automatically (the apps that claim to are unreliable or unsafe). So when you repost something, drop the link here too. It takes two taps.'),
    tabs, body,
  );
}

// ---------- boot ----------

async function boot() {
  if (!state.sessions.length) { renderWelcome(); return; }
  if (state.welcome.adding) { renderWelcome(); return; }
  await enterGroup();
}

async function start() {
  const url = new URL(location.href);
  const join = url.pathname.match(/^\/join\/([A-Za-z0-9]+)/);
  if (join) {
    state.welcome.code = join[1].toUpperCase();
    state.welcome.mode = 'join';
  }
  if (url.pathname.startsWith('/share')) {
    const shared = [url.searchParams.get('url'), url.searchParams.get('text'), url.searchParams.get('title')].filter(Boolean).join(' ');
    if (shared) state.pendingShare = shared;
  }
  try {
    const saved = sessionStorage.getItem('reposted.pendingShare');
    if (!state.pendingShare && saved) state.pendingShare = saved;
    if (state.pendingShare) sessionStorage.setItem('reposted.pendingShare', state.pendingShare);
  } catch { /* ignore */ }

  const device = url.hash.match(/device=([\w-]+)/);
  if (device) {
    try {
      const me = await api('GET', '/api/me', null, device[1]);
      addSession({ token: device[1], group: me.group });
      toast(`Signed in to ${me.group.name} as ${me.me.name}`);
    } catch (err) {
      toast(err.status === 401 ? 'That sign-in link has expired. Make a new one.' : err.message, 'error');
    }
  }

  if (join || url.pathname.startsWith('/share') || device) history.replaceState(null, '', '/');

  // A join link for a group you're already in just opens that group.
  if (join) {
    const idx = state.sessions.findIndex((s) => s.code === state.welcome.code);
    if (idx >= 0) { state.active = idx; saveSessions(); } else if (state.sessions.length) state.welcome.adding = true;
  }

  await boot();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

start();
