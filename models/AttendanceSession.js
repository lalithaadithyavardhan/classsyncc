const mongoose = require('mongoose');

// AttendanceSession Schema for tracking attendance sessions
const AttendanceSessionSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    comment: 'Reference to the class'
  },
  date: {
    type: String,
    required: true,
    comment: 'Date of attendance session (YYYY-MM-DD)'
  },
  periods: [{
    type: Number,
    required: true,
    comment: 'Periods for this session (1-7)'
  }],
  facultyId: {
    type: String,
    required: true,
    comment: 'Faculty ID conducting the session'
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
    comment: 'Session status'
  },
  startTime: {
    type: Date,
    default: Date.now,
    comment: 'Session start time'
  },
  endTime: {
    type: Date,
    comment: 'Session end time'
  },
  attendanceRecords: [{
    studentRoll: {
      type: String,
      required: true,
      comment: 'Student roll number'
    },
    period: {
      type: Number,
      required: true,
      comment: 'Period number (1-7)'
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late'],
      default: 'present',
      comment: 'Attendance status'
    },
    timestamp: {
      type: Date,
      default: Date.now,
      comment: 'When attendance was marked'
    },
    method: {
      type: String,
      enum: ['bluetooth', 'manual'],
      default: 'bluetooth',
      comment: 'How attendance was marked'
    },
    deviceId: {
      type: String,
      comment: 'Bluetooth device ID (if applicable)'
    },
    rssi: {
      type: Number,
      comment: 'Signal strength (if bluetooth)'
    }
  }]
}, { timestamps: true });

// Create indexes for efficient querying
AttendanceSessionSchema.index({ classId: 1, date: 1 });
AttendanceSessionSchema.index({ facultyId: 1, date: 1 });

module.exports = mongoose.model('AttendanceSession', AttendanceSessionSchema);
