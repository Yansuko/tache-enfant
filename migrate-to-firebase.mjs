import admin from 'firebase-admin';
import { BlobsStorage } from '@netlify/blobs';
import { writeFileSync } from 'fs';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const store = new BlobsStorage({ token: process.env.NETLIFY_BLOBS_TOKEN });

async function migrate() {
  const report = {
    timestamp: new Date().toISOString(),
    accountsMigrated: 0,
    familiesMigrated: 0,
    childrenMigrated: 0,
    tasksMigrated: 0,
    levelConfigsMigrated: 0,
    activityHistoryMigrated: 0,
    errors: [],
    status: 'pending'
  };

  try {
    // Step 2: Migrate accounts
    console.log('Migrating accounts...');
    const keys = await store.list();
    const accountKeys = keys.filter(k => k.startsWith('account:'));

    for (const key of accountKeys) {
      try {
        const accountData = await store.get(key);
        const account = typeof accountData === 'string' ? JSON.parse(accountData) : accountData;
        const email = key.replace('account:', '');

        try {
          const user = await admin.auth().createUser({
            email,
            password: account.passwordHash || 'temp-password-' + Date.now(),
            displayName: account.name || email.split('@')[0]
          });

          await db.ref(`users/${user.uid}`).set({
            email,
            name: account.name || email.split('@')[0],
            familyIds: account.familyIds || [],
            createdAt: account.createdAt || Date.now(),
            uid: user.uid
          });

          report.accountsMigrated++;
        } catch (authError) {
          // If user already exists, still create the users document
          if (authError.code === 'auth/email-already-exists') {
            try {
              const existingUser = await admin.auth().getUserByEmail(email);
              await db.ref(`users/${existingUser.uid}`).set({
                email,
                name: account.name || email.split('@')[0],
                familyIds: account.familyIds || [],
                createdAt: account.createdAt || Date.now(),
                uid: existingUser.uid
              });
              report.accountsMigrated++;
            } catch (innerError) {
              report.errors.push(`Account ${email}: ${innerError.message}`);
            }
          } else {
            report.errors.push(`Account ${email}: ${authError.message}`);
          }
        }
      } catch (error) {
        report.errors.push(`Account processing ${key}: ${error.message}`);
      }
    }

    // Step 3: Migrate families
    console.log('Migrating families...');
    const familyKeys = keys.filter(k => k.startsWith('family:'));

    for (const key of familyKeys) {
      try {
        const familyData = await store.get(key);
        const family = typeof familyData === 'string' ? JSON.parse(familyData) : familyData;
        const familyId = key.replace('family:', '');

        try {
          const childrenCount = family.children?.length || 0;
          const tasksCount = family.children?.reduce((sum, c) => sum + (c.tasks?.length || 0), 0) || 0;

          await db.ref(`families/${familyId}`).set({
            id: familyId,
            name: family.name || 'Unnamed Family',
            owner: family.owner || '',
            members: family.members || [],
            children: family.children || [],
            createdAt: family.createdAt || Date.now(),
            updatedAt: family.updatedAt || Date.now()
          });

          // Create default level config for this family
          await db.ref(`levelConfigs/${familyId}`).set({
            familyId: familyId,
            name: 'Configuration par défaut',
            levels: Array.from({ length: 50 }, (_, i) => ({
              level: i + 1,
              xpRequired: i * 100
            })),
            createdAt: Date.now(),
            updatedAt: Date.now()
          });

          report.familiesMigrated++;
          report.childrenMigrated += childrenCount;
          report.tasksMigrated += tasksCount;
          report.levelConfigsMigrated++;
        } catch (error) {
          report.errors.push(`Family ${familyId}: ${error.message}`);
        }
      } catch (error) {
        report.errors.push(`Family processing ${key}: ${error.message}`);
      }
    }

    // Step 4: Migrate activity history
    console.log('Migrating activity history...');
    try {
      const historyKey = 'activityHistory';
      const historyData = await store.get(historyKey);

      if (historyData) {
        const history = typeof historyData === 'string' ? JSON.parse(historyData) : historyData;

        if (Array.isArray(history)) {
          for (const entry of history) {
            try {
              const entryId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              await db.ref(`activityHistory/${entryId}`).set(entry);
              report.activityHistoryMigrated++;
            } catch (error) {
              report.errors.push(`Activity history entry: ${error.message}`);
            }
          }
        }
      }
    } catch (error) {
      if (error.message !== 'Not found') {
        report.errors.push(`Activity history migration: ${error.message}`);
      }
    }

    // Step 5: Write report to file
    writeFileSync('migrate-report.json', JSON.stringify(report, null, 2));

    report.status = 'success';
  } catch (error) {
    report.errors.push(`Migration failed: ${error.message}`);
    report.status = 'failed';
    writeFileSync('migrate-report.json', JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));
  return report;
}

migrate().catch(console.error);
