import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ImageLoader {
    constructor(db) {
        this.db = db;
        this.assetsPath = path.resolve(__dirname, '../../assets/gifts');
        this.downloadQueue = [];
        this.isProcessing = false;
        this.maxConcurrent = 3;
        this.retryAttempts = 3;
        this.retryDelay = 2000;
        
        // Create assets directory if not exists
        if (!fs.existsSync(this.assetsPath)) {
            fs.mkdirSync(this.assetsPath, { recursive: true });
            console.log(`📁 Created directory: ${this.assetsPath}`);
        }
    }

    /**
     * Добавить изображение в очередь на скачивание
     */
    async queueDownload(giftId, imageUrl) {
        const imagePath = this.getLocalPath(giftId);
        const relativeImagePath = this.getRelativePath(giftId);

        // Проверяем, существует ли уже
        if (fs.existsSync(imagePath)) {
            console.log(`⏭  Image already exists: ${giftId}.png`);
            return relativeImagePath;
        }

        // Добавляем в очередь
        return new Promise((resolve, reject) => {
            this.downloadQueue.push({
                giftId,
                imageUrl,
                resolve,
                reject
            });
            
            this.processQueue();
        });
    }

    /**
     * Обработка очереди скачивания
     */
    async processQueue() {
        if (this.isProcessing || this.downloadQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.downloadQueue.length > 0) {
            const batch = this.downloadQueue.splice(0, this.maxConcurrent);
            
            await Promise.allSettled(
                batch.map(item => this.downloadWithRetry(item))
            );
        }

        this.isProcessing = false;
    }

    /**
     * Скачивание с повторными попытками
     */
    async downloadWithRetry({ giftId, imageUrl, resolve, reject }) {
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const result = await this.downloadImage(giftId, imageUrl);
                resolve(result);
                return;
            } catch (error) {
                console.warn(`⚠️  Download attempt ${attempt}/${this.retryAttempts} failed for ${giftId}`);
                
                if (attempt === this.retryAttempts) {
                    reject(error);
                    return;
                }
                
                await new Promise(resolve => 
                    setTimeout(resolve, this.retryDelay * attempt)
                );
            }
        }
    }

    /**
     * Скачать изображение
     */
    async downloadImage(giftId, imageUrl) {
        const imagePath = this.getLocalPath(giftId);
        const relativeImagePath = this.getRelativePath(giftId);

        console.log(`📥 Downloading: ${giftId} from ${imageUrl}`);
        
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'image/png,image/webp,image/*,*/*;q=0.8',
                'Referer': 'https://fragment.com/'
            }
        });

        // Проверка mime-type
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
            throw new Error(`Invalid content type: ${contentType}`);
        }

        // Проверка размера
        if (response.data.length < 100) {
            throw new Error('Image file too small');
        }

        // Сохранение файла
        fs.writeFileSync(imagePath, response.data);
        
        // Проверка целостности
        const hash = crypto.createHash('md5').update(response.data).digest('hex');
        console.log(`✅ Image saved: ${giftId}.png (${(response.data.length / 1024).toFixed(2)} KB, hash: ${hash.substring(0, 8)})`);
        
        // Обновление БД
        if (this.db) {
            await this.db.updateImagePath(giftId, relativeImagePath);
        }
        
        return relativeImagePath;
    }

    /**
     * Получить локальный путь к файлу
     */
    getLocalPath(giftId) {
        return path.join(this.assetsPath, `${giftId}.png`);
    }

    /**
     * Получить относительный путь
     */
    getRelativePath(giftId) {
        return `/assets/gifts/${giftId}.png`;
    }

    /**
     * Проверить существование изображения
     */
    imageExists(giftId) {
        return fs.existsSync(this.getLocalPath(giftId));
    }

    /**
     * Получить путь к изображению (если существует)
     */
    getImagePath(giftId) {
        return this.imageExists(giftId) ? this.getRelativePath(giftId) : null;
    }

    /**
     * Удалить изображение
     */
    deleteImage(giftId) {
        const imagePath = this.getLocalPath(giftId);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`🗑  Deleted image: ${giftId}.png`);
            return true;
        }
        return false;
    }

    /**
     * Получить статистику
     */
    getStats() {
        const files = fs.readdirSync(this.assetsPath);
        const totalSize = files.reduce((sum, file) => {
            const filePath = path.join(this.assetsPath, file);
            return sum + fs.statSync(filePath).size;
        }, 0);

        return {
            totalImages: files.length,
            totalSize: totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            queueSize: this.downloadQueue.length
        };
    }
}

