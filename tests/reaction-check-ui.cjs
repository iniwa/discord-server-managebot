// Run with: $env:NODE_PATH="$env:TEMP\discord-role-ui-tests\node_modules"; node --test tests/reaction-check-ui.cjs
// Loads the real HTML and all public scripts in jsdom; API requests are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const publicDir = path.join(__dirname, '..', 'src', 'web', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const scripts = ['app.js', 'button-roles.js', 'reaction-checks.js'].map(name => fs.readFileSync(path.join(publicDir, name), 'utf8'));
const checks = [
  { id: 10, guild_id: '1', channel_id: '2', message_id: '3', mode: 'specific', emoji: '✅', label: 'Read chapter', synced_at: '2026-09-01T00:00:00.000Z' },
  { id: 20, guild_id: '1', channel_id: '2', message_id: '4', mode: 'specific', emoji: '👀', label: 'Second check', synced_at: null },
];
const report = (id = 10, overrides = {}) => ({
  check: { ...checks.find(check => check.id === id), ...overrides.check },
  reacted: [{ user_id: 'user-1', username: 'alice', display_name: 'Alice', reacted_at: '2026-09-02T12:00:00.000Z' }],
  pending: [{ user_id: 'user-2', username: 'bob', display_name: 'Bob', reacted_at: null }],
  synced_at: '2026-09-02T12:01:00.000Z', member_snapshot_at: '2026-09-02T12:00:00.000Z', warning: null,
  ...overrides,
});

function response(data, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => data };
}

function defaultData(url) {
  if (url === '/api/reaction-checks') return response(checks);
  if (/^\/api\/reaction-checks\/\d+$/.test(url)) return response(report(Number(url.split('/').pop())));
  if (url === '/api/discord/roles') return response([{ id: 'role-1', name: 'Member' }]);
  if (url === '/api/discord/channels') return response([{ id: 'channel-1', name: 'general', type: 0, isVoice: false }]);
  if (url === '/api/discord/emojis') return response([]);
  if (url === '/api/reaction-roles' || url === '/api/status-roles' || url === '/api/voice-roles' || url === '/api/members' || url === '/api/snapshots') return response([]);
  if (url.startsWith('/api/leave-log') || url.startsWith('/api/bot-logs')) return response({ total: 0, rows: [] });
  return response({});
}

async function createPage(responder = async req => defaultData(req.url)) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously' });
  const { window } = dom;
  await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  window.Element.prototype.scrollIntoView = function () {};
  window.confirm = () => true;
  const requests = [];
  window.fetch = async (url, options = {}) => {
    const req = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined };
    requests.push(req);
    return responder(req, requests);
  };
  for (const script of scripts) window.eval(script);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  await waitFor(() => requests.some(req => req.url === '/api/reaction-checks' && req.method === 'GET'), 'initial check-list request did not start');
  await waitFor(() => !window.document.getElementById('rc-reload').disabled, 'initial list request did not finish');
  return { dom, window, document: window.document, requests };
}

function waitFor(predicate, message, timeout = 2000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeout) return reject(new Error(message));
      setTimeout(check, 2);
    };
    check();
  });
}

function fillForm(page, { url = 'https://discord.com/channels/1/2/3', emoji = '✅', label = 'Read this' } = {}) {
  page.document.getElementById('rc-url').value = url;
  const mode = page.document.getElementById('rc-mode');
  mode.value = 'specific';
  mode.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  page.document.getElementById('rc-emoji').value = emoji;
  page.document.getElementById('rc-label').value = label;
}

function close(page) { page.dom.window.close(); }

test('registers once, suppresses duplicate submit, and renders reacted/pending with unknown timestamps safely', async () => {
  let finishPost;
  const page = await createPage(req => {
    if (req.url === '/api/reaction-checks' && req.method === 'POST') return new Promise(resolve => { finishPost = resolve; });
    return defaultData(req.url);
  });
  const unsafeLabel = '<img src=x onerror="alert(1)">';
  fillForm(page, { label: unsafeLabel });
  page.document.getElementById('rc-submit').click();
  await waitFor(() => typeof finishPost === 'function', 'registration POST did not start');
  const form = page.document.getElementById('rc-fields');
  assert.equal(form.disabled, true);
  page.document.getElementById('rc-submit').click();
  assert.equal(page.requests.filter(req => req.url === '/api/reaction-checks' && req.method === 'POST').length, 1);
  const post = page.requests.find(req => req.url === '/api/reaction-checks' && req.method === 'POST');
  assert.deepEqual(post.body, { message_url: 'https://discord.com/channels/1/2/3', mode: 'specific', emoji: '✅', label: unsafeLabel });

  finishPost(response(report(10, {
    check: { label: unsafeLabel },
    reacted: [{ user_id: 'user-1', username: 'alice', display_name: '<img src=x>', reacted_at: null }],
    warning: '一部のメンバーを確認できませんでした。',
  })));
  await waitFor(() => page.document.getElementById('rc-detail-title').textContent === unsafeLabel, 'registration report did not render');
  await waitFor(() => !form.disabled, 'registration did not finish');
  assert.equal(page.document.querySelector('#rc-detail-title img'), null);
  assert.equal(page.document.querySelector('#rc-reacted img'), null);
  assert.equal(page.document.getElementById('rc-reacted').textContent.includes('<img src=x>'), true);
  assert.match(page.document.getElementById('rc-reacted').textContent, /日時不明/);
  assert.match(page.document.getElementById('rc-pending').textContent, /Bob/);
  assert.match(page.document.getElementById('rc-reacted-heading').textContent, /押した人 1人/);
  assert.match(page.document.getElementById('rc-pending-heading').textContent, /押していない人 1人/);
  assert.match(page.document.getElementById('rc-counts').textContent, /対象 2人/);
  assert.match(page.document.getElementById('rc-detail-feedback').textContent, /一部のメンバー/);
  await close(page);
});

test('any-emoji mode submits without emoji, hides emoji controls, and is labeled in list and detail', async () => {
  const anyCheck = { id: 30, guild_id: '1', channel_id: '2', message_id: '5', mode: 'any', label: 'Any reaction', emoji: null, synced_at: null };
  const anyReport = report(10, { check: { ...anyCheck }, reacted: [], pending: [], member_snapshot_at: null, synced_at: null });
  const page = await createPage(req => {
    if (req.url === '/api/reaction-checks' && req.method === 'GET') return response([anyCheck]);
    if (req.url === '/api/reaction-checks' && req.method === 'POST') return response(anyReport);
    if (req.url === '/api/reaction-checks/30' && req.method === 'GET') return response(anyReport);
    return defaultData(req.url);
  });
  const mode = page.document.getElementById('rc-mode');
  const emojiGroup = page.document.getElementById('rc-emoji-group');
  const emoji = page.document.getElementById('rc-emoji');
  assert.equal(mode.value, 'any');
  assert.equal(emojiGroup.hidden, true);
  assert.equal(emoji.disabled, true);

  fillForm(page, { label: 'Any reaction' });
  mode.value = 'any';
  mode.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  emoji.value = '';
  page.document.getElementById('rc-submit').click();
  await waitFor(() => page.requests.some(req => req.url === '/api/reaction-checks' && req.method === 'POST'), 'any-mode POST missing');
  const post = page.requests.find(req => req.url === '/api/reaction-checks' && req.method === 'POST');
  assert.deepEqual(post.body, { message_url: 'https://discord.com/channels/1/2/3', mode: 'any', label: 'Any reaction' });
  assert.equal(Object.hasOwn(post.body, 'emoji'), false);
  await waitFor(() => page.document.getElementById('rc-detail-title').textContent === 'Any reaction', 'any-mode report did not render');
  await waitFor(() => !page.document.getElementById('rc-fields').disabled, 'any-mode registration did not finish');
  assert.match(page.document.getElementById('rc-list').textContent, /どの絵文字でもOK/);
  page.document.querySelector('#rc-list button').click();
  await waitFor(() => page.document.getElementById('rc-detail-title').textContent === 'Any reaction', 'any-mode detail did not load');
  assert.match(page.document.getElementById('rc-sync-status').textContent, /どの絵文字でもOK/);
  await close(page);
});

test('specific mode reveals and requires emoji while preserving it when toggling modes', async () => {
  const page = await createPage(req => {
    if (req.url === '/api/reaction-checks' && req.method === 'POST') return response(report(10));
    return defaultData(req.url);
  });
  const mode = page.document.getElementById('rc-mode');
  const emoji = page.document.getElementById('rc-emoji');
  const group = page.document.getElementById('rc-emoji-group');
  assert.equal(mode.value, 'any');
  assert.equal(group.hidden, true);
  assert.equal(emoji.disabled, true);
  assert.equal(emoji.required, false);

  mode.value = 'specific';
  mode.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  assert.equal(group.hidden, false);
  assert.equal(emoji.disabled, false);
  assert.equal(emoji.required, true);
  assert.equal(emoji.value, '✅');
  emoji.value = '👀';
  mode.value = 'any';
  mode.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  assert.equal(group.hidden, true);
  assert.equal(emoji.disabled, true);
  assert.equal(emoji.value, '👀');
  mode.value = 'specific';
  mode.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  assert.equal(emoji.value, '👀');

  fillForm(page, { emoji: '' });
  page.document.getElementById('rc-submit').click();
  const feedback = page.document.getElementById('rc-feedback');
  await waitFor(() => feedback.classList.contains('error') && !feedback.hidden, 'empty specific emoji error missing');
  assert.match(feedback.textContent, /集計する絵文字を入力してください/);
  assert.equal(page.requests.some(req => req.url === '/api/reaction-checks' && req.method === 'POST'), false);

  emoji.value = '👀';
  page.document.getElementById('rc-submit').click();
  await waitFor(() => page.requests.some(req => req.url === '/api/reaction-checks' && req.method === 'POST'), 'specific-mode POST missing');
  assert.deepEqual(page.requests.find(req => req.url === '/api/reaction-checks' && req.method === 'POST').body,
    { message_url: 'https://discord.com/channels/1/2/3', mode: 'specific', emoji: '👀', label: 'Read this' });
  await waitFor(() => !page.document.getElementById('rc-fields').disabled, 'specific registration did not finish');
  await close(page);
});

test('checks without a mode field render as legacy specific-emoji checks', async () => {
  const { mode: _ignored, ...legacyCheck } = checks[0];
  const legacyReport = report(10, { check: legacyCheck });
  delete legacyReport.check.mode;
  const page = await createPage(req => {
    if (req.url === '/api/reaction-checks' && req.method === 'GET') return response([legacyCheck]);
    if (req.url === '/api/reaction-checks/10' && req.method === 'GET') return response(legacyReport);
    return defaultData(req.url);
  });
  assert.match(page.document.getElementById('rc-list').textContent, /指定した絵文字: ✅/);
  page.document.querySelector('#rc-list button').click();
  await waitFor(() => page.document.getElementById('rc-detail-title').textContent === 'Read chapter', 'legacy detail did not load');
  assert.match(page.document.getElementById('rc-sync-status').textContent, /指定した絵文字: ✅/);
  await close(page);
});

test('registration error keeps form inputs and can be retried', async () => {
  let postCount = 0;
  const page = await createPage(req => {
    if (req.url === '/api/reaction-checks' && req.method === 'POST' && postCount++ === 0) return response({ error: 'Discord is unavailable' }, 502);
    if (req.url === '/api/reaction-checks' && req.method === 'POST') return response(report(10));
    return defaultData(req.url);
  });
  fillForm(page, { url: 'https://discord.com/channels/1/2/3', emoji: '👀', label: 'Retry me' });
  page.document.getElementById('rc-submit').click();
  const feedback = page.document.getElementById('rc-feedback');
  await waitFor(() => feedback.classList.contains('error') && !feedback.hidden, 'registration error not displayed');
  await waitFor(() => !page.document.getElementById('rc-fields').disabled, 'failed registration did not finish');
  assert.equal(page.document.getElementById('rc-url').value, 'https://discord.com/channels/1/2/3');
  assert.equal(page.document.getElementById('rc-emoji').value, '👀');
  assert.equal(page.document.getElementById('rc-label').value, 'Retry me');
  page.document.getElementById('rc-submit').click();
  await waitFor(() => page.document.getElementById('rc-detail').hidden === false, 'retry did not show report');
  await waitFor(() => !page.document.getElementById('rc-fields').disabled, 'retry did not finish');
  assert.equal(postCount, 2);
  await close(page);
});

test('an unsynced report does not present unknown member counts as zero', async () => {
  const unsynced = report(20, { reacted: [], pending: [], synced_at: null, member_snapshot_at: null, warning: null });
  const page = await createPage(req => {
    if (req.url === '/api/reaction-checks/20' && req.method === 'GET') return response(unsynced);
    return defaultData(req.url);
  });
  page.document.querySelectorAll('#rc-list button')[1].click();
  await waitFor(() => page.document.getElementById('rc-detail-title').textContent === 'Second check', 'unsynced detail did not load');
  assert.equal(page.document.getElementById('rc-counts').hidden, true);
  assert.match(page.document.getElementById('rc-detail-feedback').textContent, /人数は未確定です/);
  assert.match(page.document.getElementById('rc-reacted').textContent, /未集計です/);
  assert.match(page.document.getElementById('rc-pending').textContent, /未集計です/);
  assert.match(page.document.getElementById('rc-sync-status').textContent, /未同期/);
  await close(page);
});

test('list fetch failure is shown and the reload button recovers', async () => {
  let listCount = 0;
  const page = await createPage(req => {
    if (req.url === '/api/reaction-checks' && req.method === 'GET' && listCount++ === 0) return response({ error: 'temporary failure' }, 502);
    return defaultData(req.url);
  });
  assert.match(page.document.getElementById('rc-list').textContent, /一覧を読み込めませんでした/);
  page.document.getElementById('rc-reload').click();
  await waitFor(() => page.document.getElementById('rc-list').querySelector('button'), 'list retry did not recover');
  assert.match(page.document.getElementById('rc-list').textContent, /Read chapter/);
  await close(page);
});

test('detail fetches the selected check and search filters both groups by name or user ID', async () => {
  const page = await createPage();
  page.document.querySelector('#rc-list button').click();
  await waitFor(() => page.document.getElementById('rc-detail-title').textContent === 'Read chapter', 'detail did not load');
  assert.equal(page.requests.some(req => req.url === '/api/reaction-checks/10' && req.method === 'GET'), true);
  const search = page.document.getElementById('rc-search');
  search.value = 'USER-2';
  search.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  assert.match(page.document.getElementById('rc-pending').textContent, /Bob/);
  assert.equal(page.document.getElementById('rc-reacted').textContent.includes('Alice'), false);
  assert.match(page.document.getElementById('rc-pending-heading').textContent, /表示 1人/);
  search.value = 'alice';
  search.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  assert.match(page.document.getElementById('rc-reacted').textContent, /Alice/);
  assert.equal(page.document.getElementById('rc-pending').textContent.includes('Bob'), false);
  await close(page);
});

test('a failed sync retains the old report; successful sync updates it and displays warnings', async () => {
  let syncCount = 0;
  const updated = report(10, {
    reacted: [{ user_id: 'user-3', username: 'carol', display_name: 'Carol', reacted_at: null }],
    pending: [], warning: '同期後の注意事項', synced_at: '2026-09-03T00:00:00.000Z',
  });
  const page = await createPage(req => {
    if (req.url === '/api/reaction-checks/10/sync' && req.method === 'POST' && syncCount++ === 0) return response({ error: 'sync failed' }, 502);
    if (req.url === '/api/reaction-checks/10/sync' && req.method === 'POST') return response(updated);
    return defaultData(req.url);
  });
  page.document.querySelector('#rc-list button').click();
  await waitFor(() => page.document.getElementById('rc-reacted').textContent.includes('Alice'), 'initial report did not load');
  page.document.getElementById('rc-sync').click();
  await waitFor(() => page.document.getElementById('rc-detail-feedback').classList.contains('error'), 'sync error not displayed');
  assert.match(page.document.getElementById('rc-reacted').textContent, /Alice/);
  assert.equal(page.document.getElementById('rc-reacted').textContent.includes('Carol'), false);
  assert.match(page.document.getElementById('rc-detail-feedback').textContent, /表示中の結果は更新前/);

  page.document.getElementById('rc-sync').click();
  await waitFor(() => page.document.getElementById('rc-reacted').textContent.includes('Carol'), 'successful sync did not replace results');
  assert.match(page.document.getElementById('rc-detail-feedback').textContent, /同期後の注意事項/);
  assert.match(page.document.getElementById('rc-pending-heading').textContent, /押していない人 0人/);
  await waitFor(() => !page.document.getElementById('rc-sync').disabled, 'sync did not finish');
  await close(page);
});

test('stale detail response cannot replace a more recently selected check', async () => {
  const deferred = new Map();
  const page = await createPage(req => {
    const match = req.url.match(/^\/api\/reaction-checks\/(\d+)$/);
    if (match && req.method === 'GET') return new Promise(resolve => deferred.set(Number(match[1]), resolve));
    return defaultData(req.url);
  });
  const buttons = page.document.querySelectorAll('#rc-list button');
  buttons[0].click();
  await waitFor(() => deferred.has(10), 'first detail request did not start');
  buttons[1].click();
  await waitFor(() => deferred.has(20), 'second detail request did not start');
  deferred.get(20)(response(report(20, { reacted: [], pending: [] })));
  await waitFor(() => page.document.getElementById('rc-detail-title').textContent === 'Second check', 'second detail did not render');
  deferred.get(10)(response(report(10)));
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(page.document.getElementById('rc-detail-title').textContent, 'Second check');
  assert.equal(page.document.getElementById('rc-reacted').textContent.includes('Alice'), false);
  await close(page);
});
