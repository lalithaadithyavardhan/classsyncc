// Test Configuration for ClassSync
// This script tests the configuration in different environments

const config = require('./config');

console.log('🧪 Testing ClassSync Configuration...\n');

// Test basic configuration
console.log('📋 Basic Configuration:');
console.log(`   Environment: ${config.NODE_ENV}`);
console.log(`   Port: ${config.PORT}`);
console.log(`   Base URL: ${config.BASE_URL}`);
console.log(`   WebSocket Protocol: ${config.WS_PROTOCOL}`);
console.log(`   MongoDB Enabled: ${config.ENABLE_MONGODB}`);
console.log(`   Bluetooth Enabled: ${config.ENABLE_BLUETOOTH}\n`);

// Test helper functions
console.log('🔧 Helper Functions:');
console.log(`   Is Production: ${config.isProduction()}`);
console.log(`   Is Development: ${config.isDevelopment()}\n`);

// Test URL generation
console.log('🌐 URL Generation:');
console.log(`   WebSocket URL: ${config.getWebSocketUrl()}`);
console.log(`   API URL: ${config.getApiUrl('/api/login')}`);
console.log(`   Custom WebSocket URL: ${config.getWebSocketUrl('example.com')}\n`);

// Test CORS configuration
console.log('🔒 CORS Configuration:');
console.log(`   Allowed Origins: ${config.CORS_ORIGIN.join(', ')}\n`);

// Test database configuration
console.log('🗄️ Database Configuration:');
console.log(`   Database Name: ${config.DB_NAME}`);
console.log(`   Collections: ${Object.keys(config.COLLECTIONS).join(', ')}\n`);

// Test timeouts
console.log('⏱️ Timeout Configuration:');
console.log(`   WebSocket Reconnect Delay: ${config.WEBSOCKET_RECONNECT_DELAY}ms`);
console.log(`   API Timeout: ${config.API_TIMEOUT}ms\n`);

// Environment-specific tests
if (config.isProduction()) {
  console.log('🚀 Production Environment Detected:');
  console.log('   - Using HTTPS/WSS protocols');
  console.log('   - CORS restricted to production domain');
  console.log('   - MongoDB using production credentials');
} else {
  console.log('🛠️ Development Environment Detected:');
  console.log('   - Using HTTP/WS protocols');
  console.log('   - CORS allows localhost origins');
  console.log('   - MongoDB using development credentials');
}

console.log('\n✅ Configuration test completed!');

// Export for use in other tests
module.exports = { config }; 