/**
 * AyuLite C2 — WebApp Frontend Controller
 * Staff-level asynchronous UI engine with Telegram Haptic feedback & real-time WebSockets
 */

(function () {
  'use strict';

  // State
  const state = {
    userId: 7926138510,
    authToken: '',
    tier: 'ULTIMATE',
    activeTab: 'feed',
    activeFilter: 'all',
    searchQuery: '',
    feedEvents: [],
    vaultChats: [],
    activeChatId: null,
    farmAccounts: [],
    triggers: {
      ghost_read: false,
      anti_delete: true,
      anti_edit: true,
      auto_ttl: true,
      reaction_spy: true
    },
    ws: null,
    reconnectTimer: null
  };

  // Telegram Haptic feedback helper
  function haptic(type = 'light') {
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        if (type === 'selection') {
          window.Telegram.WebApp.HapticFeedback.selectionChanged();
        } else if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(type)) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
        } else if (['error', 'success', 'warning'].includes(type)) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
        }
      }
    } catch (_) {}
  }

  // Toast Notification
  function showToast(text, icon = '⚡️', isError = false) {
    const box = document.getElementById('globalToast');
    const tIcon = document.getElementById('toastIcon');
    const tText = document.getElementById('toastText');
    if (!box) return;

    tIcon.textContent = icon;
    tText.textContent = text;
    if (isError) {
      box.style.borderColor = 'var(--rose)';
      haptic('error');
    } else {
      box.style.borderColor = 'var(--border-medium)';
      haptic('success');
    }

    box.classList.add('show');
    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
      box.classList.remove('show');
    }, 2400);
  }

  // API Request Helper
  async function api(path, options = {}) {
    const headers = options.headers || {};
    if (state.authToken) {
      headers['X-User-Token'] = state.authToken;
      headers['X-User-Id'] = String(state.userId);
    }
    if (window.Telegram?.WebApp?.initData) {
      headers['X-Telegram-Init-Data'] = window.Telegram.WebApp.initData;
    }
    options.headers = headers;

    try {
      const res = await fetch(path, options);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.warn(`[API Error] ${path}:`, e);
      throw e;
    }
  }

  // Initialize App
  function initApp() {
    try {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        window.Telegram.WebApp.enableClosingConfirmation();
      }
    } catch (_) {}

    // Parse URL params
    const q = new URLSearchParams(window.location.search);
    const uParam = q.get('user_id');
    const aParam = q.get('auth');
    const tParam = q.get('tier');

    if (uParam) state.userId = parseInt(uParam, 10) || state.userId;
    if (aParam) state.authToken = aParam;
    if (tParam) state.tier = tParam.toUpperCase();

    // Check initData
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
      state.userId = window.Telegram.WebApp.initDataUnsafe.user.id;
    }

    // Update Header Badges
    const badge = document.getElementById('userTierBadge');
    if (badge) badge.textContent = state.tier;
    const sysOwner = document.getElementById('systemOwnerText');
    if (sysOwner) sysOwner.textContent = `ID: ${state.userId}`;

    // Setup Event Listeners
    setupTabs();
    setupFilters();
    setupSwitches();
    setupModals();
    setupSystemActions();

    // Load Data & Connect WebSocket
    loadState();
    loadVaultOverview();
    loadFarmAccounts();
    connectWebSocket();
  }

  // Tab Navigation Dock
  function setupTabs() {
    const dockBtns = document.querySelectorAll('.dock-btn');
    dockBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        haptic('light');
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.dock-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });
    document.querySelectorAll('.view-container').forEach(v => {
      v.classList.toggle('active', v.id === `view-${tabName}`);
    });

    if (tabName === 'vault' && !state.activeChatId) {
      loadVaultOverview();
    } else if (tabName === 'farm') {
      loadFarmAccounts();
    }
  }

  // Filter Pills in Feed
  function setupFilters() {
    const pills = document.querySelectorAll('.pill-btn');
    pills.forEach(p => {
      p.addEventListener('click', () => {
        haptic('selection');
        pills.forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        state.activeFilter = p.dataset.filter;
        renderFeed();
      });
    });

    const sInput = document.getElementById('feedSearchInput');
    if (sInput) {
      sInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        renderFeed();
      });
    }
  }

  // Switches in Stealth Tab
  function setupSwitches() {
    const map = {
      'switchGhostRead': 'ghost_read',
      'switchAntiDelete': 'anti_delete',
      'switchAntiEdit': 'anti_edit',
      'switchAutoTtl': 'auto_ttl',
      'switchReactionSpy': 'reaction_spy'
    };

    Object.entries(map).forEach(([elId, triggerKey]) => {
      const el = document.getElementById(elId);
      if (!el) return;
      el.addEventListener('change', async () => {
        haptic('medium');
        const newVal = el.checked;
        state.triggers[triggerKey] = newVal;
        try {
          await api('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'toggle_trigger',
              trigger: triggerKey,
              value: newVal,
              user_id: state.userId
            })
          });
          showToast(`${el.closest('.inset-row').querySelector('.row-title').textContent}: ${newVal ? 'Включено' : 'Выключено'}`);
        } catch (err) {
          el.checked = !newVal;
          showToast(`Ошибка сохранения: ${err.message}`, '❌', true);
        }
      });
    });

    const btnSyncVault = document.getElementById('btnSyncVaultForum');
    if (btnSyncVault) {
      btnSyncVault.addEventListener('click', async () => {
        haptic('medium');
        btnSyncVault.disabled = true;
        btnSyncVault.textContent = '⏳ Синхронизация топиков...';
        try {
          const res = await api('/api/vault/create_forum', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: state.userId })
          });
          showToast('Супергруппа-сейф успешно привязана!', '🛡');
        } catch (e) {
          showToast(`Ошибка Сейфа: ${e.message}`, '❌', true);
        } finally {
          btnSyncVault.disabled = false;
          btnSyncVault.textContent = '🔄 Перепривязать ветки супергруппы-сейфа';
        }
      });
    }
  }

  // Modals
  function setupModals() {
    const addModal = document.getElementById('addSessionModal');
    const btnOpen = document.getElementById('btnAddSessionOpen');
    const btnClose = document.getElementById('btnCloseAddSession');
    const btnSubmit = document.getElementById('btnSubmitAddSession');

    if (btnOpen && addModal) {
      btnOpen.addEventListener('click', () => {
        haptic('light');
        addModal.classList.add('active');
      });
    }
    if (btnClose && addModal) {
      btnClose.addEventListener('click', () => {
        haptic('light');
        addModal.classList.remove('active');
      });
    }

    if (btnSubmit) {
      btnSubmit.addEventListener('click', async () => {
        const str = document.getElementById('inputSessionString').value.trim();
        const ph = document.getElementById('inputSessionPhone').value.trim();
        if (!str) {
          showToast('Введите StringSession!', '⚠️', true);
          return;
        }

        haptic('medium');
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Подключение...';
        try {
          await api('/api/farm/add_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_string: str,
              phone: ph,
              user_id: state.userId
            })
          });
          showToast('Аккаунт успешно подключен!', '✅');
          addModal.classList.remove('active');
          document.getElementById('inputSessionString').value = '';
          document.getElementById('inputSessionPhone').value = '';
          loadFarmAccounts();
        } catch (err) {
          showToast(`Ошибка: ${err.message}`, '❌', true);
        } finally {
          btnSubmit.disabled = false;
          btnSubmit.textContent = 'Подключить в пул воркеров';
        }
      });
    }
  }

  // System actions
  function setupSystemActions() {
    const btnClear = document.getElementById('btnClearCacheBtn');
    if (btnClear) {
      btnClear.addEventListener('click', async () => {
        haptic('heavy');
        if (!confirm('Удалить перехваченные медиа старше 7 дней для освобождения места?')) return;
        try {
          await api('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clean_cache', max_days: 7, user_id: state.userId })
          });
          showToast('Кэш медиа успешно очищен!', '🧹');
        } catch (e) {
          showToast('Ошибка очистки кэша', '❌', true);
        }
      });
    }

    const btnCopy = document.getElementById('btnCopyTunnelUrl');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        haptic('light');
        const url = window.location.href;
        navigator.clipboard?.writeText(url).then(() => {
          showToast('Ссылка WebApp скопирована в буфер!', '📋');
        }).catch(() => {
          prompt('Ссылка на WebApp:', url);
        });
      });
    }
  }

  // WebSocket Engine with Auto-Reconnect
  function connectWebSocket() {
    if (state.ws) {
      try { state.ws.close(); } catch (_) {}
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const authParam = state.authToken ? `?auth=${state.authToken}` : '';
    const wsUrl = `${proto}//${window.location.host}/ws/${state.userId}${authParam}`;

    try {
      state.ws = new WebSocket(wsUrl);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    state.ws.onopen = () => {
      const dot = document.querySelector('.status-dot');
      const txt = document.getElementById('headerStatusText');
      if (dot) dot.style.background = 'var(--emerald)';
      if (txt) txt.textContent = 'Live';
    };

    state.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleIncomingEvent(data);
      } catch (_) {}
    };

    state.ws.onclose = () => {
      const dot = document.querySelector('.status-dot');
      const txt = document.getElementById('headerStatusText');
      if (dot) dot.style.background = 'var(--rose)';
      if (txt) txt.textContent = 'Offline';
      scheduleReconnect();
    };

    state.ws.onerror = () => {
      state.ws?.close();
    };
  }

  function scheduleReconnect() {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(connectWebSocket, 4000);
  }

  // Handle live incoming WebSocket events
  function handleIncomingEvent(ev) {
    if (ev.type === 'message_deleted') {
      haptic('warning');
      state.feedEvents.unshift({
        id: `del_${ev.msg_id}_${Date.now()}`,
        type: 'deleted',
        chat_id: ev.chat_id,
        chat_title: `Чат ${ev.chat_id}`,
        sender_name: ev.sender_name || `ID ${ev.sender_id}`,
        time: ev.deleted_at || 'только что',
        text: 'Сообщение было удалено собеседником'
      });
      renderFeed();
      showToast(`Удаление в чате ${ev.chat_id}`, '🗑');
    } else if (ev.type === 'message_edited') {
      haptic('light');
      state.feedEvents.unshift({
        id: `edit_${ev.msg_id}_${Date.now()}`,
        type: 'edited',
        chat_id: ev.chat_id,
        chat_title: `Чат ${ev.chat_id}`,
        sender_name: 'Собеседник',
        time: ev.edited_at || 'только что',
        old_text: ev.old_text,
        new_text: ev.new_text
      });
      renderFeed();
      showToast(`Правка в чате ${ev.chat_id}`, '✏️');
    } else if (ev.type === 'reaction_event') {
      haptic('light');
      state.feedEvents.unshift({
        id: `rx_${ev.msg_id}_${Date.now()}`,
        type: 'reactions',
        chat_id: ev.chat_id,
        chat_title: `Чат ${ev.chat_id}`,
        sender_name: ev.actor_name || `ID ${ev.actor_id}`,
        time: ev.time || 'только что',
        old_rx: ev.old_reactions,
        new_rx: ev.new_reactions
      });
      renderFeed();
      showToast(`Реакция: ${ev.old_reactions} ➔ ${ev.new_reactions}`, '⚡️');
    } else if (ev.type === 'active_chat_update') {
      // update status bar
    }
  }

  // Load Initial State
  async function loadState() {
    try {
      const data = await api(`/api/state/${state.userId}`);
      if (data && data.triggers) {
        state.triggers = Object.assign(state.triggers, data.triggers);
        Object.entries(state.triggers).forEach(([k, v]) => {
          const el = document.getElementById(`switch${k.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`);
          if (el) el.checked = Boolean(v);
        });
      }
    } catch (_) {}
  }

  // Load Vault Overview (Chats)
  async function loadVaultOverview() {
    const listEl = document.getElementById('vaultChatsList');
    const placeEl = document.getElementById('vaultChatsPlaceholder');
    if (!listEl) return;

    try {
      const res = await api(`/api/vault/overview/${state.userId}`);
      const chats = res.chats || [];
      state.vaultChats = chats;

      if (!chats.length) {
        placeEl.style.display = 'block';
        placeEl.textContent = 'Перехваченных сообщений пока нет';
        listEl.innerHTML = '';
        return;
      }

      placeEl.style.display = 'none';
      listEl.innerHTML = chats.map(c => `
        <div class="inset-row chat-card" data-cid="${c.chat_id}" style="cursor: pointer;">
          <div class="row-left">
            <div class="avatar-initials">${(c.title || 'C').charAt(0).toUpperCase()}</div>
            <div class="row-info">
              <div class="row-title">${escapeHtml(c.title || `Диалог ${c.chat_id}`)}</div>
              <div class="row-desc">${c.total_intercepts || 0} событий зафиксировано</div>
            </div>
          </div>
          <span class="tier-pill" style="font-size: 11px;">Открыть →</span>
        </div>
      `).join('');

      // Click to open chat
      listEl.querySelectorAll('.chat-card').forEach(card => {
        card.addEventListener('click', () => {
          haptic('light');
          openChatMessages(parseInt(card.dataset.cid, 10), card.querySelector('.row-title').textContent);
        });
      });
    } catch (e) {
      if (placeEl) placeEl.textContent = 'Ошибка загрузки диалогов';
    }
  }

  // Open Chat Messages Stream
  async function openChatMessages(chatId, title) {
    state.activeChatId = chatId;
    document.getElementById('vaultChatsCard').style.display = 'none';
    const wrap = document.getElementById('vaultConversationWrap');
    wrap.style.display = 'block';
    document.getElementById('activeChatTitle').textContent = title;

    const stream = document.getElementById('vaultMessagesStream');
    stream.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Загрузка сообщений...</div>';

    const btnBack = document.getElementById('btnBackToChats');
    btnBack.onclick = () => {
      haptic('light');
      state.activeChatId = null;
      wrap.style.display = 'none';
      document.getElementById('vaultChatsCard').style.display = 'block';
      loadVaultOverview();
    };

    try {
      const res = await api(`/api/vault/messages/${state.userId}/${chatId}`);
      const msgs = res.messages || res.items || [];
      if (!msgs.length) {
        stream.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">В этом диалоге нет перехваченных сообщений.</div>';
        return;
      }

      stream.innerHTML = msgs.map(m => {
        const isDel = m.is_deleted;
        const isEd = m.is_edited;
        const tagClass = isDel ? 'deleted' : (isEd ? 'edited' : 'ttl');
        const tagLabel = isDel ? 'УДАЛЕНО' : (isEd ? 'ИЗМЕНЕНО' : 'TTL');

        let bodyHtml = `<div style="font-size: 13px;">${escapeHtml(m.text || '')}</div>`;
        if (isEd && m.original_text) {
          bodyHtml = `
            <div class="feed-quote">
              <del>${escapeHtml(m.original_text)}</del><br>
              <ins>${escapeHtml(m.text || '')}</ins>
            </div>
          `;
        }

        return `
          <div style="background: var(--bg-card-hover); border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 8px; border-left: 3px solid ${isDel ? 'var(--rose)' : 'var(--accent)'};">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-weight: 600; font-size: 12.5px;">${escapeHtml(m.sender_name || 'Собеседник')}</span>
              <span class="type-tag ${tagClass}">${tagLabel}</span>
            </div>
            ${bodyHtml}
            <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 4px; text-align: right;">${m.date || ''}</div>
          </div>
        `;
      }).join('');
    } catch (err) {
      stream.innerHTML = `<div style="color: var(--rose); text-align: center; padding: 20px;">Ошибка: ${err.message}</div>`;
    }
  }

  // Load Farm Accounts
  async function loadFarmAccounts() {
    const listEl = document.getElementById('farmAccountsList');
    if (!listEl) return;

    try {
      const res = await api(`/api/farm/accounts/${state.userId}`);
      const accounts = res.accounts || [];
      state.farmAccounts = accounts;

      if (!accounts.length) {
        listEl.innerHTML = `
          <div class="inset-card" style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
            Аккаунты юзерботов еще не добавлены.<br>
            Нажмите <b>«+ Добавить»</b> для привязки.
          </div>
        `;
        return;
      }

      listEl.innerHTML = accounts.map(a => `
        <div class="inset-card" style="padding: 14px 16px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="status-dot" style="background: ${a.is_active ? 'var(--emerald)' : 'var(--text-muted)'}; box-shadow: none;"></span>
              <span style="font-weight: 600; font-size: 14px;">${escapeHtml(a.name || a.session_id.substring(0, 8))}</span>
            </div>
            <span class="tier-pill" style="color: ${a.is_active ? 'var(--emerald)' : 'var(--text-muted)'}; font-size: 10.5px;">
              ${a.is_active ? 'ОНЛАЙН' : 'ОФФЛАЙН'}
            </span>
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
            <div>📱 Номер: <span style="color: var(--text-primary);">${a.phone || 'Не указан'}</span></div>
            <div>💻 Фингерпринт: <span style="color: var(--text-primary); font-family: var(--font-mono); font-size: 11px;">${escapeHtml(a.device_model || 'Desktop x64')}</span></div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary btn-farm-restart" data-sid="${a.session_id}" style="flex: 1; padding: 6px; font-size: 12px;">🔄 Рестарт</button>
            <button class="btn-secondary danger btn-farm-delete" data-sid="${a.session_id}" style="flex: 1; padding: 6px; font-size: 12px;">🗑 Удалить</button>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.btn-farm-restart').forEach(b => {
        b.addEventListener('click', async () => {
          haptic('medium');
          try {
            await api('/api/farm/control', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'restart', session_id: b.dataset.sid, user_id: state.userId })
            });
            showToast('Воркер перезапускается...');
            loadFarmAccounts();
          } catch (e) {
            showToast(`Ошибка: ${e.message}`, '❌', true);
          }
        });
      });

      listEl.querySelectorAll('.btn-farm-delete').forEach(b => {
        b.addEventListener('click', async () => {
          haptic('heavy');
          if (!confirm('Полностью отключить и удалить сессию?')) return;
          try {
            await api('/api/farm/control', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'delete', session_id: b.dataset.sid, user_id: state.userId })
            });
            showToast('Сессия удалена');
            loadFarmAccounts();
          } catch (e) {
            showToast(`Ошибка: ${e.message}`, '❌', true);
          }
        });
      });
    } catch (_) {
      listEl.innerHTML = '<div class="inset-card" style="text-align: center; padding: 24px; color: var(--rose);">Ошибка загрузки фермы</div>';
    }
  }

  // Render Feed Items
  function renderFeed() {
    const list = document.getElementById('feedList');
    if (!list) return;

    let items = state.feedEvents;
    if (state.activeFilter !== 'all') {
      items = items.filter(x => x.type === state.activeFilter);
    }
    if (state.searchQuery) {
      items = items.filter(x => 
        (x.sender_name && x.sender_name.toLowerCase().includes(state.searchQuery)) ||
        (x.text && x.text.toLowerCase().includes(state.searchQuery)) ||
        (x.old_text && x.old_text.toLowerCase().includes(state.searchQuery)) ||
        (x.new_text && x.new_text.toLowerCase().includes(state.searchQuery))
      );
    }

    if (!items.length) {
      list.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
          <p>Нет перехваченных событий по выбранному фильтру.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = items.map(it => {
      let badgeClass = 'deleted';
      let badgeText = 'УДАЛЕНО';
      let contentHtml = '';

      if (it.type === 'edited') {
        badgeClass = 'edited';
        badgeText = 'ПРАВКА';
        contentHtml = `
          <div class="feed-quote">
            <del>${escapeHtml(it.old_text || '')}</del><br>
            <ins>${escapeHtml(it.new_text || '')}</ins>
          </div>
        `;
      } else if (it.type === 'reactions') {
        badgeClass = 'reaction';
        badgeText = 'РЕАКЦИЯ';
        contentHtml = `
          <div style="font-size: 13px; margin: 6px 0;">
            Смайл: <span style="font-size: 16px;">${it.old_rx}</span> ➔ <span style="font-size: 16px;">${it.new_rx}</span>
          </div>
        `;
      } else if (it.type === 'ttl') {
        badgeClass = 'ttl';
        badgeText = '1-VIEW TTL';
        contentHtml = `<div style="font-size: 13px; color: var(--sky);">🔥 Сгорающее медиа перехвачено и сохранено в Сейф</div>`;
      } else {
        contentHtml = `<div class="feed-quote">${escapeHtml(it.text || 'Текст сообщения удален')}</div>`;
      }

      return `
        <article class="feed-item">
          <div class="feed-item-head">
            <div class="sender-badge">
              <div class="avatar-initials">${(it.sender_name || 'U').charAt(0).toUpperCase()}</div>
              <span class="sender-name">${escapeHtml(it.sender_name || 'Пользователь')}</span>
            </div>
            <span class="type-tag ${badgeClass}">${badgeText}</span>
          </div>
          ${contentHtml}
          <div class="feed-footer">
            <span>${escapeHtml(it.chat_title || 'Диалог')}</span>
            <span>${it.time}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Boot on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
