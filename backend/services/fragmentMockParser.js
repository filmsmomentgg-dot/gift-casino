/**
 * Mock Fragment Parser для демо-версии
 * В production версии здесь будет настоящий парсер с Puppeteer
 * или официальным API Fragment после получения ключей
 */
export class FragmentMockParser {
    constructor() {
        this.mockGifts = [
            // Impossible tier
            { name: 'Delicious Cake', slug: 'delicious-cake', price: 2500, currency: 'TON', collection: 'birthday', imageUrl: 'https://fragment.com/img/gifts/delicious-cake.png' },
            { name: 'Green Star', slug: 'green-star', price: 1000, currency: 'TON', collection: 'stars', imageUrl: 'https://fragment.com/img/gifts/green-star.png' },
            { name: 'Blue Star', slug: 'blue-star', price: 500, currency: 'TON', collection: 'stars', imageUrl: 'https://fragment.com/img/gifts/blue-star.png' },
            
            // Ultra Rare tier
            { name: 'Heart Locket', slug: 'heart-locket', price: 6.5, currency: 'TON', collection: 'heartlocket', imageUrl: 'https://fragment.com/img/gifts/heart-locket.png' },
            { name: 'Plush Pepe', slug: 'plush-pepe', price: 5.8, currency: 'TON', collection: 'plushpepe', imageUrl: 'https://fragment.com/img/gifts/plush-pepe.png' },
            { name: 'Red Chili Pepper', slug: 'red-chili-pepper', price: 5.2, currency: 'TON', collection: 'peppers', imageUrl: 'https://fragment.com/img/gifts/red-chili.png' },
            { name: 'Rarest Pepe', slug: 'rarest-pepe', price: 4.8, currency: 'TON', collection: 'plushpepe', imageUrl: 'https://fragment.com/img/gifts/rarest-pepe.png' },
            { name: 'Gold Ring', slug: 'gold-ring', price: 4.5, currency: 'TON', collection: 'jewelry', imageUrl: 'https://fragment.com/img/gifts/gold-ring.png' },
            
            // Common tier
            { name: 'Tropical Flower', slug: 'tropical-flower', price: 0.8, currency: 'TON', collection: 'flowers', imageUrl: 'https://fragment.com/img/gifts/tropical-flower.png' },
            { name: 'Red Rose', slug: 'red-rose', price: 0.65, currency: 'TON', collection: 'flowers', imageUrl: 'https://fragment.com/img/gifts/red-rose.png' },
            { name: 'Sunflower', slug: 'sunflower', price: 0.5, currency: 'TON', collection: 'flowers', imageUrl: 'https://fragment.com/img/gifts/sunflower.png' },
            { name: 'Tulip', slug: 'tulip', price: 0.45, currency: 'TON', collection: 'flowers', imageUrl: 'https://fragment.com/img/gifts/tulip.png' },
            { name: 'Small Bear', slug: 'small-bear', price: 0.35, currency: 'TON', collection: 'teddy', imageUrl: 'https://fragment.com/img/gifts/small-bear.png' },
            { name: 'Cupcake', slug: 'cupcake', price: 0.25, currency: 'TON', collection: 'birthday', imageUrl: 'https://fragment.com/img/gifts/cupcake.png' },
            { name: 'Candy', slug: 'candy', price: 0.1, currency: 'TON', collection: 'sweets', imageUrl: 'https://fragment.com/img/gifts/candy.png' },
        ];
    }

    /**
     * Получить все подарки (mock data)
     */
    async getAllGifts() {
        // Имитируем задержку сети
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Возвращаем фиксированные цены (без вариации для тестирования)
        return this.mockGifts.map(gift => ({
            ...gift,
            lastUpdated: new Date().toISOString()
        }));
    }

    /**
     * Получить подарок по slug
     */
    async getGiftBySlug(slug) {
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.mockGifts.find(g => g.slug === slug) || null;
    }
}
