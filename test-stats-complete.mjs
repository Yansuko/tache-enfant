import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8123';

async function test() {
  console.log('\n=== COMPLETE STATS TEST ===\n');
  
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
  console.log(`  Lucas tasks: ${lucas?.tasks?.length || 0}`);
  lucas?.tasks?.forEach((t, i) => {
    const comp = t.completedAt ? new Date(t.completedAt).toISOString() : 'null';
    console.log(`    [${i}] "${t.name}": done=${t.done}, completedAt=${comp}`);
  });
  
  // Step 3: Approve first task
  console.log('\nStep 3: Approve first incomplete task');
  const firstIncomplete = lucas.tasks.find(t => !t.done);
  if (!firstIncomplete) {
    console.log('  No incomplete tasks. Using first task.');
  }
  
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
  const returnedFamily = data.family;
  const returnedLucas = returnedFamily?.children?.find(c => c.name === 'Lucas');
  const returnedTask = returnedLucas?.tasks?.find(t => t.name === taskToApprove.name);
  console.log(`  Backend returned: done=${returnedTask?.done}, completedAt=${returnedTask?.completedAt ? new Date(returnedTask.completedAt).toISOString() : 'null'}`);
  
  // Wait a moment for data to settle
  await new Promise(r => setTimeout(r, 500));
  
  // Step 5: Get stats
  console.log('\nStep 5: Get stats for Lucas');
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'getTaskStats', childName: 'Lucas', period: 'week' })
  });
  data = await res.json();
  
  console.log(`  tasksCount: ${data.tasksCount}`);
  console.log(`  xpGained: ${data.xpGained}`);
  console.log(`  goldGained: ${data.goldGained}`);
  
  // Step 6: Verify
  console.log('\nStep 6: Verification');
  if (data.tasksCount >= 1) {
    console.log(`  ✅ SUCCESS! Stats showing ${data.tasksCount} completed task(s)`);
    console.log(`     XP: ${data.xpGained}, Gold: ${data.goldGained}`);
  } else {
    console.log(`  ❌ FAILURE! Stats showing zero tasks (tasksCount=${data.tasksCount})`);
    console.log(`\n  Analysis:`);
    console.log(`  1. Did task get marked as done? YES (done=true set)`);
    console.log(`  2. Did task get completedAt? YES (set to ${new Date(taskToApprove.completedAt).toISOString()})`);
    console.log(`  3. Did save succeed? YES (received 200)`);
    console.log(`  4. Did stats API run? YES (received response)`);
    console.log(`  5. Did stats count it? NO (tasksCount=0)`);
    console.log(`\n  => BUG IS IN aggregateTaskStats LOGIC`);
  }
}

await test();
process.exit(0);
