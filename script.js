// 🎮 Telegram Mini App - Main Menu Logic

// API Configuration - Auto-detect production/development
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin;

// Initialize Telegram Web App
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
}

// State Management
const state = {
    balance: 1000,
    starsBalance: 100000,
    soundEnabled: true,
    gifts: [],
    collections: {},
    exchangeRate: null, // TON to Stars rate
    currentCurrency: 'ton',
    inventory: [] // Выигранные подарки
};

// 🎰 Данные кейсов (глобально)
const caseData = {
    lucky: {
        name: '🍀 Lucky',
        price: 0.5,
        image: null,
        emoji: '🍀',
        index: 4  // Самые дешёвые подарки
    },
    classic: {
        name: '🎲 Classic',
        price: 1,
        image: null,
        emoji: '🎲',
        index: 3
    },
    premium: {
        name: '💎 Premium',
        price: 2,
        image: null,
        emoji: '💎',
        index: 2
    },
    royal: {
        name: '👑 Royal',
        price: 5,
        image: 'case2.png',
        emoji: '👑',
        index: 1
    },
    pepe: {
        name: '🐸 PEPE',
        price: 10,
        image: 'case1.png',
        emoji: '🐸',
        index: 0  // Самые дорогие подарки (Plush Pepe)
    }
};

// Текущий выбранный кейс (по умолчанию PEPE)
window.currentCase = caseData.pepe;

// 🎒 Load inventory from localStorage
function loadInventory() {
    try {
        const saved = localStorage.getItem('giftInventory');
        if (saved) {
            state.inventory = JSON.parse(saved);
            console.log(`🎒 Loaded ${state.inventory.length} items from inventory`);
        }
    } catch (e) {
        console.error('Failed to load inventory:', e);
    }
}

// 🎒 Save inventory to localStorage
function saveInventory() {
    try {
        localStorage.setItem('giftInventory', JSON.stringify(state.inventory));
    } catch (e) {
        console.error('Failed to save inventory:', e);
    }
}

// 🎒 Add item to inventory
function addToInventory(item) {
    const inventoryItem = {
        id: Date.now(),
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
        emoji: item.emoji,
        rarity: item.rarity,
        wonAt: new Date().toISOString()
    };
    state.inventory.push(inventoryItem);
    saveInventory();
    updateInventoryBadge();
    console.log(`🎒 Added to inventory: ${item.name}`);
}

// 🎒 Sell item from inventory - СЕРВЕРНАЯ ВЕРСИЯ
// Защита от быстрых кликов
const sellLock = new Set();

async function sellFromInventory(itemId) {
    // Защита от двойного клика
    if (sellLock.has(itemId)) {
        console.log('⏳ Already selling this item...');
        return false;
    }
    
    const index = state.inventory.findIndex(i => i.id === itemId);
    if (index === -1) {
        showNotification('❌ Предмет не найден');
        return false;
    }
    
    // Блокируем этот айтем
    sellLock.add(itemId);
    
    const item = state.inventory[index];
    
    try {
        // 🔒 Продаём через сервер
        if (window.secureAPI) {
            console.log(`💰 Selling item ${itemId} via server...`);
            const response = await window.secureAPI.sellItem(itemId, state.currentCurrency);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to sell');
            }
            
            // Обновляем баланс из серверного ответа
            const newBalance = response.balance[state.currentCurrency];
            if (state.currentCurrency === 'stars') {
                state.starsBalance = newBalance;
            } else {
                state.balance = newBalance;
            }
            updateBalanceDisplay();
            
            // Удаляем из локального инвентаря
            state.inventory.splice(index, 1);
            
            const currencyName = state.currentCurrency === 'stars' ? '⭐' : 'TON';
            showNotification(`💰 Продано: ${item.name} (+${response.soldItem.sellPrice} ${currencyName})`);
            
        } else {
            // Fallback для разработки без сервера
            const rate = state.exchangeRate?.starsPerTon || 81;
            let sellPrice = Math.floor(item.price * 0.85); // 85% - комиссия казино
            if (state.currentCurrency === 'stars') {
                sellPrice = Math.round(sellPrice * rate);
            }
            
            state.inventory.splice(index, 1);
            saveInventory();
            updateBalance(sellPrice);
            
            const currencyName = state.currentCurrency === 'stars' ? '⭐' : 'TON';
            showNotification(`💰 Продано: ${item.name} (+${sellPrice} ${currencyName})`);
        }
        
        // Update UI
        updateInventoryBadge();
        updateInventoryDisplay();
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Sell error:', error);
        showNotification(`❌ Ошибка продажи: ${error.message}`);
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
        
        return false;
        
    } finally {
        // Разблокируем через небольшую задержку
        setTimeout(() => sellLock.delete(itemId), 100);
    }
}

// 🎒 Update inventory badge count
function updateInventoryBadge() {
    const badge = document.getElementById('inventoryBadge');
    if (badge) {
        const count = state.inventory.length;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// 🎒 Update inventory display
function updateInventoryDisplay() {
    const container = document.getElementById('inventoryItems');
    const emptyMsg = document.getElementById('inventoryEmpty');
    
    if (!container) return;
    
    if (state.inventory.length === 0) {
        container.innerHTML = '';
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }
    
    if (emptyMsg) emptyMsg.style.display = 'none';
    
    const rate = state.exchangeRate?.starsPerTon || 81;
    const iconSrc = state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
    
    container.innerHTML = state.inventory.map(item => {
        const displayPrice = state.currentCurrency === 'stars' 
            ? Math.round(item.price * rate) 
            : item.price;
        
        return `
            <div class="inventory-item" data-id="${item.id}">
                <div class="inventory-item-image">
                    ${item.imageUrl 
                        ? `<img src="${item.imageUrl}" alt="${item.name}">` 
                        : `<span class="inventory-emoji">${item.emoji || '🎁'}</span>`
                    }
                </div>
                <div class="inventory-item-info">
                    <div class="inventory-item-name">${item.name}</div>
                    <div class="inventory-item-price">
                        <img src="${iconSrc}" alt="" class="inventory-price-icon">
                        <span>${displayPrice}</span>
                    </div>
                </div>
                <button class="inventory-sell-btn" onclick="sellFromInventory(${item.id})">
                    💰 Продать
                </button>
            </div>
        `;
    }).join('');
}

// 🎒 Show/Hide inventory modal
function toggleInventory(show) {
    const modal = document.getElementById('inventoryModal');
    if (modal) {
        if (show) {
            updateInventoryDisplay();
            modal.classList.add('show');
        } else {
            modal.classList.remove('show');
        }
    }
}

// DOM Elements
const elements = {
    balanceAmount: document.getElementById('balanceAmount')
};

// 💱 Load Exchange Rates from API
async function loadExchangeRates() {
    try {
        console.log('💱 Loading exchange rates...');
        const response = await fetch(`${API_BASE}/api/rates`);
        const result = await response.json();
        
        if (result.success && result.data) {
            // API returns tonToStars, map it to starsPerTon for consistency
            state.exchangeRate = {
                starsPerTon: result.data.tonToStars,
                tonToUsd: result.data.tonToUsd,
                lastUpdate: result.data.lastUpdate
            };
            console.log(`✅ Exchange rate loaded: 1 TON = ${result.data.tonToStars.toFixed(1)} Stars`);
            updateRateDisplay();
            return state.exchangeRate;
        }
    } catch (error) {
        console.error('❌ Failed to load exchange rates:', error);
    }
    return null;
}

// 💱 Update Rate Display in Header
function updateRateDisplay() {
    const rateDisplay = document.getElementById('rateDisplay');
    if (!rateDisplay || !state.exchangeRate) return;
    
    const rate = state.exchangeRate.starsPerTon;
    rateDisplay.innerHTML = `
        <span class="rate-icon">💱</span>
        <span class="rate-text">1 TON = ${rate.toFixed(0)} ⭐</span>
    `;
    rateDisplay.style.display = 'flex';
}

// 💰 Convert price based on current currency
function convertPrice(tonPrice) {
    if (state.currentCurrency === 'stars' && state.exchangeRate) {
        return Math.round(tonPrice * state.exchangeRate.starsPerTon);
    }
    return tonPrice;
}

// 💰 Format price display
function formatPriceDisplay(tonPrice) {
    const price = convertPrice(tonPrice);
    const icon = state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
    const alt = state.currentCurrency === 'ton' ? 'TON' : 'Stars';
    return { price, icon, alt };
}

// 💱 Update all prices when currency changes
function updateAllPrices(currency) {
    const rate = state.exchangeRate?.starsPerTon || 81;
    const iconSrc = currency === 'ton' ? 'TON.png' : 'stars.png';
    // Обновляем цены на всех кейсах
    document.querySelectorAll('.case-card').forEach(card => {
        const priceEl = card.querySelector('.case-price-amount');
        const basePrice = parseFloat(card.dataset.price || '0');
        if (priceEl) {
            priceEl.textContent = currency === 'stars' ? Math.round(basePrice * rate) : basePrice;
        }
        const icon = card.querySelector('.case-price-icon');
        if (icon) {
            icon.src = iconSrc;
            icon.alt = currency === 'ton' ? 'TON' : 'Stars';
        }
    });
    // Если открыта модалка — обновить цену в ней
    const openCaseBtn = document.getElementById('openCaseBtn');
    if (openCaseBtn && window.currentCase) {
        const price = currency === 'stars' ? Math.round(window.currentCase.price * rate) : window.currentCase.price;
        const icon = iconSrc;
        openCaseBtn.innerHTML = `
            <span>Открыть за</span>
            <img src="${icon}" alt="Currency" class="case-price-icon">
            <span>${price}</span>
        `;
    }
    // Обновляем цены у всех айтемов в кейсах
    const itemPrices = document.querySelectorAll('.case-item .item-price');
    itemPrices.forEach(priceEl => {
        const item = priceEl.closest('.case-item');
        // Берём оригинальную цену из data-original-price или из текста (один раз при инициализации)
        let originalPrice = parseFloat(item?.dataset.originalPrice);
        if (!originalPrice) {
            // Если нет data-original-price, инициализируем его
            const priceText = priceEl.textContent.replace(/[^\d.]/g, '');
            originalPrice = parseFloat(priceText) || 0;
            item.dataset.originalPrice = originalPrice;
        }
        if (originalPrice > 0) {
            const icon = priceEl.querySelector('.item-price-icon');
            if (icon) {
                icon.src = iconSrc;
                icon.alt = currency === 'ton' ? 'TON' : 'Stars';
            }
            // Оставляем только иконку и цену
            priceEl.innerHTML = `<img src="${iconSrc}" alt="${currency === 'ton' ? 'TON' : 'Stars'}" class="item-price-icon">${currency === 'stars' ? Math.round(originalPrice * rate) : originalPrice}`;
        }
    });
}

// 🎁 Load Gifts from API
async function loadGifts() {
    try {
        console.log('🔄 Loading gifts from API...');
        const response = await fetch(`${API_BASE}/api/gifts?limit=100`);
        const result = await response.json();
        
        if (result.success && result.data) {
            state.gifts = result.data;
            console.log(`✅ Loaded ${result.data.length} gifts from Fragment.com`);
            
            // Group by collection
            state.collections = {};
            result.data.forEach(gift => {
                if (!state.collections[gift.collection]) {
                    state.collections[gift.collection] = [];
                }
                state.collections[gift.collection].push(gift);
            });
            
            // Update UI
            updateGiftsDisplay();
            return result.data;
        }
    } catch (error) {
        console.error('❌ Failed to load gifts:', error);
    }
    return [];
}

// 🎁 Update Gifts Display - Кейс с ценами зависящими от стоимости кейса
// 3 дорогих (30-50 TON, НЕ выпадают) + 5 средних + 10 дешёвых (цены зависят от кейса)
function updateGiftsDisplay() {
    const caseItemsContainer = document.querySelector('.case-items');
    if (!caseItemsContainer || state.gifts.length === 0) return;
    
    // Получаем цену и индекс текущего кейса
    const casePrice = window.currentCase?.price || 0.5;
    const caseIndex = window.currentCase?.index || 0;
    const caseName = window.currentCase?.name || 'Lucky';
    
    // Фильтруем подарки по коллекции в зависимости от кейса
    // PEPE (index 0) = plushpepe
    // Остальные кейсы = heartlocket + bdaycandle (смешиваем)
    let filteredGifts;
    if (caseIndex === 0) {
        // PEPE - только Plush Pepe
        filteredGifts = state.gifts.filter(g => g.collection === 'plushpepe' && g.price > 0);
    } else {
        // Другие кейсы - heartlocket и bdaycandle
        const otherGifts = state.gifts.filter(g => 
            (g.collection === 'heartlocket' || g.collection === 'bdaycandle') && g.price > 0
        );
        // Для каждого кейса берём разные подарки с offset
        const offsetPerCase = 18;
        const startIdx = (caseIndex - 1) * offsetPerCase;
        filteredGifts = [];
        for (let i = 0; i < 18; i++) {
            const idx = (startIdx + i) % otherGifts.length;
            filteredGifts.push(otherGifts[idx]);
        }
    }
    
    // Сортируем по цене (для визуала)
    const sortedGifts = [...filteredGifts].sort((a, b) => b.price - a.price);
    
    if (sortedGifts.length < 18) {
        console.warn('⚠️ Недостаточно подарков для кейса:', sortedGifts.length);
        return;
    }
    
    // Функция для получения подарка
    const getGift = (index) => sortedGifts[index % sortedGifts.length];
    
    // 🏆 3 ДОРОГИХ - 30-50 TON (НЕ выпадают, для приманки)
    const topGifts = [getGift(0), getGift(1), getGift(2)];
    const topPrices = [50, 40, 30];
    
    // 💎 5 СРЕДНИХ и 🗑️ 10 ДЕШЁВЫХ - цены зависят от цены кейса!
    const midGifts = [getGift(3), getGift(4), getGift(5), getGift(6), getGift(7)];
    const trashGifts = [];
    for (let i = 0; i < 10; i++) {
        trashGifts.push(getGift(8 + i));
    }
    
    // Средние подарки - ВЫШЕ цены кейса (редкие, выпадают редко)
    // +150%, +100%, +50%, +25%, +25%
    // Для PEPE (10 TON): 25, 20, 15, 12.5, 12.5 TON
    // Для Lucky (0.5 TON): 1.25, 1, 0.75, 0.625, 0.625 TON
    const midPrices = [
        casePrice * 2.5,      // +150%: 25, 12.5, 5, 2.5, 1.25
        casePrice * 2.0,      // +100%: 20, 10, 4, 2, 1
        casePrice * 1.5,      // +50%: 15, 7.5, 3, 1.5, 0.75
        casePrice * 1.25,     // +25%: 12.5, 6.25, 2.5, 1.25, 0.625
        casePrice * 1.25      // +25%: 12.5, 6.25, 2.5, 1.25, 0.625
    ];
    
    // Дешёвые подарки - НИЖЕ цены кейса (частые, выпадают часто)
    // От 90% до 10% от цены кейса
    // Для PEPE (10 TON): 9, 8, 7, 6, 5, 4, 3, 2, 1.5, 1 TON
    // Для Lucky (0.5 TON): 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.075, 0.05 TON
    const trashPrices = [
        casePrice * 0.9,      // 90%
        casePrice * 0.8,      // 80%
        casePrice * 0.7,      // 70%
        casePrice * 0.6,      // 60%
        casePrice * 0.5,      // 50%
        casePrice * 0.4,      // 40%
        casePrice * 0.3,      // 30%
        casePrice * 0.2,      // 20%
        casePrice * 0.15,     // 15%
        casePrice * 0.1       // 10%
    ];
    
    // Создаём HTML
    const createGiftHTML = (gift, rarity, dropRate, displayPrice) => {
        const imageUrl = `https://nft.fragment.com/gift/${gift.slug}.medium.jpg`;
        // Форматируем цену для отображения (округляем до 2 знаков)
        const roundedPrice = Math.round(displayPrice * 100) / 100;
        const formattedPrice = roundedPrice >= 1000 ? `${(roundedPrice / 1000).toFixed(1)}K` : roundedPrice;
        // Форматируем шанс - округляем красиво!
        let formattedDropRate;
        if (dropRate === '0' || dropRate === 0) {
            formattedDropRate = '0.1';
        } else if (dropRate < 0.01) {
            formattedDropRate = dropRate.toFixed(4);
        } else if (dropRate < 1) {
            formattedDropRate = dropRate.toFixed(2);
        } else {
            formattedDropRate = Math.round(dropRate * 10) / 10;
        }
        // Сохраняем оригинальную цену для рулетки
        const originalPrice = typeof displayPrice === 'number' ? roundedPrice : gift.price;
        return `
            <div class="case-item" data-rarity="${rarity}" data-droprate="${dropRate}" data-gift-id="${gift.id}" data-original-price="${originalPrice}">
                <div class="item-price">
                    <img src="TON.png" alt="TON" class="item-price-icon">${formattedPrice}
                </div>
                <img src="${imageUrl}" alt="${gift.name}" class="item-image" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <span class="item-emoji" style="display:none">${getCollectionEmoji(gift.collection)}</span>
                <div class="item-info">
                    <span class="item-name">${gift.name}</span>
                </div>
                <span class="item-rarity ${rarity}">${formattedDropRate}%</span>
            </div>
        `;
    };
    
    let giftsHTML = '';
    
    // 📊 Множитель шансов зависит от цены кейса
    // PEPE (10 TON) = 1.0, Royal (5) = 0.5, Premium (2) = 0.2, Classic (1) = 0.1, Lucky (0.5) = 0.05
    const chanceMultiplier = casePrice / 10;
    
    // 🏆 Дорогие - УЛЬТРА редкие (30-50 TON) - шанс зависит от кейса!
    // PEPE: 0.1%, 0.15%, 0.2% | Lucky: 0.01%, 0.015%, 0.02%
    const baseTopDropRates = [0.1, 0.15, 0.2];
    const topDropRates = baseTopDropRates.map(rate => Math.max(0.01, rate * chanceMultiplier));
    topGifts.forEach((gift, i) => {
        giftsHTML += createGiftHTML(gift, 'legendary', topDropRates[i], topPrices[i]);
    });
    
    // 💎 Средние - редкие - в дешёвых кейсах тоже норм шансы (чтобы пролетали чаще!)
    // PEPE: 2%, 3%, 4%, 5%, 6% | Lucky: 1%, 1.5%, 2%, 2.5%, 3% (минимум 50% от базы)
    const baseMidDropRates = [2, 3, 4, 5, 6];
    const midMultiplier = Math.max(0.5, chanceMultiplier); // Минимум 0.5 для средних
    const midDropRates = baseMidDropRates.map(rate => rate * midMultiplier);
    midGifts.forEach((gift, i) => {
        giftsHTML += createGiftHTML(gift, 'ultra-rare', midDropRates[i], midPrices[i]);
    });
    
    // 🗑️ Дешёвые - частые (одинаковые шансы для всех кейсов)
    const trashDropRates = [5, 6, 7, 8, 9, 10, 11, 12, 14, 17];
    trashGifts.forEach((gift, i) => {
        giftsHTML += createGiftHTML(gift, 'common', trashDropRates[i], trashPrices[i]);
    });
    
    caseItemsContainer.innerHTML = giftsHTML;
    const collection = caseIndex === 0 ? 'plushpepe' : 'heartlocket+bdaycandle';
    console.log(`🎨 Case ${caseName} (${casePrice} TON, x${chanceMultiplier.toFixed(2)}): ${collection}`);
}

// 🎨 Helper Functions
function getRarity(price) {
    if (price >= 10000) return 'impossible';
    if (price >= 5000) return 'ultra-rare';
    if (price >= 1000) return 'rare';
    if (price >= 100) return 'uncommon';
    return 'common';
}

function getDropRate(price) {
    if (price >= 10000) return '0.001';
    if (price >= 5000) return '0.5';
    if (price >= 1000) return '2';
    if (price >= 100) return '10';
    return '20';
}

function getCollectionEmoji(collection) {
    const emojis = {
        'plushpepe': '🐸',
        'heartlocket': '💖',
        'bdaycandle': '🕯️',
        'berrybox': '🍓',
        'candycane': '🍬',
        'default': '🎁'
    };
    return emojis[collection] || emojis.default;
}

function formatPrice(price) {
    if (price >= 1000) {
        return (price / 1000).toFixed(1) + 'K';
    }
    return price.toFixed(price < 10 ? 2 : 0);
}

// 🎯 Initialize App
async function initApp() {
    // Load inventory from localStorage (fallback until server sync)
    loadInventory();
    updateInventoryBadge();
    
    // Setup event listeners
    setupEventListeners();
    setupInventoryListeners();
    
    // Load exchange rates first
    await loadExchangeRates();
    
    // 🔒 Загружаем баланс с СЕРВЕРА (безопасно)
    await loadBalanceFromServer();
    
    // Load gifts from backend for UI display
    await loadGifts();
    
    // Загружаем инвентарь с сервера
    await loadInventoryFromServer();
}

// 🔒 Загрузка баланса с сервера
async function loadBalanceFromServer() {
    try {
        console.log('💰 Loading balance from server...');
        
        if (!window.secureAPI) {
            console.warn('⚠️ SecureAPI not available, using fallback');
            loadBalance(); // fallback на localStorage
            updateBalanceDisplay();
            return;
        }
        
        const response = await window.secureAPI.getBalance();
        
        if (response.success && response.data) {
            state.starsBalance = response.data.stars || 0;
            state.balance = response.data.ton || 0;
            console.log(`✅ Balance loaded: ${state.starsBalance} Stars, ${state.balance} TON`);
        } else {
            console.warn('⚠️ Server balance failed, using fallback');
            loadBalance();
        }
    } catch (error) {
        console.error('❌ Failed to load balance from server:', error);
        // Fallback на localStorage для разработки
        loadBalance();
    }
    
    updateBalanceDisplay();
}

// 🔒 Загрузка инвентаря с сервера
async function loadInventoryFromServer() {
    try {
        console.log('🎒 Loading inventory from server...');
        
        if (!window.secureAPI) {
            console.warn('⚠️ SecureAPI not available');
            return;
        }
        
        const response = await window.secureAPI.getInventory();
        
        if (response.success && response.data) {
            // Преобразуем серверный формат в клиентский
            state.inventory = response.data.map(item => ({
                id: item.id,
                name: item.item_name,
                price: item.item_price,
                imageUrl: item.item_image,
                collection: item.item_collection,
                wonAt: item.won_at,
                source: item.source
            }));
            
            updateInventoryBadge();
            console.log(`✅ Inventory loaded: ${state.inventory.length} items`);
        }
    } catch (error) {
        console.error('❌ Failed to load inventory from server:', error);
    }
}

// 🔄 Функция для обновления кнопки открытия кейса
function updateOpenCaseBtn() {
    const openBtn = document.getElementById('openCaseBtn');
    if (!openBtn || !window.currentCase) return;
    
    const baseTonPrice = window.currentCase.price;
    const rate = state.exchangeRate?.starsPerTon || 81;
    const displayPrice = state.currentCurrency === 'stars' 
        ? Math.round(baseTonPrice * rate) 
        : baseTonPrice;
    const icon = state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
    
    openBtn.innerHTML = `
        <span class="btn-icon">🎰</span>
        <span class="btn-text">Открыть за</span>
        <img src="${icon}" alt="" class="btn-currency-icon">
        <span class="btn-price">${displayPrice}</span>
    `;
    openBtn.disabled = false;
}

// 🎒 Setup inventory event listeners
function setupInventoryListeners() {
    // Footer inventory button
    const inventoryBtn = document.querySelector('.footer-btn:nth-child(2)');
    if (inventoryBtn) {
        inventoryBtn.addEventListener('click', () => {
            toggleInventory(true);
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }
        });
    }
    
    // Close inventory modal
    const closeBtn = document.getElementById('inventoryClose');
    const overlay = document.getElementById('inventoryOverlay');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => toggleInventory(false));
    }
    if (overlay) {
        overlay.addEventListener('click', () => toggleInventory(false));
    }
}

// 💰 Balance Animation
function animateBalance() {
    if (!elements.balanceAmount) return;
    
    const target = 1250;
    const duration = 2000;
    const increment = target / (duration / 16);
    let current = 0;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        elements.balanceAmount.textContent = Math.floor(current).toLocaleString();
        state.balance = Math.floor(current);
    }, 16);
}

function updateBalance(amount) {
    // Определяем какой баланс обновлять
    const isStars = state.currentCurrency === 'stars';
    const currentBalanceValue = isStars ? state.starsBalance : state.balance;
    const newBalance = currentBalanceValue + amount;
    
    // Не позволяем уйти в минус
    if (newBalance < 0) {
        showNotification('❌ Недостаточно средств!');
        return false;
    }
    
    // ⚡ СРАЗУ обновляем реальный баланс (до анимации!)
    if (isStars) {
        state.starsBalance = newBalance;
    } else {
        state.balance = newBalance;
    }
    
    // Сохраняем сразу
    saveBalance();
    
    // Анимация только для отображения (читаем текущее значение из DOM)
    const displayEl = elements.balanceAmount;
    if (displayEl) {
        const displayedValue = parseFloat(displayEl.textContent.replace(/[,\s]/g, '')) || currentBalanceValue;
        const duration = 500; // Быстрее анимация
        const startTime = Date.now();
        
        // Отменяем предыдущую анимацию если есть
        if (window._balanceAnimationId) {
            cancelAnimationFrame(window._balanceAnimationId);
        }
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Easing
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const current = displayedValue + (newBalance - displayedValue) * easeProgress;
            
            displayEl.textContent = Math.floor(current).toLocaleString();
            
            if (progress < 1) {
                window._balanceAnimationId = requestAnimationFrame(animate);
            } else {
                displayEl.textContent = Math.floor(newBalance).toLocaleString();
            }
        };
        
        window._balanceAnimationId = requestAnimationFrame(animate);
    }
    
    // Haptic feedback if available
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }
    
    return true;
}

// � Сохранение баланса в localStorage
function saveBalance() {
    try {
        localStorage.setItem('tonBalance', state.balance.toString());
        localStorage.setItem('starsBalance', state.starsBalance.toString());
    } catch (e) {
        console.error('Failed to save balance:', e);
    }
}

// 📊 Загрузка баланса из localStorage
function loadBalance() {
    try {
        const tonBalance = localStorage.getItem('tonBalance');
        const starsBalance = localStorage.getItem('starsBalance');
        if (tonBalance) state.balance = parseFloat(tonBalance);
        if (starsBalance) state.starsBalance = parseFloat(starsBalance);
    } catch (e) {
        console.error('Failed to load balance:', e);
    }
}

// 🔄 Обновление отображения баланса
function updateBalanceDisplay() {
    if (!elements.balanceAmount) return;
    
    const balance = state.currentCurrency === 'ton' ? state.balance : state.starsBalance;
    let formatted;
    
    if (state.currentCurrency === 'ton') {
        // Для TON: показываем без .00 если целое число
        if (balance % 1 === 0) {
            formatted = Math.floor(balance).toLocaleString();
        } else {
            formatted = balance.toFixed(2);
        }
    } else {
        // Для Stars: целое число с разделителями
        formatted = Math.floor(balance).toLocaleString();
    }
    
    elements.balanceAmount.textContent = formatted;
}

// �📢 Notification System
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(-50%) translateY(0)';
        notification.style.opacity = '1';
    }, 10);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(-50%) translateY(-100px)';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 🎯 Event Listeners
function setupEventListeners() {
    // Currency selector
    const headerBalance = document.getElementById('headerBalance');
    const currencyMenu = document.getElementById('currencyMenu');
    const currencyIcon = document.getElementById('currencyIcon');
    const currencyItems = document.querySelectorAll('.currency-menu-item');
    
    let currentCurrency = 'ton';
    
    if (headerBalance && currencyMenu) {
        console.log('💰 Currency selector initialized');
        
        headerBalance.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('💰 Header balance clicked');
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }
            
            // Закрыть меню настроек, если оно открыто
            const settingsMenu = document.getElementById('settingsMenu');
            if (settingsMenu) {
                settingsMenu.classList.remove('show');
            }
            
            headerBalance.classList.toggle('active');
            currencyMenu.classList.toggle('show');
            
            console.log('Menu show:', currencyMenu.classList.contains('show'));
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!headerBalance.contains(e.target)) {
                headerBalance.classList.remove('active');
                currencyMenu.classList.remove('show');
            }
        });
    } else {
        console.error('❌ Currency elements not found:', { headerBalance, currencyMenu });
    }
    
    // Currency selection
    console.log('📋 Found currency items:', currencyItems.length);
    
    currencyItems.forEach((item, index) => {
        console.log(`📋 Setting up currency item ${index}:`, item.dataset.currency);
        
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('💱 Currency item clicked:', item.dataset.currency);
            
            const currency = item.dataset.currency;
            const iconElement = item.querySelector('.currency-menu-icon');
            
            if (currencyIcon && iconElement) {
                if (iconElement.tagName === 'IMG') {
                    currencyIcon.src = iconElement.src;
                    currencyIcon.alt = iconElement.alt;
                } else {
                    currencyIcon.textContent = iconElement.textContent;
                }
            }
            
            currentCurrency = currency;
            state.currentCurrency = currency;
            
            // Update all price icons
            const casePriceIcon = document.getElementById('casePriceIcon');
            const modalPriceIcon = document.getElementById('modalPriceIcon');
            
            const iconSrc = currency === 'ton' ? 'TON.png' : 'stars.png';
            if (casePriceIcon) {
                casePriceIcon.src = iconSrc;
                casePriceIcon.alt = currency === 'ton' ? 'TON' : 'Stars';
            }
            if (modalPriceIcon) {
                modalPriceIcon.src = iconSrc;
                modalPriceIcon.alt = currency === 'ton' ? 'TON' : 'Stars';
            }
            
            // Update prices based on currency
            updateAllPrices(currency);
            
            // Обновляем отображение баланса
            updateBalanceDisplay();
            
            // Обновляем Crash если он инициализирован
            if (typeof updateCrashCurrency === 'function') {
                updateCrashCurrency();
            }
            
            if (currencyMenu && headerBalance) {
                currencyMenu.classList.remove('show');
                headerBalance.classList.remove('active');
            }
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }
            
            showNotification(`Валюта изменена на ${currency === 'ton' ? 'TON' : 'Stars'}`);
        });
    });
    
    // Case modal - теперь для всех кейсов
    const caseCards = document.querySelectorAll('.case-card');
    const caseModal = document.getElementById('caseModal');
    const caseModalClose = document.getElementById('caseModalClose');
    const caseModalOverlay = document.getElementById('caseModalOverlay');
    
    caseCards.forEach(card => {
        card.addEventListener('click', () => {
            const caseType = card.dataset.case || 'pepe';
            const selectedCase = caseData[caseType] || caseData.pepe;
            window.currentCase = selectedCase;
            
            // Обновляем подарки в зависимости от цены кейса
            updateGiftsDisplay();
            
            // Обновляем модальное окно
            const modalTitle = caseModal.querySelector('.case-modal-title');
            const modalImage = caseModal.querySelector('.case-modal-image');
            const modalImageWrapper = caseModal.querySelector('.case-modal-image-wrapper');
            const openBtn = document.getElementById('openCaseBtn');
            
            // Обновляем модальное окно (универсально для emoji и image)
            if (modalTitle) modalTitle.textContent = selectedCase.name;
            if (modalImageWrapper) {
                if (selectedCase.image) {
                    modalImageWrapper.innerHTML = `<img src="${selectedCase.image}" alt="Case" class="case-modal-image">`;
                } else {
                    modalImageWrapper.innerHTML = `<span style="font-size: 80px;">${selectedCase.emoji}</span>`;
                }
            }
            if (openBtn) {
                const rate = state.exchangeRate?.starsPerTon || 81;
                const price = state.currentCurrency === 'stars' 
                    ? Math.round(selectedCase.price * rate) 
                    : selectedCase.price;
                const icon = state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
                openBtn.innerHTML = `
                    <span>Открыть за</span>
                    <img src="${icon}" alt="Currency" class="case-price-icon">
                    <span>${price}</span>
                `;
            }
            caseModal.classList.add('show');
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }
        });
    });
    
    if (caseModal) {
        const closeModal = () => {
            caseModal.classList.remove('show');
        };
        
        if (caseModalClose) {
            caseModalClose.addEventListener('click', (e) => {
                e.stopPropagation();
                closeModal();
            });
        }
        
        if (caseModalOverlay) {
            caseModalOverlay.addEventListener('click', closeModal);
        }
    }
    
    // Settings menu
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsMenu = document.getElementById('settingsMenu');
    const soundToggle = document.getElementById('soundToggle');
    const supportBtn = document.getElementById('supportBtn');
    
    if (settingsBtn && settingsMenu) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }
            
            // Закрыть меню баланса, если оно открыто
            const headerBalance = document.getElementById('headerBalance');
            const currencyMenu = document.getElementById('currencyMenu');
            if (headerBalance) {
                headerBalance.classList.remove('active');
            }
            if (currencyMenu) {
                currencyMenu.classList.remove('show');
            }
            
            settingsMenu.classList.toggle('show');
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!settingsMenu.contains(e.target) && e.target !== settingsBtn) {
                settingsMenu.classList.remove('show');
            }
        });
    }
    
    // Sound toggle
    if (soundToggle) {
        soundToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            state.soundEnabled = !state.soundEnabled;
            
            const toggleEl = soundToggle.querySelector('.menu-toggle');
            const iconEl = soundToggle.querySelector('.menu-icon');
            
            if (state.soundEnabled) {
                toggleEl.textContent = 'ON';
                toggleEl.classList.remove('off');
                toggleEl.classList.add('on');
                iconEl.textContent = '🔊';
            } else {
                toggleEl.textContent = 'OFF';
                toggleEl.classList.remove('on');
                toggleEl.classList.add('off');
                iconEl.textContent = '🔇';
            }
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }
            
            showNotification(state.soundEnabled ? '🔊 Звук включен' : '🔇 Звук выключен');
        });
    }
    
    // Support button
    if (supportBtn) {
        supportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (settingsMenu) {
                settingsMenu.classList.remove('show');
            }
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }
            
            showNotification('💬 Открываю техподдержку...');
            
            if (tg) {
                tg.openTelegramLink('https://t.me/support');
            }
        });
    }
    
    // Footer navigation
    const footerBtns = document.querySelectorAll('.footer-btn');
    footerBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }
            
            footerBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const label = this.querySelector('.footer-label')?.textContent;
            if (label) {
                showNotification(`Открываю ${label}...`);
            }
        });
    });
}

// 🎰 ROULETTE SYSTEM
const rouletteState = {
    isSpinning: false,
    caseItems: []
};

// Get case items from DOM
function getCaseItems(includeImpossible = false) {
    const items = [];
    document.querySelectorAll('.case-items .case-item').forEach(item => {
        const rarity = item.dataset.rarity;
        const droprate = parseFloat(item.dataset.droprate) || 0;
        const emoji = item.querySelector('.item-emoji')?.textContent || '🎁';
        const name = item.querySelector('.item-name')?.textContent || 'Gift';
        
        // Сначала пробуем взять из data-original-price, иначе парсим из текста
        let price = parseFloat(item.dataset.originalPrice) || 0;
        if (!price) {
            const priceEl = item.querySelector('.item-price');
            const priceText = priceEl?.textContent || '0';
            // Парсим цену с учётом K (30.0K -> 30000)
            if (priceText.includes('K')) {
                price = parseFloat(priceText) * 1000;
            } else {
                price = parseFloat(priceText.match(/[\d.]+/)?.[0]) || 0;
            }
        }
        
        // Get image URL if available
        const imgEl = item.querySelector('.item-image');
        const imageUrl = imgEl?.src || null;
        
        // Include impossible items for visual display in roulette
        if (includeImpossible && rarity === 'impossible') {
            items.push({ rarity, droprate: 0, emoji, name, price, imageUrl, isImpossible: true });
        } else if (droprate > 0) {
            items.push({ rarity, droprate, emoji, name, price, imageUrl, isImpossible: false });
        }
    });
    return items;
}

// 🎰 Track consecutive mid wins
let midStreak = parseInt(localStorage.getItem('midStreak') || '0');

// Select winner - полный рандом, но средний не может выпасть 3 раза подряд
function selectWinner(items) {
    // Normal weighted random selection
    const totalWeight = items.reduce((sum, item) => sum + item.droprate, 0);
    let random = Math.random() * totalWeight;
    
    let selectedItem = items[items.length - 1];
    for (const item of items) {
        random -= item.droprate;
        if (random <= 0) {
            selectedItem = item;
            break;
        }
    }
    
    // Check if it's a mid-tier item (ultra-rare rarity = средние подарки)
    const isMidTier = selectedItem.rarity === 'ultra-rare';
    
    // Если средний выпал 3 раза подряд - даём дешёвый
    if (isMidTier && midStreak >= 2) {
        console.log('🚫 Mid-tier blocked (was mid 2 times in a row), giving trash');
        const trashItems = items.filter(item => item.rarity === 'common');
        if (trashItems.length > 0) {
            selectedItem = trashItems[Math.floor(Math.random() * trashItems.length)];
        }
        midStreak = 0;
    } else if (isMidTier) {
        midStreak++;
        console.log(`💎 Mid-tier win! Streak: ${midStreak}`);
    } else {
        midStreak = 0;
    }
    
    localStorage.setItem('midStreak', midStreak.toString());
    return selectedItem;
}

// Generate roulette items (mix of all items, winner at specific position)
// Дорогие айтемы пролетают мимо но никогда не выпадают!
function generateRouletteItems(winner, count = 60) {
    const droppableItems = getCaseItems(false); // Только те что выпадают
    const impossibleItems = getCaseItems(true).filter(i => i.isImpossible); // Дорогие для показа
    const rouletteItems = [];
    const winnerPosition = Math.floor(count * 0.80); // Winner near the end
    
    // МНОГО позиций где будут пролетать дорогие айтемы!
    const impossiblePositions = [
        // Перед победителем - создаём максимальное напряжение!
        winnerPosition - 1,  // Почти выиграл!!!
        winnerPosition - 2,  // Вот-вот!
        winnerPosition - 4,  // Близко!
        winnerPosition - 6,  // Прямо перед
        winnerPosition - 9,  // Рядом
        winnerPosition - 12, // Скоро
        winnerPosition - 16, // Середина
        // Равномерно по всей рулетке
        Math.floor(count * 0.6),
        Math.floor(count * 0.5),
        Math.floor(count * 0.4),
        Math.floor(count * 0.3),
        Math.floor(count * 0.2),
        Math.floor(count * 0.15),
        Math.floor(count * 0.1),
        Math.floor(count * 0.05)
    ].filter(p => p > 0 && p !== winnerPosition);
    
    for (let i = 0; i < count; i++) {
        if (i === winnerPosition) {
            rouletteItems.push(winner);
        } else if (impossiblePositions.includes(i) && impossibleItems.length > 0) {
            // Ставим дорогой айтем (пролетит мимо!)
            const randomImpossible = impossibleItems[Math.floor(Math.random() * impossibleItems.length)];
            rouletteItems.push(randomImpossible);
        } else {
            // Random item weighted by droprate
            rouletteItems.push(selectWinner(droppableItems));
        }
    }
    
    return { items: rouletteItems, winnerPosition };
}

// Format price for roulette (1000 -> 1.0K, 2500 -> 2.5K)
function formatPriceK(price) {
    if (price >= 1000) {
        const k = price / 1000;
        return `${k.toFixed(1)}K`;
    }
    return price;
}

// Create roulette HTML
function createRouletteHTML(items) {
    const rate = state.exchangeRate?.starsPerTon || 81;
    const iconSrc = state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
    
    return items.map(item => {
        const imageContent = item.imageUrl 
            ? `<img src="${item.imageUrl}" alt="${item.name}" class="roulette-img" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
            : '';
        const emojiContent = item.imageUrl 
            ? `<span class="item-emoji" style="display:none">${item.emoji}</span>`
            : `<span class="item-emoji">${item.emoji}</span>`;
        
        // Convert price based on currency
        const priceInCurrency = state.currentCurrency === 'stars' 
            ? Math.round(item.price * rate) 
            : item.price;
        const displayPrice = formatPriceK(priceInCurrency);
        
        return `
            <div class="roulette-item ${item.rarity}">
                ${imageContent}
                ${emojiContent}
                <div class="item-price-mini">
                    <img src="${iconSrc}" alt="${state.currentCurrency === 'ton' ? 'TON' : 'Stars'}">${displayPrice}
                </div>
            </div>
        `;
    }).join('');
}

// Spin the roulette - СЕРВЕРНАЯ ВЕРСИЯ
async function spinRoulette() {
    console.log('🎰 spinRoulette called!', { isSpinning: rouletteState.isSpinning, currentCase: window.currentCase });
    
    if (rouletteState.isSpinning) {
        console.log('⚠️ Already spinning, ignoring');
        return;
    }
    
    // Берём цену из текущего выбранного кейса
    const baseTonPrice = window.currentCase?.price || 10;
    const rate = state.exchangeRate?.starsPerTon || 81;
    
    // Calculate price based on current currency
    const casePrice = state.currentCurrency === 'stars' 
        ? Math.round(baseTonPrice * rate) 
        : baseTonPrice;
    
    // Check the correct balance based on currency
    const currentBalance = state.currentCurrency === 'stars' ? state.starsBalance : state.balance;
    
    console.log('💰 Balance check:', { currentBalance, casePrice, currency: state.currentCurrency });
    
    // Проверяем что баланс положительный И достаточный (клиентская предпроверка)
    if (currentBalance <= 0 || currentBalance < casePrice) {
        const currencyName = state.currentCurrency === 'stars' ? 'Stars' : 'TON';
        showNotification(`❌ Недостаточно ${currencyName}!`);
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
        return;
    }
    
    rouletteState.isSpinning = true;
    
    // Показываем индикатор загрузки
    const openBtn = document.getElementById('openCaseBtn');
    if (openBtn) {
        openBtn.innerHTML = '<span class="spinner">⏳</span> Открываем...';
        openBtn.disabled = true;
    }

    // 🔒 ЗАПРОС НА СЕРВЕР - рандом происходит там!
    let serverResult;
    try {
        // Определяем тип кейса по цене (временное решение до миграции на серверные кейсы)
        let caseType = 'basic';
        if (baseTonPrice >= 10) caseType = 'legendary';
        else if (baseTonPrice >= 2) caseType = 'premium';
        
        console.log('📡 Calling server openCase:', { caseType, currency: state.currentCurrency });
        
        serverResult = await window.secureAPI.openCase(caseType, state.currentCurrency);
        
        if (!serverResult.success) {
            throw new Error(serverResult.error || 'Failed to open case');
        }
        
        console.log('🎰 Server result:', serverResult);
        
    } catch (error) {
        console.error('❌ Case open error:', error);
        showNotification(`❌ Ошибка: ${error.message}`);
        rouletteState.isSpinning = false;
        
        // Восстанавливаем кнопку
        if (openBtn) {
            openBtn.disabled = false;
            updateOpenCaseBtn();
        }
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
        return;
    }

    // Обновляем баланс с сервера
    const newBalance = serverResult.balance[state.currentCurrency];
    if (state.currentCurrency === 'stars') {
        state.starsBalance = newBalance;
    } else {
        state.balance = newBalance;
    }
    updateBalanceDisplay();
    
    // Создаём объект победителя из серверного ответа
    const winner = {
        name: serverResult.wonItem.name,
        price: serverResult.wonItem.price,
        imageUrl: serverResult.wonItem.image,
        emoji: '🎁',
        rarity: serverResult.wonItem.price > 1000 ? 'legendary' : 
               serverResult.wonItem.price > 300 ? 'ultra-rare' : 
               serverResult.wonItem.price > 100 ? 'rare' : 'common',
        collection: serverResult.wonItem.collection
    };
    
    // Get items for animation
    const caseItems = getCaseItems();
    if (caseItems.length === 0) {
        // Fallback если нет клиентских items для анимации
        caseItems.push(winner);
    }
    
    const { items, winnerPosition } = generateRouletteItems(winner, 50);
    
    // Setup roulette UI
    const container = document.getElementById('rouletteContainer');
    const track = document.getElementById('rouletteTrack');
    const caseItemsEl = document.querySelector('.case-items');
    const caseImageEl = document.querySelector('.case-modal-image-wrapper');
    
    // Hide case items, show roulette
    if (caseItemsEl) caseItemsEl.style.display = 'none';
    if (caseImageEl) caseImageEl.style.display = 'none';
    if (openBtn) openBtn.style.display = 'none';
    container.style.display = 'block';
    
    // Populate roulette
    track.innerHTML = createRouletteHTML(items);
    track.style.transition = 'none';
    track.style.transform = 'translateX(0)';
    
    // Force reflow
    track.offsetHeight;
    
    // Calculate final position (center the winner)
    const itemWidth = 88; // 80px + 8px gap
    const containerWidth = container.offsetWidth;
    const centerOffset = containerWidth / 2 - 40; // 40 = half of item width
    const targetPosition = -(winnerPosition * itemWidth - centerOffset);
    
    // Add some randomness to final position
    const randomOffset = (Math.random() - 0.5) * 40;
    const finalPosition = targetPosition + randomOffset;
    
    // Haptic feedback
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('heavy');
    }
    
    // Start spinning - плавная анимация как колесо по инерции
    setTimeout(() => {
        // cubic-bezier: плавный разгон, долгое естественное затухание (как колесо)
        track.style.transition = 'transform 10s cubic-bezier(0.05, 0.5, 0.05, 1)';
        track.style.transform = `translateX(${finalPosition}px)`;
        
        // Haptic during spin - замедляется вместе с рулеткой
        let hapticCount = 0;
        let hapticDelay = 100; // Начинаем быстро
        const hapticTick = () => {
            if (tg?.HapticFeedback && hapticCount < 50) {
                tg.HapticFeedback.impactOccurred('light');
                hapticCount++;
                hapticDelay = Math.min(hapticDelay * 1.15, 500); // Замедляем тики
                setTimeout(hapticTick, hapticDelay);
            }
        };
        hapticTick();
        
        // Show winner after spin
        setTimeout(() => {
            showWinModal(winner);
            rouletteState.isSpinning = false;
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }, 10200);
    }, 100);
}

// Show win modal
function showWinModal(winner) {
    const winModal = document.getElementById('winModal');
    const winItem = document.getElementById('winItem');
    const winPrice = document.getElementById('winPrice');
    const winBtn = document.getElementById('winBtn');
    
    // Show image if available, otherwise emoji
    if (winner.imageUrl) {
        winItem.innerHTML = `<img src="${winner.imageUrl}" alt="${winner.name}" class="win-img">`;
    } else {
        winItem.textContent = winner.emoji;
    }
    
    const rate = state.exchangeRate?.starsPerTon || 81;
    const iconSrc = state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
    const displayPrice = state.currentCurrency === 'stars' 
        ? Math.round(winner.price * rate) 
        : winner.price;
    const currencyName = state.currentCurrency === 'stars' ? '⭐' : 'TON';
    
    winPrice.innerHTML = `<img src="${iconSrc}" alt=""> ${displayPrice} ${currencyName}`;
    
    winModal.style.display = 'flex';
    
    // Win button handler - предмет УЖЕ добавлен на сервере!
    winBtn.onclick = async () => {
        // 🔒 Сервер уже добавил в инвентарь при openCase
        // Просто обновляем локальный инвентарь с сервера
        await loadInventoryFromServer();
        
        // Reset UI
        winModal.style.display = 'none';
        document.getElementById('rouletteContainer').style.display = 'none';
        document.querySelector('.case-items').style.display = 'grid';
        document.querySelector('.case-modal-image-wrapper').style.display = 'flex';
        document.getElementById('openCaseBtn').style.display = 'flex';
        updateOpenCaseBtn();
        
        showNotification(`🎒 В инвентарь: ${winner.name}`);
        
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }
    };
}

// Setup roulette button
function setupRouletteButton() {
    const openBtn = document.getElementById('openCaseBtn');
    if (openBtn) {
        // Use touchend for mobile
        openBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            spinRoulette();
        }, { passive: false });
        
        // Keep click for desktop
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            spinRoulette();
        });
    }
}

// 🚀 Start the app
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupRouletteButton();
    setupTabNavigation();
    
    // Инициализируем Crash игру
    if (typeof initCrash === 'function') {
        initCrash();
    }
    
    // Кнопка Crash в хедере
    const crashGameBtn = document.getElementById('crashGameBtn');
    if (crashGameBtn) {
        crashGameBtn.addEventListener('click', () => {
            // Переключаемся на вкладку Crash напрямую
            const mainContent = document.getElementById('mainContent');
            const crashSection = document.getElementById('crashSection');
            
            // Скрываем главную, показываем краш
            if (mainContent) mainContent.style.display = 'none';
            if (crashSection) crashSection.style.display = 'block';
            
            // Обновляем валюту и ресайзим canvas
            if (typeof updateCrashCurrency === 'function') {
                updateCrashCurrency();
            }
            if (typeof resizeCanvas === 'function') {
                setTimeout(resizeCanvas, 50);
            }
            
            // Обновляем активную кнопку в футере (убираем active)
            document.querySelectorAll('.footer-btn').forEach(b => b.classList.remove('active'));
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.selectionChanged();
            }
        });
    }
});

// 📑 Tab Navigation
function setupTabNavigation() {
    const footerBtns = document.querySelectorAll('.footer-btn[data-tab]');
    const mainContent = document.getElementById('mainContent');
    const crashSection = document.getElementById('crashSection');
    
    footerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            // Убираем active со всех
            footerBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Скрываем все секции
            if (mainContent) mainContent.style.display = 'none';
            if (crashSection) crashSection.style.display = 'none';
            
            // Показываем нужную
            switch (tab) {
                case 'home':
                    if (mainContent) mainContent.style.display = 'flex';
                    break;
                case 'crash':
                    if (crashSection) crashSection.style.display = 'block';
                    if (typeof updateCrashCurrency === 'function') {
                        updateCrashCurrency();
                    }
                    break;
                case 'inventory':
                    // Inventory - модалка, показываем home + модалку
                    if (mainContent) mainContent.style.display = 'flex';
                    openInventory();
                    break;
            }
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.selectionChanged();
            }
        });
    });
}

// 📱 Telegram WebApp Theme Handling
if (tg) {
    // Apply Telegram theme colors if available
    const themeParams = tg.themeParams;
    if (themeParams) {
        document.documentElement.style.setProperty('--tg-theme-bg-color', themeParams.bg_color || '#1a0d2e');
        document.documentElement.style.setProperty('--tg-theme-text-color', themeParams.text_color || '#ffffff');
    }
    
    // Listen for theme changes
    tg.onEvent('themeChanged', function() {
        const newThemeParams = tg.themeParams;
        if (newThemeParams) {
            document.documentElement.style.setProperty('--tg-theme-bg-color', newThemeParams.bg_color || '#1a0d2e');
            document.documentElement.style.setProperty('--tg-theme-text-color', newThemeParams.text_color || '#ffffff');
        }
    });
}

// Экспортируем функции глобально для использования в других файлах
window.saveBalance = saveBalance;
window.loadBalance = loadBalance;
window.updateBalanceDisplay = updateBalanceDisplay;
window.showNotification = showNotification;
window.state = state;

// 📱 Footer hide on scroll
document.addEventListener('DOMContentLoaded', function() {
    const footer = document.querySelector('.footer-nav');
    if (!footer) {
        console.log('Footer not found');
        return;
    }
    console.log('Footer scroll initialized');
    
    let lastScrollY = 0;
    let scrollTimeout = null;
    
    const appContainer = document.querySelector('.app-container');
    
    function handleScroll() {
        const currentScrollY = appContainer ? appContainer.scrollTop : window.scrollY;
        
        if (currentScrollY > lastScrollY && currentScrollY > 30) {
            // Scrolling down - hide footer
            footer.classList.add('hidden');
        } else if (currentScrollY < lastScrollY) {
            // Scrolling up - show footer
            footer.classList.remove('hidden');
        }
        
        lastScrollY = currentScrollY;
        
        // Auto-show footer after scroll stops
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            footer.classList.remove('hidden');
        }, 2000);
    }
    
    if (appContainer) {
        appContainer.addEventListener('scroll', handleScroll, { passive: true });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Touch handling for mobile
    let touchStartY = 0;
    let isTouching = false;
    
    document.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        isTouching = true;
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        if (!isTouching) return;
        
        const touchY = e.touches[0].clientY;
        const diff = touchStartY - touchY;
        
        if (Math.abs(diff) > 20) {
            if (diff > 0) {
                // Swiping up (scrolling down content) - hide
                footer.classList.add('hidden');
            } else {
                // Swiping down (scrolling up content) - show
                footer.classList.remove('hidden');
            }
            touchStartY = touchY;
        }
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
        isTouching = false;
    }, { passive: true });
});
