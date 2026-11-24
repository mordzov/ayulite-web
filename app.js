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
    activeMediaFilter: 'all',
    activeContactFilter: null,
    searchQuery: '',
    dateFilterFrom: null,
    dateFilterTo: null,
    groupByDays: false,
    showDuplicatesOnly: false,
    feedEvents: [],
    archivedEvents: JSON.parse(localStorage.getItem('ayulite_archived_events') || '[]'),
    searchHistory: JSON.parse(localStorage.getItem('ayulite_search_history') || '[]'),
    contactTags: JSON.parse(localStorage.getItem('ayulite_contact_tags') || '{}'),
    favouriteContacts: JSON.parse(localStorage.getItem('ayulite_fav_contacts') || '[]'),
    smartFolders: JSON.parse(localStorage.getItem('ayulite_smart_folders') || '[]'),
    activeSmartFolderId: null,
    lightboxMediaList: [],
    lightboxCurrentIdx: 0,
    slideshowTimer: null,
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

  // Active health-check for C2 backend
  async function testApiReachable(url) {
    if (!url || !url.startsWith('http')) return false;
    const base = url.replace(/\/$/, '');
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(`${base}/api/ping`, {
        method: 'GET',
        signal: ctrl.signal
      });
      clearTimeout(tid);
      if (res.status === 200 || res.status === 401 || res.status === 403) return true;
    } catch (_) {}

    try {
      const ctrl2 = new AbortController();
      const tid2 = setTimeout(() => ctrl2.abort(), 2500);
      const testUrl2 = `${base}/api/state/${state.userId}`;
      const res2 = await fetch(testUrl2, {
        method: 'GET',
        headers: { 'X-User-Token': state.authToken || '', 'X-User-Id': String(state.userId) },
        signal: ctrl2.signal
      });
      clearTimeout(tid2);
      return res2.status === 200 || res2.status === 401 || res2.status === 403;
    } catch (_) {
      return false;
    }
  }

  function showOfflineBanner(msg) {
    const b = document.getElementById('c2OfflineBanner');
    if (!b) return;
    b.style.display = 'flex';
    const txt = b.querySelector('.c2-offline-text');
    if (txt && msg) txt.textContent = msg;
  }

  function hideOfflineBanner() {
    const b = document.getElementById('c2OfflineBanner');
    if (b) b.style.display = 'none';
  }

  // Resolve backend API URL (handles URL query, tunnel.json, local dev, with health check)
  async function resolveApiUrl() {
    const q = new URLSearchParams(window.location.search);
    const apiParam = q.get('api');

    // 1. Explicit ?api= parameter in WebApp URL
    if (apiParam && apiParam.startsWith('http')) {
      const cleanParam = apiParam.replace(/\/$/, '');
      const isAlive = await testApiReachable(cleanParam);
      if (isAlive) {
        state.apiUrl = cleanParam;
        setOnlineStatus(true);
        hideOfflineBanner();
        console.log('[API] Resolved & verified via URL query param:', state.apiUrl);
        return true;
      }
      console.warn('[API] Query ?api= unreachable, attempting tunnel.json failover:', cleanParam);
    }

    // 2. Direct localhost / loopback execution
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      state.apiUrl = window.location.origin;
      setOnlineStatus(true);
      hideOfflineBanner();
      console.log('[API] Resolved via local origin:', state.apiUrl);
      return true;
    }

    // 3. Hosted on GitHub Pages: load tunnel.json with cache busting
    try {
      const res = await fetch('tunnel.json?v=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.api_url) {
          const candidate = data.api_url.replace(/\/$/, '');
          const isAlive = await testApiReachable(candidate);
          if (isAlive) {
            state.apiUrl = candidate;
            setOnlineStatus(true);
            hideOfflineBanner();
            console.log('[API] Resolved & verified via tunnel.json:', state.apiUrl);
            return true;
          }
          state.apiUrl = candidate;
          setOnlineStatus(false);
          showOfflineBanner('Сервер C2 оффлайн • Запустите bot_main.py');
          console.warn('[API] tunnel.json candidate applied (unverified/offline):', state.apiUrl);
          return false;
        }
      }
    } catch (e) {
      console.warn('[API] Could not fetch tunnel.json:', e);
    }

    // 4. Default fallback to apiParam or origin
    if (apiParam && apiParam.startsWith('http')) {
      state.apiUrl = apiParam.replace(/\/$/, '');
    } else {
      state.apiUrl = window.location.origin;
    }
    setOnlineStatus(false);
    showOfflineBanner('Сервер C2 оффлайн • Запустите bot_main.py');
    console.log('[API] Fallback to origin (offline):', state.apiUrl);
    return false;
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
      setOnlineStatus(false);
      // Background retry resolving tunnel URL
      resolveApiUrl().catch(() => {});
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

    // Owner ID defaults to CREATOR, but allow testing via query parameter ?tier=none
    if ((state.userId === 7926138510 || state.userId === 6249211286) && (!tParam || tParam.toLowerCase() !== 'none')) {
      state.tier = 'CREATOR';
    }

    // Update Header Badges immediately
    const badge = document.getElementById('userTierBadge');
    if (badge) badge.textContent = state.tier;

    // Show Store Hero Banner immediately if tier is restricted
    const storeBanner = document.getElementById('storeHeroBanner');
    if (storeBanner) {
      const isRestricted = (state.tier === 'NONE' || state.tier === 'БАЗОВЫЙ' || state.tier === 'DEMO');
      storeBanner.style.display = isRestricted ? 'flex' : 'none';
    }

    // Resolve Backend API & Tunnel
    await resolveApiUrl();

    // Setup UI Handlers
    setupTabs();
    setupFilters();
    setupSwitches();
    setupModals();
    setupSystemActions();
    setupFakeshotStudio();
    setupStoreAndAutomations();

    // Load Live Data Concurrently
    await Promise.allSettled([
      loadFeed(),
      loadState(),
      loadVaultOverview(),
      loadFarmAccounts()
    ]);

    // Connect WebSocket and start fast background poller fallback
    connectWebSocket();
    startFeedBackgroundSync();
  }

  // Auto-sync polling fallback for instant detection even without WS
  function startFeedBackgroundSync() {
    setInterval(async () => {
      if (document.hidden || !state.apiUrl) return;
      try {
        const feedData = await api(`/api/feed/${state.userId}?limit=30`);
        setOnlineStatus(true);
        if (feedData && feedData.items && feedData.items.length) {
          const existingIds = new Set(state.feedEvents.map(x => x.id));
          let hasNew = false;
          for (const item of feedData.items) {
            if (!existingIds.has(item.id)) {
              state.feedEvents.unshift(item);
              hasNew = true;
            }
          }
          if (hasNew) {
            updateFilterCounters();
            renderFeed();
          }
        }
      } catch (_) {
        setOnlineStatus(false);
        resolveApiUrl().catch(() => {});
      }
    }, 4000);
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

  // Filter Pills, Media Chips, Search History & Feed Tools
  function setupFilters() {
    // Collapsible Sub-Filter Drawer
    const btnToggleSub = document.getElementById('btnToggleSubFilters');
    const subBar = document.getElementById('subFilterBar');
    if (btnToggleSub && subBar) {
      btnToggleSub.addEventListener('click', () => {
        haptic('light');
        const isHidden = subBar.style.display === 'none';
        subBar.style.display = isHidden ? 'flex' : 'none';
        btnToggleSub.classList.toggle('open', isHidden);
      });
    }
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

    // Media Filter Chips (Feature 11)
    const mediaChips = document.querySelectorAll('.media-chip');
    mediaChips.forEach(chip => {
      chip.addEventListener('click', () => {
        haptic('selection');
        mediaChips.forEach(x => x.classList.remove('active'));
        chip.classList.add('active');
        state.activeMediaFilter = chip.dataset.media;
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

      sInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && state.searchQuery) {
          saveSearchQuery(state.searchQuery);
        }
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

    // Search History UI (Feature 9)
    renderSearchHistory();
    const btnClearHistory = document.getElementById('btnClearSearchHistory');
    if (btnClearHistory) {
      btnClearHistory.addEventListener('click', () => {
        state.searchHistory = [];
        localStorage.removeItem('ayulite_search_history');
        renderSearchHistory();
        haptic('light');
      });
    }

    // Date Range Picker (Feature 10)
    const btnToggleRange = document.getElementById('btnToggleDateRange');
    const rangeBar = document.getElementById('dateRangeBar');
    if (btnToggleRange && rangeBar) {
      btnToggleRange.addEventListener('click', () => {
        const isHidden = rangeBar.style.display === 'none';
        rangeBar.style.display = isHidden ? 'flex' : 'none';
        btnToggleRange.classList.toggle('active', isHidden);
        haptic('light');
      });
    }

    const btnApplyDate = document.getElementById('btnApplyDateFilter');
    if (btnApplyDate) {
      btnApplyDate.addEventListener('click', () => {
        const dFrom = document.getElementById('dateFilterFrom')?.value;
        const dTo = document.getElementById('dateFilterTo')?.value;
        state.dateFilterFrom = dFrom || null;
        state.dateFilterTo = dTo || null;
        showToast(dFrom || dTo ? `Фильтр дат: ${dFrom || '...'} — ${dTo || '...'}` : 'Фильтр сброшен');
        renderFeed();
        haptic('medium');
      });
    }

    const btnResetDate = document.getElementById('btnResetDateFilter');
    if (btnResetDate) {
      btnResetDate.addEventListener('click', () => {
        state.dateFilterFrom = null;
        state.dateFilterTo = null;
        const inFrom = document.getElementById('dateFilterFrom');
        const inTo = document.getElementById('dateFilterTo');
        if (inFrom) inFrom.value = '';
        if (inTo) inTo.value = '';
        renderFeed();
        haptic('light');
      });
    }

    // Toggle Grouping By Days (Feature 15)
    const btnDayGroup = document.getElementById('btnToggleDateGrouping');
    if (btnDayGroup) {
      btnDayGroup.addEventListener('click', () => {
        state.groupByDays = !state.groupByDays;
        btnDayGroup.classList.toggle('active', state.groupByDays);
        btnDayGroup.textContent = state.groupByDays ? '📅 По дням: ВКЛ' : '📅 По дням';
        renderFeed();
        haptic('selection');
      });
    }

    // Find Duplicates (Feature 16)
    const btnFindDups = document.getElementById('btnFindDuplicates');
    if (btnFindDups) {
      btnFindDups.addEventListener('click', () => {
        state.showDuplicatesOnly = !state.showDuplicatesOnly;
        btnFindDups.classList.toggle('active', state.showDuplicatesOnly);
        btnFindDups.textContent = state.showDuplicatesOnly ? '⚠️ Только дубли' : '🔍 Дубликаты';
        renderFeed();
        haptic('selection');
      });
    }

    // Archive Feed to Today (Feature 14)
    const btnArchive = document.getElementById('btnArchiveFeedToday');
    if (btnArchive) {
      btnArchive.addEventListener('click', () => {
        if (!state.feedEvents.length) {
          showToast('Лента уже пуста', 'ℹ️');
          return;
        }
        state.archivedEvents = state.archivedEvents.concat(state.feedEvents);
        state.feedEvents = [];
        localStorage.setItem('ayulite_archived_events', JSON.stringify(state.archivedEvents));
        updateFilterCounters();
        renderFeed();
        showToast('📦 Все события перенесены в архив', '✓');
        haptic('success');
      });
    }

    // Start Slideshow (Feature 11)
    const btnSlide = document.getElementById('btnStartSlideshow');
    if (btnSlide) {
      btnSlide.addEventListener('click', () => {
        const firstPhoto = state.feedEvents.find(x => (x.media_type || '').toLowerCase() === 'photo');
        if (firstPhoto) {
          const base = state.apiUrl || window.location.origin;
          let mUrl = firstPhoto.media_url || `/api/vault/media/${firstPhoto.session_id}/${firstPhoto.msg_id}`;
          const full = `${mUrl}${mUrl.includes('?') ? '&' : '?'}auth=${encodeURIComponent(state.authToken || '')}&user_id=${state.userId}`;
          window.openMediaLightbox(full, firstPhoto.sender_name, firstPhoto.time, firstPhoto.text);
          setTimeout(() => toggleSlideshow(), 300);
        } else {
          showToast('Нет фото в текущей ленте для слайдшоу', '📷');
        }
      });
    }

    // Smart Folders (Feature 13)
    renderSmartFolders();
    const sfModal = document.getElementById('smartFolderModal');
    const btnOpenSF = document.getElementById('btnOpenSmartFolders');
    const btnAddSFDirect = document.getElementById('btnAddSmartFolderDirect');
    const btnCloseSF = document.getElementById('btnCloseSmartFolder');
    const btnSaveSF = document.getElementById('btnSaveSmartFolder');
    const btnResetSF = document.getElementById('btnResetSmartFolder');

    window.populateSfSenders = function() {
      const sel = document.getElementById('sfSenderSelect');
      if (!sel) return;
      const senders = new Map();
      state.feedEvents.forEach(it => {
        const id = it.sender_id || '';
        const name = it.sender_name || (id ? `ID ${id}` : '');
        const user = it.sender_username || '';
        const val = user ? `@${user}` : (id ? String(id) : name);
        if (val && !senders.has(val)) {
          senders.set(val, name ? `${name} (${val})` : val);
        }
      });
      sel.innerHTML = '<option value="">-- Любой отправитель --</option>' +
        Array.from(senders.entries()).map(([v, label]) => `<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`).join('');
    };

    window.updateSfLiveCount = function() {
      const countEl = document.getElementById('sfLiveCount');
      if (!countEl) return;
      const dummySf = {
        type: document.getElementById('sfType')?.value || 'all',
        sender: (document.getElementById('sfSender')?.value || '').trim(),
        period: document.getElementById('sfPeriod')?.value || 'all',
        media: document.getElementById('sfMedia')?.value || 'all'
      };
      let count = 0;
      state.feedEvents.forEach(it => {
        if (matchesSmartFolderRule(it, dummySf)) count++;
      });
      countEl.textContent = `${count} ${count === 1 ? 'событие' : (count >= 2 && count <= 4 ? 'события' : 'событий')}`;
    };

    if (btnResetSF) {
      btnResetSF.addEventListener('click', () => {
        state.activeSmartFolderId = null;
        renderSmartFolders();
        renderFeed();
        showToast('Фильтр папки сброшен', '📁');
        haptic('light');
      });
    }

    if (btnOpenSF && sfModal) {
      btnOpenSF.addEventListener('click', () => {
        sfModal.style.display = 'flex';
        populateSfSenders();
        renderSmartFolders();
        updateSfLiveCount();
        haptic('light');
      });
    }
    if (btnAddSFDirect && sfModal) {
      btnAddSFDirect.addEventListener('click', () => {
        sfModal.style.display = 'flex';
        populateSfSenders();
        updateSfLiveCount();
        haptic('light');
      });
    }
    if (btnCloseSF && sfModal) {
      btnCloseSF.addEventListener('click', () => {
        sfModal.style.display = 'none';
        haptic('light');
      });
    }

    // Modal field listeners for live count
    const sfSenderSelect = document.getElementById('sfSenderSelect');
    if (sfSenderSelect) {
      sfSenderSelect.addEventListener('change', () => {
        const val = sfSenderSelect.value;
        const inSender = document.getElementById('sfSender');
        if (inSender) inSender.value = val;
        updateSfLiveCount();
      });
    }

    ['sfName', 'sfType', 'sfSender', 'sfPeriod', 'sfMedia'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateSfLiveCount);
        el.addEventListener('change', updateSfLiveCount);
      }
    });

    // 1-Click Automation Presets
    document.querySelectorAll('.sf-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        haptic('selection');
        const p = btn.dataset.preset;
        const inName = document.getElementById('sfName');
        const inType = document.getElementById('sfType');
        const inSender = document.getElementById('sfSender');
        const inPeriod = document.getElementById('sfPeriod');
        const inMedia = document.getElementById('sfMedia');
        const sSelect = document.getElementById('sfSenderSelect');

        if (p === 'deleted_contact') {
          if (inType) inType.value = 'deleted';
          if (inMedia) inMedia.value = 'all';
          if (inPeriod) inPeriod.value = 'all';
          if (!inSender.value && sSelect && sSelect.options.length > 1) {
            sSelect.selectedIndex = 1;
            inSender.value = sSelect.value;
          }
          if (inName) inName.value = inSender.value ? `🗑 Удаленные: ${inSender.value}` : '🗑 Удаленные сообщения';
        } else if (p === 'voice_all') {
          if (inType) inType.value = 'all';
          if (inMedia) inMedia.value = 'voice';
          if (inPeriod) inPeriod.value = 'all';
          if (inName) inName.value = '🎙 Все голосовые';
        } else if (p === 'ttl_photos') {
          if (inType) inType.value = 'ttl';
          if (inMedia) inMedia.value = 'photo';
          if (inPeriod) inPeriod.value = 'all';
          if (inName) inName.value = '🔥 Сгорающие фото (TTL)';
        } else if (p === 'edits_all') {
          if (inType) inType.value = 'edited';
          if (inMedia) inMedia.value = 'all';
          if (inPeriod) inPeriod.value = 'all';
          if (inName) inName.value = '✏️ Все правки';
        } else if (p === 'media_week') {
          if (inType) inType.value = 'all';
          if (inMedia) inMedia.value = 'photo';
          if (inPeriod) inPeriod.value = 'week';
          if (inName) inName.value = '🎬 Медиа за 7 дней';
        }
        updateSfLiveCount();
      });
    });

    if (btnSaveSF) {
      btnSaveSF.addEventListener('click', () => {
        const name = (document.getElementById('sfName')?.value || '').trim();
        if (!name) {
          showToast('Укажите название папки', '⚠️');
          return;
        }
        const newFolder = {
          id: `sf_${Date.now()}`,
          name: name,
          type: document.getElementById('sfType')?.value || 'all',
          sender: (document.getElementById('sfSender')?.value || '').trim(),
          period: document.getElementById('sfPeriod')?.value || 'all',
          media: document.getElementById('sfMedia')?.value || 'all'
        };
        state.smartFolders.push(newFolder);
        state.activeSmartFolderId = newFolder.id; // Auto-activate the created folder
        localStorage.setItem('ayulite_smart_folders', JSON.stringify(state.smartFolders));
        const inName = document.getElementById('sfName');
        const inSender = document.getElementById('sfSender');
        if (inName) inName.value = '';
        if (inSender) inSender.value = '';
        if (sfModal) sfModal.style.display = 'none';
        renderSmartFolders();
        renderFeed();
        showToast(`Папка «${name}» создана и активна!`, '📁');
        haptic('success');
      });
    }

    // Universal Mouse Drag & Wheel Horizontal Scroll (Fix for Desktop & Telegram)
    makeHorizontalScrollable('.filter-pills');
    makeHorizontalScrollable('.smart-folders-bar');
    makeHorizontalScrollable('.media-type-chips');
    makeHorizontalScrollable('.feed-tool-btns');
    makeHorizontalScrollable('.fav-contacts-section');
    makeHorizontalScrollable('.search-history-row');

    // Setup Pull-to-refresh
    setupPullToRefresh();
  }

  function saveSearchQuery(query) {
    if (!query) return;
    state.searchHistory = [query, ...state.searchHistory.filter(x => x !== query)].slice(0, 10);
    localStorage.setItem('ayulite_search_history', JSON.stringify(state.searchHistory));
    renderSearchHistory();
  }

  function renderSearchHistory() {
    const row = document.getElementById('searchHistoryRow');
    const container = document.getElementById('searchHistoryChips');
    if (!row || !container) return;
    if (!state.searchHistory.length) {
      row.style.display = 'none';
      return;
    }
    row.style.display = 'flex';
    container.innerHTML = state.searchHistory.map(q => `
      <span class="history-chip" onclick="window.applySearchQuery('${escapeHtml(q)}')">
        ${escapeHtml(q)}
      </span>
    `).join('');
  }

  window.applySearchQuery = function(q) {
    const sInput = document.getElementById('feedSearchInput');
    const sClear = document.getElementById('feedSearchClear');
    if (sInput) sInput.value = q;
    if (sClear) sClear.style.display = 'block';
    state.searchQuery = q.toLowerCase().trim();
    renderFeed();
    haptic('selection');
  };

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


  // Cyberpunk Stars Store & Quick Automation Controller
  function setupStoreAndAutomations() {
    const storeModal = document.getElementById('tierStoreModal');
    const btnCloseStore = document.getElementById('btnCloseStore');
    const heroBtn = document.getElementById('btnOpenStoreHero');
    const fadStoreBtn = document.getElementById('fadStoreBtn');
    const tierBadge = document.getElementById('userTierBadge');
    const opTierBadge = document.getElementById('opTierBadge');

    function openStore() {
      if (storeModal) {
        haptic('medium');
        storeModal.classList.add('active');
      }
    }

    function closeStore() {
      if (storeModal) {
        haptic('light');
        storeModal.classList.remove('active');
      }
    }

    if (heroBtn) heroBtn.addEventListener('click', openStore);
    if (fadStoreBtn) fadStoreBtn.addEventListener('click', openStore);
    if (tierBadge) {
      tierBadge.style.cursor = 'pointer';
      tierBadge.title = 'Нажмите для выбора тарифа';
      tierBadge.addEventListener('click', openStore);
    }
    if (opTierBadge) {
      opTierBadge.style.cursor = 'pointer';
      opTierBadge.addEventListener('click', openStore);
    }
    if (btnCloseStore) btnCloseStore.addEventListener('click', closeStore);

    if (storeModal) {
      storeModal.addEventListener('click', (e) => {
        if (e.target === storeModal) closeStore();
      });
    }

    // Duration Switcher (30 days vs Forever)
    const btnDur30 = document.getElementById('btnDur30');
    const btnDurForever = document.getElementById('btnDurForever');
    let currentDuration = 30;

    const pricePro = document.getElementById('priceValPro');
    const pricePrem = document.getElementById('priceValPrem');
    const priceUlt = document.getElementById('priceValUlt');

    const btnBuyPro = document.getElementById('btnBuyPro');
    const btnBuyPrem = document.getElementById('btnBuyPrem');
    const btnBuyUlt = document.getElementById('btnBuyUlt');

    function updatePricing(duration) {
      currentDuration = duration;
      if (duration === 30) {
        btnDur30?.classList.add('active');
        btnDurForever?.classList.remove('active');
        if (pricePro) pricePro.textContent = '150';
        if (pricePrem) pricePrem.textContent = '350';
        if (priceUlt) priceUlt.textContent = '599';
        if (btnBuyPro) {
          btnBuyPro.textContent = '⭐ Оплатить 150 Stars';
          btnBuyPro.dataset.plan = 'pro_30';
        }
        if (btnBuyPrem) {
          btnBuyPrem.textContent = '⭐ Оплатить 350 Stars';
          btnBuyPrem.dataset.plan = 'prem_30';
        }
        if (btnBuyUlt) {
          btnBuyUlt.textContent = '⭐ Оплатить 599 Stars';
          btnBuyUlt.dataset.plan = 'ult_30';
        }
      } else {
        btnDurForever?.classList.add('active');
        btnDur30?.classList.remove('active');
        if (pricePro) pricePro.textContent = '499';
        if (pricePrem) pricePrem.textContent = '899';
        if (priceUlt) priceUlt.textContent = '1499';
        if (btnBuyPro) {
          btnBuyPro.textContent = '⭐ Оплатить 499 Stars (Forever)';
          btnBuyPro.dataset.plan = 'pro_forever';
        }
        if (btnBuyPrem) {
          btnBuyPrem.textContent = '⭐ Оплатить 899 Stars (Forever)';
          btnBuyPrem.dataset.plan = 'prem_forever';
        }
        if (btnBuyUlt) {
          btnBuyUlt.textContent = '⭐ Оплатить 1499 Stars (Forever)';
          btnBuyUlt.dataset.plan = 'ult_forever';
        }
      }
    }

    if (btnDur30) {
      btnDur30.addEventListener('click', () => {
        haptic('selection');
        updatePricing(30);
      });
    }
    if (btnDurForever) {
      btnDurForever.addEventListener('click', () => {
        haptic('selection');
        updatePricing(9999);
      });
    }
    updatePricing(30);

    // Seamless Fallback to Telegram Bot Stars Invoice
    function fallbackToBot(planKey) {
      const tgLink = `https://t.me/AyuLiteBot?start=buy_${planKey}`;
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(tgLink);
      } else {
        window.open(tgLink, '_blank');
      }
      showToast('Открываем счёт в Telegram...', '⭐');
      closeStore();
    }

    // Purchase Plan Handler via Telegram Stars Invoice
    async function handleBuy(planKey, btnEl) {
      haptic('medium');
      const originalText = btnEl ? btnEl.textContent : '';
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = '⏳ Создание счёта...';
      }

      // If backend is offline or tunnel unavailable, fallback immediately to bot deep link
      if (!state.apiUrl) {
        fallbackToBot(planKey);
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = originalText;
        }
        return;
      }

      try {
        const payload = {
          plan: planKey,
          user_id: state.userId
        };
        const res = await api('/api/billing/create_invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res && res.invoice_link) {
          if (window.Telegram?.WebApp?.openInvoice) {
            window.Telegram.WebApp.openInvoice(res.invoice_link, async (status) => {
              if (status === 'paid') {
                showToast('🎉 Подписка активирована!', '👑');
                haptic('success');
                closeStore();
                await loadState();
              } else if (status === 'cancelled') {
                showToast('Оплата отменена', 'ℹ️');
              } else if (status === 'failed') {
                showToast('Сбой при проведении оплаты', '⚠️', true);
              }
            });
          } else {
            window.open(res.invoice_link, '_blank');
            showToast('Счёт открыт в Telegram', '⭐');
          }
        } else {
          fallbackToBot(planKey);
        }
      } catch (err) {
        console.warn('[Billing] Fallback to bot invoice:', err);
        fallbackToBot(planKey);
      } finally {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = originalText;
        }
      }
    }

    window.openStoreModal = openStore;
    window.closeStoreModal = closeStore;

    if (btnBuyPro) {
      btnBuyPro.addEventListener('click', () => {
        const plan = btnBuyPro.dataset.plan || (currentDuration === 30 ? 'pro_30' : 'pro_forever');
        handleBuy(plan, btnBuyPro);
      });
    }
    if (btnBuyPrem) {
      btnBuyPrem.addEventListener('click', () => {
        const plan = btnBuyPrem.dataset.plan || (currentDuration === 30 ? 'prem_30' : 'prem_forever');
        handleBuy(plan, btnBuyPrem);
      });
    }
    if (btnBuyUlt) {
      btnBuyUlt.addEventListener('click', () => {
        const plan = btnBuyUlt.dataset.plan || (currentDuration === 30 ? 'ult_30' : 'ult_forever');
        handleBuy(plan, btnBuyUlt);
      });
    }

    // Promo Code Redemption
    const btnPromo = document.getElementById('btnApplyStorePromo');
    const inputPromo = document.getElementById('storePromoCode');
    async function redeemCode() {
      const code = (inputPromo ? inputPromo.value : '').trim();
      if (!code) {
        showToast('Введите промокод!', '⚠️', true);
        return;
      }
      haptic('medium');
      if (btnPromo) {
        btnPromo.disabled = true;
        btnPromo.textContent = '...';
      }
      try {
        const res = await api('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'redeem_promo',
            user_id: state.userId,
            code: code
          })
        });
        showToast(res.message || 'Промокод активирован!', '🎉');
        haptic('success');
        if (inputPromo) inputPromo.value = '';
        closeStore();
        await loadState();
      } catch (e) {
        showToast(e.message || 'Неверный промокод', '❌', true);
      } finally {
        if (btnPromo) {
          btnPromo.disabled = false;
          btnPromo.textContent = 'Применить';
        }
      }
    }
    if (btnPromo) btnPromo.addEventListener('click', redeemCode);
    if (inputPromo) {
      inputPromo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') redeemCode();
      });
    }

    // Quick Automations: Floating Action Dock
    const fadGhost = document.getElementById('fadGhostToggle');
    const fadTtl = document.getElementById('fadTtlToggle');
    const fadSnatcher = document.getElementById('fadSnatcherBtn');

    if (fadGhost) {
      fadGhost.addEventListener('click', async () => {
        haptic('selection');
        const newState = !state.triggers.ghost_read;
        state.triggers.ghost_read = newState;
        fadGhost.classList.toggle('active', newState);
        const switchEl = document.getElementById('switchGhostRead');
        if (switchEl) switchEl.checked = newState;
        showToast(newState ? '👻 Призрак ВКЛ' : '👻 Призрак ВЫКЛ');
        try {
          await api('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'set_trigger',
              user_id: state.userId,
              name: 'ghost_read',
              enabled: newState
            })
          });
        } catch (_) {}
      });
    }

    if (fadTtl) {
      fadTtl.addEventListener('click', async () => {
        haptic('selection');
        const newState = !state.triggers.auto_ttl;
        state.triggers.auto_ttl = newState;
        fadTtl.classList.toggle('active', newState);
        const switchEl = document.getElementById('switchAutoTtl');
        if (switchEl) switchEl.checked = newState;
        showToast(newState ? '🔥 TTL Снайпер ВКЛ' : '🔥 TTL Снайпер ВЫКЛ');
        try {
          await api('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'set_trigger',
              user_id: state.userId,
              name: 'auto_ttl',
              enabled: newState
            })
          });
        } catch (_) {}
      });
    }

    // Snatcher Modal
    const snatcherModal = document.getElementById('snatcherModal');
    const btnCloseSnatcher = document.getElementById('btnCloseSnatcher');
    const btnSnatchExecute = document.getElementById('btnSnatchExecute');
    const inputSnatcherLink = document.getElementById('snatcherInputLink');
    const snatcherStatus = document.getElementById('snatcherStatusBox');

    if (fadSnatcher && snatcherModal) {
      fadSnatcher.addEventListener('click', () => {
        haptic('light');
        snatcherModal.classList.add('active');
        if (inputSnatcherLink) inputSnatcherLink.focus();
      });
    }
    if (btnCloseSnatcher && snatcherModal) {
      btnCloseSnatcher.addEventListener('click', () => {
        haptic('light');
        snatcherModal.classList.remove('active');
      });
    }
    if (snatcherModal) {
      snatcherModal.addEventListener('click', (e) => {
        if (e.target === snatcherModal) snatcherModal.classList.remove('active');
      });
    }

    if (btnSnatchExecute) {
      btnSnatchExecute.addEventListener('click', async () => {
        const link = (inputSnatcherLink ? inputSnatcherLink.value : '').trim();
        if (!link) {
          showToast('Вставьте ссылку на пост или канал!', '⚠️', true);
          return;
        }
        haptic('medium');
        btnSnatchExecute.disabled = true;
        btnSnatchExecute.textContent = '⏳ Выгрузка...';
        if (snatcherStatus) {
          snatcherStatus.style.display = 'block';
          snatcherStatus.textContent = '🔄 Подключение к каналу и обход NoForwards...';
        }
        try {
          const res = await api('/api/snatcher/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: state.userId,
              link: link,
              count: 10
            })
          });
          const msg = res.message || `Успешно выгружено: ${res.downloaded || 1} медиа`;
          showToast(msg, '📥');
          haptic('success');
          if (snatcherStatus) {
            snatcherStatus.textContent = `✅ ${msg}. Проверьте Избранное ('me')!`;
          }
          if (inputSnatcherLink) inputSnatcherLink.value = '';
          setTimeout(() => {
            if (snatcherModal) snatcherModal.classList.remove('active');
            if (snatcherStatus) snatcherStatus.style.display = 'none';
          }, 1800);
        } catch (e) {
          showToast(e.message || 'Ошибка Snatcher', '❌', true);
          if (snatcherStatus) {
            snatcherStatus.textContent = `❌ Ошибка: ${e.message}`;
          }
        } finally {
          btnSnatchExecute.disabled = false;
          btnSnatchExecute.textContent = '⚡️ Стянуть';
        }
      });
    }

    // Auto-open store if requested via URL
    const q = new URLSearchParams(window.location.search);
    if (q.get('view') === 'store' || q.get('tab') === 'store' || q.get('show_store') === '1') {
      openStore();
    }
  }

  // Fakeshot Studio Pro iOS 18 Modal & Controller
  function setupFakeshotStudio() {
    const modal = document.getElementById('fakeshotModal');
    const btnOpen = document.getElementById('btnOpenFakeshotModal');
    const btnClose = document.getElementById('btnCloseFakeshot');
    const btnGen = document.getElementById('btnGenerateFakeshot');
    const btnAddMsg = document.getElementById('btnAddFakeMsg');
    const msgsContainer = document.getElementById('fakeMessagesContainer');
    const resultWrap = document.getElementById('fakeshotResultWrap');
    const previewImg = document.getElementById('fakeshotPreviewImg');
    const downloadA = document.getElementById('btnDownloadFakeshot');

    let dialogueMessages = [
      { text: 'Привет, всё готово к запуску?', is_out: false, time: '11:07', is_deleted: false },
      { text: 'Да, все тесты пройдены, запускаем.', is_out: true, time: '11:08', is_deleted: false }
    ];

    let selectedAvatarB64 = null;
    let selectedPreset = 'durov';

    const avBtns = modal?.querySelectorAll('.fake-av-btn') || [];
    const avUpload = document.getElementById('fakeAvatarUpload');
    const avLabel = document.getElementById('fakeAvatarLabel');

    avBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        haptic('light');
        avBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPreset = btn.dataset.preset;
        selectedAvatarB64 = null;
        if (avLabel) avLabel.textContent = btn.textContent.trim();
      });
    });

    if (avUpload) {
      avUpload.addEventListener('change', () => {
        const file = avUpload.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          selectedAvatarB64 = e.target.result;
          avBtns.forEach(b => b.classList.remove('active'));
          if (avLabel) avLabel.textContent = `Загружено: ${file.name.slice(0, 12)}...`;
          showToast('Аватарка загружена!', '🖼');
        };
        reader.readAsDataURL(file);
      });
    }

    function renderDialogueInputs() {
      if (!msgsContainer) return;
      msgsContainer.innerHTML = dialogueMessages.map((m, idx) => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <select class="fake-msg-sender search-input" data-idx="${idx}" style="width: auto; padding: 2px 6px; font-size: 11px; background: var(--bg-card);">
              <option value="in" ${!m.is_out ? 'selected' : ''}>📥 Собеседник (Входящее)</option>
              <option value="out" ${m.is_out ? 'selected' : ''}>📤 Я (Исходящее)</option>
            </select>
            <div style="display: flex; align-items: center; gap: 8px;">
              <label style="font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer; color: var(--text-muted);">
                <input type="checkbox" class="fake-msg-del" data-idx="${idx}" ${m.is_deleted ? 'checked' : ''}> 🗑
              </label>
              <button type="button" class="btn-remove-fake-msg" data-idx="${idx}" style="background: none; border: none; color: var(--rose); cursor: pointer; font-size: 14px; padding: 0 4px;">✕</button>
            </div>
          </div>
          <textarea class="fake-msg-text search-input" data-idx="${idx}" style="width: 100%; height: 46px; resize: none; background: var(--bg-card); padding: 4px 8px; font-size: 12px; margin-bottom: 4px;" placeholder="Текст сообщения...">${escapeHtml(m.text)}</textarea>
          <div style="display: flex; justify-content: flex-end; align-items: center; gap: 6px;">
            <span style="font-size: 10.5px; color: var(--text-muted);">Время:</span>
            <input type="text" class="fake-msg-time search-input" data-idx="${idx}" value="${escapeHtml(m.time)}" style="width: 65px; padding: 2px 6px; font-size: 11px; text-align: center; background: var(--bg-card);">
          </div>
        </div>
      `).join('');

      // Wire remove buttons
      msgsContainer.querySelectorAll('.btn-remove-fake-msg').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          dialogueMessages.splice(idx, 1);
          renderDialogueInputs();
        });
      });

      // Wire inputs
      msgsContainer.querySelectorAll('.fake-msg-sender').forEach(s => {
        s.addEventListener('change', () => {
          dialogueMessages[parseInt(s.dataset.idx, 10)].is_out = s.value === 'out';
        });
      });
      msgsContainer.querySelectorAll('.fake-msg-text').forEach(t => {
        t.addEventListener('input', () => {
          dialogueMessages[parseInt(t.dataset.idx, 10)].text = t.value;
        });
      });
      msgsContainer.querySelectorAll('.fake-msg-time').forEach(tm => {
        tm.addEventListener('input', () => {
          dialogueMessages[parseInt(tm.dataset.idx, 10)].time = tm.value;
        });
      });
      msgsContainer.querySelectorAll('.fake-msg-del').forEach(d => {
        d.addEventListener('change', () => {
          dialogueMessages[parseInt(d.dataset.idx, 10)].is_deleted = d.checked;
        });
      });
    }

    if (btnAddMsg) {
      btnAddMsg.addEventListener('click', () => {
        haptic('light');
        const lastTime = dialogueMessages.length ? dialogueMessages[dialogueMessages.length - 1].time : '11:08';
        dialogueMessages.push({ text: 'Новое сообщение', is_out: true, time: lastTime, is_deleted: false });
        renderDialogueInputs();
      });
    }

    renderDialogueInputs();

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
        const title = document.getElementById('fakeTitle')?.value.trim() || 'Павел Дуров';
        const subtitle = document.getElementById('fakeSubtitle')?.value.trim() || 'был(а) недавно';
        const timeHeader = document.getElementById('fakeTime')?.value.trim() || '11:08';
        const batteryPct = parseInt(document.getElementById('fakeBattery')?.value, 10) || 86;
        const carrier = document.getElementById('fakeCarrier')?.value || '5G';
        const theme = document.getElementById('fakeTheme')?.value || 'dark_blue';
        const isVerified = document.getElementById('fakeVerified')?.checked ?? true;
        const dynamicIsland = document.getElementById('fakeDynamicIsland')?.checked ?? true;
        const autoHeight = document.getElementById('fakeAutoHeight')?.checked ?? true;
        const sendToSaved = document.getElementById('fakeSendToSaved')?.checked ?? false;

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
              carrier: carrier,
              theme: theme,
              is_verified: isVerified,
              dynamic_island: dynamicIsland,
              auto_height: autoHeight,
              send_to_saved: sendToSaved,
              avatar_base64: selectedAvatarB64,
              avatar_preset: selectedPreset,
              messages: dialogueMessages.map(m => ({
                sender: m.is_out ? 'me' : title,
                text: m.text,
                is_out: m.is_out,
                time: m.time,
                is_deleted: m.is_deleted
              })),
              user_id: state.userId
            })
          });

          if (res.image_data) {
            previewImg.src = res.image_data;
            downloadA.href = res.image_data;
            resultWrap.style.display = 'block';
            showToast('Скриншот iOS 18 сгенерирован!', '📸');
            if (sendToSaved) {
              showToast('Отправлено в Избранное!', '✈️');
            }
          }
        } catch (e) {
          showToast(`Ошибка генератора: ${e.message}`, '❌', true);
        } finally {
          btnGen.disabled = false;
          btnGen.textContent = '📸 Сгенерировать iOS 18 скриншот';
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

    const btnRetryConn = document.getElementById('btnRetryC2Connection');
    if (btnRetryConn) {
      btnRetryConn.addEventListener('click', async () => {
        haptic('medium');
        btnRetryConn.textContent = '⏳ Проверка...';
        showToast('Проверка соединения с C2 сервером...', '⏳');
        const ok = await resolveApiUrl();
        btnRetryConn.textContent = '🔄 Подключиться';
        if (ok) {
          showToast('✅ Связь с C2 успешно установлена!', '✓');
          haptic('success');
          loadFeed();
          loadState();
          loadVaultOverview();
          loadFarmAccounts();
          connectWebSocket();
        } else {
          showToast('Сервер C2 не отвечает. Запустите bot_main.py', '⚠️', true);
          haptic('error');
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
    if (isOnline) {
      hideOfflineBanner();
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
    const cArch = document.getElementById('countFilterArchived');

    if (cAll) cAll.textContent = all;
    if (cDel) cDel.textContent = del;
    if (cEd) cEd.textContent = ed;
    if (cTtl) cTtl.textContent = ttl;
    if (cRx) cRx.textContent = rx;
    if (cArch) cArch.textContent = state.archivedEvents.length;

    renderFavContactsBar();
  }

  // Render Feed Intercept Cards with All Wave 2 Automation Features
  function renderFeed() {
    const list = document.getElementById('feedList');
    if (!list) return;

    let items = state.activeFilter === 'archived' ? state.archivedEvents : state.feedEvents;

    // 1. Filter by event type
    if (state.activeFilter !== 'all' && state.activeFilter !== 'archived') {
      items = items.filter(x => x.type === state.activeFilter);
    }

    // 2. Filter by media type (Feature 11)
    if (state.activeMediaFilter !== 'all') {
      items = items.filter(x => (x.media_type || '').toLowerCase() === state.activeMediaFilter);
    }

    // 3. Filter by favourite / specific contact (Feature 42)
    if (state.activeContactFilter) {
      items = items.filter(x => x.sender_id === state.activeContactFilter);
    }

    // 4. Filter by date range (Feature 10)
    if (state.dateFilterFrom || state.dateFilterTo) {
      items = items.filter(x => {
        const tStr = x.time || '';
        // Match dates like 2026-11-20 or 20.11.2026
        let itemDate = null;
        const dMatch = tStr.match(/(\d{4})-(\d{2})-(\d{2})/) || tStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (dMatch) {
          itemDate = dMatch[1].length === 4 ? `${dMatch[1]}-${dMatch[2]}-${dMatch[3]}` : `${dMatch[3]}-${dMatch[2]}-${dMatch[1]}`;
        }
        if (!itemDate) return true;
        if (state.dateFilterFrom && itemDate < state.dateFilterFrom) return false;
        if (state.dateFilterTo && itemDate > state.dateFilterTo) return false;
        return true;
      });
    }

    // 5. Search query matching text, names, IDs, chat_ids (Feature 12)
    if (state.searchQuery) {
      const q = state.searchQuery;
      const isDigits = /^\d+$/.test(q);
      items = items.filter(x => {
        if (isDigits) {
          if (String(x.sender_id) === q || String(x.chat_id) === q || String(x.msg_id) === q) return true;
        }
        return (
          (x.sender_name && x.sender_name.toLowerCase().includes(q)) ||
          (x.text && x.text.toLowerCase().includes(q)) ||
          (x.chat_title && x.chat_title.toLowerCase().includes(q)) ||
          (x.old_text && x.old_text.toLowerCase().includes(q)) ||
          (x.new_text && x.new_text.toLowerCase().includes(q))
        );
      });
    }

    // 5.5 Smart Folder Auto-Filter (Feature 13)
    if (state.activeSmartFolderId) {
      const sf = state.smartFolders.find(x => x.id === state.activeSmartFolderId);
      if (sf) {
        items = items.filter(it => matchesSmartFolderRule(it, sf));
      }
    }

    // 6. Duplicate detection (Feature 16) — строго реальные дубликаты, никаких ложных срабатываний на заглушки
    function getDuplicateKey(it) {
      if (!it) return null;
      const mType = (it.media_type || '').toLowerCase();
      const rawText = (it.transcription || it.new_text || it.text || it.old_text || '').trim();
      const isPlaceholder = !rawText || rawText.startsWith('[') || rawText === 'Сообщение было удалено' || rawText.includes('перехвачено в Сейф') || rawText.includes('перехвачено в Vault');

      // Голосовые сообщения: дубликат ТОЛЬКО если реальный распознанный текст полностью совпадает (от 6 символов)
      if (mType === 'voice') {
        if (isPlaceholder || rawText.length < 6) return null;
        return `voice_transcript:${rawText.toLowerCase()}`;
      }

      // Фото, видео, документы: дубликат только при одинаковой реальной подписи или идентичном файле
      if (mType === 'photo' || mType === 'video' || mType === 'document' || mType === 'video_note') {
        if (!isPlaceholder && rawText.length >= 6) {
          return `${mType}_caption:${rawText.toLowerCase()}`;
        }
        if (it.media_path) {
          const fname = it.media_path.split(/[/\\]/).pop();
          if (fname && !fname.startsWith('sub_') && fname.length > 5) {
            return `${mType}_file:${fname.toLowerCase()}`;
          }
        }
        return null;
      }

      // Обычные текстовые сообщения: дубликат только при совпадении текста (от 6 символов, без системных заглушек)
      if (!isPlaceholder && rawText.length >= 6) {
        return `text:${rawText.toLowerCase()}`;
      }

      return null;
    }

    const textCounts = {};
    items.forEach(it => {
      const key = getDuplicateKey(it);
      if (key) {
        textCounts[key] = (textCounts[key] || 0) + 1;
      }
    });

    if (state.showDuplicatesOnly) {
      items = items.filter(it => {
        const key = getDuplicateKey(it);
        return key && textCounts[key] > 1;
      });
    }

    if (!items.length) {
      const isRestricted = (state.tier === 'NONE' || state.tier === 'БАЗОВЫЙ' || state.tier === 'DEMO');
      if (isRestricted) {
        list.innerHTML = `
          <div class="empty-feed-card" style="text-align: center; padding: 36px 16px; background: rgba(30, 41, 59, 0.45); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 16px; margin: 16px 8px;">
            <div style="font-size: 36px; margin-bottom: 10px;">🔒</div>
            <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 6px;">Юзербот не подключен</div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 18px; max-width: 320px; margin-left: auto; margin-right: auto;">
              Для перехвата удаленных сообщений, сгорающих 1-View фото и работы стелс-модулей активируйте подписку или включите бесплатный тест:
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; max-width: 280px; margin: 0 auto;">
              <button type="button" class="btn-primary" onclick="window.openStoreModal()" style="padding: 12px 16px; font-size: 13px; font-weight: 600; border-radius: 10px; width: 100%;">
                ⭐ Выбрать тариф (Telegram Stars)
              </button>
              <button type="button" class="btn-secondary" onclick="window.claimFreeTrial()" style="padding: 10px 14px; font-size: 12px; border-radius: 10px; width: 100%;">
                🎁 Попробовать бесплатно (24 часа)
              </button>
              <button type="button" class="btn-secondary" onclick="window.simulateDemoFeed()" style="padding: 8px 12px; font-size: 11px; color: var(--text-muted); border-radius: 10px; width: 100%;">
                ⚡️ Демо-симуляция перехватов
              </button>
            </div>
          </div>
        `;
      } else {
        list.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
            <div style="font-size: 32px; margin-bottom: 8px;">🛰</div>
            <p style="font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 4px;">Ожидание событий перехвата...</p>
            <p style="font-size: 12px; line-height: 1.4;">Все перехваты удалений и правок в ваших чатах отображаются здесь в реальном времени.</p>
            <button type="button" class="btn-secondary" onclick="window.simulateDemoFeed()" style="margin-top: 14px; font-size: 12px; padding: 8px 16px; border-radius: 8px;">
              ⚡️ Запустить демо-симуляцию
            </button>
          </div>
        `;
      }
      return;
    }

    // 7. Render with Day Grouping if enabled (Feature 15)
    let lastDay = null;
    let htmlOutput = '';

    items.forEach((it, idx) => {
      // Day separator
      if (state.groupByDays) {
        let dayLabel = 'СЕГОДНЯ';
        const tStr = it.time || '';
        if (tStr.includes('.')) {
          const parts = tStr.split('|');
          dayLabel = parts.length > 1 ? parts[1].trim() : parts[0].trim();
        }
        if (dayLabel !== lastDay) {
          lastDay = dayLabel;
          htmlOutput += `
            <div class="day-separator">
              <div class="day-separator-line"></div>
              <span class="day-separator-text">🗓 ${escapeHtml(dayLabel)}</span>
              <div class="day-separator-line"></div>
            </div>
          `;
        }
      }

      let badgeClass = 'deleted';
      let badgeText = 'УДАЛЕНО';
      let contentHtml = '';

      const mType = (it.media_type || '').toLowerCase();
      const isPl = (s) => !s || s.startsWith('[') || s.includes('перехвачено') || s.includes('Сейф') || s.includes('Vault');
      const rawTrans = (it.transcription || '').trim();
      const rawTxt = (it.text || '').trim();
      const actualVoiceTranscript = !isPl(rawTrans) ? rawTrans : (!isPl(rawTxt) ? rawTxt : '');

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
        let txt = it.text;
        if (mType === 'voice') {
          if (actualVoiceTranscript) {
            txt = `🎙 «${actualVoiceTranscript}»`;
          } else {
            txt = '🎙 [Голосовое сообщение]';
          }
        } else if (!txt || txt.startsWith('[')) {
          if (mType === 'photo') txt = '📷 [Фотография перехвачена в Vault]';
          else if (mType === 'video') txt = '🎥 [Видеозапись]';
          else if (mType === 'video_note') txt = '🔵 [Видеосообщение (кружок)]';
          else if (mType === 'document') txt = '📄 [Документ / Файл]';
          else txt = 'Сообщение было удалено собеседником';
        }
        contentHtml = `<div class="feed-quote">${escapeHtml(txt)}</div>`;
      }

      // Check duplicate
      const dupKey = getDuplicateKey(it);
      const isDup = dupKey && textCounts[dupKey] > 1;
      const dupBadge = isDup ? `<span class="duplicate-badge">⚠️ Дубликат (x${textCounts[dupKey]})</span>` : '';

      // Contact Tag (Feature 12)
      const contactTag = state.contactTags[it.sender_id];
      const tagBadge = contactTag ? `<span class="contact-tag-badge tag-${contactTag.color}">${escapeHtml(contactTag.tag)}</span>` : '';
      const isFav = state.favouriteContacts.some(x => x.uid === it.sender_id);

      // Safe encoded copy text
      const rawToCopy = actualVoiceTranscript || it.new_text || it.text || it.old_text || '';
      const safeEncodedCopy = encodeURIComponent(rawToCopy);

      // Media Rendering
      let mediaHtml = '';
      if (it.media_url || (it.session_id && it.msg_id && it.media_type)) {
        const base = state.apiUrl || window.location.origin;
        let rawMUrl = it.media_url || `/api/vault/media/${it.session_id}/${it.msg_id}`;
        let mUrl = rawMUrl.startsWith('http') ? rawMUrl : `${base}${rawMUrl.startsWith('/') ? '' : '/'}${rawMUrl}`;
        const fullMediaUrl = `${mUrl}${mUrl.includes('?') ? '&' : '?'}auth=${encodeURIComponent(state.authToken || '')}&user_id=${state.userId}`;

        if (mType === 'photo' || it.type === 'ttl' || mType === 'sticker') {
          // Photo Lightbox with resilient placeholder fallback and manual retry
          mediaHtml = `
            <div class="feed-media-wrap" style="margin: 8px 0; max-width: 100%;">
              <img src="${fullMediaUrl}" class="feed-media-img" data-lb-url="${fullMediaUrl}" loading="lazy" alt="Фото"
                   style="max-width: 100%; max-height: 280px; width: 100%; border-radius: 8px; border: 1px solid var(--border-subtle); object-fit: cover; cursor: pointer; display: block;"
                   onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">
              <div class="feed-media-placeholder" style="display: none; padding: 10px 14px; background: rgba(99, 102, 241, 0.08); border: 1px dashed rgba(99, 102, 241, 0.3); border-radius: 8px; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--text-primary);">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 22px;">🖼</span>
                  <div>
                    <div style="font-weight: 600;">Перехваченное фото</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">Медиафайл в Сейфе (требуется активный бот C2)</div>
                  </div>
                </div>
                <button type="button" class="btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="window.retryImageLoad(this, '${encodeURIComponent(fullMediaUrl)}')">🔄</button>
              </div>
            </div>
          `;
        } else if (mType === 'video_note') {
          // Circular Video Note Player (Feature 7)
          const vNoteTranscript = it.transcription || (it.text && !isPl(it.text) ? it.text : '');
          const vNoteDisplay = vNoteTranscript ? escapeHtml(vNoteTranscript) : '<span style="color: var(--text-muted); font-style: italic;">Идет скрытое распознавание речи (Silent Ear)...</span>';
          mediaHtml = `
            <div class="video-note-box">
              <span class="video-note-badge">🔵 КРУЖОК</span>
              <video src="${fullMediaUrl}" class="video-note-elem" loop playsinline preload="metadata"></video>
            </div>
            <!-- Transcript for video note (Feature 10) -->
            <div class="transcript-wrap">
              <button type="button" class="transcript-toggle-btn" onclick="window.toggleTranscript(this)">📝 Расшифровка (Silent Ear)</button>
              <div class="transcript-body" style="display: none; font-weight: 500; color: var(--text-primary); background: rgba(99, 102, 241, 0.08); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(99, 102, 241, 0.2); margin-top: 6px;">${vNoteDisplay}</div>
            </div>
          `;
        } else if (mType === 'video') {
          mediaHtml = `
            <div class="feed-media-wrap" style="margin: 8px 0; max-width: 100%;">
              <video src="${fullMediaUrl}" controls class="feed-media-video" preload="metadata" style="max-width: 100%; max-height: 260px; border-radius: 8px; background: #000;"></video>
            </div>
          `;
        } else if (mType === 'voice') {
          // Custom Waveform Voice Player (Feature 6)
          const barsHtml = Array.from({ length: 24 }).map((_, bIdx) => {
            const h = 7 + Math.sin(bIdx * 0.7) * 7 + (bIdx % 3) * 3;
            return `<div class="voice-bar" style="height: ${Math.round(h)}px;"></div>`;
          }).join('');

          const transcriptDisplay = actualVoiceTranscript 
            ? escapeHtml(actualVoiceTranscript) 
            : '<span style="color: var(--text-muted); font-style: italic;">Идет скрытое распознавание речи (Silent Ear)...</span>';

          const transcriptBtnLabel = actualVoiceTranscript
            ? `📝 Текст: «${escapeHtml(actualVoiceTranscript.slice(0, 32))}${actualVoiceTranscript.length > 32 ? '...' : ''}»`
            : '📝 Расшифровка (Silent Ear)';

          mediaHtml = `
            <div class="custom-voice-player">
              <button type="button" class="voice-play-btn" data-audio-url="${fullMediaUrl}">▶</button>
              <div class="voice-waveform-wrap">
                <div class="voice-waveform-bars">${barsHtml}</div>
                <div class="voice-time-row">
                  <span class="voice-curr-time">0:00</span>
                  <span class="voice-total-time">0:00</span>
                </div>
              </div>
              <button type="button" class="voice-speed-btn">1x</button>
            </div>
            <!-- Voice Transcript Accordion (Feature 10) -->
            <div class="transcript-wrap">
              <button type="button" class="transcript-toggle-btn" onclick="window.toggleTranscript(this)">${transcriptBtnLabel}</button>
              <div class="transcript-body" style="display: none; font-weight: 500; color: var(--text-primary); background: rgba(99, 102, 241, 0.08); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(99, 102, 241, 0.2); margin-top: 6px;">${transcriptDisplay}</div>
            </div>
          `;
        }
      }

      htmlOutput += `
        <article class="feed-item" data-cid="${it.chat_id || 0}">
          <div class="feed-item-head">
            <div class="sender-badge">
              <div class="avatar-initials">${(it.sender_name || 'U').charAt(0).toUpperCase()}</div>
              <span class="sender-name">${escapeHtml(it.sender_name || 'Собеседник')}</span>
              ${tagBadge}
              ${dupBadge}
              <button type="button" class="btn-assign-tag btn-assign-tag-action" data-uid="${it.sender_id || 0}" data-name="${encodeURIComponent(it.sender_name || '')}" title="Назначить тег">🏷</button>
              <button type="button" class="btn-assign-tag btn-fav-contact-action" data-uid="${it.sender_id || 0}" data-name="${encodeURIComponent(it.sender_name || '')}" title="Избранный контакт">${isFav ? '★' : '☆'}</button>
              <button type="button" class="btn-assign-tag btn-smart-folder-action" data-sender="${encodeURIComponent(it.sender_username ? '@' + it.sender_username : (it.sender_id ? String(it.sender_id) : (it.sender_name || '')))}" data-name="${encodeURIComponent(it.sender_name || '')}" title="Создать смарт-папку для контакта">📁</button>
            </div>
            <span class="type-tag ${badgeClass}">${badgeText}</span>
          </div>
          ${contentHtml}
          ${mediaHtml}
          <div class="feed-footer">
            <span style="font-weight: 500; color: var(--text-secondary);">${escapeHtml(it.chat_title || 'Диалог')}</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <!-- Copy Text Button (Feature 6 - Screenshot 3) -->
              <button type="button" class="btn-copy-card" data-copy="${safeEncodedCopy}" title="Скопировать текст перехвата">📋 Скопировать</button>
              <span>${escapeHtml(it.time || '')}</span>
            </div>
          </div>
        </article>
      `;
    });

    list.innerHTML = htmlOutput;

    // Clean Event Delegation on feedList (no event collisions, no accidental tab switches)
    list.querySelectorAll('.feed-item').forEach(card => {
      card.addEventListener('click', (e) => {
        // If clicked on any interactive element or button, do NOT switch to Vault view
        if (e.target.closest('button, a, input, select, .custom-voice-player, .video-note-box, .feed-media-wrap, .transcript-wrap, .btn-assign-tag, .btn-smart-folder-action, .btn-copy-card, .voice-play-btn, .voice-speed-btn, .voice-waveform-wrap, .contact-tag-badge')) {
          return;
        }
        const cid = parseInt(card.dataset.cid, 10);
        if (cid) {
          haptic('light');
          switchTab('vault');
          const title = card.querySelector('.feed-footer span')?.textContent || `Чат ${cid}`;
          openChatMessages(cid, title);
        }
      });
    });

    // Delegated actions on the list
    list.onclick = (e) => {
      // Copy Card Text Button
      const copyBtn = e.target.closest('.btn-copy-card');
      if (copyBtn) {
        e.stopPropagation();
        e.preventDefault();
        const raw = copyBtn.dataset.copy ? decodeURIComponent(copyBtn.dataset.copy) : '';
        window.copyCardText(raw);
        return;
      }

      // Voice Play/Pause Button
      const playBtn = e.target.closest('.voice-play-btn');
      if (playBtn) {
        e.stopPropagation();
        e.preventDefault();
        window.toggleVoicePlayback(playBtn);
        return;
      }

      // Voice Speed Button
      const speedBtn = e.target.closest('.voice-speed-btn');
      if (speedBtn) {
        e.stopPropagation();
        e.preventDefault();
        window.toggleVoiceSpeed(speedBtn);
        return;
      }

      // Voice Waveform Seek
      const waveWrap = e.target.closest('.voice-waveform-wrap');
      if (waveWrap) {
        e.stopPropagation();
        e.preventDefault();
        window.seekVoicePlayback(e, waveWrap);
        return;
      }

      // Video Note Toggle
      const vNote = e.target.closest('.video-note-box');
      if (vNote) {
        e.stopPropagation();
        e.preventDefault();
        window.toggleVideoNote(vNote);
        return;
      }

      // Photo Lightbox
      const img = e.target.closest('.feed-media-img');
      if (img && img.dataset.lbUrl) {
        e.stopPropagation();
        e.preventDefault();
        const card = img.closest('.feed-item');
        const sName = card?.querySelector('.sender-name')?.textContent || 'Собеседник';
        const sTime = card?.querySelector('.feed-footer span:last-child')?.textContent || '';
        const quote = card?.querySelector('.feed-quote')?.textContent || '';
        window.openMediaLightbox(img.dataset.lbUrl, sName, sTime, quote);
        return;
      }

      // Tag Button
      const tagBtn = e.target.closest('.btn-assign-tag-action');
      if (tagBtn) {
        e.stopPropagation();
        e.preventDefault();
        const uid = parseInt(tagBtn.dataset.uid, 10);
        const name = tagBtn.dataset.name ? decodeURIComponent(tagBtn.dataset.name) : '';
        window.openTagModal(uid, name);
        return;
      }

      // Favorite Contact Button
      const favBtn = e.target.closest('.btn-fav-contact-action');
      if (favBtn) {
        e.stopPropagation();
        e.preventDefault();
        const uid = parseInt(favBtn.dataset.uid, 10);
        const name = favBtn.dataset.name ? decodeURIComponent(favBtn.dataset.name) : '';
        window.toggleFavContact(uid, name);
        return;
      }

      // Smart Folder Button on Card
      const sfBtn = e.target.closest('.btn-smart-folder-action');
      if (sfBtn) {
        e.stopPropagation();
        e.preventDefault();
        const sName = sfBtn.dataset.name ? decodeURIComponent(sfBtn.dataset.name) : '';
        const sSender = sfBtn.dataset.sender ? decodeURIComponent(sfBtn.dataset.sender) : '';
        window.openSmartFolderForSender(sName, sSender);
        return;
      }
    };
  }

  // Load Initial State & Live Counters (with auto-retry)
  async function loadState(retryCount = 0) {
    try {
      const data = await api(`/api/state/${state.userId}`);
      if (!data) return;

      setOnlineStatus(true);

      // Update User Tier from Server
      if (data.tier) {
        state.tier = (data.tier.key || data.tier.name || 'NONE').toUpperCase();
        state.tierInfo = data.tier;
        const badge = document.getElementById('userTierBadge');
        if (badge) badge.textContent = state.tier;
        const opTier = document.getElementById('opTierBadge');
        if (opTier) opTier.textContent = state.tier;
      }

      // Toggle Store Hero Banner for restricted tiers
      const storeBanner = document.getElementById('storeHeroBanner');
      if (storeBanner) {
        const isRestricted = (state.tier === 'NONE' || state.tier === 'БАЗОВЫЙ' || state.tier === 'DEMO');
        storeBanner.style.display = isRestricted ? 'flex' : 'none';
      }

      // Sync Quick Automation Dock states
      const fadGhost = document.getElementById('fadGhostToggle');
      if (fadGhost && state.triggers.ghost_read !== undefined) {
        fadGhost.classList.toggle('active', Boolean(state.triggers.ghost_read));
      }
      const fadTtl = document.getElementById('fadTtlToggle');
      if (fadTtl && state.triggers.auto_ttl !== undefined) {
        fadTtl.classList.toggle('active', Boolean(state.triggers.auto_ttl));
      }

      // Update Operator VIP Card
      if (data.account) {
        const acc = data.account;
        const opName = document.getElementById('opName');
        const opUser = document.getElementById('opUsername');
        const opAvInit = document.getElementById('opAvatarInitial');
        const opAvImg = document.getElementById('opAvatarImg');
        const opSafe = document.getElementById('opSafeChannel');

        if (opName && acc.name) opName.textContent = acc.name;
        if (opUser && acc.username) opUser.textContent = `@${acc.username}`;
        if (opAvInit && acc.name) opAvInit.textContent = acc.name.replace(/^[.@_]+/, '').charAt(0).toUpperCase() || 'K';
        if (opSafe && acc.log_channel_id) opSafe.textContent = `AyuVault (${acc.log_channel_id})`;

        if (opAvImg && acc.avatar_url) {
          const base = state.apiUrl || window.location.origin;
          const avUrl = acc.avatar_url.startsWith('http') ? acc.avatar_url : `${base}${acc.avatar_url.startsWith('/') ? '' : '/'}${acc.avatar_url}`;
          opAvImg.src = avUrl;
          opAvImg.onload = () => {
            opAvImg.style.display = 'block';
            if (opAvInit) opAvInit.style.display = 'none';
          };
          opAvImg.onerror = () => {
            opAvImg.style.display = 'none';
            if (opAvInit) opAvInit.style.display = 'block';
          };
        }
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
      } catch (_) {
        setOnlineStatus(false);
        resolveApiUrl().catch(() => {});
      }
    };

    state.ws.onclose = () => {
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
        chat_title: ev.chat_title || `Чат ${ev.chat_id}`,
        sender_name: ev.sender_name || `ID ${ev.sender_id}`,
        time: ev.deleted_at || 'только что',
        text: ev.text || 'Сообщение было удалено собеседником',
        media_type: ev.media_type,
        media_url: ev.media_url
      });
      updateFilterCounters();
      renderFeed();
      showToast(`Удаление: ${ev.sender_name || ev.chat_id}`, '🗑');
    } else if (ev.type === 'message_edited') {
      haptic('light');
      state.feedEvents.unshift({
        id: `edit_${ev.msg_id}_${Date.now()}`,
        type: 'edited',
        chat_id: ev.chat_id,
        chat_title: ev.chat_title || `Чат ${ev.chat_id}`,
        sender_name: ev.sender_name || 'Собеседник',
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
    } else if (ev.type === 'voip_call_blocked') {
      haptic('heavy');
      showToast(`Сброшен входящий вызов #${ev.call_id}`, '📵');
    }
  }

  // ==========================================================================
  // Wave 2 Helpers: Audio, Video Notes, Lightbox, Copy, Tags, Pull-to-refresh
  // ==========================================================================

  // Helper for manual image re-fetching
  window.retryImageLoad = function(btn, encUrl) {
    const wrap = btn.closest('.feed-media-wrap');
    if (!wrap) return;
    const img = wrap.querySelector('.feed-media-img');
    const ph = wrap.querySelector('.feed-media-placeholder');
    const url = decodeURIComponent(encUrl);
    const retryUrl = url + (url.includes('?') ? '&' : '?') + '_ts=' + Date.now();
    btn.textContent = '⏳';
    if (img) {
      img.src = retryUrl;
      img.onload = () => {
        img.style.display = 'block';
        if (ph) ph.style.display = 'none';
        btn.textContent = '🔄';
      };
      img.onerror = () => {
        btn.textContent = '🔄';
        showToast('Сервер C2 не отвечает. Запустите bot_main.py.', '⚠️', true);
      };
    }
  };

  // Feature 6: In-feed Audio Waveform Player with Bulletproof Cross-Platform Support
  window.toggleVoicePlayback = function(btn, audioUrl) {
    const url = audioUrl || btn.dataset.audioUrl;
    if (!url) return;
    let audio = btn._audio;
    const playerBox = btn.closest('.custom-voice-player');
    const timeElem = playerBox ? playerBox.querySelector('.voice-curr-time') : null;
    const totalElem = playerBox ? playerBox.querySelector('.voice-total-time') : null;
    const bars = playerBox ? playerBox.querySelectorAll('.voice-bar') : [];

    if (!audio) {
      audio = new Audio();
      audio.preload = 'metadata';
      audio.src = url;
      btn._audio = audio;

      // Realtime ticking seconds and animated waveform
      audio.addEventListener('timeupdate', () => {
        const cur = audio.currentTime || 0;
        const dur = audio.duration;
        const curM = Math.floor(cur / 60);
        const curS = Math.floor(cur % 60);
        if (timeElem) timeElem.textContent = `${curM}:${curS < 10 ? '0' : ''}${curS}`;

        if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
          const totM = Math.floor(dur / 60);
          const totS = Math.floor(dur % 60);
          if (totalElem) totalElem.textContent = `${totM}:${totS < 10 ? '0' : ''}${totS}`;

          const prog = Math.min(1, Math.max(0, cur / dur));
          const playedCount = Math.floor(prog * bars.length);
          bars.forEach((b, idx) => {
            if (idx <= playedCount) b.classList.add('played');
            else b.classList.remove('played');
          });
        }
      });

      audio.addEventListener('loadedmetadata', () => {
        const dur = audio.duration;
        if (dur && !isNaN(dur) && isFinite(dur)) {
          const mins = Math.floor(dur / 60);
          const secs = Math.floor(dur % 60);
          if (totalElem) totalElem.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
      });

      audio.addEventListener('play', () => {
        btn.textContent = '⏸';
      });

      audio.addEventListener('pause', () => {
        btn.textContent = '▶';
      });

      audio.addEventListener('ended', () => {
        btn.textContent = '▶';
        bars.forEach(b => b.classList.remove('played'));
        if (timeElem) timeElem.textContent = '0:00';
      });

      audio.addEventListener('error', (e) => {
        console.warn('Audio playback error:', e);
        if (!audio._retryDone) {
          audio._retryDone = true;
          const retrySrc = url + (url.includes('?') ? '&' : '?') + '_ts=' + Date.now();
          audio.src = retrySrc;
          audio.load();
          audio.play().then(() => {
            btn.textContent = '⏸';
          }).catch(() => {
            btn.textContent = '⚠️';
            btn.title = 'Сервер C2 не отвечает или файл не найден';
            showToast('Аудио недоступно: сервер C2 оффлайн', '⚠️', true);
            haptic('error');
          });
          return;
        }
        btn.textContent = '⚠️';
        btn.title = 'Сервер C2 не отвечает или файл не найден';
        showToast('Аудио недоступно: сервер C2 оффлайн', '⚠️', true);
        haptic('error');
      });
    }

    if (audio.paused) {
      // Pause all other media
      document.querySelectorAll('audio, video').forEach(el => {
        if (el !== audio) el.pause();
      });
      document.querySelectorAll('.voice-play-btn').forEach(b => {
        if (b !== btn) b.textContent = '▶';
      });

      btn.textContent = '⏳';
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          btn.textContent = '⏸';
          haptic('light');
        }).catch(err => {
          console.warn('Playback error:', err);
          btn.textContent = '⚠️';
          showToast('Сервер C2 не отвечает (бот оффлайн)', '❌', true);
        });
      }
    } else {
      audio.pause();
      btn.textContent = '▶';
      haptic('light');
    }
  };

  window.toggleVoiceSpeed = function(btn) {
    const playerBox = btn.closest('.custom-voice-player');
    const playBtn = playerBox.querySelector('.voice-play-btn');
    const audio = playBtn ? playBtn._audio : null;
    const speeds = [1, 1.5, 2];
    let curr = parseFloat(btn.textContent) || 1;
    let nextIdx = (speeds.indexOf(curr) + 1) % speeds.length;
    let nextSpeed = speeds[nextIdx];
    btn.textContent = `${nextSpeed}x`;
    if (audio) audio.playbackRate = nextSpeed;
    haptic('selection');
  };

  window.seekVoicePlayback = function(e, wrap) {
    const playerBox = wrap.closest('.custom-voice-player');
    const playBtn = playerBox.querySelector('.voice-play-btn');
    const audio = playBtn ? playBtn._audio : null;
    if (!audio || !audio.duration) return;
    const rect = wrap.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pos * audio.duration;
    haptic('light');
  };

  // Feature 7: Circular Video Note Player
  window.toggleVideoNote = function(box) {
    const vid = box.querySelector('video');
    if (!vid) return;
    if (vid.paused) {
      document.querySelectorAll('audio, video').forEach(el => { if (el !== vid) el.pause(); });
      vid.play().catch(() => {});
      haptic('light');
    } else {
      vid.pause();
      haptic('light');
    }
  };

  // Feature 10: Voice Transcript Toggle
  window.toggleTranscript = function(btn) {
    const wrap = btn.closest('.transcript-wrap');
    const body = wrap.querySelector('.transcript-body');
    if (!body) return;
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? '🔼 Скрыть расшифровку' : '📝 Расшифровка (Silent Ear)';
    haptic('light');
  };

  // Feature 6 (Screenshot 3): Copy Card Text
  window.copyCardText = function(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('✓ Текст скопирован в буфер', '📋');
        haptic('medium');
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✓ Текст скопирован в буфер', '📋');
    haptic('medium');
  }

  // Feature 8 & 11: Lightbox & Slideshow
  window.openMediaLightbox = function(url, senderName = 'Медиа', time = '', caption = '') {
    const modal = document.getElementById('mediaLightboxModal');
    const img = document.getElementById('lightboxImg');
    const sName = document.getElementById('lightboxSenderName');
    const sTime = document.getElementById('lightboxTime');
    const sCap = document.getElementById('lightboxCaption');
    const dlBtn = document.getElementById('lbDownloadBtn');

    // Build photo list from current active feed
    const items = state.activeFilter === 'archived' ? state.archivedEvents : state.feedEvents;
    const photoList = [];
    items.forEach(it => {
      const mType = (it.media_type || '').toLowerCase();
      if (mType === 'photo' || it.type === 'ttl' || mType === 'sticker') {
        const base = state.apiUrl || window.location.origin;
        let rawMUrl = it.media_url || `/api/vault/media/${it.session_id}/${it.msg_id}`;
        let mUrl = rawMUrl.startsWith('http') ? rawMUrl : `${base}${rawMUrl.startsWith('/') ? '' : '/'}${rawMUrl}`;
        const full = `${mUrl}${mUrl.includes('?') ? '&' : '?'}auth=${encodeURIComponent(state.authToken || '')}&user_id=${state.userId}`;
        photoList.push({
          url: full,
          sender: it.sender_name || 'Собеседник',
          time: it.time || '',
          caption: it.text || ''
        });
      }
    });

    state.lightboxMediaList = photoList.length ? photoList : [{ url, sender: senderName, time, caption }];
    state.lightboxCurrentIdx = Math.max(0, state.lightboxMediaList.findIndex(x => x.url === url));

    function updateView() {
      const cur = state.lightboxMediaList[state.lightboxCurrentIdx] || { url, sender: senderName, time, caption };
      img.src = cur.url;
      if (sName) sName.textContent = cur.sender;
      if (sTime) sTime.textContent = cur.time;
      if (sCap) sCap.textContent = cur.caption;
      if (dlBtn) dlBtn.href = cur.url;
    }

    updateView();
    modal.style.display = 'flex';
    haptic('medium');
  };

  window.closeMediaLightbox = function() {
    const modal = document.getElementById('mediaLightboxModal');
    if (modal) modal.style.display = 'none';
    if (state.slideshowTimer) {
      clearInterval(state.slideshowTimer);
      state.slideshowTimer = null;
      const sBtn = document.getElementById('lbSlideshowBtn');
      if (sBtn) sBtn.textContent = '▶️ Слайдшоу';
    }
    haptic('light');
  };

  function toggleSlideshow() {
    const sBtn = document.getElementById('lbSlideshowBtn');
    if (state.slideshowTimer) {
      clearInterval(state.slideshowTimer);
      state.slideshowTimer = null;
      if (sBtn) sBtn.textContent = '▶️ Слайдшоу';
      showToast('Слайдшоу остановлено');
    } else {
      if (sBtn) sBtn.textContent = '⏸ Пауза';
      showToast('▶️ Слайдшоу запущено');
      state.slideshowTimer = setInterval(() => {
        if (!state.lightboxMediaList.length) return;
        state.lightboxCurrentIdx = (state.lightboxCurrentIdx + 1) % state.lightboxMediaList.length;
        const cur = state.lightboxMediaList[state.lightboxCurrentIdx];
        const img = document.getElementById('lightboxImg');
        const sName = document.getElementById('lightboxSenderName');
        const sTime = document.getElementById('lightboxTime');
        const sCap = document.getElementById('lightboxCaption');
        const dlBtn = document.getElementById('lbDownloadBtn');
        if (img) img.src = cur.url;
        if (sName) sName.textContent = cur.sender;
        if (sTime) sTime.textContent = cur.time;
        if (sCap) sCap.textContent = cur.caption;
        if (dlBtn) dlBtn.href = cur.url;
      }, 3000);
    }
  }

  // Lightbox Navigation & Action buttons
  const btnCloseLb = document.getElementById('btnCloseLightbox');
  const btnPrevLb = document.getElementById('lbPrevBtn');
  const btnNextLb = document.getElementById('lbNextBtn');
  const btnSlideLb = document.getElementById('lbSlideshowBtn');
  const modalLb = document.getElementById('mediaLightboxModal');

  if (btnCloseLb) btnCloseLb.addEventListener('click', window.closeMediaLightbox);
  if (btnSlideLb) btnSlideLb.addEventListener('click', toggleSlideshow);
  if (btnPrevLb) {
    btnPrevLb.addEventListener('click', () => {
      if (!state.lightboxMediaList.length) return;
      state.lightboxCurrentIdx = (state.lightboxCurrentIdx - 1 + state.lightboxMediaList.length) % state.lightboxMediaList.length;
      const cur = state.lightboxMediaList[state.lightboxCurrentIdx];
      document.getElementById('lightboxImg').src = cur.url;
      document.getElementById('lightboxSenderName').textContent = cur.sender;
      document.getElementById('lightboxTime').textContent = cur.time;
      document.getElementById('lightboxCaption').textContent = cur.caption;
      document.getElementById('lbDownloadBtn').href = cur.url;
      haptic('selection');
    });
  }
  if (btnNextLb) {
    btnNextLb.addEventListener('click', () => {
      if (!state.lightboxMediaList.length) return;
      state.lightboxCurrentIdx = (state.lightboxCurrentIdx + 1) % state.lightboxMediaList.length;
      const cur = state.lightboxMediaList[state.lightboxCurrentIdx];
      document.getElementById('lightboxImg').src = cur.url;
      document.getElementById('lightboxSenderName').textContent = cur.sender;
      document.getElementById('lightboxTime').textContent = cur.time;
      document.getElementById('lightboxCaption').textContent = cur.caption;
      document.getElementById('lbDownloadBtn').href = cur.url;
      haptic('selection');
    });
  }

  // Feature 12: Contact Tags Management
  let activeTagUid = null;
  window.openTagModal = function(uid, name) {
    activeTagUid = uid;
    const modal = document.getElementById('tagAssignModal');
    const title = document.getElementById('tagModalContactName');
    const input = document.getElementById('inputCustomTag');
    if (title) title.textContent = `Контакт: ${name} (ID: ${uid})`;
    if (input) input.value = (state.contactTags[uid] && state.contactTags[uid].tag) || '';
    if (modal) modal.style.display = 'flex';
    haptic('light');
  };

  window.setContactTag = function(tag, color) {
    if (!activeTagUid) return;
    if (!tag || tag === 'none') {
      delete state.contactTags[activeTagUid];
      showToast('Тег снят');
    } else {
      state.contactTags[activeTagUid] = { tag, color: color || 'purple' };
      showToast(`Тег «${tag}» сохранен`);
    }
    localStorage.setItem('ayulite_contact_tags', JSON.stringify(state.contactTags));
    const modal = document.getElementById('tagAssignModal');
    if (modal) modal.style.display = 'none';
    renderFeed();
    haptic('medium');
  };

  // Tag modal buttons setup
  const tagBtns = document.querySelectorAll('.preset-tag-btn');
  tagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.setContactTag(btn.dataset.tag, btn.dataset.color);
    });
  });

  const btnSaveCustomTag = document.getElementById('btnSaveCustomTag');
  if (btnSaveCustomTag) {
    btnSaveCustomTag.addEventListener('click', () => {
      const val = document.getElementById('inputCustomTag')?.value?.trim();
      if (val) window.setContactTag(val, 'purple');
      else window.setContactTag('none', 'none');
    });
  }

  const btnCloseTag = document.getElementById('btnCloseTagModal');
  if (btnCloseTag) {
    btnCloseTag.addEventListener('click', () => {
      document.getElementById('tagAssignModal').style.display = 'none';
    });
  }

  // Feature 42: Favourite Contacts
  window.toggleFavContact = function(uid, name) {
    const idx = state.favouriteContacts.findIndex(x => x.uid === uid);
    if (idx >= 0) {
      state.favouriteContacts.splice(idx, 1);
      showToast(`${name || 'Контакт'} удален из избранных`);
    } else {
      if (state.favouriteContacts.length >= 10) state.favouriteContacts.shift();
      state.favouriteContacts.push({ uid, name: name || `ID ${uid}`, initial: (name || 'U').charAt(0).toUpperCase() });
      showToast(`⭐ ${name || 'Контакт'} добавлен в избранные`);
    }
    localStorage.setItem('ayulite_fav_contacts', JSON.stringify(state.favouriteContacts));
    renderFavContactsBar();
    renderFeed();
    haptic('selection');
  };

  // Feature 13: Smart Folders Rule Checker
  function matchesSmartFolderRule(it, sf) {
    if (!it || !sf) return false;
    if (sf.type && sf.type !== 'all' && it.type !== sf.type) return false;
    if (sf.media && sf.media !== 'all' && (it.media_type || '').toLowerCase() !== sf.media) return false;
    if (sf.sender) {
      const s = sf.sender.toLowerCase().replace(/^@/, '').trim();
      const sName = (it.sender_name || '').toLowerCase();
      const sUser = (it.sender_username || '').toLowerCase();
      const sId = String(it.sender_id || '');
      if (!sName.includes(s) && !sUser.includes(s) && !sId.includes(s)) return false;
    }
    if (sf.period === 'today') {
      const t = (it.time || '').toLowerCase();
      if (!t.includes('только что') && !t.includes('мин') && !t.includes('сек') && !t.includes('сегодня') && !t.includes(new Date().toLocaleDateString('ru-RU'))) {
        return false;
      }
    }
    return true;
  }

  // Feature 13: Smart Folders Rendering & Selection
  function renderSmartFolders() {
    const bar = document.getElementById('smartFoldersBar');
    const list = document.getElementById('smartFoldersList');
    const manageList = document.getElementById('smartFoldersManageList');
    const banner = document.getElementById('activeFolderBanner');
    const bannerTitle = document.getElementById('activeFolderTitle');
    const bannerDesc = document.getElementById('activeFolderDesc');

    // Update banner for active smart folder
    if (banner) {
      if (state.activeSmartFolderId) {
        const sf = state.smartFolders.find(x => x.id === state.activeSmartFolderId);
        if (sf) {
          banner.style.display = 'flex';
          if (bannerTitle) bannerTitle.textContent = `Папка: ${sf.name}`;
          const ruleParts = [];
          if (sf.type && sf.type !== 'all') {
            const typeLabels = { deleted: '🗑 Удаленные', edited: '✏️ Правки', ttl: '🔥 TTL', reactions: '⚡ Реакции' };
            ruleParts.push(typeLabels[sf.type] || sf.type);
          }
          if (sf.sender) ruleParts.push(`От: ${sf.sender}`);
          if (sf.media && sf.media !== 'all') {
            const mediaLabels = { photo: 'Фото', voice: 'Голосовые', video_note: 'Кружки', video: 'Видео', document: 'Файлы' };
            ruleParts.push(`Медиа: ${mediaLabels[sf.media] || sf.media}`);
          }
          if (sf.period && sf.period !== 'all') {
            const periodLabels = { today: 'За сегодня', week: 'За неделю', month: 'За месяц' };
            ruleParts.push(periodLabels[sf.period] || sf.period);
          }
          if (bannerDesc) bannerDesc.textContent = ruleParts.length ? ruleParts.join(' • ') : 'Фильтрует все события ленты';
        } else {
          state.activeSmartFolderId = null;
          banner.style.display = 'none';
        }
      } else {
        banner.style.display = 'none';
      }
    }

    if (!bar || !list) return;

    if (!state.smartFolders.length) {
      bar.style.display = 'none';
      if (manageList) manageList.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">Нет созданных папок. Создайте первую выше!</span>';
      return;
    }

    bar.style.display = 'flex';
    list.innerHTML = state.smartFolders.map(sf => {
      const isActive = sf.id === state.activeSmartFolderId;
      return `
        <button type="button" class="tool-btn ${isActive ? 'active' : ''}" style="white-space: nowrap; font-size: 11px; padding: 3px 8px; border-radius: 12px;" onclick="window.selectSmartFolder('${sf.id}')">
          📁 ${escapeHtml(sf.name)}
        </button>
      `;
    }).join('');

    if (manageList) {
      manageList.innerHTML = state.smartFolders.map(sf => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 6px; font-size: 11px; border: 1px solid var(--border-subtle);">
          <div>
            <span style="font-weight: 600; color: var(--text-primary);">📁 ${escapeHtml(sf.name)}</span>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
              ${sf.type !== 'all' ? `тип: ${sf.type} • ` : ''}${sf.sender ? `от: ${escapeHtml(sf.sender)} • ` : ''}${sf.media !== 'all' ? `медиа: ${sf.media} • ` : ''}${sf.period !== 'all' ? `период: ${sf.period}` : 'за всё время'}
            </div>
          </div>
          <button type="button" class="btn-close" style="font-size: 12px; padding: 2px 6px; color: var(--rose);" onclick="window.deleteSmartFolder('${sf.id}')" title="Удалить папку">✕</button>
        </div>
      `).join('');
    }
  }

  window.selectSmartFolder = function(id) {
    if (state.activeSmartFolderId === id) {
      state.activeSmartFolderId = null;
      showToast('Фильтр папки снят', '📁');
    } else {
      state.activeSmartFolderId = id;
      const sf = state.smartFolders.find(x => x.id === id);
      showToast(`Папка «${sf ? sf.name : ''}» активна`, '📁');
    }
    renderSmartFolders();
    renderFeed();
    haptic('selection');
  };

  window.deleteSmartFolder = function(id) {
    state.smartFolders = state.smartFolders.filter(x => x.id !== id);
    if (state.activeSmartFolderId === id) state.activeSmartFolderId = null;
    localStorage.setItem('ayulite_smart_folders', JSON.stringify(state.smartFolders));
    renderSmartFolders();
    renderFeed();
    showToast('Папка удалена', '🗑');
    haptic('medium');
  };

  window.openSmartFolderForSender = function(name, usernameOrId) {
    const modal = document.getElementById('smartFolderModal');
    if (!modal) return;
    modal.style.display = 'flex';
    if (typeof window.populateSfSenders === 'function') window.populateSfSenders();
    const inName = document.getElementById('sfName');
    const inSender = document.getElementById('sfSender');
    const inType = document.getElementById('sfType');
    const senderSelect = document.getElementById('sfSenderSelect');

    const cleanSender = usernameOrId ? (usernameOrId.startsWith('@') ? usernameOrId : `@${usernameOrId}`) : name;
    if (inSender) inSender.value = cleanSender || '';
    if (senderSelect && cleanSender) {
      for (let i = 0; i < senderSelect.options.length; i++) {
        if (senderSelect.options[i].value === cleanSender) {
          senderSelect.selectedIndex = i;
          break;
        }
      }
    }
    if (inType) inType.value = 'deleted';
    if (inName) inName.value = `📁 ${name || cleanSender}: Удаленные`;
    if (typeof window.updateSfLiveCount === 'function') window.updateSfLiveCount();
    renderSmartFolders();
    haptic('light');
  };

  // Universal Mouse Drag & Mouse Wheel Horizontal Scroll
  function makeHorizontalScrollable(selector) {
    const containers = document.querySelectorAll(selector);
    containers.forEach(el => {
      if (el._dragScrollBound) return;
      el._dragScrollBound = true;

      // Translate vertical wheel into horizontal scroll on wide containers
      el.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
          e.preventDefault();
          el.scrollLeft += e.deltaY * 0.9;
        }
      }, { passive: false });

      // Click & drag scroll
      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;
      let hasDragged = false;

      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDown = true;
        hasDragged = false;
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
        el.style.userSelect = 'none';
      });

      window.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        el.style.userSelect = '';
      });

      el.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 1.3;
        if (Math.abs(walk) > 4) hasDragged = true;
        el.scrollLeft = scrollLeft - walk;
      });

      el.addEventListener('click', (e) => {
        if (hasDragged) {
          e.stopImmediatePropagation();
          e.preventDefault();
          hasDragged = false;
        }
      }, true);
    });
  }

  function renderFavContactsBar() {
    const bar = document.getElementById('favContactsScroll');
    if (!bar) return;

    if (!state.favouriteContacts.length) {
      const seen = new Set();
      state.feedEvents.forEach(it => {
        if (it.sender_id && !seen.has(it.sender_id) && seen.size < 6) {
          seen.add(it.sender_id);
          state.favouriteContacts.push({
            uid: it.sender_id,
            name: it.sender_name || `ID ${it.sender_id}`,
            initial: (it.sender_name || 'U').charAt(0).toUpperCase()
          });
        }
      });
      localStorage.setItem('ayulite_fav_contacts', JSON.stringify(state.favouriteContacts));
    }

    bar.innerHTML = state.favouriteContacts.map(c => `
      <div class="fav-contact-item ${state.activeContactFilter === c.uid ? 'active' : ''}" onclick="window.filterByContact(${c.uid})">
        <div class="fav-avatar">
          <span>${escapeHtml(c.initial || 'U')}</span>
          <span class="fav-avatar-dot"></span>
        </div>
        <span class="fav-name">${escapeHtml(c.name)}</span>
      </div>
    `).join('');
  }

  window.filterByContact = function(uid) {
    if (state.activeContactFilter === uid) {
      state.activeContactFilter = null;
      showToast('Фильтр контакта сброшен');
    } else {
      state.activeContactFilter = uid;
      showToast('Фильтр по контакту активирован');
    }
    renderFavContactsBar();
    renderFeed();
    haptic('selection');
  };

  // Feature 2: Pull-to-refresh on all views
  function setupPullToRefresh() {
    const views = document.querySelectorAll('.view-container');
    const ptrBox = document.getElementById('ptrFeed');
    if (!ptrBox) return;

    views.forEach(v => {
      let startY = 0;
      let isPulling = false;

      v.addEventListener('touchstart', (e) => {
        if (v.scrollTop <= 0) {
          startY = e.touches[0].clientY;
          isPulling = true;
        }
      }, { passive: true });

      v.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 15 && diff < 120) {
          ptrBox.classList.add('pulling');
          const lbl = ptrBox.querySelector('.ptr-label');
          if (lbl) lbl.textContent = diff > 60 ? '⚡ Отпустите для обновления' : '↓ Потяните для обновления';
        }
      }, { passive: true });

      v.addEventListener('touchend', async () => {
        if (!isPulling) return;
        isPulling = false;
        if (ptrBox.classList.contains('pulling')) {
          ptrBox.classList.add('refreshing');
          const lbl = ptrBox.querySelector('.ptr-label');
          if (lbl) lbl.textContent = 'Обновление...';
          haptic('medium');
          try {
            await Promise.allSettled([loadFeed(), loadState(), loadVaultOverview()]);
            showToast('✓ Данные обновлены', '⚡');
          } catch (_) {}
          setTimeout(() => {
            ptrBox.classList.remove('pulling', 'refreshing');
          }, 400);
        }
      });
    });
  }


  // Interactive Trial Activation & Demo Simulator
  window.claimFreeTrial = async function() {
    haptic('medium');
    showToast('Активация пробного периода...', '🎁');
    if (state.apiUrl) {
      try {
        const res = await api('/api/trial/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: state.userId })
        });
        if (res && res.success) {
          showToast('🎉 Пробный период 24ч активирован!', '👑');
          haptic('success');
          state.tier = 'ULTIMATE';
          const badge = document.getElementById('userTierBadge');
          if (badge) badge.textContent = 'ULTIMATE';
          const storeBanner = document.getElementById('storeHeroBanner');
          if (storeBanner) storeBanner.style.display = 'none';
          if (window.closeStoreModal) window.closeStoreModal();
          await loadState();
          return;
        } else if (res && res.error) {
          showToast(res.error, '⚠️', true);
          return;
        }
      } catch (_) {}
    }

    // Fallback directly to bot
    const tgLink = 'https://t.me/AyuLiteBot?start=trial';
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(tgLink);
    } else {
      window.open(tgLink, '_blank');
    }
  };

  window.simulateDemoFeed = function() {
    haptic('success');
    showToast('Запущена демо-симуляция перехватов...', '⚡️');
    state.feedEvents = [
      {
        id: 'demo_del_1',
        type: 'deleted',
        chat_id: 100234567,
        chat_title: 'Secret Chat • VIP Deal',
        sender_id: 998877,
        sender_name: 'Алексей Смирнов',
        time: 'только что',
        text: 'Привет, вот закрытые условия договора: 2.5M$ на escrow, подтверждаю.',
        media_type: null
      },
      {
        id: 'demo_ttl_2',
        type: 'deleted',
        chat_id: 100345678,
        chat_title: 'Личные сообщения',
        sender_id: 887766,
        sender_name: 'Мария К.',
        time: '1 мин назад',
        text: '🔥 Перехвачено 1-View фото (таймер 5 сек)',
        media_type: 'photo',
        media_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: 'demo_edit_3',
        type: 'edited',
        chat_id: 100456789,
        chat_title: 'Арбитраж Трафика HQ',
        sender_id: 776655,
        sender_name: 'Crypto Buyer',
        time: '3 мин назад',
        old_text: 'Скинул оплату 500 USDT на кошелек TXYZ...',
        new_text: 'Скинул оплату 200 USDT на кошелек TXYZ...',
        text: 'Скинул оплату 200 USDT на кошелек TXYZ...'
      }
    ];
    updateFilterCounters();
    renderFeed();
  };

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
