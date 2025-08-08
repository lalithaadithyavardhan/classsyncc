const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true }, // unique but allows null
    role: { type: String, required: true, enum: ['student', 'faculty', 'admin'] },
    department: String,
    roll: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    branch: String,
    year: Number,
    section: String,
    semester: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema); 