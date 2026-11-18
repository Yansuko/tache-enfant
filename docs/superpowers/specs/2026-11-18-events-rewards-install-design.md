# Zoom mobile, récompenses par enfant, événements, bouton d'installation — conception

## 1. Zoom mobile
Safari iOS zoome au focus d'un champ dont la police fait moins de 16 px et ne dézoome qu'au changement d'écran. Tous les `input`, `select`, `textarea` de l'app (CSS `.input` et styles en ligne) passent à ≥ 16 px. La balise `viewport` ne change pas (pas de `maximum-scale`).

## 2. Récompenses par enfant
Boutique commune. Champs optionnels par article: `prices: {childId: cost}` (prix propre à un enfant) et `childIds: string[]` (article réservé à ces enfants; vide/absent = tous). Niveau requis inchangé (commun). Prix effectif = `prices[childId] ?? cost`.
- Parent: éditeur « Par enfant » sur chaque article (prix par enfant, réservation) et choix des enfants à la création.
- Enfant: ne voit que ses articles, avec son prix effectif; la demande d'achat porte ce prix.
- Serveur (`saveFamily`): une demande d'achat (`requests`) dont le `cost` ne correspond pas au prix effectif de l'article pour cet enfant est ramenée au prix effectif; un enfant ne peut pas modifier `rewards`.

## 3. Événements de bonus
Champ famille `events: [{id, name, start:'YYYY-MM-DD', end:'YYYY-MM-DD', xpMult, goldMult, childIds?}]` (dates Paris incluses, multiplicateurs entiers ou demi-entiers 1–5, max 20, parents seulement; `start <= end`).
- Pendant l'événement (jour Paris ∈ [start,end], enfant ∈ childIds ou childIds vide), la validation d'une quête (validation directe, approbation d'une demande par le parent) et le bonus du jour rapportent XP/or × multiplicateur (arrondi à l'entier). Plusieurs événements actifs: on prend le multiplicateur le plus élevé par ressource.
- Le gain réellement crédité est conservé (statistiques et historique exacts).
- Bandeau « 🎉 <nom>: XP ×2 · Or ×2 » chez l'enfant concerné; bloc « Événements » côté parent (créer/modifier/supprimer).

## 4. Bouton d'installation
« 📲 Installer l'application »: Android/Chrome via `beforeinstallprompt` (installation native); iPhone Safari: ouvre un mode d'emploi (Partager → Sur l'écran d'accueil). Masqué si l'app est déjà installée (`display-mode: standalone` / `navigator.standalone`). Présent sur l'écran de connexion et dans l'onglet Famille.

## Tests
Vitest: prix effectifs/réservation/serveur, événements (validation du champ, multiplicateurs, gain conservé, stats). Playwright: aucun champ < 16 px sur chaque écran, boutique par enfant, création d'événement + gain doublé, bouton d'installation (`beforeinstallprompt` simulé, iOS simulé, installé = masqué).
