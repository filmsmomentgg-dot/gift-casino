import cron from 'node-cron';

/**
 * GiftSynchronizer - автоматическая синхронизация подарков с Fragment
 * - Регулярное обновление данных
 * - Сравнение изменений
 * - Скачивание изображений
 * - Уведомления через WebSocket
 */
export class GiftSynchronizer {
    constructor(db, imageLoader, wss, parser) {
        this.db = db;
        this.imageLoader = imageLoader;
        this.wss = wss;
        this.parser = parser;
        
        // Конфигурация
        this.config = {
            updateInterval: 300, // 5 минут в секундах
            enableAutoSync: true,
            enableImageDownload: true,
            enablePriceTracking: true,
            maxGiftsPerUpdate: 100
        };
        
        this.isRunning = false;
        this.lastUpdate = null;
        this.stats = {
            totalUpdates: 0,
            giftsAdded: 0,
            giftsUpdated: 0,
            imagesDownloaded: 0,
            priceChanges: 0,
            errors: 0
        };
    }

    /**
     * Запустить автоматическую синхронизацию
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️  Synchronizer already running');
            return;
        }

        this.isRunning = true;
        const intervalMinutes = Math.floor(this.config.updateInterval / 60);
        console.log(`🚀 Gift Synchronizer started (interval: ${intervalMinutes} min)`);

        // Первичная синхронизация с небольшой задержкой
        setTimeout(() => this.syncNow(), 1000);

        // Настройка cron задачи (каждые N минут)
        const cronExpression = `*/${intervalMinutes} * * * *`;
        this.cronJob = cron.schedule(cronExpression, () => {
            if (this.config.enableAutoSync) {
                this.syncNow();
            }
        });

        console.log(`⏰ Cron job scheduled: every ${intervalMinutes} minutes`);
    }

    /**
     * Остановить синхронизацию
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        if (this.cronJob) {
            this.cronJob.stop();
        }

        this.isRunning = false;
        console.log('🛑 Gift Synchronizer stopped');
    }

    /**
     * Выполнить синхронизацию сейчас
     */
    async syncNow() {
        const startTime = Date.now();
        console.log('\n🔄 Starting synchronization...');

        try {
            // Получаем данные с Fragment
            const fragmentGifts = await this.parser.getAllGifts(false); // Без кэша
            console.log(`📦 Fetched ${fragmentGifts.length} gifts from Fragment`);

            // Получаем текущие данные из БД
            const dbGifts = await this.db.getAllGifts();

            const changes = {
                added: [],
                updated: [],
                priceChanged: []
            };

            // Создаём мапу существующих подарков по slug
            const dbGiftsMapBySlug = new Map(dbGifts.map(g => [g.slug, g]));

            // Обработка каждого подарка
            for (const gift of fragmentGifts.slice(0, this.config.maxGiftsPerUpdate)) {
                const existingGift = dbGiftsMapBySlug.get(gift.slug);

                if (!existingGift) {
                    // Новый подарок - используем upsert напрямую
                    console.log(`➕ Adding new gift: ${gift.name}`);
                    
                    const result = await this.db.upsertGift({
                        name: gift.name,
                        slug: gift.slug,
                        price: gift.price,
                        currency: gift.currency || 'TON',
                        collection: gift.collection,
                        source: 'fragment',
                        image_path: null
                    });
                    
                    console.log(`➕ Gift added: ${gift.name} (${gift.price} ${gift.currency || 'TON'}) - ID: ${result.id}`);
                    
                    // Скачиваем изображение для нового подарка
                    if (this.config.enableImageDownload && gift.imageUrl && result.id) {
                        try {
                            await this.imageLoader.queueDownload(result.id, gift.imageUrl);
                            this.stats.imagesDownloaded++;
                        } catch (error) {
                            console.error(`Failed to download image for ${gift.name}:`, error.message);
                        }
                    }
                    
                    changes.added.push(gift);
                } else {
                    // Проверка изменений существующего подарка
                    const hasChanges = await this.checkAndUpdateGift(existingGift, gift);
                    if (hasChanges) {
                        changes.updated.push(gift);
                        
                        // Отслеживание изменения цены
                        if (Math.abs(existingGift.price - gift.price) > 0.01) {
                            changes.priceChanged.push({
                                ...gift,
                                oldPrice: existingGift.price,
                                newPrice: gift.price,
                                change: ((gift.price - existingGift.price) / existingGift.price * 100).toFixed(2)
                            });
                        }
                    }
                }
            }

            // Обновление статистики
            this.stats.totalUpdates++;
            this.stats.giftsAdded += changes.added.length;
            this.stats.giftsUpdated += changes.updated.length;
            this.stats.priceChanges += changes.priceChanged.length;
            this.lastUpdate = new Date().toISOString();

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ Sync completed in ${duration}s`);
            console.log(`   Added: ${changes.added.length}`);
            console.log(`   Updated: ${changes.updated.length}`);
            console.log(`   Price changes: ${changes.priceChanged.length}`);

            // Отправка уведомлений через WebSocket
            this.broadcastChanges(changes);

            return changes;

        } catch (error) {
            this.stats.errors++;
            console.error('❌ Synchronization error:', error.message);
            throw error;
        }
    }

    /**
     * Добавить новый подарок
     */
    async addNewGift(gift) {
        console.log(`➕ Adding new gift: ${gift.name} (${gift.id || gift.slug})`);

        // Сохранение в БД через upsert
        await this.db.upsertGift({
            name: gift.name,
            slug: gift.slug,
            price: gift.price,
            currency: gift.currency || 'TON',
            collection: gift.collection,
            source: 'fragment',
            image_path: null
        });

        // Получаем добавленный подарок для дальнейшей работы
        const savedGift = await this.db.get('SELECT * FROM gifts WHERE slug = ?', [gift.slug]);
        
        console.log(`➕ Gift added: ${gift.name} (${gift.price} ${gift.currency || 'TON'})`);

        // Скачивание изображения
        if (this.config.enableImageDownload && gift.imageUrl) {
            try {
                const imagePath = await this.imageLoader.queueDownload(savedGift.id, gift.imageUrl);
                if (imagePath) {
                    this.stats.imagesDownloaded++;
                }
            } catch (error) {
                console.error(`Failed to download image for ${gift.id}:`, error.message);
            }
        }
    }

    /**
     * Проверить и обновить подарок
     */
    async checkAndUpdateGift(existing, updated) {
        // Проверяем, что existing имеет валидный ID
        if (!existing || !existing.id) {
            console.warn(`⚠️  Skipping update for gift without ID: ${updated.name}`);
            return false;
        }
        
        let hasChanges = false;
        const updates = {};

        // Проверка цены
        if (Math.abs(existing.price - updated.price) > 0.01) {
            updates.price = updated.price;
            hasChanges = true;
            
            // Сохранение истории цен
            if (this.config.enablePriceTracking) {
                await this.db.addPriceHistory({
                    gift_id: existing.id,
                    price: updated.price,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Проверка названия
        if (existing.name !== updated.name) {
            updates.name = updated.name;
            hasChanges = true;
        }

        // Обновление last_updated
        updates.last_updated = new Date().toISOString();

        if (hasChanges) {
            console.log(`🔄 Updating gift: ${existing.name} -> ${updates.name || existing.name}`);
            await this.db.updateGift(existing.id, updates);
        }

        // Проверка изображения
        if (this.config.enableImageDownload && updated.imageUrl && !this.imageLoader.imageExists(existing.id)) {
            try {
                await this.imageLoader.queueDownload(existing.id, updated.imageUrl);
                this.stats.imagesDownloaded++;
            } catch (error) {
                console.error(`Failed to download image for ${existing.id}:`, error.message);
            }
        }

        return hasChanges;
    }

    /**
     * Отправить изменения через WebSocket
     */
    broadcastChanges(changes) {
        if (!this.wss || this.wss.clients.size === 0) {
            return;
        }

        const message = JSON.stringify({
            type: 'sync_update',
            timestamp: new Date().toISOString(),
            data: {
                added: changes.added.length,
                updated: changes.updated.length,
                priceChanges: changes.priceChanged,
                stats: this.getStats()
            }
        });

        this.wss.clients.forEach(client => {
            if (client.readyState === 1) { // OPEN
                client.send(message);
            }
        });

        console.log(`📡 Broadcast sent to ${this.wss.clients.size} clients`);
    }

    /**
     * Получить статистику
     */
    getStats() {
        return {
            ...this.stats,
            lastUpdate: this.lastUpdate,
            isRunning: this.isRunning,
            config: this.config
        };
    }

    /**
     * Обновить конфигурацию
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        console.log('⚙️  Configuration updated:', this.config);

        // Перезапуск если изменился интервал
        if (newConfig.updateInterval && this.isRunning) {
            this.stop();
            this.start();
        }
    }

    /**
     * Очистить кэш парсера
     */
    clearCache() {
        this.parser.clearCache();
        console.log('🗑  Parser cache cleared');
    }
}
