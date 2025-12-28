# 🎁 Gift Casino - Telegram Mini App

Минималистичное главное меню для Telegram-казино в формате подарков с интуитивным UX и эмоциональным онбордингом.

## 🚀 Быстрый Старт

### Запуск локально

1. Откройте `index.html` в браузере:
```bash
open index.html
```

2. Или запустите локальный сервер:
```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve

# VS Code Live Server
# Кликните правой кнопкой на index.html → "Open with Live Server"
```

3. Откройте http://localhost:8000

### Интеграция в Telegram Bot

```javascript
const bot = new TelegramBot(token);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(chatId, '🎁 Welcome to Gift Casino!', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎁 PLAY NOW', web_app: { url: 'https://your-domain.com' } }],
                [
                    { text: '🎁 Gifts', callback_data: 'gifts' },
                    { text: '🏆 Leaderboard', callback_data: 'leaderboard' }
                ],
                [
                    { text: '👤 Profile', callback_data: 'profile' },
                    { text: '⚙️ Settings', callback_data: 'settings' }
                ]
            ]
        }
    });
});
```

### Интеграция в Telegram Mini App

1. Зарегистрируйте Mini App через @BotFather:
```
/newapp
→ Выберите вашего бота
→ Введите название
→ Загрузите иконку
→ Укажите URL: https://your-domain.com
```

2. Добавьте кнопку меню:
```
/setmenubutton
→ Выберите бота
→ Название: "Play Casino"
→ URL: https://your-domain.com
```

## 📱 Структура Проекта

```
gitsTon/
├── index.html          # Главная страница
├── styles.css          # Все стили + анимации
├── script.js           # Логика приложения
├── DESIGN_DOC.md       # Полная дизайн-документация
└── README.md           # Этот файл
```

## 🎨 Особенности Дизайна

### ✨ Визуальные Эффекты
- **Glassmorphism** - стеклянный эффект на всех карточках
- **Градиенты** - фиолетово-синий фон, золото-неон акценты
- **Анимации** - fade, scale, pulse, glow, shine
- **Тени** - мягкие парящие тени для глубины

### 🎯 UX-фишки
- **Guided Onboarding** - приветствие при первом визите
- **Tooltip** - подсказка на главной CTA
- **Balance Animation** - "пересчёт" баланса при загрузке
- **Live Feed** - прокручиваемая лента активности
- **Haptic Feedback** - вибрация при действиях (в Mini App)

### 📊 Иерархия Внимания
1. **40%** - Main CTA (🎁 PLAY)
2. **25%** - Balance (💎 Coins)
3. **15%** - Navigation (Grid 2×2)
4. **10%** - Header (User Info)
5. **10%** - Info Feed (Live Activity)

## 🧩 Компоненты

### Header
```html
👤 @username (Silver Gift)    [🎁] [⚙️]
```
- Avatar с золотым border
- Nickname + уровень
- Daily Gift (пульсирует)
- Settings

### Balance Card
```html
    💎 1,250
      Coins
  [➕ Earn More]
```
- Анимация countUp при загрузке
- Градиентная цифра
- Вращающийся фон

### Main CTA
```html
     🎁 PLAY
   Open your luck
```
- Градиент red→purple→blue
- Shine-анимация
- Tooltip при первом заходе
- Haptic feedback

### Navigation Grid
```html
[🎁 Gifts]       [🎮 Games (Soon)]
[🏆 Leaderboard] [👤 Profile]
```
- Active state
- Disabled state для "Coming Soon"
- Glassmorphism

### Info Feed
```html
🔥 Live Activity
─────────────────
🎁 @alice got LEGENDARY gift!
🎉 Event: Double Coins Day
⭐ New: Diamond Box added!
```
- Auto-scroll каждые 4 секунды
- Прокрутка вручную

### Footer Tabs
```html
[🏠 Home] [🎁 Inventory] [👤 Profile]
```
- Фиксированная позиция
- Active state
- Glassmorphism

## 🎬 Анимации

### CSS Keyframes
```css
@keyframes pulse          /* Daily Gift пульсация */
@keyframes glow           /* Свечение */
@keyframes shine          /* Блик на CTA */
@keyframes slideDown      /* Header появление */
@keyframes fadeScale      /* Элементы появляются */
@keyframes rotate         /* Balance фон */
@keyframes bounce         /* Tooltip */
@keyframes slideInRight   /* Feed items */
```

### JavaScript Анимации
- **Balance CountUp** - плавный пересчёт цифр
- **Notification System** - всплывающие уведомления
- **Feed Rotation** - смена элементов ленты

## 🤖 Telegram WebApp API

### Инициализация
```javascript
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
}
```

### Haptic Feedback
```javascript
// Лёгкая вибрация (навигация)
tg.HapticFeedback.impactOccurred('light');

// Средняя (второстепенные действия)
tg.HapticFeedback.impactOccurred('medium');

// Сильная (главная CTA)
tg.HapticFeedback.impactOccurred('heavy');

// Успех (награды)
tg.HapticFeedback.notificationOccurred('success');
```

### Темизация
```javascript
const themeParams = tg.themeParams;
document.documentElement.style.setProperty(
    '--tg-theme-bg-color', 
    themeParams.bg_color || '#1a0d2e'
);
```

## 📦 Готовность к Расширению

### Добавление нового раздела Navigation
```html
<button class="nav-btn">
    <div class="nav-icon">🎰</div>
    <div class="nav-label">Casino</div>
</button>
```

### Добавление события в Feed
```javascript
function addFeedItem(icon, text) {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `
        <span class="feed-icon">${icon}</span>
        <span class="feed-text">${text}</span>
    `;
    feedScroll.appendChild(item);
}

addFeedItem('🔥', '<strong>@user</strong> won EPIC prize!');
```

### Новые уровни пользователя
```javascript
const levels = [
    { name: 'Bronze Gift', emoji: '🎁', border: '#cd7f32' },
    { name: 'Silver Gift', emoji: '💎', border: '#c0c0c0' },
    { name: 'Gold Gift', emoji: '👑', border: '#ffd700' },
    { name: 'Legendary', emoji: '⭐', border: '#ff00ff' }
];
```

## 🎯 Метрики UX

### Целевые показатели
- **Time to First Click:** < 5 секунд
- **Bounce Rate:** < 30%
- **Session Duration:** > 2 минуты
- **Click-through Rate (CTA):** > 60%

### A/B тесты
1. **CTA текст:**
   - Вариант A: "🎁 PLAY / Open your luck"
   - Вариант B: "🎲 START / Try your fortune"

2. **Balance позиция:**
   - Вариант A: Сверху (текущий)
   - Вариант B: Между CTA и Navigation

3. **Nav Grid:**
   - Вариант A: 2×2 (текущий)
   - Вариант B: Вертикальный список

## 🛠️ Технологии

- **HTML5** - семантическая разметка
- **CSS3** - flexbox, grid, animations, glassmorphism
- **Vanilla JavaScript** - без фреймворков
- **Telegram WebApp API** - интеграция с Telegram

### Поддержка браузеров
- ✅ Chrome/Edge (последние 2 версии)
- ✅ Safari (последние 2 версии)
- ✅ Firefox (последние 2 версии)
- ✅ Telegram WebView (iOS/Android)

## 📱 Адаптивность

### Breakpoints
```css
/* Основной дизайн: 320-480px */
@media (max-width: 380px) {
    /* Уменьшенные размеры для маленьких экранов */
}

@media (min-width: 481px) {
    /* Центрирование на больших экранах */
}
```

### Safe Areas (iOS)
```css
padding-bottom: env(safe-area-inset-bottom, 12px);
```

## 🔐 Best Practices

### Производительность
- ✅ Минификация CSS/JS перед деплоем
- ✅ Lazy loading изображений
- ✅ Debounce для scroll events
- ✅ RequestAnimationFrame для анимаций

### Безопасность
- ✅ Валидация Telegram WebApp данных
- ✅ HTTPS обязателен для Mini App
- ✅ CSP headers
- ✅ XSS защита

### Доступность
- ✅ Semantic HTML
- ✅ ARIA labels для кнопок
- ✅ Keyboard navigation
- ✅ Контрастность текста (WCAG AA)

## 📚 Документация

Полная дизайн-документация: [DESIGN_DOC.md](DESIGN_DOC.md)

**Включает:**
- 🎨 Визуальную иерархию
- 🧩 Обоснование каждого решения
- ✨ Психологию анимаций
- 🧠 UX-фишки и паттерны
- 📊 Метрики успеха
- 🚀 План расширения

## 🤝 Контрибьюция

1. Fork проекта
2. Создайте feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit изменения (`git commit -m 'Add some AmazingFeature'`)
4. Push в branch (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📄 Лицензия

MIT License - используйте свободно для коммерческих и некоммерческих проектов.

## 🎓 Автор

Спроектировано как референс главного меню для Telegram Mini App казино с фокусом на:
- Gift-economy механику
- Эмоциональный онбординг
- Минималистичный дизайн
- Telegram-native UX

---

**Happy coding! 🎁**
