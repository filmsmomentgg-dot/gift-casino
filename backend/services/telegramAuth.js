/**
 * 🔐 Telegram WebApp Authentication Service
 * Проверяет initData от Telegram с помощью HMAC подписи
 */

import crypto from 'crypto';

const BOT_TOKEN = process.env.BOT_TOKEN || '';

/**
 * Проверяет подпись initData от Telegram
 * @param {string} initData - строка initData от Telegram WebApp
 * @returns {object|null} - данные пользователя или null если невалидно
 */
export function verifyTelegramWebAppData(initData) {
    if (!initData || !BOT_TOKEN) {
        console.warn('⚠️ No initData or BOT_TOKEN provided');
        return null;
    }

    try {
        // Парсим initData
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        
        if (!hash) {
            console.warn('⚠️ No hash in initData');
            return null;
        }

        // Удаляем hash из параметров для проверки
        urlParams.delete('hash');

        // Сортируем параметры и создаем строку для проверки
        const params = [];
        for (const [key, value] of urlParams.entries()) {
            params.push(`${key}=${value}`);
        }
        params.sort();
        const dataCheckString = params.join('\n');

        // Создаем secret key из токена бота
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();

        // Вычисляем HMAC подпись
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        // Сравниваем подписи
        if (calculatedHash !== hash) {
            console.warn('⚠️ Invalid hash signature');
            return null;
        }

        // Проверяем auth_date (не старше 24 часов)
        const authDate = parseInt(urlParams.get('auth_date') || '0');
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 86400) {
            console.warn('⚠️ Auth data expired');
            return null;
        }

        // Извлекаем данные пользователя
        const userStr = urlParams.get('user');
        if (!userStr) {
            console.warn('⚠️ No user data in initData');
            return null;
        }

        const user = JSON.parse(userStr);
        
        return {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name || '',
            username: user.username || '',
            languageCode: user.language_code || 'en',
            isPremium: user.is_premium || false,
            authDate: authDate
        };
    } catch (error) {
        console.error('❌ Error verifying Telegram data:', error);
        return null;
    }
}

/**
 * Express middleware для проверки авторизации
 */
export function authMiddleware(req, res, next) {
    // Получаем initData из заголовка
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authorization required' 
        });
    }

    const user = verifyTelegramWebAppData(initData);
    
    if (!user) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid authorization' 
        });
    }

    // Добавляем пользователя в request
    req.telegramUser = user;
    next();
}

/**
 * Опциональная авторизация (для dev режима)
 */
export function optionalAuthMiddleware(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    
    if (initData) {
        const user = verifyTelegramWebAppData(initData);
        if (user) {
            req.telegramUser = user;
        }
    }
    
    // Для разработки: создаем тестового пользователя
    if (!req.telegramUser && process.env.NODE_ENV !== 'production') {
        req.telegramUser = {
            id: 123456789,
            firstName: 'Dev',
            lastName: 'User',
            username: 'devuser',
            languageCode: 'ru',
            isPremium: false,
            authDate: Math.floor(Date.now() / 1000)
        };
    }
    
    next();
}

export default {
    verifyTelegramWebAppData,
    authMiddleware,
    optionalAuthMiddleware
};
