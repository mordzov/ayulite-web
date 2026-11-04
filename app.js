// Telegram Web App SDK initialization
const tg = window.Telegram?.WebApp;

document.addEventListener('DOMContentLoaded', () => {
  if (tg) {
    tg.ready();
    tg.expand();
    
    // Apply Telegram theme colors if available
    document.documentElement.style.setProperty('--tg-theme-bg-color', tg.backgroundColor || '#0a0d14');
    
    // Setup MainButton
    tg.MainButton.setText('⚡️ Закрыть Web App');
    tg.MainButton.onClick(() => tg.close());
    // tg.MainButton.show();
  }

  // Load User Data from Telegram WebApp
  loadUserData();

  // Setup Tab Navigation
  setupTabs();

  // Setup Refresh Button
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    triggerHaptic('light');
    const btn = document.getElementById('btn-refresh');
    btn.style.transform = 'rotate(360deg)';
    setTimeout(() => {
      btn.style.transform = 'none';
      showAlert('Данные синхронизированы с C2 ядром!');
    }, 400);
  });
});

// Load User info from tg.initDataUnsafe
function loadUserData() {
  const user = tg?.initDataUnsafe?.user;
  const nameEl = document.getElementById('user-name');
  const idEl = document.getElementById('user-id');
  const avatarEl = document.getElementById('user-avatar');

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
    nameEl.textContent = '.koreyec (Dev Mode)';
    idEl.textContent = 'ID: 7926138510 • root';
  }
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

// Module Toggle Demo
function toggleModule(checkbox, moduleName) {
  triggerHaptic('warning');
  if (checkbox.checked) {
    // Uncheck and prompt for premium
    checkbox.checked = false;
    openSubscribeModal(`Модуль «${moduleName}»`, '49 ⭐️');
  }
}

// Custom Alert with Telegram UI fallback
function showAlert(text) {
  if (tg?.showAlert) {
    tg.showAlert(text);
  } else {
    alert(text);
  }
}
