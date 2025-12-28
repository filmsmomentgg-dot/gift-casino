import { DatabaseService } from './services/database.js';

const db = new DatabaseService();
await db.init();

const gifts = await db.getAllGifts();
console.log('Total gifts:', gifts.length);
console.log('\nFirst gift:', gifts[0]);
console.log('\nAll gift IDs:', gifts.map(g => ({ id: g.id, slug: g.slug, name: g.name })));

await db.close();
