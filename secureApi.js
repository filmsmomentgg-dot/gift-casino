/**
 * Secure API Client
 * Клиент для безопасных запросов к серверу с Telegram аутентификацией
 */

class SecureAPI {
    constructor() {
        this.baseUrl = this._detectApiUrl();
        this.initData = null;
        this._initTelegram();
    }

    /**
     * Определение URL API
     */
    _detectApiUrl() {
        const hostname = window.location.hostname;
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:3000';
        }
        
        // Production
        return window.location.origin;
    }

    /**
     * Инициализация Telegram WebApp
     */
    _initTelegram() {
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            this.initData = tg.initData;
            this.user = tg.initDataUnsafe?.user;
            
            console.log('📱 Telegram WebApp initialized');
            console.log('👤 User:', this.user?.first_name || 'Unknown');
            
            // Сообщаем Telegram что мы готовы
            tg.ready();
            tg.expand();
        } else {
            console.warn('⚠️ Telegram WebApp not available - running in dev mode');
            // В режиме разработки создаём фейковые данные
            this.user = {
                id: 123456789,
                first_name: 'Dev',
                username: 'developer'
            };
        }
    }

    /**
     * Базовый запрос с авторизацией
     */
    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Добавляем initData если есть
        if (this.initData) {
            headers['X-Telegram-Init-Data'] = this.initData;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    /**
     * GET запрос
     */
    async get(endpoint) {
        return this._request(endpoint, { method: 'GET' });
    }

    /**
     * POST запрос
     */
    async post(endpoint, body = {}) {
        return this._request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    // ==================== USER API ====================

    /**
     * Получить данные текущего пользователя
     */
    async getUser() {
        return this.get('/api/user');
    }

    /**
     * Получить баланс
     */
    async getBalance() {
        return this.get('/api/user/balance');
    }

    /**
     * Получить инвентарь
     */
    async getInventory() {
        return this.get('/api/user/inventory');
    }

    /**
     * Продать предмет
     */
    async sellItem(itemId, currency = 'stars') {
        return this.post('/api/user/inventory/sell', { itemId, currency });
    }

    /**
     * Получить историю игр
     */
    async getHistory(limit = 50) {
        return this.get(`/api/user/history?limit=${limit}`);
    }

    /**
     * Получить статистику
     */
    async getStats() {
        return this.get('/api/user/stats');
    }

    // ==================== CASES API ====================

    /**
     * Получить список кейсов
     */
    async getCases() {
        return this.get('/api/cases');
    }

    /**
     * Получить информацию о кейсе
     */
    async getCaseInfo(caseType) {
        return this.get(`/api/cases/${caseType}`);
    }

    /**
     * ОТКРЫТЬ КЕЙС (серверный рандом!)
     */
    async openCase(caseType, currency = 'stars') {
        return this.post(`/api/cases/${caseType}/open`, { currency });
    }

    // ==================== DEBUG (только разработка) ====================

    /**
     * Добавить тестовый баланс
     */
    async debugAddBalance(amount = 1000, currency = 'stars') {
        return this.post('/api/debug/add-balance', { amount, currency });
    }

    /**
     * Сбросить пользователя
     */
    async debugResetUser() {
        return this.post('/api/debug/reset-user');
    }
}

// Глобальный экземпляр
window.secureAPI = new SecureAPI();

console.log('🔐 Secure API Client loaded');
