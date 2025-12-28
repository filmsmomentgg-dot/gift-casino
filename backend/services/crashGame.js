/**
 * 🎰 CRASH GAME SERVICE - SECURE VERSION
 * Серверная логика для игры Crash
 * Работает 24/7, синхронизирована для всех клиентов
 * 
 * 🔐 БЕЗОПАСНОСТЬ:
 * - Баланс хранится ТОЛЬКО на сервере
 * - Order ID генерируется СЕРВЕРОМ
 * - Все ставки привязаны к telegram_id
 * - Никнейм берётся из проверенного initData
 */

export class CrashGameService {
    constructor(wss, database) {
        this.wss = wss;
        this.db = database; // Ссылка на DatabaseService
        
        // Состояние игры
        this.state = {
            phase: 'waiting', // waiting, countdown, running, crashed
            multiplier: 1.00,
            crashPoint: 0,
            startTime: 0,
            countdownTime: 0,
            history: [],
            bets: new Map(), // oderId -> { oderId, telegramId, amount, currency, ... }
            hadBetsThisRound: false
        };
        
        // Маппинг telegramId -> oderId для быстрого поиска
        this.userBets = new Map(); // telegramId -> oderId
        
        // Счётчик для генерации уникальных Order ID
        this.orderCounter = Date.now();
        
        // Таймеры
        this.animationInterval = null;
        this.countdownTimeout = null;
        
        // Загружаем историю
        this.loadHistory();
        
        // Запускаем игру
        this.startNewRound();
    }
    
    /**
     * 🔐 Генерация безопасного Order ID
     */
    generateOrderId() {
        this.orderCounter++;
        const random = Math.random().toString(36).substring(2, 8);
        return `crash_${this.orderCounter}_${random}`;
    }
    
    // Загрузка истории
    loadHistory() {
        this.state.history = [];
        for (let i = 0; i < 15; i++) {
            this.state.history.push(this.generateCrashPoint());
        }
    }
    
    // Генерация точки краша (house edge ~5%)
    generateCrashPoint() {
        const houseEdge = 0.05; // 5% шанс на мгновенный краш (1.00x)
        const random = Math.random();
        
        if (random < houseEdge) {
            return 1.00;
        }
        
        const crashPoint = (1 - houseEdge) / (1 - random);
        return Math.floor(crashPoint * 100) / 100;
    }
    
    // Начало нового раунда
    startNewRound() {
        this.state.phase = 'waiting';
        this.state.multiplier = 1.00;
        this.state.crashPoint = this.generateCrashPoint();
        this.state.bets.clear();
        this.userBets.clear(); // Очищаем маппинг
        this.state.hadBetsThisRound = false;
        
        this.broadcast({
            type: 'crash_waiting',
            multiplier: 1.00,
            history: this.state.history.slice(-15)
        });
        
        setTimeout(() => this.startCountdown(), 2000);
    }
    
    // Обратный отсчёт
    startCountdown() {
        this.state.phase = 'countdown';
        this.state.countdownTime = 3;
        
        const countdown = () => {
            if (this.state.countdownTime > 0) {
                this.broadcast({
                    type: 'crash_countdown',
                    countdown: this.state.countdownTime,
                    history: this.state.history.slice(-15)
                });
                this.state.countdownTime--;
                this.countdownTimeout = setTimeout(countdown, 1000);
            } else {
                this.startRound();
            }
        };
        
        countdown();
    }
    
    // Запуск раунда
    startRound() {
        this.state.phase = 'running';
        this.state.startTime = Date.now();
        this.state.multiplier = 1.00;
        
        this.broadcast({
            type: 'crash_start',
            multiplier: 1.00
        });
        
        this.animationInterval = setInterval(() => this.tick(), 50);
    }
    
    // Тик игры
    tick() {
        if (this.state.phase !== 'running') return;
        
        const elapsed = (Date.now() - this.state.startTime) / 1000;
        
        this.state.multiplier = Math.pow(Math.E, 0.1 * elapsed);
        this.state.multiplier = Math.floor(this.state.multiplier * 100) / 100;
        
        // Краш на заранее определённой точке
        if (this.state.multiplier >= this.state.crashPoint) {
            this.crash();
            return;
        }
        
        this.broadcast({
            type: 'crash_tick',
            multiplier: this.state.multiplier
        });
        
        this.checkAutoCashouts();
    }
    
    // Краш!
    crash() {
        clearInterval(this.animationInterval);
        this.animationInterval = null;
        
        this.state.phase = 'crashed';
        this.state.multiplier = this.state.crashPoint;
        
        this.state.history.push(this.state.crashPoint);
        if (this.state.history.length > 50) {
            this.state.history.shift();
        }
        
        const losers = [];
        for (const [oderId, bet] of this.state.bets) {
            losers.push({
                oderId: oderId,
                amount: bet.amount,
                currency: bet.currency
            });
        }
        
        this.broadcast({
            type: 'crash_crashed',
            crashPoint: this.state.crashPoint,
            history: this.state.history.slice(-15),
            losers
        });
        
        setTimeout(() => this.startNewRound(), 3000);
    }
    
    // 🔐 Размещение ставки - БЕЗОПАСНАЯ ВЕРСИЯ
    // telegramId и nickname приходят из ПРОВЕРЕННОГО initData
    async placeBet(telegramId, amount, currency, autoCashout = 0, nickname = 'Игрок') {
        if (this.state.phase !== 'waiting' && this.state.phase !== 'countdown') {
            return { success: false, error: 'Раунд уже идёт' };
        }
        
        // Проверяем что у пользователя нет активной ставки
        if (this.userBets.has(telegramId)) {
            return { success: false, error: 'Ставка уже сделана' };
        }
        
        // Минимальные ставки
        const minBet = currency === 'ton' ? 0.10 : 20;
        if (amount < minBet) {
            return { success: false, error: `Минимальная ставка: ${minBet} ${currency}` };
        }
        
        // 🔐 ПРОВЕРЯЕМ БАЛАНС В БАЗЕ ДАННЫХ
        if (!this.db) {
            console.error('❌ Database not connected to CrashGame');
            return { success: false, error: 'Ошибка сервера' };
        }
        
        try {
            const user = await this.db.getUser(telegramId);
            if (!user) {
                return { success: false, error: 'Пользователь не найден' };
            }
            
            const balance = currency === 'ton' ? user.balance_ton : user.balance_stars;
            
            if (balance < amount) {
                return { success: false, error: 'Недостаточно средств' };
            }
            
            // 🔐 СПИСЫВАЕМ БАЛАНС НА СЕРВЕРЕ
            await this.db.updateBalance(telegramId, currency, -amount);
            
            // Генерируем Order ID на СЕРВЕРЕ
            const oderId = this.generateOrderId();
            
            this.state.bets.set(oderId, {
                oderId,
                telegramId,
                amount,
                currency,
                autoCashout: autoCashout > 1 ? autoCashout : 0,
                nickname,
                placedAt: Date.now()
            });
            
            // Сохраняем маппинг telegramId -> oderId
            this.userBets.set(telegramId, oderId);
            
            this.state.hadBetsThisRound = true;
            
            console.log(`🎰 Bet placed: ${amount} ${currency} by ${telegramId} (${nickname}), orderId: ${oderId}`);
            
            // Возвращаем новый баланс и orderId
            const newBalance = await this.db.getFullBalance(telegramId);
            
            return { 
                success: true, 
                oderId,
                balance: newBalance
            };
            
        } catch (error) {
            console.error('❌ PlaceBet error:', error);
            return { success: false, error: 'Ошибка сервера' };
        }
    }
    
    // 🔐 Кешаут - БЕЗОПАСНАЯ ВЕРСИЯ
    // telegramId приходит из ПРОВЕРЕННОГО initData
    async cashout(telegramId, isAuto = false) {
        if (this.state.phase !== 'running') {
            return { success: false, error: 'Раунд ещё не начался' };
        }
        
        // Находим ставку по telegramId
        const oderId = this.userBets.get(telegramId);
        if (!oderId) {
            return { success: false, error: 'Ставка не найдена' };
        }
        
        const bet = this.state.bets.get(oderId);
        if (!bet) {
            return { success: false, error: 'Ставка не найдена' };
        }
        
        const winAmount = bet.amount * this.state.multiplier;
        
        // 🔐 НАЧИСЛЯЕМ ВЫИГРЫШ НА СЕРВЕРЕ
        try {
            await this.db.updateBalance(telegramId, bet.currency, winAmount);
            
            this.state.bets.delete(oderId);
            this.userBets.delete(telegramId);
            
            // Получаем новый баланс
            const newBalance = await this.db.getFullBalance(telegramId);
            
            this.broadcast({
                type: 'crash_cashout',
                oderId: oderId,
                nickname: bet.nickname || 'Игрок',
                amount: winAmount,
                multiplier: this.state.multiplier,
                currency: bet.currency,
                isAutoCashout: isAuto
            });
            
            console.log(`💰 Cashout: ${winAmount.toFixed(2)} ${bet.currency} at ${this.state.multiplier}x ${isAuto ? '(auto)' : ''}`);
            
            return {
                success: true,
                amount: winAmount,
                multiplier: this.state.multiplier,
                currency: bet.currency,
                balance: newBalance // 🔐 Возвращаем актуальный баланс
            };
            
        } catch (error) {
            console.error('❌ Cashout error:', error);
            return { success: false, error: 'Ошибка сервера' };
        }
    }
    
    // 🔐 Отмена ставки - БЕЗОПАСНАЯ ВЕРСИЯ
    async cancelBet(telegramId) {
        if (this.state.phase !== 'waiting') {
            return { success: false, error: 'Отмена недоступна' };
        }
        
        const oderId = this.userBets.get(telegramId);
        if (!oderId) {
            return { success: false, error: 'Ставка не найдена' };
        }
        
        const bet = this.state.bets.get(oderId);
        if (!bet) {
            return { success: false, error: 'Ставка не найдена' };
        }
        
        // 🔐 ВОЗВРАЩАЕМ ДЕНЬГИ НА СЕРВЕРЕ
        try {
            await this.db.updateBalance(telegramId, bet.currency, bet.amount);
            
            this.state.bets.delete(oderId);
            this.userBets.delete(telegramId);
            
            const newBalance = await this.db.getFullBalance(telegramId);
            
            return {
                success: true,
                amount: bet.amount,
                currency: bet.currency,
                balance: newBalance
            };
            
        } catch (error) {
            console.error('❌ CancelBet error:', error);
            return { success: false, error: 'Ошибка сервера' };
        }
    }
    
    // Проверка авто-кешаутов
    async checkAutoCashouts() {
        for (const [oderId, bet] of this.state.bets) {
            if (bet.autoCashout > 0 && this.state.multiplier >= bet.autoCashout) {
                await this.cashout(bet.telegramId, true); // isAuto = true
            }
        }
    }
    
    // Получение состояния
    getState() {
        return {
            phase: this.state.phase,
            multiplier: this.state.multiplier,
            countdown: this.state.countdownTime,
            history: this.state.history.slice(-15),
            betsCount: this.state.bets.size
        };
    }
    
    // 🔐 Есть ли ставка у пользователя (по telegramId)
    hasBet(telegramId) {
        return this.userBets.has(telegramId);
    }
    
    // 🔐 Получить ставку пользователя
    getUserBet(telegramId) {
        const oderId = this.userBets.get(telegramId);
        if (!oderId) return null;
        return this.state.bets.get(oderId);
    }
    
    // Отправка всем клиентам
    broadcast(message) {
        const data = JSON.stringify(message);
        this.wss.clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(data);
            }
        });
    }
    
    // Остановка
    stop() {
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
        }
        if (this.countdownTimeout) {
            clearTimeout(this.countdownTimeout);
        }
    }
}
