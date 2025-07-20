// Test Production Configuration
console.log('🧪 Testing Production Configuration...\n');

// Simulate production environment
process.env.NODE_ENV = 'production';
process.env.PORT = '10000';

// Clear module cache to reload config
delete require.cache[require.resolve('./config')];

const config = require('./config');

console.log('📋 Production Configuration:');
console.log(`   Environment: ${config.NODE_ENV}`);
console.log(`   Port: ${config.PORT}`);
console.log(`   Base URL: ${config.BASE_URL}`);
console.log(`   WebSocket Protocol: ${config.WS_PROTOCOL}`);
console.log(`   Is Production: ${config.isProduction()}`);
console.log(`   CORS Origins: ${config.CORS_ORIGIN.join(', ')}`);

console.log('\n✅ Production configuration test completed!'); 