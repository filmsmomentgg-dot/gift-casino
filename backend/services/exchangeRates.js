import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * ExchangeRates - сервис для получения курсов обмена TON/Stars
 * Берёт реальные цены из price.json, обновляет каждую минуту
 */
export class ExchangeRates {
    constructor() {
        this.cache = {
            tonRate: null,          // TON/USD
            starPriceInTon: null,   // Цена 1 Star в TON
            starsPerTon: null,      // сколько Stars за 1 TON
            lastUpdate: null
        };
        this.cacheTimeout = 60000; // 1 минута
        this.priceFilePath = '/Users/maczone/Downloads/AyuGram Desktop/price.json';
        this.updateInterval = null;
    }

    /**
     * Запускает автообновление курса каждую минуту
     */
    startAutoUpdate() {
        // Первое обновление сразу
        this.fetchRates();
        
        // Потом каждую минуту
        this.updateInterval = setInterval(() => {
            console.log('⏰ Auto-updating exchange rates...');
            this.cache.lastUpdate = null; // Сбрасываем кэш
            this.fetchRates();
        }, 60000);
        
        console.log('🔄 Exchange rate auto-update started (every 1 min)');
    }

    /**
     * Останавливает автообновление
     */
    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('🛑 Exchange rate auto-update stopped');
        }
    }

    /**
     * Загружает цены из price.json
     */
    loadPriceFromFile() {
        try {
            if (fs.existsSync(this.priceFilePath)) {
                const data = fs.readFileSync(this.priceFilePath, 'utf8');
                const prices = JSON.parse(data);
                console.log('💱 Loaded prices from price.json:', prices);
                return prices;
            }
        } catch (error) {
            console.error('❌ Error loading price.json:', error.message);
        }
        // Fallback
        return {
            basePricePerStar: 0.009232,
            sellPricePerStar: 0.010155,
            markup: 0.1
        };
    }

    /**
     * Получает курс TON/USD с Fragment.com
     */
    async fetchTonRate() {
        try {
            console.log('💱 Fetching TON/USD rate from Fragment...');
            
            const response = await axios.get('https://fragment.com/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                },
                timeout: 10000
            });

            // Ищем tonRate в HTML страницы
            const match = response.data.match(/"tonRate":\s*([\d.]+)/);
            if (match) {
                const rate = parseFloat(match[1]);
                console.log(`✅ TON/USD rate: $${rate.toFixed(4)}`);
                return rate;
            }

            console.log('⚠️  Using fallback TON rate');
            return 1.62;
        } catch (error) {
            console.error('❌ Error fetching TON rate:', error.message);
            return 1.62;
        }
    }

    /**
     * Получает все курсы и рассчитывает TON/Stars
     */
    async fetchRates() {
        // Проверяем кэш
        if (this.cache.lastUpdate && Date.now() - this.cache.lastUpdate < this.cacheTimeout) {
            console.log('📦 Using cached exchange rates');
            return this.cache;
        }

        const tonRate = await this.fetchTonRate();
        const prices = this.loadPriceFromFile();
        
        // Используем цену с наценкой (sellPricePerStar)
        // 1 Star = sellPricePerStar TON
        // 1 TON = 1 / sellPricePerStar Stars
        const starsPerTon = 1 / prices.sellPricePerStar;

        this.cache = {
            tonRate: tonRate,
            starPriceInTon: prices.sellPricePerStar,
            starsPerTon: starsPerTon,
            lastUpdate: Date.now()
        };

        console.log(`💱 Exchange rates updated:`);
        console.log(`   1 TON = $${tonRate.toFixed(4)}`);
        console.log(`   1 Star = ${prices.sellPricePerStar} TON`);
        console.log(`   1 TON = ${starsPerTon.toFixed(1)} Stars`);

        return this.cache;
    }

    /**
     * Конвертирует TON в Stars
     */
    async tonToStars(tonAmount) {
        const rates = await this.fetchRates();
        return tonAmount * rates.starsPerTon;
    }

    /**
     * Конвертирует Stars в TON
     */
    async starsToTon(starsAmount) {
        const rates = await this.fetchRates();
        return starsAmount * rates.starPriceInTon;
    }

    /**
     * Конвертирует TON в USD
     */
    async tonToUsd(tonAmount) {
        const rates = await this.fetchRates();
        return tonAmount * rates.tonRate;
    }

    /**
     * Получает текущий курс TON/Stars
     */
    async getTonToStarsRate() {
        const rates = await this.fetchRates();
        return rates.tonToStars;
    }

    /**
     * Получает все курсы как объект
     */
    async getAllRates() {
        return await this.fetchRates();
    }

    /**
     * Рассчитывает справедливую цену в Stars для подарка
     * Если подарок стоит X TON, то в Stars он должен стоить X * tonToStars
     */
    async calculateFairStarsPrice(tonPrice) {
        const rates = await this.fetchRates();
        const fairPrice = tonPrice * rates.tonToStars;
        
        return {
            tonPrice: tonPrice,
            tonInUsd: tonPrice * rates.tonRate,
            fairStarsPrice: Math.round(fairPrice),
            tonToStarsRate: rates.tonToStars
        };
    }

    /**
     * Сравнивает цену в TON и Stars, показывает разницу
     */
    async comparePrices(tonPrice, starsPrice) {
        const rates = await this.fetchRates();
        
        // Справедливая цена в Stars
        const fairStarsPrice = tonPrice * rates.tonToStars;
        
        // Разница в процентах
        const priceDifferencePercent = ((starsPrice - fairStarsPrice) / fairStarsPrice) * 100;
        
        // Выгоднее ли покупать за TON
        const isTonBetter = priceDifferencePercent > 0;
        
        return {
            tonPrice,
            starsPrice,
            fairStarsPrice: Math.round(fairStarsPrice),
            priceDifferencePercent: priceDifferencePercent.toFixed(2),
            recommendation: isTonBetter ? 'BUY_FOR_TON' : 'BUY_FOR_STARS',
            savings: isTonBetter 
                ? `Save ${Math.abs(priceDifferencePercent).toFixed(1)}% buying with TON`
                : `Save ${Math.abs(priceDifferencePercent).toFixed(1)}% buying with Stars`,
            tonToStarsRate: rates.tonToStars,
            tonRate: rates.tonRate
        };
    }
}

// Export singleton
export const exchangeRates = new ExchangeRates();
export default exchangeRates;
