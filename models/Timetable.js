const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
    day: { type: String, required: true },
    startTime: { type: String, required: true },
    subject: { type: String, required: true },
    facultyId: { type: String, required: true },
    room: String,
    branch: { type: String, required: true },
    year: { type: Number, required: true },
    section: { type: String, required: true },
    semester: String
});

module.exports = mongoose.model('Timetable', timetableSchema, 'timetables'); // The third argument specifies the collection name 