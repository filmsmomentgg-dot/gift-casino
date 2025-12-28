# 💎 Telegram Gifts Price Tracker - Backend

## 🏗 Архитектура

```
┌─────────────────┐
│  Price Watcher  │──── Каждые 10 сек ────┐
│   (Парсер)      │                        │
└────────┬────────┘                        │
         │                                 ▼
         │                        ┌──────────────┐
         │                        │   Database   │
         └───────────────────────►│   (SQLite)   │
                                  └──────┬───────┘
┌─────────────────┐                      │
│  Image Loader   │──────────────────────┘
│  (Downloader)   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  WebSocket      │─────► Live Updates ───► Frontend
│   Broadcast     │
└─────────────────┘
```

## 🚀 Установка и запуск

```bash
# Установка зависимостей
cd backend
npm install

# Запуск сервера
npm start

# Режим разработки (auto-reload)
npm run dev
```

## ⚙️ Конфигурация (.env)

```env
PORT=3000                     # Порт сервера
UPDATE_INTERVAL=10000         # Интервал обновления (мс)
SOURCE_URL=https://...        # URL источника данных
MAX_RETRIES=3                 # Количество попыток
REQUEST_TIMEOUT=10000         # Таймаут запроса
```

## 📡 API Endpoints

### GET /api/gifts
Получить все подарки
```json
{
  "success": true,
  "data": [
    {
      "id": "plush-pepe",
      "name": "Plush Pepe",
      "price": 50,
      "currency": "Stars",
      "image_path": "/assets/gifts/plush-pepe.png",
      "last_updated": 1703676000000
    }
  ],
  "count": 10
}
```

### GET /api/gifts/:id
Получить конкретный подарок

### GET /api/gifts/:id/history
История изменения цены

## 🔌 WebSocket

Подключение: `ws://localhost:3000`

События:
```javascript
// Initial data
{
  "type": "initial",
  "data": [...gifts]
}

// Live update
{
  "type": "update",
  "data": [...gifts],
  "timestamp": 1703676000000
}
```

## 📦 Модули

### 1. PriceWatcher
- Парсит источник каждые N секунд
- Обновляет цены в БД
- Логирует изменения
- Отправляет события через WebSocket

### 2. ImageLoader
- Скачивает PNG с сайта
- Проверяет наличие локально
- Сохраняет в /assets/gifts/
- Обновляет пути в БД

### 3. DatabaseService
- SQLite с промисами
- Таблицы: gifts, price_history
- UPSERT операции
- История изменений цен

## 🎯 Добавление нового источника

1. Создать парсер в `/parsers/newSource.js`
2. Реализовать метод `parse(html)`
3. Зарегистрировать в `priceWatcher.js`

Пример:
```javascript
export class NewSourceParser {
  parse($) {
    const gifts = [];
    $('.product').each((i, elem) => {
      gifts.push({
        id: ...,
        name: ...,
        price: ...,
        currency: ...
      });
    });
    return gifts;
  }
}
```

## 🛡 Rate Limiting

- Exponential backoff при ошибках
- Настраиваемые таймауты
- User-Agent rotation (опционально)
- Graceful degradation

## 📊 База данных

### Таблица: gifts
```sql
id              TEXT PRIMARY KEY
name            TEXT NOT NULL
price           REAL NOT NULL
currency        TEXT NOT NULL
image_path      TEXT
source_url      TEXT
last_updated    INTEGER
created_at      INTEGER
```

### Таблица: price_history
```sql
id              INTEGER PRIMARY KEY
gift_id         TEXT
old_price       REAL
new_price       REAL
change_percent  REAL
timestamp       INTEGER
```

## 🔥 Масштабирование

1. **Redis Cache** - кэш для частых запросов
2. **PostgreSQL** - вместо SQLite для продакшена
3. **Multiple Workers** - параллельный парсинг
4. **Message Queue** - RabbitMQ/Redis для обработки
5. **CDN** - для раздачи изображений

## 🐛 Логирование

Все события логируются в консоль:
- ✅ Успешные операции
- ❌ Ошибки
- 💰 Изменения цен
- 📥 Загрузки изображений

## 🎮 Интеграция с фронтендом

```javascript
// В script.js
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  
  if (type === 'update') {
    updateGiftPrices(data);
  }
};

// Fetch initial data
fetch('http://localhost:3000/api/gifts')
  .then(res => res.json())
  .then(data => displayGifts(data.data));
```
