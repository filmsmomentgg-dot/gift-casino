import { authMiddleware } from '../middleware/auth.js';

/**
 * API роуты для бота пополнения Stars
 * Все эндпоинты защищены Bearer авторизацией
 */
export function initBotRoutes(app, db) {
    
    // 💰 Пополнить баланс пользователя
    // POST /api/bot/deposit
    // Body: { telegram_id, amount, currency: 'stars'|'ton', order_id }
    app.post('/api/bot/deposit', authMiddleware, async (req, res) => {
        try {
            const { telegram_id, amount, currency = 'stars', order_id } = req.body;
            
            // Валидация
            if (!telegram_id || !amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: telegram_id, amount'
                });
            }
            
            if (amount <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Amount must be positive'
                });
            }
            
            // Создаём/обновляем пользователя
            const user = await db.upsertUser(telegram_id);
            
            // Добавляем депозит
            const deposit = await db.addDeposit({
                telegram_id,
                amount: parseFloat(amount),
                currency,
                order_id: order_id || `DEP-${Date.now()}`,
                status: 'completed'
            });
            
            // Обновляем баланс
            const newBalance = await db.updateBalance(telegram_id, amount, currency);
            
            console.log(`💰 Deposit: ${telegram_id} +${amount} ${currency.toUpperCase()}`);
            
            res.json({
                success: true,
                data: {
                    telegram_id,
                    deposited: amount,
                    currency,
                    new_balance: newBalance,
                    order_id: deposit.order_id,
                    timestamp: new Date().toISOString()
                }
            });
            
        } catch (error) {
            console.error('❌ Deposit error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // 📊 Получить баланс пользователя
    // GET /api/bot/balance/:telegram_id
    app.get('/api/bot/balance/:telegram_id', authMiddleware, async (req, res) => {
        try {
            const { telegram_id } = req.params;
            
            const user = await db.getUser(telegram_id);
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }
            
            res.json({
                success: true,
                data: {
                    telegram_id: user.telegram_id,
                    balance_ton: user.balance_ton || 0,
                    balance_stars: user.balance_stars || 0,
                    created_at: user.created_at,
                    updated_at: user.updated_at
                }
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // 📜 История депозитов пользователя
    // GET /api/bot/deposits/:telegram_id
    app.get('/api/bot/deposits/:telegram_id', authMiddleware, async (req, res) => {
        try {
            const { telegram_id } = req.params;
            const limit = parseInt(req.query.limit) || 50;
            
            const deposits = await db.getDeposits(telegram_id, limit);
            
            res.json({
                success: true,
                data: deposits,
                count: deposits.length
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // ✅ Проверить статус заказа
    // GET /api/bot/order/:order_id
    app.get('/api/bot/order/:order_id', authMiddleware, async (req, res) => {
        try {
            const { order_id } = req.params;
            
            const order = await db.getOrder(order_id);
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'Order not found'
                });
            }
            
            res.json({
                success: true,
                data: order
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // 🏓 Healthcheck для бота
    // GET /api/bot/ping
    app.get('/api/bot/ping', authMiddleware, (req, res) => {
        res.json({
            success: true,
            message: 'pong',
            timestamp: new Date().toISOString()
        });
    });
    
    console.log('🤖 Bot API routes initialized');
}
