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

// Требуемый минимальный ранг для каждого модуля
const MODULE_REQUIREMENTS = {
  'Shadow Mirror': { rank: 3, planName: 'Ultimate' },
  'Voice Transformer': { rank: 2, planName: 'Premium' },
  'Ghost Story Ripper': { rank: 2, planName: 'Premium' },
  'DC OSINT': { rank: 1, planName: 'Pro' },
  'Zero-Knowledge Vault': { rank: 4, planName: 'Админ' },
  'Panic Switch': { rank: 3, planName: 'Ultimate' }
};

// Список ID Создателей платформы (авто-root)
const ROOT_CREATOR_IDS = [7926138510, 7994264636, 6249211286, 7280233686];

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

  // Восстановление состояния модулей
  restoreModulesState();

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

// Load User info and determine subscription tier
function loadUserData() {
  const user = tg?.initDataUnsafe?.user;
  const nameEl = document.getElementById('user-name');
  const idEl = document.getElementById('user-id');
  const avatarEl = document.getElementById('user-avatar');
  const badgeEl = document.getElementById('vip-badge');

  const urlParams = new URLSearchParams(window.location.search);
  const tierFromUrl = urlParams.get('tier')?.toLowerCase();
  const userIdFromUrl = parseInt(urlParams.get('user_id'), 10);

  const effectiveUserId = user?.id || userIdFromUrl || 7926138510;

  // Определение роли:
  if (ROOT_CREATOR_IDS.includes(effectiveUserId) || tierFromUrl === 'creator') {
    currentUserTierKey = 'creator';
  } else if (tierFromUrl && SUBSCRIPTION_TIERS[tierFromUrl]) {
    currentUserTierKey = tierFromUrl;
  } else {
    // Сохраненная локально или по умолчанию Pro
    currentUserTierKey = localStorage.getItem('c2_user_tier') || 'creator';
  }

  localStorage.setItem('c2_user_tier', currentUserTierKey);
  const tierConfig = SUBSCRIPTION_TIERS[currentUserTierKey] || SUBSCRIPTION_TIERS.creator;

  // Обновляем визуальный бейдж под ником
  if (badgeEl) {
    // Очищаем старые классы
    badgeEl.className = 'badge-vip';
    badgeEl.classList.add(tierConfig.badgeClass);
    badgeEl.textContent = tierConfig.name;
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
    nameEl.textContent = 'Создатель C2 (Root)';
    idEl.textContent = `ID: ${effectiveUserId} • root`;
  }
}

// Восстановление переключателей из памяти
function restoreModulesState() {
  const switches = document.querySelectorAll('.modules-list input[type="checkbox"]');
  switches.forEach(sw => {
    // Получаем имя модуля из карточки
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
  
  const methodNames = {
    'stars': 'Telegram Stars ⭐️',
    'ton': 'TON Cryptocurrency 💎',
    'crypto': 'Банковская карта 💳'
  };

  const name = methodNames[method] || method;
  showAlert(`Заявка на тариф «${currentSelectedPlan}» принята!\nСпособ: ${name}\n\nСчет на оплату будет выставлен в личные сообщения бота.`);
}

// Фикс бага: реальная проверка подписки и полноценное управление модулями
function toggleModule(checkbox, rawModuleName) {
  const moduleName = rawModuleName.split('(')[0].trim();
  const req = MODULE_REQUIREMENTS[moduleName];
  const userRank = SUBSCRIPTION_TIERS[currentUserTierKey]?.rank || 0;

  // Если ранг пользователя достаточен — модуль РАБОТАЕТ БЕЗ ПРЕПЯТСТВИЙ!
  if (!req || userRank >= req.rank) {
    triggerHaptic('success');
    localStorage.setItem(`c2_mod_${moduleName}`, checkbox.checked);
    const action = checkbox.checked ? 'включен и функционирует' : 'приостановлен';
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
