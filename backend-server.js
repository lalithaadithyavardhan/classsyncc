// backend-server.js
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

// ========================================================
//                  IMPORTS & CONFIG
// ========================================================
const { connectToMongoDB, closeMongoDBConnection } = require('./mongodb-config');
const config = require('./config');

// --- MONGOOSE MODELS ---
// Ensure you have these model files created in a '/models' directory
const User = require('./models/User');
const Timetable = require('./models/Timetable');
const Attendance = require('./models/Attendance');
const Class = require('./models/Class');
const AttendanceSession = require('./models/AttendanceSession');

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
let currentAttendanceSession = null; // Track current faculty attendance session

// Helper function
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
    case 'STUDENT_ATTENDANCE_SIGNAL':
      handleStudentAttendanceSignal(clientId, data);
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
            facultyWs.send(JSON.stringify({
                type: 'DEVICE_FOUND',
                device: { deviceId, deviceName, rssi, roll }
            }));
    }
  }
}

async function handleAttendanceRequest(clientId, data) {
    const { roll, deviceId, sessionId, period } = data;

    // Check if device is in range
    const discoveredDevice = discoveredDevices.get(deviceId);
    if (!discoveredDevice || discoveredDevice.rssi < -80) {
        return sendToClient(clientId, {
            type: 'ATTENDANCE_RESPONSE',
            success: false,
            message: 'Device not in range or signal too weak.'
        });
    }
    
    try {
        const student = await User.findOne({ roll });
        if (!student) {
            return sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: false,
                message: 'Student not found.'
            });
        }
        
        // Check if there's an active faculty attendance session
        if (!currentAttendanceSession) {
            return sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: false,
                message: 'No active attendance session. Please wait for faculty to start.'
            });
        }
        
        // Check if student belongs to the class being marked
        if (student.branch !== currentAttendanceSession.branch || 
            student.year !== currentAttendanceSession.year || 
            student.section !== currentAttendanceSession.section) {
            return sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: false,
                message: 'You are not enrolled in this class.'
            });
        }
        
        // Check if attendance already marked for this session
        const existingRecord = currentAttendanceSession.attendanceRecords.find(
            record => record.roll === roll
        );
        
        if (existingRecord) {
            return sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: false,
                message: 'Attendance already marked for this session.'
            });
        }
        
        // Add to session attendance records
        const attendanceRecord = {
            roll,
            deviceId,
            rssi: discoveredDevice.rssi,
            timestamp: new Date(),
            period: period || 1 // Default to period 1 if not specified
        };
        
        currentAttendanceSession.attendanceRecords.push(attendanceRecord);
        
        // Also add to discovered devices for faculty view
        discoveredDevices.set(deviceId, {
            deviceId,
            deviceName: 'Student Device',
            rssi: discoveredDevice.rssi,
            roll,
            timestamp: Date.now(),
            clientId
        });
        
        sendToClient(clientId, {
            type: 'ATTENDANCE_RESPONSE',
            success: true,
            message: 'Attendance marked successfully!'
        });
        
        // Notify faculty about new attendance
        if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
            const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
            if (facultyWs) {
                facultyWs.send(JSON.stringify({
                    type: 'ATTENDANCE_MARKED',
                    roll,
                    deviceId,
                    rssi: discoveredDevice.rssi,
                    period: attendanceRecord.period,
                    subject: currentAttendanceSession.subject
                }));
            }
        }
        
    } catch (error) {
        console.error('Attendance request error:', error);
        sendToClient(clientId, {
            type: 'ATTENDANCE_RESPONSE',
            success: false,
            message: 'Database error.'
        });
    }
}

// Handle student attendance signals - ensures subject-specific attendance
async function handleStudentAttendanceSignal(clientId, data) {
    const { roll, name, deviceId, timestamp, subject } = data;
    
    try {
        // Check if there's an active faculty attendance session
        if (!currentAttendanceSession) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: 'No active attendance session. Please wait for faculty to start.'
            });
        }
        
        // CRITICAL FIX: Check if student is trying to mark attendance for the correct subject
        if (currentAttendanceSession.subject !== subject) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: `Attendance session is for subject: ${currentAttendanceSession.subject}, not ${subject}. Please wait for the correct subject session.`
            });
        }
        
        // Check if student belongs to the class being marked
        const student = await User.findOne({ roll });
        if (!student) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: 'Student not found.'
            });
        }
        
        if (student.branch !== currentAttendanceSession.branch || 
            student.year !== currentAttendanceSession.year || 
            student.section !== currentAttendanceSession.section) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: 'You are not enrolled in this class.'
            });
        }
        
        // Check if attendance already marked for this session
        const existingRecord = currentAttendanceSession.attendanceRecords.find(
            record => record.roll === roll
        );
        
        if (existingRecord) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: 'Attendance already marked for this session.'
            });
        }
        
        // Add to session attendance records with subject information
        const attendanceRecord = {
            roll,
            name,
            deviceId,
            rssi: -65, // Simulated signal strength
            timestamp: new Date(timestamp),
            period: currentAttendanceSession.periods?.[0] || 1, // Use first selected period
            subject: currentAttendanceSession.subject
        };
        
        currentAttendanceSession.attendanceRecords.push(attendanceRecord);
        
        // Add to discovered devices for faculty view with complete student info
        discoveredDevices.set(deviceId, {
            deviceId,
            deviceName: `Student: ${name}`,
            rssi: -65,
            roll,
            name,
            timestamp: Date.now(),
            clientId,
            subject: currentAttendanceSession.subject
        });
        
        // Send success response to student
        sendToClient(clientId, {
            type: 'STUDENT_SIGNAL_RESPONSE',
            success: true,
            message: `Attendance marked successfully for ${currentAttendanceSession.subject}!`,
            subject: currentAttendanceSession.subject,
            period: attendanceRecord.period
        });
        
        // Notify faculty about new attendance with complete student information
        if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
            const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
            if (facultyWs) {
                facultyWs.send(JSON.stringify({
                    type: 'ATTENDANCE_MARKED',
                    roll,
                    name,
                    deviceId,
                    rssi: -65,
                    period: attendanceRecord.period,
                    subject: currentAttendanceSession.subject,
                    timestamp: attendanceRecord.timestamp
                }));
            }
        }
        
        console.log(`Student ${roll} (${name}) marked attendance for ${currentAttendanceSession.subject}`);
        
    } catch (error) {
        console.error('Student attendance signal error:', error);
        sendToClient(clientId, {
            type: 'STUDENT_SIGNAL_RESPONSE',
            success: false,
            message: 'Database error processing attendance signal.'
        });
    }
}

function handleFacultyScanStart(clientId) {
    activeBluetoothSession = {
        facultyClientId: clientId,
        startTime: Date.now()
    };
    discoveredDevices.clear();
    sendToClient(clientId, {
        type: 'SCAN_STARTED',
        message: 'Bluetooth scanning started...'
    });
    console.log('Faculty started Bluetooth scanning');
}

function handleFacultyScanStop(clientId) {
    activeBluetoothSession = null;
    sendToClient(clientId, {
        type: 'SCAN_STOPPED',
        message: 'Bluetooth scanning stopped.'
    });
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

// --- Authentication ---
app.post('/api/login', async (req, res) => {
  try {
    const { role, roll, password } = req.body;
        const user = await User.findOne({ roll, role });

        if (!user || user.password !== password) { // Still plaintext, but now using Mongoose
      return res.json({ success: false, message: 'Invalid credentials.' });
    }

        const { password: _, ...userPayload } = user.toObject();
    res.json({ success: true, user: userPayload });
  } catch (error) {
    console.error('Login API Error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Change password (current simple plaintext approach)
app.put('/api/user/password', async (req, res) => {
  try {
    const { roll, oldPassword, newPassword } = req.body || {};
    if (!roll || !oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'roll, oldPassword, newPassword are required.' });
    }
    const user = await User.findOne({ roll });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (String(user.password) !== String(oldPassword)) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }
    user.password = String(newPassword);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Failed to update password.' });
  }
});

// --- Timetable Endpoints ---
app.get('/api/timetable/student', async (req, res) => {
    try {
        const { branch, year, section, semester } = req.query;
        const filter = { branch };
        if (year) filter.year = parseInt(year);
        if (section) filter.section = section;
        if (semester) filter.semester = semester;

        const timetable = await Timetable.find(filter);
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// New endpoint for path-based student timetable access
app.get('/api/timetable/student/:branch/:year/:section', async (req, res) => {
    try {
        const { branch, year, section } = req.params;
        const { day, semester } = req.query;
        
        const filter = { 
            branch, 
            year: parseInt(year), 
            section 
        };
        
        if (semester) filter.semester = semester;
        if (day) filter.day = day;

        const timetable = await Timetable.find(filter).sort({ startTime: 1 });
        res.json({ success: true, timetable });
    } catch (err) {
        console.error('Student timetable error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/timetable/faculty/:facultyId', async (req, res) => {
    try {
        const facultyId = req.params.facultyId;
        const facultyUser = await User.findOne({ roll: facultyId, role: 'faculty' });
        
        const candidateIds = [facultyId];
        if (facultyUser && facultyUser.name) candidateIds.push(facultyUser.name);
        
        const regexes = candidateIds.map(v => new RegExp(`^${String(v).trim()}$`, 'i'));
        const filter = { facultyId: { $in: regexes } }; // Simplified regex logic
        
        if (req.query.semester) filter.semester = req.query.semester;
        
        const timetable = await Timetable.find(filter);
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/faculty/names', async (req, res) => {
    try {
        const { facultyIds } = req.body;
        if (!Array.isArray(facultyIds)) {
            return res.status(400).json({ success: false, message: 'Invalid faculty IDs provided.' });
        }
        
        const faculty = await User.find({ roll: { $in: facultyIds }, role: 'faculty' });
        const facultyNames = {};
        faculty.forEach(f => {
            facultyNames[f.roll] = f.name || f.roll;
        });
        
        res.json({ success: true, facultyNames });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Enhanced Faculty Attendance Endpoints ---
const START_TIME_TO_PERIOD = {
    '9:30': 1, '10:20': 2, '11:10': 3, '12:00': 4,
    '1:50': 5, '2:40': 6, '3:30': 7
};

function startTimeToPeriod(startTime) {
  const normalized = String(startTime).split(' ')[0];
  return START_TIME_TO_PERIOD[normalized];
}

async function getOrCreateClassForMapping({ subject, branch, year, section, semester, facultyId, periods }) {
    let existing = await Class.findOne({ subject, branch, year: Number(year), section, semester, facultyId });
  if (!existing) {
        existing = await Class.create({
      subject,
      branch,
            year: Number(year),
            semester: semester || 'I Semester',
      section,
      periods: Array.from(new Set(periods || [])),
      facultyId,
      students: [],
    });
  }
  return existing;
}

// THIS IS THE FIXED ENDPOINT THAT CAUSED THE ORIGINAL ERROR
app.get('/api/faculty/classes/:facultyId', async (req, res) => {
  try {
    const { facultyId } = req.params;
        const facultyUser = await User.findOne({ roll: facultyId, role: 'faculty' });
        
    const candidateIds = [facultyId];
    if (facultyUser && facultyUser.name) candidateIds.push(facultyUser.name);
        
        const regexes = candidateIds.map(v => new RegExp(`^${String(v).trim()}$`, 'i'));
        const timetable = await Timetable.find({ facultyId: { $in: regexes } });

    if (!timetable || timetable.length === 0) {
      return res.json({ success: true, classes: [] });
    }

    const grouped = new Map();
    for (const row of timetable) {
            const key = `${row.subject}|${row.branch}|${row.year}|${row.section}|${row.semester || ''}`;
      if (!grouped.has(key)) {
                grouped.set(key, { ...row.toObject(), periods: new Set() });
      }
            const period = startTimeToPeriod(row.startTime);
      if (period) grouped.get(key).periods.add(period);
    }

    const classes = [];
    for (const [, value] of grouped) {
      const clsDoc = await getOrCreateClassForMapping({
                ...value,
        facultyId,
                periods: Array.from(value.periods)
            });
            classes.push(clsDoc);
    }

    res.json({ success: true, classes });
  } catch (error) {
    console.error('Error fetching faculty classes:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch classes' });
  }
});

app.get('/api/faculty/class/:classId/students', async (req, res) => {
  try {
    const { classId } = req.params;
    const cls = await Class.findById(classId);
        if (!cls) return res.status(404).json({ success: false, error: 'Class not found' });

        const students = await User.find({
      role: 'student',
      branch: cls.branch,
      year: cls.year,
            section: cls.section
        });

        res.json({ success: true, students, classData: cls });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
});

app.post('/api/faculty/attendance/session', async (req, res) => {
  try {
    const { classId, date, periods, facultyId } = req.body;
    
    // Check if session already exists
    const existingSession = await AttendanceSession.findOne({ classId, date });
    if (existingSession) {
      // Instead of blocking, update the existing session with new periods
      console.log(`Session already exists for class ${classId} on ${date}. Updating existing session.`);
      
      const updatedSession = await AttendanceSession.findByIdAndUpdate(
        existingSession._id,
        { 
          periods,
          facultyId,
          updatedAt: new Date()
        },
        { new: true }
      );
      
      return res.json({ 
        success: true, 
        sessionId: updatedSession._id, 
        message: 'Existing session updated successfully.',
        isUpdated: true
      });
    }
    
    // Create new session if none exists
    const session = await AttendanceSession.create({
      classId,
      date,
      periods,
      facultyId
    });
    
    res.json({ success: true, sessionId: session._id, message: 'New attendance session created.' });
  } catch (error) {
    console.error('Error creating/updating attendance session:', error);
    res.status(500).json({ success: false, message: 'Failed to create/update session.' });
  }
});

// Get attendance records for a specific session
app.get('/api/faculty/attendance/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await AttendanceSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }
    
    // Get attendance records for this session
    const attendanceRecords = await Attendance.find({ sessionId });
    
    res.json({ 
      success: true, 
      session: {
        ...session.toObject(),
        attendanceRecords
      }
    });
    
  } catch (error) {
    console.error('Error fetching attendance session:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance session.' });
  }
});

// Get attendance sessions for a faculty
app.get('/api/faculty/attendance/sessions/:facultyId', async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { date } = req.query;
    const filter = { };
    if (facultyId) filter.facultyId = facultyId;
    if (date) filter.date = date;
    const sessions = await AttendanceSession.find(filter).lean();
    res.json({ success: true, sessions });
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ success: false, message: 'Failed to list sessions' });
  }
});

// Get active attendance sessions for students by class and period
app.get('/api/faculty/attendance/sessions', async (req, res) => {
  try {
    const { date, classId, period } = req.query;
    
    if (!date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Date is required' 
      });
    }
    
    const filter = { date, status: 'active' };
    
    // If classId is provided, find sessions for that specific class
    if (classId) {
      // Find classes that match the classId pattern (branch-year-section)
      const [branch, year, section] = classId.split('-');
      if (branch && year && section) {
        const classes = await Class.find({ branch, year, section }).select('_id');
        const classIds = classes.map(c => c._id);
        filter.classId = { $in: classIds };
      }
    }
    
    // If period is provided, find sessions that include that period
    if (period) {
      filter.periods = parseInt(period);
    }
    
    const sessions = await AttendanceSession.find(filter)
      .populate('classId', 'branch year section')
      .lean();
    
    res.json({ success: true, sessions });
  } catch (err) {
    console.error('List student sessions error:', err);
    res.status(500).json({ success: false, message: 'Failed to list sessions' });
  }
});

// Get student attendance status for a specific date
app.get('/api/student/attendance/status', async (req, res) => {
  try {
    const { roll, date } = req.query;
    
    if (!roll || !date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Roll number and date are required' 
      });
    }
    
    // Find attendance records for this student on this date
    const attendance = await Attendance.findOne({ 
      studentRoll: roll, 
      date: date 
    }).populate('facultyId', 'name');
    
    if (attendance) {
      res.json({
        success: true,
        attendance: {
          ...attendance.toObject(),
          facultyName: attendance.facultyId?.name || 'Unknown Faculty'
        }
      });
    } else {
      res.json({
        success: true,
        attendance: null
      });
    }
    
  } catch (error) {
    console.error('Error fetching student attendance status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch attendance status' 
    });
  }
});

// Get student attendance summary with overall and subject-wise statistics
app.get('/api/student/attendance/summary/:roll', async (req, res) => {
  try {
    const { roll } = req.params;
    
    if (!roll) {
      return res.status(400).json({ 
        success: false, 
        message: 'Roll number is required' 
      });
    }
    
    // Get student information to find their class details
    const student = await User.findOne({ roll, role: 'student' });
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }
    
    const { branch, year, section } = student;
    
    // Get student's timetable to know what subjects they should have
    const timetable = await Timetable.find({ 
      branch, 
      year: parseInt(year), 
      section 
    });
    
    // Get all attendance records for this student
    const attendanceRecords = await Attendance.find({ 
      studentRoll: roll 
    }).sort({ date: -1 });
    
    // Calculate overall statistics
    const totalClasses = attendanceRecords.length;
    const attendedClasses = attendanceRecords.filter(record => 
      record.status && record.status.toLowerCase().includes('present')
    ).length;
    const overallPercentage = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0;
    
    // Calculate subject-wise statistics
    const subjectWise = {};
    
    // Get unique subjects from timetable
    const subjects = [...new Set(timetable.map(t => t.subject).filter(Boolean))];
    
    // If no subjects found in timetable, still show attendance data
    if (subjects.length === 0) {
      // Show attendance records without subject mapping
      subjectWise['General Attendance'] = {
        attended: attendedClasses,
        total: totalClasses,
        percentage: overallPercentage
      };
      
      res.json({
        success: true,
        overall: {
          attended: attendedClasses,
          total: totalClasses,
          percentage: overallPercentage
        },
        subjectWise,
        message: 'No timetable data found, showing general attendance'
      });
      return;
    }
    
    for (const subject of subjects) {
      // Find attendance records for this subject by matching dates with timetable
      const subjectAttendance = attendanceRecords.filter(record => {
        // Find timetable entries for this subject
        const subjectTimetableEntries = timetable.filter(t => t.subject === subject);
        
        // Check if the attendance date matches any of the subject's timetable dates
        return subjectTimetableEntries.some(timetableEntry => {
          // For now, we'll consider all attendance records as potentially related to this subject
          // In a more sophisticated system, you might want to link attendance to specific subjects via session IDs
          return true;
        });
      });
      
      const subjectTotal = subjectAttendance.length;
      const subjectAttended = subjectAttendance.filter(record => 
        record.status && record.status.toLowerCase().includes('present')
      ).length;
      const subjectPercentage = subjectTotal > 0 ? Math.round((subjectAttended / subjectTotal) * 100) : 0;
      
      subjectWise[subject] = {
        attended: subjectAttended,
        total: subjectTotal,
        percentage: subjectPercentage
      };
    }
    
    res.json({
      success: true,
      overall: {
        attended: attendedClasses,
        total: totalClasses,
        percentage: overallPercentage
      },
      subjectWise
    });
    
  } catch (error) {
    console.error('Error fetching student attendance summary:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch attendance summary' 
    });
  }
});

// ========================================================
//                  ADMIN TIMETABLE ENDPOINTS
// ========================================================

// Get timetable for admin editing
app.get('/api/admin/timetable', async (req, res) => {
  try {
    const { branch, year, section, semester } = req.query;
    
    if (!branch || !year || !section) {
      return res.status(400).json({ 
        success: false, 
        message: 'Branch, year, and section are required' 
      });
    }
    
    const filter = { branch, year, section };
    if (semester) filter.semester = semester;
    
    const timetable = await Timetable.find(filter).sort({ day: 1, startTime: 1 });
    
    res.json({ 
      success: true, 
      timetable 
    });
    
  } catch (error) {
    console.error('Error fetching admin timetable:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch timetable' 
    });
  }
});

// Bulk update timetable for admin
app.post('/api/admin/timetable/bulk-update', async (req, res) => {
  try {
    const { branch, year, section, semester, updates } = req.body;
    
    if (!branch || !year || !section || !updates || !Array.isArray(updates)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request data' 
      });
    }
    
    const filter = { branch, year, section };
    if (semester) filter.semester = semester;
    
    // Delete existing timetable entries
    await Timetable.deleteMany(filter);
    
    // Insert new entries
    const newEntries = updates.map(update => ({
      ...update,
      branch,
      year,
      section,
      semester: semester || null
    }));
    
    const result = await Timetable.insertMany(newEntries);
    
    res.json({ 
      success: true, 
      message: `Timetable updated successfully. ${result.length} entries created.`,
      count: result.length
    });
    
  } catch (error) {
    console.error('Error updating admin timetable:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update timetable' 
    });
  }
});

// ========================================================
//                  ADMIN USER MANAGEMENT
// ========================================================

// Get all users for admin
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users' 
    });
  }
});

// Create new user
app.post('/api/admin/users', async (req, res) => {
  try {
    const { name, email, role, department, roll, password } = req.body;
    
    if (!name || !email || !role || !roll || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { roll }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email or roll number already exists' 
      });
    }
    
    // Create new user
    const user = new User({
      name,
      email,
      role,
      department,
      roll,
      password: await bcrypt.hash(password, 10)
    });
    
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'User created successfully',
      user: { ...user.toObject(), password: undefined }
    });
    
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create user' 
    });
  }
});

// Update user
app.put('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, role, department, roll, password } = req.body;
    
    if (!name || !email || !role || !roll) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, role, and roll are required' 
      });
    }
    
    const updateData = { name, email, role, department, roll };
    
    // Only update password if provided
    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const user = await User.findByIdAndUpdate(
      userId, 
      updateData, 
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'User updated successfully',
      user
    });
    
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user' 
    });
  }
});

// Delete user
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByIdAndDelete(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user' 
    });
  }
});

// ========================================================
//                  FACULTY ATTENDANCE MARKING
// ========================================================

// Mark student attendance via Bluetooth
app.post('/api/faculty/attendance/mark', async (req, res) => {
  try {
    const { sessionId, studentRoll, deviceId, method, timestamp } = req.body;
    
    if (!sessionId || !studentRoll) {
      return res.status(400).json({ 
        success: false, 
        message: 'Session ID and student roll are required' 
      });
    }
    
    // Get the session to find faculty ID
    const session = await AttendanceSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        message: 'Attendance session not found' 
      });
    }
    
    // Check if attendance already exists for this student in this session
    const existingAttendance = await Attendance.findOne({ 
      sessionId, 
      studentRoll 
    });
    
    if (existingAttendance) {
      // Update existing attendance
      existingAttendance.status = 'present';
      existingAttendance.method = method || 'bluetooth';
      existingAttendance.timestamp = timestamp || new Date();
      existingAttendance.deviceId = deviceId;
      await existingAttendance.save();
      
      res.json({ 
        success: true, 
        message: 'Attendance updated successfully',
        attendance: existingAttendance
      });
    } else {
      // Create new attendance record
      const attendance = new Attendance({
        sessionId,
        studentRoll,
        facultyId: session.facultyId,
        status: 'present',
        method: method || 'bluetooth',
        timestamp: timestamp || new Date(),
        deviceId: deviceId,
        date: session.date
      });
      
      await attendance.save();
      
      res.json({ 
        success: true, 
        message: 'Attendance marked successfully',
        attendance
      });
    }
    
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark attendance' 
    });
  }
});

// Start faculty attendance session with subject and class info
app.post('/api/faculty/attendance/start-session', async (req, res) => {
  try {
    const { subject, branch, year, section, periods, date, facultyId } = req.body;
    
    if (!subject || !branch || !year || !section || !periods || !date || !facultyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required: subject, branch, year, section, periods, date, facultyId' 
      });
    }
    
    // Clear any existing session
    if (currentAttendanceSession) {
      currentAttendanceSession = null;
    }
    
    // Create new session
    currentAttendanceSession = {
      subject,
      branch,
      year,
      section,
      periods: Array.isArray(periods) ? periods : [periods],
      date,
      facultyId,
      startTime: new Date(),
      discoveredDevices: new Map(),
      attendanceRecords: []
    };
    
    // Clear discovered devices
    discoveredDevices.clear();
    
    res.json({ 
      success: true, 
      message: 'Attendance session started successfully',
      session: currentAttendanceSession
    });
    
  } catch (error) {
    console.error('Error starting attendance session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start attendance session' 
    });
  }
});

// Stop faculty attendance session and get final records
app.post('/api/faculty/attendance/stop-session', async (req, res) => {
  try {
    if (!currentAttendanceSession) {
      return res.status(400).json({ 
        success: false, 
        message: 'No active attendance session' 
      });
    }
    
    // Mark session as paused (not completed yet)
    currentAttendanceSession.endTime = new Date();
    currentAttendanceSession.status = 'paused';
    
    // Get collected attendance records (but don't save yet)
    const records = Array.from(currentAttendanceSession.attendanceRecords.values());
    
    const sessionData = { ...currentAttendanceSession };
    
    res.json({ 
      success: true, 
      message: 'Attendance session stopped successfully',
      session: sessionData,
      records: records,
      totalRecords: records.length
    });
    
  } catch (error) {
    console.error('Error stopping attendance session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to stop attendance session' 
    });
  }
});

// Submit attendance records manually
app.post('/api/faculty/attendance/submit', async (req, res) => {
  try {
    if (!currentAttendanceSession) {
      return res.status(400).json({ 
        success: false, 
        message: 'No attendance session to submit' 
      });
    }
    
    // Mark session as completed
    currentAttendanceSession.endTime = new Date();
    currentAttendanceSession.status = 'completed';
    
    // Get final attendance records
    const finalRecords = Array.from(currentAttendanceSession.attendanceRecords.values());
    
    if (finalRecords.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No attendance records to submit' 
      });
    }
    
    // Save attendance records to database
    const savedRecords = [];
    for (const record of finalRecords) {
      try {
        const attendance = await Attendance.create({
          studentRoll: record.roll,
          date: currentAttendanceSession.date,
          status: 'Present (Bluetooth)',
          subject: currentAttendanceSession.subject,
          period: record.period,
          method: 'bluetooth',
          deviceId: record.deviceId,
          rssi: record.rssi,
          timestamp: record.timestamp,
          branch: currentAttendanceSession.branch,
          year: currentAttendanceSession.year,
          section: currentAttendanceSession.section,
          facultyId: currentAttendanceSession.facultyId
        });
        savedRecords.push(attendance);
      } catch (error) {
        console.error('Error saving attendance record:', error);
      }
    }
    
    const sessionData = { ...currentAttendanceSession };
    currentAttendanceSession = null;
    
    res.json({ 
      success: true, 
      message: 'Attendance submitted successfully',
      session: sessionData,
      savedRecords: savedRecords,
      totalRecords: savedRecords.length,
      subject: sessionData.subject,
      date: sessionData.date
    });
    
  } catch (error) {
    console.error('Error submitting attendance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit attendance' 
    });
  }
});

// Get current attendance session status
app.get('/api/faculty/attendance/session-status', async (req, res) => {
  try {
    if (!currentAttendanceSession) {
      return res.json({ 
        success: true, 
        active: false,
        message: 'No active session' 
      });
    }
    
    const records = Array.from(currentAttendanceSession.attendanceRecords.values());
    
    res.json({ 
      success: true, 
      active: true,
      session: currentAttendanceSession,
      totalRecords: records.length,
      records: records
    });
    
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get session status' 
    });
  }
});

// ========================================================
//                  SERVER INITIALIZATION
// ========================================================
async function initializeServer() {
  try {
        await connectToMongoDB(); // Connect using Mongoose
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
