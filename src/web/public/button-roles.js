// Button composers share one flow: configure, preview, publish, then inspect the result.
const buttonRoleState = {
  rr: { kind: 'reaction', rows: [], editId: null, busy: false },
  sr: { kind: 'status', rows: [], editId: null, busy: false },
};
let roleDataReady = false;

function setupRoleComposers() {
  for (const prefix of Object.keys(buttonRoleState)) {
    renderRoleEditors(prefix, [{}]);
    const form = document.getElementById(`${prefix}-form`);
    form.addEventListener('submit', event => { event.preventDefault(); submitRoleButton(prefix); });
    form.addEventListener('input', () => updateRolePreview(prefix));
    form.addEventListener('change', () => updateRolePreview(prefix));
    document.getElementById(`${prefix}-add-button`).addEventListener('click', () => {
      const buttons = readRoleButtons(prefix);
      if (buttons.length >= 25 || buttonRoleState[prefix].busy) return;
      buttons.push({}); renderRoleEditors(prefix, buttons); updateRolePreview(prefix);
    });
    document.getElementById(`${prefix}-button-editors`).addEventListener('click', event => {
      const button = event.target.closest('[data-button-action]');
      if (!button || buttonRoleState[prefix].busy) return;
      const buttons = readRoleButtons(prefix), index = Number(button.dataset.index);
      const action = button.dataset.buttonAction;
      if (action === 'remove' && buttons.length > 1) buttons.splice(index, 1);
      if (action === 'up' && index > 0) [buttons[index - 1], buttons[index]] = [buttons[index], buttons[index - 1]];
      if (action === 'down' && index < buttons.length - 1) [buttons[index + 1], buttons[index]] = [buttons[index], buttons[index + 1]];
      renderRoleEditors(prefix, buttons); updateRolePreview(prefix);
    });
    document.getElementById(`${prefix}-cancel`).addEventListener('click', () => resetRoleComposer(prefix));
    const list = document.getElementById(`${buttonRoleState[prefix].kind}-roles-list`);
    list.addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button || buttonRoleState[prefix].busy) return;
      const row = buttonRoleState[prefix].rows.find(r => r.id === Number(button.dataset.id));
      if (!row) return;
      if (button.dataset.action === 'edit') editRoleButton(prefix, row);
      else runRoleAction(prefix, row, button.dataset.action);
    });
    updateRolePreview(prefix);
  }
}

function setRoleDataState(ready, message) {
  roleDataReady = ready;
  for (const prefix of Object.keys(buttonRoleState)) {
    renderRoleEditors(prefix, readRoleButtons(prefix));
    const status = document.getElementById(`${prefix}-data-status`);
    status.textContent = message;
    status.hidden = !message;
    status.className = `role-feedback ${ready ? '' : 'notice'}`;
    setRoleBusy(prefix, buttonRoleState[prefix].busy);
    updateRolePreview(prefix);
  }
}

function setRoleBusy(prefix, busy) {
  const state = buttonRoleState[prefix];
  state.busy = busy;
  document.getElementById(`${prefix}-fields`).disabled = busy || !roleDataReady;
  const submit = document.getElementById(`${prefix}-submit`);
  submit.disabled = busy || !roleDataReady;
  submit.textContent = busy ? '処理中…' : state.editId ? '変更を保存して投稿し直す' : 'Discordに投稿する';
  document.getElementById(`${prefix}-cancel`).disabled = busy;
  document.querySelectorAll(`#${state.kind}-roles-list button[data-action]`).forEach(button => { button.disabled = busy; });
}

function roleFeedback(prefix, message, type = 'notice', url) {
  const target = document.getElementById(`${prefix}-feedback`);
  target.replaceChildren();
  target.hidden = false;
  target.className = `role-feedback ${type}`;
  target.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const text = document.createElement('p');
  text.textContent = message;
  target.appendChild(text);
  if (url && /^https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+$/.test(url)) {
    const link = document.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = 'Discordの投稿を開く ↗';
    target.appendChild(link);
  }
}

function roleDefaultContent(prefix) {
  return prefix === 'sr'
    ? 'ボタンでステータスロールを切り替えます。付与はVC参加中のみ可能で、VC退出時に自動解除されます。操作結果はあなただけに表示されます。'
    : 'ボタンでロールの付与・解除を切り替えます。操作結果はあなただけに表示されます。';
}

function roleButtonsOf(row) {
  return row.buttons?.length ? row.buttons : [{ role_id: row.role_id, label: row.label, emoji: row.emoji }];
}

function readRoleButtons(prefix) {
  return Array.from(document.querySelectorAll(`#${prefix}-button-editors [data-button-editor]`)).map(editor => ({
    role_id: editor.querySelector('[data-field="role"]').value,
    label: editor.querySelector('[data-field="label"]').value,
    emoji: editor.querySelector('[data-field="emoji-select"]').value === '__unicode__'
      ? editor.querySelector('[data-field="emoji-text"]').value
      : editor.querySelector('[data-field="emoji-select"]').value,
  }));
}

function renderRoleEditors(prefix, buttons) {
  const container = document.getElementById(`${prefix}-button-editors`);
  container.replaceChildren();
  (buttons.length ? buttons : [{}]).forEach((button, index) => {
    const id = index === 0 ? prefix : `${prefix}-button-${index}`;
    const editor = document.createElement('div'); editor.className = 'button-editor'; editor.dataset.buttonEditor = '';
    // Only generated indices enter this template. User values are assigned as properties below.
    editor.innerHTML = `<div class="button-editor-heading"><h4>ボタン ${index + 1}</h4><div class="role-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-button-action="up" data-index="${index}" aria-label="ボタン${index + 1}を上へ">↑</button>
      <button type="button" class="btn btn-ghost btn-sm" data-button-action="down" data-index="${index}" aria-label="ボタン${index + 1}を下へ">↓</button>
      <button type="button" class="btn btn-ghost btn-sm" data-button-action="remove" data-index="${index}">削除</button></div></div>
      <div class="form-group"><label for="${id}-role">付与するロール <span class="required">必須</span></label><select id="${id}-role" data-field="role" required><option value="">ロールを選択</option></select></div>
      <div class="form-group"><label for="${id}-label">ボタン名 <span>任意</span></label><input type="text" id="${id}-label" data-field="label" maxlength="80" placeholder="空欄ならロール名" /></div>
      <div class="form-group"><label for="${id}-emoji-select">絵文字 <span>任意</span></label><select id="${id}-emoji-select" data-field="emoji-select"><option value="">絵文字なし</option><option value="__unicode__">絵文字を入力する</option></select><input type="text" id="${id}-emoji-text" data-field="emoji-text" aria-label="ボタン${index + 1}の絵文字" placeholder="例: 🎮" style="display:none;" /></div>`;
    container.appendChild(editor);
    populateRoleSelect(`${id}-role`); populateEmojiSelect(`${id}-emoji-select`);
    const roleSelect = document.getElementById(`${id}-role`);
    if (button.role_id && !Array.from(roleSelect.options).some(option => option.value === button.role_id)) {
      const option = document.createElement('option'); option.value = button.role_id; option.textContent = '現在取得できないロール'; roleSelect.appendChild(option);
    }
    roleSelect.value = button.role_id || '';
    document.getElementById(`${id}-label`).value = button.label || '';
    setEmojiValue(id, button.emoji || '');
    document.getElementById(`${id}-emoji-select`).addEventListener('change', () => onEmojiSelectChange(id));
    editor.querySelector('[data-button-action="up"]').disabled = index === 0;
    editor.querySelector('[data-button-action="down"]').disabled = index === buttons.length - 1;
    editor.querySelector('[data-button-action="remove"]').disabled = buttons.length <= 1;
  });
  const add = document.getElementById(`${prefix}-add-button`);
  add.disabled = buttons.length >= 25;
  add.textContent = `＋ ボタンを追加（${Math.max(1, buttons.length)} / 25）`;
}

function updateRolePreview(prefix) {
  const channel = document.getElementById(`${prefix}-channel`).value;
  document.getElementById(`${prefix}-preview-channel`).textContent = channel ? `# ${channelName(channel)}` : '# 投稿先を選択してください';
  document.getElementById(`${prefix}-preview-content`).textContent = document.getElementById(`${prefix}-content`).value.trim() || roleDefaultContent(prefix);
  const container = document.getElementById(`${prefix}-preview-buttons`); container.replaceChildren();
  let row;
  readRoleButtons(prefix).forEach((button, index) => {
    if (index % 5 === 0) { row = document.createElement('div'); row.className = 'discord-button-row'; container.appendChild(row); }
    const element = document.createElement('span'); element.className = 'discord-button';
    const emoji = button.emoji.trim(), custom = /^<a?:([^:]+):\d+>$/.exec(emoji);
    element.textContent = (emoji ? `${custom ? ':' + custom[1] + ':' : emoji} ` : '') + (button.label.trim() || (button.role_id ? roleName(button.role_id) : 'ロールを選択してください')).slice(0, 80);
    row.appendChild(element);
  });
}

function resetRoleComposer(prefix) {
  const state = buttonRoleState[prefix];
  state.editId = null;
  document.getElementById(`${prefix}-form`).reset();
  renderRoleEditors(prefix, [{}]);
  document.getElementById(`${prefix}-heading`).textContent = '新しい投稿を作成';
  document.getElementById(`${prefix}-cancel`).hidden = true;
  document.getElementById(`${prefix}-edit-note`).hidden = true;
  document.getElementById(`${prefix}-feedback`).hidden = true;
  setRoleBusy(prefix, false);
  updateRolePreview(prefix);
}

function editRoleButton(prefix, row) {
  const state = buttonRoleState[prefix];
  state.editId = row.id;
  document.getElementById(`${prefix}-channel`).value = row.channel_id;
  renderRoleEditors(prefix, roleButtonsOf(row));
  document.getElementById(`${prefix}-content`).value = row.message_content || '';
  document.getElementById(`${prefix}-heading`).textContent = '投稿とボタンを編集';
  document.getElementById(`${prefix}-cancel`).hidden = false;
  document.getElementById(`${prefix}-edit-note`).hidden = false;
  document.getElementById(`${prefix}-feedback`).hidden = true;
  setRoleBusy(prefix, false);
  updateRolePreview(prefix);
  document.getElementById(`${prefix}-form`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById(`${prefix}-channel`).focus({ preventScroll: true });
}

async function submitRoleButton(prefix) {
  const state = buttonRoleState[prefix];
  if (state.busy) return;
  try {
    if (!roleDataReady) throw new Error('選択肢を読み込んでから投稿してください。');
    const channel_id = document.getElementById(`${prefix}-channel`).value;
    if (!channel_id) {
      document.getElementById(`${prefix}-channel`).focus();
      throw new Error('投稿先チャンネルを選択してください。');
    }
    const buttons = readRoleButtons(prefix).map(button => ({ role_id: button.role_id, label: button.label.trim() || null, emoji: button.emoji.trim() }));
    if (!buttons.length || buttons.length > 25) throw new Error('ボタンは1〜25個で設定してください。');
    const selected = new Set();
    for (const [index, button] of buttons.entries()) {
      if (!button.role_id || selected.has(button.role_id)) {
        document.getElementById(index === 0 ? `${prefix}-role` : `${prefix}-button-${index}-role`).focus();
        throw new Error(!button.role_id ? `ボタン${index + 1}のロールを選択してください。` : `ボタン${index + 1}のロールが重複しています。別のロールを選択してください。`);
      }
      if ((button.label?.length || 0) > 80) throw new Error(`ボタン${index + 1}の名前は80文字以内にしてください。`);
      selected.add(button.role_id);
    }
    const message_content = document.getElementById(`${prefix}-content`).value.trim();
    if (message_content.length > 2000) throw new Error('投稿メッセージは2000文字以内にしてください。');
    setRoleBusy(prefix, true);
    roleFeedback(prefix, 'Discordへ投稿しています。この画面を開いたままお待ちください。');
    const result = await api(`/api/${state.kind}-roles${state.editId ? '/' + state.editId : ''}`, state.editId ? 'PUT' : 'POST', { channel_id, buttons, message_content: message_content || null });
    resetRoleComposer(prefix);
    roleFeedback(prefix, `# ${channelName(channel_id)} に${buttons.length}個のボタンをまとめて投稿しました。`, 'success', result.message_url);
    await loadRoleButtons(prefix);
  } catch (error) {
    roleFeedback(prefix, error.message || String(error), 'error');
    // A failed edit can still have saved values; refreshing the list is read-only.
    if (state.busy) await loadRoleButtons(prefix);
  } finally { setRoleBusy(prefix, false); }
}

async function loadRoleButtons(prefix) {
  const state = buttonRoleState[prefix];
  const list = document.getElementById(`${state.kind}-roles-list`);
  try {
    state.rows = await api(`/api/${state.kind}-roles`);
    list.replaceChildren();
    if (!state.rows.length) {
      list.textContent = '設定はまだありません。上のフォームから最初のボタンを投稿してください。';
      return;
    }
    for (const row of state.rows) {
      const card = document.createElement('article'); card.className = 'role-config';
      const buttons = roleButtonsOf(row);
      const title = document.createElement('h3'); title.textContent = `${buttons.length}個のボタン · # ${channelName(row.channel_id)}`;
      const description = document.createElement('p'); description.textContent = buttons.map(button => button.label || roleName(button.role_id)).join(" / ");
      const content = document.createElement('p'); content.className = 'role-saved-content'; content.textContent = row.message_content || roleDefaultContent(prefix);
      card.append(title, description, content);
      const actions = document.createElement('div'); actions.className = 'role-actions';
      if (/^\d+$/.test(row.guild_id) && /^\d+$/.test(row.channel_id) && /^\d+$/.test(row.message_id)) {
        const link = document.createElement('a'); link.className = 'btn btn-ghost btn-sm';
        link.href = `https://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}`;
        link.textContent = '元の投稿を開く ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer'; actions.appendChild(link);
      } else {
        const note = document.createElement('span'); note.className = 'badge'; note.textContent = '投稿が必要です'; actions.appendChild(note);
      }
      for (const [action, text] of [['edit', '編集'], ['publish', 'ボタンを投稿し直す'], ['delete', '設定を削除']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-ghost btn-sm';
        button.dataset.action = action; button.dataset.id = row.id; button.textContent = text; button.disabled = state.busy; actions.appendChild(button);
      }
      card.appendChild(actions); list.appendChild(card);
    }
  } catch (error) {
    list.textContent = '一覧を読み込めませんでした。「一覧を更新」で再試行してください。' + (error.message || error);
  }
}

async function runRoleAction(prefix, row, action) {
  const state = buttonRoleState[prefix];
  const message = action === 'delete' ? '設定を削除するとボタンは使えなくなります。Discordの投稿は残ります。削除しますか？' : '新しいボタンを投稿します。以前のボタンは無効になります。続けますか？';
  if (!confirm(message)) return;
  setRoleBusy(prefix, true);
  roleFeedback(prefix, '処理しています…');
  document.getElementById(`${prefix}-feedback`).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const result = await api(`/api/${state.kind}-roles/${row.id}${action === 'publish' ? '/publish' : ''}`, action === 'delete' ? 'DELETE' : 'POST');
    if (action === 'delete' && state.editId === row.id) resetRoleComposer(prefix);
    roleFeedback(prefix, action === 'delete' ? '設定を削除しました。Discordの投稿は残っています。' : '新しいボタンを投稿しました。', 'success', result?.message_url);
    await loadRoleButtons(prefix);
  } catch (error) { roleFeedback(prefix, error.message || String(error), 'error'); }
  finally { setRoleBusy(prefix, false); }
}

function loadReactionRoles() { return loadRoleButtons('rr'); }
function loadStatusRoles() { return loadRoleButtons('sr'); }
