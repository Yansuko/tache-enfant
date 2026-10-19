import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8123';

async function test() {
  console.log('\n=== FULL FLOW TEST ===\n');
  
  // Step 1: Login
  console.log('Step 1: Login as parent@demo.fr');
  let res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email: 'parent@demo.fr', password: 'demo' })
  });
  let data = await res.json();
  
  if (data.error) {
    console.error('❌ Login failed:', data.error);
    process.exit(1);
  }
  
  const token = data.token;
  console.log('✅ Logged in, token:', token?.substring(0,20)+'...\n');
  
  // Step 2: Get family
  console.log('Step 2: Get family state');
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'me' })
  });
  data = await res.json();
  const family = data.family;
  console.log(`✅ Family loaded: ${family.children?.length} children\n`);
  
  // Step 3: Check if there are task requests
  console.log('Step 3: Check task requests');
  const taskRequests = family.taskRequests || [];
  console.log(`  Task requests: ${taskRequests.length}`);
  if (taskRequests.length > 0) {
    taskRequests.slice(0,3).forEach((r, i) => {
      console.log(`    [${i}] "${r.name}" for ${r.child}: ${r.status}`);
    });
  }
  
  // Step 4: If no requests, create one
  if (taskRequests.length === 0) {
    console.log('\nStep 4: Create a task request for Lucas');
    const lucas = family.children?.find(c => c.name === 'Lucas');
    if (lucas && lucas.tasks && lucas.tasks[0]) {
      const req = {
        child: 'Lucas',
        taskIndex: 0,
        name: lucas.tasks[0].name,
        xp: lucas.tasks[0].xp,
        gold: lucas.tasks[0].gold,
        status: 'pending',
        createdAt: Date.now()
      };
      family.taskRequests = [req];
      console.log(`  Created: "${req.name}" for Lucas (pending)`);
      
      // Save
      console.log('\n  Saving family...');
      res = await fetch(`${BASE_URL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'saveFamily', family })
      });
      data = await res.json();
      if (data.error) {
        console.error('  ❌ Save failed:', data.error);
        process.exit(1);
      }
      console.log('  ✅ Saved');
    }
  } else {
    // Step 5: Approve the first pending request
    console.log('\nStep 5: Approve the first pending request');
    const pending = taskRequests.find(r => r.status === 'pending');
    if (pending) {
      const child = family.children?.find(c => c.name === pending.child);
      if (child && child.tasks && child.tasks[pending.taskIndex]) {
        const task = child.tasks[pending.taskIndex];
        console.log(`  Approving "${task.name}" for ${pending.child}`);
        task.done = true;
        task.completedAt = Date.now();
        pending.status = 'approved';
        
        console.log(`  Set: done=true, completedAt=${new Date(task.completedAt).toISOString()}`);
        console.log('  Saving...');
        
        res = await fetch(`${BASE_URL}/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'saveFamily', family })
        });
        data = await res.json();
        if (data.error) {
          console.error('  ❌ Save failed:', data.error);
          process.exit(1);
        }
        console.log('  ✅ Saved');
        
        // Verify backend received it
        const returnedChild = data.family?.children?.find(c => c.name === pending.child);
        const returnedTask = returnedChild?.tasks?.[pending.taskIndex];
        console.log(`\n  Backend returned: done=${returnedTask?.done}, completedAt=${returnedTask?.completedAt}`);
      }
    }
  }
  
  // Step 6: Get stats
  console.log('\nStep 6: Get stats for Lucas');
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'getTaskStats', childName: 'Lucas', period: 'week' })
  });
  data = await res.json();
  
  console.log('Stats response:');
  console.log(JSON.stringify(data, null, 2));
  
  if (data.tasksCount > 0) {
    console.log('\n✅ SUCCESS: Stats are working!');
  } else {
    console.log('\n❌ FAIL: Stats showing zero tasks');
  }
}

await test();
process.exit(0);
