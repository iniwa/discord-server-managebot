// Button composers share one flow: configure, preview, publish, then inspect the result.
const buttonRoleState = {
  rr: { kind: 'reaction', rows: [], editId: null, busy: false },
  sr: { kind: 'status', rows: [], editId: null, busy: false },
};
let roleDataReady = false;

function setupRoleComposers() {
  for (const prefix of Object.keys(buttonRoleState)) {
    const form = document.getElementById(`${prefix}-form`);
    form.addEventListener('submit', event => { event.preventDefault(); submitRoleButton(prefix); });
    form.addEventListener('input', () => updateRolePreview(prefix));
    form.addEventListener('change', () => updateRolePreview(prefix));
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

function updateRolePreview(prefix) {
  const channel = document.getElementById(`${prefix}-channel`).value;
  const role = document.getElementById(`${prefix}-role`).value;
  const label = document.getElementById(`${prefix}-label`).value.trim();
  document.getElementById(`${prefix}-preview-channel`).textContent = channel ? `# ${channelName(channel)}` : '# 投稿先を選択してください';
  document.getElementById(`${prefix}-preview-content`).textContent = document.getElementById(`${prefix}-content`).value.trim() || roleDefaultContent(prefix);
  const button = document.getElementById(`${prefix}-preview-button`);
  button.replaceChildren();
  const emoji = getEmojiValue(prefix);
  // Custom emoji names remain readable without loading Discord assets in the manager.
  const custom = /^<a?:([^:]+):\d+>$/.exec(emoji);
  button.textContent = (emoji ? `${custom ? ':' + custom[1] + ':' : emoji} ` : '') + (label || (role ? roleName(role) : 'ロールを選択してください'));
}

function resetRoleComposer(prefix) {
  const state = buttonRoleState[prefix];
  state.editId = null;
  document.getElementById(`${prefix}-form`).reset();
  onEmojiSelectChange(prefix);
  document.getElementById(`${prefix}-heading`).textContent = '新しいボタンを作成';
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
  document.getElementById(`${prefix}-role`).value = row.role_id;
  document.getElementById(`${prefix}-label`).value = row.label || '';
  document.getElementById(`${prefix}-content`).value = row.message_content || '';
  setEmojiValue(prefix, row.emoji);
  document.getElementById(`${prefix}-heading`).textContent = 'ボタンの設定を編集';
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
    const role_id = document.getElementById(`${prefix}-role`).value;
    if (!channel_id || !role_id) {
      document.getElementById(`${prefix}-${!channel_id ? 'channel' : 'role'}`).focus();
      throw new Error(!channel_id ? '投稿先チャンネルを選択してください。' : '付与するロールを選択してください。');
    }
    const label = document.getElementById(`${prefix}-label`).value.trim();
    const message_content = document.getElementById(`${prefix}-content`).value.trim();
    if (label.length > 80 || message_content.length > 2000) throw new Error('ボタン名は80文字以内、投稿メッセージは2000文字以内にしてください。');
    const emoji = getEmojiValue(prefix);
    setRoleBusy(prefix, true);
    roleFeedback(prefix, 'Discordへ投稿しています。この画面を開いたままお待ちください。');
    const result = await api(`/api/${state.kind}-roles${state.editId ? '/' + state.editId : ''}`, state.editId ? 'PUT' : 'POST', { channel_id, role_id, label: label || null, emoji, message_content: message_content || null });
    resetRoleComposer(prefix);
    roleFeedback(prefix, `# ${channelName(channel_id)} にボタンを投稿しました。`, 'success', result.message_url);
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
      const title = document.createElement('h3'); title.textContent = row.label || roleName(row.role_id);
      const description = document.createElement('p'); description.textContent = `# ${channelName(row.channel_id)} → ${roleName(row.role_id)}`;
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
