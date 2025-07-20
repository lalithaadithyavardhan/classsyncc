// Test MongoDB Connection for ClassSync
const { 
  connectToMongoDB, 
  testConnection, 
  insertUser, 
  insertAttendanceRecord,
  findUserByRoll,
  getAttendanceByDate,
  closeMongoDBConnection 
} = require('./mongodb-config');

async function testMongoDBConnection() {
  try {
    console.log('🚀 Testing MongoDB connection...');
    
    // Test basic connection
    const isConnected = await testConnection();
    if (!isConnected) {
      console.log('❌ Connection test failed');
      return;
    }
    
    console.log('✅ Connection test successful!');
    
    // Test inserting a user
    const testUser = {
      roll: 'S101',
      name: 'Test Student',
      role: 'student',
      password: 'testpass',
      deviceId: 'test-device-001',
      createdAt: new Date()
    };
    
    console.log('👤 Inserting test user...');
    await insertUser(testUser);
    
    // Test finding the user
    console.log('🔍 Finding user by roll...');
    const foundUser = await findUserByRoll('S101');
    console.log('Found user:', foundUser);
    
    // Test inserting attendance record
    const testAttendance = {
      roll: 'S101',
      date: new Date().toISOString().slice(0, 10),
      status: 'Present (Test)',
      deviceId: 'test-device-001',
      timestamp: new Date()
    };
    
    console.log('📝 Inserting test attendance record...');
    await insertAttendanceRecord(testAttendance);
    
    // Test getting attendance by date
    console.log('📊 Getting attendance records...');
    const today = new Date().toISOString().slice(0, 10);
    const attendanceRecords = await getAttendanceByDate(today);
    console.log('Attendance records for today:', attendanceRecords);
    
    console.log('✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Close connection
    await closeMongoDBConnection();
  }
}

// Run the test
if (require.main === module) {
  testMongoDBConnection();
}

module.exports = { testMongoDBConnection }; 