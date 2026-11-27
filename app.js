(function () {
  'use strict';

  const tg = window.Telegram?.WebApp || null;

  const state = {
    userId: 0,
    authToken: '',
    tier: 'PRO',
    apiUrl: '',
    online: false,
    activeTab: 'feed',
    activeFilter: 'all',
    searchQuery: '',
    unreadCount: 0,
    feedEvents: [],
    vaultChats: [],
    vaultFilter: '',
    referralLink: '',
    activeChatId: null,
    activeChatTitle: '',
    farmAccounts: [],
    triggers: {},
    fakeMessages: [{ sender: 'Собеседник', text: 'Всё готово к отправке.', is_out: false, time: '11:06' }],
    ws: null,
    reconnectTimer: null,
    resolvePromise: null,
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function haptic(type = 'light') {
    try {
      const hf = tg?.HapticFeedback;
      if (!hf) return;
      if (type === 'selection') hf.selectionChanged();
      else if (['error', 'success', 'warning'].includes(type)) hf.notificationOccurred(type);
      else hf.impactOccurred(type);
    } catch (_) {}
  }

  function toast(msg, kind = 'info') {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.borderColor = kind === 'err' ? 'var(--err)' : kind === 'ok' ? 'var(--ok)' : 'var(--border-strong)';
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2500);
    if (kind === 'err') haptic('error');
    else if (kind === 'ok') haptic('success');
  }

  function setStatus(online, label) {
    state.online = online;
    const chip = $('connStatusChip');
    const dot = $('connDot');
    const txt = $('connText');
    const bar = $('offlineBar');
    if (chip) chip.className = 'status-chip ' + (online ? 'online' : 'offline');
    if (dot) dot.className = 'dot ' + (online ? 'ok' : 'err');
    if (txt) txt.textContent = label || (online ? 'Онлайн' : 'Оффлайн');
    if (bar) bar.classList.toggle('hidden', online);
  }

  function openModal(id) {
    const m = $(id);
    if (m) m.classList.add('open');
  }

  function closeModal(id) {
    const m = $(id);
    if (m) m.classList.remove('open');
  }

  function openDrawer(title, html) {
    if ($('drawerTitle')) $('drawerTitle').textContent = title;
    if ($('drawerBody')) $('drawerBody').innerHTML = html;
    openModal('modalDrawer');
  }

  function showLockScreen(msg) {
    if ($('botLockOverlay')) return;
    const el = document.createElement('div');
    el.id = 'botLockOverlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(9,9,11,0.96);display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;';
    el.innerHTML = `<div class="card" style="max-width:340px;padding:22px;">
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">Доступ ограничен</div>
      <div class="row-sub" style="font-size:13px;">${esc(msg)}</div>
    </div>`;
    document.body.appendChild(el);
  }

  /* ================= API Discovery & Fetch ================= */
  async function pingBase(url, timeoutMs = 2800) {
    if (!url || !url.startsWith('http')) return null;
    const clean = url.replace(/\/$/, '');
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${clean}/api/ping`, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (res.ok) return { url: clean, ms: Math.round(performance.now() - t0) };
    } catch (_) {}
    return null;
  }

  async function resolveApiUrl() {
    if (state.resolvePromise) return state.resolvePromise;
    state.resolvePromise = (async () => {
      const q = new URLSearchParams(window.location.search);
      const qApi = q.get('api');
      const host = window.location.hostname;
      const candidates = [];

      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
        candidates.push(window.location.origin);
      }

      try {
        const res = await fetch('tunnel.json?v=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
          const j = await res.json();
          if (j.api_url && !candidates.includes(j.api_url)) candidates.push(j.api_url);
        }
      } catch (_) {}

      if (qApi && qApi.startsWith('http') && !candidates.includes(qApi)) candidates.push(qApi);
      const cached = localStorage.getItem('ayulite_api_url');
      if (cached && cached.startsWith('http') && !candidates.includes(cached)) candidates.push(cached);

      for (const cand of candidates) {
        const hit = await pingBase(cand, 2200);
        if (hit) {
          const changed = state.apiUrl !== hit.url;
          state.apiUrl = hit.url;
          localStorage.setItem('ayulite_api_url', hit.url);
          setStatus(true, `${hit.ms}ms`);
          if (changed) connectWebSocket();
          return true;
        }
      }

      state.apiUrl = (candidates[0] || window.location.origin).replace(/\/$/, '');
      setStatus(false, 'Offline');
      return false;
    })().finally(() => { state.resolvePromise = null; });
    return state.resolvePromise;
  }

  function authQuery() {
    if (state.authToken) return `auth=${encodeURIComponent(state.authToken)}&user_id=${encodeURIComponent(state.userId)}`;
    if (tg?.initData) return `initData=${encodeURIComponent(tg.initData)}`;
    return '';
  }

  function mediaUrl(rawPath) {
    if (!rawPath) return '';
    const base = state.apiUrl || window.location.origin;
    const full = rawPath.startsWith('http') ? rawPath : `${base}${rawPath}`;
    const aq = authQuery();
    if (!aq || full.includes('auth=') || full.includes('initData=')) return full;
    return full + (full.includes('?') ? '&' : '?') + aq;
  }

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (state.authToken) {
      headers['X-User-Token'] = state.authToken;
      headers['X-User-Id'] = String(state.userId);
    }
    if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
    opts.headers = headers;

    const base = state.apiUrl || window.location.origin;
    const full = path.startsWith('http') ? path : `${base}${path}`;
    const t0 = performance.now();

    try {
      const res = await fetch(full, opts);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.status === 'locked') showLockScreen(err.message || 'Бот временно недоступен.');
        if (res.status >= 500) {
          setStatus(false, 'Offline');
          resolveApiUrl().catch(() => {});
        }
        throw new Error(err.message || err.error || `HTTP ${res.status}`);
      }
      setStatus(true, `${Math.round(performance.now() - t0)}ms`);
      return await res.json();
    } catch (e) {
      if (e.name === 'TypeError') {
        setStatus(false, 'Offline');
        resolveApiUrl().catch(() => {});
      }
      throw e;
    }
  }

  /* ================= Navigation & Theme ================= */
  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${tab}`));

    if (tab === 'feed') {
      state.unreadCount = 0;
      updateUnreadBadge();
      loadFeed();
    } else if (tab === 'vault') {
      loadVaultOverview();
    } else if (tab === 'stealth') {
      loadState();
      loadOnlineTracker();
    } else if (tab === 'farm') {
      loadFarmAll();
    } else if (tab === 'system') {
      loadState();
    }
  }

  function updateUnreadBadge() {
    const b = $('feedUnreadBadge');
    if (!b) return;
    b.textContent = state.unreadCount > 99 ? '99+' : String(state.unreadCount);
    b.classList.toggle('hidden', state.unreadCount <= 0);
  }

  function applyTheme(name) {
    if (name === 'obsidian') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('ayulite_theme', name);
  }

  /* ================= Feed ================= */
  function updateFeedCounters() {
    let del = 0, ed = 0, ttl = 0, react = 0;
    for (const e of state.feedEvents) {
      const t = (e.type || '').toLowerCase();
      if (t === 'deleted') del++;
      else if (t === 'edited') ed++;
      else if (t === 'ttl') ttl++;
      else if (t === 'reaction' || t === 'reactions') react++;
    }
    const setTxt = (id, v) => { const n = $(id); if (n) n.textContent = String(v); };
    setTxt('hudDeleted', del); setTxt('cntDel', del);
    setTxt('hudEdited', ed); setTxt('cntEd', ed);
    setTxt('hudTtl', ttl); setTxt('cntTtl', ttl);
    setTxt('hudReactions', react); setTxt('cntReact', react);
    setTxt('cntAll', state.feedEvents.length);
  }

  function renderFeed() {
    const list = $('feedList');
    if (!list) return;
    const q = state.searchQuery;
    const f = state.activeFilter;

    const items = state.feedEvents.filter(e => {
      const t = (e.type || '').toLowerCase();
      if (f === 'media') { if (!e.media_type && !e.media_url) return false; }
      else if (f !== 'all') {
        if (f === 'reactions') { if (t !== 'reaction' && t !== 'reactions') return false; }
        else if (t !== f) return false;
      }
      if (q) {
        const hay = `${e.sender_name || ''} ${e.chat_title || ''} ${e.text || ''} ${e.old_text || ''} ${e.new_text || ''} ${e.transcription || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!items.length) {
      list.innerHTML = `<div class="empty">${state.feedEvents.length ? 'Ничего не найдено по фильтру' : 'Пока нет перехваченных событий'}</div>`;
      return;
    }

    const typeMap = {
      deleted: ['Удалено', 'err'],
      edited: ['Правка', 'warn'],
      ttl: ['TTL', 'acc'],
      reaction: ['Реакция', 'ok'],
      reactions: ['Реакция', 'ok'],
      keyword: ['Триггер', 'warn'],
    };

    list.innerHTML = items.slice(0, 120).map(e => {
      const [lbl, cls] = typeMap[(e.type || '').toLowerCase()] || [e.type || 'Событие', ''];
      const mUrl = e.media_url ? mediaUrl(e.media_url) : '';
      let bodyHtml = '';
      if (e.type === 'edited' && (e.old_text || e.new_text)) {
        bodyHtml = `<div class="event-diff-old">${esc(e.old_text || '')}</div><div class="event-diff-new">${esc(e.new_text || e.text || '')}</div>`;
      } else {
        bodyHtml = `<div class="event-body">${esc(e.text || (e.media_type ? `[${e.media_type}]` : ''))}</div>`;
      }
      if (e.transcription) {
        bodyHtml += `<div class="row-sub" style="margin-top:6px;padding:6px 8px;background:var(--bg-elev);border-radius:6px;">STT: ${esc(e.transcription)}</div>`;
      }
      let mediaHtml = '';
      if (mUrl) {
        if (e.media_type === 'voice' || e.media_type === 'audio') {
          mediaHtml = `<div class="event-media"><audio controls preload="none" src="${esc(mUrl)}" style="width:100%;height:36px;"></audio></div>`;
        } else if (e.media_type === 'video' || e.media_type === 'video_note') {
          mediaHtml = `<div class="event-media"><video controls preload="metadata" src="${esc(mUrl)}" style="max-width:100%;max-height:220px;border-radius:8px;"></video></div>`;
        } else {
          mediaHtml = `<div class="event-media"><img loading="lazy" src="${esc(mUrl)}" alt="" data-lightbox="${esc(mUrl)}"></div>`;
        }
      }
      return `<div class="event-card">
        <div class="event-top">
          <div>
            <span class="event-sender">${esc(e.sender_name || 'Собеседник')}</span>
            <span class="event-meta"> • ${esc(e.chat_title || '')}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="tag ${cls}">${esc(lbl)}</span>
            <span class="event-meta">${esc(e.time || '')}</span>
          </div>
        </div>
        ${bodyHtml}
        ${mediaHtml}
        ${e.chat_id ? `<div class="event-actions">
          <button type="button" class="btn btn-sm" data-open-chat="${esc(e.chat_id)}" data-chat-title="${esc(e.chat_title || 'Диалог')}">В чат</button>
          ${e.msg_id ? `<button type="button" class="btn btn-sm" data-shadow-msg="${esc(e.msg_id)}" data-shadow-chat="${esc(e.chat_id)}">В Избранное</button>` : ''}
          ${e.msg_id ? `<button type="button" class="btn btn-sm btn-danger" data-burn-msg="${esc(e.msg_id)}" data-burn-chat="${esc(e.chat_id)}">Сжечь</button>` : ''}
          <button type="button" class="btn btn-sm" data-dossier-chat="${esc(e.chat_id)}">Досье</button>
        </div>` : ''}
      </div>`;
    }).join('');
  }

  async function loadFeed() {
    if (!state.userId) return;
    try {
      const res = await api(`/api/feed/${state.userId}?limit=120`);
      state.feedEvents = res.items || [];
      updateFeedCounters();
      renderFeed();
    } catch (_) {}
  }

  /* ================= State & Triggers ================= */
  async function loadState() {
    if (!state.userId) return;
    try {
      const data = await api(`/api/state/${state.userId}`);
      if (data.tier) {
        state.tier = (data.tier.key || data.tier.name || 'PRO').toUpperCase();
        if ($('userTierBadge')) $('userTierBadge').textContent = state.tier;
        if ($('opTierBadge')) $('opTierBadge').textContent = state.tier;
      }
      if (data.triggers) {
        state.triggers = data.triggers;
        document.querySelectorAll('.trigger-sw').forEach(sw => {
          const k = sw.dataset.trigger;
          if (state.triggers[k] !== undefined) sw.checked = Boolean(state.triggers[k]);
        });
      }
      if (data.account && data.account.name) {
        const acc = data.account;
        if ($('opName')) $('opName').textContent = acc.name;
        if ($('opUsername')) $('opUsername').textContent = acc.username ? `@${acc.username}` : (acc.phone || '');
        if ($('opAvatarInitial')) $('opAvatarInitial').textContent = acc.name.slice(0, 1).toUpperCase();
        if ($('opSafeChannel')) $('opSafeChannel').textContent = acc.log_channel_id || 'Не привязан';
        if (acc.avatar_url && $('opAvatarImg')) {
          $('opAvatarImg').src = mediaUrl(acc.avatar_url);
          $('opAvatarImg').onload = () => {
            $('opAvatarImg').style.display = 'block';
            if ($('opAvatarInitial')) $('opAvatarInitial').style.display = 'none';
          };
        }
      }
      if (data.worker && $('opWorkerStatus')) {
        const on = data.worker.status === 'online';
        $('opWorkerStatus').textContent = on ? `ONLINE • ${data.worker.name}` : 'OFFLINE';
        $('opWorkerStatus').className = `tag ${on ? 'ok' : 'err'}`;
      }
      if (data.forum) {
        if (data.forum.channel_id && $('vaultForumMeta')) {
          $('vaultForumMeta').textContent = `ID: ${data.forum.channel_id}`;
        }
        if (data.forum.invite_link && $('vaultForumLink')) {
          $('vaultForumLink').href = data.forum.invite_link;
          $('vaultForumLink').classList.remove('hidden');
        }
      }
    } catch (_) {}
  }

  /* ================= Vault ================= */
  function renderVaultChats() {
    const list = $('vaultChatsList');
    if (!list) return;
    const q = state.vaultFilter.toLowerCase();
    const chats = (Array.isArray(state.vaultChats) ? state.vaultChats : []).filter(c => {
      const t = (c.chat_title || c.title || '').toLowerCase();
      return !q || t.includes(q);
    });
    if ($('vaultChatsTotal')) $('vaultChatsTotal').textContent = `${chats.length} чатов`;
    if (!chats.length) {
      list.innerHTML = '<div class="empty">Диалогов пока нет</div>';
      return;
    }
    list.innerHTML = chats.map(c => {
      const title = c.chat_title || c.title || `Чат ${c.chat_id}`;
      const preview = c.last_text || c.preview || 'Медиа / перехват';
      const cnt = c.total_count ?? c.deleted_count ?? 0;
      const active = String(state.activeChatId) === String(c.chat_id) ? 'active' : '';
      return `<div class="chat-row ${active}" data-vault-chat="${esc(c.chat_id)}" data-vault-title="${esc(title)}">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
          <span class="avatar-circle">${esc(title.slice(0, 1).toUpperCase())}</span>
          <div style="min-width:0;flex:1;">
            <div class="row-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(title)}</div>
            <div class="row-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(preview)}</div>
          </div>
        </div>
        <span class="tag">${cnt}</span>
      </div>`;
    }).join('');
  }

  async function loadVaultOverview() {
    if (!state.userId) return;
    try {
      const res = await api(`/api/vault/overview/${state.userId}`);
      const rawChats = res.chats;
      state.vaultChats = Array.isArray(rawChats)
        ? rawChats
        : [...(rawChats?.dm || []), ...(rawChats?.groups || []), ...(rawChats?.channels || [])];
      renderVaultChats();
      if (window.innerWidth >= 960 && state.vaultChats.length && !state.activeChatId) {
        const first = state.vaultChats[0];
        openVaultChat(first.chat_id, first.chat_title || first.title || `Чат ${first.chat_id}`);
      }
    } catch (_) {}
  }

  async function openVaultChat(chatId, title) {
    state.activeChatId = chatId;
    state.activeChatTitle = title || `Чат ${chatId}`;
    renderVaultChats();
    if (window.innerWidth < 960 && $('vaultChatsCard')) $('vaultChatsCard').style.display = 'none';
    if ($('vaultConvWrap')) $('vaultConvWrap').style.display = 'block';
    if ($('activeChatTitle')) $('activeChatTitle').textContent = state.activeChatTitle;
    if ($('vaultMessagesStream')) $('vaultMessagesStream').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';

    try {
      const res = await api(`/api/vault/messages/${state.userId}/${encodeURIComponent(chatId)}`);
      const msgs = res.messages || [];
      const stream = $('vaultMessagesStream');
      if (!stream) return;
      if (!msgs.length) {
        stream.innerHTML = '<div class="empty">Сообщений в кэше нет</div>';
        return;
      }
      stream.innerHTML = msgs.map(m => {
        const cls = m.is_deleted ? 'deleted' : (m.is_edited ? 'edited' : '');
        const rawUrl = m.media_url || (m.has_media && m.session_id && m.msg_id ? `/api/vault/media/${m.session_id}/${m.msg_id}` : '');
        const mUrl = rawUrl ? mediaUrl(rawUrl) : '';
        let media = '';
        if (mUrl) {
          if (m.media_type === 'voice' || m.media_type === 'audio') {
            media = `<audio controls preload="none" src="${esc(mUrl)}" style="width:100%;height:34px;margin-top:6px;"></audio>`;
          } else if (m.media_type === 'video' || m.media_type === 'video_note') {
            media = `<video controls preload="metadata" src="${esc(mUrl)}" style="max-width:100%;max-height:200px;margin-top:6px;border-radius:6px;"></video>`;
          } else {
            media = `<img loading="lazy" src="${esc(mUrl)}" alt="" data-lightbox="${esc(mUrl)}" style="max-width:100%;max-height:200px;margin-top:6px;border-radius:6px;cursor:zoom-in;">`;
          }
        }
        return `<div class="msg-bubble ${cls}">
          <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;">
            <span style="font-weight:600;font-size:12px;">${esc(m.sender_name || 'Собеседник')}</span>
            <span class="event-meta">#${esc(m.msg_id)} • ${esc(m.date || '')}</span>
          </div>
          ${m.text ? `<div class="event-body">${esc(m.text)}</div>` : ''}
          ${m.transcription ? `<div class="row-sub" style="margin-top:4px;">STT: ${esc(m.transcription)}</div>` : ''}
          ${media}
          <div class="event-actions" style="margin-top:6px;">
            <button type="button" class="btn btn-sm" data-shadow-msg="${esc(m.msg_id)}" data-shadow-chat="${esc(chatId)}">В Избранное</button>
            <button type="button" class="btn btn-sm btn-danger" data-burn-msg="${esc(m.msg_id)}" data-burn-chat="${esc(chatId)}">Сжечь</button>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      if ($('vaultMessagesStream')) $('vaultMessagesStream').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  }

  /* ================= Stealth & Recon ================= */
  async function loadOnlineTracker() {
    const box = $('onlineTrackerList');
    if (!box || !state.userId) return;
    try {
      const res = await api(`/api/recon/online_tracker/${state.userId}`);
      const entries = Object.entries(res.targets || {});
      box.innerHTML = entries.length ? entries.map(([tid, info]) => `
        <div class="row" style="padding:8px 0;">
          <div>
            <div class="row-title">${esc(info.name || tid)}</div>
            <div class="row-sub">${esc(info.last_seen || 'ожидание')} • сессий сегодня: ${info.sessions_today || 0}</div>
          </div>
          <button type="button" class="btn btn-sm btn-danger" data-tracker-del="${esc(tid)}">Удалить</button>
        </div>
      `).join('') : '<div class="empty" style="padding:12px;">Нет отслеживаемых целей</div>';
    } catch (_) {}
  }

  /* ================= Farm & Operations ================= */
  async function loadFarmAll() {
    if (!state.userId) return;
    await Promise.allSettled([
      loadFarmAccounts(),
      loadFarmHealth(),
      loadSchedulerTasks(),
      loadProxies()
    ]);
  }

  async function loadFarmAccounts() {
    const list = $('farmAccountsList');
    if (!list || !state.userId) return;
    try {
      const res = await api(`/api/farm/accounts/${state.userId}`);
      const accs = res.accounts || [];
      state.farmAccounts = accs;
      if (!accs.length) {
        list.innerHTML = '<div class="card empty">Аккаунты не подключены. Нажмите «+ Сессия».</div>';
        return;
      }
      list.innerHTML = accs.map(a => {
        const on = Boolean(a.is_running);
        const name = a.account_name || a.session_id.slice(0, 8);
        return `<div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
            <div>
              <div class="row-title">${esc(name)}</div>
              <div class="row-sub">${esc(a.phone || '—')} • ${esc(a.device_model || '')}</div>
            </div>
            <span class="tag ${on ? 'ok' : 'err'}">${on ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm" data-farm-devices="${esc(a.session_id)}">Устройства</button>
            <button type="button" class="btn btn-sm" data-farm-ctrl="restart" data-sid="${esc(a.session_id)}">Рестарт</button>
            <button type="button" class="btn btn-sm" data-farm-ctrl="${on ? 'stop' : 'start'}" data-sid="${esc(a.session_id)}">${on ? 'Стоп' : 'Старт'}</button>
            <button type="button" class="btn btn-sm btn-danger" data-farm-ctrl="delete" data-sid="${esc(a.session_id)}">Удалить</button>
          </div>
        </div>`;
      }).join('');
    } catch (_) {
      list.innerHTML = '<div class="card empty">Ошибка загрузки аккаунтов</div>';
    }
  }

  async function loadFarmHealth() {
    try {
      const [mRes, hRes] = await Promise.allSettled([
        api('/api/metrics'),
        api(`/api/health/workers/${state.userId}`)
      ]);
      if (mRes.status === 'fulfilled' && mRes.value?.totals) {
        const t = mRes.value.totals;
        if ($('mIntercepted')) $('mIntercepted').textContent = String(t.messages_intercepted ?? 0);
        if ($('mDeletes')) $('mDeletes').textContent = String(t.deletes_intercepted ?? 0);
        if ($('mMedia')) $('mMedia').textContent = String(t.media_intercepted ?? 0);
        if ($('mVault')) $('mVault').textContent = String(t.vault_deliveries ?? 0);
      }
      if (hRes.status === 'fulfilled' && hRes.value?.workers) {
        const chips = $('farmHealthChips');
        if (chips) {
          chips.innerHTML = hRes.value.workers.map(w => {
            const cls = w.flood_wait ? 'warn' : (w.is_running ? 'ok' : 'err');
            const ping = w.ping_ms != null ? `${w.ping_ms}ms` : (w.is_running ? 'ON' : 'OFF');
            return `<span class="tag ${cls}">${esc(w.name)} • ${ping}${w.dc_id ? ' DC' + w.dc_id : ''}</span>`;
          }).join('');
        }
        const sel = $('selectTrapSession');
        if (sel) {
          const cur = sel.value;
          sel.innerHTML = hRes.value.workers.map(w => `<option value="${esc(w.session_id)}">${esc(w.name)}</option>`).join('');
          if (cur) sel.value = cur;
          if (sel.value) loadKeywordTraps(sel.value);
        }
      }
    } catch (_) {}
  }

  async function loadKeywordTraps(sid) {
    const box = $('keywordTrapList');
    if (!box || !sid) return;
    try {
      const res = await api('/api/farm/keyword_trap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, action: 'list' })
      });
      const traps = res.traps || [];
      box.innerHTML = traps.length ? traps.map(t =>
        `<button type="button" class="tag acc" data-trap-del="${esc(t)}" title="Нажмите чтобы удалить">${esc(t)} ✕</button>`
      ).join('') : '<span class="row-sub">Триггеры не заданы</span>';
    } catch (_) {}
  }

  async function loadSchedulerTasks() {
    const box = $('schedulerTasksList');
    if (!box) return;
    try {
      const res = await api(`/api/scheduler/tasks/${state.userId}`);
      const tasks = res.tasks || [];
      box.innerHTML = tasks.length ? tasks.map(t => `
        <div class="row" style="padding:7px 0;">
          <span>#${esc(t.task_id)} • <b>${esc(t.task_type)}</b> в ${String(t.cron_hour).padStart(2, '0')}:${String(t.cron_minute).padStart(2, '0')}</span>
          <button type="button" class="btn btn-sm btn-danger" data-sched-del="${esc(t.task_id)}">✕</button>
        </div>
      `).join('') : '<span class="row-sub">Задач нет</span>';
    } catch (_) {}
  }

  async function loadProxies() {
    const box = $('proxyPoolList');
    if (!box) return;
    try {
      const res = await api('/api/farm/proxies');
      const list = res.proxies || [];
      box.innerHTML = list.length ? list.map(p => `
        <div class="row" style="padding:7px 0;">
          <span><span class="tag ${p.alive ? 'ok' : 'err'}">${p.alive ? 'OK' : 'DEAD'}</span> ${esc(p.proxy_type)}://${esc(p.addr)}:${p.port}</span>
          <button type="button" class="btn btn-sm btn-danger" data-proxy-del="${esc(p.id)}">✕</button>
        </div>
      `).join('') : '<span class="row-sub">Прокси не добавлены</span>';
    } catch (_) {
      box.innerHTML = '<span class="row-sub">Управление прокси доступно администратору</span>';
    }
  }

  /* ================= WebSocket ================= */
  function connectWebSocket() {
    if (!state.userId || !state.apiUrl) return;
    if (state.ws) { try { state.ws.close(); } catch (_) {} }
    const base = state.apiUrl;
    const proto = base.startsWith('https') ? 'wss:' : 'ws:';
    const host = base.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const aq = authQuery();
    const wsUrl = `${proto}//${host}/ws/${state.userId}${aq ? '?' + aq : ''}`;

    try { state.ws = new WebSocket(wsUrl); } catch (_) { return; }
    state.ws.onopen = () => setStatus(true, 'Live');
    state.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'new_intercept' || msg.type === 'message_edited' || msg.type === 'message_deleted' || msg.type === 'keyword_trap_hit') {
          const item = msg.data || msg;
          state.feedEvents.unshift(item);
          updateFeedCounters();
          renderFeed();
          if (state.activeTab !== 'feed') {
            state.unreadCount++;
            updateUnreadBadge();
          }
          if (msg.type === 'keyword_trap_hit') {
            toast(`Триггер: ${(item.keywords || []).join(', ')}`, 'ok');
          }
        } else if (msg.type === 'trigger_state_change' && msg.data) {
          state.triggers[msg.data.name] = Boolean(msg.data.enabled);
          const sw = document.querySelector(`.trigger-sw[data-trigger="${msg.data.name}"]`);
          if (sw) sw.checked = Boolean(msg.data.enabled);
        } else if (msg.type === 'worker_recovered') {
          toast(`Воркер восстановлен: ${msg.data?.name || ''}`, 'ok');
          if (state.activeTab === 'farm') loadFarmAll();
        }
      } catch (_) {}
    };
    state.ws.onclose = () => {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectWebSocket, 5000);
    };
  }

  /* ================= Quick Intelligence & Chat Helpers ================= */
  async function showChatDossier(chatId) {
    if (!chatId || !state.userId) return toast('Укажите чат или ID цели', 'err');
    openDrawer('Досье собеседника', '<div class="skeleton"></div><div class="skeleton"></div>');
    try {
      const d = await api(`/api/chat/dossier/${state.userId}/${encodeURIComponent(chatId)}`);
      const flags = [
        d.is_premium ? '<span class="tag acc">PREMIUM</span>' : '',
        d.is_verified ? '<span class="tag ok">VERIFIED</span>' : '',
        d.is_bot ? '<span class="tag">BOT</span>' : '',
        d.is_scam ? '<span class="tag err">SCAM</span>' : '',
        d.is_fake ? '<span class="tag err">FAKE</span>' : ''
      ].filter(Boolean).join(' ');
      openDrawer(`Досье: ${d.title || chatId}`, `
        <div class="card card-flush">
          <div class="row"><span class="row-sub">ID</span><span class="tag">${esc(d.chat_id || chatId)}</span></div>
          <div class="row"><span class="row-sub">Username</span><span class="tag">${d.username ? '@' + esc(d.username) : '—'}</span></div>
          <div class="row"><span class="row-sub">Телефон</span><span class="tag">${esc(d.phone || 'Скрыт')}</span></div>
          <div class="row"><span class="row-sub">Дата-центр</span><span class="tag acc">${esc(d.dc_id || 'DC ?')}</span></div>
          <div class="row"><span class="row-sub">Регистрация</span><span class="tag">${esc(d.reg_year || '—')}</span></div>
          <div class="row"><span class="row-sub">Общих чатов</span><span class="tag ok">${esc(d.common_chats ?? 0)}</span></div>
        </div>
        ${flags ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${flags}</div>` : ''}
      `);
    } catch (err) {
      openDrawer('Ошибка досье', `<div class="empty">${esc(err.message)}</div>`);
    }
  }

  async function shadowCopyMsg(chatId, msgId) {
    if (!chatId || !msgId) return;
    try {
      const r = await api('/api/tools/shadow_forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: state.userId, from_chat_id: chatId, msg_id: Number(msgId), to_chat_id: 'me' })
      });
      toast(r.message || 'Скопировано в Избранное', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function burnMessage(chatId, msgId, btnEl) {
    if (!chatId || !msgId) return;
    if (btnEl && !btnEl.dataset.armed) {
      btnEl.dataset.armed = '1';
      btnEl.textContent = 'Точно?';
      setTimeout(() => { if (btnEl) { delete btnEl.dataset.armed; btnEl.textContent = 'Сжечь'; } }, 2800);
      return;
    }
    try {
      const r = await api('/api/chat/burn_ttl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(chatId), msg_id: Number(msgId) })
      });
      toast(r.message || 'Сожжено у обоих участников', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function loadSnatcherChannels() {
    const box = $('snatcherChannelsList');
    if (!box || !state.userId) return;
    box.innerHTML = '<div class="empty" style="padding:14px;">Загрузка каналов...</div>';
    try {
      const r = await api(`/api/snatcher/channels/${state.userId}`);
      const list = r.channels || [];
      if (!list.length) {
        box.innerHTML = '<div class="empty" style="padding:14px;">Нет доступных каналов</div>';
        return;
      }
      box.innerHTML = list.map(c => `<div class="row" data-pick-channel="${esc(c.id)}" style="cursor:pointer;padding:10px 12px;min-height:44px;">
        <div style="min-width:0;">
          <div class="row-title" style="font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.title)}</div>
          <div class="row-sub" style="font-size:11.5px;">${c.username ? '@' + esc(c.username) : 'ID ' + esc(c.id)}</div>
        </div>
        ${c.noforwards ? '<span class="tag err">ЗАКРЫТ</span>' : '<span class="tag">ОТКРЫТ</span>'}
      </div>`).join('');
    } catch (err) {
      box.innerHTML = `<div class="empty" style="padding:14px;">${esc(err.message)}</div>`;
    }
  }

  async function loadReferrals() {
    if (!state.userId) return;
    try {
      const r = await api(`/api/referrals/${state.userId}`);
      state.referralLink = r.referral_link || '';
      const total = r.stats?.total_invited ?? 0;
      const days = r.stats?.days_earned ?? 0;
      if ($('refStatsText')) {
        $('refStatsText').textContent = days > 0
          ? `Приглашено: ${total} (бонус: +${days} дн.)`
          : `Приглашено друзей: ${total}`;
      }
    } catch (_) {}
  }

  /* ================= Synchronous UI Bindings ================= */
  function bindAllUI() {
    // Theme
    const themes = ['obsidian', 'tg', 'carbon'];
    let curTheme = localStorage.getItem('ayulite_theme') || 'obsidian';
    applyTheme(curTheme);
    $('btnThemeCycle')?.addEventListener('click', () => {
      haptic('light');
      curTheme = themes[(themes.indexOf(curTheme) + 1) % themes.length];
      applyTheme(curTheme);
      toast(`Тема: ${curTheme}`);
    });

    // Navigation
    $('navDock')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (!btn) return;
      haptic('light');
      switchTab(btn.dataset.tab);
    });

    // Modal close buttons & backdrop click
    document.addEventListener('click', (e) => {
      const closeTarget = e.target.closest('[data-close-modal]');
      if (closeTarget) {
        closeModal(closeTarget.dataset.closeModal);
        return;
      }
      if (e.target.classList.contains('modal')) {
        e.target.classList.remove('open');
      }
      const lbUrl = e.target.dataset?.lightbox;
      if (lbUrl) {
        if ($('lbTitle')) $('lbTitle').textContent = 'Просмотр медиа';
        if ($('lbBody')) $('lbBody').innerHTML = `<img src="${esc(lbUrl)}" alt="" style="max-width:100%;max-height:70vh;border-radius:10px;">`;
        openModal('modalLightbox');
      }
    });

    // Command Palette
    const cmds = [
      { title: 'Лента перехватов', hint: 'Tab', run: () => switchTab('feed') },
      { title: 'Сейф диалогов', hint: 'Tab', run: () => switchTab('vault') },
      { title: 'Стелс и Разведка', hint: 'Tab', run: () => switchTab('stealth') },
      { title: 'Ферма и Прокси', hint: 'Tab', run: () => switchTab('farm') },
      { title: 'Система и Тарифы', hint: 'Tab', run: () => switchTab('system') },
      { title: 'Media Snatcher', hint: 'Tool', run: () => openModal('modalSnatcher') },
      { title: 'Fakeshot Studio', hint: 'Tool', run: () => { renderFakeMsgs(); openModal('modalFakeshot'); } },
      { title: 'Добавить сессию', hint: 'Farm', run: () => openModal('modalAddSession') },
      { title: 'Auto-Recover воркеров', hint: 'Health', run: () => $('btnFarmRecover')?.click() },
      { title: 'Очистить кэш (> 7 дн.)', hint: 'System', run: () => $('btnClearCache')?.click() },
    ];
    function renderCmds(q = '') {
      const list = $('cmdList');
      if (!list) return;
      const ql = q.trim().toLowerCase();
      const filtered = cmds.filter(c => !ql || c.title.toLowerCase().includes(ql) || c.hint.toLowerCase().includes(ql));
      list.innerHTML = filtered.map((c, idx) =>
        `<button type="button" class="cmd-item" data-cmd-idx="${idx}"><span>${esc(c.title)}</span><span class="tag">${esc(c.hint)}</span></button>`
      ).join('') || '<div class="empty">Ничего не найдено</div>';
      list._filtered = filtered;
    }
    $('cmdList')?.addEventListener('click', (e) => {
      const b = e.target.closest('.cmd-item');
      if (!b) return;
      const item = $('cmdList')._filtered?.[Number(b.dataset.cmdIdx)];
      closeModal('modalCmd');
      if (item) item.run();
    });
    $('btnCmdOpen')?.addEventListener('click', () => {
      renderCmds('');
      openModal('modalCmd');
      setTimeout(() => $('cmdSearchInput')?.focus(), 50);
    });
    $('cmdSearchInput')?.addEventListener('input', (e) => renderCmds(e.target.value));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $('btnCmdOpen')?.click();
      } else if (e.key === 'Escape') {
        document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
      }
    });

    // Retry connection
    $('btnRetryConn')?.addEventListener('click', async () => {
      toast('Переподключение...');
      const ok = await resolveApiUrl();
      if (ok) {
        await Promise.allSettled([loadFeed(), loadState(), loadVaultOverview(), loadFarmAll()]);
        connectWebSocket();
        toast('Соединение восстановлено', 'ok');
      } else {
        toast('Сервер недоступен', 'err');
      }
    });

    // Feed controls
    $('btnFeedRefresh')?.addEventListener('click', () => { haptic('light'); loadFeed(); });
    $('btnOpenSnatcher')?.addEventListener('click', () => {
      openModal('modalSnatcher');
      loadSnatcherChannels();
    });
    $('snatcherChannelsList')?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-pick-channel]');
      if (!row) return;
      if ($('snatcherInputLink')) $('snatcherInputLink').value = row.dataset.pickChannel;
      haptic('selection');
      toast('Канал выбран', 'ok');
    });
    $('feedSearchInput')?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      renderFeed();
    });
    $('feedFilterChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      haptic('selection');
      document.querySelectorAll('#feedFilterChips .chip').forEach(x => x.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.dataset.filter;
      renderFeed();
    });
    $('feedList')?.addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-chat]');
      if (openBtn) {
        switchTab('vault');
        openVaultChat(openBtn.dataset.openChat, openBtn.dataset.chatTitle);
        return;
      }
      const shBtn = e.target.closest('[data-shadow-msg]');
      if (shBtn) return shadowCopyMsg(shBtn.dataset.shadowChat, shBtn.dataset.shadowMsg);
      const burnBtn = e.target.closest('[data-burn-msg]');
      if (burnBtn) return burnMessage(burnBtn.dataset.burnChat, burnBtn.dataset.burnMsg, burnBtn);
      const dosBtn = e.target.closest('[data-dossier-chat]');
      if (dosBtn) return showChatDossier(dosBtn.dataset.dossierChat);
    });

    // Vault controls
    $('vaultChatSearch')?.addEventListener('input', (e) => {
      state.vaultFilter = e.target.value.trim();
      renderVaultChats();
    });
    $('vaultChatsList')?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-vault-chat]');
      if (!row) return;
      haptic('light');
      openVaultChat(row.dataset.vaultChat, row.dataset.vaultTitle);
    });
    $('btnBackToChats')?.addEventListener('click', () => {
      if ($('vaultConvWrap')) $('vaultConvWrap').style.display = 'none';
      if ($('vaultChatsCard')) $('vaultChatsCard').style.display = 'block';
    });
    $('btnSyncVaultForum')?.addEventListener('click', async () => {
      try {
        await api('/api/vault/create_forum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId })
        });
        toast('Сейф синхронизирован', 'ok');
        loadState();
      } catch (err) { toast(err.message, 'err'); }
    });
    $('btnVaultDump')?.addEventListener('click', async () => {
      if (!state.activeChatId) return toast('Выберите диалог', 'err');
      try {
        const r = await api('/api/tools/dialog_dump', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId, chat_id: state.activeChatId, limit: 100 })
        });
        toast(`Выгружено: ${r.total || 0} сообщений`, 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });
    $('btnVaultShadow')?.addEventListener('click', () => {
      if (!state.activeChatId) return toast('Выберите диалог', 'err');
      openModal('modalShadowFwd');
    });
    $('btnChatDossier')?.addEventListener('click', () => {
      if (!state.activeChatId) return toast('Выберите диалог', 'err');
      showChatDossier(state.activeChatId);
    });
    $('selectActionFaker')?.addEventListener('change', async (e) => {
      const action = e.target.value;
      if (!action || !state.activeChatId) return;
      try {
        const r = await api('/api/chat/action_faker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: Number(state.activeChatId), action })
        });
        toast(r.message || 'Статус применён', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });
    $('vaultMessagesStream')?.addEventListener('click', async (e) => {
      const shBtn = e.target.closest('[data-shadow-msg]');
      if (shBtn) return shadowCopyMsg(shBtn.dataset.shadowChat, shBtn.dataset.shadowMsg);
      const burnBtn = e.target.closest('[data-burn-msg]');
      if (burnBtn) return burnMessage(burnBtn.dataset.burnChat, burnBtn.dataset.burnMsg, burnBtn);
    });
    $('btnShadowExecute')?.addEventListener('click', async () => {
      const msgId = Number($('shadowMsgId')?.value || 0);
      const toChat = ($('shadowToChat')?.value || 'me').trim();
      if (!msgId || !state.activeChatId) return toast('Укажите ID сообщения', 'err');
      try {
        const r = await api('/api/tools/shadow_forward', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId, from_chat_id: state.activeChatId, msg_id: msgId, to_chat_id: toChat })
        });
        closeModal('modalShadowFwd');
        toast(r.message || 'Скопировано', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });

    // Stealth Switches (delegated)
    document.addEventListener('change', async (e) => {
      const sw = e.target.closest('.trigger-sw');
      if (!sw) return;
      const name = sw.dataset.trigger;
      const val = sw.checked;
      haptic('medium');
      try {
        await api('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'toggle_trigger', trigger: name, value: val, user_id: state.userId })
        });
        toast(`${name}: ${val ? 'ВКЛ' : 'ВЫКЛ'}`, 'ok');
      } catch (err) {
        sw.checked = !val;
        toast(err.message, 'err');
      }
    });

    // Online Tracker & Recon
    $('btnTrackerAdd')?.addEventListener('click', async () => {
      const target = ($('inputTrackerTarget')?.value || '').trim();
      if (!target) return;
      try {
        const r = await api('/api/recon/online_tracker/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId, action: 'add', target_id: target, target_name: target })
        });
        $('inputTrackerTarget').value = '';
        toast(r.message || 'Добавлено', 'ok');
        loadOnlineTracker();
      } catch (err) { toast(err.message, 'err'); }
    });
    $('onlineTrackerList')?.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-tracker-del]');
      if (!b) return;
      await api('/api/recon/online_tracker/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: state.userId, action: 'remove', target_id: b.dataset.trackerDel })
      });
      loadOnlineTracker();
    });

    $('btnReconDossier')?.addEventListener('click', () => {
      const t = ($('inputReconTarget')?.value || '').trim();
      showChatDossier(t);
    });
    $('btnCopyRef')?.addEventListener('click', async () => {
      if (!state.referralLink) await loadReferrals();
      if (!state.referralLink) return toast('Ссылка недоступна', 'err');
      try {
        await navigator.clipboard.writeText(state.referralLink);
        toast('Реферальная ссылка скопирована', 'ok');
      } catch (_) {
        toast(state.referralLink, 'ok');
      }
    });

    $('btnReconShared')?.addEventListener('click', async () => {
      const t = ($('inputReconTarget')?.value || '').trim();
      if (!t) return toast('Укажите цель', 'err');
      openDrawer('Общие чаты', '<div class="skeleton"></div>');
      try {
        const r = await api(`/api/recon/shared_chats/${state.userId}?target_id=${encodeURIComponent(t)}`);
        const chats = r.chats || [];
        openDrawer(`Общие чаты (${chats.length})`, chats.map(c => `<div class="row"><span>${esc(c.title)}</span><span class="tag">${esc(c.username ? '@' + c.username : c.id)}</span></div>`).join('') || '<div class="empty">Пусто</div>');
      } catch (err) { openDrawer('Ошибка', `<div class="empty">${esc(err.message)}</div>`); }
    });
    $('btnReconStories')?.addEventListener('click', async () => {
      const t = ($('inputReconTarget')?.value || '').trim();
      if (!t) return toast('Укажите цель', 'err');
      openDrawer('Истории', '<div class="skeleton"></div>');
      try {
        const r = await api(`/api/recon/stories/${state.userId}?target_id=${encodeURIComponent(t)}`);
        const st = r.stories || [];
        openDrawer(`Истории (${st.length})`, st.map(s => `<div class="card"><div class="row-title">#${s.id} • ${esc(s.media_type || 'text')}</div><div class="row-sub">${esc(s.caption || '')}</div></div>`).join('') || '<div class="empty">Нет активных историй</div>');
      } catch (err) { openDrawer('Ошибка', `<div class="empty">${esc(err.message)}</div>`); }
    });
    $('btnReconMembers')?.addEventListener('click', async () => {
      const t = ($('inputReconTarget')?.value || '').trim();
      if (!t) return toast('Укажите канал или группу', 'err');
      openDrawer('Участники', '<div class="skeleton"></div>');
      try {
        const r = await api(`/api/recon/members/${state.userId}?channel_id=${encodeURIComponent(t)}&limit=100`);
        const m = r.members || [];
        openDrawer(`Участники (${m.length})`, m.map(u => `<div class="row"><span>${esc((u.first_name + ' ' + u.last_name).trim())} ${u.username ? '@' + esc(u.username) : ''}</span><span class="tag">${esc(u.role)}</span></div>`).join('') || '<div class="empty">Список скрыт или пуст</div>');
      } catch (err) { openDrawer('Ошибка', `<div class="empty">${esc(err.message)}</div>`); }
    });

    // Snatcher
    $('btnSnatchExecute')?.addEventListener('click', async () => {
      const link = ($('snatcherInputLink')?.value || '').trim();
      const count = Number($('snatcherCount')?.value || 10);
      if (!link) return toast('Вставьте ссылку', 'err');
      const btn = $('btnSnatchExecute');
      btn.disabled = true;
      if ($('snatcherStatusBox')) $('snatcherStatusBox').textContent = 'Загрузка...';
      try {
        const r = await api('/api/snatcher/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId, link, count })
        });
        toast(r.message || `Выгружено постов: ${r.fetched ?? 0} (медиа: ${r.media_count ?? 0})`, 'ok');
        closeModal('modalSnatcher');
      } catch (err) {
        if ($('snatcherStatusBox')) $('snatcherStatusBox').textContent = err.message;
        toast(err.message, 'err');
      } finally { btn.disabled = false; }
    });

    // Farm controls (delegated)
    $('btnAddSessionOpen')?.addEventListener('click', () => openModal('modalAddSession'));
    $('btnSubmitAddSession')?.addEventListener('click', async () => {
      const str = ($('inputSessionString')?.value || '').trim();
      const phone = ($('inputSessionPhone')?.value || '').trim();
      if (!str) return toast('Введите StringSession', 'err');
      const btn = $('btnSubmitAddSession');
      btn.disabled = true;
      try {
        await api('/api/farm/add_session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_string: str, phone, user_id: state.userId })
        });
        $('inputSessionString').value = '';
        $('inputSessionPhone').value = '';
        closeModal('modalAddSession');
        toast('Сессия подключена', 'ok');
        loadFarmAll();
      } catch (err) { toast(err.message, 'err'); } finally { btn.disabled = false; }
    });

    $('farmAccountsList')?.addEventListener('click', async (e) => {
      const devBtn = e.target.closest('[data-farm-devices]');
      if (devBtn) {
        const sid = devBtn.dataset.farmDevices;
        openDrawer('Устройства сессии', '<div class="skeleton"></div>');
        try {
          const r = await api(`/api/farm/authorizations/${encodeURIComponent(sid)}`);
          const list = r.authorizations || [];
          openDrawer('Устройства сессии', list.map(a => `<div class="card">
            <div style="display:flex;justify-content:space-between;"><span class="row-title">${esc(a.device_model)}</span><span class="tag ${a.current ? 'ok' : ''}">${a.current ? 'CURRENT' : esc(a.country || '')}</span></div>
            <div class="row-sub">${esc(a.app_name)} ${esc(a.app_version)} • ${esc(a.ip)}</div>
          </div>`).join('') || '<div class="empty">Пусто</div>');
        } catch (err) { openDrawer('Ошибка', `<div class="empty">${esc(err.message)}</div>`); }
        return;
      }
      const ctrlBtn = e.target.closest('[data-farm-ctrl]');
      if (ctrlBtn) {
        const action = ctrlBtn.dataset.farmCtrl;
        const sid = ctrlBtn.dataset.sid;
        if (action === 'delete' && !ctrlBtn.dataset.armed) {
          ctrlBtn.dataset.armed = '1';
          ctrlBtn.textContent = 'Точно удалить?';
          setTimeout(() => { delete ctrlBtn.dataset.armed; ctrlBtn.textContent = 'Удалить'; }, 3000);
          return;
        }
        try {
          await api('/api/farm/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, session_id: sid, user_id: state.userId })
          });
          toast(`Выполнено: ${action}`, 'ok');
          loadFarmAll();
        } catch (err) { toast(err.message, 'err'); }
      }
    });

    $('btnFarmHealth')?.addEventListener('click', () => { loadFarmHealth(); toast('Пинг обновлён'); });
    $('btnFarmRecover')?.addEventListener('click', async () => {
      try {
        const r = await api('/api/health/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId })
        });
        toast(r.message || 'Recover завершён', 'ok');
        loadFarmAll();
      } catch (err) { toast(err.message, 'err'); }
    });
    $('btnFarmChannels')?.addEventListener('click', async () => {
      openDrawer('Каналы где воркер админ', '<div class="skeleton"></div>');
      try {
        const r = await api(`/api/farm/admin_channels/${state.userId}`);
        const list = r.channels || [];
        openDrawer(`Каналы (${list.length})`, list.map(c => `<div class="row"><div><div class="row-title">${esc(c.title)}</div><div class="row-sub">${c.members} уч.</div></div>${c.invite_link ? `<a href="${esc(c.invite_link)}" target="_blank" class="btn btn-sm">Открыть</a>` : ''}</div>`).join('') || '<div class="empty">Пусто</div>');
      } catch (err) { openDrawer('Ошибка', `<div class="empty">${esc(err.message)}</div>`); }
    });
    $('btnFarmContacts')?.addEventListener('click', async () => {
      openDrawer('Контакты воркеров', '<div class="skeleton"></div>');
      try {
        const r = await api(`/api/farm/contacts/${state.userId}`);
        const list = r.contacts || [];
        openDrawer(`Контакты (${list.length})`, list.slice(0, 80).map(c => `<div class="row"><span>${esc((c.first_name + ' ' + c.last_name).trim())}</span><span class="tag">${esc(c.phone || c.id)}</span></div>`).join('') || '<div class="empty">Пусто</div>');
      } catch (err) { openDrawer('Ошибка', `<div class="empty">${esc(err.message)}</div>`); }
    });

    // Keyword Traps
    $('selectTrapSession')?.addEventListener('change', (e) => loadKeywordTraps(e.target.value));
    $('btnTrapAdd')?.addEventListener('click', async () => {
      const sid = $('selectTrapSession')?.value;
      const kw = ($('inputTrapKeyword')?.value || '').trim();
      if (!sid || !kw) return toast('Выберите сессию и введите слово', 'err');
      try {
        await api('/api/farm/keyword_trap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid, action: 'add', keyword: kw })
        });
        $('inputTrapKeyword').value = '';
        loadKeywordTraps(sid);
      } catch (err) { toast(err.message, 'err'); }
    });
    $('keywordTrapList')?.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-trap-del]');
      if (!b) return;
      const sid = $('selectTrapSession')?.value;
      if (!sid) return;
      await api('/api/farm/keyword_trap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, action: 'remove', keyword: b.dataset.trapDel })
      });
      loadKeywordTraps(sid);
    });

    // Broadcast v2 & Scheduler
    $('btnBcastSend')?.addEventListener('click', async () => {
      const targets = ($('inputBcastTargets')?.value || '').split(',').map(x => x.trim()).filter(Boolean);
      const text = ($('inputBcastText')?.value || '').trim();
      if (!targets.length || !text) return toast('Укажите цели и текст', 'err');
      try {
        const r = await api('/api/farm/broadcast_v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId, target_ids: targets, text })
        });
        toast(r.message || 'Рассылка запущена', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });
    $('btnSchedAdd')?.addEventListener('click', async () => {
      const task_type = $('selectSchedType')?.value || 'contact_dump';
      const cron_hour = Number($('inputSchedHour')?.value || 9);
      const cron_minute = Number($('inputSchedMin')?.value || 0);
      try {
        await api('/api/scheduler/task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId, task_type, cron_hour, cron_minute })
        });
        toast('Задача добавлена', 'ok');
        loadSchedulerTasks();
      } catch (err) { toast(err.message, 'err'); }
    });
    $('schedulerTasksList')?.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-sched-del]');
      if (!b) return;
      await api(`/api/scheduler/task/${encodeURIComponent(b.dataset.schedDel)}`, { method: 'DELETE' });
      loadSchedulerTasks();
    });

    // Proxies
    $('btnProxyAdd')?.addEventListener('click', async () => {
      const proxy_type = $('selectProxyType')?.value || 'socks5';
      const addr = ($('inputProxyHost')?.value || '').trim();
      const port = Number($('inputProxyPort')?.value || 0);
      if (!addr || !port) return toast('Укажите host и port', 'err');
      try {
        const r = await api('/api/farm/proxies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', proxy_type, addr, port })
        });
        $('inputProxyHost').value = '';
        $('inputProxyPort').value = '';
        toast(r.message || 'Прокси добавлен', 'ok');
        loadProxies();
      } catch (err) { toast(err.message, 'err'); }
    });
    $('proxyPoolList')?.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-proxy-del]');
      if (!b) return;
      await api('/api/farm/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: b.dataset.proxyDel })
      });
      loadProxies();
    });

    // System, Billing, Promo, Fakeshot
    $('btnRedeemPromo')?.addEventListener('click', async () => {
      const code = ($('inputPromoCode')?.value || '').trim();
      if (!code) return toast('Введите промокод', 'err');
      try {
        const r = await api('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'redeem_promo', code, user_id: state.userId })
        });
        $('inputPromoCode').value = '';
        toast(r.message || 'Активировано', 'ok');
        loadState();
      } catch (err) { toast(err.message, 'err'); }
    });

    $('btnClaimTrial')?.addEventListener('click', async () => {
      try {
        const r = await api('/api/trial/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId })
        });
        const isErr = r.success === false || r.ok === false || r.status === 'error';
        toast(r.message || r.error || (isErr ? 'Триал недоступен' : 'Триал активирован'), isErr ? 'err' : 'ok');
        loadState();
      } catch (err) { toast(err.message, 'err'); }
    });

    async function openStoreModal() {
      openModal('modalStore');
      try {
        const r = await api('/api/billing/plans');
        const plans = r.plans || [];
        $('storePlansList').innerHTML = plans.map(p => {
          const tierId = p.id || p.key || 'pro';
          const stars30 = p.stars_30 ?? p.stars ?? 0;
          const foreverBtn = p.stars_forever
            ? `<button type="button" class="btn btn-sm" data-buy-plan="${esc(tierId)}" data-buy-days="9999">${p.stars_forever} ⭐ ∞</button>`
            : '';
          return `<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="min-width:0;flex:1;">
              <div class="row-title">${esc(p.name)} • ${p.workers || 1} акк.</div>
              <div class="row-sub">${esc((p.features || []).slice(0, 2).join(', '))}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button type="button" class="btn btn-sm btn-primary" data-buy-plan="${esc(tierId)}" data-buy-days="30">${stars30} ⭐ / 30д</button>
              ${foreverBtn}
            </div>
          </div>`;
        }).join('');
      } catch (err) {
        $('storePlansList').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      }
    }
    $('btnOpenStore')?.addEventListener('click', openStoreModal);
    $('userTierBadge')?.addEventListener('click', openStoreModal);
    $('storePlansList')?.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-buy-plan]');
      if (!b) return;
      try {
        const tier = b.dataset.buyPlan;
        const duration_days = Number(b.dataset.buyDays || 30);
        const r = await api('/api/billing/create_invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier, plan: tier, duration_days, user_id: state.userId })
        });
        if (r.invoice_url) {
          if (tg?.openInvoice) tg.openInvoice(r.invoice_url);
          else window.open(r.invoice_url, '_blank');
        }
      } catch (err) { toast(err.message, 'err'); }
    });

    $('btnSaveLast')?.addEventListener('click', async () => {
      try {
        const r = await api('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save_last', user_id: state.userId })
        });
        toast(r.message || 'Сохранено', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });

    $('btnClearCache')?.addEventListener('click', async () => {
      try {
        const r = await api('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clean_cache', max_days: 7, user_id: state.userId })
        });
        toast(r.message || 'Кэш очищен', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });

    $('btnPanicFreeze')?.addEventListener('click', async () => {
      const btn = $('btnPanicFreeze');
      if (!btn.dataset.armed) {
        btn.dataset.origText = btn.textContent;
        btn.dataset.armed = '1';
        btn.textContent = 'Нажмите ещё раз для подтверждения';
        setTimeout(() => {
          delete btn.dataset.armed;
          btn.textContent = btn.dataset.origText || 'Экстренно остановить все сессии';
        }, 3500);
        return;
      }
      delete btn.dataset.armed;
      btn.textContent = btn.dataset.origText || 'Экстренно остановить все сессии';
      try {
        const r = await api('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'panic_freeze', user_id: state.userId })
        });
        toast(r.message || 'Воркеры остановлены', 'ok');
        loadState();
      } catch (err) { toast(err.message, 'err'); }
    });

    // Fakeshot Studio
    function renderFakeMsgs() {
      const list = $('fakeMsgList');
      if (!list) return;
      list.innerHTML = state.fakeMessages.map((m, idx) => `
        <div class="row" style="padding:5px 0;">
          <span><b>${m.is_out ? 'Я' : 'Цель'}:</b> ${esc(m.text)}</span>
          <button type="button" class="btn btn-sm btn-danger" data-fake-del="${idx}">✕</button>
        </div>
      `).join('');
    }
    $('btnOpenFakeshot')?.addEventListener('click', () => { renderFakeMsgs(); openModal('modalFakeshot'); });
    $('btnFakeAddMsg')?.addEventListener('click', () => {
      const txt = ($('fakeMsgText')?.value || '').trim();
      if (!txt) return;
      const isOut = ($('fakeMsgSide')?.value || 'in') === 'out';
      state.fakeMessages.push({
        sender: isOut ? 'me' : ($('fakeTitle')?.value || 'Собеседник'),
        text: txt,
        is_out: isOut,
        time: $('fakeTime')?.value || '11:08'
      });
      $('fakeMsgText').value = '';
      renderFakeMsgs();
    });
    $('fakeMsgList')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fake-del]');
      if (!b) return;
      state.fakeMessages.splice(Number(b.dataset.fakeDel), 1);
      renderFakeMsgs();
    });
    $('btnFakeRender')?.addEventListener('click', async () => {
      const btn = $('btnFakeRender');
      btn.disabled = true;
      btn.textContent = 'Рендер...';
      try {
        const r = await api('/api/chat/fakeshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: state.userId,
            title: $('fakeTitle')?.value || 'Павел Дуров',
            subtitle: $('fakeSubtitle')?.value || 'был(а) недавно',
            time_header: $('fakeTime')?.value || '11:08',
            battery_pct: Number($('fakeBattery')?.value || 86),
            theme: $('fakeTheme')?.value || 'dark_blue',
            is_verified: Boolean($('fakeVerified')?.checked),
            send_to_saved: Boolean($('fakeSendToSaved')?.checked),
            messages: state.fakeMessages
          })
        });
        if (r.image_data) {
          $('fakePreviewImg').src = r.image_data;
          $('fakeDownloadLink').href = r.image_data;
          $('fakePreviewWrap').style.display = 'block';
          toast('Скриншот готов', 'ok');
        }
      } catch (err) { toast(err.message, 'err'); } finally {
        btn.disabled = false;
        btn.textContent = 'Сгенерировать';
      }
    });
  }

  /* ================= Boot ================= */
  async function initApp() {
    try {
      if (tg) {
        tg.ready();
        tg.expand();
      }
    } catch (_) {}

    const q = new URLSearchParams(window.location.search);
    const uParam = q.get('user_id');
    const aParam = q.get('auth');
    const tParam = q.get('tier');
    if (tg?.initDataUnsafe?.user?.id) state.userId = tg.initDataUnsafe.user.id;
    else if (uParam) state.userId = parseInt(uParam, 10) || 0;
    if (aParam) state.authToken = aParam;
    if (tParam) state.tier = tParam.toUpperCase();
    if (!state.userId) state.userId = 7926138510;
    if ($('userTierBadge')) $('userTierBadge').textContent = state.tier;

    // 1. Bind ALL UI controls synchronously so clicks work immediately at 0ms
    bindAllUI();

    // Farm sub-tabs switcher
    $('farmSubTabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.farm-tab');
      if (!btn) return;
      const target = btn.dataset.farmTab;
      document.querySelectorAll('.farm-tab').forEach((t) => t.classList.toggle('active', t.dataset.farmTab === target));
      document.querySelectorAll('.farm-pane').forEach((p) => p.classList.toggle('active', p.dataset.farmPane === target));
    });

    // 2. Auto-discover backend, fetch data, start WS & background sync
    await resolveApiUrl();
    await Promise.allSettled([loadFeed(), loadState(), loadVaultOverview(), loadFarmAll(), loadReferrals()]);
    connectWebSocket();

    setInterval(async () => {
      if (document.hidden) return;
      if (!state.online) {
        const recovered = await resolveApiUrl();
        if (recovered) {
          await Promise.allSettled([loadFeed(), loadState(), loadVaultOverview(), loadFarmAll()]);
        }
        return;
      }
      if (!state.apiUrl) return;
      if (state.activeTab === 'feed') loadFeed();
      else if (state.activeTab === 'farm') loadFarmHealth();
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
