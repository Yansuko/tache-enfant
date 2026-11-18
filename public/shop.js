// Boutique: prix et réservation d'articles par enfant. Script classique: expose globalThis.Shop.
(function (g) {
  // Prix effectif pour un enfant: prix propre (`prices[childId]`), sinon prix commun
  const effectiveCost = (reward, childId) => reward?.prices?.[childId] ?? reward?.cost;
  // Articles visibles par un enfant: `childIds` vide ou absent = tous les enfants
  const visibleRewards = (rewards, childId) => (Array.isArray(rewards) ? rewards : [])
    .filter(r => r && !(Array.isArray(r.childIds) && r.childIds.length && !r.childIds.includes(childId)));
  g.Shop = { effectiveCost, visibleRewards };
})(globalThis);
