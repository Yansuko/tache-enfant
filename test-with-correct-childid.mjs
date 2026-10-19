import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8123';

async function test() {
  console.log('\n=== STATS TEST WITH CORRECT CHILDID ===\n');
  
  // Step 1: Login
  console.log('Step 1: Login');
  let res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email: 'parent@demo.fr', password: 'demo' })
  });
  let data = await res.json();
  const token = data.token;
  console.log('  ✅ Logged in\n');
  
  // Step 2: Get family
  console.log('Step 2: Get family');
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'me' })
  });
  data = await res.json();
  const family = data.families?.[0];
  const lucas = family?.children?.find(c => c.name === 'Lucas');
  
  console.log(`  Family: ${family?.name}`);
  console.log(`  Lucas ID: ${lucas?.id}`);
  console.log(`  Lucas tasks: ${lucas?.tasks?.length || 0}`);
  lucas?.tasks?.forEach((t, i) => {
    const comp = t.completedAt ? new Date(t.completedAt).toISOString() : 'null';
    console.log(`    [${i}] "${t.name}": done=${t.done}, completedAt=${comp}`);
  });
  
  // Step 3: Approve first incomplete task
  console.log('\nStep 3: Approve first incomplete task');
  const firstIncomplete = lucas.tasks.find(t => !t.done);
  const taskToApprove = firstIncomplete || lucas.tasks[0];
  console.log(`  Task: "${taskToApprove.name}"`);
  taskToApprove.done = true;
  taskToApprove.completedAt = Date.now();
  console.log(`  Set: done=true, completedAt=${new Date(taskToApprove.completedAt).toISOString()}`);
  
  // Step 4: Save
  console.log('\nStep 4: Save family');
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'saveFamily', family })
  });
  data = await res.json();
  
  if (data.error) {
    console.error('  ❌ Error:', data.error);
    process.exit(1);
  }
  
  console.log('  ✅ Saved');
  
  // Wait a moment
  await new Promise(r => setTimeout(r, 500));
  
  // Step 5: Get stats with CORRECT childId
  console.log('\nStep 5: Get stats with childId (CORRECT)');
  console.log(`  Using childId: ${lucas.id}`);
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'getTaskStats', childId: lucas.id, period: 'week' })
  });
  data = await res.json();
  
  console.log(`  tasksCount: ${data.tasksCount}`);
  console.log(`  xpGained: ${data.xpGained}`);
  console.log(`  goldGained: ${data.goldGained}`);
  
  // Step 6: Verify
  console.log('\nStep 6: Verification');
  if (data.error) {
    console.log(`  ❌ Error: ${data.error}`);
  } else if (data.tasksCount >= 1) {
    console.log(`  ✅ SUCCESS! Stats showing ${data.tasksCount} completed task(s)`);
    console.log(`     XP: ${data.xpGained}, Gold: ${data.goldGained}`);
  } else {
    console.log(`  ❌ FAILURE! Stats still showing zero tasks`);
  }
}

await test();
process.exit(0);
