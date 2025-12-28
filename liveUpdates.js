// 🌐 WebSocket connection for live updates
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function connectWebSocket() {
    // Auto-detect WebSocket URL based on environment
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = isLocal ? 'ws://localhost:3000' : `${wsProtocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    window.liveWs = ws; // Экспортируем для crash.js
    
    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        reconnectAttempts = 0;
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'initial' || message.type === 'update') {
            updateGiftsData(message.data);
        }
        
        // Crash game messages
        if (message.type && message.type.startsWith('crash_')) {
            if (typeof window.handleCrashServerMessage === 'function') {
                window.handleCrashServerMessage(message);
            }
        }
    };
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        window.liveWs = null;
        
        // Reconnect with exponential backoff
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            console.log(`🔄 Reconnecting in ${delay}ms...`);
            
            setTimeout(() => {
                reconnectAttempts++;
                connectWebSocket();
            }, delay);
        }
    };
}

// 📊 Fetch gifts from API
async function fetchGifts() {
    const apiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000'
        : window.location.origin;
    try {
        const response = await fetch(`${apiBase}/api/gifts`);
        const data = await response.json();
        
        if (data.success) {
            updateGiftsData(data.data);
        }
    } catch (error) {
        console.error('❌ Failed to fetch gifts:', error);
    }
}

// 🔄 Update gifts data in UI
function updateGiftsData(gifts) {
    console.log('📦 Received gifts data:', gifts);
    
    // Update case modal items
    const caseItemsContainer = document.querySelector('.case-items');
    if (caseItemsContainer && gifts.length > 0) {
        caseItemsContainer.innerHTML = '';
        
        gifts.slice(0, 4).forEach(gift => {
            const item = document.createElement('div');
            item.className = 'case-item';
            item.innerHTML = `
                <img src="${gift.image_path || 'https://via.placeholder.com/40'}" alt="${gift.name}" class="item-image">
                <span class="item-name">${gift.name}</span>
                <span class="item-price">
                    <img src="${gift.currency === 'TON' ? 'TON.png' : 'stars.png'}" alt="${gift.currency}" class="item-price-icon">
                    ${gift.price}
                </span>
            `;
            caseItemsContainer.appendChild(item);
        });
    }
    
    // Store for later use
    window.giftsData = gifts;
}

// 🚀 Initialize on load
if (typeof window !== 'undefined') {
    // Fetch initial data
    fetchGifts();
    
    // Connect WebSocket for live updates
    connectWebSocket();
}

export { connectWebSocket, fetchGifts, updateGiftsData };
