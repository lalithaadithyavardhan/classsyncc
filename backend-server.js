// --- THIS IS THE FIX ---
// Only load the .env file if we are NOT in a production environment.
// In production (on Render), the environment variables are set directly.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// ClassSync Node.js Back-End (Final Unified Version)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer'); // For handling file uploads
const XLSX = require('xlsx');     // For reading Excel files

// --- Using your existing, excellent MongoDB config ---
const { 
  connectToMongoDB, 
  insertUser, 
  insertAttendanceRecord, 
  findUserByRoll, 
  getAttendanceByDate,
  getCollection,
  COLLECTIONS,
  closeMongoDBConnection,
  // Import the new functions for admin and timetable features
  getUsersByRole,
  insertTimetableEntry,
  findTimetableForStudent,
  findTimetableForFaculty
} = require('./mongodb-config');

const config = require('./config');
const app = express();
const PORT = config.PORT;

// --- Multer Setup ---
// This tells multer to store the uploaded file in memory as a buffer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Create WebSocket server
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize MongoDB connection
async function initializeServer() {
  try {
    await connectToMongoDB();
    console.log('🚀 Server initialized with MongoDB connection');
  } catch (error) {
    console.error('❌ Failed to initialize MongoDB connection:', error);
    process.exit(1);
  }
}

initializeServer();

app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.static(__dirname));

// --- Main App & Admin Portal Routes ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'classsyncc.html'));
});

// ADDED: A new route to serve the admin portal page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-portal.html'));
});


// --- State Management (For live WebSocket sessions) ---
let todaySessionActive = false;
let activeBluetoothSession = null;
let connectedClients = new Map();
let discoveredDevices = new Map();

// Helper
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ========================================================
//                  WebSocket Handlers
// ========================================================

wss.on('connection', (ws, req) => {
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
      handleFacultyScanStart(clientId, data);
      break;
    case 'FACULTY_SCAN_STOP':
      handleFacultyScanStop(clientId, data);
      break;
  }
}

function handleDeviceDiscovery(clientId, data) {
  const { deviceId, deviceName, rssi, roll } = data;
  discoveredDevices.set(deviceId, { deviceId, deviceName, rssi, roll, timestamp: Date.now(), clientId });
  console.log(`Device discovered: ${deviceName} (${deviceId}) - RSSI: ${rssi}`);
  
  if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
    const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
    if (facultyWs) {
      facultyWs.send(JSON.stringify({ type: 'DEVICE_FOUND', device: { deviceId, deviceName, rssi, roll } }));
    }
  }
}

async function handleAttendanceRequest(clientId, data) {
  const { roll, deviceId } = data;
  
  if (!todaySessionActive) {
    return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'No active session.' });
  }
  
  const discoveredDevice = discoveredDevices.get(deviceId);
  if (!discoveredDevice) {
    return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Device not found in classroom range.' });
  }
  
  if (discoveredDevice.rssi < -80) {
    return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Signal too weak.' });
  }
  
  try {
    const student = await findUserByRoll(roll);
    if (!student) {
        return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Student roll number not found.' });
    }

    const collection = getCollection(COLLECTIONS.ATTENDANCE);
    const already = await collection.findOne({ roll, date: todayStr() });

    if (already) {
      return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Attendance already marked for today.' });
    }
    
    await insertAttendanceRecord({
      roll,
      date: todayStr(),
      status: 'Present (Bluetooth)',
      deviceId,
      rssi: discoveredDevice.rssi,
      timestamp: new Date(),
      branch: student.branch,
      year: student.year,
      section: student.section
    });

    sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: true, message: 'Attendance marked successfully!' });
    
    if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
      const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
      if (facultyWs) {
        facultyWs.send(JSON.stringify({ type: 'ATTENDANCE_MARKED', roll, deviceId }));
      }
    }
  } catch (error) {
    console.error('Error saving attendance to MongoDB:', error);
    sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Database error occurred.' });
  }
}

function handleFacultyScanStart(clientId, data) {
  activeBluetoothSession = { facultyClientId: clientId, startTime: Date.now(), discoveredDevices: [] };
  discoveredDevices.clear();
  sendToClient(clientId, { type: 'SCAN_STARTED', message: 'Bluetooth scanning started. Waiting for student devices...' });
  console.log('Faculty started Bluetooth scanning');
}

function handleFacultyScanStop(clientId, data) {
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

// --- User & Auth Endpoints ---
app.post('/api/login', async (req, res) => {
  try {
    const { role, roll, password } = req.body;
    const user = await findUserByRoll(roll);

    if (!user) {
      return res.json({ success: false, message: 'User not found.' });
    }

    const isMatch = (password === user.password); 

    if (isMatch && user.role === role) {
      const userPayload = {
        role: user.role,
        roll: user.roll,
        name: user.name,
        branch: user.branch,
        year: user.year,
        section: user.section
      };
      res.json({ success: true, user: userPayload });
    } else {
      res.json({ success: false, message: 'Invalid credentials.' });
    }
  } catch (error) {
    console.error('Login API Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// --- Timetable Endpoints ---
app.get('/api/timetable/student', async (req, res) => {
    try {
        const { branch, year, section } = req.query; 
        const timetable = await findTimetableForStudent(branch, year, section);
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/timetable/faculty/:facultyId', async (req, res) => {
    try {
        const timetable = await findTimetableForFaculty(req.params.facultyId);
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Attendance Endpoints ---
app.post('/api/attendance/session', (req, res) => {
  todaySessionActive = true;
  res.json({ success: true });
});

app.get('/api/attendance/today', async (req, res) => {
  const today = todayStr();
  const attendance = await getAttendanceByDate(today);
  res.json({ attendance });
});

app.get('/api/attendance/student/:roll', async (req, res) => {
  const { roll } = req.params;
  const collection = getCollection(COLLECTIONS.ATTENDANCE);
  const attendance = await collection.find({ roll }).toArray();
  res.json({ attendance });
});

// --- NEW: STUDENT ATTENDANCE SUMMARY ENDPOINT ---
app.get('/api/student/attendance/summary/:roll', async (req, res) => {
    try {
        const { roll } = req.params;
        const student = await findUserByRoll(roll);
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
        // This logic needs improvement to be more accurate, but works as a demo
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
            overall: {
                attended: attendedClassesOverall,
                total: totalClassesOverall,
                percentage: overallPercentage
            }
        });

    } catch (error) {
        console.error("Attendance Summary Error:", error);
        res.status(500).json({ success: false, message: 'Server error while calculating summary.' });
    }
});


// --- Admin Endpoints ---
app.post('/api/admin/users', async (req, res) => {
    try {
        const userData = req.body;
        const result = await insertUser(userData);
        res.json({ success: true, userId: result.insertedId });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/timetable', async (req, res) => {
    try {
        const result = await insertTimetableEntry(req.body);
        res.json({ success: true, entryId: result.insertedId });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// NEW: TIMETABLE UPLOAD ENDPOINT
app.post('/api/admin/upload/timetable', upload.single('timetableFile'), async (req, res) => {
    try {
        const { branch, year, section } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded.' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const timetableEntries = [];
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        for (const row of jsonData) {
            const time = row.Time;
            for (const day of days) {
                if (row[day]) {
                    const parts = row[day].split('\n');
                    if (parts.length >= 3) {
                        timetableEntries.push({
                            branch,
                            year: parseInt(year),
                            section,
                            day,
                            startTime: time,
                            subject: parts[0].trim(),
                            facultyId: parts[1].trim(),
                            room: parts[2].trim()
                        });
                    }
                }
            }
        }

        if (timetableEntries.length > 0) {
            const collection = getCollection(COLLECTIONS.TIMETABLE);
            await collection.deleteMany({ branch, year: parseInt(year), section });
            await collection.insertMany(timetableEntries);
        }

        res.json({ success: true, message: `${timetableEntries.length} entries uploaded.` });

    } catch (error) {
        console.error('Timetable upload error:', error);
        res.status(500).json({ success: false, message: 'Server error during file processing.' });
    }
});


app.get('/api/admin/attendance', async (req, res) => {
    try {
        const { branch, year, section, date } = req.query;
        const filter = {};
        if (branch) filter.branch = branch;
        if (year) filter.year = Number(year);
        if (section) filter.section = section;
        if (date) filter.date = date;
        
        const collection = getCollection(COLLECTIONS.ATTENDANCE);
        const attendance = await collection.find(filter).toArray();
        res.json({ success: true, attendance });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/admin/attendance/export', async (req, res) => {
    try {
        const collection = getCollection(COLLECTIONS.ATTENDANCE);
        const attendance = await collection.find(req.query).toArray();
        
        const data = attendance.map(a => ({
            'Roll Number': a.roll,
            'Date': a.date,
            'Status': a.status,
            'Timestamp': a.timestamp,
            'Device ID': a.deviceId,
            'Signal (RSSI)': a.rssi
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

// Start server
server.listen(PORT, () => {
  config.logConfig();
  console.log(`🚀 ClassSync Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await closeMongoDBConnection();
  process.exit(0);
});
