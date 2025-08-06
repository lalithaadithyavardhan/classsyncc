// --- THIS IS THE FIX ---
// Only load the .env file if we are NOT in a production environment.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// ========================================================
//                  DEPENDENCIES
// ========================================================
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const XLSX = require('xlsx');
// const bcrypt = require('bcryptjs'); // Reverted to plaintext, so bcrypt is not needed
const { ObjectId } = require('mongodb');

// ========================================================
//                  IMPORTS & CONFIG
// ========================================================
const { 
  connectToMongoDB, 
  getCollection,
  COLLECTIONS,
  closeMongoDBConnection,
} = require('./mongodb-config');

const config = require('./config');
const app = express();
const PORT = config.PORT;

// ========================================================
//                  SERVER SETUP
// ========================================================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ========================================================
//                  STATE MANAGEMENT
// ========================================================
let activeBluetoothSession = null;
let connectedClients = new Map();
let discoveredDevices = new Map();

// Helper
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ========================================================
//                  WEBSOCKET HANDLERS
// ========================================================
wss.on('connection', (ws) => {
  const clientId = uuidv4();
  connectedClients.set(clientId, ws);
  console.log(`Client connected: ${clientId}`);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(clientId, data);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    connectedClients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
});

function handleWebSocketMessage(clientId, data) {
  switch (data.type) {
    case 'BLUETOOTH_DEVICE_DISCOVERED':
      handleDeviceDiscovery(clientId, data);
      break;
    case 'ATTENDANCE_REQUEST':
      handleAttendanceRequest(clientId, data);
      break;
    case 'FACULTY_SCAN_START':
      handleFacultyScanStart(clientId);
      break;
    case 'FACULTY_SCAN_STOP':
      handleFacultyScanStop(clientId);
      break;
  }
}

function handleDeviceDiscovery(clientId, data) {
  const { deviceId, deviceName, rssi, roll } = data;
  discoveredDevices.set(deviceId, { deviceId, deviceName, rssi, roll, timestamp: Date.now(), clientId });
  if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
    const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
    if (facultyWs) {
      facultyWs.send(JSON.stringify({ type: 'DEVICE_FOUND', device: { deviceId, deviceName, rssi, roll } }));
    }
  }
}

async function handleAttendanceRequest(clientId, data) {
    const { roll, deviceId } = data;
    const usersCollection = getCollection(COLLECTIONS.USERS);
    const attendanceCollection = getCollection(COLLECTIONS.ATTENDANCE);

    if (!activeBluetoothSession) {
        return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'No active attendance session.' });
    }
    
    const discoveredDevice = discoveredDevices.get(deviceId);
    if (!discoveredDevice || discoveredDevice.rssi < -80) {
        return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Device not in range or signal too weak.' });
    }
    
    try {
        const student = await usersCollection.findOne({ roll });
        if (!student) {
            return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Student not found.' });
        }
        
        const alreadyMarked = await attendanceCollection.findOne({ roll, date: todayStr() });
        if (alreadyMarked) {
            return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Attendance already marked.' });
        }

        await attendanceCollection.insertOne({
            roll, date: todayStr(), status: 'Present (Bluetooth)', deviceId,
            rssi: discoveredDevice.rssi, timestamp: new Date(),
            branch: student.branch, year: student.year, section: student.section
        });

        sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: true, message: 'Attendance marked successfully!' });
        
        const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
        if (facultyWs) {
            facultyWs.send(JSON.stringify({ type: 'ATTENDANCE_MARKED', roll, deviceId }));
        }
    } catch (error) {
        console.error('Attendance request error:', error);
        sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Database error.' });
    }
}

function handleFacultyScanStart(clientId) {
  activeBluetoothSession = { facultyClientId: clientId, startTime: Date.now() };
  discoveredDevices.clear();
  sendToClient(clientId, { type: 'SCAN_STARTED', message: 'Bluetooth scanning started...' });
  console.log('Faculty started Bluetooth scanning');
}

function handleFacultyScanStop(clientId) {
  activeBluetoothSession = null;
  sendToClient(clientId, { type: 'SCAN_STOPPED', message: 'Bluetooth scanning stopped.' });
  console.log('Faculty stopped Bluetooth scanning');
}

function sendToClient(clientId, message) {
  const ws = connectedClients.get(clientId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// ========================================================
//                  API ENDPOINTS
// ========================================================

// --- Main App Route ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'classsyncc.html'));
});

// --- Authentication (REVERTED TO PLAINTEXT) ---
app.post('/api/login', async (req, res) => {
  try {
    const { role, roll, password } = req.body;
    const usersCollection = getCollection(COLLECTIONS.USERS);
    const user = await usersCollection.findOne({ roll, role });

    // REVERTED: Simple password comparison
    if (!user || user.password !== password) {
      return res.json({ success: false, message: 'Invalid credentials.' });
    }

    const { password: _, ...userPayload } = user;
    res.json({ success: true, user: userPayload });
  } catch (error) {
    console.error('Login API Error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// --- Timetable Endpoints ---
app.get('/api/timetable/student', async (req, res) => {
    try {
        const { branch, year, section } = req.query;
        const timetableCollection = getCollection(COLLECTIONS.TIMETABLE);
        const timetable = await timetableCollection.find({ branch, year: parseInt(year), section }).toArray();
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/timetable/faculty/:facultyId', async (req, res) => {
    try {
        const timetableCollection = getCollection(COLLECTIONS.TIMETABLE);
        const timetable = await timetableCollection.find({ facultyId: req.params.facultyId }).toArray();
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// New endpoint to get faculty names by IDs
app.post('/api/faculty/names', async (req, res) => {
    try {
        const { facultyIds } = req.body;
        if (!facultyIds || !Array.isArray(facultyIds)) {
            return res.status(400).json({ success: false, message: 'Invalid faculty IDs provided.' });
        }
        
        const usersCollection = getCollection(COLLECTIONS.USERS);
        const faculty = await usersCollection.find({ 
            roll: { $in: facultyIds }, 
            role: 'faculty' 
        }).toArray();
        
        const facultyNames = {};
        faculty.forEach(f => {
            facultyNames[f.roll] = f.name || f.roll;
        });
        
        res.json({ success: true, facultyNames });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Attendance Endpoints ---
app.post('/api/attendance/session', (req, res) => {
  activeBluetoothSession = { startTime: Date.now() };
  res.json({ success: true, message: "Attendance session started." });
});

app.post('/api/attendance/manual', async (req, res) => {
    const { roll } = req.body;
    const usersCollection = getCollection(COLLECTIONS.USERS);
    const attendanceCollection = getCollection(COLLECTIONS.ATTENDANCE);
    try {
        const student = await usersCollection.findOne({ roll });
        if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

        const alreadyMarked = await attendanceCollection.findOne({ roll, date: todayStr() });
        if (alreadyMarked) return res.status(400).json({ success: false, message: 'Attendance already marked.' });

        await attendanceCollection.insertOne({
            roll, date: todayStr(), status: 'Present (Manual)', timestamp: new Date(),
            branch: student.branch, year: student.year, section: student.section
        });
        res.json({ success: true, message: 'Manual attendance added.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.get('/api/attendance/today', async (req, res) => {
  const attendanceCollection = getCollection(COLLECTIONS.ATTENDANCE);
  const attendance = await attendanceCollection.find({ date: todayStr() }).toArray();
  res.json({ attendance });
});

app.get('/api/student/attendance/summary/:roll', async (req, res) => {
    try {
        const { roll } = req.params;
        const usersCollection = getCollection(COLLECTIONS.USERS);
        const student = await usersCollection.findOne({ roll });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        const timetableCollection = getCollection(COLLECTIONS.TIMETABLE);
        const attendanceCollection = getCollection(COLLECTIONS.ATTENDANCE);

        const timetable = await timetableCollection.find({
            branch: student.branch,
            year: student.year,
            section: student.section
        }).toArray();
        const attendanceRecords = await attendanceCollection.find({ roll: roll }).toArray();

        const subjectTotals = {};
        timetable.forEach(slot => {
            subjectTotals[slot.subject] = (subjectTotals[slot.subject] || 0) + 1;
        });

        const subjectAttended = {};
        attendanceRecords.forEach(record => {
            const dayOfWeek = new Date(record.timestamp).toLocaleString('en-us', { weekday: 'long' });
            const classOnDay = timetable.find(slot => slot.day === dayOfWeek);
            if(classOnDay){
                subjectAttended[classOnDay.subject] = (subjectAttended[classOnDay.subject] || 0) + 1;
            }
        });
        
        const summary = {};
        let totalClassesOverall = 0;
        let attendedClassesOverall = 0;
        for (const subject in subjectTotals) {
            const total = subjectTotals[subject];
            const attended = subjectAttended[subject] || 0;
            summary[subject] = {
                attended: attended,
                total: total,
                percentage: total > 0 ? Math.round((attended / total) * 100) : 0
            };
            totalClassesOverall += total;
            attendedClassesOverall += attended;
        }
        const overallPercentage = totalClassesOverall > 0 ? Math.round((attendedClassesOverall / totalClassesOverall) * 100) : 0;
        res.json({
            success: true,
            subjectWise: summary,
            overall: { attended: attendedClassesOverall, total: totalClassesOverall, percentage: overallPercentage }
        });
    } catch (error) {
        console.error("Attendance Summary Error:", error);
        res.status(500).json({ success: false, message: 'Server error while calculating summary.' });
    }
});

// ========================================================
//          ADMIN FEATURES - API ENDPOINTS
// ========================================================

// --- User Management (CRUD with Plaintext Passwords) ---

app.get('/api/admin/users', async (req, res) => {
    try {
        const usersCollection = getCollection(COLLECTIONS.USERS);
        const users = await usersCollection.find({}).toArray();
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch users.' });
    }
});

app.post('/api/admin/users', async (req, res) => {
    try {
        const { name, email, role, department, roll, password } = req.body;
        if (!name || !role || !roll || !password) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }
        const usersCollection = getCollection(COLLECTIONS.USERS);
        
        const existingUser = await usersCollection.findOne({ roll });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User with this ID already exists.' });
        }

        // REVERTED: Save password directly as plaintext
        const result = await usersCollection.insertOne({
            name, email, role, department, roll, password: password, createdAt: new Date()
        });
        res.status(201).json({ success: true, userId: result.insertedId });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create user.' });
    }
});

app.put('/api/admin/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, department, roll, password } = req.body;
        const usersCollection = getCollection(COLLECTIONS.USERS);
        
        const updateData = { name, email, role, department, roll };

        // REVERTED: If a new password is provided, save it as plaintext
        if (password) {
            updateData.password = password;
        }

        const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.json({ success: true, message: 'User updated successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update user.' });
    }
});

app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const usersCollection = getCollection(COLLECTIONS.USERS);
        const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete user.' });
    }
});

// --- Interactive Timetable Editor ---

app.post('/api/admin/timetable/bulk-update', async (req, res) => {
    try {
        const { branch, year, section, timetableEntries } = req.body;
        const timetableCollection = getCollection(COLLECTIONS.TIMETABLE);

        await timetableCollection.deleteMany({
            branch,
            year: parseInt(year),
            section
        });

        if (timetableEntries && timetableEntries.length > 0) {
            const entriesToInsert = timetableEntries.map(entry => ({
                ...entry,
                branch,
                year: parseInt(year),
                section
            }));
            await timetableCollection.insertMany(entriesToInsert);
        }

        res.json({ success: true, message: `Timetable for ${branch} ${year}-${section} updated successfully.` });
    } catch (error) {
        console.error("Timetable bulk update error:", error);
        res.status(500).json({ success: false, message: 'Server error during timetable update.' });
    }
});

// --- Attendance Reporting ---

app.get('/api/admin/attendance/export', async (req, res) => {
    try {
        const { branch, year, section, date } = req.query;
        const filter = {};
        if (branch) filter.branch = branch;
        if (year) filter.year = Number(year);
        if (section) filter.section = section;
        if (date) filter.date = date;

        const collection = getCollection(COLLECTIONS.ATTENDANCE);
        const attendance = await collection.find(filter).toArray();
        
        const data = attendance.map(a => ({
            'Roll Number': a.roll, 'Date': a.date, 'Status': a.status,
            'Timestamp': a.timestamp, 'Device ID': a.deviceId, 'Signal (RSSI)': a.rssi,
            'Branch': a.branch, 'Year': a.year, 'Section': a.section
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', 'attachment; filename="attendance.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error("Export Error:", err);
        res.status(500).json({ success: false, message: 'Server error during export' });
    }
});


// ========================================================
//                  SERVER INITIALIZATION
// ========================================================
async function initializeServer() {
  try {
    await connectToMongoDB();
    server.listen(PORT, () => {
      config.logConfig();
      console.log(`🚀 ClassSync Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize server:', error);
    process.exit(1);
  }
}

initializeServer();

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await closeMongoDBConnection();
  process.exit(0);
});
