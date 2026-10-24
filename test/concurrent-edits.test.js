import { describe, it, expect } from 'vitest';
import { newParent } from './helpers.js';

// Deux appareils parent partent de la même copie (xp 0, or 100). Chaque appareil envoie la valeur qu'il a modifiée
// et celle qu'il avait reçue (xpBase / goldBase): le serveur applique la variation sur sa valeur actuelle.
async function setup() {
  const p = await newParent('delta');
  p.family.children = [{ id: 'c-emma', name: 'Emma', xp: 0, gold: 100, tasks: [], grades: [], sanctions: [] }];
  const base = structuredClone(await p.save(p.family));
  const device = (over) => { const f = structuredClone(base); Object.assign(f.children[0], { xpBase: 0, goldBase: 100 }, over); return f; };
  return { p, device };
}

describe('xp et or fusionnés par variation entre appareils parent', () => {
  it('un appareil en retard qui n\'a rien changé n\'écrase pas le crédit de l\'autre', async () => {
    const { p, device } = await setup();
    await p.save(device({ xp: 10, gold: 105 }));                // appareil A valide une quête
    const f = await p.save(device({}));                        // appareil B (périmé) enregistre sans toucher aux compteurs
    expect([f.children[0].xp, f.children[0].gold]).toEqual([10, 105]);
  });

  it('deux crédits simultanés s\'additionnent', async () => {
    const { p, device } = await setup();
    await p.save(device({ xp: 10, gold: 105 }));
    const f = await p.save(device({ xp: 5, gold: 103 }));      // B a ajouté +5 xp, +3 or sur la même base
    expect([f.children[0].xp, f.children[0].gold]).toEqual([15, 108]);
  });

  it('une sanction (or retiré) sur un appareil en retard se déduit de la valeur actuelle', async () => {
    const { p, device } = await setup();
    await p.save(device({ xp: 10, gold: 105 }));
    const f = await p.save(device({ gold: 90 }));              // B a retiré 10 or
    expect([f.children[0].xp, f.children[0].gold]).toEqual([10, 95]);
  });

  it('sans valeur de base (ancien client, API directe), la valeur envoyée est conservée', async () => {
    const { p, device } = await setup();
    const f = device({ xp: 50, gold: 7 });
    delete f.children[0].xpBase; delete f.children[0].goldBase;
    const saved = await p.save(f);
    expect([saved.children[0].xp, saved.children[0].gold]).toEqual([50, 7]);
  });

  it('les valeurs de base ne sont pas stockées', async () => {
    const { p, device } = await setup();
    await p.save(device({ xp: 10, gold: 105 }));
    const stored = (await p.me())[0].children[0];
    expect(stored.xpBase).toBeUndefined();
    expect(stored.goldBase).toBeUndefined();
  });
});
