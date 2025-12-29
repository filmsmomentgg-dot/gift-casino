/**
 * 💣 MINES GAME - Secure Client
 * Provably Fair игра Mines (аналог Stake/BC.Game)
 * 
 * 🔐 БЕЗОПАСНОСТЬ:
 * - Позиции мин известны ТОЛЬКО серверу до конца игры
 * - Все проверки на сервере
 * - Provably Fair с SHA-256
 */

(function() {
    'use strict';
    
    // ==========================================
    // 📊 СОСТОЯНИЕ ИГРЫ
    // ==========================================
    
    const minesState = {
        isAuthenticated: false,
        gameActive: false,
        oderId: null,
        minesCount: 3,
        betAmount: 10,
        revealedCells: [],
        currentMultiplier: 1,
        nextMultiplier: 1,
        potentialWin: 0,
        serverSeedHash: null,
        clientSeed: null,
        nonce: null,
        minePositions: [],  // Заполняется только после окончания игры
        isProcessing: false
    };
    
    // DOM элементы
    let minesElements = {};
    
    // Telegram
    const tg = window.Telegram?.WebApp;
    // Флаг инициализации
    let isInitialized = false;
    
    // ==========================================
    // 🚀 ИНИЦИАЛИЗАЦИЯ
    // ==========================================
    
    function initMines() {
        console.log('💣 initMines called, initialized:', isInitialized);
        
        minesElements = {
            section: document.getElementById('minesSection'),
            grid: document.getElementById('minesGrid'),
            betInput: document.getElementById('minesBetInput'),
            minesSelect: document.getElementById('minesCountSelect'),
            btn: document.getElementById('minesBtn'),
            multiplierDisplay: document.getElementById('minesMultiplier'),
            potentialWin: document.getElementById('minesPotentialWin'),
            gemsCount: document.getElementById('minesGemsCount'),
            seedHash: document.getElementById('minesSeedHash')
        };
        
        if (!minesElements.section) {
            console.log('❌ Mines section not found');
            return;
        }
        
        if (!minesElements.grid) {
            console.log('❌ Mines grid not found');
            return;
        }
        
        // Создаём сетку 5x5 только если она пустая
        if (minesElements.grid.children.length === 0) {
            createGrid();
        }
        
        if (!isInitialized) {
            // Генерируем client seed
            minesState.clientSeed = generateClientSeed();
            
            // Обработчики
            setupEventListeners();
            
            // Регистрируем обработчик сообщений
            window._minesMsgHandler = handleMinesMessage;
            
            isInitialized = true;
        }
        
        // Запрашиваем состояние игры
        setTimeout(() => {
            if (window.liveWs && window.liveWs.readyState === 1) {
                window.liveWs.send(JSON.stringify({ type: 'mines_get_game' }));
            }
        }, 500);
        
        console.log('💣 Mines game initialized');
    }
    
    function createGrid() {
        if (!minesElements.grid) return;
        
        minesElements.grid.innerHTML = '';
        
        for (let i = 0; i < 25; i++) {
            const cell = document.createElement('div');
            cell.className = 'mines-cell';
            cell.dataset.index = i;
            cell.addEventListener('click', () => handleCellClick(i));
            minesElements.grid.appendChild(cell);
        }
    }
    
    function setupEventListeners() {
        // Главная кнопка
        if (minesElements.btn) {
            minesElements.btn.addEventListener('click', handleMainButton);
        }
        
        // Изменение количества мин
        if (minesElements.minesSelect) {
            minesElements.minesSelect.addEventListener('change', (e) => {
                minesState.minesCount = parseInt(e.target.value);
                updateMultiplierPreview();
            });
        }
        
        // Изменение ставки
        if (minesElements.betInput) {
            minesElements.betInput.addEventListener('input', updateMultiplierPreview);
        }
        
        // Quick bet buttons
        document.querySelectorAll('.mines-bet-quick').forEach(btn => {
            btn.addEventListener('click', () => {
                const mult = btn.dataset.mult;
                const action = btn.dataset.action;
                const input = minesElements.betInput;
                const balance = window.state.currentCurrency === 'ton' 
                    ? window.state.balance 
                    : window.state.starsBalance;
                
                if (!input) return;
                
                let currentVal = parseFloat(input.value) || 0;
                
                if (action === 'half') {
                    input.value = Math.max(currentVal / 2, 0.1).toFixed(2);
                } else if (action === 'double') {
                    input.value = Math.min(currentVal * 2, balance).toFixed(2);
                } else if (action === 'max') {
                    input.value = balance.toFixed(2);
                } else if (mult) {
                    input.value = (balance * parseFloat(mult)).toFixed(2);
                }
                
                updateMultiplierPreview();
            });
        });
    }
    
    // ==========================================
    // 🎮 ИГРОВАЯ ЛОГИКА
    // ==========================================
    
    function handleMainButton() {
        if (minesState.isProcessing) return;
        
        if (minesState.gameActive) {
            // Cashout
            cashout();
        } else {
            // Start game
            startGame();
        }
    }
    
    function startGame() {
        if (!minesState.isAuthenticated) {
            showNotification('Ошибка авторизации', 'error');
            return;
        }
        
        const betAmount = parseFloat(minesElements.betInput?.value) || 0;
        const minBet = window.state.currentCurrency === 'ton' ? 0.10 : 20;
        const balance = window.state.currentCurrency === 'ton' 
            ? window.state.balance 
            : window.state.starsBalance;
        
        if (betAmount < minBet) {
            showNotification(`Минимальная ставка: ${minBet}`, 'error');
            return;
        }
        
        if (betAmount > balance) {
            showNotification('Недостаточно средств', 'error');
            return;
        }
        
        minesState.isProcessing = true;
        minesState.betAmount = betAmount;
        minesState.clientSeed = generateClientSeed();
        
        if (window.liveWs && window.liveWs.readyState === 1) {
            window.liveWs.send(JSON.stringify({
                type: 'mines_start',
                amount: betAmount,
                currency: window.state.currentCurrency,
                minesCount: minesState.minesCount,
                clientSeed: minesState.clientSeed
            }));
        }
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium');
        }
    }
    
    function handleCellClick(index) {
        if (!minesState.gameActive) return;
        if (minesState.isProcessing) return;
        if (minesState.revealedCells.includes(index)) return;
        
        minesState.isProcessing = true;
        
        if (window.liveWs && window.liveWs.readyState === 1) {
            window.liveWs.send(JSON.stringify({
                type: 'mines_reveal',
                cellIndex: index
            }));
        }
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }
    }
    
    function cashout() {
        if (!minesState.gameActive) return;
        if (minesState.isProcessing) return;
        
        minesState.isProcessing = true;
        
        if (window.liveWs && window.liveWs.readyState === 1) {
            window.liveWs.send(JSON.stringify({
                type: 'mines_cashout'
            }));
        }
    }
    
    // ==========================================
    // 📨 ОБРАБОТКА СООБЩЕНИЙ СЕРВЕРА
    // ==========================================
    
    function handleMinesMessage(msg) {
        console.log('💣 Mines message:', msg.type, msg);
        
        minesState.isProcessing = false;
        
        switch (msg.type) {
            case 'auth_result':
                if (msg.success) {
                    minesState.isAuthenticated = true;
                }
                break;
                
            case 'mines_start_result':
                if (msg.success) {
                    minesState.gameActive = true;
                    minesState.oderId = msg.oderId;
                    minesState.revealedCells = [];
                    minesState.currentMultiplier = msg.currentMultiplier;
                    minesState.nextMultiplier = msg.nextMultiplier;
                    minesState.serverSeedHash = msg.serverSeedHash;
                    minesState.nonce = msg.nonce;
                    minesState.minePositions = [];
                    minesState.potentialWin = 0;
                    
                    // Обновляем баланс
                    if (msg.balance) {
                        window.state.starsBalance = msg.balance.stars || 0;
                        window.state.balance = msg.balance.ton || 0;
                        if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
                    }
                    
                    resetGrid();
                    updateUI();
                    showNotification('Игра началась! Выбирайте клетки', 'success');
                } else {
                    showNotification(msg.error, 'error');
                }
                break;
                
            case 'mines_reveal_result':
                if (msg.success) {
                    if (msg.result === 'gem') {
                        // Нашли алмаз
                        revealCell(msg.cellIndex, false);
                        minesState.revealedCells.push(msg.cellIndex);
                        minesState.currentMultiplier = msg.currentMultiplier;
                        minesState.nextMultiplier = msg.nextMultiplier;
                        minesState.potentialWin = msg.potentialWin;
                        
                        if (tg?.HapticFeedback) {
                            tg.HapticFeedback.notificationOccurred('success');
                        }
                    } else if (msg.result === 'mine') {
                        // Попали на мину - проигрыш
                        revealCell(msg.cellIndex, true);
                        minesState.gameActive = false;
                        minesState.minePositions = msg.minePositions;
                        
                        // Показываем все мины
                        revealAllMines(msg.minePositions, msg.cellIndex);
                        
                        // Обновляем баланс
                        if (msg.balance) {
                            window.state.starsBalance = msg.balance.stars || 0;
                            window.state.balance = msg.balance.ton || 0;
                            if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
                        }
                        
                        showNotification('💥 Бум! Вы попали на мину', 'error');
                        
                        if (tg?.HapticFeedback) {
                            tg.HapticFeedback.notificationOccurred('error');
                        }
                    }
                    
                    updateUI();
                } else {
                    showNotification(msg.error, 'error');
                }
                break;
                
            case 'mines_cashout_result':
                if (msg.success) {
                    minesState.gameActive = false;
                    minesState.minePositions = msg.minePositions;
                    
                    // Показываем все мины
                    revealAllMines(msg.minePositions, -1);
                    
                    // Обновляем баланс
                    if (msg.balance) {
                        window.state.starsBalance = msg.balance.stars || 0;
                        window.state.balance = msg.balance.ton || 0;
                        if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
                    }
                    
                    showNotification(`🎉 Вы выиграли ${msg.winAmount.toFixed(2)} на ${msg.multiplier.toFixed(2)}x!`, 'success');
                    
                    if (tg?.HapticFeedback) {
                        tg.HapticFeedback.notificationOccurred('success');
                    }
                    
                    updateUI();
                } else {
                    showNotification(msg.error, 'error');
                }
                break;
                
            case 'mines_game_state':
                if (msg.hasActiveGame && msg.game) {
                    // Восстанавливаем активную игру
                    minesState.gameActive = true;
                    minesState.oderId = msg.game.oderId;
                    minesState.revealedCells = msg.game.revealedCells || [];
                    minesState.currentMultiplier = msg.game.currentMultiplier;
                    minesState.nextMultiplier = msg.game.nextMultiplier;
                    minesState.potentialWin = msg.game.potentialWin;
                    minesState.minesCount = msg.game.minesCount;
                    minesState.betAmount = msg.game.amount;
                    minesState.serverSeedHash = msg.game.serverSeedHash;
                    minesState.nonce = msg.game.nonce;
                    
                    // Восстанавливаем сетку
                    resetGrid();
                    minesState.revealedCells.forEach(i => revealCell(i, false));
                    updateUI();
                }
                break;
                
            case 'balance_update':
                if (msg.balance) {
                    window.state.starsBalance = msg.balance.stars || 0;
                    window.state.balance = msg.balance.ton || 0;
                    if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
                }
                break;
        }
    }
    
    // ==========================================
    // 🎨 UI ФУНКЦИИ
    // ==========================================
    
    function resetGrid() {
        const cells = minesElements.grid?.querySelectorAll('.mines-cell');
        cells?.forEach(cell => {
            cell.className = 'mines-cell';
            cell.innerHTML = '';
        });
    }
    
    function revealCell(index, isMine) {
        const cell = minesElements.grid?.querySelector(`[data-index="${index}"]`);
        if (!cell) return;
        
        cell.classList.add('revealed');
        
        if (isMine) {
            cell.classList.add('mine');
            cell.innerHTML = '💣';
        } else {
            cell.classList.add('gem');
            // Показываем TON или Stars в зависимости от валюты
            const icon = window.state?.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
            cell.innerHTML = `<img src="${icon}" class="mines-gem-icon" alt="">`;
        }
    }
    
    function revealAllMines(minePositions, hitIndex) {
        minePositions.forEach(pos => {
            if (pos !== hitIndex) {
                const cell = minesElements.grid?.querySelector(`[data-index="${pos}"]`);
                if (cell && !cell.classList.contains('revealed')) {
                    cell.classList.add('revealed', 'mine', 'hidden-mine');
                    cell.innerHTML = '💣';
                }
            }
        });
    }
    
    function updateUI() {
        // Кнопка
        if (minesElements.btn) {
            if (minesState.gameActive) {
                const currencyIcon = window.state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
                minesElements.btn.innerHTML = `Забрать ${minesState.potentialWin.toFixed(2)} <img src="${currencyIcon}" class="btn-currency-icon" alt="">`;
                minesElements.btn.className = 'mines-btn cashout';
                minesElements.btn.disabled = minesState.revealedCells.length === 0;
            } else {
                minesElements.btn.textContent = 'Начать игру';
                minesElements.btn.className = 'mines-btn';
                minesElements.btn.disabled = false;
            }
        }
        
        // Множитель
        if (minesElements.multiplierDisplay) {
            minesElements.multiplierDisplay.textContent = `${minesState.currentMultiplier.toFixed(2)}x`;
        }
        
        // Потенциальный выигрыш
        if (minesElements.potentialWin) {
            minesElements.potentialWin.textContent = minesState.potentialWin.toFixed(2);
        }
        
        // Количество алмазов
        if (minesElements.gemsCount) {
            minesElements.gemsCount.textContent = minesState.revealedCells.length;
        }
        
        // Seed hash
        if (minesElements.seedHash && minesState.serverSeedHash) {
            minesElements.seedHash.textContent = minesState.serverSeedHash.substring(0, 16) + '...';
        }
        
        // Блокировка инпутов во время игры
        if (minesElements.betInput) {
            minesElements.betInput.disabled = minesState.gameActive;
        }
        if (minesElements.minesSelect) {
            minesElements.minesSelect.disabled = minesState.gameActive;
        }
    }
    
    function updateMultiplierPreview() {
        // Превью множителя для первого хода
        const minesCount = minesState.minesCount;
        const safeCells = 25 - minesCount;
        const probability = safeCells / 25;
        const multiplier = (1 / probability) * 0.97;
        
        if (minesElements.multiplierDisplay && !minesState.gameActive) {
            minesElements.multiplierDisplay.textContent = `${multiplier.toFixed(2)}x`;
        }
    }
    
    function updateMinesCurrency() {
        const icon = document.getElementById('minesBetIcon');
        if (icon) {
            icon.src = window.state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
        }
        
        // Update revealed gem icons in grid
        const gemIcon = window.state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
        document.querySelectorAll('.mines-cell.revealed.gem img').forEach(img => {
            img.src = gemIcon;
        });
        
        updateMultiplierPreview();
    }
    
    // ==========================================
    // 🔧 УТИЛИТЫ
    // ==========================================
    
    function generateClientSeed() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }
    
    function showNotification(message, type) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
    
    // ==========================================
    // 📤 ЭКСПОРТ
    // ==========================================
    
    window.initMines = initMines;
    window.updateMinesCurrency = updateMinesCurrency;
    
    // Обработчик сообщений для liveUpdates.js
    window._minesMsgHandler = handleMinesMessage;

})();
