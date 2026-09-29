// Run with: $env:NODE_PATH="$env:TEMP/discord-role-ui-tests/node_modules"; node --test tests/role-button-ui.cjs
// Loads the real public HTML and scripts in jsdom; all API calls are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const publicDir = path.join(__dirname, '..', 'src', 'web', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const appScript = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
const roleScript = fs.readFileSync(path.join(publicDir, 'button-roles.js'), 'utf8');

const initialRoles = [{ id: 'role-1', name: 'Member' }, { id: 'role-2', name: 'Game <Fans>' }];
const initialChannels = [
  { id: 'channel-1', name: 'general', type: 0, isVoice: false },
  { id: 'channel-2', name: 'announcements', type: 5, isVoice: false },
  { id: 'category-1', name: 'category', type: 4, isVoice: false },
];
const savedRow = {
  id: 7, guild_id: '1', channel_id: 'channel-1', message_id: '2', role_id: 'role-1',
  label: 'Saved button', emoji: '🎮', message_content: 'Saved content',
};

function response(data, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => data };
}

function defaultData(url) {
  if (url === '/api/discord/roles') return response(initialRoles);
  if (url === '/api/discord/channels') return response(initialChannels);
  if (url === '/api/discord/emojis') return response([{ name: 'party', tag: '<:party:123456>', animated: false }]);
  if (url === '/api/reaction-roles') return response([savedRow]);
  if (url === '/api/status-roles') return response([]);
  if (url === '/api/voice-roles' || url === '/api/members' || url === '/api/snapshots') return response([]);
  if (url.startsWith('/api/leave-log') || url.startsWith('/api/bot-logs')) return response({ total: 0, rows: [] });
  return response({ message_url: 'https://discord.com/channels/1/2/3' });
}

async function createPage(responder = async req => defaultData(req.url), { waitForReady = true } = {}) {
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
  window.eval(appScript);
  window.eval(roleScript);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  if (waitForReady) await waitFor(() => !window.document.getElementById('rr-submit').disabled, 'role data did not load');
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

function chooseRequired(page, prefix = 'rr') {
  page.document.getElementById(`${prefix}-channel`).value = 'channel-1';
  page.document.getElementById(`${prefix}-role`).value = 'role-1';
}

function submit(page, prefix = 'rr') {
  page.document.getElementById(`${prefix}-submit`).click();
}

async function close(page) { page.dom.window.close(); }

test('submits all fields including custom emoji through the real form and keeps preview text safe', async () => {
  const page = await createPage();
  chooseRequired(page);
  page.document.getElementById('rr-label').value = 'A <script>bad()</script> button';
  page.document.getElementById('rr-content').value = '<img src=x onerror="bad()"> @everyone';
  page.document.getElementById('rr-emoji-select').value = '__unicode__';
  page.document.getElementById('rr-emoji-text').value = '<:party:123456>';
  page.document.getElementById('rr-content').dispatchEvent(new page.window.Event('input', { bubbles: true }));
  assert.equal(page.document.getElementById('rr-preview-content').textContent, '<img src=x onerror="bad()"> @everyone');
  assert.equal(page.document.getElementById('rr-preview-content').querySelector('img'), null);
  assert.match(page.document.getElementById('rr-preview-button').textContent, /:party:/);

  submit(page);
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles' && r.method === 'POST'), 'POST was not sent');
  const sent = page.requests.find(r => r.url === '/api/reaction-roles' && r.method === 'POST');
  assert.deepEqual(sent.body, {
    channel_id: 'channel-1', role_id: 'role-1', label: 'A <script>bad()</script> button',
    emoji: '<:party:123456>', message_content: '<img src=x onerror="bad()"> @everyone',
  });
  await waitFor(() => page.document.getElementById('rr-feedback').classList.contains('success'), 'success feedback missing');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'submit did not finish');
  await close(page);
});

test('emoji is optional and an empty emoji can be submitted', async () => {
  const page = await createPage();
  chooseRequired(page);
  submit(page);
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles' && r.method === 'POST'), 'POST was not sent');
  assert.equal(page.requests.find(r => r.url === '/api/reaction-roles' && r.method === 'POST').body.emoji, '');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'POST did not finish');
  await close(page);
});

test('missing required fields produce a persistent alert and do not post', async () => {
  const page = await createPage();
  submit(page);
  const feedback = page.document.getElementById('rr-feedback');
  await waitFor(() => feedback.getAttribute('role') === 'alert' && !feedback.hidden, 'required-field alert missing');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.match(feedback.textContent, /投稿先チャンネルを選択/);
  assert.equal(page.requests.some(r => r.url === '/api/reaction-roles' && r.method === 'POST'), false);
  await close(page);
});

test('pending publish disables the form and suppresses a second click', async () => {
  let finishPost;
  const page = await createPage(req => {
    if (req.url === '/api/reaction-roles' && req.method === 'POST') return new Promise(resolve => { finishPost = resolve; });
    return defaultData(req.url);
  });
  chooseRequired(page);
  submit(page);
  await waitFor(() => typeof finishPost === 'function', 'POST did not become pending');
  const button = page.document.getElementById('rr-submit');
  assert.equal(button.disabled, true);
  button.click();
  assert.equal(page.requests.filter(r => r.url === '/api/reaction-roles' && r.method === 'POST').length, 1);
  finishPost(response({ message_url: 'https://discord.com/channels/1/2/3' }));
  await waitFor(() => !button.disabled, 'pending POST did not finish');
  await close(page);
});

for (const failure of [
  ['HTTP 400', req => req.url === '/api/reaction-roles' && req.method === 'POST' ? response({ error: 'invalid role' }, 400) : null],
  ['HTTP 502', req => req.url === '/api/reaction-roles' && req.method === 'POST' ? response({ error: 'Discord unavailable' }, 502) : null],
  ['network', req => req.url === '/api/reaction-roles' && req.method === 'POST' ? Promise.reject(new TypeError('offline')) : null],
]) {
  test(`${failure[0]} keeps form values and error feedback until retry succeeds`, async () => {
    let failed = false;
    const page = await createPage(async req => {
      if (req.url === '/api/reaction-roles' && req.method === 'POST' && !failed) {
        failed = true;
        const result = failure[1](req);
        return result || defaultData(req.url);
      }
      return defaultData(req.url);
    });
    chooseRequired(page);
    page.document.getElementById('rr-label').value = 'Keep me';
    page.document.getElementById('rr-content').value = 'Keep this message';
    submit(page);
    const feedback = page.document.getElementById('rr-feedback');
    await waitFor(() => feedback.getAttribute('role') === 'alert' && !feedback.hidden, 'error feedback missing');
    assert.equal(page.document.getElementById('rr-channel').value, 'channel-1');
    assert.equal(page.document.getElementById('rr-role').value, 'role-1');
    assert.equal(page.document.getElementById('rr-label').value, 'Keep me');
    assert.equal(page.document.getElementById('rr-content').value, 'Keep this message');
    const errorText = feedback.textContent;
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(feedback.textContent, errorText);

    await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'failed request did not finish');
    submit(page);
    await waitFor(() => feedback.classList.contains('success'), 'retry did not succeed');
    assert.equal(page.document.getElementById('rr-label').value, '');
    assert.equal(page.document.getElementById('rr-content').value, '');
    await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'retry did not finish');
    await close(page);
  });
}

test('list edit reuses the composer PUT; publish and delete use their intended routes', async () => {
  const page = await createPage();
  const list = page.document.getElementById('reaction-roles-list');
  list.querySelector('button[data-action="edit"]').click();
  assert.equal(page.document.getElementById('rr-label').value, 'Saved button');
  assert.equal(page.document.getElementById('rr-content').value, 'Saved content');
  page.document.getElementById('rr-label').value = 'Changed label';
  submit(page);
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles/7' && r.method === 'PUT'), 'edit did not PUT');
  const put = page.requests.find(r => r.url === '/api/reaction-roles/7' && r.method === 'PUT');
  assert.equal(put.body.label, 'Changed label');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'edit submit did not finish');

  list.querySelector('button[data-action="publish"]').click();
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles/7/publish' && r.method === 'POST'), 'republish route missing');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'republish did not finish');
  list.querySelector('button[data-action="delete"]').click();
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles/7' && r.method === 'DELETE'), 'delete route missing');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'delete did not finish');
  await close(page);
});

test('failed Discord data load can be retried, and emoji API failure does not block posting', async () => {
  let roleAttempts = 0;
  const page = await createPage(async req => {
    if (req.url === '/api/discord/roles' && roleAttempts++ === 0) return response({ error: 'not ready' }, 502);
    if (req.url === '/api/discord/emojis') return response({ error: 'emoji endpoint down' }, 502);
    return defaultData(req.url);
  }, { waitForReady: false });
  await waitFor(() => page.document.getElementById('rr-data-status').textContent.includes('読み込めませんでした'), 'load failure was not shown');
  assert.equal(page.document.getElementById('rr-submit').disabled, true);
  page.document.querySelector('button[onclick="loadDiscordData()"]').click();
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'retry did not recover role data');
  chooseRequired(page);
  submit(page);
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles' && r.method === 'POST'), 'emoji endpoint failure blocked post');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'POST did not finish');
  await close(page);
});

test('category channels are excluded from post destinations', async () => {
  const page = await createPage();
  const options = [...page.document.getElementById('rr-channel').options].map(option => option.value);
  assert.equal(options.includes('channel-1'), true);
  assert.equal(options.includes('channel-2'), true);
  assert.equal(options.includes('category-1'), false);
  await close(page);
});
