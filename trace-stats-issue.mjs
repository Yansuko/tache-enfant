import fetch from 'node:fetch';

const BASE_URL = 'http://localhost:8123';

// Step 1: Login as parent
console.log('\n=== STEP 1: Login ===');
let loginRes = await fetch(`${BASE_URL}/api`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'login', email: 'parent@demo.fr', password: 'demo' })
});
let loginData = await loginRes.json();
console.log('Login response:', loginData);

if (loginData.error) {
  console.error('Login failed:', loginData.error);
  process.exit(1);
}

const token = loginData.token;
console.log('Token:', token?.substring(0, 20) + '...');

// Step 2: Get current family state
console.log('\n=== STEP 2: Get current family ===');
let meRes = await fetch(`${BASE_URL}/api`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ action: 'me' })
});
let meData = await meRes.json();
if (meData.error) {
  console.error('me() failed:', meData.error);
  process.exit(1);
}

const family = meData.family;
const lucas = family.children?.find(c => c.name === 'Lucas');
console.log(`Lucas found: ${lucas ? 'YES' : 'NO'}`);
if (lucas) {
  console.log(`  Tasks: ${lucas.tasks?.length || 0}`);
  lucas.tasks?.slice(0, 2).forEach((t, i) => {
    console.log(`    [${i}] ${t.name}: done=${t.done}, completedAt=${t.completedAt}`);
  });
}

// Step 3: Simulate approval - mark first task as approved
console.log('\n=== STEP 3: Approve first task ===');
if (lucas && lucas.tasks && lucas.tasks[0]) {
  const taskToApprove = lucas.tasks[0];
  console.log(`Task to approve: "${taskToApprove.name}"`);
  
  // Set completedAt
  taskToApprove.done = true;
  taskToApprove.completedAt = Date.now();
  
  console.log(`Set: done=${taskToApprove.done}, completedAt=${new Date(taskToApprove.completedAt).toISOString()}`);
  
  // Step 4: Save family
  console.log('\n=== STEP 4: Save family ===');
  let saveRes = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'saveFamily', family })
  });
  let saveData = await saveRes.json();
  if (saveData.error) {
    console.error('saveFamily failed:', saveData.error);
    process.exit(1);
  }
  console.log('Family saved successfully');
  
  // Verify task was saved
  const savedLucas = saveData.family?.children?.find(c => c.name === 'Lucas');
  if (savedLucas) {
    console.log(`  Returned Lucas task[0]: done=${savedLucas.tasks?.[0]?.done}, completedAt=${savedLucas.tasks?.[0]?.completedAt}`);
  }
}

// Step 5: Call stats endpoint
console.log('\n=== STEP 5: Get stats ===');
let statsRes = await fetch(`${BASE_URL}/api`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ action: 'getTaskStats', childName: 'Lucas', period: 'week' })
});
let statsData = await statsRes.json();
console.log('Stats response:');
console.log(JSON.stringify(statsData, null, 2));

// Step 6: Verify
console.log('\n=== STEP 6: Verification ===');
if (statsData.tasksCount > 0) {
  console.log(`✅ STATS WORKING: ${statsData.tasksCount} tasks completed`);
} else {
  console.log(`❌ STATS BROKEN: tasksCount is still 0`);
  console.log('Data flow breakdown:');
  console.log('- Task has completedAt in memory? YES (just set)');
  console.log('- Family saved? YES');
  console.log('- Stats API called? YES');
  console.log('- Stats returned 0? YES');
  console.log('\nProblem must be in stats calculation logic');
}

