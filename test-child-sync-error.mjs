import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8123';

async function testChildSyncError() {
  console.log('=== Testing Child Sync Error ===\n');
  
  // Step 1: Login as child
  console.log('Step 1: Login as child via unlockChildDirect');
  let res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      action: 'unlockChildDirect', 
      familyName: 'Famille Démo', 
      childName: 'Emma', 
      pin: '0000' 
    })
  });
  
  let data = await res.json();
  console.log('Response status:', res.status);
  console.log('Response has families:', !!data.families);
  console.log('Response has token:', !!data.token);
  console.log('');
  
  if (!data.families || !data.families.length) {
    console.error('ERROR: No families returned');
    process.exit(1);
  }
  
  const family = data.families[0];
  const token = data.token;
  
  console.log('Family ID:', family.id);
  console.log('Token present:', !!token);
  console.log('');
  
  // Step 2: Try to save family without token (simulating what the frontend does)
  console.log('Step 2: Try to save family with modification but without token');
  const modifiedFamily = { ...family };
  const emma = modifiedFamily.children?.find(c => c.name === 'Emma');
  if (emma && emma.tasks && emma.tasks[0]) {
    emma.tasks[0].done = true;
    emma.tasks[0].completedAt = Date.now();
  }
  
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      action: 'saveFamily', 
      family: modifiedFamily
    })
  });
  
  data = await res.json();
  console.log('Response status:', res.status);
  console.log('Response error:', data.error);
  console.log('');
  
  if (res.status !== 200) {
    console.log('✓ CONFIRMED: Save fails without token (expected behavior)');
  }
  
  // Step 3: Try to save with token (if one was provided)
  if (token) {
    console.log('\nStep 3: Try to save family WITH token');
    res = await fetch(`${BASE_URL}/api`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action: 'saveFamily', 
        family: modifiedFamily
      })
    });
    
    data = await res.json();
    console.log('Response status:', res.status);
    console.log('Response error:', data.error);
    console.log('Response success:', res.ok);
  }
}

testChildSyncError().catch(console.error);
