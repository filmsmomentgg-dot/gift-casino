/**
 * 🚀 CRASH GAME - Client
 * Синхронизируется с сервером через WebSocket
 * Все игроки видят одинаковый множитель
 */

// Ссылка на глобальный state из script.js
const getState = () => window.state || { balance: 0, starsBalance: 0, currentCurrency: 'ton' };

// Состояние игры (синхронизируется с сервером)
const crashState = {
    phase: 'waiting', // waiting, countdown, running, crashed
    multiplier: 1.00,
    countdown: 0,
    history: [],
    // Локальное состояние
    hasBet: false,
    betAmount: 0,
    oderId: 'user_' + Date.now(), // Уникальный ID пользователя
    // Canvas
    canvas: null,
    ctx: null,
    // Фоновые изображения
    bgImageIndex: 0,
    bgImageOpacity: 0,
    bgImageFadeIn: true,
    bgImageLastChange: 0
};

// Загрузка фоновых изображений
const bgImageSources = ['TON.png', 'stars.png'];
const loadedBgImages = [];

function loadBgImages() {
    bgImageSources.forEach((src, i) => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
            loadedBgImages[i] = img;
            console.log(`✅ Loaded bg image: ${src}`);
        };
    });
}

loadBgImages();

// DOM элементы
let crashElements = {};

// Инициализация
function initCrash() {
    crashElements = {
        section: document.getElementById('crashSection'),
        canvas: document.getElementById('crashCanvas'),
        multiplier: document.getElementById('crashMultiplier'),
        history: document.getElementById('crashHistory'),
        betInput: document.getElementById('crashBetAmount'),
        autoCashout: document.getElementById('autoCashout'),
        autoCashoutEnabled: document.getElementById('autoCashoutEnabled'),
        autoCashoutContainer: document.querySelector('.crash-auto-cashout'),
        btn: document.getElementById('crashBtn'),
        betIcon: document.getElementById('crashBetIcon')
    };
    
    if (!crashElements.canvas) {
        console.log('❌ Crash canvas not found');
        return;
    }
    
    // Инициализация canvas
    crashState.canvas = crashElements.canvas;
    crashState.ctx = crashState.canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Обработчик главной кнопки
    const crashBtn = document.getElementById('crashBtn');
    if (crashBtn) {
        let isProcessing = false;
        let lastTouchTime = 0;
        
        const handleClick = function(e) {
            // Защита от двойного клика
            if (isProcessing) return;
            isProcessing = true;
            
            // Сразу вызываем обработчик
            handleCrashBtn();
            
            // Разблокируем через 150ms
            setTimeout(() => {
                isProcessing = false;
            }, 150);
        };
        
        // Touch handler для мобильных
        crashBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            lastTouchTime = Date.now();
            handleClick(e);
        }, { passive: false });
        
        // Click handler для ПК
        crashBtn.addEventListener('click', function(e) {
            // Игнорируем click если был недавний touch (300ms)
            if (Date.now() - lastTouchTime < 300) return;
            handleClick(e);
        });
        
        // Mousedown для более быстрого отклика на ПК
        crashBtn.addEventListener('mousedown', function(e) {
            // Игнорируем если был недавний touch
            if (Date.now() - lastTouchTime < 300) return;
            // Визуальный feedback
            crashBtn.style.transform = 'scale(0.98)';
        });
        
        crashBtn.addEventListener('mouseup', function(e) {
            crashBtn.style.transform = '';
        });
        
        crashBtn.addEventListener('mouseleave', function(e) {
            crashBtn.style.transform = '';
        });
    }
    
    // Quick bet buttons
    document.querySelectorAll('.bet-quick').forEach(btn => {
        btn.addEventListener('click', () => {
            const mult = btn.dataset.mult;
            const action = btn.dataset.action;
            const input = crashElements.betInput;
            const balance = window.state.currentCurrency === 'ton' ? window.state.balance : window.state.starsBalance;
            
            if (action === 'max') {
                input.value = window.state.currentCurrency === 'ton' ? balance.toFixed(2) : Math.floor(balance);
            } else if (mult) {
                const newValue = parseFloat(input.value) * parseFloat(mult);
                input.value = window.state.currentCurrency === 'ton' ? newValue.toFixed(2) : Math.floor(newValue);
            }
        });
    });
    
    // Авто-вывод чекбокс
    if (crashElements.autoCashoutEnabled) {
        crashElements.autoCashoutEnabled.addEventListener('change', function() {
            if (this.checked) {
                crashElements.autoCashoutContainer?.classList.add('enabled');
            } else {
                crashElements.autoCashoutContainer?.classList.remove('enabled');
            }
        });
    }
    
    // Обновляем иконку валюты
    updateCrashCurrency();
    
    // Запускаем анимацию фона
    startBgAnimation();
    
    console.log('🚀 Crash game client initialized');
}

// Обработка сообщений от сервера
function handleCrashServerMessage(msg) {
    console.log('🎰 Crash server message:', msg.type);
    
    switch (msg.type) {
        case 'crash_state':
            // Начальное состояние
            crashState.phase = msg.data.phase;
            crashState.multiplier = msg.data.multiplier;
            crashState.countdown = msg.data.countdown || 0;
            crashState.history = msg.data.history || [];
            renderHistory();
            updateUI();
            break;
            
        case 'crash_waiting':
            crashState.phase = 'waiting';
            crashState.multiplier = 1.00;
            crashState.history = msg.history || crashState.history;
            crashState.hasBet = false;
            crashState.betAmount = 0;
            renderHistory();
            updateUI();
            break;
            
        case 'crash_countdown':
            crashState.phase = 'countdown';
            crashState.countdown = msg.countdown;
            updateUI();
            break;
            
        case 'crash_start':
            crashState.phase = 'running';
            crashState.multiplier = 1.00;
            updateUI();
            break;
            
        case 'crash_tick':
            crashState.multiplier = msg.multiplier;
            updateMultiplierDisplay();
            if (crashState.hasBet) {
                updateCashoutButton();
            }
            break;
            
        case 'crash_crashed':
            crashState.phase = 'crashed';
            crashState.multiplier = msg.crashPoint;
            crashState.history = msg.history || crashState.history;
            
            // Если у нас была ставка - мы проиграли
            if (crashState.hasBet) {
                showNotification(`💥 Краш на ${msg.crashPoint.toFixed(2)}x! Вы потеряли ${crashState.betAmount}`, 'error');
                crashState.hasBet = false;
                crashState.betAmount = 0;
                
                if (tg?.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('error');
                }
            }
            
            renderHistory();
            updateUI();
            break;
            
        case 'crash_bet_result':
            if (msg.success) {
                crashState.hasBet = true;
                showNotification(`Ставка ${crashState.betAmount} принята!`, 'success');
                updateUI();
            } else {
                showNotification(msg.error, 'error');
                // Возвращаем деньги
                if (window.state.currentCurrency === 'ton') {
                    window.state.balance += crashState.betAmount;
                } else {
                    window.state.starsBalance += crashState.betAmount;
                }
                if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
                crashState.hasBet = false;
                crashState.betAmount = 0;
            }
            break;
            
        case 'crash_cashout_result':
            console.log('💰 Cashout result:', msg);
            if (msg.success) {
                // Добавляем выигрыш в правильную валюту
                const winCurrency = msg.currency || window.state.currentCurrency;
                if (winCurrency === 'ton') {
                    window.state.balance += msg.amount;
                    console.log('💎 New TON balance:', window.state.balance);
                } else {
                    window.state.starsBalance += msg.amount;
                    console.log('⭐ New Stars balance:', window.state.starsBalance);
                }
                if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
                if (typeof saveBalance === 'function') saveBalance();
                
                showNotification(`🎉 Вы забрали ${msg.amount.toFixed(2)} на ${msg.multiplier.toFixed(2)}x!`, 'success');
                crashState.hasBet = false;
                crashState.betAmount = 0;
                updateUI();
                
                if (tg?.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }
            } else {
                showNotification(msg.error, 'error');
            }
            break;
        
        case 'crash_cashout':
            // Кто-то забрал выигрыш - показываем анимацию
            showCashoutAnimation(msg.nickname, msg.amount, msg.currency, msg.multiplier);
            
            // Если это наш авто-кешаут - обрабатываем как выигрыш
            // НО только если это АВТО (иначе получим дубль с crash_cashout_result)
            if (msg.oderId === crashState.oderId && crashState.hasBet && msg.isAutoCashout) {
                console.log('🎰 This is our auto-cashout!');
                const winCurrency = msg.currency || window.state.currentCurrency;
                if (winCurrency === 'ton') {
                    window.state.balance += msg.amount;
                } else {
                    window.state.starsBalance += msg.amount;
                }
                if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
                if (typeof saveBalance === 'function') saveBalance();
                
                showNotification(`🎉 Авто-вывод: ${msg.amount.toFixed(2)} на ${msg.multiplier.toFixed(2)}x!`, 'success');
                crashState.hasBet = false;
                crashState.betAmount = 0;
                updateUI();
                
                if (tg?.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }
            }
            break;
            
        case 'crash_cancel_result':
            // Отмена обработана
            break;
    }
}

// Обновление UI
function updateUI() {
    if (!crashElements.multiplier || !crashElements.btn) return;
    
    switch (crashState.phase) {
        case 'waiting':
            crashElements.multiplier.textContent = 'Ожидание ставок...';
            crashElements.multiplier.className = 'crash-multiplier waiting';
            
            if (crashState.hasBet) {
                // Нельзя отменить ставку - только ждать раунд
                crashElements.btn.textContent = 'Ждите...';
                crashElements.btn.className = 'crash-btn waiting';
                crashElements.btn.disabled = true;
            } else {
                crashElements.btn.textContent = 'Ставка';
                crashElements.btn.className = 'crash-btn';
                crashElements.btn.disabled = false;
            }
            break;
            
        case 'countdown':
            crashElements.multiplier.textContent = `Ожидание ставок... ${crashState.countdown}`;
            crashElements.multiplier.className = 'crash-multiplier waiting';
            
            if (crashState.hasBet) {
                // Во время отсчёта нельзя отменить или забрать
                crashElements.btn.textContent = 'Ждите...';
                crashElements.btn.className = 'crash-btn waiting';
                crashElements.btn.disabled = true;
            } else {
                crashElements.btn.textContent = 'Ставка';
                crashElements.btn.className = 'crash-btn';
                crashElements.btn.disabled = false;
            }
            break;
            
        case 'running':
            updateMultiplierDisplay();
            
            // Блокируем чекбокс авто-вывода когда игра идёт
            if (crashElements.autoCashoutEnabled) {
                crashElements.autoCashoutEnabled.disabled = true;
            }
            
            if (crashState.hasBet) {
                updateCashoutButton();
                crashElements.btn.disabled = false;
            } else {
                crashElements.btn.textContent = 'Ждите...';
                crashElements.btn.className = 'crash-btn waiting';
                crashElements.btn.disabled = true;
            }
            break;
            
        case 'crashed':
            crashElements.multiplier.textContent = `${crashState.multiplier.toFixed(2)}x`;
            crashElements.multiplier.className = 'crash-multiplier crashed';
            crashElements.multiplier.style.color = ''; // Сбрасываем inline стиль чтобы CSS класс работал
            crashElements.btn.textContent = 'Ждите...';
            crashElements.btn.className = 'crash-btn waiting';
            crashElements.btn.disabled = true;
            break;
    }
    
    // Блокируем чекбокс если есть активная ставка
    if (crashElements.autoCashoutEnabled) {
        crashElements.autoCashoutEnabled.disabled = crashState.hasBet;
    }
    
    drawGraph();
}

// Обновление отображения множителя
function updateMultiplierDisplay() {
    if (!crashElements.multiplier) return;
    
    crashElements.multiplier.textContent = `${crashState.multiplier.toFixed(2)}x`;
    crashElements.multiplier.className = 'crash-multiplier';
    
    // Меняем цвет в зависимости от множителя
    if (crashState.multiplier >= 5) {
        crashElements.multiplier.style.color = '#c77dff';
    } else if (crashState.multiplier >= 2) {
        crashElements.multiplier.style.color = '#00ff88';
    } else {
        crashElements.multiplier.style.color = '';
    }
}

// Кнопка "Забрать" с суммой
function updateCashoutButton() {
    if (!crashState.hasBet || !crashElements.btn) return;
    
    const potentialWin = crashState.betAmount * crashState.multiplier;
    const currencyIcon = window.state.currentCurrency === 'ton' ? '💎' : '⭐';
    
    crashElements.btn.innerHTML = `Забрать ${potentialWin.toFixed(2)} ${currencyIcon}`;
    crashElements.btn.className = 'crash-btn cashout';
}

// Анимация cashout
function showCashoutAnimation(nickname, amount, currency, multiplier) {
    const container = document.getElementById('crashCashoutAnimations');
    if (!container) return;
    
    const popup = document.createElement('div');
    popup.className = 'cashout-popup';
    
    // Случайная позиция по горизонтали
    const leftPos = 10 + Math.random() * 60; // 10% - 70%
    const bottomPos = 20 + Math.random() * 30; // 20% - 50%
    
    popup.style.left = `${leftPos}%`;
    popup.style.bottom = `${bottomPos}%`;
    
    const currencyIcon = currency === 'ton' ? 'TON.png' : 'stars.png';
    const formattedAmount = amount.toFixed(2);
    
    popup.innerHTML = `
        <img src="${currencyIcon}" class="cashout-star" alt="">
        <span class="cashout-nick">@${nickname}</span>
        <span class="cashout-amount">+${formattedAmount}</span>
    `;
    
    container.appendChild(popup);
    
    // Удаляем через 4 секунды
    setTimeout(() => {
        popup.remove();
    }, 4000);
}

// Обработка нажатия кнопки
function handleCrashBtn() {
    console.log('🎮 Crash btn clicked, phase:', crashState.phase, 'hasBet:', crashState.hasBet, 'disabled:', crashElements.btn?.disabled);
    
    // Проверяем что кнопка не заблокирована
    if (crashElements.btn?.disabled) {
        console.log('❌ Button is disabled');
        return;
    }
    
    if (crashState.hasBet) {
        if (crashState.phase === 'running') {
            console.log('✅ Calling cashout...');
            cashout();
        } else {
            console.log('❌ Phase is not running:', crashState.phase);
        }
    } else {
        console.log('✅ Placing bet...');
        placeBet();
    }
}

// Размещение ставки
function placeBet() {
    if (crashState.phase !== 'waiting' && crashState.phase !== 'countdown') {
        showNotification('Подождите новый раунд', 'error');
        return;
    }
    
    const betAmount = parseFloat(crashElements.betInput.value) || 0;
    
    // Проверяем чекбокс авто-вывода
    const checkbox = document.getElementById('autoCashoutEnabled');
    const autoCashoutEnabled = checkbox ? checkbox.checked : false;
    const autoCashoutValue = parseFloat(crashElements.autoCashout?.value) || 0;
    
    // Авто-вывод только если галочка включена И значение больше 1
    let autoCashout = 0;
    if (autoCashoutEnabled === true && autoCashoutValue > 1) {
        autoCashout = autoCashoutValue;
    }
    
    console.log('📊 Bet params:', { 
        betAmount, 
        checkboxExists: !!checkbox,
        autoCashoutEnabled, 
        autoCashoutValue, 
        finalAutoCashout: autoCashout 
    });
    
    // Минимальные ставки
    const minBet = window.state.currentCurrency === 'ton' ? 0.10 : 20;
    const balance = window.state.currentCurrency === 'ton' ? window.state.balance : window.state.starsBalance;
    const currencyName = window.state.currentCurrency === 'ton' ? 'TON' : 'Stars';
    
    if (betAmount < minBet) {
        showNotification(`Минимальная ставка: ${minBet} ${currencyName}`, 'error');
        return;
    }
    
    // Проверяем что баланс положительный И достаточный
    if (balance <= 0 || betAmount > balance) {
        showNotification('Недостаточно средств!', 'error');
        return;
    }
    
    // Списываем ставку сразу (откатим если сервер откажет)
    if (window.state.currentCurrency === 'ton') {
        window.state.balance -= betAmount;
    } else {
        window.state.starsBalance -= betAmount;
    }
    if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
    if (typeof saveBalance === 'function') saveBalance();
    
    crashState.betAmount = betAmount;
    
    // Отправляем на сервер
    if (window.liveWs && window.liveWs.readyState === 1) {
        const nickname = window.Telegram?.WebApp?.initDataUnsafe?.user?.username || 'Игрок';
        window.liveWs.send(JSON.stringify({
            type: 'crash_bet',
            oderId: crashState.oderId,
            amount: betAmount,
            currency: window.state.currentCurrency,
            autoCashout: autoCashout > 1 ? autoCashout : 0,
            nickname: nickname
        }));
    }
    
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
}

// Забрать выигрыш
function cashout() {
    console.log('💰 Cashout called, hasBet:', crashState.hasBet, 'phase:', crashState.phase);
    
    if (!crashState.hasBet) {
        console.log('❌ No bet to cashout');
        return;
    }
    if (crashState.phase !== 'running') {
        console.log('❌ Game not running');
        return;
    }
    
    console.log('✅ Sending cashout request');
    if (window.liveWs && window.liveWs.readyState === 1) {
        window.liveWs.send(JSON.stringify({
            type: 'crash_cashout',
            oderId: crashState.oderId
        }));
        console.log('✅ Cashout request sent');
    } else {
        console.log('❌ WebSocket not connected');
    }
}

// Отмена ставки
function cancelBet() {
    if (!crashState.hasBet || crashState.phase !== 'waiting') return;
    
    // Возвращаем деньги
    if (window.state.currentCurrency === 'ton') {
        window.state.balance += crashState.betAmount;
    } else {
        window.state.starsBalance += crashState.betAmount;
    }
    if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
    if (typeof saveBalance === 'function') saveBalance();
    
    crashState.hasBet = false;
    crashState.betAmount = 0;
    updateUI();
    
    // Отправляем на сервер
    if (window.liveWs && window.liveWs.readyState === 1) {
        window.liveWs.send(JSON.stringify({
            type: 'crash_cancel',
            oderId: crashState.oderId
        }));
    }
    
    showNotification('Ставка отменена', 'info');
}

// Рендер истории
function renderHistory() {
    if (!crashElements.history) return;
    
    crashElements.history.innerHTML = crashState.history
        .slice(-15)
        .reverse()
        .map(mult => {
            let colorClass = 'red';
            if (mult >= 10) colorClass = 'purple';
            else if (mult >= 2) colorClass = 'green';
            return `<div class="crash-history-item ${colorClass}">${mult.toFixed(2)}x</div>`;
        })
        .join('');
}

// Анимация фона
let bgAnimationFrame = null;
function startBgAnimation() {
    function animateBg() {
        if (crashState.canvas && crashState.canvas.width > 0) {
            drawGraph();
        }
        bgAnimationFrame = requestAnimationFrame(animateBg);
    }
    animateBg();
}

function resizeCanvas() {
    if (!crashState.canvas) return;
    const parent = crashState.canvas.parentElement;
    if (!parent) return;
    
    const rect = parent.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 400;
    const height = rect.height > 0 ? rect.height : 280;
    
    crashState.canvas.width = width;
    crashState.canvas.height = height;
    
    drawGraph();
}

// Обновление валюты
function updateCrashCurrency() {
    if (crashElements.betIcon) {
        crashElements.betIcon.src = window.state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
    }
    if (crashElements.betInput) {
        if (window.state.currentCurrency === 'ton') {
            crashElements.betInput.min = '0.1';
            crashElements.betInput.step = '0.1';
            crashElements.betInput.value = '0.10';
        } else {
            crashElements.betInput.min = '20';
            crashElements.betInput.step = '1';
            crashElements.betInput.value = '20';
        }
    }
}

// 🎨 Рисование фоновой картинки
function drawBgImage(ctx, width, height) {
    const now = Date.now();
    const fadeSpeed = 0.015;
    const displayTime = 2000;
    const maxOpacity = 0.25;
    
    if (loadedBgImages.length === 0) return;
    
    if (crashState.bgImageFadeIn) {
        crashState.bgImageOpacity += fadeSpeed;
        if (crashState.bgImageOpacity >= maxOpacity) {
            crashState.bgImageOpacity = maxOpacity;
            crashState.bgImageFadeIn = false;
            crashState.bgImageLastChange = now;
        }
    } else {
        if (now - crashState.bgImageLastChange > displayTime) {
            crashState.bgImageOpacity -= fadeSpeed;
            if (crashState.bgImageOpacity <= 0) {
                crashState.bgImageOpacity = 0;
                crashState.bgImageFadeIn = true;
                crashState.bgImageIndex = (crashState.bgImageIndex + 1) % loadedBgImages.length;
            }
        }
    }
    
    const currentImg = loadedBgImages[crashState.bgImageIndex];
    if (!currentImg) return;
    
    ctx.save();
    ctx.globalAlpha = crashState.bgImageOpacity;
    
    const imgSize = Math.min(width, height) * 0.5;
    const x = (width - imgSize) / 2;
    const y = (height - imgSize) / 2;
    
    ctx.drawImage(currentImg, x, y, imgSize, imgSize);
    ctx.restore();
}

// 🎨 Рисование графика
function drawGraph() {
    const ctx = crashState.ctx;
    const canvas = crashState.canvas;
    if (!ctx || !canvas) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Очищаем
    ctx.clearRect(0, 0, width, height);
    
    // Фон
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(26, 13, 46, 0.95)');
    gradient.addColorStop(1, 'rgba(15, 52, 96, 0.95)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Сетка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < 10; i++) {
        const y = (height / 10) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    for (let i = 0; i < 10; i++) {
        const x = (width / 10) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Фоновая картинка
    drawBgImage(ctx, width, height);
}

// Экспортируем
window.initCrash = initCrash;
window.updateCrashCurrency = updateCrashCurrency;
window.handleCrashServerMessage = handleCrashServerMessage;
