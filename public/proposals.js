// Propositions de l'enfant → articles de la boutique. Script classique: expose globalThis.Proposals.
(function (g) {
  const isPositiveInt = n => Number.isInteger(n) && n >= 1;

  // Le parent fixe le prix et le niveau requis; renvoie null si l'une des valeurs est invalide.
  function rewardFromProposal(proposal, { cost, lvl } = {}) {
    if (!proposal || !isPositiveInt(cost) || !isPositiveInt(lvl)) return null;
    return { icon: '💡', name: proposal.name, cost, lvl };
  }

  g.Proposals = { rewardFromProposal };
})(globalThis);
