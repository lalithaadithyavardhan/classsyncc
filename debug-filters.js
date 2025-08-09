// Debug Filters Script - Run this to test the filter functionality
const { connectToMongoDB, closeMongoDBConnection } = require('./mongodb-config');
const Timetable = require('./models/Timetable');

async function debugFilters() {
    console.log('🔍 DEBUGGING DYNAMIC FILTERS');
    console.log('=====================================\n');
    
    try {
        // Step 1: Connect to MongoDB
        console.log('1️⃣ Connecting to MongoDB...');
        await connectToMongoDB();
        console.log('✅ Connected successfully\n');
        
        // Step 2: Check if timetables collection exists and has data
        console.log('2️⃣ Checking timetables collection...');
        const totalDocuments = await Timetable.countDocuments();
        console.log(`📊 Total documents in timetables collection: ${totalDocuments}`);
        
        if (totalDocuments === 0) {
            console.log('❌ NO DATA FOUND! This is the problem.');
            console.log('💡 You need to add some timetable data first.');
            console.log('\n📝 To add sample data, run: node add-sample-timetable-data.js');
            return;
        }
        
        // Step 3: Check the first few documents to see field names
        console.log('\n3️⃣ Checking document structure...');
        const sampleDocs = await Timetable.find().limit(3);
        console.log('📄 Sample documents:');
        sampleDocs.forEach((doc, index) => {
            console.log(`   Document ${index + 1}:`, JSON.stringify(doc.toObject(), null, 2));
        });
        
        // Step 4: Test the distinct queries that the filter uses
        console.log('\n4️⃣ Testing distinct queries...');
        
        // Test branch field
        console.log('🔍 Testing branch field...');
        const branches = await Timetable.distinct('branch');
        console.log(`   Found ${branches.length} unique branches:`, branches);
        
        // Test year field
        console.log('🔍 Testing year field...');
        const years = await Timetable.distinct('year');
        console.log(`   Found ${years.length} unique years:`, years);
        
        // Test section field
        console.log('🔍 Testing section field...');
        const sections = await Timetable.distinct('section');
        console.log(`   Found ${sections.length} unique sections:`, sections);
        
        // Test semester field
        console.log('🔍 Testing semester field...');
        const semesters = await Timetable.distinct('semester');
        console.log(`   Found ${semesters.length} unique semesters:`, semesters);
        
        // Step 5: Test filtered queries (like the API does)
        console.log('\n5️⃣ Testing filtered queries...');
        
        if (branches.length > 0) {
            const firstBranch = branches[0];
            console.log(`🔍 Testing year filter with branch="${firstBranch}"...`);
            const yearsForBranch = await Timetable.distinct('year', { branch: firstBranch });
            console.log(`   Found ${yearsForBranch.length} years for branch "${firstBranch}":`, yearsForBranch);
        }
        
        console.log('\n✅ Debug complete!');
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    } finally {
        await closeMongoDBConnection();
    }
}

// Run the debug
if (require.main === module) {
    debugFilters();
}

module.exports = { debugFilters };
