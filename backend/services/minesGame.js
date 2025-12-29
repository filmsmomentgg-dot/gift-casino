/**
 * 🎰 MINES GAME SERVICE - Provably Fair
 * Серверная логика игры Mines (аналог Stake/BC.Game)
 * 
 * RTP: ~97% (House Edge 3%)
 * Provably Fair: SHA-256 (serverSeed + clientSeed + nonce)
 */

import crypto from 'crypto';

export class MinesGameService {
    constructor(wss, db) {
        this.wss = wss;
        this.db = db;
        
        // Активные игры: Map<oderId, gameState>
        this.activeGames = new Map();
        
        // Маппинг telegramId -> oderId для быстрого поиска
        this.userGames = new Map();
        
        // Настройки
        this.config = {
            gridSize: 25,           // 5x5
            minMines: 1,
            maxMines: 24,
            rtp: 0.97,              // 97% RTP
            minBetTon: 0.10,
            minBetStars: 20,
            maxWinMultiplier: 1000  // Максимальный множитель
        };
        
        console.log('💣 Mines Game Service initialized');
    }
    
    // ==========================================
    // 🔐 PROVABLY FAIR
    // ==========================================
    
    /**
     * Генерация server seed
     */
    generateServerSeed() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    /**
     * Хеш server seed (отдаём клиенту ДО игры)
     */
    hashServerSeed(serverSeed) {
        return crypto.createHash('sha256').update(serverSeed).digest('hex');
    }
    
    /**
     * Генерация позиций мин на основе seeds
     * @param {string} serverSeed 
     * @param {string} clientSeed 
     * @param {number} nonce 
     * @param {number} minesCount 
     * @returns {number[]} - массив индексов мин (0-24)
     */
    generateMinePositions(serverSeed, clientSeed, nonce, minesCount) {
        const combined = `${serverSeed}:${clientSeed}:${nonce}`;
        const hash = crypto.createHash('sha256').update(combined).digest('hex');
        
        // Используем хеш для генерации позиций мин
        const positions = [];
        const available = Array.from({ length: 25 }, (_, i) => i);
        
        let hashIndex = 0;
        while (positions.length < minesCount && available.length > 0) {
            // Берём 2 символа хеша и конвертируем в число
            const hexPair = hash.substr(hashIndex * 2, 2);
            const num = parseInt(hexPair, 16);
            
            // Выбираем индекс из доступных
            const idx = num % available.length;
            positions.push(available[idx]);
            available.splice(idx, 1);
            
            hashIndex++;
            if (hashIndex >= 32) {
                // Если хеш закончился, генерируем новый
                const newHash = crypto.createHash('sha256')
                    .update(hash + hashIndex.toString())
                    .digest('hex');
                hashIndex = 0;
            }
        }
        
        return positions.sort((a, b) => a - b);
    }
    
    // ==========================================
    // 📊 МАТЕМАТИКА МНОЖИТЕЛЕЙ
    // ==========================================
    
    /**
     * Расчёт множителя для текущего состояния
     * 
     * Формула: multiplier = (1 / cumulativeProbability) * RTP
     * 
     * @param {number} minesCount - количество мин
     * @param {number} gemsRevealed - количество открытых безопасных клеток
     */
    calculateMultiplier(minesCount, gemsRevealed) {
        if (gemsRevealed === 0) return 1;
        
        const totalCells = 25;
        const safeCells = totalCells - minesCount;
        
        // Кумулятивная вероятность
        let probability = 1;
        for (let i = 0; i < gemsRevealed; i++) {
            const safeRemaining = safeCells - i;
            const totalRemaining = totalCells - i;
            probability *= safeRemaining / totalRemaining;
        }
        
        // Множитель с учётом RTP
        let multiplier = (1 / probability) * this.config.rtp;
        
        // Ограничиваем максимальный множитель
        multiplier = Math.min(multiplier, this.config.maxWinMultiplier);
        
        // Округляем до 2 знаков
        return Math.floor(multiplier * 100) / 100;
    }
    
    /**
     * Получить таблицу множителей для количества мин
     */
    getMultiplierTable(minesCount) {
        const table = [];
        const maxGems = 25 - minesCount;
        
        for (let gems = 1; gems <= maxGems; gems++) {
            table.push({
                gems,
                multiplier: this.calculateMultiplier(minesCount, gems)
            });
        }
        
        return table;
    }
    
    // ==========================================
    // 🎮 ИГРОВАЯ ЛОГИКА
    // ==========================================
    
    /**
     * Начать новую игру
     */
    async startGame(telegramId, amount, currency, minesCount, clientSeed, nickname) {
        // Проверка на активную игру
        if (this.userGames.has(telegramId)) {
            return { success: false, error: 'У вас уже есть активная игра' };
        }
        
        // Валидация мин
        if (minesCount < this.config.minMines || minesCount > this.config.maxMines) {
            return { success: false, error: `Количество мин: ${this.config.minMines}-${this.config.maxMines}` };
        }
        
        // Валидация ставки
        const minBet = currency === 'ton' ? this.config.minBetTon : this.config.minBetStars;
        if (amount < minBet) {
            return { success: false, error: `Минимальная ставка: ${minBet}` };
        }
        
        // Проверка баланса
        const balance = await this.db.getFullBalance(telegramId);
        const userBalance = currency === 'ton' ? balance.ton : balance.stars;
        
        if (userBalance < amount) {
            return { success: false, error: 'Недостаточно средств' };
        }
        
        // Списываем ставку
        await this.db.updateBalance(telegramId, -amount, currency);
        
        // Генерируем seeds и позиции мин
        const serverSeed = this.generateServerSeed();
        const serverSeedHash = this.hashServerSeed(serverSeed);
        const nonce = Date.now();
        const minePositions = this.generateMinePositions(serverSeed, clientSeed, nonce, minesCount);
        
        // Создаём игру
        const oderId = this.generateOrderId();
        const gameState = {
            oderId,
            telegramId,
            nickname,
            amount,
            currency,
            minesCount,
            minePositions,          // Секрет! Не отдаём клиенту
            revealedCells: [],      // Открытые клетки
            gemsRevealed: 0,        // Количество найденных алмазов
            currentMultiplier: 1,
            serverSeed,             // Секрет до конца игры
            serverSeedHash,         // Отдаём клиенту
            clientSeed,
            nonce,
            status: 'active',       // active, won, lost
            startedAt: Date.now()
        };
        
        this.activeGames.set(oderId, gameState);
        this.userGames.set(telegramId, oderId);
        
        // Получаем новый баланс
        const newBalance = await this.db.getFullBalance(telegramId);
        
        console.log(`💣 Game started: ${nickname} bet ${amount} ${currency}, ${minesCount} mines`);
        
        return {
            success: true,
            oderId,
            minesCount,
            serverSeedHash,
            nonce,
            currentMultiplier: 1,
            nextMultiplier: this.calculateMultiplier(minesCount, 1),
            balance: newBalance
        };
    }
    
    /**
     * Открыть клетку
     */
    async revealCell(telegramId, cellIndex) {
        const oderId = this.userGames.get(telegramId);
        if (!oderId) {
            return { success: false, error: 'Игра не найдена' };
        }
        
        const game = this.activeGames.get(oderId);
        if (!game || game.status !== 'active') {
            return { success: false, error: 'Игра не активна' };
        }
        
        // Проверка индекса
        if (cellIndex < 0 || cellIndex >= 25) {
            return { success: false, error: 'Неверная клетка' };
        }
        
        // Проверка что клетка не открыта
        if (game.revealedCells.includes(cellIndex)) {
            return { success: false, error: 'Клетка уже открыта' };
        }
        
        // Проверяем - мина или алмаз?
        const isMine = game.minePositions.includes(cellIndex);
        
        if (isMine) {
            // 💥 ПРОИГРЫШ
            game.status = 'lost';
            game.revealedCells.push(cellIndex);
            
            // Удаляем игру
            this.activeGames.delete(oderId);
            this.userGames.delete(telegramId);
            
            const newBalance = await this.db.getFullBalance(telegramId);
            
            console.log(`💥 Game lost: ${game.nickname} hit mine at ${cellIndex}`);
            
            // Broadcast для анимаций
            this.broadcast({
                type: 'mines_game_over',
                oderId,
                nickname: game.nickname,
                result: 'lost',
                amount: game.amount,
                minesCount: game.minesCount
            });
            
            return {
                success: true,
                result: 'mine',
                cellIndex,
                isMine: true,
                gameOver: true,
                minePositions: game.minePositions,  // Раскрываем все мины
                serverSeed: game.serverSeed,         // Для проверки
                balance: newBalance
            };
        } else {
            // 💎 АЛМАЗ
            game.revealedCells.push(cellIndex);
            game.gemsRevealed++;
            game.currentMultiplier = this.calculateMultiplier(game.minesCount, game.gemsRevealed);
            
            const maxGems = 25 - game.minesCount;
            const allGemsFound = game.gemsRevealed >= maxGems;
            
            if (allGemsFound) {
                // Автоматический кэшаут при всех алмазах
                return this.cashout(telegramId);
            }
            
            const nextMultiplier = this.calculateMultiplier(game.minesCount, game.gemsRevealed + 1);
            
            console.log(`💎 Gem found: ${game.nickname} at ${cellIndex}, multiplier: ${game.currentMultiplier}x`);
            
            return {
                success: true,
                result: 'gem',
                cellIndex,
                isMine: false,
                gameOver: false,
                gemsRevealed: game.gemsRevealed,
                currentMultiplier: game.currentMultiplier,
                nextMultiplier,
                potentialWin: Math.floor(game.amount * game.currentMultiplier * 100) / 100
            };
        }
    }
    
    /**
     * Кэшаут - забрать выигрыш
     */
    async cashout(telegramId) {
        const oderId = this.userGames.get(telegramId);
        if (!oderId) {
            return { success: false, error: 'Игра не найдена' };
        }
        
        const game = this.activeGames.get(oderId);
        if (!game || game.status !== 'active') {
            return { success: false, error: 'Игра не активна' };
        }
        
        if (game.gemsRevealed === 0) {
            return { success: false, error: 'Откройте хотя бы одну клетку' };
        }
        
        // Рассчитываем выигрыш
        const winAmount = Math.floor(game.amount * game.currentMultiplier * 100) / 100;
        
        // Начисляем выигрыш
        await this.db.updateBalance(telegramId, winAmount, game.currency);
        
        game.status = 'won';
        
        // Удаляем игру
        this.activeGames.delete(oderId);
        this.userGames.delete(telegramId);
        
        const newBalance = await this.db.getFullBalance(telegramId);
        
        console.log(`💰 Cashout: ${game.nickname} won ${winAmount} ${game.currency} at ${game.currentMultiplier}x`);
        
        // Broadcast
        this.broadcast({
            type: 'mines_cashout',
            oderId,
            nickname: game.nickname,
            amount: winAmount,
            multiplier: game.currentMultiplier,
            currency: game.currency,
            gemsRevealed: game.gemsRevealed
        });
        
        return {
            success: true,
            result: 'cashout',
            winAmount,
            multiplier: game.currentMultiplier,
            gemsRevealed: game.gemsRevealed,
            minePositions: game.minePositions,
            serverSeed: game.serverSeed,
            balance: newBalance
        };
    }
    
    /**
     * Получить состояние активной игры
     */
    getActiveGame(telegramId) {
        const oderId = this.userGames.get(telegramId);
        if (!oderId) return null;
        
        const game = this.activeGames.get(oderId);
        if (!game) return null;
        
        return {
            oderId: game.oderId,
            amount: game.amount,
            currency: game.currency,
            minesCount: game.minesCount,
            revealedCells: game.revealedCells,
            gemsRevealed: game.gemsRevealed,
            currentMultiplier: game.currentMultiplier,
            nextMultiplier: this.calculateMultiplier(game.minesCount, game.gemsRevealed + 1),
            serverSeedHash: game.serverSeedHash,
            nonce: game.nonce,
            potentialWin: Math.floor(game.amount * game.currentMultiplier * 100) / 100
        };
    }
    
    // ==========================================
    // 🔧 УТИЛИТЫ
    // ==========================================
    
    generateOrderId() {
        return 'mines_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    broadcast(message) {
        if (!this.wss) return;
        
        const data = JSON.stringify(message);
        this.wss.clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(data);
            }
        });
    }
}

export default MinesGameService;
