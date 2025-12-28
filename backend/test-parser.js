import { FragmentParser } from './services/fragmentParser.js';

const parser = new FragmentParser();

console.log('🔍 Testing Fragment.com API...\n');

try {
    const gifts = await parser.getAllGifts();
    console.log(`✅ Found ${gifts.length} gifts`);
    
    if (gifts.length > 0) {
        console.log('\n📦 Sample gift:');
        console.log(JSON.stringify(gifts[0], null, 2));
        
        console.log('\n📋 All gifts:');
        gifts.forEach(gift => {
            console.log(`  - ${gift.name}: ${gift.price} ${gift.currency} (${gift.collection})`);
        });
    }
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
}
