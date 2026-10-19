import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8123';

async function test() {
  console.log('\n=== DEBUG STATS RESPONSE ===\n');
  
  // Login
  let res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email: 'parent@demo.fr', password: 'demo' })
  });
  let data = await res.json();
  const token = data.token;
  
  // Get stats
  console.log('Calling getTaskStats...\n');
  res = await fetch(`${BASE_URL}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'getTaskStats', childName: 'Lucas', period: 'week' })
  });
  data = await res.json();
  
  console.log('Full response:');
  console.log(JSON.stringify(data, null, 2));
}

await test();
process.exit(0);
