import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBTWAWR0yQgPMo_PEK57lauxIzVqjtRMDI",
  authDomain: "dailykidsquest-20c85.firebaseapp.com",
  databaseURL: "https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "dailykidsquest-20c85",
  storageBucket: "dailykidsquest-20c85.firebasestorage.app",
  messagingSenderId: "505406678744",
  appId: "1:505406678744:web:7d6190678aef2cda2999ad"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function verifyRestore() {
  try {
    const snap = await get(ref(db, 'families/fam-demo'));
    const fam = snap.val();
    
    console.log('✅ Demo family structure:');
    console.log(`   Children: ${fam.children?.length || 0}`);
    console.log(`   Rewards: ${fam.rewards?.length || 0}`);
    console.log(`   SanctionsList: ${fam.sanctionsList?.length || 0}`);
    console.log(`   Requests: ${fam.requests?.length || 0}`);
    console.log(`   ActionLog: ${fam.actionLog?.length || 0}`);
    
    if (fam.rewards && fam.rewards.length > 0) {
      console.log('\n📦 Rewards:');
      fam.rewards.forEach((r, i) => console.log(`   ${i+1}. ${r.icon} ${r.name} (${r.cost} gold, lvl ${r.lvl})`));
    }
    
    if (fam.sanctionsList && fam.sanctionsList.length > 0) {
      console.log('\n⚠️ Sanctions:');
      fam.sanctionsList.forEach((s, i) => console.log(`   ${i+1}. ${s.name} (${s.gold} gold)`));
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

verifyRestore();
