/**
 * 🎰 CRASH GAME SERVICE
 * Серверная логика для игры Crash
 * Работает 24/7, синхронизирована для всех клиентов
 */

export class CrashGameService {
    constructor(wss) {
        this.wss = wss;
        
        // Состояние игры
        this.state = {
            phase: 'waiting', // waiting, countdown, running, crashed
            multiplier: 1.00,
            crashPoint: 0,
            startTime: 0,
            countdownTime: 0,
            history: [],
            bets: new Map(), // oderId -> { oderId, amount, currency }
            hadBetsThisRound: false // Были ли ставки в этом раунде
        };
        
        // Таймеры
        this.animationInterval = null;
        this.countdownTimeout = null;
        
        // Загружаем историю
        this.loadHistory();
        
        // Запускаем игру
        this.startNewRound();
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
        this.state.hadBetsThisRound = false; // Сбрасываем флаг
        
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
    
    // Размещение ставки
    placeBet(oderId, amount, currency, autoCashout = 0, nickname = 'Игрок') {
        if (this.state.phase !== 'waiting' && this.state.phase !== 'countdown') {
            return { success: false, error: 'Раунд уже идёт' };
        }
        
        if (this.state.bets.has(oderId)) {
            return { success: false, error: 'Ставка уже сделана' };
        }
        
        this.state.bets.set(oderId, {
            oderId,
            amount,
            currency,
            autoCashout: autoCashout > 1 ? autoCashout : 0,
            nickname,
            placedAt: Date.now()
        });
        
        // Отмечаем что в этом раунде были ставки
        this.state.hadBetsThisRound = true;
        
        console.log(`🎰 Bet placed: ${amount} ${currency} by ${oderId}`);
        
        return { success: true };
    }
    
    // Кешаут (isAuto = true если это авто-кешаут)
    cashout(oderId, isAuto = false) {
        if (this.state.phase !== 'running') {
            return { success: false, error: 'Раунд ещё не начался' };
        }
        
        const bet = this.state.bets.get(oderId);
        if (!bet) {
            return { success: false, error: 'Ставка не найдена' };
        }
        
        const winAmount = bet.amount * this.state.multiplier;
        
        this.state.bets.delete(oderId);
        
        this.broadcast({
            type: 'crash_cashout',
            oderId: oderId,
            nickname: bet.nickname || 'Игрок',
            amount: winAmount,
            multiplier: this.state.multiplier,
            currency: bet.currency,
            isAutoCashout: isAuto // Флаг чтобы клиент знал это авто или ручной
        });
        
        console.log(`💰 Cashout: ${winAmount.toFixed(2)} ${bet.currency} at ${this.state.multiplier}x ${isAuto ? '(auto)' : ''}`);
        
        return {
            success: true,
            amount: winAmount,
            multiplier: this.state.multiplier,
            currency: bet.currency
        };
    }
    
    // Отмена ставки
    cancelBet(oderId) {
        if (this.state.phase !== 'waiting') {
            return { success: false, error: 'Отмена недоступна' };
        }
        
        const bet = this.state.bets.get(oderId);
        if (!bet) {
            return { success: false, error: 'Ставка не найдена' };
        }
        
        this.state.bets.delete(oderId);
        
        return {
            success: true,
            amount: bet.amount,
            currency: bet.currency
        };
    }
    
    // Проверка авто-кешаутов
    checkAutoCashouts() {
        for (const [oderId, bet] of this.state.bets) {
            if (bet.autoCashout > 0 && this.state.multiplier >= bet.autoCashout) {
                this.cashout(oderId, true); // isAuto = true
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
    
    // Есть ли ставка
    hasBet(oderId) {
        return this.state.bets.has(oderId);
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
