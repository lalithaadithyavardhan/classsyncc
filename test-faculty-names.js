// Test script for faculty name resolution
const fetch = require('node-fetch');

async function testFacultyNames() {
    try {
        // Test the faculty names endpoint
        const response = await fetch('http://localhost:3000/api/faculty/names', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                facultyIds: ['F101', 'F201', 'F301'] 
            })
        });
        
        const data = await response.json();
        console.log('Faculty names response:', data);
        
        if (data.success) {
            console.log('✅ Faculty names endpoint working correctly');
            console.log('Faculty names:', data.facultyNames);
        } else {
            console.log('❌ Faculty names endpoint failed:', data.message);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testFacultyNames(); 