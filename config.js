// Configuration for ClassSync Application
// Handles environment-specific settings for local development vs production

const config = {
  // Server Configuration
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // URLs
  BASE_URL: process.env.NODE_ENV === 'production' 
    ? 'https://classsyncc-derq.onrender.com' 
    : `http://localhost:${process.env.PORT || 3000}`,
  
  // MongoDB Configuration
  // MongoDB Configuration
  //MONGO_URI="mongodb+srv://adithyasai533:S0pUqDmq0Ax9vhaH@classsync.61o3pi2.mongodb.net/?retryWrites=true&w=majority&appName=classsync";
  MONGODB_URI: process.env.MONGODB_URI || "mongodb+srv://adithyasai533:S0pUqDmq0Ax9vhaH@classsync.61o3pi2.mongodb.net/?retryWrites=true&w=majority&appName=classsync",

 //MONGODB_URI: process.env.MONGODB_URI, // <-- REMOVE the "||" and the connection string
  
  // WebSocket Configuration
  WS_PROTOCOL: process.env.NODE_ENV === 'production' ? 'wss:' : 'ws:',
  
  // CORS Configuration
  CORS_ORIGIN: process.env.NODE_ENV === 'production' 
    ? ['https://classsyncc-derq.onrender.com'] 
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Security
  SESSION_SECRET: process.env.SESSION_SECRET || 'classsync-secret-key',
  
  // Features
  ENABLE_BLUETOOTH: process.env.ENABLE_BLUETOOTH !== 'false', // Default true
  ENABLE_MONGODB: process.env.ENABLE_MONGODB !== 'false', // Default true
  
  // Timeouts
  WEBSOCKET_RECONNECT_DELAY: 3000, // 3 seconds
  API_TIMEOUT: 10000, // 10 seconds
  
  // Database
  DB_NAME: 'classsync',
  COLLECTIONS: {
    USERS: 'users',
    ATTENDANCE: 'attendance',
    SESSIONS: 'sessions',
    DEVICES: 'devices'
  }
};

// Helper functions
config.isProduction = () => config.NODE_ENV === 'production';
config.isDevelopment = () => config.NODE_ENV === 'development';

// Get WebSocket URL
config.getWebSocketUrl = (host = null) => {
  if (host) {
    return `${config.WS_PROTOCOL}//${host}`;
  }
  return config.isProduction() 
    ? `${config.WS_PROTOCOL}//${config.BASE_URL.replace(/^https?:\/\//, '')}`
    : `${config.WS_PROTOCOL}//localhost:${config.PORT}`;
};

// Get API URL
config.getApiUrl = (endpoint = '') => {
  const base = config.isProduction() ? config.BASE_URL : `http://localhost:${config.PORT}`;
  return `${base}${endpoint}`;
};

// Log configuration (without sensitive data)
config.logConfig = () => {
  console.log('🔧 ClassSync Configuration:');
  console.log(`   Environment: ${config.NODE_ENV}`);
  console.log(`   Port: ${config.PORT}`);
  console.log(`   Base URL: ${config.BASE_URL}`);
  console.log(`   WebSocket Protocol: ${config.WS_PROTOCOL}`);
  console.log(`   MongoDB: ${config.ENABLE_MONGODB ? 'Enabled' : 'Disabled'}`);
  console.log(`   Bluetooth: ${config.ENABLE_BLUETOOTH ? 'Enabled' : 'Disabled'}`);
};

module.exports = config; 