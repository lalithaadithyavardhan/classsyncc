const mongoose = require('mongoose');

// Class Schema for managing class-subject-period combinations
const ClassSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
    comment: 'Subject name (e.g., JAVA, Coding, JA LAB)'
  },
  branch: {
    type: String,
    required: true,
    comment: 'Branch (e.g., B.Tech)'
  },
  year: {
    type: Number,
    required: true,
    comment: 'Year of study (e.g., II, III)'
  },
  semester: {
    type: String,
    required: true,
    comment: 'Semester (e.g., I Semester)'
  },
  section: {
    type: String,
    required: true,
    comment: 'Section (e.g., Sec-A, Sec-B, Sec-C)'
  },
  periods: [{
    type: Number,
    required: true,
    comment: 'Period numbers (1-7)'
  }],
  facultyId: {
    type: String,
    required: true,
    comment: 'Faculty ID who teaches this class'
  },
  students: [{
    type: String,
    comment: 'Array of student roll numbers enrolled in this class'
  }],
  isActive: {
    type: Boolean,
    default: true,
    comment: 'Whether this class is currently active'
  }
}, { timestamps: true });

// Create a compound index for efficient querying
ClassSchema.index({ subject: 1, branch: 1, year: 1, section: 1 });

module.exports = mongoose.model('Class', ClassSchema);
