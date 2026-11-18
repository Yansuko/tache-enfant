# Onglet Notes (parent): regroupement par enfant — conception

## Données
`state.gradeRequests`: `{id, child, subject, grade, gold, status: pending|approved|refused, submittedAt, approvedAt?, submittedGrade?}`. Date affichée = `approvedAt ?? submittedAt`.

## Module (dans `public/grades.js`, global `Grades`, testé en vitest)
`groupGrades(requests, children, scale, {child?, subject?})` → `[{child, avg, count, pending, bySubject:[{subject,avg,count}], pendingList, approvedList (récentes d'abord), refusedList}]`, un élément par enfant de `children` (ordre de la famille), filtrés par enfant/matière; moyennes via `parseGrade(...).value20` (notes non convertibles ignorées, `avg` null si aucune); notes d'un enfant inconnu ignorées; `subjects(requests)` → matières distinctes triées.

## Interface (`screenGrades`, public/index.html)
- Pastilles « Tous · <enfants> » (badge avec le nombre de notes à valider) + sélecteur matière; filtres en état client (non persistés, pas d'appel serveur). Un seul enfant: pas de pastilles.
- Une section par enfant: en-tête (nom, moyenne /20, nombre de notes, nombre en attente), ligne « Maths 15,5 · Français 12 », « À valider » (champs note/or + Approuver/Refuser inchangés, les index `data-i` restent corrects pour `approve-grade`/`refuse-grade`), « Approuvées » (date, matière, note, « soumise: … », or), « Refusées » replié (`<details>`).
- Échappement `esc`, lisible à 375 px sans débordement, champs ≥ 16 px. Écran enfant inchangé.

## Tests
Vitest: `groupGrades`/`subjects`. Playwright (`e2e/grades-tab.spec.js`): deux enfants avec notes mélangées → sections, ordre, moyennes; filtres enfant et matière; approuver depuis la section d'un enfant (or crédité, la note passe en « Approuvées »); refuser → « Refusées »; 375 px.
