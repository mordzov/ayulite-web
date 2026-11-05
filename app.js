/* AyuLite C2 - High-Tech Industrial Cyber Client Engine v7.0 */

/* ============ Telegram Web App ============ */
const tg = (window.Telegram && window.Telegram.WebApp) || null;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor('#0b0b0c');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#0b0b0c');
    if (tg.onEvent) tg.onEvent('backButton', () => closeModals());
  } catch (e) {}
}

function haptic(style) {
  if (!tg || !tg.HapticFeedback) return;
  const sw = document.getElementById('optHaptics');
  if (sw && !sw.checked) return;
  try { tg.HapticFeedback.impactOccurred(style || 'light'); } catch (e) {}
}

function hapticNotify(type) {
  if (!tg || !tg.HapticFeedback) return;
  const sw = document.getElementById('optHaptics');
  if (sw && !sw.checked) return;
  try { tg.HapticFeedback.notificationOccurred(type || 'success'); } catch (e) {}
}

/* ============ Configuration & Tiers ============ */
const TIERS = { none: 0, pro: 1, premium: 2, ultimate: 3, creator: 5 };
const LABEL = { none: 'БАЗОВЫЙ', pro: 'PRO', premium: 'PREMIUM', ultimate: 'ULTIMATE', creator: 'CREATOR' };

const CATS = [
  {
    title: 'Теневые протоколы и перехват',
    items: [
      { n: 'Anti-Delete', c: '', t: 'pro', d: 'Перехватывает удалённые сообщения и отправляет оригинал в лог.' },
      { n: 'Anti-Edit', c: '', t: 'pro', d: 'Сохраняет исходный текст сообщения до редактирования.' },
      { n: 'Ghost Read', c: '', t: 'pro', d: 'Чтение без подтверждения — собеседник не видит галочки.' },
      { n: 'Private Log Channels', c: '', t: 'pro', d: 'Автоматическое создание закрытого канала и пересылка логов удалений.' },
      { n: 'TTL Grabber', c: '', t: 'premium', d: 'Перехват сгорающих фото и видео, включая таймер 1 view.' }
    ]
  },
  {
    title: 'Медиа и AI',
    items: [
      { n: 'Speech-to-Text', c: '.stt', t: 'ultimate', d: 'Чанковая расшифровка голосовых и видеокружков в текст.' },
      { n: 'Text-to-Speech', c: '.tts', t: 'ultimate', d: 'Синтез речи в нативное голосовое с обходом приватности.' },
      { n: 'Video to Circle', c: '.circle / .round', t: 'premium', d: 'Конвертация видео и GIF в круглые сообщения 1:1.' },
      { n: 'Voice Converter', c: '.voice', t: 'premium', d: 'Извлечение аудио из видео в голосовое сообщение.' },
      { n: 'Media Saver', c: '.save / .dl', t: 'premium', d: 'Обход запрета на сохранение медиа в защищённых чатах.' }
    ]
  },
  {
    title: 'Модерация и чат',
    items: [
      { n: 'Mass Tagging', c: '.tagall', t: 'premium', d: 'Массовый созыв участников пакетами по 5 человек.' },
      { n: 'Fast Pin', c: '.pin', t: 'premium', d: 'Закрепление сообщения с опцией тихого режима.' },
      { n: 'Fast Unpin', c: '.unpin', t: 'premium', d: 'Снятие закрепа или очистка всех закрепов.' },
      { n: 'Fast Kick', c: '.kick', t: 'premium', d: 'Исключение пользователя из группы по реплаю.' },
      { n: 'Fast Ban', c: '.ban', t: 'premium', d: 'Перманентная блокировка пользователя в группе.' },
      { n: 'Quick Delete', c: '.del', t: 'pro', d: 'Удаление сообщения без сервисных отметок.' },
      { n: 'Bulk Purge', c: '.purge', t: 'pro', d: 'Пакетная очистка своих сообщений с защитой от флуда.' },
      { n: 'Local Mute', c: '.mute', t: 'ultimate', d: 'Локальная блокировка сообщений от контакта без тегов.' },
      { n: 'Local Unmute', c: '.unmute', t: 'ultimate', d: 'Снятие локальной блокировки с контакта.' }
    ]
  },
  {
    title: 'OSINT и информеры',
    items: [
      { n: 'Deep Archive', c: '.dump_full', t: 'ultimate', d: 'Полная выгрузка истории с медиа в защищённый ZIP.' },
      { n: 'Controlled Raid', c: '.spam', t: 'ultimate', d: 'Серия сообщений с заданным числом повторений и задержкой.' },
      { n: 'User OSINT', c: '.info', t: 'premium', d: 'Досье на контакт: ID, DC, Premium, флаги Scam/Fake.' },
      { n: 'Chat Audit', c: '.chatinfo', t: 'premium', d: 'Аудит группы: ID, участники, тип, права.' },
      { n: 'Chat Dump', c: '.dump', t: 'premium', d: 'Выгрузка истории диалога в JSON.' },
      { n: 'Ping & Latency', c: '.ping', t: 'pro', d: 'Замер отклика до дата-центров Telegram.' },
      { n: 'Node Uptime', c: '.uptime', t: 'pro', d: 'Аптайм узла, нагрузка CPU и RAM, сессия.' },
      { n: 'Instant Translator', c: '.trans', t: 'pro', d: 'Перевод сообщений на 50+ языков.' },
      { n: 'Image OCR', c: '.ocr', t: 'pro', d: 'Распознавание текста с изображений локально, без серверов.' },
      { n: 'Activity Faker', c: '.fake', t: 'pro', d: 'Симуляция набора текста, записи голоса или видео.' },
      { n: 'AFK Responder', c: '.afk', t: 'pro', d: 'Автоответчик с причиной отсутствия и таймером.' }
    ]
  },
  {
    title: 'Кибер-разведка',
    items: [
      { n: 'Deep Profile', c: '.whois', t: 'pro', d: 'Глубокая разведка профиля: регистрация, DC, общие чаты.' },
      { n: 'Entity ID', c: '.id', t: 'pro', d: 'Мгновенное извлечение ID беседы и автора сообщения.' },
      { n: 'Permalink', c: '.permalink / .pm', t: 'pro', d: 'Постоянная ссылка на человека — tg://user?id=...' },
      { n: 'Crypto Pulse', c: '.crypto / .coin', t: 'pro', d: 'Котировки криптовалют через Binance API.' },
      { n: 'QR Generator', c: '.qr', t: 'pro', d: 'Генерация QR-кода из текста или ссылки.' },
      { n: 'Quote Stylizer', c: '.quote / .q', t: 'pro', d: 'Превращает сообщение в стилизованную блочную цитату.' },
      { n: 'Cloud Pastebin', c: '.paste', t: 'premium', d: 'Загрузка кода и логов на dpaste с подсветкой синтаксиса.' },
      { n: 'URL Unshortener', c: '.unshort', t: 'premium', d: 'Разворачивание сокращённых ссылок без перехода.' },
      { n: 'Sticker Ripper', c: '.kang / .steal', t: 'premium', d: 'Извлечение стикера в исходном разрешении.' },
      { n: 'Time Bomb', c: '.bomb', t: 'ultimate', d: 'Сообщение с обратным отсчётом и автоудалением.' },
      { n: 'Host Speedtest', c: '.speedtest', t: 'ultimate', d: 'Замер скорости канала сервера: скачивание, отдача, пинг.' }
    ]
  },
  {
    title: 'Скрытые утилиты',
    items: [
      { n: 'IP Recon', c: '.ip', t: 'pro', d: 'География, провайдер, ASN и таймзона по IP.' },
      { n: 'DoH DNS', c: '.dns', t: 'pro', d: 'DNS-записи через DNS-over-HTTPS.' },
      { n: 'XOR Cipher', c: '.enc / .dec', t: 'pro', d: 'Шифрование текста персональным ключом.' },
      { n: 'EXIF Extractor', c: '.exif', t: 'premium', d: 'Скрытые теги фото: камера, дата, GPS.' },
      { n: 'Geotag Scrubber', c: '.scrub', t: 'premium', d: 'Очистка изображения от EXIF и геометок.' },
      { n: 'TempMail', c: '.tempmail', t: 'premium', d: 'Одноразовый почтовый ящик для регистраций.' },
      { n: 'Mail Check', c: '.mailcheck', t: 'premium', d: 'Приём писем и кодов подтверждения в Telegram.' },
      { n: 'Reminder', c: '.remind', t: 'ultimate', d: 'Асинхронный планировщик напоминаний.' },
      { n: 'Activity Heatmap', c: '.activity', t: 'ultimate', d: 'Анализ активности чата и топ спикеров.' },
      { n: 'Voice Robot', c: '.robot', t: 'ultimate', d: 'Маскировка голоса фленджером и сменой форманты.' },
      { n: 'Bass Boost', c: '.bass', t: 'ultimate', d: 'Усиление низких частот голосовых на +22 дБ.' }
    ]
  },
  {
    title: 'Профиль и форензика',
    items: [
      { n: 'Profile Cloner', c: '.clone', t: 'ultimate', d: 'Клонирование аватара, имени и био цели.' },
      { n: 'Profile Reverter', c: '.unclone', t: 'ultimate', d: 'Откат клонирования из бэкапа.' },
      { n: 'Voice Forensics', c: '.device', t: 'premium', d: 'Определение устройства записи по волновой структуре.' },
      { n: 'Layout Switcher', c: '.switch / .sw', t: 'pro', d: 'Конвертация текста между раскладками.' },
      { n: 'Message to Document', c: '.m2f', t: 'pro', d: 'Экспорт текста в .txt-файл.' },
      { n: 'Document to Message', c: '.f2m', t: 'pro', d: 'Чтение содержимого документа в чат.' },
      { n: 'FakeVoice', c: '.fakevoice / .fvoice', t: 'premium', d: 'Голосовое сообщение в обход запрета.' }
    ]
  }
];

const ALL = [];
CATS.forEach(c => c.items.forEach(m => {
  m.gid = ALL.length;
  ALL.push(m);
}));

/* Extensive 90+ Countries List */
const COUNTRIES = [
  {
    "f": "🇷🇺",
    "n": "Россия",
    "c": "+7",
    "p": "(999) 000-00-00",
    "d": 10,
    "a": "russia rf rus"
  },
  {
    "f": "🇰🇿",
    "n": "Казахстан",
    "c": "+7",
    "p": "(700) 000-00-00",
    "d": 10,
    "a": "kazakhstan kz"
  },
  {
    "f": "🇧🇾",
    "n": "Беларусь",
    "c": "+375",
    "p": "(29) 000-00-00",
    "d": 9,
    "a": "belarus by belorussia"
  },
  {
    "f": "🇺🇦",
    "n": "Украина",
    "c": "+380",
    "p": "(50) 000-00-00",
    "d": 9,
    "a": "ukraine ua"
  },
  {
    "f": "🇺🇿",
    "n": "Узбекистан",
    "c": "+998",
    "p": "(90) 000-00-00",
    "d": 9,
    "a": "uzbekistan uz"
  },
  {
    "f": "🇰🇬",
    "n": "Кыргызстан",
    "c": "+996",
    "p": "(555) 00-00-00",
    "d": 9,
    "a": "kyrgyzstan kg kirgizia"
  },
  {
    "f": "🇹🇯",
    "n": "Таджикистан",
    "c": "+992",
    "p": "(90) 000-00-00",
    "d": 9,
    "a": "tajikistan tj"
  },
  {
    "f": "🇹🇲",
    "n": "Туркменистан",
    "c": "+993",
    "p": "(65) 00-00-00",
    "d": 8,
    "a": "turkmenistan tm"
  },
  {
    "f": "🇦🇲",
    "n": "Армения",
    "c": "+374",
    "p": "(90) 00-00-00",
    "d": 8,
    "a": "armenia am"
  },
  {
    "f": "🇦🇿",
    "n": "Азербайджан",
    "c": "+994",
    "p": "(50) 000-00-00",
    "d": 9,
    "a": "azerbaijan az"
  },
  {
    "f": "🇬🇪",
    "n": "Грузия",
    "c": "+995",
    "p": "(555) 00-00-00",
    "d": 9,
    "a": "georgia ge gruzia"
  },
  {
    "f": "🇲🇩",
    "n": "Молдова",
    "c": "+373",
    "p": "(60) 00-00-00",
    "d": 8,
    "a": "moldova md moldavia"
  },
  {
    "f": "🇩🇪",
    "n": "Германия",
    "c": "+49",
    "p": "151 00000000",
    "d": 11,
    "a": "germany de deutschland"
  },
  {
    "f": "🇬🇧",
    "n": "Великобритания",
    "c": "+44",
    "p": "7911 000000",
    "d": 10,
    "a": "united kingdom uk great britain gb england"
  },
  {
    "f": "🇫🇷",
    "n": "Франция",
    "c": "+33",
    "p": "6 00 00 00 00",
    "d": 9,
    "a": "france fr"
  },
  {
    "f": "🇮🇹",
    "n": "Италия",
    "c": "+39",
    "p": "320 000 0000",
    "d": 10,
    "a": "italy it italia"
  },
  {
    "f": "🇪🇸",
    "n": "Испания",
    "c": "+34",
    "p": "600 000 000",
    "d": 9,
    "a": "spain es espana"
  },
  {
    "f": "🇵🇹",
    "n": "Португалия",
    "c": "+351",
    "p": "910 000 000",
    "d": 9,
    "a": "portugal pt"
  },
  {
    "f": "🇳🇱",
    "n": "Нидерланды",
    "c": "+31",
    "p": "6 00000000",
    "d": 9,
    "a": "netherlands nl holland"
  },
  {
    "f": "🇧🇪",
    "n": "Бельгия",
    "c": "+32",
    "p": "470 00 00 00",
    "d": 9,
    "a": "belgium be"
  },
  {
    "f": "🇨🇭",
    "n": "Швейцария",
    "c": "+41",
    "p": "78 000 00 00",
    "d": 9,
    "a": "switzerland ch swiss"
  },
  {
    "f": "🇦🇹",
    "n": "Австрия",
    "c": "+43",
    "p": "660 0000000",
    "d": 10,
    "a": "austria at osterreich"
  },
  {
    "f": "🇵🇱",
    "n": "Польша",
    "c": "+48",
    "p": "500 000 000",
    "d": 9,
    "a": "poland pl polska"
  },
  {
    "f": "🇨🇿",
    "n": "Чехия",
    "c": "+420",
    "p": "601 000 000",
    "d": 9,
    "a": "czech republic cz czechia"
  },
  {
    "f": "🇸🇰",
    "n": "Словакия",
    "c": "+421",
    "p": "901 000 000",
    "d": 9,
    "a": "slovakia sk"
  },
  {
    "f": "🇭🇺",
    "n": "Венгрия",
    "c": "+36",
    "p": "20 000 0000",
    "d": 9,
    "a": "hungary hu magyar"
  },
  {
    "f": "🇷🇴",
    "n": "Румыния",
    "c": "+40",
    "p": "720 000 000",
    "d": 9,
    "a": "romania ro"
  },
  {
    "f": "🇧🇬",
    "n": "Болгария",
    "c": "+359",
    "p": "88 000 0000",
    "d": 9,
    "a": "bulgaria bg"
  },
  {
    "f": "🇬🇷",
    "n": "Греция",
    "c": "+30",
    "p": "690 000 0000",
    "d": 10,
    "a": "greece gr hellas"
  },
  {
    "f": "🇹🇷",
    "n": "Турция",
    "c": "+90",
    "p": "(500) 000 00 00",
    "d": 10,
    "a": "turkey tr turkiye"
  },
  {
    "f": "🇨🇾",
    "n": "Кипр",
    "c": "+357",
    "p": "99 000000",
    "d": 8,
    "a": "cyprus cy"
  },
  {
    "f": "🇱🇹",
    "n": "Литва",
    "c": "+370",
    "p": "(600) 00 000",
    "d": 8,
    "a": "lithuania lt"
  },
  {
    "f": "🇱🇻",
    "n": "Латвия",
    "c": "+371",
    "p": "20 000 000",
    "d": 8,
    "a": "latvia lv"
  },
  {
    "f": "🇪🇪",
    "n": "Эстония",
    "c": "+372",
    "p": "5000 0000",
    "d": 8,
    "a": "estonia ee"
  },
  {
    "f": "🇫🇮",
    "n": "Финляндия",
    "c": "+358",
    "p": "40 0000000",
    "d": 9,
    "a": "finland fi suomi"
  },
  {
    "f": "🇸🇪",
    "n": "Швеция",
    "c": "+46",
    "p": "70 000 00 00",
    "d": 9,
    "a": "sweden se sverige"
  },
  {
    "f": "🇳🇴",
    "n": "Норвегия",
    "c": "+47",
    "p": "400 00 000",
    "d": 8,
    "a": "norway no norge"
  },
  {
    "f": "🇩🇰",
    "n": "Дания",
    "c": "+45",
    "p": "20 00 00 00",
    "d": 8,
    "a": "denmark dk danmark"
  },
  {
    "f": "🇮🇸",
    "n": "Исландия",
    "c": "+354",
    "p": "600 0000",
    "d": 7,
    "a": "iceland is"
  },
  {
    "f": "🇮🇪",
    "n": "Ирландия",
    "c": "+353",
    "p": "85 000 0000",
    "d": 9,
    "a": "ireland ie"
  },
  {
    "f": "🇷🇸",
    "n": "Сербия",
    "c": "+381",
    "p": "60 0000000",
    "d": 9,
    "a": "serbia rs srbija"
  },
  {
    "f": "🇭🇷",
    "n": "Хорватия",
    "c": "+385",
    "p": "91 000 0000",
    "d": 9,
    "a": "croatia hr hrvatska"
  },
  {
    "f": "🇸🇮",
    "n": "Словения",
    "c": "+386",
    "p": "40 000 000",
    "d": 8,
    "a": "slovenia si"
  },
  {
    "f": "🇧🇦",
    "n": "Босния и Герцеговина",
    "c": "+387",
    "p": "61 000 000",
    "d": 8,
    "a": "bosnia ba"
  },
  {
    "f": "🇲🇪",
    "n": "Черногория",
    "c": "+382",
    "p": "67 000 000",
    "d": 8,
    "a": "montenegro me"
  },
  {
    "f": "🇲🇰",
    "n": "Северная Македония",
    "c": "+389",
    "p": "70 000 000",
    "d": 8,
    "a": "north macedonia mk"
  },
  {
    "f": "🇦🇱",
    "n": "Албания",
    "c": "+355",
    "p": "67 000 0000",
    "d": 9,
    "a": "albania al"
  },
  {
    "f": "🇱🇺",
    "n": "Люксембург",
    "c": "+352",
    "p": "621 000 000",
    "d": 9,
    "a": "luxembourg lu"
  },
  {
    "f": "🇲🇹",
    "n": "Мальта",
    "c": "+356",
    "p": "9900 0000",
    "d": 8,
    "a": "malta mt"
  },
  {
    "f": "🇲🇨",
    "n": "Монако",
    "c": "+377",
    "p": "6 00 00 00 00",
    "d": 8,
    "a": "monaco mc"
  },
  {
    "f": "🇦🇩",
    "n": "Андорра",
    "c": "+376",
    "p": "300 000",
    "d": 6,
    "a": "andorra ad"
  },
  {
    "f": "🇸🇲",
    "n": "Сан-Марино",
    "c": "+378",
    "p": "66 000 000",
    "d": 8,
    "a": "san marino sm"
  },
  {
    "f": "🇱🇮",
    "n": "Лихтенштейн",
    "c": "+423",
    "p": "660 0000",
    "d": 7,
    "a": "liechtenstein li"
  },
  {
    "f": "🇺🇸",
    "n": "США",
    "c": "+1",
    "p": "(555) 000-0000",
    "d": 10,
    "a": "usa united states america us"
  },
  {
    "f": "🇨🇦",
    "n": "Канада",
    "c": "+1",
    "p": "(416) 000-0000",
    "d": 10,
    "a": "canada ca"
  },
  {
    "f": "🇲🇽",
    "n": "Мексика",
    "c": "+52",
    "p": "55 0000 0000",
    "d": 10,
    "a": "mexico mx"
  },
  {
    "f": "🇦🇪",
    "n": "ОАЭ",
    "c": "+971",
    "p": "(50) 000-0000",
    "d": 9,
    "a": "uae united arab emirates dubai abu dhabi"
  },
  {
    "f": "🇸🇦",
    "n": "Саудовская Аравия",
    "c": "+966",
    "p": "50 000 0000",
    "d": 9,
    "a": "saudi arabia sa ksa"
  },
  {
    "f": "🇶🇦",
    "n": "Катар",
    "c": "+974",
    "p": "3300 0000",
    "d": 8,
    "a": "qatar qa"
  },
  {
    "f": "🇰🇼",
    "n": "Кувейт",
    "c": "+965",
    "p": "9000 0000",
    "d": 8,
    "a": "kuwait kw"
  },
  {
    "f": "🇧🇭",
    "n": "Бахрейн",
    "c": "+973",
    "p": "3900 0000",
    "d": 8,
    "a": "bahrain bh"
  },
  {
    "f": "🇴🇲",
    "n": "Оман",
    "c": "+968",
    "p": "9100 0000",
    "d": 8,
    "a": "oman om"
  },
  {
    "f": "🇮🇱",
    "n": "Израиль",
    "c": "+972",
    "p": "50 000 0000",
    "d": 9,
    "a": "israel il"
  },
  {
    "f": "🇯🇴",
    "n": "Иордания",
    "c": "+962",
    "p": "7 9000 0000",
    "d": 9,
    "a": "jordan jo"
  },
  {
    "f": "🇱🇧",
    "n": "Ливан",
    "c": "+961",
    "p": "70 000 000",
    "d": 8,
    "a": "lebanon lb"
  },
  {
    "f": "🇮🇶",
    "n": "Ирак",
    "c": "+964",
    "p": "790 000 0000",
    "d": 10,
    "a": "iraq iq"
  },
  {
    "f": "🇸🇾",
    "n": "Сирия",
    "c": "+963",
    "p": "94 000 0000",
    "d": 9,
    "a": "syria sy"
  },
  {
    "f": "🇾🇪",
    "n": "Йемен",
    "c": "+967",
    "p": "70 000 000",
    "d": 8,
    "a": "yemen ye"
  },
  {
    "f": "🇵🇸",
    "n": "Палестина",
    "c": "+970",
    "p": "59 000 0000",
    "d": 9,
    "a": "palestine ps"
  },
  {
    "f": "🇨🇳",
    "n": "Китай",
    "c": "+86",
    "p": "138 0000 0000",
    "d": 11,
    "a": "china cn prc"
  },
  {
    "f": "🇯🇵",
    "n": "Япония",
    "c": "+81",
    "p": "90 0000 0000",
    "d": 10,
    "a": "japan jp"
  },
  {
    "f": "🇰🇷",
    "n": "Южная Корея",
    "c": "+82",
    "p": "10 0000 0000",
    "d": 10,
    "a": "south korea kr korea"
  },
  {
    "f": "🇮🇳",
    "n": "Индия",
    "c": "+91",
    "p": "98000 00000",
    "d": 10,
    "a": "india in"
  },
  {
    "f": "🇹🇭",
    "n": "Таиланд",
    "c": "+66",
    "p": "81 000 0000",
    "d": 9,
    "a": "thailand th tai"
  },
  {
    "f": "🇻🇳",
    "n": "Вьетнам",
    "c": "+84",
    "p": "90 000 0000",
    "d": 9,
    "a": "vietnam vn"
  },
  {
    "f": "🇮🇩",
    "n": "Индонезия",
    "c": "+62",
    "p": "812 0000 0000",
    "d": 10,
    "a": "indonesia id bali"
  },
  {
    "f": "🇲🇾",
    "n": "Малайзия",
    "c": "+60",
    "p": "12 000 0000",
    "d": 9,
    "a": "malaysia my"
  },
  {
    "f": "🇸🇬",
    "n": "Сингапур",
    "c": "+65",
    "p": "8123 4567",
    "d": 8,
    "a": "singapore sg"
  },
  {
    "f": "🇵🇭",
    "n": "Филиппины",
    "c": "+63",
    "p": "917 000 0000",
    "d": 10,
    "a": "philippines ph"
  },
  {
    "f": "🇭🇰",
    "n": "Гонконг",
    "c": "+852",
    "p": "9123 4567",
    "d": 8,
    "a": "hong kong hk"
  },
  {
    "f": "🇲🇴",
    "n": "Макао",
    "c": "+853",
    "p": "6000 0000",
    "d": 8,
    "a": "macau mo"
  },
  {
    "f": "🇹🇼",
    "n": "Тайвань",
    "c": "+886",
    "p": "912 345 678",
    "d": 9,
    "a": "taiwan tw"
  },
  {
    "f": "🇦🇺",
    "n": "Австралия",
    "c": "+61",
    "p": "400 000 000",
    "d": 9,
    "a": "australia au"
  },
  {
    "f": "🇳🇿",
    "n": "Новая Зеландия",
    "c": "+64",
    "p": "21 000 0000",
    "d": 9,
    "a": "new zealand nz"
  },
  {
    "f": "🇲🇳",
    "n": "Монголия",
    "c": "+976",
    "p": "9900 0000",
    "d": 8,
    "a": "mongolia mn"
  },
  {
    "f": "🇵🇰",
    "n": "Пакистан",
    "c": "+92",
    "p": "300 0000000",
    "d": 10,
    "a": "pakistan pk"
  },
  {
    "f": "🇧🇩",
    "n": "Бангладеш",
    "c": "+880",
    "p": "1700 000000",
    "d": 10,
    "a": "bangladesh bd"
  },
  {
    "f": "🇱🇰",
    "n": "Шри-Ланка",
    "c": "+94",
    "p": "71 000 0000",
    "d": 9,
    "a": "sri lanka lk"
  },
  {
    "f": "🇳🇵",
    "n": "Непал",
    "c": "+977",
    "p": "980 0000000",
    "d": 10,
    "a": "nepal np"
  },
  {
    "f": "🇲🇻",
    "n": "Мальдивы",
    "c": "+960",
    "p": "770 0000",
    "d": 7,
    "a": "maldives mv"
  },
  {
    "f": "🇰🇭",
    "n": "Камбоджа",
    "c": "+855",
    "p": "12 000 000",
    "d": 8,
    "a": "cambodia kh"
  },
  {
    "f": "🇱🇦",
    "n": "Лаос",
    "c": "+856",
    "p": "20 0000 0000",
    "d": 9,
    "a": "laos la"
  },
  {
    "f": "🇲🇲",
    "n": "Мьянма",
    "c": "+95",
    "p": "9 0000 0000",
    "d": 9,
    "a": "myanmar mm burma"
  },
  {
    "f": "🇦🇫",
    "n": "Афганистан",
    "c": "+93",
    "p": "70 000 0000",
    "d": 9,
    "a": "afghanistan af"
  },
  {
    "f": "🇧🇳",
    "n": "Бруней",
    "c": "+673",
    "p": "700 0000",
    "d": 7,
    "a": "brunei bn"
  },
  {
    "f": "🇫🇯",
    "n": "Фиджи",
    "c": "+679",
    "p": "700 0000",
    "d": 7,
    "a": "fiji fj"
  },
  {
    "f": "🇧🇷",
    "n": "Бразилия",
    "c": "+55",
    "p": "(11) 90000-0000",
    "d": 11,
    "a": "brazil br brasil"
  },
  {
    "f": "🇦🇷",
    "n": "Аргентина",
    "c": "+54",
    "p": "(11) 0000-0000",
    "d": 10,
    "a": "argentina ar"
  },
  {
    "f": "🇨🇱",
    "n": "Чили",
    "c": "+56",
    "p": "9 0000 0000",
    "d": 9,
    "a": "chile cl"
  },
  {
    "f": "🇨🇴",
    "n": "Колумбия",
    "c": "+57",
    "p": "300 000 0000",
    "d": 10,
    "a": "colombia co"
  },
  {
    "f": "🇵🇪",
    "n": "Перу",
    "c": "+51",
    "p": "900 000 000",
    "d": 9,
    "a": "peru pe"
  },
  {
    "f": "🇻🇪",
    "n": "Венесуэла",
    "c": "+58",
    "p": "412 000 0000",
    "d": 10,
    "a": "venezuela ve"
  },
  {
    "f": "🇺🇾",
    "n": "Уругвай",
    "c": "+598",
    "p": "99 000 000",
    "d": 8,
    "a": "uruguay uy"
  },
  {
    "f": "🇵🇾",
    "n": "Парагвай",
    "c": "+595",
    "p": "981 000 000",
    "d": 9,
    "a": "paraguay py"
  },
  {
    "f": "🇧🇴",
    "n": "Боливия",
    "c": "+591",
    "p": "700 00000",
    "d": 8,
    "a": "bolivia bo"
  },
  {
    "f": "🇪🇨",
    "n": "Эквадор",
    "c": "+593",
    "p": "99 000 0000",
    "d": 9,
    "a": "ecuador ec"
  },
  {
    "f": "🇵🇦",
    "n": "Панама",
    "c": "+507",
    "p": "6000-0000",
    "d": 8,
    "a": "panama pa"
  },
  {
    "f": "🇨🇷",
    "n": "Коста-Рика",
    "c": "+506",
    "p": "8000-0000",
    "d": 8,
    "a": "costa rica cr"
  },
  {
    "f": "🇩🇴",
    "n": "Доминиканская Респ.",
    "c": "+1",
    "p": "(809) 000-0000",
    "d": 10,
    "a": "dominican republic do"
  },
  {
    "f": "🇨🇺",
    "n": "Куба",
    "c": "+53",
    "p": "5 000 0000",
    "d": 8,
    "a": "cuba cu"
  },
  {
    "f": "🇬🇹",
    "n": "Гватемала",
    "c": "+502",
    "p": "5000 0000",
    "d": 8,
    "a": "guatemala gt"
  },
  {
    "f": "🇭🇳",
    "n": "Гондурас",
    "c": "+504",
    "p": "9000-0000",
    "d": 8,
    "a": "honduras hn"
  },
  {
    "f": "🇸🇻",
    "n": "Сальвадор",
    "c": "+503",
    "p": "7000-0000",
    "d": 8,
    "a": "el salvador sv"
  },
  {
    "f": "🇳🇮",
    "n": "Никарагуа",
    "c": "+505",
    "p": "8000 0000",
    "d": 8,
    "a": "nicaragua ni"
  },
  {
    "f": "🇯🇲",
    "n": "Ямайка",
    "c": "+1",
    "p": "(876) 000-0000",
    "d": 10,
    "a": "jamaica jm"
  },
  {
    "f": "🇵🇷",
    "n": "Пуэрто-Рико",
    "c": "+1",
    "p": "(787) 000-0000",
    "d": 10,
    "a": "puerto rico pr"
  },
  {
    "f": "🇹🇹",
    "n": "Тринидад и Тобаго",
    "c": "+1",
    "p": "(868) 000-0000",
    "d": 10,
    "a": "trinidad and tobago tt"
  },
  {
    "f": "🇧🇸",
    "n": "Багамы",
    "c": "+1",
    "p": "(242) 000-0000",
    "d": 10,
    "a": "bahamas bs"
  },
  {
    "f": "🇧🇧",
    "n": "Барбадос",
    "c": "+1",
    "p": "(246) 000-0000",
    "d": 10,
    "a": "barbados bb"
  },
  {
    "f": "🇪🇬",
    "n": "Египет",
    "c": "+20",
    "p": "100 000 0000",
    "d": 10,
    "a": "egypt eg misr"
  },
  {
    "f": "🇲🇦",
    "n": "Марокко",
    "c": "+212",
    "p": "600 000 000",
    "d": 9,
    "a": "morocco ma"
  },
  {
    "f": "🇩🇿",
    "n": "Алжир",
    "c": "+213",
    "p": "550 00 00 00",
    "d": 9,
    "a": "algeria dz"
  },
  {
    "f": "🇹🇳",
    "n": "Тунис",
    "c": "+216",
    "p": "20 000 000",
    "d": 8,
    "a": "tunisia tn"
  },
  {
    "f": "🇿🇦",
    "n": "ЮАР",
    "c": "+27",
    "p": "71 000 0000",
    "d": 9,
    "a": "south africa za"
  },
  {
    "f": "🇳🇬",
    "n": "Нигерия",
    "c": "+234",
    "p": "802 000 0000",
    "d": 10,
    "a": "nigeria ng"
  },
  {
    "f": "🇰🇪",
    "n": "Кения",
    "c": "+254",
    "p": "700 000000",
    "d": 9,
    "a": "kenya ke"
  },
  {
    "f": "🇬🇭",
    "n": "Гана",
    "c": "+233",
    "p": "24 000 0000",
    "d": 9,
    "a": "ghana gh"
  },
  {
    "f": "🇪🇹",
    "n": "Эфиопия",
    "c": "+251",
    "p": "91 000 0000",
    "d": 9,
    "a": "ethiopia et"
  },
  {
    "f": "🇹🇿",
    "n": "Танзания",
    "c": "+255",
    "p": "71 000 0000",
    "d": 9,
    "a": "tanzania tz"
  },
  {
    "f": "🇺🇬",
    "n": "Уганда",
    "c": "+256",
    "p": "77 000 0000",
    "d": 9,
    "a": "uganda ug"
  },
  {
    "f": "🇨🇲",
    "n": "Камерун",
    "c": "+237",
    "p": "6 70 00 00 00",
    "d": 9,
    "a": "cameroon cm"
  },
  {
    "f": "🇨🇮",
    "n": "Кот-д’Ивуар",
    "c": "+225",
    "p": "07 00 00 00 00",
    "d": 10,
    "a": "ivory coast ci"
  },
  {
    "f": "🇸🇳",
    "n": "Сенегал",
    "c": "+221",
    "p": "77 000 00 00",
    "d": 9,
    "a": "senegal sn"
  },
  {
    "f": "🇲🇼",
    "n": "Малави",
    "c": "+265",
    "p": "99 000 0000",
    "d": 9,
    "a": "malawi mw"
  },
  {
    "f": "🇿🇲",
    "n": "Замбия",
    "c": "+260",
    "p": "97 0000000",
    "d": 9,
    "a": "zambia zm"
  },
  {
    "f": "🇿🇼",
    "n": "Зимбабве",
    "c": "+263",
    "p": "77 000 0000",
    "d": 9,
    "a": "zimbabwe zw"
  },
  {
    "f": "🇦🇴",
    "n": "Ангола",
    "c": "+244",
    "p": "923 000 000",
    "d": 9,
    "a": "angola ao"
  },
  {
    "f": "🇲🇿",
    "n": "Мозамбик",
    "c": "+258",
    "p": "84 000 0000",
    "d": 9,
    "a": "mozambique mz"
  },
  {
    "f": "🇲🇬",
    "n": "Мадагаскар",
    "c": "+261",
    "p": "32 00 000 00",
    "d": 9,
    "a": "madagascar mg"
  },
  {
    "f": "🇲🇺",
    "n": "Маврикий",
    "c": "+230",
    "p": "5000 0000",
    "d": 8,
    "a": "mauritius mu"
  },
  {
    "f": "🇸🇨",
    "n": "Сейшелы",
    "c": "+248",
    "p": "2 500 000",
    "d": 7,
    "a": "seychelles sc"
  },
  {
    "f": "🇷🇼",
    "n": "Руанда",
    "c": "+250",
    "p": "780 000 000",
    "d": 9,
    "a": "rwanda rw"
  },
  {
    "f": "🇳🇦",
    "n": "Намибия",
    "c": "+264",
    "p": "81 000 0000",
    "d": 9,
    "a": "namibia na"
  },
  {
    "f": "🇧🇼",
    "n": "Ботсвана",
    "c": "+267",
    "p": "71 000 000",
    "d": 8,
    "a": "botswana bw"
  }
];

/* ============ State & URL Parameters ============ */
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id') || tg?.initDataUnsafe?.user?.id || 1406048573;
const rawTier = (urlParams.get('tier') || 'pro').toLowerCase();
const initialProfile = TIERS[rawTier] !== undefined ? rawTier : 'pro';

const state = {
  profile: initialProfile,
  tier: 'all',
  q: '',
  apiUrl: urlParams.get('api') || window.location.origin
};

const savedEnabled = localStorage.getItem('ayulite_modules_state');
let enabled = savedEnabled ? new Set(JSON.parse(savedEnabled)) : new Set([9, 11, 24, 25, 37]);
let fullNumber = '';

async function discoverApiUrl() {
  if (urlParams.get('api')) {
    state.apiUrl = urlParams.get('api');
    return;
  }
  try {
    const res = await fetch('tunnel.json?v=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data.api_url) state.apiUrl = data.api_url;
    }
  } catch (e) {}
}

/* ============ Modules Render ============ */
const modList = document.getElementById('modList');
const actCount = document.getElementById('actCount');

function renderModules() {
  const q = state.q.trim().toLowerCase();
  let html = '';

  CATS.forEach(cat => {
    const items = cat.items.filter(m =>
      (state.tier === 'all' || m.t === state.tier) &&
      (!q || (m.n + ' ' + m.c + ' ' + m.d).toLowerCase().includes(q))
    );
    if (!items.length) return;

    html += '<div class="mgroup"><div class="mg-head"><span class="mg-title">' + cat.title + '</span><span class="mg-count mono">' + items.length + '</span></div>';
    items.forEach(m => {
      html += '<div class="mrow">'
        + '<div class="m-top"><span class="m-name">' + m.n + '</span><span class="tier t-' + m.t + '">' + (LABEL[m.t] || m.t.toUpperCase()) + '</span>'
        + '<label class="sw"><input type="checkbox" data-gid="' + m.gid + '"' + (enabled.has(m.gid) ? ' checked' : '') + '><i></i></label></div>'
        + (m.c ? '<code class="m-cmd">' + m.c + '</code>' : '')
        + '<p class="m-desc">' + m.d + '</p></div>';
    });
    html += '</div>';
  });

  modList.innerHTML = html || '<div class="empty">ничего не найдено — измените запрос</div>';
  actCount.textContent = enabled.size;
  localStorage.setItem('ayulite_modules_state', JSON.stringify(Array.from(enabled)));
}

// Dynamic tier counts in filter chips
(function() {
  const c = { all: ALL.length, pro: 0, premium: 0, ultimate: 0 };
  ALL.forEach(m => { if (c[m.t] !== undefined) c[m.t]++; });
  document.querySelectorAll('#filters .chip[data-tier]').forEach(ch => {
    const span = ch.querySelector('span');
    if (span) span.textContent = c[ch.dataset.tier] || '';
  });
})();

modList.addEventListener('change', e => {
  const cb = e.target;
  if (!cb.dataset || !cb.dataset.gid) return;
  const m = ALL[+cb.dataset.gid];

  if (cb.checked && TIERS[m.t] > TIERS[state.profile]) {
    cb.checked = false;
    toast('Модуль доступен на тарифе ' + LABEL[m.t]);
    hapticNotify('warning');
    return;
  }

  cb.checked ? enabled.add(m.gid) : enabled.delete(m.gid);
  actCount.textContent = enabled.size;
  localStorage.setItem('ayulite_modules_state', JSON.stringify(Array.from(enabled)));
  haptic('light');
});

document.getElementById('filters').addEventListener('click', e => {
  const b = e.target.closest('.chip[data-tier]');
  if (!b) return;
  document.querySelectorAll('#filters .chip[data-tier]').forEach(c => c.classList.remove('on'));
  b.classList.add('on');
  state.tier = b.dataset.tier;
  renderModules();
  haptic('light');
});

document.getElementById('search').addEventListener('input', e => {
  state.q = e.target.value;
  renderModules();
});

document.getElementById('enableAll').addEventListener('click', () => {
  ALL.forEach(m => {
    if (TIERS[m.t] <= TIERS[state.profile]) enabled.add(m.gid);
  });
  renderModules();
  toast('Включены все модули вашего тарифа');
  haptic('light');
});

document.getElementById('resetAll').addEventListener('click', () => {
  enabled.clear();
  renderModules();
  toast('Все модули отключены');
  haptic('light');
});

/* ============ Profile & Tier Sync ============ */
const chip = document.getElementById('profileChip');

function setProfile(key, silent) {
  state.profile = TIERS[key] !== undefined ? key : 'pro';
  if (chip) chip.textContent = LABEL[state.profile] || state.profile.toUpperCase();
  document.querySelectorAll('#segProfile button').forEach(b => b.classList.toggle('on', b.dataset.p === state.profile));

  let removed = 0;
  enabled.forEach(g => {
    if (TIERS[ALL[g].t] > TIERS[state.profile]) {
      enabled.delete(g);
      removed++;
    }
  });
  renderModules();
  if (!silent) {
    toast(removed ? 'Профиль ' + LABEL[state.profile] + ': отключено модулей — ' + removed : 'Профиль переключён на ' + LABEL[state.profile]);
  }
}

document.getElementById('segProfile').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  setProfile(b.dataset.p);
  haptic('light');
});

/* ============ Load Real Connected Workers ============ */
async function loadRealWorkers() {
  try {
    const res = await fetch(`${state.apiUrl}/api/user/devices?user_id=${userId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.devices) && data.devices.length > 0) {
        renderWorkerCards(data.devices);
        return;
      }
    }
  } catch (e) {}

  document.getElementById('sessName').textContent = 'Готов к подключению';
  document.getElementById('sessMeta').textContent = 'Сессия ожидает авторизации воркера';
  document.getElementById('sessState').textContent = 'idle';
  document.getElementById('sessDot').className = 'dot wait';
  document.getElementById('nodeActiveWorkers').textContent = '0 активны';
  document.getElementById('statWorkers').textContent = '0';
}

function renderWorkerCards(devices) {
  const container = document.getElementById('sessContainer');
  if (!devices || devices.length === 0) return;

  const count = devices.length;
  document.getElementById('nodeActiveWorkers').textContent = `${count} активны`;
  document.getElementById('statWorkers').textContent = String(count);

  let html = '<div class="sess reveal in">';
  devices.forEach(dev => {
    const isOnline = dev.status === 'active';
    html += `
      <div class="sess-row">
        <i class="dot ${isOnline ? 'on' : 'wait'}"></i>
        <div>
          <div class="sess-name">${dev.name || 'Telegram Account'}</div>
          <div class="sess-meta">${dev.phone} · AyuLite</div>
        </div>
        <span class="sess-state" style="color: ${isOnline ? 'var(--ok)' : 'var(--dim)'}">${isOnline ? 'online' : 'offline'}</span>
      </div>
    `;
  });
  html += '<button class="sess-add" id="addDeviceMore">+ подключить еще аккаунт (ayulite flow)</button></div>';
  container.innerHTML = html;

  document.getElementById('addDeviceMore')?.addEventListener('click', () => {
    haptic('light');
    openLogin();
  });
}

/* ============ Modals ============ */
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.classList.add('lock');
  if (tg && tg.BackButton) tg.BackButton.show();
}

function closeModals() {
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  document.body.classList.remove('lock');
  if (tg && tg.BackButton) tg.BackButton.hide();
  closeCountryPicker();
}

document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => {
    if (e.target === o || e.target.closest('[data-close]')) closeModals();
  });
});

/* ============ Country Picker & Cyber Search (150+ Countries) ============ */
const ccWrap = document.getElementById('cc');
const ccList = document.getElementById('ccList');
const ccBackdrop = document.getElementById('ccBackdrop');
const ccItems = document.getElementById('ccItems');
const ccSearchInput = document.getElementById('ccSearchInput');
const ccSearchClear = document.getElementById('ccSearchClear');
const ccDoneBtn = document.getElementById('ccDoneBtn');
const phoneInput = document.getElementById('phoneInput');

let ccSel = 0; // Default Russia (index 0)
let ccFiltered = COUNTRIES.map((c, i) => ({ ...c, originalIndex: i }));

function renderCountryItems(list) {
  if (!ccItems) return;
  if (!list.length) {
    ccItems.innerHTML = '<div class="cc-empty">Ничего не найдено</div>';
    return;
  }
  ccItems.innerHTML = list.map(item => {
    const isSel = item.originalIndex === ccSel;
    return '<button class="cc-opt' + (isSel ? ' sel' : '') + '" data-idx="' + item.originalIndex + '" type="button">' +
      '<span>' + item.f + '</span>' +
      '<span>' + item.n + '</span>' +
      '<code>' + item.c + '</code>' +
    '</button>';
  }).join('');
}

renderCountryItems(ccFiltered);

function filterCountries(q) {
  const query = (q || '').trim().toLowerCase().replace(/^\+/, '');
  if (!query) {
    ccFiltered = COUNTRIES.map((c, i) => ({ ...c, originalIndex: i }));
  } else {
    ccFiltered = COUNTRIES.map((c, i) => ({ ...c, originalIndex: i })).filter(item => {
      const codeDigits = item.c.replace(/\D/g, '');
      const name = item.n.toLowerCase();
      const aliases = (item.a || '').toLowerCase();
      return name.includes(query) ||
             codeDigits.startsWith(query) ||
             item.c.toLowerCase().includes(query) ||
             aliases.includes(query);
    });
  }
  renderCountryItems(ccFiltered);
  if (ccSearchClear) {
    ccSearchClear.classList.toggle('show', (q || '').length > 0);
  }
}

function openCountryPicker() {
  if (!ccWrap) return;
  ccWrap.classList.add('open');
  if (ccList) ccList.hidden = false;
  if (ccBackdrop) ccBackdrop.hidden = false;
  if (ccSearchInput) {
    ccSearchInput.value = '';
    filterCountries('');
    setTimeout(() => ccSearchInput.focus(), 60);
  }
  if (ccItems) {
    const s = ccItems.querySelector('.sel');
    if (s) s.scrollIntoView({ block: 'nearest' });
  }
  haptic('light');
}

function closeCountryPicker() {
  if (!ccWrap) return;
  ccWrap.classList.remove('open');
  if (ccList) ccList.hidden = true;
  if (ccBackdrop) ccBackdrop.hidden = true;
  if (ccSearchClear) ccSearchClear.classList.remove('show');
}

function selectCountry(idx) {
  if (idx < 0 || idx >= COUNTRIES.length) return;
  ccSel = idx;
  const c = COUNTRIES[ccSel];
  const elFlag = document.getElementById('ccFlag');
  const elName = document.getElementById('ccName');
  const elCode = document.getElementById('ccCode');
  if (elFlag) elFlag.textContent = c.f;
  if (elName) elName.textContent = c.n;
  if (elCode) elCode.textContent = c.c;

  // Immediately close picker
  closeCountryPicker();

  // Highlight selected item in list
  if (ccItems) {
    ccItems.querySelectorAll('.cc-opt').forEach(opt => {
      opt.classList.toggle('sel', +opt.dataset.idx === ccSel);
    });
  }

  // Update phone input placeholder and focus
  if (phoneInput) {
    phoneInput.placeholder = c.p || '000 000-00-00';
    phoneInput.value = '';
    setTimeout(() => phoneInput.focus(), 80);
  }
  haptic('light');
}

// Toggle country picker when clicking Russia / current country button
const btnCc = document.getElementById('ccBtn');
if (btnCc) {
  btnCc.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (ccWrap.classList.contains('open')) {
      closeCountryPicker();
    } else {
      openCountryPicker();
    }
  });
}

// Click on any country in the list
if (ccItems) {
  ccItems.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const b = e.target.closest('.cc-opt');
    if (!b) return;
    const idx = parseInt(b.dataset.idx, 10);
    selectCountry(idx);
  });
}

// Click on Done button just closes or selects top match if searched
if (ccDoneBtn) {
  ccDoneBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const query = (ccSearchInput?.value || '').trim();
    if (query && ccFiltered.length > 0) {
      selectCountry(ccFiltered[0].originalIndex);
    } else {
      closeCountryPicker();
      if (phoneInput) phoneInput.focus();
    }
  });
}

// Search input handling
if (ccSearchInput) {
  ccSearchInput.addEventListener('input', e => {
    filterCountries(e.target.value);
  });
  ccSearchInput.addEventListener('click', e => e.stopPropagation());
  ccSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const query = (ccSearchInput.value || '').trim();
      if (query && ccFiltered.length > 0) {
        selectCountry(ccFiltered[0].originalIndex);
      } else {
        closeCountryPicker();
        if (phoneInput) phoneInput.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCountryPicker();
    }
  });
}

if (ccSearchClear) {
  ccSearchClear.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (ccSearchInput) {
      ccSearchInput.value = '';
      filterCountries('');
      ccSearchInput.focus();
    }
  });
}

// Backdrop or click outside closes picker
if (ccBackdrop) {
  ccBackdrop.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    closeCountryPicker();
  });
}

document.addEventListener('click', e => {
  if (ccWrap && ccWrap.classList.contains('open') && !e.target.closest('.cc')) {
    closeCountryPicker();
  }
});

/* ============ Universal Country Phone Masking ============ */
function formatByMask(digits, maskPattern, maxDigits) {
  if (!maskPattern) return digits;
  const targetDigits = maxDigits ? digits.slice(0, maxDigits) : digits;
  const res = [];
  let dIdx = 0;
  const dLen = targetDigits.length;

  for (let i = 0; i < maskPattern.length; i++) {
    const ch = maskPattern[i];
    if (/\d/.test(ch)) {
      if (dIdx < dLen) {
        res.push(targetDigits[dIdx++]);
      } else {
        break;
      }
    } else {
      if (dIdx < dLen) {
        res.push(ch);
      } else {
        break;
      }
    }
  }

  if (dIdx < dLen) {
    res.push(' ' + targetDigits.slice(dIdx));
  }
  return res.join('');
}

phoneInput.addEventListener('input', (e) => {
  const c = COUNTRIES[ccSel] || COUNTRIES[0];
  let raw = e.target.value.replace(/\D/g, '');

  // If user pasted or typed the country code, strip it cleanly
  const codeDigits = c.c.replace(/\D/g, '');
  if (c.c === '+7') {
    if (raw.startsWith('7') || raw.startsWith('8')) raw = raw.slice(1);
  } else if (raw.startsWith(codeDigits)) {
    raw = raw.slice(codeDigits.length);
  }

  // Format using country mask
  e.target.value = formatByMask(raw, c.p, c.d);
});

/* ============ Login Flow (Real Backend API) ============ */
const steps = ['ls0', 'ls1', 'ls1b', 'ls2'];
function showStep(step) {
  const steps = ['ls0', 'ls1', 'ls1b', 'ls2'];
  const targetId = typeof step === 'number' ? steps[step] : step;

  steps.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = (id !== targetId);
  });

  // RAF + Timeout for robust mobile & WebApp autofocus
  requestAnimationFrame(() => {
    setTimeout(() => {
      if (targetId === 'ls0') {
        document.getElementById('phoneInput')?.focus();
      } else if (targetId === 'ls1') {
        const first = document.querySelector('#codeBox input');
        if (first) first.focus();
      } else if (targetId === 'ls1b') {
        const p = document.getElementById('passwordInput');
        if (p) {
          p.focus();
          try { p.click(); } catch (e) {}
        }
      }
    }, 80);
  });
}

let resendInt = null;
function startResend() {
  const btn = document.getElementById('resend');
  let t = 60;
  clearInterval(resendInt);
  btn.disabled = true;
  btn.textContent = 'Запросить код повторно через ' + t + ' с';
  resendInt = setInterval(() => {
    t--;
    if (t <= 0) {
      clearInterval(resendInt);
      btn.disabled = false;
      btn.textContent = 'Запросить новый код';
    } else {
      btn.textContent = 'Запросить код повторно через ' + t + ' с';
    }
  }, 1000);
}

function openLogin() {
  showStep('ls0');
  openModal('loginModal');
  setTimeout(() => phoneInput.focus(), 120);
}

document.getElementById('heroAdd')?.addEventListener('click', () => { openLogin(); haptic('light'); });
document.getElementById('hdrAddBtn')?.addEventListener('click', () => { openLogin(); haptic('light'); });
document.getElementById('addDevice')?.addEventListener('click', () => { openLogin(); haptic('light'); });

// Step 0: Send Code
document.getElementById('toCode').addEventListener('click', async () => {
  const c = COUNTRIES[ccSel] || COUNTRIES[0];
  const prefix = c.c || '+7';
  let digits = phoneInput.value.replace(/\D/g, '');

  const codeDigits = prefix.replace(/\D/g, '');
  if (prefix === '+7') {
    if (digits.startsWith('7') || digits.startsWith('8')) digits = digits.slice(1);
  } else if (digits.startsWith(codeDigits)) {
    digits = digits.slice(codeDigits.length);
  }

  if (digits.length < 5) {
    toast('Проверьте номер телефона');
    hapticNotify('warning');
    return;
  }

  fullNumber = prefix + digits;
  const btn = document.getElementById('toCode');
  btn.disabled = true;
  btn.textContent = 'Отправка кода…';
  haptic('light');

  try {
    const res = await fetch(`${state.apiUrl}/api/auth/send_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, phone: fullNumber })
    });
    const data = await res.json();

    if (data.ok) {
      hapticNotify('success');
      showStep('ls1');
      startResend();
      toast('Код отправлен в Telegram');
      setTimeout(() => { const f = document.querySelector('#codeBox input'); f && f.focus(); }, 120);
    } else {
      hapticNotify('error');
      toast(data.error || 'Ошибка отправки кода');
    }
  } catch (err) {
    hapticNotify('error');
    toast('Ошибка связи с сервером');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Продолжить';
  }
});

// Direct Telegram Bot Button
document.getElementById('btnTgDirect')?.addEventListener('click', () => {
  haptic('light');
  const digits = phoneInput.value.replace(/\D/g, '');
  const c = COUNTRIES[ccSel] || COUNTRIES[0];
  const prefix = c.c || '+7';
  const phone = digits ? `${prefix}${digits}` : '';
  const botUrl = phone ? `https://t.me/AyuLiteBot?start=auth_${phone}` : `https://t.me/AyuLiteBot?start=login`;
  if (tg?.openTelegramLink) tg.openTelegramLink(botUrl);
  else window.open(botUrl, '_blank');
});

document.getElementById('resend').addEventListener('click', () => {
  startResend();
  document.getElementById('toCode').click();
  haptic('light');
});

// 5-Digit Code Inputs
const codeInputs = [...document.querySelectorAll('#codeBox input')];
const confirmBtn = document.getElementById('confirmCode');
const btnPasteCode = document.getElementById('btnPasteCode');

function fillCodeDigits(text) {
  const digits = (text || '').replace(/\D/g, '').slice(0, codeInputs.length);
  if (!digits) {
    toast('В буфере нет цифр кода');
    hapticNotify('warning');
    return;
  }
  digits.split('').forEach((d, i) => {
    if (codeInputs[i]) codeInputs[i].value = d;
  });
  haptic('light');
  if (digits.length === codeInputs.length) {
    confirmBtn.click();
  } else {
    const nextIdx = Math.min(digits.length, codeInputs.length - 1);
    codeInputs[nextIdx]?.focus();
  }
}

async function pasteCodeFromClipboard() {
  let text = '';
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      text = await navigator.clipboard.readText();
    }
  } catch (err) {
    console.warn('Clipboard read error:', err);
  }

  if (!text) {
    text = prompt('Вставьте код подтверждения из Telegram:') || '';
  }

  if (text) {
    fillCodeDigits(text);
  }
}

if (btnPasteCode) {
  btnPasteCode.addEventListener('click', (e) => {
    e.preventDefault();
    pasteCodeFromClipboard();
  });
}

codeInputs.forEach((inp, idx) => {
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\D/g, '').slice(-1);
    if (inp.value && codeInputs[idx + 1]) codeInputs[idx + 1].focus();
    const fullCode = codeInputs.map(i => i.value).join('');
    if (fullCode.length === codeInputs.length) {
      confirmBtn.click();
    }
    haptic('light');
  });

  inp.addEventListener('paste', e => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    fillCodeDigits(pasted);
  });

  inp.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !inp.value && codeInputs[idx - 1]) {
      codeInputs[idx - 1].focus();
      e.preventDefault();
    }
  });
});

// Step 1: Verify Code
confirmBtn.addEventListener('click', async () => {
  const code = codeInputs.map(i => i.value).join('');
  if (code.length < 4) {
    toast('Введите полный код');
    hapticNotify('warning');
    return;
  }

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Проверка кода…';
  haptic('light');

  try {
    const res = await fetch(`${state.apiUrl}/api/auth/verify_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, code: code })
    });
    const data = await res.json();

    if (data.ok) {
      if (data.need_password) {
        hapticNotify('warning');
        showStep('ls1b');
        toast('Требуется облачный пароль 2FA');
        setTimeout(() => document.getElementById('passwordInput')?.focus(), 120);
      } else {
        handleAuthSuccess(data.account);
      }
    } else {
      hapticNotify('error');
      toast(data.error || 'Неверный код подтверждения');
    }
  } catch (err) {
    hapticNotify('error');
    toast('Ошибка соединения');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Подтвердить код';
  }
});

/* ============ Глаз: единственный канонический обработчик показа пароля ============ */
const pwdInput = document.getElementById('passwordInput');
const btnTogglePwd = document.getElementById('btnTogglePwd');
const pwdWrap = document.querySelector('.pwd-wrap');

const EYE_ON  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function setPwdVisible(visible) {
  if (!pwdInput) return;

  // 1) Нативное переключение type
  pwdInput.type = visible ? 'text' : 'password';

  // 2) Снятие CSS-маскировки webkitTextSecurity через inline-стиль
  try {
    pwdInput.style.webkitTextSecurity = visible ? 'none' : 'disc';
  } catch (e) {}

  // 3) Класс для совместимости
  pwdInput.classList.toggle('show-text', visible);

  // 4) Иконка и состояние кнопки
  if (btnTogglePwd) {
    btnTogglePwd.classList.toggle('active', visible);
    btnTogglePwd.innerHTML = visible ? EYE_OFF : EYE_ON;
    btnTogglePwd.setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
  }

  // 5) Возврат фокуса и каретки в конец
  setTimeout(() => {
    pwdInput.focus();
    try {
      const l = pwdInput.value.length;
      pwdInput.setSelectionRange(l, l);
    } catch (e) {}
  }, 10);
}

if (btnTogglePwd && pwdInput) {
  btnTogglePwd.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPwdVisible(pwdInput.type !== 'text');
    haptic('light');
  });
}

if (pwdWrap && pwdInput) {
  pwdWrap.addEventListener('click', (e) => {
    if (e.target !== btnTogglePwd && !btnTogglePwd?.contains(e.target)) {
      pwdInput.focus();
    }
  });
}

if (pwdInput) {
  pwdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('confirmPassword')?.click();
    }
  });
}

// Explicit direct cancel buttons
document.querySelectorAll('.btn-cancel-session').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeModals();
    haptic('light');
  });
});

// Step 1B: Verify 2FA Password
document.getElementById('confirmPassword')?.addEventListener('click', async () => {
  const pwd = document.getElementById('passwordInput').value;
  if (!pwd) {
    toast('Введите облачный пароль');
    hapticNotify('warning');
    return;
  }

  const btn = document.getElementById('confirmPassword');
  btn.disabled = true;
  btn.textContent = 'Авторизация…';
  haptic('light');

  try {
    const res = await fetch(`${state.apiUrl}/api/auth/verify_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, password: pwd })
    });
    const data = await res.json();

    if (data.ok) {
      handleAuthSuccess(data.account);
    } else {
      hapticNotify('error');
      toast(data.error || 'Неверный 2FA пароль');
    }
  } catch (err) {
    hapticNotify('error');
    toast('Ошибка соединения');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Войти в аккаунт';
  }
});

function handleAuthSuccess(account) {
  hapticNotify('success');
  showStep('ls2');
  document.getElementById('connectedDevName').textContent = account?.name || 'User Account';
  document.getElementById('devMeta').textContent = `${account?.phone || fullNumber} · AyuLite`;
  loadRealWorkers();
}

document.getElementById('loginDone').addEventListener('click', () => {
  closeModals();
  loadRealWorkers();
  codeInputs.forEach(i => i.value = '');
  toast('Устройство привязано к C2-сети');
  haptic('light');
});

/* ============ Pay Flow ============ */
let curPlan = { name: '', key: 'pro', price: '' };

document.querySelectorAll('[data-plan]').forEach(b => {
  b.addEventListener('click', () => {
    curPlan = { name: b.dataset.plan, key: b.dataset.key, price: b.dataset.price };
    document.getElementById('payTitle').textContent = 'Активация · ' + curPlan.name;
    document.getElementById('payPrice').textContent = curPlan.price;
    openModal('payModal');
    haptic('light');
  });
});

document.querySelectorAll('.pay-row').forEach(r => {
  r.addEventListener('click', () => {
    closeModals();
    hapticNotify('success');
    toast('Запрос на оплату сформирован (' + r.dataset.method + ')');
  });
});

/* ============ Toast ============ */
let toastT = null;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ============ Bottom Nav & Scrollspy ============ */
const secIO = new IntersectionObserver(es => es.forEach(x => {
  if (x.isIntersecting) {
    document.querySelectorAll('#bnav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + x.target.id));
  }
}), { rootMargin: '-30% 0px -50% 0px' });

['nodes', 'modules', 'pricing', 'settings'].forEach(id => {
  const el = document.getElementById(id);
  if (el) secIO.observe(el);
});

document.querySelectorAll('#bnav a').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    haptic('light');
    const targetId = btn.getAttribute('href').replace('#', '');
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
  });
});

/* ============ Reveal ============ */
const io = new IntersectionObserver(es => es.forEach(x => {
  if (x.isIntersecting) {
    x.target.classList.add('in');
    io.unobserve(x.target);
  }
}), { threshold: .06 });

document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* ============ Misc ============ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModals();
  if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
    e.preventDefault();
    document.getElementById('search').focus();
  }
});

/* ============ Startup ============ */
(async function init() {
  await discoverApiUrl();
  setProfile(initialProfile, true);
  await loadRealWorkers();
})();
