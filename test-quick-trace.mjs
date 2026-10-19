import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8123';

async function test() {
  console.log('\n=== QUICK TRACE ===\n');
  
  // Step 1: Login
  console.log('1. Login');
  let res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email: 'parent@demo.fr', password: 'demo' })
  });
  let data = await res.json();
  
  if (data.error) {
    console.error('  ❌ Error:', data.error);
    process.exit(1);
  }
  
  const token = data.token;
  console.log('  ✅ Token:', token?.substring(0,15)+'...');
  
  // Step 2: Get me
  console.log('\n2. Get /me');
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'me' })
  });
  data = await res.json();
  
  console.log('  Response keys:', Object.keys(data).join(', '));
  if (!data.family) {
    console.log('  ❌ No family in response');
    console.log('  Full response:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
  
  const family = data.family;
  const lucas = family.children?.find(c => c.name === 'Lucas');
  
  console.log('  ✅ Family loaded');
  console.log('  Lucas tasks:', lucas?.tasks?.length || 0);
  lucas?.tasks?.forEach((t, i) => {
    if (i < 3) console.log(`    [${i}] ${t.name}: done=${t.done}, completedAt=${t.completedAt}`);
  });
  
  // Step 3: Approve first task
  if (lucas?.tasks?.[0]) {
    console.log('\n3. Approve task');
    lucas.tasks[0].done = true;
    lucas.tasks[0].completedAt = Date.now();
    console.log(`  Set completedAt=${new Date(lucas.tasks[0].completedAt).toISOString()}`);
    
    console.log('  Saving...');
    res = await fetch(`${BASE_URL}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'saveFamily', family })
    });
    data = await res.json();
    
    if (data.error) {
      console.error('  ❌ Save error:', data.error);
      process.exit(1);
    }
    
    console.log('  ✅ Saved');
    const returnedTask = data.family?.children?.find(c => c.name === 'Lucas')?.tasks?.[0];
    console.log(`  Backend returned: done=${returnedTask?.done}, completedAt=${returnedTask?.completedAt}`);
  }
  
  // Step 4: Get stats
  console.log('\n4. Get stats');
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'getTaskStats', childName: 'Lucas', period: 'week' })
  });
  data = await res.json();
  
  console.log('  tasksCount:', data.tasksCount);
  console.log('  xpGained:', data.xpGained);
  
  if (data.tasksCount > 0) {
    console.log('\n  ✅ STATS WORKING!');
  } else {
    console.log('\n  ❌ STATS BROKEN - still showing zero');
  }
}

await test();
process.exit(0);
