const mongoose = require('mongoose');

// Attendance Schema for attendance records
const AttendanceSchema = new mongoose.Schema({
  roll: {
    type: String,
    required: true,
    comment: 'Student roll number'
  },
  date: {
    type: String,
    required: true,
    comment: 'Date of attendance (YYYY-MM-DD)'
  },
  status: {
    type: String,
    required: true,
    comment: 'Attendance status (e.g., Present)'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    comment: 'Timestamp of attendance marking'
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Timetable',
    required: true,
    comment: 'Reference to the class (Timetable)'
  }
}, { timestamps: true });

module.exports = mongoose.model('Attendance', AttendanceSchema); 