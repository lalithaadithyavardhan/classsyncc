// ClassSync Node.js Back-End (WiFi-based Attendance)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// In-memory demo data
const users = [
  { role: 'student', roll: 'S101', password: 'pass' },
  { role: 'student', roll: 'S102', password: 'pass' },
  { role: 'faculty', roll: 'F201', password: 'pass' },
  { role: 'admin', roll: 'admin', password: 'admin' }
];

let attendanceRecords = [];
let todaySessionActive = false;

// Helper: get today date string
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Helper: Check if IP is local (WiFi/LAN)
function isLocalNetwork(ip) {
  if (!ip) return false;
  // Remove IPv6 prefix if present
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    (
      ip.startsWith('172.') &&
      (() => {
        const n = parseInt(ip.split('.')[1], 10);
        return n >= 16 && n <= 31;
      })()
    )
  );
}

// Login endpoint
app.post('/api/login', (req, res) => {
  const { role, roll, password } = req.body;
  const user = users.find(u => u.role === role && u.roll === roll && u.password === password);
  if (user) {
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Invalid credentials.' });
  }
});

// Start attendance session (faculty)
app.post('/api/attendance/session', (req, res) => {
  todaySessionActive = true;
  // Optionally clear today's attendance for demo
  attendanceRecords = attendanceRecords.filter(r => r.date !== todayStr());
  res.json({ success: true });
});

// Mark attendance (student, via WiFi check)
app.post('/api/attendance/mark', (req, res) => {
  if (!todaySessionActive) {
    return res.json({ success: false, message: 'No active session.' });
  }
  const { roll } = req.body;
  // Get student's IP address
  let ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
  if (Array.isArray(ip)) ip = ip[0];
  if (!isLocalNetwork(ip)) {
    return res.json({ success: false, message: 'You must be connected to the classroom WiFi.' });
  }
  // Prevent duplicate for today
  const already = attendanceRecords.find(r => r.roll === roll && r.date === todayStr());
  if (already) {
    return res.json({ success: false, message: 'Already marked.' });
  }
  attendanceRecords.push({ roll, date: todayStr(), status: 'Present', ip });
  res.json({ success: true });
});

// Manual attendance (faculty)
app.post('/api/attendance/manual', (req, res) => {
  if (!todaySessionActive) {
    return res.json({ success: false, message: 'No active session.' });
  }
  const { roll } = req.body;
  // For manual, faculty's IP is not checked
  const already = attendanceRecords.find(r => r.roll === roll && r.date === todayStr());
  if (already) {
    return res.json({ success: false, message: 'Already marked.' });
  }
  attendanceRecords.push({ roll, date: todayStr(), status: 'Present (Manual)', ip: 'manual' });
  res.json({ success: true });
});

// Get today's attendance (faculty)
app.get('/api/attendance/today', (req, res) => {
  const today = todayStr();
  const attendance = attendanceRecords.filter(r => r.date === today);
  res.json({ attendance });
});

// Get student attendance
app.get('/api/attendance/student/:roll', (req, res) => {
  const { roll } = req.params;
  const attendance = attendanceRecords.filter(r => r.roll === roll);
  res.json({ attendance });
});

// Get all attendance (admin)
app.get('/api/attendance/all', (req, res) => {
  res.json({ attendance: attendanceRecords });
});

// Start server
app.listen(PORT, () => {
  console.log(`ClassSync server running at http://localhost:${PORT}`);
});