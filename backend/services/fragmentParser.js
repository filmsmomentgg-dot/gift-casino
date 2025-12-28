import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * FragmentParser - парсер для получения данных о подарках с Fragment.com
 * Работает через публичное API Fragment (GraphQL)
 */
export class FragmentParser {
    constructor() {
        this.baseUrl = 'https://fragment.com';
        this.apiUrl = 'https://fragment.com/api';
        this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
        this.retryAttempts = 3;
        this.retryDelay = 2000;
        this.requestTimeout = 10000;
        this.cache = new Map();
        this.cacheTimeout = 60000; // 1 минута
    }

    /**
     * Получить список всех доступных коллекций подарков
     */
    async getCollections() {
        try {
            console.log('📦 Fetching collections from Fragment...');
            
            const response = await axios.get(`${this.baseUrl}/gifts`, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                timeout: this.requestTimeout
            });

            const $ = cheerio.load(response.data);
            const collections = [];

            // Парсим список коллекций
            $('.tm-section-box a[href*="/gifts/"]').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                const match = text.match(/^(.+?)\s+(\d+)\s+items?$/);
                
                if (match && href) {
                    const collectionId = href.split('/gifts/')[1];
                    collections.push({
                        id: collectionId,
                        name: match[1],
                        count: parseInt(match[2]),
                        url: `${this.baseUrl}${href}`
                    });
                }
            });

            console.log(`✅ Found ${collections.length} collections`);
            return collections;
        } catch (error) {
            console.error('❌ Error fetching collections:', error.message);
            throw error;
        }
    }

    /**
     * Получить данные о подарках через GraphQL API Fragment
     */
    async fetchGiftsData() {
        try {
            console.log('🎁 Fetching gifts data from Fragment API...');
            
            // Fragment использует GraphQL API для получения данных
            const response = await axios.post(
                `${this.apiUrl}`,
                {
                    query: `
                        query {
                            gifts {
                                items {
                                    id
                                    name
                                    slug
                                    price
                                    currency
                                    image
                                    available
                                    sold
                                    collection
                                }
                            }
                        }
                    `
                },
                {
                    headers: {
                        'User-Agent': this.userAgent,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: this.requestTimeout
                }
            );

            if (response.data && response.data.data && response.data.data.gifts) {
                return response.data.data.gifts.items;
            }

            throw new Error('Invalid API response format');
        } catch (error) {
            console.error('❌ GraphQL API error:', error.message);
            // Fallback к парсингу HTML
            return await this.fetchGiftsFromHTML();
        }
    }

    /**
     * Альтернативный метод: парсинг HTML страницы
     */
    async fetchGiftsFromHTML() {
        try {
            console.log('🔄 Fallback: parsing HTML...');
            
            const response = await axios.get(`${this.baseUrl}/gifts`, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html'
                },
                timeout: this.requestTimeout
            });

            const gifts = this.parseGiftsFromHTML(response.data);
            console.log(`✅ Parsed ${gifts.length} gifts from HTML`);
            return gifts;
        } catch (error) {
            console.error('❌ HTML parsing error:', error.message);
            throw error;
        }
    }

    /**
     * Парсинг подарков из HTML
     */
    parseGiftsFromHTML(html) {
        const $ = cheerio.load(html);
        const gifts = [];

        // Парсим карточки подарков
        $('.table-cell-value').each((i, el) => {
            try {
                const $card = $(el);
                const $link = $card.find('a[href*="/gift/"]');
                
                if ($link.length === 0) return;

                const href = $link.attr('href');
                const match = href.match(/\/gift\/(.+?)-(\d+)/);
                
                if (!match) return;

                const slug = match[1];
                const number = match[2];
                const id = `${slug}-${number}`;

                // Название
                const name = this.formatGiftName(slug);

                // Цена
                const priceText = $card.find('.table-cell-leading').text().trim();
                const price = this.parsePrice(priceText);

                // Изображение
                const imageUrl = this.extractImageUrl($card, slug);

                gifts.push({
                    id,
                    name,
                    slug,
                    number: parseInt(number),
                    price: price.value,
                    currency: price.currency,
                    image: imageUrl,
                    collection: slug,
                    url: `${this.baseUrl}${href}`,
                    lastUpdated: new Date().toISOString()
                });
            } catch (error) {
                console.error('Error parsing gift card:', error);
            }
        });

        return gifts;
    }

    /**
     * Извлечь URL изображения
     */
    extractImageUrl($element, slug) {
        // Ищем изображение
        const $img = $element.find('img[src*="cdn"]');
        if ($img.length > 0) {
            return $img.attr('src');
        }

        // Ищем в data-атрибутах
        const dataSrc = $element.find('[data-src]').attr('data-src');
        if (dataSrc) {
            return dataSrc;
        }

        // Генерируем URL на основе slug
        return `https://cdn.fragment.com/gifts/${slug}.png`;
    }

    /**
     * Парсинг цены
     */
    parsePrice(priceText) {
        // Примеры: "12,345 TON", "1000.50 TON Sold"
        const match = priceText.match(/([\d,\.]+)\s*([A-Z]+)/);
        
        if (match) {
            const value = parseFloat(match[1].replace(/,/g, ''));
            const currency = match[2];
            
            return { value, currency };
        }

        return { value: 0, currency: 'TON' };
    }

    /**
     * Форматирование названия подарка
     */
    formatGiftName(slug) {
        // plushpepe -> Plush Pepe
        return slug
            .split(/(?=[A-Z])/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Получить подарки с повторными попытками
     */
    async fetchWithRetry(fn, attempts = this.retryAttempts) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (error) {
                console.warn(`⚠️  Attempt ${i + 1}/${attempts} failed:`, error.message);
                
                if (i === attempts - 1) throw error;
                
                // Exponential backoff
                const delay = this.retryDelay * Math.pow(2, i);
                console.log(`⏱  Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Получить все подарки (с кэшированием)
     */
    async getAllGifts(useCache = true) {
        const cacheKey = 'all_gifts';
        
        // Проверяем кэш
        if (useCache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log('📦 Using cached gifts data');
                return cached.data;
            }
        }

        // Получаем новые данные
        const gifts = await this.fetchWithRetry(() => this.fetchGiftsData());
        
        // Сохраняем в кэш
        this.cache.set(cacheKey, {
            data: gifts,
            timestamp: Date.now()
        });

        return gifts;
    }

    /**
     * Получить топ подарков по цене
     */
    async getTopGifts(limit = 10) {
        const gifts = await this.getAllGifts();
        return gifts
            .sort((a, b) => b.price - a.price)
            .slice(0, limit);
    }

    /**
     * Очистить кэш
     */
    clearCache() {
        this.cache.clear();
        console.log('🗑  Cache cleared');
    }
}
