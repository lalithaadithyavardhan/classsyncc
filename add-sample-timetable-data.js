// Add Sample Timetable Data Script
const { connectToMongoDB, closeMongoDBConnection } = require('./mongodb-config');
const Timetable = require('./models/Timetable');

async function addSampleTimetableData() {
    console.log('📝 ADDING SAMPLE TIMETABLE DATA');
    console.log('=====================================\n');
    
    try {
        // Connect to MongoDB
        console.log('1️⃣ Connecting to MongoDB...');
        await connectToMongoDB();
        console.log('✅ Connected successfully\n');
        
        // Clear existing data (optional - uncomment if you want to start fresh)
        // console.log('🗑️ Clearing existing timetable data...');
        // await Timetable.deleteMany({});
        // console.log('✅ Cleared existing data\n');
        
        // Sample timetable data
        const sampleTimetables = [
            // IT Branch - Year 1
            {
                day: 'Monday',
                startTime: '09:00',
                subject: 'Mathematics',
                facultyId: 'FAC001',
                room: 'A101',
                branch: 'IT',
                year: 1,
                section: 'A',
                semester: 'I Semester'
            },
            {
                day: 'Monday',
                startTime: '10:00',
                subject: 'Physics',
                facultyId: 'FAC002',
                room: 'A102',
                branch: 'IT',
                year: 1,
                section: 'A',
                semester: 'I Semester'
            },
            {
                day: 'Monday',
                startTime: '11:00',
                subject: 'Programming',
                facultyId: 'FAC003',
                room: 'LAB1',
                branch: 'IT',
                year: 1,
                section: 'A',
                semester: 'I Semester'
            },
            
            // IT Branch - Year 2
            {
                day: 'Tuesday',
                startTime: '09:00',
                subject: 'Data Structures',
                facultyId: 'FAC004',
                room: 'B201',
                branch: 'IT',
                year: 2,
                section: 'A',
                semester: 'III Semester'
            },
            {
                day: 'Tuesday',
                startTime: '10:00',
                subject: 'Database Systems',
                facultyId: 'FAC005',
                room: 'B202',
                branch: 'IT',
                year: 2,
                section: 'A',
                semester: 'III Semester'
            },
            
            // CSE Branch - Year 1
            {
                day: 'Wednesday',
                startTime: '09:00',
                subject: 'Mathematics',
                facultyId: 'FAC001',
                room: 'C101',
                branch: 'CSE',
                year: 1,
                section: 'A',
                semester: 'I Semester'
            },
            {
                day: 'Wednesday',
                startTime: '10:00',
                subject: 'Computer Science',
                facultyId: 'FAC006',
                room: 'C102',
                branch: 'CSE',
                year: 1,
                section: 'A',
                semester: 'I Semester'
            },
            
            // CSE Branch - Year 2
            {
                day: 'Thursday',
                startTime: '09:00',
                subject: 'Algorithms',
                facultyId: 'FAC007',
                room: 'D201',
                branch: 'CSE',
                year: 2,
                section: 'A',
                semester: 'III Semester'
            },
            
            // ECE Branch - Year 1
            {
                day: 'Friday',
                startTime: '09:00',
                subject: 'Electronics',
                facultyId: 'FAC008',
                room: 'E101',
                branch: 'ECE',
                year: 1,
                section: 'A',
                semester: 'I Semester'
            },
            
            // ECE Branch - Year 2
            {
                day: 'Friday',
                startTime: '10:00',
                subject: 'Digital Electronics',
                facultyId: 'FAC009',
                room: 'E201',
                branch: 'ECE',
                year: 2,
                section: 'A',
                semester: 'III Semester'
            }
        ];
        
        console.log('2️⃣ Inserting sample timetable data...');
        const result = await Timetable.insertMany(sampleTimetables);
        console.log(`✅ Inserted ${result.length} timetable records\n`);
        
        // Verify the data
        console.log('3️⃣ Verifying the data...');
        const totalDocs = await Timetable.countDocuments();
        console.log(`📊 Total documents in timetables collection: ${totalDocs}`);
        
        const branches = await Timetable.distinct('branch');
        console.log(`🏢 Unique branches: ${branches.join(', ')}`);
        
        const years = await Timetable.distinct('year');
        console.log(`📅 Unique years: ${years.join(', ')}`);
        
        const sections = await Timetable.distinct('section');
        console.log(`📚 Unique sections: ${sections.join(', ')}`);
        
        const semesters = await Timetable.distinct('semester');
        console.log(`🎓 Unique semesters: ${semesters.join(', ')}`);
        
        console.log('\n✅ Sample data added successfully!');
        console.log('🎯 Now you can test the dynamic filters in your application.');
        
    } catch (error) {
        console.error('❌ Failed to add sample data:', error);
    } finally {
        await closeMongoDBConnection();
    }
}

// Run the script
if (require.main === module) {
    addSampleTimetableData();
}

module.exports = { addSampleTimetableData };
