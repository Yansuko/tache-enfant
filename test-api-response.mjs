import fetch from 'node-fetch';

const API_URL = 'http://localhost:8123/api';

async function testGetTaskStatsAPI() {
  console.log('=== TESTING getTaskStats API ===\n');
  
  try {
    // First, login
    console.log('Step 1: Logging in...');
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
      console.error('❌ Login failed:', loginData.error);
      return;
    }
    
    const token = loginData.token;
    console.log('✓ Logged in\n');
    
    // Get family data first
    console.log('Step 2: Getting family data to see children...');
    const meRes = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action: 'me' })
    });
    
    const meData = await meRes.json();
    if (meData.error) {
      console.error('❌ me() failed:', meData.error);
      return;
    }
    
    const children = meData.family?.children || [];
    console.log(`✓ Found ${children.length} children:`);
    children.forEach((c, i) => {
      console.log(`  [${i}] ${c.name} (id: ${c.id})`);
    });
    
    // Now call getTaskStats for each child
    console.log('\nStep 3: Calling getTaskStats for each child...\n');
    
    for (const child of children) {
      console.log(`Getting stats for ${child.name} (${child.id})...`);
      
      const statsRes = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'getTaskStats',
          childId: child.id,
          period: 'week'
        })
      });
      
      const statsData = await statsRes.json();
      
      if (statsData.error) {
        console.log(`  ❌ Error: ${statsData.error}`);
      } else {
        console.log(`  ✓ Tasks: ${statsData.tasksCount}, XP: ${statsData.xpGained}, Gold: ${statsData.goldGained}`);
        console.log(`  ✓ childrenStats length: ${statsData.childrenStats?.length || 0}`);
        if (statsData.childrenStats) {
          statsData.childrenStats.forEach((s, idx) => {
            console.log(`    [${idx}] Tasks: ${s.tasks}, XP: ${s.xp}, Gold: ${s.gold}`);
          });
        }
      }
      console.log('');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testGetTaskStatsAPI();
