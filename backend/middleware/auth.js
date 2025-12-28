/**
 * Middleware для авторизации по Bearer токену
 */

/**
 * Получает Set с API ключами из env (lazy - вызывается при каждом запросе)
 */
function getApiKeys() {
    const keys = new Set();
    if (process.env.BOT_API_KEY) keys.add(process.env.BOT_API_KEY);
    if (process.env.ADMIN_API_KEY) keys.add(process.env.ADMIN_API_KEY);
    return keys;
}

/**
 * Проверяет Bearer токен в заголовке Authorization
 */
export function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({
            success: false,
            error: 'Authorization header missing'
        });
    }
    
    // Формат: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
            success: false,
            error: 'Invalid authorization format. Use: Bearer <token>'
        });
    }
    
    const token = parts[1];
    const apiKeys = getApiKeys();
    
    if (!apiKeys.has(token)) {
        console.log(`🚫 Invalid API key attempt: ${token.substring(0, 10)}...`);
        return res.status(403).json({
            success: false,
            error: 'Invalid API key'
        });
    }
    
    console.log(`✅ API request authorized`);
    next();
}

/**
 * Опциональная авторизация - не блокирует если нет токена
 */
export function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            const apiKeys = getApiKeys();
            req.isAuthenticated = apiKeys.has(parts[1]);
        }
    }
    
    next();
}
