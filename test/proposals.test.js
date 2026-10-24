import { describe, it, expect, beforeAll } from 'vitest';

let P;
beforeAll(async () => {
  await import('../public/proposals.js');
  P = globalThis.Proposals;
});

const proposal = { child: 'Emma', name: 'Aller à la piscine', cost: 60, status: 'pending' };

describe('rewardFromProposal (le parent fixe prix et niveau avant de valider)', () => {
  it('crée l\'article avec le prix et le niveau choisis par le parent', () => {
    expect(P.rewardFromProposal(proposal, { cost: 80, lvl: 3 })).toEqual({ icon: '💡', name: 'Aller à la piscine', cost: 80, lvl: 3 });
  });

  it('ne reprend pas le prix proposé par l\'enfant si le parent en choisit un autre', () => {
    expect(P.rewardFromProposal(proposal, { cost: 25, lvl: 1 }).cost).toBe(25);
  });

  it('refuse un prix absent, nul, négatif ou non entier', () => {
    for (const cost of [undefined, NaN, 0, -5, 2.5, '12']) expect(P.rewardFromProposal(proposal, { cost, lvl: 1 }), String(cost)).toBeNull();
  });

  it('refuse un niveau absent, inférieur à 1 ou non entier', () => {
    for (const lvl of [undefined, NaN, 0, -1, 1.5, '2']) expect(P.rewardFromProposal(proposal, { cost: 60, lvl }), String(lvl)).toBeNull();
  });

  it('ne modifie pas la proposition d\'origine', () => {
    const copy = { ...proposal };
    P.rewardFromProposal(proposal, { cost: 80, lvl: 3 });
    expect(proposal).toEqual(copy);
  });
});
