// MongoDB Configuration for ClassSync
const { MongoClient } = require('mongodb');
const config = require('./config');

// MongoDB Atlas Connection String
const MONGODB_URI = config.MONGODB_URI;

// Database and Collection names
const DB_NAME = config.classsync;
const COLLECTIONS = config.COLLECTIONS;

// MongoDB Client instance
let client = null;
let db = null;




// Connect to MongoDB
async function connectToMongoDB() {
  try {
    if (!client) {
      client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      
      await client.connect();
      console.log(' Connected to MongoDB Atlas successfully!');
      
      db = client.db(DB_NAME);
      console.log(`Using database: ${DB_NAME}`);
      
      // Create collections if they don't exist
      await createCollections();
    }
    
    return { client, db };
  } catch (error) {
    console.error(' MongoDB connection error:', error);
    throw error;
  }
}

// Create collections if they don't exist
async function createCollections() {
  try {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    for (const collectionName of Object.values(COLLECTIONS)) {
      if (!collectionNames.includes(collectionName)) {
        await db.createCollection(collectionName);
        console.log(` Created collection: ${collectionName}`);
      }
    }
  } catch (error) {
    console.error('Error creating collections:', error);
  }
}

// Get database instance
function getDatabase() {
  if (!db) {
    throw new Error('Database not connected. Call connectToMongoDB() first.');
  }
  return db;
}

// Get collection
function getCollection(collectionName) {
  const database = getDatabase();
  return database.collection(collectionName);
}

// Close MongoDB connection
async function closeMongoDBConnection() {
  try {
    if (client) {
      await client.close();
      client = null;
      db = null;
      console.log(' MongoDB connection closed.');
    }
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
}

// Test connection
async function testConnection() {
  try {
    const { db } = await connectToMongoDB();
    const result = await db.admin().ping();
    console.log(' MongoDB ping result:', result);
    return true;
  } catch (error) {
    console.error(' MongoDB connection test failed:', error);
    return false;
  }
}

// Example usage functions
async function insertUser(userData) {
  try {
    const collection = getCollection(COLLECTIONS.USERS);
    const result = await collection.insertOne(userData);
    console.log(' User inserted:', result.insertedId);
    return result;
  } catch (error) {
    console.error('Error inserting user:', error);
    throw error;
  }
}

async function insertAttendanceRecord(attendanceData) {
  try {
    const collection = getCollection(COLLECTIONS.ATTENDANCE);
    const result = await collection.insertOne(attendanceData);
    console.log(' Attendance record inserted:', result.insertedId);
    return result;
  } catch (error) {
    console.error('Error inserting attendance record:', error);
    throw error;
  }
}

async function findUserByRoll(roll) {
  try {
    const collection = getCollection(COLLECTIONS.USERS);
    const user = await collection.findOne({ roll: roll });
    return user;
  } catch (error) {
    console.error('Error finding user:', error);
    throw error;
  }
}

async function getAttendanceByDate(date) {
  try {
    const collection = getCollection(COLLECTIONS.ATTENDANCE);
    const records = await collection.find({ date: date }).toArray();
    return records;
  } catch (error) {
    console.error('Error getting attendance records:', error);
    throw error;
  }
}

module.exports = {
  connectToMongoDB,
  closeMongoDBConnection,
  getDatabase,
  getCollection,
  testConnection,
  COLLECTIONS,
  insertUser,
  insertAttendanceRecord,
  findUserByRoll,
  getAttendanceByDate
}; 