import axios from 'axios';
import * as cheerio from 'cheerio';

export class PriceWatcher {
    constructor(db, imageLoader, wss) {
        this.db = db;
        this.imageLoader = imageLoader;
        this.wss = wss;
        this.interval = parseInt(process.env.UPDATE_INTERVAL) || 10000;
        this.intervalId = null;
        this.isRunning = false;
        this.retries = parseInt(process.env.MAX_RETRIES) || 3;
        this.timeout = parseInt(process.env.REQUEST_TIMEOUT) || 10000;
    }

    async fetchGifts() {
        const url = process.env.SOURCE_URL;
        
        try {
            const response = await axios.get(url, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            const $ = cheerio.load(response.data);
            const gifts = [];

            // Parse gifts from the page
            // This is a generic parser - adjust selectors based on actual HTML structure
            $('.gift-item, .product-item, [data-gift]').each((i, elem) => {
                const $elem = $(elem);
                
                const name = $elem.find('.gift-name, .product-name, h3, h4').first().text().trim();
                const priceText = $elem.find('.price, .gift-price, [data-price]').first().text().trim();
                const imageUrl = $elem.find('img').first().attr('src');
                
                // Extract price and currency
                const priceMatch = priceText.match(/(\d+(?:\.\d+)?)\s*(TON|Stars|USD|\$|⭐)/i);
                
                if (name && priceMatch) {
                    const price = parseFloat(priceMatch[1]);
                    let currency = priceMatch[2];
                    
                    // Normalize currency
                    if (currency === '⭐') currency = 'Stars';
                    if (currency === '$') currency = 'USD';
                    
                    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                    
                    gifts.push({
                        id,
                        name,
                        price,
                        currency,
                        image_url: imageUrl ? new URL(imageUrl, url).href : null,
                        source_url: url
                    });
                }
            });

            // Fallback: Parse from tables or specific structures
            if (gifts.length === 0) {
                $('table tr').each((i, row) => {
                    const $row = $(row);
                    const cells = $row.find('td');
                    
                    if (cells.length >= 2) {
                        const name = $(cells[0]).text().trim();
                        const priceText = $(cells[1]).text().trim();
                        const priceMatch = priceText.match(/(\d+(?:\.\d+)?)\s*(TON|Stars|USD|\$|⭐)/i);
                        
                        if (name && priceMatch) {
                            const price = parseFloat(priceMatch[1]);
                            let currency = priceMatch[2];
                            if (currency === '⭐') currency = 'Stars';
                            if (currency === '$') currency = 'USD';
                            
                            gifts.push({
                                id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                                name,
                                price,
                                currency,
                                image_url: null,
                                source_url: url
                            });
                        }
                    }
                });
            }

            return gifts;
        } catch (error) {
            console.error('❌ Error fetching gifts:', error.message);
            throw error;
        }
    }

    async update() {
        if (this.isRunning) {
            console.log('⏭ Update already in progress, skipping...');
            return;
        }

        this.isRunning = true;
        let attempt = 0;

        while (attempt < this.retries) {
            try {
                console.log(`🔄 Fetching gifts data (attempt ${attempt + 1}/${this.retries})...`);
                
                const gifts = await this.fetchGifts();
                console.log(`📦 Found ${gifts.length} gifts`);

                for (const gift of gifts) {
                    const status = await this.db.upsertGift(gift);
                    
                    // Download image if available and not exists
                    if (gift.image_url) {
                        await this.imageLoader.downloadImage(gift.id, gift.image_url);
                    }
                }

                // Broadcast update via WebSocket
                const allGifts = await this.db.getAllGifts();
                this.broadcast({
                    type: 'update',
                    data: allGifts,
                    timestamp: Date.now()
                });

                console.log('✅ Update completed successfully');
                break;

            } catch (error) {
                attempt++;
                console.error(`❌ Attempt ${attempt} failed:`, error.message);
                
                if (attempt >= this.retries) {
                    console.error('🚫 Max retries reached, giving up');
                } else {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    console.log(`⏳ Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        this.isRunning = false;
    }

    broadcast(message) {
        this.wss.clients.forEach(client => {
            if (client.readyState === 1) { // OPEN
                client.send(JSON.stringify(message));
            }
        });
    }

    start() {
        console.log(`🚀 Starting price watcher (interval: ${this.interval}ms)`);
        
        // Initial update
        this.update();
        
        // Schedule updates
        this.intervalId = setInterval(() => {
            this.update();
        }, this.interval);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            console.log('🛑 Price watcher stopped');
        }
    }
}
