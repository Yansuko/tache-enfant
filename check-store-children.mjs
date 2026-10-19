import fs from 'fs';

const storeData = JSON.parse(fs.readFileSync('.data/store.json', 'utf-8'));

for (const [key, value] of Object.entries(storeData)) {
  if (value.name === 'Famille Démo') {
    console.log('Famille Démo children:');
    if (Array.isArray(value.children)) {
      console.log('  - Is array with', value.children.length, 'items');
      for (const child of value.children.slice(0, 2)) {
        console.log('    Child:', { name: child.name, id: child.id, tasks_count: child.tasks?.length });
      }
    } else if (typeof value.children === 'object') {
      console.log('  - Is object with keys:', Object.keys(value.children).slice(0, 3));
    } else {
      console.log('  - Type:', typeof value.children);
    }
    break;
  }
}

process.exit(0);
