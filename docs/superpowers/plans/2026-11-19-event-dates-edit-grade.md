# Dates mobiles + correction d'une note validée — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-11-19-event-dates-edit-grade-design.md`.

**Goal:** corriger le débordement des champs de date sur mobile; permettre au parent de corriger une note déjà validée.
**Architecture:** CSS dans `public/styles.css`; action `editGrade` dans `src/core.mjs`; UI dans `public/index.html` (`screenGrades`).
**Tech Stack:** vanilla JS, Express/SQLite, vitest (`CI=1 npx vitest run`), Playwright (`CHROMIUM_PATH=/home/yansu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm run test:e2e`).

## Global Constraints
- TDD strict (RED constaté puis GREEN, sorties reportées). Branche `feat/event-dates-edit-grade`; commits locaux, JAMAIS de push; ne pas toucher `data/dailykids.db` ni au conteneur podman; ne pas commiter `test-results/`.
- Trailer de commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (exactement).
- Réutiliser `Grades.parseGrade`, l'échelle `gradeScale`, `esc`; champs ≥ 16 px; 375 px sans débordement.
- Les notes existantes (y compris invalides) restent affichées; la validation ne s'applique qu'à la nouvelle saisie.
- Fin de tâche: vitest complet ET e2e complète verts.

### Task 1: champs de date mobiles
**Files:** Modify `public/styles.css`, `public/index.html` (lignes ~1057-1058 et ~1917-1918); Create `e2e/event-dates-mobile.spec.js`.
- [ ] Test e2e RED (375×812 et 320×568, parent, formulaire « Nouvel événement » ouvert, et filtres de dates des statistiques): aucun `input[type=date]` ni son conteneur ne dépasse (`right <= window.innerWidth`, pas de scroll horizontal), police ≥ 16 px. Pour que le test soit RED, simule le comportement iOS: injecte `input[type=date]{min-width:140px}` via `page.addStyleTag` AVANT de mesurer (c'est ce que fait Safari) et vérifie que le CSS de l'app gagne (min-width:0 prioritaire, ex. `!important` si nécessaire).
- [ ] RED → corriger → GREEN; vitest + e2e complets verts; commit `fix(ui): champs de date contenus dans leur cadre sur mobile`.

### Task 2: modifier une note validée
**Files:** Modify `src/core.mjs` (`editGrade`, dispatch, sécurité `saveFamily`), `public/index.html` (`screenGrades` section « Approuvées », handlers); Create `test/edit-grade.test.js`, `e2e/edit-grade.spec.js`.
- [ ] Tests RED (liste exhaustive dans la spec, section Tests) puis implémentation, GREEN; vitest + e2e complets verts; commit `feat(grades): le parent peut corriger une note déjà validée`.
