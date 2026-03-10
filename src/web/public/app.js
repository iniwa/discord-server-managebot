// ── State ──────────────────────────────────────────────────────────────────
let rolesCache = [];
let channelsCache = [];
let emojisCache = [];
let leaveLogPage = 1;
let botLogPage = 1;
let memberSortKey = 'display_name';
let memberSortDir = 'asc';

// モーダル編集対象
let editMode = null; // 'rr' | 'vr'
let editId = null;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await loadDiscordData();
  await Promise.all([
    loadSnapshots(),
    loadReactionRoles(),
    loadVoiceRoles(),
    loadMembers(),
    loadLeaveLog(),
    loadBotLogs(),
  ]);
});

// ── Tabs ───────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ── Discord Data ─────────────────────────────────────────────────────────
async function loadDiscordData() {
  try {
    const [roles, channels, emojis] = await Promise.all([
      api('/api/discord/roles'),
      api('/api/discord/channels'),
      api('/api/discord/emojis'),
    ]);
    rolesCache = roles;
    channelsCache = channels;
    emojisCache = emojis;
    populateAllSelects();
  } catch (e) {
    console.warn('Discord data not available yet:', e);
  }
}

function populateAllSelects() {
  populateRoleSelect('rr-role');
  populateRoleSelect('vr-role');
  populateRoleSelect('member-filter-role');
  populateRoleSelect('modal-rr-role');
  populateRoleSelect('modal-vr-role');

  populateChannelSelect('rr-channel', false);    // テキスト含む全チャンネル
  populateChannelSelect('vr-channel', true);      // VCのみ
  populateChannelSelect('modal-rr-channel', false);
  populateChannelSelect('modal-vr-channel', true);

  populateEmojiSelect('rr-emoji-select');
  populateEmojiSelect('modal-rr-emoji-select');
}

function populateRoleSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const first = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(first);
  rolesCache.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name;
    sel.appendChild(opt);
  });
}

function populateChannelSelect(id, voiceOnly) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const first = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(first);
  const list = voiceOnly ? channelsCache.filter(c => c.isVoice) : channelsCache;
  list.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = (c.isVoice ? '🔊 ' : '# ') + c.name;
    sel.appendChild(opt);
  });
}

function populateEmojiSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  // Keep first two options (placeholder + unicode)
  while (sel.options.length > 2) sel.remove(2);
  emojisCache.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.tag;
    opt.textContent = (e.animated ? '[GIF] ' : '') + e.name;
    sel.appendChild(opt);
  });
}

function onEmojiSelectChange(prefix) {
  const sel = document.getElementById(prefix + '-emoji-select');
  const txt = document.getElementById(prefix + '-emoji-text');
  txt.style.display = sel.value === '__unicode__' ? 'block' : 'none';
  if (sel.value !== '__unicode__') txt.value = '';
}

/** 絵文字セレクタから最終的な絵文字文字列を取得 */
function getEmojiValue(prefix) {
  const sel = document.getElementById(prefix + '-emoji-select');
  if (sel.value === '__unicode__') {
    return document.getElementById(prefix + '-emoji-text').value.trim();
  }
  return sel.value;
}

/** 絵文字セレクタに値をセット（編集時など） */
function setEmojiValue(prefix, emoji) {
  const sel = document.getElementById(prefix + '-emoji-select');
  const txt = document.getElementById(prefix + '-emoji-text');
  // カスタム絵文字か？
  const found = Array.from(sel.options).find(o => o.value === emoji);
  if (found) {
    sel.value = emoji;
    txt.style.display = 'none';
  } else {
    sel.value = '__unicode__';
    txt.style.display = 'block';
    txt.value = emoji;
  }
}

function roleName(id) {
  const r = rolesCache.find(r => r.id === id);
  return r ? r.name : id;
}

function channelName(id) {
  const c = channelsCache.find(c => c.id === id);
  return c ? c.name : id;
}

// ── Snapshots ────────────────────────────────────────────────────────────
async function loadSnapshots() {
  const list = await api('/api/snapshots');
  const el = document.getElementById('snapshots-list');
  if (!list.length) { el.innerHTML = emptyState('スナップショットはまだありません'); return; }
  el.innerHTML = `<table>
    <thead><tr><th>ID</th><th>取得日時</th><th>メモ</th><th></th></tr></thead>
    <tbody>
    ${list.map(s => `
      <tr>
        <td class="mono">${s.id}</td>
        <td>${formatDate(s.taken_at)}</td>
        <td>${esc(s.note || '—')}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="viewSnapshot(${s.id}, '${esc(s.taken_at)}')">詳細</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSnapshot(${s.id})">削除</button>
        </td>
      </tr>
    `).join('')}
    </tbody>
  </table>`;
}

async function takeSnapshot() {
  const note = document.getElementById('snapshot-note').value.trim();
  try {
    await api('/api/snapshots', 'POST', { note: note || undefined });
    toast('スナップショットを取得しました。ロール一覧も更新します…', 'success');
    document.getElementById('snapshot-note').value = '';
    await Promise.all([loadSnapshots(), loadDiscordData()]);
  } catch (e) {
    toast('取得に失敗しました: ' + e, 'error');
  }
}

async function viewSnapshot(id, takenAt) {
  const data = await api(`/api/snapshots/${id}`);
  const detail = document.getElementById('snapshot-detail');
  document.getElementById('snapshot-detail-title').textContent = `スナップショット #${id} — ${formatDate(takenAt)}`;
  const entries = data.entries || [];
  document.getElementById('snapshot-entries').innerHTML = entries.length
    ? entries.map(e => {
        const colorHex = '#' + e.color.toString(16).padStart(6, '0');
        const memberList = (e.members || []).map(m =>
          `<span class="role-chip" title="${esc(m.username)}">${esc(m.display_name || m.username)}</span>`
        ).join('');
        return `<div class="snapshot-role-block">
          <div class="snapshot-role-header">
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${colorHex};flex-shrink:0;"></span>
              <strong>${esc(e.role_name)}</strong>
            </span>
            <span style="display:flex;gap:12px;align-items:center;color:var(--text-muted);font-size:12px;">
              ${e.hoist ? '<span>表示</span>' : ''}
              ${e.mentionable ? '<span>メンション可</span>' : ''}
              <span class="badge">${(e.members || []).length} 人</span>
            </span>
          </div>
          <div class="snapshot-role-members">${memberList || '<span style="color:var(--text-muted);font-size:12px;">なし</span>'}</div>
        </div>`;
      }).join('')
    : emptyState('エントリがありません');
  detail.style.display = 'block';
  detail.scrollIntoView({ behavior: 'smooth' });
}

async function deleteSnapshot(id) {
  if (!confirm(`スナップショット #${id} を削除しますか？`)) return;
  await api(`/api/snapshots/${id}`, 'DELETE');
  toast('削除しました', 'success');
  document.getElementById('snapshot-detail').style.display = 'none';
  await loadSnapshots();
}

// ── Reaction Roles ────────────────────────────────────────────────────────
async function loadReactionRoles() {
  const list = await api('/api/reaction-roles');
  const el = document.getElementById('reaction-roles-list');
  if (!list.length) { el.innerHTML = emptyState('リアクションロールはまだ設定されていません'); return; }
  el.innerHTML = `<table>
    <thead><tr><th>絵文字</th><th>ロール</th><th>チャンネル</th><th>メッセージID</th><th>ラベル</th><th></th></tr></thead>
    <tbody>
    ${list.map(r => `
      <tr>
        <td>${esc(r.emoji)}</td>
        <td>${esc(roleName(r.role_id))}</td>
        <td>${esc(channelName(r.channel_id))}</td>
        <td class="mono">${r.message_id}</td>
        <td>${esc(r.label || '—')}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="openEditRR(${JSON.stringify(r).replace(/"/g,'&quot;')})">編集</button>
          <button class="btn btn-danger btn-sm" onclick="deleteReactionRole(${r.id})">削除</button>
        </td>
      </tr>
    `).join('')}
    </tbody>
  </table>`;
}

async function addReactionRole() {
  const channel_id = document.getElementById('rr-channel').value;
  const message_id = document.getElementById('rr-message').value.trim();
  const emoji = getEmojiValue('rr');
  const role_id = document.getElementById('rr-role').value;
  const label = document.getElementById('rr-label').value.trim();
  if (!channel_id || !message_id || !emoji || !role_id) {
    toast('必須項目を入力してください', 'error'); return;
  }
  try {
    await api('/api/reaction-roles', 'POST', { channel_id, message_id, emoji, role_id, label: label || null });
    toast('追加しました', 'success');
    document.getElementById('rr-channel').selectedIndex = 0;
    document.getElementById('rr-message').value = '';
    document.getElementById('rr-emoji-select').selectedIndex = 0;
    document.getElementById('rr-emoji-text').value = '';
    document.getElementById('rr-emoji-text').style.display = 'none';
    document.getElementById('rr-role').selectedIndex = 0;
    document.getElementById('rr-label').value = '';
    await loadReactionRoles();
  } catch (e) {
    toast('追加失敗: ' + e, 'error');
  }
}

async function deleteReactionRole(id) {
  if (!confirm('削除しますか？')) return;
  await api(`/api/reaction-roles/${id}`, 'DELETE');
  toast('削除しました', 'success');
  await loadReactionRoles();
}

function openEditRR(item) {
  editMode = 'rr';
  editId = item.id;
  document.getElementById('modal-title').textContent = 'リアクションロール編集';
  document.getElementById('modal-rr-fields').style.display = 'block';
  document.getElementById('modal-vr-fields').style.display = 'none';

  document.getElementById('modal-rr-channel').value = item.channel_id;
  document.getElementById('modal-rr-message').value = item.message_id;
  setEmojiValue('modal-rr', item.emoji);
  document.getElementById('modal-rr-role').value = item.role_id;
  document.getElementById('modal-rr-label').value = item.label || '';

  document.getElementById('modal-overlay').classList.remove('hidden');
}

// ── Voice Roles ───────────────────────────────────────────────────────────
async function loadVoiceRoles() {
  const list = await api('/api/voice-roles');
  const el = document.getElementById('voice-roles-list');
  if (!list.length) { el.innerHTML = emptyState('VCロールはまだ設定されていません'); return; }
  el.innerHTML = `<table>
    <thead><tr><th>チャンネル</th><th>ロール</th><th>ラベル</th><th></th></tr></thead>
    <tbody>
    ${list.map(v => `
      <tr>
        <td>${esc(channelName(v.channel_id))}</td>
        <td>${esc(roleName(v.role_id))}</td>
        <td>${esc(v.label || '—')}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="openEditVR(${JSON.stringify(v).replace(/"/g,'&quot;')})">編集</button>
          <button class="btn btn-danger btn-sm" onclick="deleteVoiceRole(${v.id})">削除</button>
        </td>
      </tr>
    `).join('')}
    </tbody>
  </table>`;
}

async function addVoiceRole() {
  const channel_id = document.getElementById('vr-channel').value;
  const role_id = document.getElementById('vr-role').value;
  const label = document.getElementById('vr-label').value.trim();
  if (!channel_id || !role_id) { toast('チャンネルとロールを選択してください', 'error'); return; }
  try {
    await api('/api/voice-roles', 'POST', { channel_id, role_id, label: label || null });
    toast('追加しました', 'success');
    document.getElementById('vr-channel').selectedIndex = 0;
    document.getElementById('vr-role').selectedIndex = 0;
    document.getElementById('vr-label').value = '';
    await loadVoiceRoles();
  } catch (e) {
    toast('追加失敗: ' + e, 'error');
  }
}

async function deleteVoiceRole(id) {
  if (!confirm('削除しますか？')) return;
  await api(`/api/voice-roles/${id}`, 'DELETE');
  toast('削除しました', 'success');
  await loadVoiceRoles();
}

function openEditVR(item) {
  editMode = 'vr';
  editId = item.id;
  document.getElementById('modal-title').textContent = 'VCロール編集';
  document.getElementById('modal-rr-fields').style.display = 'none';
  document.getElementById('modal-vr-fields').style.display = 'block';

  document.getElementById('modal-vr-channel').value = item.channel_id;
  document.getElementById('modal-vr-role').value = item.role_id;
  document.getElementById('modal-vr-label').value = item.label || '';

  document.getElementById('modal-overlay').classList.remove('hidden');
}

// ── Modal ─────────────────────────────────────────────────────────────────
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editMode = null;
  editId = null;
}

function onOverlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

async function saveEdit() {
  if (!editMode || !editId) return;
  try {
    if (editMode === 'rr') {
      const channel_id = document.getElementById('modal-rr-channel').value;
      const message_id = document.getElementById('modal-rr-message').value.trim();
      const emoji = getEmojiValue('modal-rr');
      const role_id = document.getElementById('modal-rr-role').value;
      const label = document.getElementById('modal-rr-label').value.trim();
      if (!channel_id || !message_id || !emoji || !role_id) {
        toast('必須項目を入力してください', 'error'); return;
      }
      await api(`/api/reaction-roles/${editId}`, 'PUT', { channel_id, message_id, emoji, role_id, label: label || null });
      await loadReactionRoles();
    } else {
      const channel_id = document.getElementById('modal-vr-channel').value;
      const role_id = document.getElementById('modal-vr-role').value;
      const label = document.getElementById('modal-vr-label').value.trim();
      if (!channel_id || !role_id) {
        toast('チャンネルとロールを選択してください', 'error'); return;
      }
      await api(`/api/voice-roles/${editId}`, 'PUT', { channel_id, role_id, label: label || null });
      await loadVoiceRoles();
    }
    toast('保存しました', 'success');
    closeModal();
  } catch (e) {
    toast('保存失敗: ' + e, 'error');
  }
}

// ── Members ───────────────────────────────────────────────────────────────
function onFilterTypeChange() {
  const type = document.getElementById('member-filter-type').value;
  document.getElementById('member-filter-role-group').style.display = type ? 'flex' : 'none';
}

function setSortKey(key) {
  if (memberSortKey === key) {
    memberSortDir = memberSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    memberSortKey = key;
    memberSortDir = 'asc';
  }
  loadMembers();
}

async function refreshMembersCache() {
  const btn = document.getElementById('members-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '更新中…'; }
  try {
    const status = await api('/api/members/refresh', 'POST');
    toast(`メンバーキャッシュを更新しました (${status.count} 人)`, 'success');
    await loadMembers();
  } catch (e) {
    toast('更新失敗: ' + e, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '強制更新'; }
  }
}

async function loadMembers() {
  const filterType = document.getElementById('member-filter-type').value;
  const roleId = document.getElementById('member-filter-role').value;

  try {
    const list = await api('/api/members');

    // フィルタ
    let result = list;
    if (filterType && roleId) {
      if (filterType === 'with') {
        result = list.filter(m => m.roles.some(r => r.id === roleId));
      } else if (filterType === 'without') {
        result = list.filter(m => !m.roles.some(r => r.id === roleId));
      }
    }

    // ソート
    result.sort((a, b) => {
      let va, vb;
      if (memberSortKey === 'joined_at') {
        va = a.joined_at ? new Date(a.joined_at).getTime() : 0;
        vb = b.joined_at ? new Date(b.joined_at).getTime() : 0;
      } else if (memberSortKey === 'username') {
        va = a.username.toLowerCase();
        vb = b.username.toLowerCase();
      } else {
        va = (a.display_name || a.username).toLowerCase();
        vb = (b.display_name || b.username).toLowerCase();
      }
      if (va < vb) return memberSortDir === 'asc' ? -1 : 1;
      if (va > vb) return memberSortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const el = document.getElementById('members-list');
    if (!result.length) { el.innerHTML = emptyState('メンバーが見つかりません'); return; }

    const sortIcon = (key) => memberSortKey === key ? (memberSortDir === 'asc' ? ' ▲' : ' ▼') : '';

    el.innerHTML = `<p style="margin-bottom:12px;color:var(--text-muted);font-size:12px;">${result.length} 人 / 全 ${list.length} 人</p>
    <table>
      <thead><tr>
        <th><button class="sort-btn" onclick="setSortKey('display_name')">表示名${sortIcon('display_name')}</button></th>
        <th><button class="sort-btn" onclick="setSortKey('username')">ユーザー名${sortIcon('username')}</button></th>
        <th>ID</th>
        <th><button class="sort-btn" onclick="setSortKey('joined_at')">参加日${sortIcon('joined_at')}</button></th>
        <th>ロール</th>
      </tr></thead>
      <tbody>
      ${result.map(m => `
        <tr>
          <td>${esc(m.display_name)}</td>
          <td>${esc(m.username)}</td>
          <td class="mono">${m.id}</td>
          <td>${m.joined_at ? formatDate(m.joined_at) : '—'}</td>
          <td>${m.roles.map(r => `<span class="role-chip">${esc(r.name)}</span>`).join('')}</td>
        </tr>
      `).join('')}
      </tbody>
    </table>`;
  } catch (e) {
    toast('メンバー取得失敗: ' + e, 'error');
  }
}

// ── Leave Log ─────────────────────────────────────────────────────────────
async function loadLeaveLog(page) {
  if (page !== undefined) leaveLogPage = page;
  const limit = 50;
  const data = await api(`/api/leave-log?page=${leaveLogPage}&limit=${limit}`);
  const el = document.getElementById('leave-log-list');
  const totalEl = document.getElementById('leave-log-total');
  totalEl.textContent = `${data.total} 件`;
  if (!data.rows.length) {
    el.innerHTML = emptyState('退出ログはまだありません');
    document.getElementById('leave-log-pagination').innerHTML = '';
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>退出日時</th><th>ユーザー名</th><th>表示名</th><th>退出時のロール</th></tr></thead>
    <tbody>
    ${data.rows.map(l => {
      const roles = JSON.parse(l.roles_at_leave || '[]');
      return `<tr>
        <td>${formatDate(l.left_at)}</td>
        <td>${esc(l.username)}</td>
        <td>${esc(l.display_name || '—')}</td>
        <td>${roles.map(r => `<span class="role-chip">${esc(r.name)}</span>`).join('') || '—'}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;

  const totalPages = Math.ceil(data.total / limit);
  const pagEl = document.getElementById('leave-log-pagination');
  if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
  pagEl.innerHTML = `
    <button class="btn btn-ghost btn-sm" ${leaveLogPage <= 1 ? 'disabled' : ''} onclick="loadLeaveLog(${leaveLogPage - 1})">←</button>
    <span style="color:var(--text-muted);font-size:13px;">${leaveLogPage} / ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" ${leaveLogPage >= totalPages ? 'disabled' : ''} onclick="loadLeaveLog(${leaveLogPage + 1})">→</button>
  `;
}

// ── BOT Log ───────────────────────────────────────────────────────────────
async function loadBotLogs(page) {
  if (page !== undefined) botLogPage = page;
  const limit = 50;
  const data = await api(`/api/bot-logs?page=${botLogPage}&limit=${limit}`);
  const el = document.getElementById('bot-log-list');
  const totalEl = document.getElementById('bot-log-total');
  totalEl.textContent = `${data.total} 件`;
  if (!data.rows.length) {
    el.innerHTML = emptyState('ログはまだありません');
    document.getElementById('bot-log-pagination').innerHTML = '';
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>日時</th><th>操作</th><th>ユーザー</th><th>ロール</th><th>絵文字</th></tr></thead>
    <tbody>
    ${data.rows.map(l => {
      const actionLabel = l.action === 'reaction_role_add' ? '✅ ロール付与' : '❌ ロール剥奪';
      const actionClass = l.action === 'reaction_role_add' ? 'color:var(--success)' : 'color:var(--danger)';
      return `<tr>
        <td>${formatDate(l.created_at)}</td>
        <td style="${actionClass};font-weight:600;">${actionLabel}</td>
        <td>${esc(l.username)}</td>
        <td><span class="role-chip">${esc(l.role_name)}</span></td>
        <td>${esc(l.emoji || '—')}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;

  const totalPages = Math.ceil(data.total / limit);
  const pagEl = document.getElementById('bot-log-pagination');
  if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
  pagEl.innerHTML = `
    <button class="btn btn-ghost btn-sm" ${botLogPage <= 1 ? 'disabled' : ''} onclick="loadBotLogs(${botLogPage - 1})">←</button>
    <span style="color:var(--text-muted);font-size:13px;">${botLogPage} / ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" ${botLogPage >= totalPages ? 'disabled' : ''} onclick="loadBotLogs(${botLogPage + 1})">→</button>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function api(url, method = 'GET', body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw (data.error || res.statusText);
  return data;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function emptyState(msg) {
  return `<div class="empty-state"><p>${esc(msg)}</p></div>`;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
