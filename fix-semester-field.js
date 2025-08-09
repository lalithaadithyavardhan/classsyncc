// Fix Semester Field Script - Add missing semester field to existing data
const { connectToMongoDB, closeMongoDBConnection } = require('./mongodb-config');
const Timetable = require('./models/Timetable');

async function fixSemesterField() {
    console.log('🔧 FIXING SEMESTER FIELD');
    console.log('=====================================\n');
    
    try {
        // Connect to MongoDB
        console.log('1️⃣ Connecting to MongoDB...');
        await connectToMongoDB();
        console.log('✅ Connected successfully\n');
        
        // Check current state
        console.log('2️⃣ Checking current data...');
        const totalDocs = await Timetable.countDocuments();
        console.log(`📊 Total documents: ${totalDocs}`);
        
        const docsWithoutSemester = await Timetable.countDocuments({ semester: { $exists: false } });
        console.log(`📝 Documents without semester field: ${docsWithoutSemester}`);
        
        if (docsWithoutSemester === 0) {
            console.log('✅ All documents already have semester field');
            return;
        }
        
        // Update documents based on year
        console.log('\n3️⃣ Adding semester field based on year...');
        
        // Year 1 = I Semester, Year 3 = V Semester
        const updateResult1 = await Timetable.updateMany(
            { year: 1, semester: { $exists: false } },
            { $set: { semester: 'I Semester' } }
        );
        console.log(`✅ Updated ${updateResult1.modifiedCount} documents for Year 1 → I Semester`);
        
        const updateResult3 = await Timetable.updateMany(
            { year: 3, semester: { $exists: false } },
            { $set: { semester: 'V Semester' } }
        );
        console.log(`✅ Updated ${updateResult3.modifiedCount} documents for Year 3 → V Semester`);
        
        // Verify the fix
        console.log('\n4️⃣ Verifying the fix...');
        const remainingWithoutSemester = await Timetable.countDocuments({ semester: { $exists: false } });
        console.log(`📝 Documents still without semester: ${remainingWithoutSemester}`);
        
        const semesters = await Timetable.distinct('semester');
        console.log(`🎓 Unique semesters now: ${semesters.join(', ')}`);
        
        console.log('\n✅ Semester field fix completed!');
        
    } catch (error) {
        console.error('❌ Failed to fix semester field:', error);
    } finally {
        await closeMongoDBConnection();
    }
}

// Run the script
if (require.main === module) {
    fixSemesterField();
}

module.exports = { fixSemesterField };
