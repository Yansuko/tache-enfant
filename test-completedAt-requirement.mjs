import fetch from 'node-fetch';

const API_URL = 'http://localhost:8123/api';

async function testCompletedAtRequirement() {
  console.log('=== TEST: Verify completedAt is required for stats ===\n');
  
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
    const token = loginData.token;
    
    // Get family
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
    
    console.log('Testing the requirement that done=true AND completedAt must be set for stats...\n');
    
    // Check Emma's tasks
    const emma = family.children?.find(c => c.name === 'Emma');
    console.log(`Emma's tasks:`);
    let tasksWithBothFlags = 0;
    let tasksWithDoneOnly = 0;
    let tasksWithCompletedAtOnly = 0;
    
    emma.tasks?.forEach((t, i) => {
      const hasDone = t.done === true;
      const hasCompletedAt = !!t.completedAt;
      
      if (hasDone && hasCompletedAt) {
        tasksWithBothFlags++;
      } else if (hasDone && !hasCompletedAt) {
        tasksWithDoneOnly++;
        console.log(`  [${i}] ANOMALY: done=true but completedAt=null: "${t.name}"`);
      } else if (!hasDone && hasCompletedAt) {
        tasksWithCompletedAtOnly++;
        console.log(`  [${i}] ANOMALY: done=false but has completedAt: "${t.name}"`);
      }
    });
    
    console.log(`\nSummary:`);
    console.log(`  Tasks with both done=true AND completedAt: ${tasksWithBothFlags}`);
    console.log(`  Tasks with done=true but NO completedAt: ${tasksWithDoneOnly}`);
    console.log(`  Tasks with completedAt but done!=true: ${tasksWithCompletedAtOnly}`);
    
    if (tasksWithDoneOnly > 0) {
      console.log(`\n⚠️  WARNING: Emma has ${tasksWithDoneOnly} task(s) marked done without completedAt!`);
      console.log(`  These tasks WILL appear in audit log but NOT in statistics.`);
      console.log(`  FIX: Ensure frontend sets completedAt=Date.now() when marking done=true`);
    }
    
    // Get stats to verify
    const statsRes = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'getTaskStats',
        childId: emma.id,
        period: 'year'
      })
    });
    
    const stats = await statsRes.json();
    console.log(`\nEmma's year stats: ${stats.tasksCount} tasks completed`);
    console.log(`Expected (with completedAt): ${tasksWithBothFlags}`);
    console.log(`Mismatch: ${stats.tasksCount !== tasksWithBothFlags ? 'YES - ISSUE FOUND!' : 'NO'}`);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testCompletedAtRequirement();
