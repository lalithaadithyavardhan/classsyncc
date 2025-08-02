// MongoDB Connection String Examples for ClassSync
// This file shows different ways to connect to MongoDB Atlas

// 1. Basic Connection String (replace <password> with your actual password)
const basicConnectionString ="mongodb+srv://adithyasai533:S0pUqDmq0Ax9vhaH@classsync.61o3pi2.mongodb.net/?retryWrites=true&w=majority&appName=classsync";

// 2. Connection String with Environment Variables (recommended for production)
const connectionStringWithEnv = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@classsync.61o3pi2.mongodb.net/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;

// 3. Connection String with specific database and options
const detailedConnectionString = "mongodb+srv://adithyasai533:S0pUqDmq0Ax9vhaH@classsync.61o3pi2.mongodb.net/classsync?retryWrites=true&w=majority&appName=ClassSync&maxPoolSize=10&serverSelectionTimeoutMS=5000";

// 4. Using MongoDB Driver with connection string
//const { MongoClient } = require('mongodb');

async function connectWithString(connectionString) {
  try {
    const client = new MongoClient(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    await client.connect();
    console.log('Connected to MongoDB Atlas!');
    
    const db = client.db('classsync');
    console.log('Using database: classsync');
    
    return { client, db };
  } catch (error) {
    console.error(' Connection failed:', error);
    throw error;
  }
}

// 5. Example usage with your connection string
async function exampleUsage() {
  // Replace <password> with your actual password
  const yourConnectionString = "mongodb+srv://adithyasai533:S0pUqDmq0Ax9vhaH@classsync.61o3pi2.mongodb.net/classsync?retryWrites=true&w=majority";
  
  try {
    const { client, db } = await connectWithString(yourConnectionString);
    
    // Example: Insert a document
    const collection = db.collection('users');
    const result = await collection.insertOne({
      roll: 'S101',
      name: 'John Doe',
      role: 'student',
      createdAt: new Date()
    });
    
    console.log('👤 Inserted user with ID:', result.insertedId);
    
    // Example: Find documents
    const users = await collection.find({ role: 'student' }).toArray();
    console.log('📋 Found students:', users.length);
    
    // Close connection
    await client.close();
    console.log('🔌 Connection closed');
    
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// 6. Environment Variables Setup (create a .env file)
/*
Create a file named .env in your project root with:
MONGODB_USERNAME=adithyasai533
MONGODB_PASSWORD=S0pUqDmq0Ax9vhaH
MONGODB_DATABASE=classsync
MONGODB_CLUSTER=classsync.61o3pi2.mongodb.net
*/

// 7. Connection with environment variables (dotenv example)
// Note: In production, use environment variables set by your hosting platform
// For local development, you can use dotenv by uncommenting the line below:
//require('dotenv').config();

const envConnectionString = `mongodb+srv://${process.env.MONGODB_USERNAME || 'adithyasai533'}:${process.env.MONGODB_PASSWORD || 'S0pUqDmq0Ax9vhaH'}@${process.env.MONGODB_CLUSTER || 'classsync.61o3pi2.mongodb.net'}/${process.env.MONGODB_DATABASE || 'classsync'}?retryWrites=true&w=majority`;

// Export examples
module.exports = {
  basicConnectionString,
  connectionStringWithEnv,
  detailedConnectionString,
  connectWithString,
  exampleUsage,
  envConnectionString
};

// Run example if this file is executed directly
if (require.main === module) {
  console.log('🔗 MongoDB Connection String Examples:');
  console.log('1. Basic:', basicConnectionString.replace('S0pUqDmq0Ax9vhaH', '***'));
  console.log('2. With Env:', connectionStringWithEnv);
  console.log('3. Detailed:', detailedConnectionString.replace('S0pUqDmq0Ax9vhaH', '***'));
  console.log('\n📝 To use these examples:');
  console.log('1. Replace S0pUqDmq0Ax9vhaH with your actual password');
  console.log('2. Install dotenv: npm install dotenv');
  console.log('3. Create a .env file with your credentials');
  console.log('4. Use the mongodb-config.js file for production');
} 