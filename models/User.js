const mongoose = require('mongoose');

// User Schema for all roles: student, faculty, admin
const UserSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['student', 'faculty', 'admin'],
    required: true,
    comment: 'User role: student, faculty, or admin'
  },
  name: {
    type: String,
    required: true,
    comment: 'Full name of the user'
  },
  password: {
    type: String,
    required: true,
    comment: 'Hashed password'
  },
  // Unique identifier for students and faculty
  rollNumber: {
    type: String,
    unique: true,
    sparse: true,
    comment: 'Student roll number (unique)'
  },
  facultyId: {
    type: String,
    unique: true,
    sparse: true,
    comment: 'Faculty ID (unique)'
  },
  // Student-specific fields
  branch: {
    type: String,
    comment: 'Branch (for students)'
  },
  year: {
    type: Number,
    comment: 'Year of study (for students)'
  },
  section: {
    type: String,
    comment: 'Section (for students)'
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema); 