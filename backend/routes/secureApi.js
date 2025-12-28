/**
 * Secure API Routes
 * Защищённые API endpoints с Telegram аутентификацией
 */

import { authMiddleware, optionalAuthMiddleware } from '../services/telegramAuth.js';
import { CaseService } from '../services/caseService.js';

export function initSecureRoutes(app, db) {
    const caseService = new CaseService(db);

    // ==================== ПОЛЬЗОВАТЕЛЬ ====================

    /**
     * Получить данные текущего пользователя
     * Требует авторизации
     */
    app.get('/api/user', authMiddleware, async (req, res) => {
        try {
            const user = await db.getUser(req.telegramUser.id);
            
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
                    username: user.username,
                    first_name: user.first_name,
                    balance_stars: user.balance_stars,
                    balance_ton: user.balance_ton,
                    created_at: user.created_at,
                    last_active: user.last_active
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
            const balance = await db.getFullBalance(req.telegramUser.id);
            
            if (!balance) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
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

            const result = await caseService.sellInventoryItem(req.telegramUser.id, itemId, currency);
            
            res.json(result);
        } catch (error) {
            console.error('Error selling item:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * Получить историю спинов кейсов
     */
    app.get('/api/user/history', authMiddleware, async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const spins = await db.getCaseSpins(req.telegramUser.id, limit);
            
            res.json({
                success: true,
                data: spins,
                count: spins.length
            });
        } catch (error) {
            console.error('Error getting history:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * Получить статистику пользователя
     */
    app.get('/api/user/stats', authMiddleware, async (req, res) => {
        try {
            const stats = await db.getCaseStats(req.telegramUser.id);
            
            res.json({
                success: true,
                data: stats || {
                    total_spins: 0,
                    total_bet: 0,
                    total_won: 0,
                    avg_win: 0
                }
            });
        } catch (error) {
            console.error('Error getting stats:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    // ==================== КЕЙСЫ ====================

    /**
     * Получить список доступных кейсов (публичный)
     */
    app.get('/api/cases', (req, res) => {
        try {
            const cases = caseService.getAllCases();
            res.json({
                success: true,
                data: cases
            });
        } catch (error) {
            console.error('Error getting cases:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * Получить информацию о конкретном кейсе
     */
    app.get('/api/cases/:type', (req, res) => {
        try {
            const caseInfo = caseService.getCaseInfo(req.params.type);
            
            if (!caseInfo) {
                return res.status(404).json({
                    success: false,
                    error: 'Case not found'
                });
            }

            res.json({
                success: true,
                data: caseInfo
            });
        } catch (error) {
            console.error('Error getting case:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    /**
     * ОТКРЫТЬ КЕЙС - ГЛАВНЫЙ ЗАЩИЩЁННЫЙ ENDPOINT
     * Вся логика на сервере!
     */
    app.post('/api/cases/:type/open', authMiddleware, async (req, res) => {
        try {
            const { currency = 'stars' } = req.body;
            const caseType = req.params.type;
            const telegramId = req.telegramUser.id;

            console.log(`[CaseOpen] User ${telegramId} opening ${caseType} case with ${currency}`);

            const result = await caseService.openCase(telegramId, caseType, currency);

            if (result.success) {
                console.log(`[CaseOpen] User ${telegramId} won ${result.wonItem.name} (${result.wonItem.price} stars)`);
            } else {
                console.log(`[CaseOpen] Failed for user ${telegramId}: ${result.error}`);
            }

            res.json(result);
        } catch (error) {
            console.error('Error opening case:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    // ==================== ДЕПОЗИТЫ ====================

    /**
     * Получить историю депозитов
     */
    app.get('/api/user/deposits', authMiddleware, async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const deposits = await db.getDeposits(req.telegramUser.id, limit);
            
            res.json({
                success: true,
                data: deposits,
                count: deposits.length
            });
        } catch (error) {
            console.error('Error getting deposits:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    // ==================== DEBUG (только для разработки) ====================

    if (process.env.NODE_ENV !== 'production') {
        /**
         * Добавить тестовый баланс (ТОЛЬКО ДЛЯ РАЗРАБОТКИ!)
         */
        app.post('/api/debug/add-balance', authMiddleware, async (req, res) => {
            try {
                const { amount = 1000, currency = 'stars' } = req.body;
                const newBalance = await db.updateBalance(req.telegramUser.id, currency, amount);
                
                res.json({
                    success: true,
                    data: {
                        currency,
                        added: amount,
                        newBalance
                    },
                    warning: 'DEBUG ONLY - not available in production'
                });
            } catch (error) {
                console.error('Debug error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        /**
         * Сбросить пользователя (ТОЛЬКО ДЛЯ РАЗРАБОТКИ!)
         */
        app.post('/api/debug/reset-user', authMiddleware, async (req, res) => {
            try {
                // Сбрасываем баланс на начальный
                await db.run(`
                    UPDATE users 
                    SET balance_stars = 1000, balance_ton = 0 
                    WHERE telegram_id = ?
                `, [req.telegramUser.id]);

                // Очищаем инвентарь
                await db.run(`
                    DELETE FROM inventory WHERE telegram_id = ?
                `, [req.telegramUser.id]);

                // Очищаем историю
                await db.run(`
                    DELETE FROM case_spins WHERE telegram_id = ?
                `, [req.telegramUser.id]);

                res.json({
                    success: true,
                    message: 'User reset to initial state',
                    warning: 'DEBUG ONLY - not available in production'
                });
            } catch (error) {
                console.error('Debug error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    console.log('✅ Secure API routes initialized');
}
