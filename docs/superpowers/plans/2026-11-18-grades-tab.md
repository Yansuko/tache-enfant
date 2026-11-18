# Onglet Notes parent — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-11-18-grades-tab-design.md`.

**Goal:** regrouper l'onglet Notes du parent par enfant (sections, moyennes, filtres, tri par date).
**Architecture:** fonction pure `Grades.groupGrades` testée en vitest + refonte de `screenGrades()` dans `public/index.html`.
**Tech Stack:** vanilla JS, vitest (`CI=1 npx vitest run`), Playwright (`CHROMIUM_PATH=/home/yansu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm run test:e2e`).

## Global Constraints
- TDD strict (RED constaté puis GREEN, sorties reportées). Branche `feat/grades-tab`; commits locaux, JAMAIS de push; ne pas toucher `data/dailykids.db` ni au conteneur podman; ne pas commiter `test-results/`.
- Ne pas changer les actions `approve-grade`/`refuse-grade` ni l'API; les index `data-i` doivent continuer à pointer la bonne note en attente (attention: aujourd'hui l'index est celui de la liste globale `pending`; avec des sections par enfant, utiliser l'id de la note (`data-id`) et adapter les actions, et les ids de champs `grade-gold-…`/`grade-value-…`).
- Les notes existantes restent affichées, y compris invalides; les enfants supprimés: leurs notes ne sont pas affichées.
- Textes en français; champs ≥ 16 px; 375 px sans débordement horizontal; échapper toute valeur affichée (`esc`).
- Fin de tâche: vitest complet ET e2e complète verts.

### Task 1: regroupement par enfant
**Files:** Modify `public/grades.js`, `public/index.html` (`screenGrades` ~l.1275, `approve-grade`/`refuse-grade`, état des filtres); Create `test/grades-group.test.js`, `e2e/grades-tab.spec.js`.
- [ ] Tests vitest RED (`groupGrades`, `subjects`): regroupement par enfant dans l'ordre de la famille, tri approuvées par date décroissante (`approvedAt ?? submittedAt`), refusées séparées, moyenne avec `15,5`/`17/20`/`TB` (échelle perso), note invalide ignorée de la moyenne, `avg:null` sans note convertible, filtres enfant et matière, enfant inconnu ignoré, moyenne par matière, entrée vide.
- [ ] Tests e2e RED (`e2e/grades-tab.spec.js`, modèles `e2e/grades-scale.spec.js`, helpers `newFamily`/`parentLogin`/`tab`/`settle`/`syncCycle`): voir la section Tests de la spec (sections par enfant, ordre, moyennes, filtres enfant/matière, approbation et refus depuis une section, un seul enfant sans pastilles, 375 px sans débordement).
- [ ] RED → implémenter → GREEN; vitest + e2e complets verts; commit `feat(grades): onglet Notes parent regroupé par enfant`.
