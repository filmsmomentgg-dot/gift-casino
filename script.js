// 🎮 Gift Casino - Main Script (Crash Only)

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
    exchangeRate: null,
    currentCurrency: 'ton',
    inventory: []
};

// DOM Elements
const elements = {
    balanceAmount: document.getElementById('balanceAmount'),
    currencyIcon: document.getElementById('currencyIcon'),
    headerBalance: document.getElementById('headerBalance'),
    currencyMenu: document.getElementById('currencyMenu'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsMenu: document.getElementById('settingsMenu'),
    soundToggle: document.getElementById('soundToggle'),
    supportBtn: document.getElementById('supportBtn'),
    crashGameBtn: document.getElementById('crashGameBtn'),
    minesGameBtn: document.getElementById('minesGameBtn'),
    mainContent: document.getElementById('mainContent'),
    crashSection: document.getElementById('crashSection'),
    minesSection: document.getElementById('minesSection'),
    inventoryModal: document.getElementById('inventoryModal'),
    inventoryItems: document.getElementById('inventoryItems'),
    inventoryEmpty: document.getElementById('inventoryEmpty'),
    inventoryBadge: document.getElementById('inventoryBadge'),
    recentCrashes: document.getElementById('recentCrashes')
};

// 🚀 Initialize App
async function initApp() {
    console.log('🚀 Initializing Gift Casino...');
    
    // Set Telegram user info
    if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        const usernameEl = document.querySelector('.username');
        if (usernameEl) {
            usernameEl.textContent = user.username ? `@${user.username}` : user.first_name;
        }
    }
    
    // Load data
    await loadBalanceFromServer();
    await loadInventoryFromServer();
    await fetchExchangeRate();
    
    // Setup UI
    setupEventListeners();
    updateBalanceDisplay();
    updateInventoryBadge();
    
    console.log('✅ App initialized!');
}

// 🔒 Load balance from server
async function loadBalanceFromServer() {
    try {
        console.log('💰 Loading balance from server...');
        
        if (!window.secureAPI) {
            console.warn('⚠️ SecureAPI not available, using defaults');
            return;
        }
        
        const response = await window.secureAPI.getBalance();
        
        if (response.success && response.data) {
            state.starsBalance = response.data.stars || 0;
            state.balance = response.data.ton || 0;
            console.log(`✅ Balance loaded: ${state.starsBalance} Stars, ${state.balance} TON`);
        }
    } catch (error) {
        console.error('❌ Failed to load balance:', error);
    }
    
    updateBalanceDisplay();
}

// 🔒 Load inventory from server
async function loadInventoryFromServer() {
    try {
        console.log('🎒 Loading inventory from server...');
        
        if (!window.secureAPI) {
            return;
        }
        
        const response = await window.secureAPI.getInventory();
        
        if (response.success && response.data) {
            state.inventory = response.data;
            console.log(`✅ Inventory loaded: ${state.inventory.length} items`);
            updateInventoryBadge();
        }
    } catch (error) {
        console.error('❌ Failed to load inventory:', error);
    }
}

// 💱 Fetch exchange rate
async function fetchExchangeRate() {
    try {
        const response = await fetch(`${API_BASE}/api/exchange-rate`);
        const data = await response.json();
        
        if (data.success) {
            state.exchangeRate = data.data;
            console.log('💱 Exchange rate:', state.exchangeRate);
        }
    } catch (error) {
        console.error('❌ Failed to fetch exchange rate:', error);
        state.exchangeRate = { starsPerTon: 100, tonPerStar: 0.01 };
    }
}

// 🔄 Update balance display
function updateBalanceDisplay() {
    if (!elements.balanceAmount) return;
    
    const balance = state.currentCurrency === 'ton' ? state.balance : state.starsBalance;
    let formatted;
    
    if (state.currentCurrency === 'ton') {
        if (balance % 1 === 0) {
            formatted = Math.floor(balance).toLocaleString();
        } else {
            formatted = balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    } else {
        formatted = Math.floor(balance).toLocaleString();
    }
    
    elements.balanceAmount.textContent = formatted;
    
    // Update currency icon
    if (elements.currencyIcon) {
        elements.currencyIcon.src = state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
        elements.currencyIcon.alt = state.currentCurrency === 'ton' ? 'TON' : 'Stars';
    }
}

// 🔢 Update inventory badge
function updateInventoryBadge() {
    if (!elements.inventoryBadge) return;
    
    const count = state.inventory.length;
    if (count > 0) {
        elements.inventoryBadge.textContent = count > 99 ? '99+' : count;
        elements.inventoryBadge.style.display = 'flex';
    } else {
        elements.inventoryBadge.style.display = 'none';
    }
}

// 📋 Setup event listeners
function setupEventListeners() {
    // Currency switcher
    if (elements.headerBalance) {
        elements.headerBalance.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.currencyMenu?.classList.toggle('show');
        });
    }
    
    // Currency menu items
    document.querySelectorAll('.currency-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const currency = item.dataset.currency;
            if (currency && currency !== state.currentCurrency) {
                state.currentCurrency = currency;
                updateBalanceDisplay();
                updateCrashCurrency();
                updateMinesCurrencyLocal();
            }
            elements.currencyMenu?.classList.remove('show');
        });
    });
    
    // Close menus on outside click
    document.addEventListener('click', () => {
        elements.currencyMenu?.classList.remove('show');
        elements.settingsMenu?.classList.remove('show');
    });
    
    // Settings button
    if (elements.settingsBtn) {
        elements.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.settingsMenu?.classList.toggle('show');
        });
    }
    
    // Sound toggle
    if (elements.soundToggle) {
        elements.soundToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            state.soundEnabled = !state.soundEnabled;
            const toggle = elements.soundToggle.querySelector('.menu-toggle');
            if (toggle) {
                toggle.textContent = state.soundEnabled ? 'ON' : 'OFF';
                toggle.classList.toggle('on', state.soundEnabled);
            }
        });
    }
    
    // Support button
    if (elements.supportBtn) {
        elements.supportBtn.addEventListener('click', () => {
            window.open('https://t.me/puwmvshop_bot', '_blank');
        });
    }
    
    // Crash game button
    if (elements.crashGameBtn) {
        elements.crashGameBtn.addEventListener('click', openCrashGame);
    }
    
    // Mines game button
    if (elements.minesGameBtn) {
        elements.minesGameBtn.addEventListener('click', openMinesGame);
    }
    
    // Footer navigation
    setupFooterNavigation();
    
    // Inventory modal
    setupInventoryModal();
}

// 🚀 Open Crash Game
function openCrashGame() {
    if (elements.mainContent) elements.mainContent.style.display = 'none';
    if (elements.minesSection) elements.minesSection.style.display = 'none';
    if (elements.crashSection) elements.crashSection.style.display = 'block';
    
    // Update currency in crash
    if (typeof updateCrashCurrency === 'function') {
        updateCrashCurrency();
    }
    
    // Resize canvas
    if (typeof resizeCanvas === 'function') {
        resizeCanvas();
    }
    
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
}

// 💣 Open Mines Game
function openMinesGame() {
    if (elements.mainContent) elements.mainContent.style.display = 'none';
    if (elements.crashSection) elements.crashSection.style.display = 'none';
    if (elements.minesSection) elements.minesSection.style.display = 'block';
    
    // Initialize mines if needed
    if (typeof initMines === 'function') {
        initMines();
    }
    
    // Update currency in mines
    if (typeof updateMinesCurrency === 'function') {
        updateMinesCurrency();
    }
    
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
}

// 🏠 Go to home
function goToHome() {
    if (elements.crashSection) elements.crashSection.style.display = 'none';
    if (elements.minesSection) elements.minesSection.style.display = 'none';
    if (elements.mainContent) elements.mainContent.style.display = 'block';
    
    // Update footer
    document.querySelectorAll('.footer-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === 'home');
    });
}

// 📌 Footer navigation
function setupFooterNavigation() {
    document.querySelectorAll('.footer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            document.querySelectorAll('.footer-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (tab === 'home') {
                goToHome();
            } else if (tab === 'inventory') {
                openInventoryModal();
            }
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }
        });
    });
}

// 🎒 Inventory Modal
function setupInventoryModal() {
    const overlay = document.getElementById('inventoryOverlay');
    const closeBtn = document.getElementById('inventoryClose');
    
    if (overlay) {
        overlay.addEventListener('click', closeInventoryModal);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeInventoryModal);
    }
}

function openInventoryModal() {
    if (!elements.inventoryModal) return;
    
    renderInventory();
    elements.inventoryModal.classList.add('show');
    
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

function closeInventoryModal() {
    if (elements.inventoryModal) {
        elements.inventoryModal.classList.remove('show');
    }
}

function renderInventory() {
    if (!elements.inventoryItems || !elements.inventoryEmpty) return;
    
    if (state.inventory.length === 0) {
        elements.inventoryEmpty.style.display = 'flex';
        elements.inventoryItems.style.display = 'none';
        return;
    }
    
    elements.inventoryEmpty.style.display = 'none';
    elements.inventoryItems.style.display = 'grid';
    
    const iconSrc = state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
    const rate = state.exchangeRate?.starsPerTon || 100;
    
    elements.inventoryItems.innerHTML = state.inventory.map(item => {
        const price = state.currentCurrency === 'stars' 
            ? Math.round(item.item_price * rate) 
            : item.item_price;
        
        return `
            <div class="inventory-item" data-id="${item.id}">
                <div class="inventory-item-image">
                    ${item.item_image 
                        ? `<img src="${item.item_image}" alt="${item.item_name}">`
                        : `<span class="item-emoji">🎁</span>`
                    }
                </div>
                <div class="inventory-item-name">${item.item_name}</div>
                <div class="inventory-item-price">
                    <img src="${iconSrc}" alt="Currency">
                    <span>${price}</span>
                </div>
                <button class="inventory-sell-btn" onclick="sellItem(${item.id})">Продать</button>
            </div>
        `;
    }).join('');
}

// 💰 Sell inventory item
async function sellItem(itemId) {
    if (!window.secureAPI) {
        showNotification('Ошибка: API недоступен', 'error');
        return;
    }
    
    try {
        const response = await window.secureAPI.sellItem(itemId, state.currentCurrency);
        
        if (response.success) {
            // Update balance
            const newBalance = response.balance[state.currentCurrency];
            if (state.currentCurrency === 'stars') {
                state.starsBalance = newBalance;
            } else {
                state.balance = newBalance;
            }
            updateBalanceDisplay();
            
            // Remove from inventory
            state.inventory = state.inventory.filter(i => i.id !== itemId);
            updateInventoryBadge();
            renderInventory();
            
            showNotification(`Продано за ${response.soldItem.sellPrice} ${state.currentCurrency === 'ton' ? 'TON' : '⭐'}`, 'success');
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        } else {
            showNotification(response.error || 'Ошибка продажи', 'error');
        }
    } catch (error) {
        console.error('Sell error:', error);
        showNotification('Ошибка продажи', 'error');
    }
}

// 📢 Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 🔄 Update crash currency (called from crash.js)
function updateCrashCurrency() {
    const crashBetIcon = document.getElementById('crashBetIcon');
    if (crashBetIcon) {
        crashBetIcon.src = state.currentCurrency === 'ton' ? 'TON.png' : 'stars.png';
    }
}

// 🔄 Update mines currency
function updateMinesCurrencyLocal() {
    // Call mines.js function which updates bet icon and revealed cells
    if (typeof window.updateMinesCurrency === 'function') {
        window.updateMinesCurrency();
    }
}

// 🚀 Start app
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
    // Initialize Crash game
    if (typeof initCrash === 'function') {
        initCrash();
    }
});

// Export for other modules
window.state = state;
window.updateBalanceDisplay = updateBalanceDisplay;
window.showNotification = showNotification;
window.goToHome = goToHome;
