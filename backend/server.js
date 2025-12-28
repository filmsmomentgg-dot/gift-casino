// ВАЖНО: загружаем dotenv ПЕРВЫМ, до всех других импортов
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseService } from './services/database.js';
import { ImageLoader } from './services/imageLoader.js';
import { GiftSynchronizer } from './services/giftSynchronizer.js';
import { FragmentParserReal } from './services/fragmentParserReal.js';
import { FragmentMockParser } from './services/fragmentMockParser.js';
import { exchangeRates } from './services/exchangeRates.js';
import { initRoutes } from './routes/api.js';
import { initBotRoutes } from './routes/bot.js';
import { initSecureRoutes } from './routes/secureApi.js';
import { CrashGameService } from './services/crashGame.js';
import { verifyTelegramWebAppData } from './services/telegramAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// CORS - расширенные заголовки для Telegram Auth
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Выбор парсера: реальный или мок
const USE_MOCK = process.env.USE_MOCK === 'true';
const fragmentParser = USE_MOCK ? new FragmentMockParser() : new FragmentParserReal();
console.log(`🎯 Using ${USE_MOCK ? 'MOCK' : 'REAL'} Fragment parser`);

// Services
const db = new DatabaseService();
const imageLoader = new ImageLoader(db);
const giftSync = new GiftSynchronizer(db, imageLoader, wss, fragmentParser);

// Initialize database
await db.init();

// Start gift synchronizer
giftSync.start();

// Start exchange rate auto-update (every 1 min)
exchangeRates.startAutoUpdate();

// 🎰 Start Crash Game (24/7) - с подключением к БД
const crashGame = new CrashGameService(wss, db);
console.log('🎰 Crash Game started (24/7) with DB integration');

// 🔐 WebSocket connections с аутентификацией
wss.on('connection', (ws) => {
    console.log('✅ New WebSocket client connected');
    
    // 🔐 Данные авторизованного пользователя (null = не авторизован)
    ws.telegramUser = null;
    ws.isAuthenticated = false;
    
    // Send current gifts data
    db.getAllGifts().then(gifts => {
        ws.send(JSON.stringify({
            type: 'initial',
            data: gifts
        }));
    });
    
    // Send synchronizer stats
    ws.send(JSON.stringify({
        type: 'sync_stats',
        data: giftSync.getStats()
    }));
    
    // Send current Crash state
    ws.send(JSON.stringify({
        type: 'crash_state',
        data: crashGame.getState()
    }));
    
    // Handle messages from client
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            handleCrashMessage(ws, msg);
        } catch (e) {
            console.error('Invalid message:', e);
        }
    });
    
    ws.on('close', () => {
        console.log('👋 WebSocket client disconnected');
    });
});

// 🔐 Handle Crash game messages - БЕЗОПАСНАЯ ВЕРСИЯ
async function handleCrashMessage(ws, msg) {
    const { type, initData, amount, currency, autoCashout } = msg;
    
    switch (type) {
        // 🔐 Аутентификация WebSocket
        case 'auth':
            if (!initData || initData === '') {
                // 🔧 Dev fallback - для тестирования без Telegram
                console.warn('⚠️ No initData - using dev fallback user for WebSocket');
                ws.telegramUser = {
                    id: 123456789,
                    firstName: 'Dev',
                    lastName: 'User',
                    username: 'devuser',
                    languageCode: 'ru',
                    isPremium: false,
                    authDate: Math.floor(Date.now() / 1000)
                };
                ws.isAuthenticated = true;
                
                // Создаём/обновляем пользователя в БД
                await db.upsertUser(ws.telegramUser.id, 'DevUser');
                
                // Получаем баланс
                const devBalance = await db.getFullBalance(ws.telegramUser.id);
                
                console.log(`🔐 WebSocket dev fallback authenticated`);
                
                ws.send(JSON.stringify({ 
                    type: 'auth_result', 
                    success: true,
                    user: ws.telegramUser,
                    balance: devBalance,
                    hasBet: false,
                    betAmount: 0
                }));
                return;
            }
            
            const userData = verifyTelegramWebAppData(initData);
            if (!userData) {
                ws.send(JSON.stringify({ type: 'auth_result', success: false, error: 'Invalid initData' }));
                return;
            }
            
            // 🔐 Сохраняем данные пользователя в WebSocket соединении
            ws.telegramUser = userData;
            ws.isAuthenticated = true;
            
            // Создаём/обновляем пользователя в БД
            await db.upsertUser(userData.id, userData.username);
            
            // Получаем баланс
            const balance = await db.getFullBalance(userData.id);
            
            // Проверяем есть ли активная ставка
            const activeBet = crashGame.getUserBet(userData.id);
            
            console.log(`🔐 WebSocket authenticated: ${userData.username || userData.id}`);
            
            ws.send(JSON.stringify({ 
                type: 'auth_result', 
                success: true,
                user: {
                    id: userData.id,
                    username: userData.username,
                    first_name: userData.first_name
                },
                balance,
                hasBet: !!activeBet,
                betAmount: activeBet?.amount || 0
            }));
            break;
            
        case 'crash_bet':
            // 🔐 Проверяем аутентификацию
            if (!ws.isAuthenticated || !ws.telegramUser) {
                ws.send(JSON.stringify({ type: 'crash_bet_result', success: false, error: 'Not authenticated' }));
                return;
            }
            
            const betResult = await crashGame.placeBet(
                ws.telegramUser.id,
                amount,
                currency,
                autoCashout,
                ws.telegramUser.username || ws.telegramUser.first_name || 'Игрок'
            );
            
            ws.send(JSON.stringify({
                type: 'crash_bet_result',
                ...betResult
            }));
            break;
            
        case 'crash_cashout':
            // 🔐 Проверяем аутентификацию
            if (!ws.isAuthenticated || !ws.telegramUser) {
                ws.send(JSON.stringify({ type: 'crash_cashout_result', success: false, error: 'Not authenticated' }));
                return;
            }
            
            const cashoutResult = await crashGame.cashout(ws.telegramUser.id);
            ws.send(JSON.stringify({
                type: 'crash_cashout_result',
                ...cashoutResult
            }));
            break;
            
        case 'crash_cancel':
            // 🔐 Проверяем аутентификацию
            if (!ws.isAuthenticated || !ws.telegramUser) {
                ws.send(JSON.stringify({ type: 'crash_cancel_result', success: false, error: 'Not authenticated' }));
                return;
            }
            
            const cancelResult = await crashGame.cancelBet(ws.telegramUser.id);
            ws.send(JSON.stringify({
                type: 'crash_cancel_result',
                ...cancelResult
            }));
            break;
            
        case 'crash_state':
            ws.send(JSON.stringify({
                type: 'crash_state',
                data: crashGame.getState()
            }));
            break;
            
        case 'get_balance':
            // 🔐 Проверяем аутентификацию
            if (!ws.isAuthenticated || !ws.telegramUser) {
                ws.send(JSON.stringify({ type: 'balance_update', success: false, error: 'Not authenticated' }));
                return;
            }
            
            const currentBalance = await db.getFullBalance(ws.telegramUser.id);
            ws.send(JSON.stringify({
                type: 'balance_update',
                balance: currentBalance
            }));
            break;
    }
}

// API Routes
initRoutes(app, db, imageLoader, giftSync);

// Secure API Routes (with Telegram auth)
initSecureRoutes(app, db);

// Bot API Routes (protected with Bearer auth)
initBotRoutes(app, db);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    giftSync.stop();
    exchangeRates.stopAutoUpdate();
    crashGame.stop();
    await db.close();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
🚀 Server running on http://localhost:${PORT}
💎 Telegram Gifts Tracker Started
📊 Fragment.com auto-sync enabled
🔄 WebSocket ready for live updates
    `);
});

