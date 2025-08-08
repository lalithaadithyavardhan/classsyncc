// mongodb-config.js
const mongoose = require('mongoose');
const config = require('./config');

// MongoDB Atlas Connection String from your configuration
const MONGODB_URI = config.MONGODB_URI;

/**
 * Connects to the MongoDB database using Mongoose.
 * It checks if a connection is already active before creating a new one.
 */
const connectToMongoDB = async () => {
    // Exit if there's no URI defined
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is not defined in your config. Please check your .env file.');
        process.exit(1);
    }

    try {
        // Only connect if not already connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGODB_URI, {
                dbName: config.DB_NAME,
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000, // Give up after 5 seconds
            });
            console.log('✅ Connected to MongoDB using Mongoose successfully!');
        }
    } catch (error) {
        console.error('❌ Mongoose connection error:', error);
        // Exit the process with an error code
        process.exit(1);
    }
};

/**
 * Closes the active Mongoose connection.
 */
const closeMongoDBConnection = async () => {
    try {
        await mongoose.connection.close();
        console.log('🔌 Mongoose connection closed.');
    } catch (error) {
        console.error('❌ Error closing Mongoose connection:', error);
    }
};

module.exports = {
    connectToMongoDB,
    closeMongoDBConnection,
};
