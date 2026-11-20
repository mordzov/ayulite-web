/**
 * AyuLite C2 — Master WebApp Controller (v8.6)
 * High-performance async frontend with dynamic Tunnel/API routing,
 * Telegram Haptic feedback, auto-failover, and full SQLite Vault synchronization.
 */

(function () {
  'use strict';

  // State Management
  const state = {
    userId: 7926138510,
    authToken: '',
    tier: 'CREATOR',
    apiUrl: '',
    activeTab: 'feed',
    activeFilter: 'all',
    searchQuery: '',
    feedEvents: [],
    vaultChats: [],
    activeChatId: null,
    farmAccounts: [],
    stats: {
      deleted: 0,
      edited: 0,
      ttl: 0,
      reactions: 0
    },
    triggers: {
      ghost_read: false,
      stealth_always_enabled: false,
      stealth_typing: false,
      silent_ear: true,
      anti_delete: true,
      anti_edit: true,
      auto_ttl: true,
      reaction_spy: true,
      voip_guard: true
    },
    ws: null,
    reconnectTimer: null
  };

  // Telegram Haptic Feedback Integration
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
    }, 2500);
  }

  // Resolve backend API URL (handles GitHub Pages proxy to local tunnel)
  async function resolveApiUrl() {
    const q = new URLSearchParams(window.location.search);
    const apiParam = q.get('api');

    // 1. Explicit ?api= parameter in WebApp URL
    if (apiParam && apiParam.startsWith('http')) {
      state.apiUrl = apiParam.replace(/\/$/, '');
      console.log('[API] Resolved via URL query param:', state.apiUrl);
      return;
    }

    // 2. Direct localhost / loopback execution
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      state.apiUrl = window.location.origin;
      console.log('[API] Resolved via local origin:', state.apiUrl);
      return;
    }

    // 3. Hosted on GitHub Pages: load tunnel.json
    try {
      const res = await fetch('tunnel.json?v=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data.api_url) {
          state.apiUrl = data.api_url.replace(/\/$/, '');
          console.log('[API] Resolved via tunnel.json:', state.apiUrl);
          return;
        }
      }
    } catch (e) {
      console.warn('[API] Could not fetch tunnel.json:', e);
    }

    // 4. Default fallback to origin
    state.apiUrl = window.location.origin;
    console.log('[API] Fallback to origin:', state.apiUrl);
  }

  // Resilient API Fetch Helper with CORS & Auth Headers
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

    const base = state.apiUrl || window.location.origin;
    const fullUrl = path.startsWith('http') ? path : `${base}${path}`;

    try {
      const res = await fetch(fullUrl, options);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.warn(`[API] Error on ${fullUrl}:`, e);
      throw e;
    }
  }

  // Application Entry Point
  async function initApp() {
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

    // Telegram initData override
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
      state.userId = window.Telegram.WebApp.initDataUnsafe.user.id;
    }

    // Owner ID defaults to CREATOR
    if (state.userId === 7926138510 || state.userId === 6249211286) {
      state.tier = 'CREATOR';
    }

    // Update Header Badges
    const badge = document.getElementById('userTierBadge');
    if (badge) badge.textContent = state.tier;

    // Resolve Backend API & Tunnel
    await resolveApiUrl();

    // Setup UI Handlers
    setupTabs();
    setupFilters();
    setupSwitches();
    setupModals();
    setupSystemActions();
    setupFakeshotStudio();

    // Load Live Data Concurrently
    await Promise.allSettled([
      loadFeed(),
      loadState(),
      loadVaultOverview(),
      loadFarmAccounts()
    ]);

    // Connect WebSocket
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

    if (tabName === 'feed') {
      loadFeed();
    } else if (tabName === 'vault' && !state.activeChatId) {
      loadVaultOverview();
    } else if (tabName === 'farm') {
      loadFarmAccounts();
    } else if (tabName === 'system') {
      loadState();
    }
  }

  // Filter Pills & Search Input in Feed
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
    const sClear = document.getElementById('feedSearchClear');
    if (sInput) {
      sInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        if (sClear) sClear.style.display = state.searchQuery ? 'block' : 'none';
        renderFeed();
      });
    }

    if (sClear && sInput) {
      sClear.addEventListener('click', () => {
        sInput.value = '';
        state.searchQuery = '';
        sClear.style.display = 'none';
        renderFeed();
      });
    }
  }

  // Switches in Stealth & Protection Tab
  function setupSwitches() {
    const map = {
      'switchGhostRead': 'ghost_read',
      'switchStealthAlways': 'stealth_always_enabled',
      'switchStealthTyping': 'stealth_typing',
      'switchSilentEar': 'silent_ear',
      'switchAntiDelete': 'anti_delete',
      'switchAntiEdit': 'anti_edit',
      'switchAutoTtl': 'auto_ttl',
      'switchReactionSpy': 'reaction_spy',
      'switchVoipGuard': 'voip_guard'
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
          const rowTitle = el.closest('.inset-row')?.querySelector('.row-title')?.textContent || triggerKey;
          showToast(`${rowTitle}: ${newVal ? 'Включено' : 'Выключено'}`);
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
          await api('/api/vault/create_forum', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: state.userId })
          });
          showToast('Супергруппа-сейф успешно привязана!', '🛡');
          loadVaultOverview();
        } catch (e) {
          showToast(`Ошибка Сейфа: ${e.message}`, '❌', true);
        } finally {
          btnSyncVault.disabled = false;
          btnSyncVault.textContent = '🔄 Перепривязать ветки супергруппы-сейфа';
        }
      });
    }
  }

  // Modals Controller
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

  // Fakeshot Studio iOS 18 Modal & Controller
  function setupFakeshotStudio() {
    const modal = document.getElementById('fakeshotModal');
    const btnOpen = document.getElementById('btnOpenFakeshotModal');
    const btnClose = document.getElementById('btnCloseFakeshot');
    const btnGen = document.getElementById('btnGenerateFakeshot');
    const resultWrap = document.getElementById('fakeshotResultWrap');
    const previewImg = document.getElementById('fakeshotPreviewImg');
    const downloadA = document.getElementById('btnDownloadFakeshot');

    if (btnOpen && modal) {
      btnOpen.addEventListener('click', () => {
        haptic('light');
        modal.classList.add('active');
      });
    }
    if (btnClose && modal) {
      btnClose.addEventListener('click', () => {
        haptic('light');
        modal.classList.remove('active');
      });
    }

    if (btnGen) {
      btnGen.addEventListener('click', async () => {
        const title = document.getElementById('fakeTitle').value.trim() || 'Павел Дуров';
        const subtitle = document.getElementById('fakeSubtitle').value.trim() || 'был(а) недавно';
        const text = document.getElementById('fakeMessageText').value.trim() || 'Привет';
        const timeHeader = document.getElementById('fakeTime').value.trim() || '14:28';
        const batteryPct = parseInt(document.getElementById('fakeBattery').value, 10) || 86;

        haptic('medium');
        btnGen.disabled = true;
        btnGen.textContent = '⏳ Рендеринг iOS 18...';
        try {
          const res = await api('/api/chat/fakeshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title,
              subtitle: subtitle,
              time_header: timeHeader,
              battery_pct: batteryPct,
              messages: [
                { sender: title, text: text, is_out: false, time: timeHeader }
              ],
              user_id: state.userId
            })
          });

          if (res.image_data) {
            previewImg.src = res.image_data;
            downloadA.href = res.image_data;
            resultWrap.style.display = 'block';
            showToast('Скриншот iOS 18 сгенерирован!', '📸');
          }
        } catch (e) {
          showToast(`Ошибка генератора: ${e.message}`, '❌', true);
        } finally {
          btnGen.disabled = false;
          btnGen.textContent = 'Сгенерировать iOS 18 скриншот';
        }
      });
    }
  }

  // Operator Center Actions
  function setupSystemActions() {
    const btnClear = document.getElementById('btnClearCacheBtn');
    if (btnClear) {
      btnClear.addEventListener('click', async () => {
        haptic('heavy');
        if (!confirm('Очистить временные закэшированные медиа-файлы сессии?')) return;
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

    const btnSyncDirect = document.getElementById('btnSyncForumTopicsDirect');
    if (btnSyncDirect) {
      btnSyncDirect.addEventListener('click', async () => {
        haptic('medium');
        btnSyncDirect.disabled = true;
        btnSyncDirect.innerHTML = '⏳ Синхронизация топиков...';
        try {
          await api('/api/vault/create_forum', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: state.userId })
          });
          showToast('Топики Сейфа синхронизированы!', '⚡️');
          loadVaultOverview();
        } catch (e) {
          showToast(`Ошибка: ${e.message}`, '❌', true);
        } finally {
          btnSyncDirect.disabled = false;
          btnSyncDirect.innerHTML = '⚡️ Быстрая синхронизация топиков Сейфа';
        }
      });
    }

    const btnPanic = document.getElementById('btnPanicFreeze');
    if (btnPanic) {
      btnPanic.addEventListener('click', async () => {
        haptic('heavy');
        if (!confirm('🚨 Экстренная заморозка (Panic Freeze): временно отключить все фоновые воркеры?')) return;
        try {
          await api('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'panic_freeze', user_id: state.userId })
          });
          showToast('Активность воркеров заморожена!', '🚨');
        } catch (e) {
          showToast(`Ошибка: ${e.message}`, '❌', true);
        }
      });
    }
  }

  // Load Accumulated Feed Events from SQLite via API (with auto-retry on connect)
  async function loadFeed(retryCount = 0) {
    try {
      const res = await api(`/api/feed/${state.userId}?limit=150`);
      if (res && res.items) {
        state.feedEvents = res.items;
        setOnlineStatus(true);
      }
      updateFilterCounters();
      renderFeed();
    } catch (e) {
      console.warn('[Feed] Error loading feed:', e);
      renderFeed();
      if (retryCount < 4) {
        setTimeout(() => loadFeed(retryCount + 1), 2500);
      }
    }
  }

  function setOnlineStatus(isOnline) {
    const dot = document.querySelector('.status-dot');
    const txt = document.getElementById('headerStatusText');
    if (dot) {
      dot.style.background = isOnline ? 'var(--emerald)' : 'var(--rose)';
      dot.style.boxShadow = isOnline ? '0 0 8px var(--emerald)' : 'none';
    }
    if (txt) {
      txt.textContent = isOnline ? 'Live' : 'Offline';
    }
  }

  // Update Counters in Filter Pills
  function updateFilterCounters() {
    const all = state.feedEvents.length;
    let del = 0, ed = 0, ttl = 0, rx = 0;
    state.feedEvents.forEach(item => {
      if (item.type === 'deleted') del++;
      else if (item.type === 'edited') ed++;
      else if (item.type === 'ttl') ttl++;
      else if (item.type === 'reactions') rx++;
    });

    const cAll = document.getElementById('countFilterAll');
    const cDel = document.getElementById('countFilterDel');
    const cEd = document.getElementById('countFilterEd');
    const cTtl = document.getElementById('countFilterTtl');
    const cRx = document.getElementById('countFilterRx');

    if (cAll) cAll.textContent = all;
    if (cDel) cDel.textContent = del;
    if (cEd) cEd.textContent = ed;
    if (cTtl) cTtl.textContent = ttl;
    if (cRx) cRx.textContent = rx;
  }

  // Render Feed Intercept Cards
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
        (x.chat_title && x.chat_title.toLowerCase().includes(state.searchQuery)) ||
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
            <ins>${escapeHtml(it.new_text || it.text || '')}</ins>
          </div>
        `;
      } else if (it.type === 'reactions') {
        badgeClass = 'reaction';
        badgeText = 'РЕАКЦИЯ';
        contentHtml = `
          <div style="font-size: 13px; margin: 6px 0; color: var(--text-primary);">
            Изменение смайла: <span style="font-size: 15px;">${escapeHtml(it.old_rx)}</span> ➔ <span style="font-size: 15px;">${escapeHtml(it.new_rx)}</span>
          </div>
        `;
      } else if (it.type === 'ttl') {
        badgeClass = 'ttl';
        badgeText = `1-VIEW TTL ${it.ttl ? `(${it.ttl}s)` : ''}`;
        contentHtml = `<div class="feed-quote" style="border-left-color: var(--sky); color: var(--sky);">🔥 Одноразовое медиа перехвачено до уничтожения таймером</div>`;
      } else {
        const txt = it.text || (it.media_type ? `[${it.media_type.toUpperCase()} перехвачено в Сейф]` : 'Сообщение было удалено');
        contentHtml = `<div class="feed-quote">${escapeHtml(txt)}</div>`;
      }

      return `
        <article class="feed-item" data-cid="${it.chat_id || 0}">
          <div class="feed-item-head">
            <div class="sender-badge">
              <div class="avatar-initials">${(it.sender_name || 'U').charAt(0).toUpperCase()}</div>
              <span class="sender-name">${escapeHtml(it.sender_name || 'Собеседник')}</span>
            </div>
            <span class="type-tag ${badgeClass}">${badgeText}</span>
          </div>
          ${contentHtml}
          <div class="feed-footer">
            <span style="font-weight: 500; color: var(--text-secondary);">${escapeHtml(it.chat_title || 'Диалог')}</span>
            <span>${escapeHtml(it.time || '')}</span>
          </div>
        </article>
      `;
    }).join('');

    // Clicking feed card switches to Vault view for that chat
    list.querySelectorAll('.feed-item').forEach(card => {
      card.addEventListener('click', () => {
        const cid = parseInt(card.dataset.cid, 10);
        if (cid) {
          haptic('light');
          switchTab('vault');
          openChatMessages(cid, card.querySelector('.feed-footer span').textContent);
        }
      });
    });
  }

  // Load Initial State & Live Counters (with auto-retry)
  async function loadState(retryCount = 0) {
    try {
      const data = await api(`/api/state/${state.userId}`);
      if (!data) return;

      setOnlineStatus(true);

      // Update Operator VIP Card
      if (data.account) {
        const acc = data.account;
        const opName = document.getElementById('opName');
        const opUser = document.getElementById('opUsername');
        const opAv = document.getElementById('opAvatar');
        const opSafe = document.getElementById('opSafeChannel');

        if (opName && acc.name) opName.textContent = acc.name;
        if (opUser && acc.username) opUser.textContent = `@${acc.username}`;
        if (opAv && acc.name) opAv.textContent = acc.name.charAt(0).toUpperCase();
        if (opSafe && acc.log_channel_id) opSafe.textContent = `AyuVault (${acc.log_channel_id})`;
      }

      // Update Metrics Counters
      if (data.stats) {
        state.stats = data.stats;
        const elDel = document.getElementById('statDeletedCount');
        const elEd = document.getElementById('statEditedCount');
        const elTtl = document.getElementById('statTtlCount');
        const elRx = document.getElementById('statReactionsCount');

        if (elDel) elDel.textContent = data.stats.total || data.stats.deleted || 0;
        if (elEd) elEd.textContent = data.stats.edited || 0;
        if (elTtl) elTtl.textContent = data.stats.ttl || data.stats.ttl_count || 0;
        if (elRx) elRx.textContent = data.stats.reactions || 0;
      }

      // Update Triggers Checkboxes
      if (data.triggers) {
        state.triggers = Object.assign(state.triggers, data.triggers);
        const map = {
          'switchGhostRead': 'ghost_read',
          'switchStealthAlways': 'stealth_always_enabled',
          'switchStealthTyping': 'stealth_typing',
          'switchSilentEar': 'silent_ear',
          'switchAntiDelete': 'anti_delete',
          'switchAntiEdit': 'anti_edit',
          'switchAutoTtl': 'auto_ttl',
          'switchReactionSpy': 'reaction_spy',
          'switchVoipGuard': 'voip_guard'
        };
        Object.entries(map).forEach(([elId, k]) => {
          const el = document.getElementById(elId);
          if (el && state.triggers[k] !== undefined) {
            el.checked = Boolean(state.triggers[k]);
          }
        });
      }
    } catch (_) {}
  }

  // Load Vault Overview (Chats Grouped by Dialogs)
  async function loadVaultOverview() {
    const listEl = document.getElementById('vaultChatsList');
    const placeEl = document.getElementById('vaultChatsPlaceholder');
    const totalEl = document.getElementById('vaultChatsTotalCount');
    if (!listEl) return;

    try {
      const res = await api(`/api/vault/overview/${state.userId}`);
      if (!res) return;

      // Update Forum Banner if present
      if (res.forum && res.forum.channel_id) {
        const fTitle = document.getElementById('vaultForumTitle');
        const fId = document.getElementById('vaultForumId');
        const fLink = document.getElementById('vaultForumLink');
        if (fTitle) fTitle.textContent = res.forum.title || 'AyuVault • Супергруппа Сейфа';
        if (fId) fId.textContent = `ID: ${res.forum.channel_id} • Ветви активны`;
        if (fLink && res.forum.invite_link) fLink.href = res.forum.invite_link;
      }

      // Flatten chats from groups, dm, channels
      let chats = [];
      if (Array.isArray(res.chats)) {
        chats = res.chats;
      } else if (res.chats && typeof res.chats === 'object') {
        chats = [
          ...(res.chats.dm || []),
          ...(res.chats.groups || []),
          ...(res.chats.channels || [])
        ];
      }

      state.vaultChats = chats;
      if (totalEl) totalEl.textContent = `${chats.length} диалогов`;

      if (!chats.length) {
        placeEl.style.display = 'block';
        placeEl.textContent = 'Перехваченных диалогов пока нет.';
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
              <div class="row-desc">${c.deleted_count || 1} событий зафиксировано • ${escapeHtml(c.preview || 'Медиа')}</div>
            </div>
          </div>
          <span class="tier-pill" style="font-size: 11px; color: var(--accent);">Смотреть →</span>
        </div>
      `).join('');

      listEl.querySelectorAll('.chat-card').forEach(card => {
        card.addEventListener('click', () => {
          haptic('light');
          openChatMessages(parseInt(card.dataset.cid, 10), card.querySelector('.row-title').textContent);
        });
      });
    } catch (e) {
      if (placeEl) placeEl.textContent = 'Ошибка загрузки диалогов Сейфа';
    }
  }

  // Open Chat Messages Stream for a specific dialogue
  async function openChatMessages(chatId, title) {
    state.activeChatId = chatId;
    document.getElementById('vaultChatsCard').style.display = 'none';
    const wrap = document.getElementById('vaultConversationWrap');
    wrap.style.display = 'block';
    document.getElementById('activeChatTitle').textContent = title;

    const stream = document.getElementById('vaultMessagesStream');
    stream.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Загрузка сообщений из Сейфа...</div>';

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
        const tagLabel = isDel ? 'УДАЛЕНО' : (isEd ? 'ПРАВКА' : 'TTL');

        let bodyHtml = `<div style="font-size: 13px; color: var(--text-primary);">${escapeHtml(m.text || '')}</div>`;
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
            <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 4px; text-align: right;">${m.date || m.deleted_at || ''}</div>
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
            <div>💻 Фингерпринт: <span style="color: var(--text-primary); font-family: var(--font-mono); font-size: 11px;">${escapeHtml(a.device_model || 'Windows 11 Pro x64')}</span></div>
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

  // WebSocket Live Connection
  function connectWebSocket() {
    if (state.ws) {
      try { state.ws.close(); } catch (_) {}
    }

    const base = state.apiUrl || window.location.origin;
    let wsProto = base.startsWith('https') ? 'wss:' : 'ws:';
    let wsHost = base.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!wsHost) {
      wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsHost = window.location.host;
    }

    const authParam = state.authToken ? `?auth=${state.authToken}` : '';
    const wsUrl = `${wsProto}//${wsHost}/ws/${state.userId}${authParam}`;

    try {
      state.ws = new WebSocket(wsUrl);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    state.ws.onopen = () => {
      setOnlineStatus(true);
    };

    state.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleIncomingEvent(data);
      } catch (_) {}
    };

    state.ws.onclose = () => {
      // If HTTP API works, don't show offline just because WS disconnected
      if (!state.feedEvents.length) {
        setOnlineStatus(false);
      }
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

  // Handle Live WebSocket Events
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
      updateFilterCounters();
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
      updateFilterCounters();
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
      updateFilterCounters();
      renderFeed();
      showToast(`Реакция: ${ev.old_reactions} ➔ ${ev.new_reactions}`, '⚡️');
    }
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

  // Auto-boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
