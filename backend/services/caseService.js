/**
 * Case Opening Service
 * Серверная логика открытия кейсов
 * ВСЯ рандомизация происходит ТОЛЬКО на сервере
 */

import crypto from 'crypto';

// Определения кейсов (цены и шансы)
const CASE_DEFINITIONS = {
    basic: {
        name: 'Basic Case',
        price: { stars: 100, ton: 0.5 },
        items: [
            { name: 'Delicious Cake', price: 9, image: 'assets/gifts/delicious-cake.webp', collection: 'Food', chance: 0.35 },
            { name: 'Blue Star', price: 25, image: 'assets/gifts/blue-star.webp', collection: 'Stars', chance: 0.25 },
            { name: 'Red Star', price: 50, image: 'assets/gifts/red-star.webp', collection: 'Stars', chance: 0.20 },
            { name: 'Cookie Heart', price: 75, image: 'assets/gifts/cookie-heart.webp', collection: 'Food', chance: 0.12 },
            { name: 'Plush Pepe', price: 150, image: 'assets/gifts/plush-pepe.webp', collection: 'Memes', chance: 0.06 },
            { name: 'Signet Ring', price: 300, image: 'assets/gifts/signet-ring.webp', collection: 'Jewelry', chance: 0.019 },
            { name: 'Diamond Ring', price: 500, image: 'assets/gifts/diamond-ring.webp', collection: 'Jewelry', chance: 0.001 }
        ]
    },
    premium: {
        name: 'Premium Case',
        price: { stars: 500, ton: 2.5 },
        items: [
            { name: 'Plush Pepe', price: 150, image: 'assets/gifts/plush-pepe.webp', collection: 'Memes', chance: 0.30 },
            { name: 'Signet Ring', price: 300, image: 'assets/gifts/signet-ring.webp', collection: 'Jewelry', chance: 0.25 },
            { name: 'Diamond Ring', price: 500, image: 'assets/gifts/diamond-ring.webp', collection: 'Jewelry', chance: 0.20 },
            { name: 'Eternal Rose', price: 750, image: 'assets/gifts/eternal-rose.webp', collection: 'Flowers', chance: 0.13 },
            { name: 'Vintage Cigar', price: 1000, image: 'assets/gifts/vintage-cigar.webp', collection: 'Luxury', chance: 0.08 },
            { name: 'Gold Watch', price: 1500, image: 'assets/gifts/gold-watch.webp', collection: 'Luxury', chance: 0.035 },
            { name: 'Sapphire', price: 2500, image: 'assets/gifts/sapphire.webp', collection: 'Gems', chance: 0.005 }
        ]
    },
    legendary: {
        name: 'Legendary Case',
        price: { stars: 2000, ton: 10 },
        items: [
            { name: 'Eternal Rose', price: 750, image: 'assets/gifts/eternal-rose.webp', collection: 'Flowers', chance: 0.25 },
            { name: 'Vintage Cigar', price: 1000, image: 'assets/gifts/vintage-cigar.webp', collection: 'Luxury', chance: 0.25 },
            { name: 'Gold Watch', price: 1500, image: 'assets/gifts/gold-watch.webp', collection: 'Luxury', chance: 0.20 },
            { name: 'Sapphire', price: 2500, image: 'assets/gifts/sapphire.webp', collection: 'Gems', chance: 0.15 },
            { name: 'Diamond Crown', price: 5000, image: 'assets/gifts/diamond-crown.webp', collection: 'Royal', chance: 0.10 },
            { name: 'Jester Hat', price: 7500, image: 'assets/gifts/jester-hat.webp', collection: 'Royal', chance: 0.04 },
            { name: 'Ion Gem', price: 15000, image: 'assets/gifts/ion-gem.webp', collection: 'Ultimate', chance: 0.01 }
        ]
    }
};

// Расчёт house edge для проверки
function calculateHouseEdge(caseType) {
    const caseDef = CASE_DEFINITIONS[caseType];
    if (!caseDef) return null;
    
    const expectedValue = caseDef.items.reduce((sum, item) => sum + (item.price * item.chance), 0);
    const price = caseDef.price.stars;
    const houseEdge = ((price - expectedValue) / price) * 100;
    
    return {
        caseType,
        price,
        expectedValue: expectedValue.toFixed(2),
        houseEdge: houseEdge.toFixed(2) + '%'
    };
}

class CaseService {
    constructor(database) {
        this.db = database;
    }

    /**
     * Получить информацию о кейсе
     */
    getCaseInfo(caseType) {
        const caseDef = CASE_DEFINITIONS[caseType];
        if (!caseDef) return null;
        
        return {
            name: caseDef.name,
            price: caseDef.price,
            items: caseDef.items.map(item => ({
                name: item.name,
                price: item.price,
                image: item.image,
                collection: item.collection
                // НЕ отправляем шансы клиенту!
            })),
            houseEdgeInfo: calculateHouseEdge(caseType)
        };
    }

    /**
     * Получить все доступные кейсы
     */
    getAllCases() {
        return Object.keys(CASE_DEFINITIONS).map(type => ({
            type,
            ...this.getCaseInfo(type)
        }));
    }

    /**
     * ГЛАВНАЯ ФУНКЦИЯ - Открыть кейс
     * Вся логика рандома на сервере
     */
    async openCase(telegram_id, caseType, currency = 'stars') {
        const caseDef = CASE_DEFINITIONS[caseType];
        
        if (!caseDef) {
            return { success: false, error: 'Invalid case type' };
        }

        const price = caseDef.price[currency];
        if (!price) {
            return { success: false, error: 'Invalid currency' };
        }

        // Проверяем баланс (или создаём пользователя если первый визит)
        let user = await this.db.getUser(telegram_id);
        if (!user) {
            // Автоматически создаём пользователя с начальным балансом
            console.log(`📝 Creating new user: ${telegram_id}`);
            user = await this.db.upsertUser(telegram_id, 'User');
            
            if (!user) {
                return { success: false, error: 'Failed to create user' };
            }
        }

        const currentBalance = currency === 'ton' ? user.balance_ton : user.balance_stars;
        
        if (currentBalance < price) {
            return { success: false, error: 'Insufficient balance', required: price, current: currentBalance };
        }

        // Списываем стоимость кейса
        const newBalance = await this.db.updateBalance(telegram_id, currency, -price);

        // СЕРВЕРНЫЙ РАНДОМ - определяем выигрыш
        const wonItem = this._selectRandomItem(caseDef.items);

        // Записываем в инвентарь
        await this.db.addInventoryItem(telegram_id, {
            name: wonItem.name,
            price: wonItem.price,
            image: wonItem.image,
            collection: wonItem.collection,
            source: `case_${caseType}`
        });

        // Записываем спин для статистики
        await this.db.recordCaseSpin(telegram_id, {
            case_type: caseType,
            bet_amount: price,
            bet_currency: currency,
            won_item: wonItem.name,
            won_value: wonItem.price
        });

        // Возвращаем результат
        return {
            success: true,
            wonItem: {
                name: wonItem.name,
                price: wonItem.price,
                image: wonItem.image,
                collection: wonItem.collection
            },
            balance: {
                [currency]: newBalance
            },
            caseType,
            betAmount: price
        };
    }

    /**
     * Криптографически безопасный выбор предмета
     */
    _selectRandomItem(items) {
        // Используем crypto для безопасного рандома (импортирован в начале файла)
        const randomBytes = crypto.randomBytes(4);
        const randomValue = randomBytes.readUInt32BE(0) / 0xFFFFFFFF;

        let cumulative = 0;
        for (const item of items) {
            cumulative += item.chance;
            if (randomValue <= cumulative) {
                return item;
            }
        }
        
        // Fallback на последний предмет (самый редкий)
        return items[items.length - 1];
    }

    /**
     * Продать предмет из инвентаря
     */
    async sellInventoryItem(telegram_id, itemId, currency = 'stars') {
        // Получаем предмет
        const inventory = await this.db.getInventory(telegram_id);
        const item = inventory.find(i => i.id === itemId);
        
        if (!item) {
            return { success: false, error: 'Item not found' };
        }

        // Цена продажи (85% от стоимости - комиссия казино)
        const sellPrice = Math.floor(item.item_price * 0.85);

        // Удаляем из инвентаря
        const removed = await this.db.removeInventoryItem(telegram_id, itemId);
        if (!removed) {
            return { success: false, error: 'Failed to remove item' };
        }

        // Начисляем баланс
        const newBalance = await this.db.updateBalance(telegram_id, currency, sellPrice);

        return {
            success: true,
            soldItem: {
                id: item.id,
                name: item.item_name,
                originalPrice: item.item_price,
                sellPrice
            },
            balance: {
                [currency]: newBalance
            }
        };
    }
}

export { CaseService, CASE_DEFINITIONS, calculateHouseEdge };
