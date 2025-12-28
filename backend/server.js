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
import { CrashGameService } from './services/crashGame.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
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

// 🎰 Start Crash Game (24/7)
const crashGame = new CrashGameService(wss);
console.log('🎰 Crash Game started (24/7)');

// WebSocket connections
wss.on('connection', (ws) => {
    console.log('✅ New WebSocket client connected');
    
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

// Handle Crash game messages
function handleCrashMessage(ws, msg) {
    const { type, oderId, amount, currency, autoCashout, nickname } = msg;
    
    switch (type) {
        case 'crash_bet':
            const betResult = crashGame.placeBet(oderId, amount, currency, autoCashout, nickname);
            ws.send(JSON.stringify({
                type: 'crash_bet_result',
                ...betResult
            }));
            break;
            
        case 'crash_cashout':
            const cashoutResult = crashGame.cashout(oderId);
            ws.send(JSON.stringify({
                type: 'crash_cashout_result',
                ...cashoutResult
            }));
            break;
            
        case 'crash_cancel':
            const cancelResult = crashGame.cancelBet(oderId);
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
    }
}

// API Routes
initRoutes(app, db, imageLoader, giftSync);

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

