# Swipe entre enfants — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-11-19-swipe-children-design.md`.

**Goal:** changer d'enfant par swipe horizontal sur mobile.
**Architecture:** fonction pure `Swipe.decide` (`public/swipe.js`) + écouteurs tactiles sur `#main` dans `public/index.html`.
**Tech Stack:** vanilla JS, vitest (`CI=1 npx vitest run`), Playwright (`CHROMIUM_PATH=/home/yansu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm run test:e2e`).

## Global Constraints
- TDD strict (RED constaté puis GREEN, sorties reportées). Branche `feat/swipe-children`; commits locaux, JAMAIS de push; ne pas toucher `data/dailykids.db` ni au conteneur podman; ne pas commiter `test-results/`.
- Charger `public/swipe.js` comme `public/rollover.js`/`shop.js` (balise `<script src="/swipe.js">`, test vitest par import dynamique; Dockerfile copie déjà `public/`).
- Aucune régression: sélecteur d'enfant et pastilles continuent de fonctionner; le pull de synchro 10 s ne doit pas annuler le choix; `prefers-reduced-motion` respecté.
- Fin de tâche: vitest complet ET e2e complète verts.

### Task 1: swipe entre enfants
**Files:** Create `public/swipe.js`, `test/swipe.test.js`, `e2e/swipe-children.spec.js`; Modify `public/index.html`.
- [ ] Tests vitest RED (`Swipe.decide`): gauche→`next`, droite→`prev`, <60 px→null, diagonale (dy proche de dx)→null, >600 ms→null, première/dernière position→null, un seul enfant→null, zéro enfant→null.
- [ ] Tests e2e RED (modèles `e2e/child-flows.spec.js`, `e2e/parent-flows.spec.js`, `e2e/mobile-zoom.spec.js`; contexte mobile 375×812 `hasTouch: true`): scénarios de la spec (parent Quêtes, enfant avec PIN débloqué, extrémités, champ de saisie, PIN demandé pour l'enfant suivant verrouillé, onglet sans sélecteur, scroll vertical, un seul enfant).
- [ ] RED → implémenter → GREEN; vitest + e2e complets verts; commit `feat(ui): changer d'enfant par swipe sur mobile`.
