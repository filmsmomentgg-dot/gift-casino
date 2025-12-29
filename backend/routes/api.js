import { exchangeRates } from '../services/exchangeRates.js';

// Gift collection image URLs from Fragment CDN
const COLLECTION_IMAGES = {
    'plushpepe': 'https://nft.fragment.com/gift/plushpepe.webp',
    'heartlocket': 'https://nft.fragment.com/gift/heartlocket.webp',
    'bdaycandle': 'https://nft.fragment.com/gift/bdaycandle.webp',
    'berrybox': 'https://nft.fragment.com/gift/berrybox.webp',
    'candycane': 'https://nft.fragment.com/gift/candycane.webp',
    'signetring': 'https://nft.fragment.com/gift/signetring.webp',
    'vintagetv': 'https://nft.fragment.com/gift/vintagetv.webp',
    'homemadecake': 'https://nft.fragment.com/gift/homemadecake.webp',
    'lovepot': 'https://nft.fragment.com/gift/lovepot.webp',
    'starface': 'https://nft.fragment.com/gift/starface.webp'
};

// Get image URL for a gift
function getGiftImageUrl(gift) {
    if (gift.image_path) return gift.image_path;
    if (gift.image_url) return gift.image_url;
    
    const collection = gift.collection?.toLowerCase();
    if (collection && COLLECTION_IMAGES[collection]) {
        return COLLECTION_IMAGES[collection];
    }
    
    // Fallback to Fragment CDN pattern
    if (collection) {
        return `https://nft.fragment.com/gift/${collection}.webp`;
    }
    
    return null;
}

export function initRoutes(app, db, imageLoader, giftSync) {
    
    // Get all gifts
    app.get('/api/gifts', async (req, res) => {
        try {
            const gifts = await db.getAllGifts();
            
            // Add imageUrl to each gift
            const giftsWithImages = gifts.map(gift => ({
                ...gift,
                imageUrl: getGiftImageUrl(gift)
            }));
            
            res.json({
                success: true,
                data: giftsWithImages,
                count: giftsWithImages.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get single gift
    app.get('/api/gifts/:id', async (req, res) => {
        try {
            const gift = await db.getGiftById(req.params.id);
            
            if (!gift) {
                return res.status(404).json({
                    success: false,
                    error: 'Gift not found'
                });
            }

            res.json({
                success: true,
                data: gift
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get price history
    app.get('/api/gifts/:id/history', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const history = await db.getPriceHistory(req.params.id, limit);
            
            res.json({
                success: true,
                data: history,
                count: history.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get synchronizer stats
    app.get('/api/sync/stats', (req, res) => {
        try {
            const stats = giftSync.getStats();
            res.json({ 
                success: true, 
                data: stats 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // Trigger manual sync
    app.post('/api/sync/now', async (req, res) => {
        try {
            await giftSync.syncNow();
            res.json({ 
                success: true, 
                message: 'Manual sync completed',
                stats: giftSync.getStats()
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // Get image loader stats
    app.get('/api/images/stats', (req, res) => {
        try {
            const stats = imageLoader.getStats();
            res.json({ 
                success: true, 
                data: stats 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });

    // Health check
    app.get('/api/health', (req, res) => {
        res.json({
            success: true,
            status: 'running',
            timestamp: Date.now(),
            uptime: process.uptime(),
            services: {
                database: 'ok',
                imageLoader: 'ok',
                synchronizer: 'ok'
            }
        });
    });

    // Get exchange rates (TON/USD/Stars)
    app.get('/api/rates', async (req, res) => {
        try {
            const rates = await exchangeRates.getAllRates();
            res.json({
                success: true,
                data: {
                    tonToUsd: rates.tonRate,
                    starPriceInTon: rates.starPriceInTon,
                    starsPerTon: rates.starsPerTon,
                    tonToStars: rates.starsPerTon,
                    lastUpdate: rates.lastUpdate
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Convert TON to Stars
    app.get('/api/rates/convert', async (req, res) => {
        try {
            const { ton, stars } = req.query;
            
            if (ton) {
                const tonAmount = parseFloat(ton);
                const starsResult = await exchangeRates.tonToStars(tonAmount);
                const usdResult = await exchangeRates.tonToUsd(tonAmount);
                
                res.json({
                    success: true,
                    data: {
                        ton: tonAmount,
                        stars: Math.round(starsResult),
                        usd: usdResult.toFixed(2)
                    }
                });
            } else if (stars) {
                const starsAmount = parseFloat(stars);
                const tonResult = await exchangeRates.starsToTon(starsAmount);
                
                res.json({
                    success: true,
                    data: {
                        stars: starsAmount,
                        ton: tonResult.toFixed(4),
                        usd: (starsAmount * 0.02).toFixed(2)
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: 'Provide either "ton" or "stars" query parameter'
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Compare gift price in TON vs Stars
    app.get('/api/rates/compare', async (req, res) => {
        try {
            const { ton_price, stars_price } = req.query;
            
            if (!ton_price || !stars_price) {
                return res.status(400).json({
                    success: false,
                    error: 'Provide both "ton_price" and "stars_price" query parameters'
                });
            }
            
            const comparison = await exchangeRates.comparePrices(
                parseFloat(ton_price),
                parseFloat(stars_price)
            );
            
            res.json({
                success: true,
                data: comparison
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Calculate fair Stars price for TON amount
    app.get('/api/rates/fair-price', async (req, res) => {
        try {
            const { ton_price } = req.query;
            
            if (!ton_price) {
                return res.status(400).json({
                    success: false,
                    error: 'Provide "ton_price" query parameter'
                });
            }
            
            const fairPrice = await exchangeRates.calculateFairStarsPrice(parseFloat(ton_price));
            
            res.json({
                success: true,
                data: fairPrice
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
}
