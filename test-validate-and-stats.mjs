import fetch from 'node-fetch';

const API_URL = 'http://localhost:8123/api';

async function testValidateAndStats() {
  console.log('=== TEST: Validate Task and Check Stats ===\n');
  
  try {
    // Login
    const loginRes = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: 'parent@demo.fr',
        password: 'demo'
      })
    });
    
    const loginData = await loginRes.json();
    if (loginData.error) {
      console.error('❌ Login failed');
      return;
    }
    
    const token = loginData.token;
    
    // Get current family state
    const meRes = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action: 'me' })
    });
    
    const meData = await meRes.json();
    const family = meData.families?.[0];
    
    if (!family) {
      console.error('❌ No family found');
      return;
    }
    
    console.log(`Demo family: ${family.name}`);
    console.log(`Children: ${family.children?.length || 0}\n`);
    
    // Find Emma
    const emma = family.children?.find(c => c.name === 'Emma');
    if (!emma) {
      console.error('❌ Emma not found');
      return;
    }
    
    console.log(`Emma found: ${emma.name} (${emma.id})`);
    console.log(`  XP: ${emma.xp}, Gold: ${emma.gold}`);
    console.log(`  Tasks: ${emma.tasks?.length || 0} (done: ${emma.tasks?.filter(t => t.done).length || 0})\n`);
    
    // Check current stats
    console.log('Getting Emma\'s current stats...');
    const statsRes1 = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'getTaskStats',
        childId: emma.id,
        period: 'week'
      })
    });
    
    const stats1 = await statsRes1.json();
    console.log(`  Week stats: ${stats1.tasksCount} tasks, ${stats1.xpGained} XP\n`);
    
    // Now validate a task if there's one not yet done
    const notDoneTask = emma.tasks?.find(t => !t.done);
    if (notDoneTask) {
      console.log(`Found a task not yet done: "${notDoneTask.name}"`);
      console.log(`Marking it as done and saving...\n`);
      
      notDoneTask.done = true;
      notDoneTask.completedAt = Date.now();
      
      const saveRes = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'saveFamily',
          family: family
        })
      });
      
      const saveData = await saveRes.json();
      if (saveData.error) {
        console.error('❌ Save failed:', saveData.error);
        return;
      }
      
      console.log('✓ Task saved\n');
      
      // Immediately check stats again
      console.log('Checking stats immediately after save...');
      const statsRes2 = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'getTaskStats',
          childId: emma.id,
          period: 'week'
        })
      });
      
      const stats2 = await statsRes2.json();
      console.log(`  Week stats: ${stats2.tasksCount} tasks, ${stats2.xpGained} XP`);
      console.log(`  Task count changed: ${stats1.tasksCount} → ${stats2.tasksCount}`);
      
      if (stats2.tasksCount > stats1.tasksCount) {
        console.log('  ✓ Stats updated correctly!');
      } else {
        console.log('  ❌ STATS DID NOT UPDATE!');
      }
    } else {
      console.log('All of Emma\'s tasks are already done');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testValidateAndStats();
