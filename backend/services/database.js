import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

export class DatabaseService {
    constructor() {
        const dbPath = process.env.DB_PATH || './database/gifts.db';
        const dbDir = path.dirname(dbPath);
        
        // Create directory if not exists
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        this.db = new sqlite3.Database(dbPath);
    }

    // Custom run method that returns lastID
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    // Custom get method
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // Custom all method
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async init() {
        // Create gifts table
        await this.run(`
            CREATE TABLE IF NOT EXISTS gifts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                slug TEXT UNIQUE,
                price REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'TON',
                collection TEXT,
                image_path TEXT,
                source TEXT NOT NULL DEFAULT 'fragment',
                source_url TEXT,
                last_updated TEXT,
                created_at TEXT
            )
        `);

        // Create price history table
        await this.run(`
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gift_id INTEGER NOT NULL,
                price REAL NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (gift_id) REFERENCES gifts(id)
            )
        `);

        // Create indexes
        await this.run('CREATE INDEX IF NOT EXISTS idx_gifts_price ON gifts(price DESC)');
        await this.run('CREATE INDEX IF NOT EXISTS idx_gifts_collection ON gifts(collection)');
        await this.run('CREATE INDEX IF NOT EXISTS idx_price_history_gift ON price_history(gift_id)');

        // Create users table
        await this.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT UNIQUE NOT NULL,
                username TEXT,
                balance_ton REAL DEFAULT 0,
                balance_stars REAL DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            )
        `);

        // Create deposits table
        await this.run(`
            CREATE TABLE IF NOT EXISTS deposits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'stars',
                order_id TEXT UNIQUE,
                status TEXT DEFAULT 'pending',
                created_at TEXT,
                FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
            )
        `);

        // Create indexes for users
        await this.run('CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id)');
        await this.run('CREATE INDEX IF NOT EXISTS idx_deposits_telegram ON deposits(telegram_id)');
        await this.run('CREATE INDEX IF NOT EXISTS idx_deposits_order ON deposits(order_id)');

        console.log('✅ Database initialized');
    }

    /**
     * Добавить новый подарок
     */
    async addGift(gift) {
        const now = new Date().toISOString();
        
        await this.run(`
            INSERT INTO gifts (id, name, slug, price, currency, collection, image_path, source, last_updated, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            gift.id,
            gift.name,
            gift.slug || null,
            gift.price,
            gift.currency || 'TON',
            gift.collection || null,
            gift.image_path || null,
            gift.source || 'fragment',
            gift.last_updated || now,
            now
        ]);

        console.log(`➕ Gift added: ${gift.name} (${gift.price} ${gift.currency})`);
    }

    /**
     * Обновить подарок
     */
    async updateGift(giftId, updates) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }

        values.push(giftId);

        await this.run(`
            UPDATE gifts 
            SET ${fields.join(', ')} 
            WHERE id = ?
        `, values);

        console.log(`🔄 Gift updated: ${giftId}`);
    }

    /**
     * Добавить запись в историю цен
     */
    async addPriceHistory(history) {
        if (!history.gift_id) {
            console.error('❌ Error: gift_id is required for price history');
            console.error('History object:', history);
            throw new Error('gift_id is required for price history');
        }
        
        await this.run(`
            INSERT INTO price_history (gift_id, price, timestamp)
            VALUES (?, ?, ?)
        `, [history.gift_id, history.price, history.timestamp]);
    }

    async upsertGift(gift) {
        const now = new Date().toISOString();
        
        // Check if gift exists by slug (not ID)
        const existing = await this.get('SELECT * FROM gifts WHERE slug = ?', [gift.slug]);
        
        if (existing && existing.price !== gift.price) {
            // Price changed - log to history
            await this.addPriceHistory({
                gift_id: existing.id,
                price: gift.price,
                timestamp: now
            });
            
            const changePercent = ((gift.price - existing.price) / existing.price) * 100;
            console.log(`💰 Price change: ${gift.name} ${existing.price} → ${gift.price} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
        }

        if (existing) {
            // Update existing gift
            await this.run(`
                UPDATE gifts SET
                    name = ?,
                    price = ?,
                    currency = ?,
                    collection = ?,
                    image_path = COALESCE(?, image_path),
                    source = ?,
                    last_updated = ?
                WHERE id = ?
            `, [
                gift.name,
                gift.price,
                gift.currency || 'TON',
                gift.collection || null,
                gift.image_path || null,
                gift.source || 'fragment',
                now,
                existing.id
            ]);
            
            return { action: 'updated', id: existing.id };
        } else {
            // Insert new gift
            const result = await this.run(`
                INSERT INTO gifts (name, slug, price, currency, collection, image_path, source, last_updated, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                gift.name,
                gift.slug || null,
                gift.price,
                gift.currency || 'TON',
                gift.collection || null,
                gift.image_path || null,
                gift.source || 'fragment',
                now,
                now
            ]);
            
            const newId = result?.lastID || this.db.lastID;
            
            // Add first price history entry (только если есть ID)
            if (newId) {
                await this.addPriceHistory({
                    gift_id: newId,
                    price: gift.price,
                    timestamp: now
                });
            }
            
            return { action: 'created', id: newId };
        }
    }

    async getAllGifts() {
        return await this.all('SELECT * FROM gifts ORDER BY price DESC');
    }

    async getGiftById(id) {
        return await this.get('SELECT * FROM gifts WHERE id = ?', [id]);
    }

    async getPriceHistory(giftId, limit = 100) {
        return await this.all(`
            SELECT * FROM price_history 
            WHERE gift_id = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `, [giftId, limit]);
    }

    async updateImagePath(giftId, imagePath) {
        await this.run('UPDATE gifts SET image_path = ? WHERE id = ?', [imagePath, giftId]);
    }

    async close() {
        return new Promise((resolve) => {
            this.db.close(() => {
                console.log('🗄 Database closed');
                resolve();
            });
        });
    }

    // ========== USER METHODS ==========

    /**
     * Получить пользователя по telegram_id
     */
    async getUser(telegram_id) {
        return await this.get('SELECT * FROM users WHERE telegram_id = ?', [telegram_id]);
    }

    /**
     * Создать или обновить пользователя
     */
    async upsertUser(telegram_id, username = null) {
        const now = new Date().toISOString();
        const existing = await this.getUser(telegram_id);
        
        if (existing) {
            await this.run(
                'UPDATE users SET updated_at = ? WHERE telegram_id = ?',
                [now, telegram_id]
            );
            return existing;
        }
        
        await this.run(`
            INSERT INTO users (telegram_id, username, balance_ton, balance_stars, created_at, updated_at)
            VALUES (?, ?, 0, 0, ?, ?)
        `, [telegram_id, username, now, now]);
        
        console.log(`👤 New user created: ${telegram_id}`);
        return await this.getUser(telegram_id);
    }

    /**
     * Обновить баланс пользователя
     */
    async updateBalance(telegram_id, amount, currency = 'stars') {
        const now = new Date().toISOString();
        const column = currency === 'ton' ? 'balance_ton' : 'balance_stars';
        
        await this.run(`
            UPDATE users 
            SET ${column} = ${column} + ?, updated_at = ?
            WHERE telegram_id = ?
        `, [amount, now, telegram_id]);
        
        const user = await this.getUser(telegram_id);
        return currency === 'ton' ? user.balance_ton : user.balance_stars;
    }

    /**
     * Добавить депозит
     */
    async addDeposit(deposit) {
        const now = new Date().toISOString();
        
        await this.run(`
            INSERT INTO deposits (telegram_id, amount, currency, order_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            deposit.telegram_id,
            deposit.amount,
            deposit.currency || 'stars',
            deposit.order_id,
            deposit.status || 'completed',
            now
        ]);
        
        return { ...deposit, created_at: now };
    }

    /**
     * Получить депозиты пользователя
     */
    async getDeposits(telegram_id, limit = 50) {
        return await this.all(`
            SELECT * FROM deposits 
            WHERE telegram_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `, [telegram_id, limit]);
    }

    /**
     * Получить заказ по order_id
     */
    async getOrder(order_id) {
        return await this.get('SELECT * FROM deposits WHERE order_id = ?', [order_id]);
    }
}
