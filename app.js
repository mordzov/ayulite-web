// Telegram Web App SDK initialization
const tg = window.Telegram?.WebApp;

// Конфигурация 5 видов подписок
const SUBSCRIPTION_TIERS = {
  creator: {
    rank: 5,
    name: 'СОЗДАТЕЛЬ',
    badgeClass: 'badge-creator',
    color: '#ff3b30'
  },
  admin: {
    rank: 4,
    name: 'АДМИН',
    badgeClass: 'badge-admin',
    color: '#f59e0b'
  },
  ultimate: {
    rank: 3,
    name: 'ULTIMATE',
    badgeClass: 'badge-ultimate',
    color: '#a855f7'
  },
  premium: {
    rank: 2,
    name: 'PREMIUM',
    badgeClass: 'badge-premium',
    color: '#06b6d4'
  },
  pro: {
    rank: 1,
    name: 'PRO',
    badgeClass: 'badge-pro',
    color: '#10b981'
  },
  none: {
    rank: 0,
    name: 'БАЗОВЫЙ',
    badgeClass: 'badge-none',
    color: '#64748b'
  }
};

// Требуемый минимальный ранг для каждого из 45 модулей (1=Pro, 2=Premium, 3=Ultimate)
const MODULE_REQUIREMENTS = {
  // Защита и Теневые протоколы (12)
  'Shadow Mirror': { rank: 3, planName: 'Ultimate' },
  'Session Sentinel': { rank: 3, planName: 'Ultimate' },
  'Secret Chats Spy': { rank: 3, planName: 'Ultimate' },
  'Bio Watcher': { rank: 3, planName: 'Ultimate' },
  'Ghost Online': { rank: 3, planName: 'Ultimate' },
  'Panic Switch': { rank: 3, planName: 'Ultimate' },
  'Zero-Knowledge Vault': { rank: 3, planName: 'Ultimate' },
  'TTL Grabber': { rank: 2, planName: 'Premium' },
  'Ghost Story Ripper': { rank: 2, planName: 'Premium' },
  'Anti-Delete': { rank: 1, planName: 'Pro' },
  'Anti-Edit': { rank: 1, planName: 'Pro' },
  'Ghost Read': { rank: 1, planName: 'Pro' },

  // Медиа-комбайн и AI (7)
  'Speech-to-Text': { rank: 3, planName: 'Ultimate' },
  'Text-to-Speech': { rank: 3, planName: 'Ultimate' },
  'Video to Circle': { rank: 2, planName: 'Premium' },
  'Round Video': { rank: 2, planName: 'Premium' },
  'Voice Converter': { rank: 2, planName: 'Premium' },
  'Media Saver': { rank: 2, planName: 'Premium' },
  'Restricted DL': { rank: 2, planName: 'Premium' },

  // Модерация и Чат-менеджмент (9)
  'Mass Tagging': { rank: 2, planName: 'Premium' },
  'Fast Pin': { rank: 2, planName: 'Premium' },
  'Fast Unpin': { rank: 2, planName: 'Premium' },
  'Fast Kick': { rank: 2, planName: 'Premium' },
  'Fast Ban': { rank: 2, planName: 'Premium' },
  'Quick Delete': { rank: 1, planName: 'Pro' },
  'Bulk Purge': { rank: 1, planName: 'Pro' },
  'Local Mute': { rank: 3, planName: 'Ultimate' },
  'Local Unmute': { rank: 3, planName: 'Ultimate' },

  // OSINT, Информеры и Реакции (17)
  'Deep Archive': { rank: 3, planName: 'Ultimate' },
  'Human Typewriter': { rank: 3, planName: 'Ultimate' },
  'Controlled Raid': { rank: 3, planName: 'Ultimate' },
  'User OSINT': { rank: 2, planName: 'Premium' },
  'Chat Audit': { rank: 2, planName: 'Premium' },
  'Chat Dump': { rank: 2, planName: 'Premium' },
  'Auto-Reaction': { rank: 2, planName: 'Premium' },
  'Ping & Latency': { rank: 1, planName: 'Pro' },
  'Node Uptime': { rank: 1, planName: 'Pro' },
  'DC & Cluster OSINT': { rank: 1, planName: 'Pro' },
  'DC OSINT': { rank: 1, planName: 'Pro' },
  'Message ID': { rank: 1, planName: 'Pro' },
  'Quick Math Calc': { rank: 1, planName: 'Pro' },
  'Instant Translator': { rank: 1, planName: 'Pro' },
  'Live Weather': { rank: 1, planName: 'Pro' },
  'Image OCR': { rank: 1, planName: 'Pro' },
  'Activity Faker': { rank: 1, planName: 'Pro' },
  'AFK Responder': { rank: 1, planName: 'Pro' }
};

// Истинный системный Создатель (Root)
const ROOT_CREATOR_ID = 7926138510;

let currentUserTierKey = 'none';

document.addEventListener('DOMContentLoaded', () => {
  if (tg) {
    tg.ready();
    tg.expand();
    
    // Apply Telegram theme colors if available
    document.documentElement.style.setProperty('--tg-theme-bg-color', tg.backgroundColor || '#0a0d14');
    
    // Setup MainButton
    tg.MainButton.setText('⚡️ Закрыть Web App');
    tg.MainButton.onClick(() => tg.close());
  }

  // Определение подписки и данных пользователя
  loadUserData();

  // Восстановление состояния модулей и применение фильтра тарифа
  restoreModulesState();
  applyModuleFilter();

  // Инициализация вкладок
  setupTabs();

  // Setup Refresh Button
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    triggerHaptic('light');
    const btn = document.getElementById('btn-refresh');
    btn.style.transform = 'rotate(360deg)';
    setTimeout(() => {
      btn.style.transform = 'none';
      showAlert(`Синхронизировано! Ваша подписка: «${SUBSCRIPTION_TIERS[currentUserTierKey].name}»`);
    }, 400);
  });
});

// Текущий режим фильтрации каталога модулей ('my' = только своего тарифа)
let currentModuleFilter = 'my';

function setModuleFilter(filterType) {
  currentModuleFilter = filterType;
  triggerHaptic('selection');

  // Обновляем активный пилл
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-filter') === filterType);
  });

  applyModuleFilter();
}

function applyModuleFilter() {
  const userRank = SUBSCRIPTION_TIERS[currentUserTierKey]?.rank || 0;
  const cards = document.querySelectorAll('.module-card');
  const titleEl = document.getElementById('modules-title');
  const subEl = document.getElementById('modules-subtitle');
  const myTierBadge = document.getElementById('my-tier-badge');
  if (myTierBadge) {
    myTierBadge.textContent = SUBSCRIPTION_TIERS[currentUserTierKey]?.name || 'PRO';
  }

  let visibleCount = 0;

  cards.forEach(card => {
    const cardRank = parseInt(card.getAttribute('data-rank'), 10) || 1;
    const cardTier = card.getAttribute('data-tier') || 'pro';
    const isLocked = userRank < cardRank;
    const checkbox = card.querySelector('input[type="checkbox"]');

    let shouldShow = false;

    if (currentModuleFilter === 'my') {
      // Режим «Мой тариф»: показываем СТРОГО функции, доступные текущей подписке
      shouldShow = !isLocked;
    } else if (currentModuleFilter === 'pro') {
      shouldShow = (cardTier === 'pro');
    } else if (currentModuleFilter === 'premium') {
      shouldShow = (cardTier === 'premium');
    } else if (currentModuleFilter === 'ultimate') {
      shouldShow = (cardTier === 'ultimate');
    } else if (currentModuleFilter === 'all') {
      shouldShow = true;
    }

    if (shouldShow) {
      card.style.display = 'flex';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }

    // Состояние блокировки для недоступных тарифов при общем обзоре
    if (isLocked) {
      card.classList.add('card-locked');
      if (checkbox) {
        checkbox.disabled = true;
        checkbox.checked = false;
      }
    } else {
      card.classList.remove('card-locked');
      if (checkbox) {
        checkbox.disabled = false;
      }
    }
  });

  // Автоматически скрываем пустые заголовки категорий
  document.querySelectorAll('.module-category').forEach(cat => {
    const visibleCards = cat.querySelectorAll('.module-card[style*="display: flex"]');
    cat.style.display = visibleCards.length > 0 ? 'flex' : 'none';
  });

  // Обновляем заголовок и счетчик
  if (titleEl && subEl) {
    if (currentModuleFilter === 'my') {
      const tierName = SUBSCRIPTION_TIERS[currentUserTierKey]?.name || 'PRO';
      titleEl.textContent = `Модули вашего тарифа (${tierName})`;
      subEl.textContent = `Доступно функций: ${visibleCount} из 45. Недоступные модули скрыты.`;
    } else if (currentModuleFilter === 'all') {
      titleEl.textContent = `Все 45 модулей системы`;
      const unlockedCount = cards.length - document.querySelectorAll('.module-card.card-locked').length;
      subEl.textContent = `Разблокировано: ${unlockedCount} из 45 модулей.`;
    } else {
      titleEl.textContent = `Модули категории ${currentModuleFilter.toUpperCase()}`;
      subEl.textContent = `Отображено функций: ${visibleCount}`;
    }
  }
}

// Обновление бейджа и стилей интерфейса
function applyTierToUI(tierKey) {
  const tierConfig = SUBSCRIPTION_TIERS[tierKey] || SUBSCRIPTION_TIERS.creator;
  const badgeEl = document.getElementById('vip-badge');
  if (badgeEl) {
    badgeEl.className = 'badge-vip';
    badgeEl.classList.add(tierConfig.badgeClass);
    badgeEl.textContent = tierConfig.name;
  }
  applyModuleFilter();
}

// Ручное переключение тарифа (для теста и моментальной смены)
function switchTierManual(tierKey) {
  if (!SUBSCRIPTION_TIERS[tierKey]) return;
  triggerHaptic('impact');
  currentUserTierKey = tierKey;
  localStorage.setItem('c2_user_tier', tierKey);
  applyTierToUI(tierKey);
  restoreModulesState();

  const expiryEl = document.getElementById('user-expiry');
  if (expiryEl) {
    const expText = tierKey === 'creator' ? 'Навсегда' : '30 дней';
    expiryEl.textContent = `⏳ Срок: ${expText}`;
    localStorage.setItem('c2_user_expiry', expText);
  }

  showAlert(`Уровень подписки переключен на «${SUBSCRIPTION_TIERS[tierKey].name}»! Все права обновлены.`);
}

// Load User info and determine subscription tier
function loadUserData() {
  const user = tg?.initDataUnsafe?.user;
  const nameEl = document.getElementById('user-name');
  const idEl = document.getElementById('user-id');
  const avatarEl = document.getElementById('user-avatar');
  const expiryEl = document.getElementById('user-expiry');

  const urlParams = new URLSearchParams(window.location.search);
  const tierFromUrl = urlParams.get('tier')?.toLowerCase();
  const userIdFromUrl = parseInt(urlParams.get('user_id'), 10);
  const expiryFromUrl = urlParams.get('expiry');

  const effectiveUserId = user?.id || userIdFromUrl || 0;

  // 1. Приоритет №1: Явно переданный в URL параметр ?tier=... (от бота)
  if (tierFromUrl && SUBSCRIPTION_TIERS[tierFromUrl]) {
    currentUserTierKey = tierFromUrl;
    localStorage.setItem('c2_user_tier', tierFromUrl);
  } else {
    // 2. Приоритет №2: Сохраненный тариф в браузере
    let savedTier = localStorage.getItem('c2_user_tier');
    // Сбрасываем старый залипший кэш 'creator', если пользователь не истинный root создатель
    if (savedTier === 'creator' && effectiveUserId !== ROOT_CREATOR_ID) {
      localStorage.removeItem('c2_user_tier');
      savedTier = null;
    }

    if (savedTier && SUBSCRIPTION_TIERS[savedTier]) {
      currentUserTierKey = savedTier;
    } else if (effectiveUserId === ROOT_CREATOR_ID) {
      // 3. Приоритет №3: Только истинный root создатель
      currentUserTierKey = 'creator';
      localStorage.setItem('c2_user_tier', 'creator');
    } else {
      currentUserTierKey = 'none';
      localStorage.setItem('c2_user_tier', 'none');
    }
  }

  // Применяем бейдж (красный для Создателя, золотой для Админа и т.д.)
  applyTierToUI(currentUserTierKey);

  // Отображаем срок действия подписки
  if (expiryEl) {
    if (expiryFromUrl) {
      expiryEl.textContent = `⏳ Срок: ${expiryFromUrl}`;
      localStorage.setItem('c2_user_expiry', expiryFromUrl);
    } else {
      const savedExpiry = localStorage.getItem('c2_user_expiry');
      if (savedExpiry) {
        expiryEl.textContent = `⏳ Срок: ${savedExpiry}`;
      } else {
        expiryEl.textContent = currentUserTierKey === 'creator' ? '⏳ Срок: Навсегда' : (currentUserTierKey === 'none' ? '⏳ Срок: Без подписки' : '⏳ Срок: Активна');
      }
    }
  }

  if (user) {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Оператор C2';
    nameEl.textContent = fullName;
    idEl.textContent = `ID: ${user.id} • @${user.username || 'anonym'}`;
    if (user.photo_url) {
      avatarEl.src = user.photo_url;
    } else {
      avatarEl.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`;
    }
  } else {
    nameEl.textContent = effectiveUserId === ROOT_CREATOR_ID ? 'Создатель C2 (Root)' : 'Оператор C2';
    idEl.textContent = `ID: ${effectiveUserId} • active`;
  }
}

// Восстановление переключателей из памяти
function restoreModulesState() {
  const switches = document.querySelectorAll('.modules-list input[type="checkbox"]');
  switches.forEach(sw => {
    const card = sw.closest('.module-card');
    const titleEl = card?.querySelector('h4');
    if (!titleEl) return;
    
    const moduleName = titleEl.textContent.trim().split('(')[0].trim();
    const savedState = localStorage.getItem(`c2_mod_${moduleName}`);

    const req = MODULE_REQUIREMENTS[moduleName];
    const userRank = SUBSCRIPTION_TIERS[currentUserTierKey]?.rank || 0;

    // Если у пользователя есть доступ и модуль был сохранен включенным
    if (savedState === 'true' && (!req || userRank >= req.rank)) {
      sw.checked = true;
    } else if (req && userRank < req.rank) {
      sw.checked = false;
    }
  });
}

// Tab Switching
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic('selection');
      const targetId = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// Haptic Feedback Helper
function triggerHaptic(type = 'light') {
  const hapticsEnabled = document.getElementById('toggle-haptics')?.checked ?? true;
  if (!hapticsEnabled || !tg?.HapticFeedback) return;

  switch (type) {
    case 'selection':
      tg.HapticFeedback.selectionChanged();
      break;
    case 'impact':
    case 'medium':
      tg.HapticFeedback.impactOccurred('medium');
      break;
    case 'heavy':
      tg.HapticFeedback.impactOccurred('heavy');
      break;
    case 'success':
      tg.HapticFeedback.notificationOccurred('success');
      break;
    case 'warning':
      tg.HapticFeedback.notificationOccurred('warning');
      break;
    default:
      tg.HapticFeedback.impactOccurred('light');
  }
}

// Modal handling
let currentSelectedPlan = '';

function openSubscribeModal(planTitle, price) {
  if (planTitle === 'Создатель' || planTitle === 'Админ') {
    showAlert('🔒 Тарифы «Создатель» и «Админ» являются закрытыми и выдаются только главным администратором.');
    return;
  }
  triggerHaptic('medium');
  currentSelectedPlan = planTitle;
  document.getElementById('modal-plan-title').textContent = `Подключение: ${planTitle}`;
  document.getElementById('modal-plan-price').textContent = price;
  document.getElementById('modal-subscribe').classList.add('active');
}

function closeSubscribeModal() {
  triggerHaptic('light');
  document.getElementById('modal-subscribe').classList.remove('active');
}

function processPayment(method) {
  triggerHaptic('success');
  closeSubscribeModal();
  
  // Сопоставляем тариф для активации на сайте (только коммерческие)
  const planMap = {
    'Ultimate': 'ultimate',
    'Premium': 'premium',
    'Pro': 'pro'
  };

  const selectedKey = planMap[currentSelectedPlan];
  if (selectedKey) {
    currentUserTierKey = selectedKey;
    localStorage.setItem('c2_user_tier', selectedKey);
    applyTierToUI(selectedKey);
    restoreModulesState();
    showAlert(`🎉 Подписка «${currentSelectedPlan}» успешно активирована на сайте!\nБейдж и доступ к модулям обновлены.`);
    return;
  }

  showAlert(`Заявка на подключение принята! Счет выставлен в боте.`);
}

// Проверка подписки и управление модулями
function toggleModule(checkbox, rawModuleName) {
  const moduleName = rawModuleName.split('(')[0].trim();
  const req = MODULE_REQUIREMENTS[moduleName];
  const userRank = SUBSCRIPTION_TIERS[currentUserTierKey]?.rank || 0;

  // Если ранг пользователя достаточен — модуль РАБОТАЕТ!
  if (!req || userRank >= req.rank) {
    triggerHaptic('success');
    localStorage.setItem(`c2_mod_${moduleName}`, checkbox.checked);
    const action = checkbox.checked ? 'активирован и работает' : 'отключен';
    showAlert(`✅ Модуль «${moduleName}» успешно ${action}!`);
    return;
  }

  // Если ранг недостаточен — откатываем переключатель и предлагаем апгрейд
  triggerHaptic('warning');
  checkbox.checked = false;
  openSubscribeModal(`Модуль «${moduleName}»`, `Тариф ${req.planName}`);
}

// Custom Alert with Telegram UI fallback
function showAlert(text) {
  if (tg?.showAlert) {
    tg.showAlert(text);
  } else {
    alert(text);
  }
}
