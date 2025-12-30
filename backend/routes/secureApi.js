/**
 * Secure API Routes
 * Защищённые API endpoints с Telegram аутентификацией
 * (Cases removed - only user/inventory endpoints)
 */

import { authMiddleware } from '../services/telegramAuth.js';
import { bettingService } from '../services/bettingService.js';

export function initSecureRoutes(app, db) {

    // ==================== ПОЛЬЗОВАТЕЛЬ ====================

    /**
     * Получить данные текущего пользователя
     */
    app.get('/api/user', authMiddleware, async (req, res) => {
        try {
            let user = await db.getUser(req.telegramUser.id);
            
            if (!user) {
                // Auto-create user
                user = await db.upsertUser(req.telegramUser.id, req.telegramUser.username || 'User');
            }

            res.json({
                success: true,
                data: {
                    telegram_id: user.telegram_id,
                    username: user.username,
                    balance_stars: user.balance_stars,
                    balance_ton: user.balance_ton,
                    created_at: user.created_at
                }
            });
        } catch (error) {
            console.error('Error getting user:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * Получить баланс пользователя
     */
    app.get('/api/user/balance', authMiddleware, async (req, res) => {
        try {
            let balance = await db.getFullBalance(req.telegramUser.id);
            
            if (!balance) {
                // Auto-create user
                await db.upsertUser(req.telegramUser.id, req.telegramUser.username || 'User');
                balance = await db.getFullBalance(req.telegramUser.id);
            }

            res.json({
                success: true,
                data: balance
            });
        } catch (error) {
            console.error('Error getting balance:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * Получить инвентарь пользователя
     */
    app.get('/api/user/inventory', authMiddleware, async (req, res) => {
        try {
            const inventory = await db.getInventory(req.telegramUser.id);
            
            res.json({
                success: true,
                data: inventory,
                count: inventory.length
            });
        } catch (error) {
            console.error('Error getting inventory:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * Продать предмет из инвентаря
     */
    app.post('/api/user/inventory/sell', authMiddleware, async (req, res) => {
        try {
            const { itemId, currency = 'stars' } = req.body;

            if (!itemId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing itemId'
                });
            }

            // Get item
            const inventory = await db.getInventory(req.telegramUser.id);
            const item = inventory.find(i => i.id === itemId);
            
            if (!item) {
                return res.status(404).json({
                    success: false,
                    error: 'Item not found'
                });
            }

            // Sell price (85% of value)
            const sellPrice = Math.floor(item.item_price * 0.85);

            // Remove from inventory
            await db.removeInventoryItem(req.telegramUser.id, itemId);

            // Add to balance
            const newBalance = await db.updateBalance(req.telegramUser.id, sellPrice, currency);

            res.json({
                success: true,
                soldItem: {
                    id: item.id,
                    name: item.item_name,
                    originalPrice: item.item_price,
                    sellPrice
                },
                balance: {
                    [currency]: newBalance
                }
            });
        } catch (error) {
            console.error('Error selling item:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    // ==================== DEBUG (development only) ====================

    if (process.env.NODE_ENV !== 'production') {
        /**
         * Add test balance
         */
        app.post('/api/debug/add-balance', authMiddleware, async (req, res) => {
            try {
                const { amount = 1000, currency = 'stars' } = req.body;
                const newBalance = await db.updateBalance(req.telegramUser.id, amount, currency);
                
                res.json({
                    success: true,
                    balance: {
                        [currency]: newBalance
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });
    }

    // ==================== СТАВКИ (BETTING) ====================

    /**
     * Получить все события для ставок
     */
    app.get('/api/betting/events', async (req, res) => {
        try {
            const events = await bettingService.getAllEvents();
            res.json({
                success: true,
                data: events
            });
        } catch (error) {
            console.error('Error getting betting events:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get events'
            });
        }
    });

    /**
     * Сделать ставку
     */
    app.post('/api/betting/place', authMiddleware, async (req, res) => {
        try {
            const { eventId, pick, odd, amount, currency = 'ton', matchInfo } = req.body;

            if (!eventId || !pick || !odd || !amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields'
                });
            }

            // Check balance
            const balance = await db.getFullBalance(req.telegramUser.id);
            const currentBalance = currency === 'ton' ? balance.ton : balance.stars;

            if (amount > currentBalance) {
                return res.status(400).json({
                    success: false,
                    error: 'Insufficient balance'
                });
            }

            // Deduct balance
            await db.updateBalance(req.telegramUser.id, -amount, currency);

            // Save bet
            const bet = await db.placeBet(req.telegramUser.id, {
                eventId,
                pick,
                odd,
                amount,
                currency,
                matchInfo,
                status: 'pending',
                potentialWin: amount * odd,
                createdAt: new Date().toISOString()
            });

            const newBalance = await db.getFullBalance(req.telegramUser.id);

            res.json({
                success: true,
                bet,
                balance: newBalance
            });
        } catch (error) {
            console.error('Error placing bet:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to place bet'
            });
        }
    });

    /**
     * Получить мои ставки
     */
    app.get('/api/betting/my-bets', authMiddleware, async (req, res) => {
        try {
            const bets = await db.getUserBets(req.telegramUser.id);
            res.json({
                success: true,
                data: bets
            });
        } catch (error) {
            console.error('Error getting bets:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get bets'
            });
        }
    });

    console.log('✅ Secure API routes initialized (with betting)');
}
