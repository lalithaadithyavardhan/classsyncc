# MongoDB Integration for ClassSync

This guide explains how to set up and use MongoDB Atlas with your ClassSync application.

## 🔗 Connection String

Your MongoDB Atlas connection string is:
```
mongodb+srv://adithyasai533:<password>@classsync.61o3pi2.mongodb.net/classsync?retryWrites=true&w=majority
```

## 📋 Prerequisites

1. **MongoDB Atlas Account**: You already have a cluster at `classsync.61o3pi2.mongodb.net`
2. **Node.js**: Make sure you have Node.js installed
3. **Dependencies**: The required packages are already installed

## 🚀 Quick Start

### 1. Set up Environment Variables (Recommended)

Create a `.env` file in your project root:

```env
MONGODB_USERNAME=adithyasai533
MONGODB_PASSWORD=your_actual_password_here
MONGODB_DATABASE=classsync
MONGODB_CLUSTER=classsync.61o3pi2.mongodb.net
```

### 2. Update the Connection String

In `mongodb-config.js`, replace `<password>` with your actual password:

```javascript
const MONGODB_URI = "mongodb+srv://adithyasai533:YOUR_ACTUAL_PASSWORD@classsync.61o3pi2.mongodb.net/classsync?retryWrites=true&w=majority";
```

### 3. Test the Connection

Run the test file to verify your connection:

```bash
node test-mongodb.js
```

## 📁 Database Collections

The application will automatically create these collections:

- **users**: Store user information (students, faculty, admin)
- **attendance**: Store attendance records
- **sessions**: Store class session information
- **devices**: Store Bluetooth device information

## 🔧 Usage Examples

### Basic Connection

```javascript
const { connectToMongoDB, insertUser, findUserByRoll } = require('./mongodb-config');

// Connect to MongoDB
await connectToMongoDB();

// Insert a user
await insertUser({
  roll: 'S101',
  name: 'John Doe',
  role: 'student',
  password: 'password123',
  deviceId: 'device-001'
});

// Find a user
const user = await findUserByRoll('S101');
```

### Insert Attendance Record

```javascript
const { insertAttendanceRecord } = require('./mongodb-config');

await insertAttendanceRecord({
  roll: 'S101',
  date: '2024-01-15',
  status: 'Present (Bluetooth)',
  deviceId: 'device-001',
  rssi: -65,
  timestamp: new Date()
});
```

### Get Attendance Records

```javascript
const { getAttendanceByDate } = require('./mongodb-config');

const today = new Date().toISOString().slice(0, 10);
const records = await getAttendanceByDate(today);
```

## 🛠️ Integration with Backend

The MongoDB integration is already added to your `backend-server.js`. The server will:

1. **Connect to MongoDB** on startup
2. **Save attendance records** to the database
3. **Maintain backward compatibility** with in-memory storage
4. **Handle graceful shutdown** and close connections

## 🔒 Security Best Practices

1. **Use Environment Variables**: Never hardcode passwords in your code
2. **Network Access**: Ensure your IP is whitelisted in MongoDB Atlas
3. **User Permissions**: Use a dedicated database user with minimal required permissions
4. **Connection Pooling**: The configuration includes connection pooling for better performance

## 🐛 Troubleshooting

### Connection Issues

1. **Check your password**: Make sure the password in the connection string is correct
2. **Network Access**: Verify your IP address is whitelisted in MongoDB Atlas
3. **Cluster Status**: Ensure your MongoDB Atlas cluster is running

### Common Errors

- **"bad auth : authentication failed"**: Check username and password
- **"ECONNREFUSED"**: Check network access and cluster status
- **"ENOTFOUND"**: Check the cluster URL

## 📊 Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  roll: String,        // Student/Faculty roll number
  name: String,        // Full name
  role: String,        // 'student', 'faculty', 'admin'
  password: String,    // Hashed password
  deviceId: String,    // Bluetooth device ID
  createdAt: Date
}
```

### Attendance Collection
```javascript
{
  _id: ObjectId,
  roll: String,        // Student roll number
  date: String,        // Date in YYYY-MM-DD format
  status: String,      // 'Present (Bluetooth)', 'Present (Manual)', etc.
  deviceId: String,    // Device that marked attendance
  rssi: Number,        // Signal strength (for Bluetooth)
  timestamp: Date      // When attendance was marked
}
```

## 🚀 Running the Application

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Access the application**:
   ```
   http://localhost:3000
   ```

3. **Monitor logs** for MongoDB connection status

## 📝 Notes

- The application maintains both MongoDB storage and in-memory storage for backward compatibility
- All attendance records are automatically saved to MongoDB
- The server gracefully handles MongoDB connection errors
- Connection pooling is configured for optimal performance

## 🔗 Useful Links

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [MongoDB Node.js Driver](https://docs.mongodb.com/drivers/node/)
- [MongoDB Connection String Format](https://docs.mongodb.com/manual/reference/connection-string/) 