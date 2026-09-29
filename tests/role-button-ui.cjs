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

function editorId(index, prefix = 'rr') { return index === 0 ? prefix : `${prefix}-button-${index}`; }

function setButton(page, index, { role = 'role-1', label = '', emoji = '' } = {}, prefix = 'rr') {
  const id = editorId(index, prefix);
  page.document.getElementById(`${id}-role`).value = role;
  page.document.getElementById(`${id}-label`).value = label;
  const select = page.document.getElementById(`${id}-emoji-select`);
  const text = page.document.getElementById(`${id}-emoji-text`);
  if (emoji) { select.value = '__unicode__'; text.value = emoji; }
  else { select.value = emoji; text.value = ''; }
  page.document.getElementById(`${id}-label`).dispatchEvent(new page.window.Event('input', { bubbles: true }));
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
  assert.match(page.document.querySelector('#rr-preview-buttons .discord-button').textContent, /:party:/);

  submit(page);
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles' && r.method === 'POST'), 'POST was not sent');
  const sent = page.requests.find(r => r.url === '/api/reaction-roles' && r.method === 'POST');
  assert.deepEqual(sent.body, {
    channel_id: 'channel-1',
    buttons: [{ role_id: 'role-1', label: 'A <script>bad()</script> button', emoji: '<:party:123456>' }],
    message_content: '<img src=x onerror="bad()"> @everyone',
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
  assert.deepEqual(page.requests.find(r => r.url === '/api/reaction-roles' && r.method === 'POST').body.buttons,
    [{ role_id: 'role-1', label: null, emoji: '' }]);
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'POST did not finish');
  await close(page);
});

test('adds, reorders, removes, previews, and submits multiple buttons in one POST', async () => {
  const page = await createPage();
  chooseRequired(page);
  setButton(page, 0, { role: 'role-1', label: 'First' });
  page.document.getElementById('rr-add-button').click();
  page.document.getElementById('rr-add-button').click();
  assert.equal(page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length, 3);
  setButton(page, 1, { role: 'role-2', label: 'Second' });
  setButton(page, 2, { role: 'role-1', label: 'Third' });

  page.document.querySelector('#rr-button-editors [data-index="0"][data-button-action="down"]').click();
  assert.equal(page.document.getElementById('rr-button-1-role').value, 'role-1');
  assert.equal(page.document.getElementById('rr-button-1-label').value, 'First');
  page.document.querySelector('#rr-button-editors [data-index="2"][data-button-action="remove"]').click();
  assert.equal(page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length, 2);
  assert.equal(page.document.getElementById('rr-role').value, 'role-2');
  assert.equal(page.document.getElementById('rr-button-1-role').value, 'role-1');
  assert.deepEqual([...page.document.querySelectorAll('#rr-preview-buttons .discord-button')].map(button => button.textContent), ['Second', 'First']);

  submit(page);
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles' && r.method === 'POST'), 'multi-button POST missing');
  const posts = page.requests.filter(r => r.url === '/api/reaction-roles' && r.method === 'POST');
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body.buttons, [
    { role_id: 'role-2', label: 'Second', emoji: '' },
    { role_id: 'role-1', label: 'First', emoji: '' },
  ]);
  assert.equal(posts[0].body.channel_id, 'channel-1');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'multi-button POST did not finish');
  await close(page);
});

test('allows at most 25 button editors and preview wraps six buttons into two rows', async () => {
  const page = await createPage();
  assert.equal(page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length, 1);
  for (let index = 1; index < 25; index++) page.document.getElementById('rr-add-button').click();
  assert.equal(page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length, 25);
  assert.equal(page.document.getElementById('rr-add-button').disabled, true);
  page.document.getElementById('rr-add-button').click();
  assert.equal(page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length, 25);

  while (page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length > 6) {
    const last = page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length - 1;
    page.document.querySelector(`#rr-button-editors [data-index="${last}"][data-button-action="remove"]`).click();
  }
  for (let index = 0; index < 6; index++) setButton(page, index, { role: index % 2 ? 'role-2' : 'role-1', label: `Button ${index + 1}` });
  assert.equal(page.document.querySelectorAll('#rr-preview-buttons .discord-button-row').length, 2);
  assert.equal(page.document.querySelectorAll('#rr-preview-buttons .discord-button').length, 6);
  await close(page);
});

test('cannot add editors before Discord role/channel data is ready', async () => {
  let finishRoles;
  const page = await createPage(req => {
    if (req.url === '/api/discord/roles') return new Promise(resolve => { finishRoles = resolve; });
    return defaultData(req.url);
  }, { waitForReady: false });
  await waitFor(() => typeof finishRoles === 'function', 'role data fetch did not start');
  assert.equal(page.document.getElementById('rr-fields').disabled, true);
  page.document.getElementById('rr-add-button').click();
  assert.equal(page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length, 1);
  finishRoles(response(initialRoles));
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'role data did not become ready');
  page.document.getElementById('rr-add-button').click();
  assert.equal(page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length, 2);
  await close(page);
});

test('rejects duplicate roles before posting', async () => {
  const page = await createPage();
  chooseRequired(page);
  page.document.getElementById('rr-add-button').click();
  setButton(page, 1, { role: 'role-1', label: 'Duplicate' });
  submit(page);
  const feedback = page.document.getElementById('rr-feedback');
  await waitFor(() => feedback.getAttribute('role') === 'alert' && !feedback.hidden, 'duplicate-role alert missing');
  assert.match(feedback.textContent, /ロールが重複しています/);
  assert.equal(page.requests.some(r => r.url === '/api/reaction-roles' && r.method === 'POST'), false);
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

test('failed multi-button submission preserves every editor value for retry', async () => {
  let failed = false;
  const page = await createPage(req => {
    if (req.url === '/api/reaction-roles' && req.method === 'POST' && !failed) {
      failed = true;
      return response({ error: 'Discord unavailable' }, 502);
    }
    return defaultData(req.url);
  });
  chooseRequired(page);
  setButton(page, 0, { role: 'role-1', label: 'Primary' });
  page.document.getElementById('rr-add-button').click();
  setButton(page, 1, { role: 'role-2', label: 'Secondary', emoji: '🎮' });
  submit(page);
  const feedback = page.document.getElementById('rr-feedback');
  await waitFor(() => feedback.getAttribute('role') === 'alert', 'multi-button error not shown');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'failed multi-button submit did not finish');
  assert.equal(page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length, 2);
  assert.deepEqual([0, 1].map(index => page.document.getElementById(`${editorId(index)}-role`).value), ['role-1', 'role-2']);
  assert.deepEqual([0, 1].map(index => page.document.getElementById(`${editorId(index)}-label`).value), ['Primary', 'Secondary']);
  assert.equal(page.document.getElementById('rr-button-1-emoji-text').value, '🎮');
  submit(page);
  await waitFor(() => page.document.getElementById('rr-feedback').classList.contains('success'), 'retry did not succeed');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'retry did not finish');
  await close(page);
});

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
  assert.equal(put.body.buttons[0].label, 'Changed label');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'edit submit did not finish');

  list.querySelector('button[data-action="publish"]').click();
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles/7/publish' && r.method === 'POST'), 'republish route missing');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'republish did not finish');
  list.querySelector('button[data-action="delete"]').click();
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles/7' && r.method === 'DELETE'), 'delete route missing');
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'delete did not finish');
  await close(page);
});

test('editing a saved multi-button post restores every button and sends the collection on PUT', async () => {
  const buttons = [
    { role_id: 'role-1', label: 'First saved', emoji: '🎮' },
    { role_id: 'role-2', label: 'Second saved', emoji: '<:party:123456>' },
  ];
  const page = await createPage(req => {
    if (req.url === '/api/reaction-roles' && req.method === 'GET') return response([{ ...savedRow, buttons }]);
    return defaultData(req.url);
  });
  page.document.querySelector('#reaction-roles-list button[data-action="edit"]').click();
  assert.equal(page.document.querySelectorAll('#rr-button-editors [data-button-editor]').length, 2);
  assert.deepEqual([0, 1].map(index => page.document.getElementById(`${editorId(index)}-role`).value), ['role-1', 'role-2']);
  assert.deepEqual([0, 1].map(index => page.document.getElementById(`${editorId(index)}-label`).value), ['First saved', 'Second saved']);
  assert.deepEqual([0, 1].map(index => page.document.getElementById(`${editorId(index)}-emoji-text`).value), ['🎮', '']);
  assert.equal(page.document.getElementById('rr-button-1-emoji-select').value, '<:party:123456>');

  page.document.getElementById('rr-button-1-label').value = 'Second changed';
  submit(page);
  await waitFor(() => page.requests.some(r => r.url === '/api/reaction-roles/7' && r.method === 'PUT'), 'multi-button edit did not PUT');
  const put = page.requests.find(r => r.url === '/api/reaction-roles/7' && r.method === 'PUT');
  assert.deepEqual(put.body.buttons, [
    { role_id: 'role-1', label: 'First saved', emoji: '🎮' },
    { role_id: 'role-2', label: 'Second changed', emoji: '<:party:123456>' },
  ]);
  await waitFor(() => !page.document.getElementById('rr-submit').disabled, 'multi-button PUT did not finish');
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
