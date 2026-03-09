// ── State ──────────────────────────────────────────────────────────────────
let rolesCache = [];
let channelsCache = [];
let leaveLogPage = 1;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await loadDiscordData();
  await loadSnapshots();
  await loadReactionRoles();
  await loadVoiceRoles();
  await loadMembers();
  await loadLeaveLog();
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

// ── Discord Data ────────────────────────────────────────────────────────────
async function loadDiscordData() {
  try {
    const [roles, channels] = await Promise.all([
      api('/api/discord/roles'),
      api('/api/discord/channels'),
    ]);
    rolesCache = roles;
    channelsCache = channels;
    populateRoleSelects(roles);
    populateChannelSelects(channels);
  } catch (e) {
    console.warn('Discord data not available yet:', e);
  }
}

function populateRoleSelects(roles) {
  const selects = ['rr-role', 'vr-role', 'member-filter-role'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const first = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(first);
    roles.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      sel.appendChild(opt);
    });
  });
}

function populateChannelSelects(channels) {
  const voiceSel = document.getElementById('vr-channel');
  if (!voiceSel) return;
  const first = voiceSel.options[0];
  voiceSel.innerHTML = '';
  voiceSel.appendChild(first);
  channels.filter(c => c.isVoice).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    voiceSel.appendChild(opt);
  });
}

function roleName(id) {
  const r = rolesCache.find(r => r.id === id);
  return r ? r.name : id;
}

function channelName(id) {
  const c = channelsCache.find(c => c.id === id);
  return c ? c.name : id;
}

// ── Snapshots ───────────────────────────────────────────────────────────────
async function loadSnapshots() {
  const list = await api('/api/snapshots');
  const el = document.getElementById('snapshots-list');
  if (!list.length) {
    el.innerHTML = emptyState('スナップショットはまだありません');
    return;
  }
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
    toast('スナップショットを取得しました', 'success');
    document.getElementById('snapshot-note').value = '';
    await loadSnapshots();
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
    ? `<table>
        <thead><tr><th>名前</th><th>ID</th><th>Position</th><th>Color</th><th>Hoist</th><th>Mentionable</th></tr></thead>
        <tbody>
        ${entries.map(e => `
          <tr>
            <td>${esc(e.role_name)}</td>
            <td class="mono">${e.role_id}</td>
            <td>${e.position}</td>
            <td><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#${e.color.toString(16).padStart(6,'0')};vertical-align:middle;margin-right:4px;"></span>${'#'+e.color.toString(16).padStart(6,'0')}</td>
            <td>${e.hoist ? '✓' : '—'}</td>
            <td>${e.mentionable ? '✓' : '—'}</td>
          </tr>
        `).join('')}
        </tbody>
      </table>`
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

// ── Reaction Roles ──────────────────────────────────────────────────────────
async function loadReactionRoles() {
  const list = await api('/api/reaction-roles');
  const el = document.getElementById('reaction-roles-list');
  if (!list.length) {
    el.innerHTML = emptyState('リアクションロールはまだ設定されていません');
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>絵文字</th><th>ロール</th><th>チャンネルID</th><th>メッセージID</th><th>ラベル</th><th></th></tr></thead>
    <tbody>
    ${list.map(r => `
      <tr>
        <td>${esc(r.emoji)}</td>
        <td>${esc(roleName(r.role_id))}</td>
        <td class="mono">${r.channel_id}</td>
        <td class="mono">${r.message_id}</td>
        <td>${esc(r.label || '—')}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteReactionRole(${r.id})">削除</button></td>
      </tr>
    `).join('')}
    </tbody>
  </table>`;
}

async function addReactionRole() {
  const channel_id = document.getElementById('rr-channel').value.trim();
  const message_id = document.getElementById('rr-message').value.trim();
  const emoji = document.getElementById('rr-emoji').value.trim();
  const role_id = document.getElementById('rr-role').value;
  const label = document.getElementById('rr-label').value.trim();
  if (!channel_id || !message_id || !emoji || !role_id) {
    toast('必須項目を入力してください', 'error'); return;
  }
  try {
    await api('/api/reaction-roles', 'POST', { channel_id, message_id, emoji, role_id, label: label || null });
    toast('追加しました', 'success');
    ['rr-channel','rr-message','rr-emoji','rr-label'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('rr-role').selectedIndex = 0;
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

// ── Voice Roles ─────────────────────────────────────────────────────────────
async function loadVoiceRoles() {
  const list = await api('/api/voice-roles');
  const el = document.getElementById('voice-roles-list');
  if (!list.length) {
    el.innerHTML = emptyState('VCロールはまだ設定されていません');
    return;
  }
  el.innerHTML = `<table>
    <thead><tr><th>チャンネル</th><th>ロール</th><th>ラベル</th><th></th></tr></thead>
    <tbody>
    ${list.map(v => `
      <tr>
        <td>${esc(channelName(v.channel_id))}</td>
        <td>${esc(roleName(v.role_id))}</td>
        <td>${esc(v.label || '—')}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteVoiceRole(${v.id})">削除</button></td>
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

// ── Members ─────────────────────────────────────────────────────────────────
async function loadMembers() {
  const withoutRole = document.getElementById('member-filter-role').value;
  const url = '/api/members' + (withoutRole ? `?without_role=${withoutRole}` : '');
  try {
    const list = await api(url);
    const el = document.getElementById('members-list');
    if (!list.length) {
      el.innerHTML = emptyState('メンバーが見つかりません');
      return;
    }
    el.innerHTML = `<p style="margin-bottom:12px;color:var(--text-muted);font-size:12px;">${list.length} 人</p>
    <table>
      <thead><tr><th>表示名</th><th>ユーザー名</th><th>ID</th><th>参加日</th><th>ロール</th></tr></thead>
      <tbody>
      ${list.map(m => `
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

// ── Leave Log ───────────────────────────────────────────────────────────────
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

// ── Helpers ─────────────────────────────────────────────────────────────────
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
