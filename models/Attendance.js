const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    roll: { type: String, required: true },
    date: { type: String, required: true },
    status: { type: String, required: true },
    period: Number,
    subject: String,
    method: String,
    deviceId: String,
    rssi: Number,
    timestamp: { type: Date, default: Date.now },
    branch: String,
    year: Number,
    section: String,
    facultyId: String
});

// Create a compound index to prevent duplicate entries for the same student, date, and period
attendanceSchema.index({ roll: 1, date: 1, period: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Attendance', attendanceSchema, 'attendances'); 