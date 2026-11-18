# Zoom, récompenses par enfant, événements, installation — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-11-18-events-rewards-install-design.md`.

**Goal:** corriger le zoom mobile, ajouter prix/réservation par enfant, événements de bonus et bouton d'installation.
**Architecture:** modules purs partagés (`public/events.mjs`-style globaux comme `public/rollover.js`/`proposals.js`), champs famille parents-seulement dans `saveFamily`, UI dans `public/index.html`.
**Tech Stack:** Node ESM, Express, better-sqlite3, vanilla JS PWA, vitest (`CI=1 npx vitest run`), Playwright (`CHROMIUM_PATH=/home/yansu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm run test:e2e`).

## Global Constraints
- TDD strict: test, constater le RED, implémenter, GREEN; reporter les sorties RED/GREEN.
- Branche `feat/events-rewards-install`; commits locaux, JAMAIS de push; ne pas toucher `data/dailykids.db` ni au conteneur podman.
- Pas de secret dans le dépôt. Textes UI en français.
- Ajouter un champ famille = reproduire ce qui a été fait pour `reminders` (voir commits `0c56dab`, `4c8d9fc`, `5a4cd47`): liste blanche `famPayload` de `saveFamily` (src/core.mjs), copie `safe`/restriction enfant, `normalizeFamilyData`, `arrayFields` (public/index.html ~l.551), `persistFamily` (~l.721) et le pull (~l.3180).
- Un jeton enfant ne peut jamais modifier `rewards`, `events`, `reminders` (parents seulement, via `fam.members`).
- Jour/fuseau Paris: `src/paris-time.mjs` (`parisClock`, `dateToISO`, `franceOffsetMs`).
- À la fin de chaque tâche: suite vitest complète ET e2e complète vertes (si un test existant casse à cause du changement, corriger le code, pas le test, sauf test dépendant de la date).

---
### Task 1: Zoom mobile (champs ≥ 16 px)
**Files:** Modify `public/index.html` (CSS `.input` et styles en ligne: `font-size:12px/13px` sur input/select, ex. l.216, l.1217); Create `e2e/mobile-zoom.spec.js`.
- [ ] Test e2e RED (viewport 375×812, mobile): visiter écran de connexion, déverrouillage PIN, onglets parent (Quêtes, Récompenses/boutique, Enfants, Famille, Statistiques) et écran enfant; pour chaque écran, `page.evaluate` vérifie que tout `input:not([type=checkbox]):not([type=radio]), select, textarea` visible a `getComputedStyle(el).fontSize >= 16px`. Ajouter aussi: `meta[name=viewport]` ne contient pas `maximum-scale`/`user-scalable=no`.
- [ ] RED → corriger (CSS globale `input, select, textarea { font-size: 16px }` avec un minimum, supprimer/surcharger les `font-size` en ligne trop petits) → GREEN; e2e complète + vitest verts; commit `fix(ui): champs de saisie à 16 px minimum (plus de zoom automatique sur iPhone)`.

### Task 2: Bouton « Installer l'application »
**Files:** Modify `public/index.html`; Create `e2e/install.spec.js`.
- [ ] Tests e2e RED: (a) `beforeinstallprompt` simulé (dispatch d'un faux événement avec `prompt()` espion et `userChoice`) → le bouton `data-action="install-app"` apparaît sur l'écran de connexion et dans l'onglet Famille; clic → `prompt()` appelé; après `appinstalled` → bouton masqué; (b) UA iPhone Safari non standalone → bouton visible, clic → mode d'emploi (texte « Partager » et « Sur l'écran d'accueil »); (c) `display-mode: standalone` (émulé via `page.addInitScript` surchargeant `matchMedia`) ou `navigator.standalone=true` → aucun bouton.
- [ ] Implémenter (capture `beforeinstallprompt` + `preventDefault`, état `installPrompt`, détection iOS/standalone réutilisant la logique de `pushStatusCard`, ~l.395); GREEN; suites complètes vertes; commit `feat(pwa): bouton d'installation de l'application`.

### Task 3: Événements de bonus
**Files:** Create `public/events.js` (global `Events`: `activeMultipliers(events, childId, dayISO)` → `{xpMult, goldMult, names[]}`, `applyMult(value, mult)`; chargeable en Node comme `public/rollover.js`), `test/events.test.js`, `e2e/events.spec.js`; Modify `src/core.mjs` (`events` parents seulement + validation `cleanEvents`, 400 si invalide: dates, `start<=end`, mult 1–5 par pas de 0,5, nom 1–60 car., max 20), `public/index.html` (gain multiplié à la validation et à l'approbation et au bonus du jour; gain réel conservé: stocker `xpEarned`/`goldEarned` sur la validation/tâche et faire utiliser ces valeurs, avec repli sur `xp`/`gold`, par les statistiques `completionsOf`/`aggregateTaskStats` et l'historique; bandeau enfant; bloc « Événements » parent).
- [ ] Tests vitest RED: `activeMultipliers` (hors période, premier/dernier jour inclus, enfant ciblé vs tous, deux événements → max par ressource, jour Paris vs UTC à minuit), `applyMult` (arrondi), `saveFamily` (events conservés, validation 400, enfant ne peut pas modifier, un parent peut), stats utilisant `xpEarned`.
- [ ] Tests e2e RED: parent crée un événement « XP ×2 » couvrant aujourd'hui → l'enfant voit le bandeau; l'enfant coche une quête de 10 XP, le parent approuve → l'enfant a 20 XP; l'enfant non ciblé ne reçoit pas le bonus; événement terminé → gain normal; bonus du jour multiplié; suppression de l'événement.
- [ ] RED → GREEN; suites complètes vertes; commit `feat(events): événements de bonus XP/or`.

### Task 4: Récompenses par enfant
**Files:** Create `public/shop.js` (global `Shop`: `effectiveCost(reward, childId)`, `visibleRewards(rewards, childId)`), `test/shop-per-child.test.js`, `e2e/shop-per-child.spec.js`; Modify `src/core.mjs` (`saveFamily`: ramener `requests[].cost` au prix effectif de l'article pour l'enfant quand `rewardId` connu; valider `prices` (entiers ≥ 1) et `childIds` (tableau d'ids d'enfants existants); enfant ne peut pas modifier `rewards`), `public/index.html` (boutique enfant ~l.919, prochain objectif `nextReward` ~l.269/903, demande d'achat ~l.2158, boutique parent ~l.1168 avec éditeur « Par enfant », formulaire de création avec choix des enfants, approbation = prix de la demande).
- [ ] Tests vitest RED: `effectiveCost`, `visibleRewards` (réservé / commun / liste vide), serveur: demande avec prix falsifié ramenée au prix effectif, enfant ne modifie pas `rewards`, `prices`/`childIds` invalides → 400, anciens articles sans ces champs inchangés.
- [ ] Tests e2e RED: parent règle « Pizza » à 40 pour Emma (commun 60) → Emma voit 40, Lucas voit 60; article réservé à Emma invisible chez Lucas; Emma demande l'achat → la demande est à 40 et le parent approuve → or débité de 40; suppression du prix spécifique → retour à 60.
- [ ] RED → GREEN; suites complètes vertes; commit `feat(shop): prix et réservation d'articles par enfant`.
