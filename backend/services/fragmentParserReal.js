import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Real Fragment.com Parser - парсит реальные данные с Fragment
 */
export class FragmentParserReal {
    constructor() {
        this.baseUrl = 'https://fragment.com';
        // Основные коллекции для парсинга
        this.collections = [
            'plushpepe',
            'heartlocket',
            'bdaycandle',
            'berrybox',
            'candycane',
            'cloverpin',
            'cookieheart',
            'artisanbrick',
            'astralshard',
            'bigyear'
        ];
    }

    /**
     * Парсит конкретную коллекцию подарков
     */
    async parseCollection(collectionSlug) {
        try {
            const url = `${this.baseUrl}/gifts/${collectionSlug}`;
            console.log(`📦 Парсинг коллекции: ${url}`);

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                },
                timeout: 10000
            });

            const $ = cheerio.load(response.data);
            const gifts = [];

            // Находим все карточки подарков по селектору ссылок на gift/
            $('a[href*="/gift/"]').each((index, element) => {
                const $link = $(element);
                const href = $link.attr('href');
                
                // Извлекаем slug из ссылки вида /gift/plushpepe-1515
                const match = href.match(/\/gift\/([^?]+)/);
                if (!match) return;

                const fullSlug = match[1]; // plushpepe-1515
                const parts = fullSlug.split('-');
                const number = parts[parts.length - 1];
                const collection = parts.slice(0, -1).join('-');

                // Ищем текст с ценой или статусом "Sold"
                const text = $link.text();
                let price = 0;
                
                // Извлекаем цену из текста вида "12,733.88 Sold" или "48,000 Sold"
                const priceMatch = text.match(/([\d,]+(?:\.\d+)?)\s*(?:TON|Sold)/);
                if (priceMatch) {
                    price = parseFloat(priceMatch[1].replace(/,/g, ''));
                }

                // Генерируем URL изображения по шаблону Fragment
                const imageUrl = `https://nft.fragment.com/gift/${fullSlug}.medium.jpg`;

                // Формируем название
                const collectionName = this.formatCollectionName(collection);
                const name = `${collectionName} #${number}`;

                gifts.push({
                    name: name,
                    slug: fullSlug,
                    price: price,
                    collection: collection,
                    imageUrl: imageUrl,
                    description: `${collectionName} - Telegram Gift from Fragment.com`
                });
            });

            // Убираем дубликаты по slug
            const uniqueGifts = Array.from(
                new Map(gifts.map(g => [g.slug, g])).values()
            );

            console.log(`✅ Коллекция ${collectionSlug}: найдено ${uniqueGifts.length} подарков`);
            return uniqueGifts;
        } catch (error) {
            console.error(`❌ Ошибка парсинга коллекции ${collectionSlug}:`, error.message);
            return [];
        }
    }

    /**
     * Парсит несколько коллекций параллельно
     */
    async getAllGifts() {
        try {
            console.log('🎁 Начинаем парсинг коллекций Fragment.com...');
            const allGifts = [];

            // Парсим первые 5 коллекций параллельно
            const collectionsToFetch = this.collections.slice(0, 5);
            
            const results = await Promise.all(
                collectionsToFetch.map(slug => this.parseCollection(slug))
            );

            results.forEach(gifts => {
                allGifts.push(...gifts);
            });

            console.log(`✅ Всего спарсено ${allGifts.length} подарков из ${collectionsToFetch.length} коллекций`);
            return allGifts;
        } catch (error) {
            console.error('❌ Ошибка при парсинге:', error.message);
            return [];
        }
    }

    /**
     * Форматирует название коллекции для отображения
     */
    formatCollectionName(slug) {
        const names = {
            'plushpepe': 'Plush Pepe',
            'heartlocket': 'Heart Locket',
            'bdaycandle': 'B-Day Candle',
            'berrybox': 'Berry Box',
            'candycane': 'Candy Cane',
            'cloverpin': 'Clover Pin',
            'cookieheart': 'Cookie Heart',
            'artisanbrick': 'Artisan Brick',
            'astralshard': 'Astral Shard',
            'bigyear': 'Big Year'
        };

        return names[slug] || slug.split(/(?=[A-Z])/).join(' ').replace(/^\w/, c => c.toUpperCase());
    }

    /**
     * Парсит цену из строки
     */
    parsePrice(priceText) {
        if (!priceText) return 0;
        const match = priceText.match(/([\d,]+(?:\.\d+)?)/);
        return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
    }

    /**
     * Извлекает collection из slug
     */
    extractCollection(slug) {
        if (!slug) return 'unknown';
        const parts = slug.split('-');
        return parts.slice(0, -1).join('-');
    }
}

// Export default instance
export default new FragmentParserReal();
