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
        
        // If sessionId is provided, use new attendance system
        if (sessionId) {
            const session = await AttendanceSession.findById(sessionId);
            if (!session) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'Attendance session not found.'
                });
            }

            const classData = await Class.findById(session.classId);
            const studentDoc = await User.findOne({ roll: roll });
            const isEnrolled = !!studentDoc && studentDoc.branch === classData.branch && studentDoc.year === classData.year && studentDoc.section === classData.section;

            if (!isEnrolled) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'Student not enrolled in this class.'
                });
            }

            const existingRecord = session.attendanceRecords.find(
                record => record.studentRoll === roll && record.period === period
            );
            
            if (existingRecord) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'Attendance already marked for this period.'
                });
            }

            session.attendanceRecords.push({
                studentRoll: roll,
                period,
                status: 'present',
                method: 'bluetooth',
                deviceId,
                rssi: discoveredDevice.rssi
            });
            await session.save();
            
            const facultyWs = connectedClients.get(activeBluetoothSession?.facultyClientId);
            if (facultyWs) {
                facultyWs.send(JSON.stringify({ 
                    type: 'ATTENDANCE_MARKED', 
                    roll, 
                    deviceId,
                    rssi: discoveredDevice.rssi,
                    period,
                    sessionId
                }));
            }
            
            sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: true,
                message: 'Attendance marked successfully!'
            });
        } else {
            // Legacy attendance system
            if (!activeBluetoothSession) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'No active attendance session.'
                });
            }

            const alreadyMarked = await Attendance.findOne({ roll, date: todayStr() });
            if (alreadyMarked) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'Attendance already marked.'
                });
            }

            await Attendance.create({
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

            sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: true,
                message: 'Attendance marked successfully!'
            });
            
            const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
            if (facultyWs) {
                facultyWs.send(JSON.stringify({
                    type: 'ATTENDANCE_MARKED',
                    roll,
                    deviceId
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
    
        const existingSession = await AttendanceSession.findOne({ classId, date });
    if (existingSession) {
            return res.status(400).json({ success: false, message: 'Session already exists for this class today.' });
    }
    
        const session = await AttendanceSession.create({
      classId,
      date,
      periods,
      facultyId
    });
    
    res.json({ success: true, sessionId: session._id, message: 'Attendance session created.' });
  } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create session.' });
    }
});

// Other endpoints refactored for Mongoose...
// ... (You would continue to refactor all other endpoints in a similar fashion)

// ========================================================
//                  NEW ADMIN ATTENDANCE ENDPOINTS
// ========================================================

/**
 * DYNAMIC FILTER OPTIONS ENDPOINT
 * Fetches unique values for filter dropdowns based on parent selections.
 * Example Usage:
 * - /api/filter-options?field=semester
 * - /api/filter-options?field=branch&semester=I%20Semester
 * - /api/filter-options?field=subject&semester=I%20Semester&branch=IT&year=2
 */
app.get('/api/filter-options', async (req, res) => {
    const { field } = req.query;
    console.log(`\n[API HIT] /api/filter-options for field: "${field}"`);
    console.log(`[QUERY PARAMS] All params:`, req.query);
    
    try {
        if (!field) {
            console.log('[ERROR] Missing field parameter');
            return res.status(400).json({ success: false, message: 'A "field" parameter is required.' });
        }

        // Validate field name
        const validFields = ['branch', 'year', 'section', 'semester', 'subject'];
        if (!validFields.includes(field)) {
            console.log(`[ERROR] Invalid field: "${field}". Valid fields are:`, validFields);
            return res.status(400).json({ success: false, message: `Invalid field. Valid fields are: ${validFields.join(', ')}` });
        }

        const filterQuery = {};
        if (req.query.branch) filterQuery.branch = req.query.branch;
        if (req.query.year) filterQuery.year = Number(req.query.year);
        if (req.query.section) filterQuery.section = req.query.section;
        if (req.query.semester) filterQuery.semester = req.query.semester;

        console.log('[QUERYING DB] with filter:', JSON.stringify(filterQuery, null, 2));

        // Check if collection has any data first
        const totalDocs = await Timetable.countDocuments();
        console.log(`[DB INFO] Total documents in timetables collection: ${totalDocs}`);

        if (totalDocs === 0) {
            console.log('[WARNING] No documents found in timetables collection');
            return res.json({ success: true, options: [] });
        }

        // Use .distinct() to get unique values for the requested field
        const options = await Timetable.distinct(field, filterQuery);
        
        console.log(`[QUERY RESULT] Found ${options.length} options for field "${field}":`, options);

        // Sort the options
        options.sort((a, b) => {
            if (field === 'year') {
                return a - b;
            } else {
                return String(a).localeCompare(String(b));
            }
        });

        console.log(`[FINAL RESULT] Returning ${options.length} sorted options:`, options);
        res.json({ success: true, options });

    } catch (err) {
        console.error(`[SERVER ERROR] while fetching filter options for field: "${field}"`, err);
        console.error('[ERROR DETAILS]', err.message);
        res.status(500).json({ success: false, message: 'Server error while fetching filter options.' });
    }
});

/**
 * NEW DYNAMIC FILTER ENDPOINT
 * Fetches a list of subjects based on branch, year, etc. to populate the filter dropdown.
 */
app.get('/api/subjects', async (req, res) => {
    try {
        const { branch, year, semester } = req.query;
        // Require all three filters to get subjects, this ensures accuracy
        if (!branch || !year || !semester) {
            return res.json({ success: true, subjects: [] });
        }
        
        const filter = {
            branch,
            year: Number(year),
            semester
        };

        const subjects = await Timetable.distinct('subject', filter);
        res.json({ success: true, subjects });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch subjects.' });
    }
});

// Helper: normalize input to array
function toNonEmptyArray(value, mapFn) {
  if (value === undefined || value === null || value === '') return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map(v => (mapFn ? mapFn(v) : v)).filter(v => v !== undefined && v !== null && v !== '');
}

// Helper: compute admin attendance summary (supports multi-select and date range)
async function computeAdminSummary({ date, fromDate, toDate, periods, branch, year, section, semester, branches, years, sections, semesters }) {
  const periodNums = (periods || []).map(p => Number(p)).filter(n => !Number.isNaN(n));
  if ((!date && !fromDate && !toDate) || periodNums.length === 0) {
    throw new Error('Select a date or range and at least one period.');
  }

  // Build class filter for Users collection
  const branchArr = toNonEmptyArray(branches?.length ? branches : branch);
  const yearArr = toNonEmptyArray(years?.length ? years : year, v => Number(v));
  const sectionArr = toNonEmptyArray(sections?.length ? sections : section);
  const semesterArr = toNonEmptyArray(semesters?.length ? semesters : semester);

  const classFilter = { role: 'student' };
  if (branchArr.length) classFilter.branch = { $in: branchArr };
  if (yearArr.length) classFilter.year = { $in: yearArr };
  if (sectionArr.length) classFilter.section = { $in: sectionArr };
  if (semesterArr.length) classFilter.semester = { $in: semesterArr };

  const classes = await User.aggregate([
    { $match: classFilter },
    { $group: { _id: { branch: '$branch', year: '$year', section: '$section', semester: '$semester' } } },
    { $sort: { '_id.year': 1, '_id.branch': 1, '_id.section': 1 } }
  ]);

  const summaryData = [];
  const absenteesByClass = {};

  // Build common attendance date filter
  const attendanceDateFilter = {};
  if (date) attendanceDateFilter.date = date;
  if (fromDate || toDate) {
    attendanceDateFilter.date = Object.assign(attendanceDateFilter.date || {}, {
      ...(fromDate ? { $gte: fromDate } : {}),
      ...(toDate ? { $lte: toDate } : {})
    });
  }

  for (const [index, klass] of classes.entries()) {
    const { branch, year, section, semester } = klass._id;
    if (!branch || !year || !section) continue;

    const studentQuery = { role: 'student', branch, year, section, semester };
    const allStudents = await User.find(studentQuery).select('roll');
    const totalStrength = allStudents.length;
    if (totalStrength === 0) continue;

    const attendanceFilter = {
      branch, year, section,
      ...attendanceDateFilter,
      period: { $in: periodNums },
      status: { $regex: /present/i }
    };

    // Count unique students present across selected dates/periods
    const presentRolls = await Attendance.distinct('roll', attendanceFilter);
    const totalPresent = presentRolls.length;

    const allRolls = allStudents.map(s => s.roll);
    const absenteeRolls = allRolls.filter(roll => !presentRolls.includes(roll));

    const className = `${year} ${branch}-${section}`;
    summaryData.push({
      sno: index + 1,
      className,
      totalStrength,
      totalPresent,
      totalAbsentees: Math.max(totalStrength - totalPresent, 0),
      attendancePercent: totalStrength > 0 ? Math.round((totalPresent / totalStrength) * 100) : 0
    });
    absenteesByClass[className] = absenteeRolls;
  }

  // Totals row
  const totals = summaryData.reduce((acc, r) => {
    acc.totalStrength += r.totalStrength;
    acc.totalPresent += r.totalPresent;
    acc.totalAbsentees += r.totalAbsentees;
    return acc;
  }, { totalStrength: 0, totalPresent: 0, totalAbsentees: 0 });
  const totalPercent = totals.totalStrength > 0 ? Math.round((totals.totalPresent / totals.totalStrength) * 100) : 0;

  return { summaryData, absenteesByClass, totals: { ...totals, attendancePercent: totalPercent } };
}

// Summary JSON endpoint (multi-select + date range supported)
app.post('/api/admin/attendance/summary', async (req, res) => {
  try {
    const params = req.body || {};
    const result = await computeAdminSummary(params);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Attendance Summary Error:', err);
    res.status(400).json({ success: false, message: err.message || 'Server error while creating summary.' });
  }
});

// Excel export for admin summary – formatted report
app.post('/api/admin/attendance/summary/excel', async (req, res) => {
  try {
    const params = req.body || {};
    const { summaryData, absenteesByClass, totals } = await computeAdminSummary(params);

    const wb = XLSX.utils.book_new();

    // Build single Report sheet with header + table + totals + absentee sections
    const report = [];
    const rangeLabel = params.date ? params.date : `${params.fromDate || ''}${params.fromDate && params.toDate ? ' to ' : ''}${params.toDate || ''}`;
    report.push(['ADITYA COLLEGE OF ENGINEERING & TECHNOLOGY (A)']);
    report.push(['Aditya Nagar, ADB Road, Surampalem']);
    report.push([`Attendance Report - ${rangeLabel || 'Date Range'}`]);
    report.push([]);

    report.push(['S.No', 'Class', 'Total Strength', 'Total Present', 'No.of Absentees', 'Attendance (%)']);
    summaryData.forEach(r => report.push([r.sno, r.className, r.totalStrength, r.totalPresent, r.totalAbsentees, r.attendancePercent]));
    report.push(['Total', '', totals.totalStrength, totals.totalPresent, totals.totalAbsentees, totals.attendancePercent]);
    report.push([]);

    // Absentees sections
    report.push(['ABSENTEES ROLL NO :']);
    Object.entries(absenteesByClass).forEach(([className, rolls], idx) => {
      report.push([String(idx + 1), className, (rolls || []).join(',')]);
      report.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(report);
    // Simple merges for title lines
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Report');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `attendance_report_${(params.date || params.fromDate || 'today')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Summary Excel Error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to generate Excel.' });
  }
});

// --- Admin Timetable Bulk Update ---
app.post('/api/admin/timetable/bulk-update', async (req, res) => {
  try {
    const { branch, year, section, semester, timetableEntries } = req.body || {};
    if (!branch || !year || !section || !Array.isArray(timetableEntries)) {
      return res.status(400).json({ success: false, message: 'branch, year, section and timetableEntries are required' });
    }

    const yr = Number(year);
    // Remove existing rows for this class
    await Timetable.deleteMany({ branch, year: yr, section });

    // Prepare new rows with required fields
    const rowsToInsert = timetableEntries.map(e => ({
      day: e.day,
      startTime: e.startTime,
      subject: e.subject,
      facultyId: e.facultyId,
      room: e.room,
      branch,
      year: yr,
      section,
      ...(semester ? { semester } : {})
    })).filter(r => r.day && r.startTime && r.subject);

    if (rowsToInsert.length > 0) {
      await Timetable.insertMany(rowsToInsert);
    }

    return res.json({ success: true, inserted: rowsToInsert.length });
  } catch (err) {
    console.error('Timetable bulk update error:', err);
    return res.status(500).json({ success: false, message: 'Server error while saving timetable' });
  }
});

// --- Admin Timetable View ---
app.get('/api/admin/timetable', async (req, res) => {
  try {
    const { branch, year, section, semester } = req.query;
    if (!branch || !year || !section) {
      return res.status(400).json({ success: false, message: 'branch, year and section are required' });
    }
    const filter = { branch, year: Number(year), section };
    if (semester) filter.semester = semester;

    const rows = await Timetable.find(filter).sort({ day: 1, startTime: 1 });
    return res.json({ success: true, timetable: rows });
  } catch (err) {
    console.error('Admin timetable fetch error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching timetable' });
  }
});

// --- Admin User Management ---
app.get('/api/admin/users/count', async (req, res) => {
  try {
    const facultyCount = await User.countDocuments({ role: 'faculty' });
    const studentCount = await User.countDocuments({ role: 'student' });
    
    res.json({ 
      success: true, 
      facultyCount, 
      studentCount 
    });
  } catch (err) {
    console.error('Admin users count API error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({}).sort({ role: 1, name: 1 }).lean();
    res.json({ success: true, users });
  } catch (err) {
    console.error('Users fetch error:', err);
    res.status(500).json({ success: false, message: 'Failed to load users.' });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const { name, email, role, department, roll, password, branch, year, section, semester } = req.body || {};
    if (!name || !role || !roll || !password) {
      return res.status(400).json({ success: false, message: 'name, role, roll and password are required.' });
    }
    const existing = await User.findOne({ roll });
    if (existing) {
      return res.status(409).json({ success: false, message: 'User with this roll already exists.' });
    }
    const user = await User.create({ name, email, role, department, roll, password, branch, year, section, semester });
    const { password: _pw, ...payload } = user.toObject();
    res.json({ success: true, user: payload });
  } catch (err) {
    console.error('User create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
});

app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, department, roll, password, branch, year, section, semester } = req.body || {};
    const update = { name, email, role, department, roll, branch, year, section, semester };
    if (!password || String(password).trim() === '') {
      // do not update password if empty
      delete update.password;
    } else {
      update.password = password;
    }
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);
    const user = await User.findByIdAndUpdate(id, update, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const { password: _pw, ...payload } = user.toObject();
    res.json({ success: true, user: payload });
  } catch (err) {
    console.error('User update error:', err);
    res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('User delete error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
});

// --- Student Attendance Summary ---
app.get('/api/student/attendance/summary/:roll', async (req, res) => {
  try {
    const { roll } = req.params;
    const user = await User.findOne({ roll, role: 'student' });
    if (!user) return res.status(404).json({ success: false, message: 'Student not found' });

    // Find all classes for the student's cohort
    const classes = await Class.find({ branch: user.branch, year: user.year, section: user.section });
    if (!classes || classes.length === 0) {
      return res.json({ success: true, overall: { attended: 0, total: 0, percentage: 0 }, subjectWise: {} });
    }

    const classIdToSubject = new Map(classes.map(c => [String(c._id), c.subject]));
    const classIds = classes.map(c => c._id);

    // Pull all sessions for these classes
    const sessions = await AttendanceSession.find({ classId: { $in: classIds } }).lean();

    // Overall totals: each period in a session counts as one class
    let totalOverall = 0;
    let attendedOverall = 0;
    const subjectTotals = {}; // subject -> { total, attended }

    for (const session of sessions) {
      const periodsCount = Array.isArray(session.periods) ? session.periods.length : 0;
      const subject = classIdToSubject.get(String(session.classId)) || 'General';
      if (!subjectTotals[subject]) subjectTotals[subject] = { total: 0, attended: 0 };

      totalOverall += periodsCount;
      subjectTotals[subject].total += periodsCount;

      // Count present records for this student in this session
      const records = Array.isArray(session.attendanceRecords) ? session.attendanceRecords : [];
      const presentForStudent = records.filter(r => r.studentRoll === roll).length;
      attendedOverall += presentForStudent;
      subjectTotals[subject].attended += presentForStudent;
    }

    const overall = {
      attended: attendedOverall,
      total: totalOverall,
      percentage: totalOverall > 0 ? Math.round((attendedOverall / totalOverall) * 100) : 0
    };

    const subjectWise = {};
    for (const [subject, stats] of Object.entries(subjectTotals)) {
      subjectWise[subject] = {
        attended: stats.attended,
        total: stats.total,
        percentage: stats.total > 0 ? Math.round((stats.attended / stats.total) * 100) : 0
      };
    }

    res.json({ success: true, overall, subjectWise });
  } catch (err) {
    console.error('Student summary error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute student summary' });
  }
});

// --- List attendance sessions for a faculty (used by student auto-detect) ---
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
