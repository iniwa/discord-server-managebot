// Independent reaction acknowledgement tracking. No role operations.
(() => {
  let selectedId = null;
  let report = null;
  let detailRequest = 0;
  let submitting = false;
  let syncing = false;
  const el = id => document.getElementById('rc-' + id);
  function node(tag, text, className) {
    const value = document.createElement(tag);
    if (text !== undefined) value.textContent = text;
    if (className) value.className = className;
    return value;
  }
  function feedback(id, text, error = false) {
    const target = el(id);
    target.hidden = !text;
    target.className = 'role-feedback ' + (error ? 'error' : 'success');
    target.textContent = text;
  }
  function date(value) { return value ? formatDate(value) + '（日本時間）' : '未同期'; }
  function modeLabel(check) { return check.mode === 'any' ? 'どの絵文字でもOK' : `指定した絵文字: ${check.emoji}`; }
  function updateMode() {
    const specific = el('mode').value === 'specific';
    el('emoji-group').hidden = !specific;
    el('emoji').disabled = !specific;
    el('emoji').required = specific;
  }
  function messageUrl(check) {
    return `https://discord.com/channels/${encodeURIComponent(check.guild_id)}/${encodeURIComponent(check.channel_id)}/${encodeURIComponent(check.message_id)}`;
  }
  async function loadList() {
    const target = el('list');
    el('reload').disabled = true;
    try {
      const checks = await api('/api/reaction-checks');
      target.replaceChildren();
      if (!checks.length) target.append(node('p', 'まだ登録されていません。上のフォームからメッセージを登録してください。', 'role-help'));
      checks.forEach(check => {
        const card = node('article', undefined, 'role-config');
        card.append(node('h3', check.label || '既読確認'), node('p', `${modeLabel(check)} · 最終同期: ${date(check.synced_at)}`));
        const button = node('button', '集計を見る', 'btn btn-primary btn-sm');
        button.type = 'button';
        button.addEventListener('click', () => loadDetail(check.id));
        const link = node('a', '対象メッセージ ↗', 'btn btn-ghost btn-sm');
        link.href = messageUrl(check); link.target = '_blank'; link.rel = 'noopener noreferrer';
        const actions = node('div', undefined, 'role-actions');
        actions.append(button, link);
        card.append(actions);
        target.append(card);
      });
    } catch (error) {
      target.replaceChildren(node('p', '一覧を読み込めませんでした。' + error.message, 'role-feedback error'));
    } finally { el('reload').disabled = false; }
  }
  function renderMembers() {
    if (!report) return;
    if (!report.member_snapshot_at) {
      el('reacted-heading').textContent = '押した人';
      el('pending-heading').textContent = '押していない人';
      for (const kind of ['reacted', 'pending']) el(kind).replaceChildren(node('p', '未集計です。Discordと再同期してください。', 'role-help'));
      return;
    }
    const search = el('search').value.trim().toLocaleLowerCase('ja');
    for (const kind of ['reacted', 'pending']) {
      const all = report[kind];
      const filtered = all.filter(member => [member.display_name, member.username, member.user_id].some(value => String(value || '').toLocaleLowerCase('ja').includes(search)));
      const label = kind === 'reacted' ? '押した人' : '押していない人';
      el(kind + '-heading').textContent = `${label} ${all.length}人` + (search ? `（表示 ${filtered.length}人）` : '');
      const target = el(kind);
      target.replaceChildren();
      if (!filtered.length) { target.append(node('p', search ? '検索条件に一致する人はいません。' : '該当する人はいません。', 'role-help')); continue; }
      const table = node('table');
      const head = node('thead');
      const heading = node('tr');
      heading.append(node('th', 'メンバー'));
      if (kind === 'reacted') heading.append(node('th', '記録日時'));
      head.append(heading);
      table.append(head);
      const body = node('tbody');
      filtered.forEach(member => {
        const row = node('tr');
        const cell = node('td');
        cell.append(node('strong', member.display_name || member.username), node('div', `@${member.username}`, 'check-member-meta'), node('div', member.user_id, 'check-member-meta'));
        row.append(cell);
        if (kind === 'reacted') row.append(node('td', member.reacted_at ? date(member.reacted_at) : '日時不明'));
        body.append(row);
      });
      table.append(body);
      target.append(table);
    }
  }
  function renderReport(value) {
    report = value;
    selectedId = value.check.id;
    el('detail').hidden = false;
    el('sync').disabled = syncing;
    el('detail-title').textContent = value.check.label || '既読確認';
    el('message-link').href = messageUrl(value.check);
    el('sync-status').textContent = `${modeLabel(value.check)} / リアクション最終同期: ${date(value.synced_at)} / 参加者の確認時点: ${date(value.member_snapshot_at)}。再同期で現在の状態を取得します。記録日時はBotが追加を受信した時刻です。`;
    const counts = el('counts');
    counts.replaceChildren(node('span', `押した人 ${value.reacted.length}人`, 'badge'), node('span', `押していない人 ${value.pending.length}人`, 'badge'), node('span', `対象 ${value.reacted.length + value.pending.length}人`, 'badge'));
    counts.hidden = !value.member_snapshot_at;
    feedback('detail-feedback', value.warning || (!value.member_snapshot_at ? '初回の集計が完了していません。「Discordと再同期」を押してください。人数は未確定です。' : ''), Boolean(value.warning) || !value.member_snapshot_at);
    renderMembers();
  }
  async function loadDetail(id) {
    if (syncing || submitting) return;
    const request = ++detailRequest;
    selectedId = id;
    report = null;
    el('detail').hidden = false;
    el('detail-title').textContent = '集計を読み込んでいます…';
    el('message-link').removeAttribute('href');
    el('sync-status').textContent = '';
    for (const key of ['counts', 'reacted', 'pending']) el(key).replaceChildren();
    el('reacted-heading').textContent = '押した人';
    el('pending-heading').textContent = '押していない人';
    el('sync').disabled = true;
    feedback('detail-feedback', '読み込み中…');
    try {
      const value = await api(`/api/reaction-checks/${id}`);
      if (request === detailRequest) renderReport(value);
    } catch (error) {
      if (request === detailRequest) feedback('detail-feedback', error.message, true);
    } finally { if (request === detailRequest) el('sync').disabled = false; }
  }
  async function sync() {
    if (selectedId === null || syncing || submitting) return;
    syncing = true;
    ++detailRequest;
    el('sync').disabled = true;
    feedback('detail-feedback', 'Discordから参加者とリアクションを取得しています…');
    try {
      renderReport(await api(`/api/reaction-checks/${selectedId}/sync`, 'POST'));
      await loadList();
    } catch (error) {
      feedback('detail-feedback', '同期できませんでした。表示中の結果は更新前のものです。' + error.message, true);
    } finally { syncing = false; el('sync').disabled = false; }
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting || syncing) return;
    const message_url = el('url').value.trim();
    const mode = el('mode').value;
    const emoji = el('emoji').value.trim();
    const label = el('label').value.trim();
    if (!/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/channels\/\d+\/\d+\/\d+\/?(?:\?[^#]*)?$/.test(message_url)) {
      feedback('feedback', 'Discordのメッセージリンクを入力してください。', true); el('url').focus(); return;
    }
    if (mode === 'specific' && !emoji) { feedback('feedback', '集計する絵文字を入力してください。', true); el('emoji').focus(); return; }
    submitting = true;
    el('fields').disabled = true;
    feedback('feedback', '登録してリアクションを集計しています…');
    try {
      const value = await api('/api/reaction-checks', 'POST', { message_url, mode, ...(mode === 'specific' ? { emoji } : {}), label });
      ++detailRequest;
      renderReport(value);
      feedback('feedback', value.warning ? '登録しました。集計結果の注意事項をご確認ください。' : '登録しました。下の集計結果から確認できます。');
      await loadList();
    } catch (error) {
      feedback('feedback', error.message + ' 登録済み一覧を確認し、保存されている場合は「集計を見る」から再同期してください。', true);
      await loadList();
    } finally { submitting = false; el('fields').disabled = false; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    el('form').addEventListener('submit', submit);
    el('reload').addEventListener('click', loadList);
    el('sync').addEventListener('click', sync);
    el('search').addEventListener('input', renderMembers);
    el('mode').addEventListener('change', updateMode);
    updateMode();
    loadList();
    api('/api/discord/emojis').then(emojis => {
      emojis.forEach(emoji => {
        const option = node('option'); option.value = emoji.tag; option.label = emoji.name; el('emojis').append(option);
      });
    }).catch(() => {});
  });
})();
