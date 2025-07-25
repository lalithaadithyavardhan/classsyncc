const mongoose = require('mongoose');

// Timetable Schema for class schedules
const TimetableSchema = new mongoose.Schema({
  day: {
    type: String,
    required: true,
    comment: 'Day of the week (e.g., Monday)'
  },
  startTime: {
    type: String,
    required: true,
    comment: 'Class start time (e.g., 09:00)'
  },
  endTime: {
    type: String,
    required: true,
    comment: 'Class end time (e.g., 10:00)'
  },
  subject: {
    type: String,
    required: true,
    comment: 'Subject name'
  },
  room: {
    type: String,
    required: true,
    comment: 'Classroom location'
  },
  branch: {
    type: String,
    required: true,
    comment: 'Branch (e.g., CSE)'
  },
  year: {
    type: Number,
    required: true,
    comment: 'Year of study'
  },
  section: {
    type: String,
    required: true,
    comment: 'Section (e.g., A, B)'
  },
  facultyId: {
    type: String,
    required: true,
    comment: 'Faculty ID for the class'
  }
}, { timestamps: true });

module.exports = mongoose.model('Timetable', TimetableSchema); 