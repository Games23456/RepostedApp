'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractUrl, identify, needsResolve } = require('../lib/links');

test('extracts a link from share text', () => {
  assert.equal(extractUrl('Check this out! https://vm.tiktok.com/ZMabc123/ #fyp'), 'https://vm.tiktok.com/ZMabc123/');
  assert.equal(extractUrl('(https://www.instagram.com/reel/Cxyz123/).'), 'https://www.instagram.com/reel/Cxyz123/');
  assert.equal(extractUrl('tiktok.com/@a/video/123'), 'https://tiktok.com/@a/video/123');
  assert.equal(extractUrl('no link here'), null);
  assert.equal(extractUrl('javascript:alert(1)'), null);
});

test('detects short links that need resolving', () => {
  assert.ok(needsResolve('https://vm.tiktok.com/ZMabc/'));
  assert.ok(needsResolve('https://www.tiktok.com/t/ZTabc/'));
  assert.ok(needsResolve('https://www.instagram.com/share/reel/BAabc/'));
  assert.ok(!needsResolve('https://www.tiktok.com/@a/video/1'));
});

test('TikTok variants share one key', () => {
  const a = identify('https://www.tiktok.com/@cool.user/video/7312345678901234567?is_from_webapp=1&sender_device=pc');
  const b = identify('https://m.tiktok.com/v/7312345678901234567.html');
  assert.equal(a.key, 'tiktok:7312345678901234567');
  assert.equal(b.key, a.key);
  assert.equal(a.url, 'https://www.tiktok.com/@cool.user/video/7312345678901234567');
  assert.equal(a.author, '@cool.user');
  assert.equal(identify('https://www.tiktok.com/@x/photo/7300000000000000001').key, 'tiktok:7300000000000000001');
});

test('Instagram posts, reels and profile-prefixed URLs share keys', () => {
  assert.equal(identify('https://www.instagram.com/reel/C9AbCdEf_12/?igsh=MWQ1').key, 'instagram:C9AbCdEf_12');
  assert.equal(identify('https://instagram.com/reels/C9AbCdEf_12').key, 'instagram:C9AbCdEf_12');
  assert.equal(identify('https://www.instagram.com/someone/reel/C9AbCdEf_12/').key, 'instagram:C9AbCdEf_12');
  assert.equal(identify('https://www.instagram.com/p/C1/').url, 'https://www.instagram.com/p/C1/');
});

test('YouTube watch, short and youtu.be links share keys', () => {
  const k = 'youtube:dQw4w9WgXcQ';
  assert.equal(identify('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s').key, k);
  assert.equal(identify('https://youtu.be/dQw4w9WgXcQ?si=abc').key, k);
  assert.equal(identify('https://youtube.com/shorts/dQw4w9WgXcQ').key, k);
  assert.equal(identify('https://youtube.com/shorts/dQw4w9WgXcQ').url, 'https://www.youtube.com/shorts/dQw4w9WgXcQ');
});

test('X / Twitter variants share keys', () => {
  const a = identify('https://twitter.com/jack/status/20?s=20&t=abc');
  const b = identify('https://x.com/jack/status/20');
  const c = identify('https://fxtwitter.com/jack/status/20');
  assert.equal(a.key, 'x:20');
  assert.equal(b.key, a.key);
  assert.equal(c.key, a.key);
});

test('other platforms and plain links', () => {
  assert.equal(identify('https://www.threads.net/@zuck/post/C8abc').key, 'threads:C8abc');
  assert.equal(identify('https://www.reddit.com/r/pics/comments/abc123/title/').key, 'reddit:abc123');
  assert.equal(identify('https://redd.it/abc123').key, 'reddit:abc123');
  assert.equal(identify('https://www.snapchat.com/spotlight/W7_abc').key, 'snapchat:W7_abc');
  const l = identify('https://www.example.com/article/?utm_source=x&id=5#top');
  assert.equal(l.platform, 'link');
  assert.equal(l.key, 'link:example.com/article?id=5');
});
