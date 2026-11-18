# Notes: tableau d'appréciations — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-11-18-grades-scale-design.md`.

**Goal:** valider la saisie des notes, autoriser les décimaux, convertir les appréciations (TB/B/AB…) via un tableau modifiable, et laisser le parent corriger la note avant approbation.
**Architecture:** module partagé `public/grades.js`, champ famille `gradeScale` parents-seulement, validations dans `src/core.mjs`, UI dans `public/index.html`.
**Tech Stack:** Node ESM, Express, better-sqlite3, vanilla JS, vitest (`CI=1 npx vitest run`), Playwright (`CHROMIUM_PATH=/home/yansu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm run test:e2e`).

## Global Constraints
- TDD strict (RED constaté puis GREEN, sorties reportées). Branche `feat/grades-scale` (issue de `feat/events-rewards-install`, non fusionnée). Commits locaux, JAMAIS de push; ne pas toucher `data/dailykids.db` ni au conteneur podman; ne pas commiter `test-results/`.
- Ajouter un champ famille = reproduire `reminders`/`events` (`git show 0c56dab 4c8d9fc 5a4cd47 ab2a7a9`): famPayload, restriction enfant (`safe`), normalizeFamilyData, arrayFields client (~l.551), persistFamily (~l.721), pull (~l.3180), validation 400. Un jeton enfant ne modifie jamais `gradeScale`.
- Charger `public/grades.js` comme `public/rollover.js` (balise script, import côté serveur — voir comment `src/core.mjs` charge `rollover.js`/`shop.js`/`events.js`; Dockerfile copie déjà `public/`).
- Les notes existantes (déjà stockées, y compris invalides) ne sont pas modifiées ni supprimées; elles restent affichées, ignorées des moyennes si non convertibles.
- Textes UI en français; champs ≥ 16 px (règle globale `styles.css`); lisible à 375 px.
- Fin de tâche: vitest complet ET e2e complète verts.

---
### Task 1: Module `Grades` + serveur
**Files:** Create `public/grades.js`, `test/grades.test.js`; Modify `src/core.mjs` (submitGrade, approveGrade, saveFamily `gradeScale`, getGradeStats, remplace `gradeOn20`).
- [ ] Tests RED (vitest): `parseGrade` — `15`, `15,5`, `15.5`, `17/20`, `8,5/10`→17, `TB`, `tb`, `T.B.`, `très bien`, `Assez Bien`, `ab`, `b`; rejets: `abc`, `15,5€`, `''`, `-3`, `25/20`, `5/0`, `1e3`, `15,5,5`, `NaN`, valeur hors échelle; échelle personnalisée (`insuffisant`=6). `submitGrade` 400 sur `abc`, 200 sur `15,5`/`TB`. `approveGrade` avec `grade:'16'` corrige la note et conserve `submittedGrade`; 400 sur `grade:'xx'`. `gradeScale`: parent peut la modifier, enfant non (200 ignoré), 400 sur valeur 25, libellé en double, 21 lignes; absent = défaut. `getGradeStats`: moyenne mélangeant `15,5`, `17/20` et `TB` (18) calculée; changer `TB` à 10 recalcule.
- [ ] RED → implémenter → GREEN; vitest + e2e complets verts; commit `feat(grades): saisie validée, décimaux, appréciations et tableau de correspondance`.

### Task 2: Interface + e2e
**Files:** Modify `public/index.html` (champ note enfant ~l.880 + `submit-grade` ~l.2238; carte « À valider » parent ~l.1286 + `approve-grade` ~l.2307; éditeur « Appréciations » dans l'onglet Famille; `on20` côté client ~l.1786 remplacé par `Grades.parseGrade`); Create `e2e/grades-scale.spec.js`.
- [ ] Tests e2e RED (modèles `e2e/child-flows.spec.js`, `e2e/parent-flows.spec.js`, helpers `newFamily`/`parentLogin`/`childLogin`/`tab`/`settle`/`syncCycle`): enfant soumet `abc` et `15,5€` → message d'erreur, rien envoyé; `15,5` et `TB` → acceptés (apparaissent « à valider » chez le parent); parent corrige `15,5` en `16` puis approuve → note `16` (mention « soumise: 15,5 »), or crédité; correction invalide → message; parent modifie `TB` de 18 à 10 dans l'éditeur → la moyenne dans les statistiques change; ajouter `insuffisant`=6 puis soumettre `insuffisant` côté enfant → accepté; lisible à 375 px sans débordement horizontal.
- [ ] RED → implémenter → GREEN; vitest + e2e complets verts; commit `feat(grades): correction par le parent et éditeur d'appréciations`.
