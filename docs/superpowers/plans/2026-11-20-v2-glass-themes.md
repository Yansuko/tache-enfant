# V2 — design liquid glass, thèmes extensibles, thème automatique — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-11-20-v2-glass-themes-design.md` (lis-la en entier, ainsi que les maquettes `.superpowers/brainstorm/12360-1795162290/content/visual-style.html` et `dark-and-accents.html`).

**Goal:** style « liquid glass » léger, thèmes Clair et Bleu nuit extensibles par registre, six accents, mode Auto au coucher du soleil, choix synchronisé par profil.
**Architecture:** `public/themes.js` (registre + résolution), `public/sun.js` (lever/coucher), classes verre dans `public/styles.css`, moteur d'application dans `public/index.html`, action serveur `setAppearance` dans `src/core.mjs`.
**Tech Stack:** vanilla JS PWA, Express/SQLite, vitest (`CI=1 npx vitest run`), Playwright (`CHROMIUM_PATH=/home/yansu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm run test:e2e`).

## Global Constraints
- TDD strict (RED constaté puis GREEN, sorties reportées). Branche `feat/v2-glass-themes`; commits locaux, JAMAIS de push; ne pas toucher `data/dailykids.db` ni au conteneur podman; ne pas commiter `test-results/`; les captures vont dans `docs/v2-screenshots/` (commitées, PNG ≤ 200 Ko chacune, 375 px).
- Trailer de commit EXACT: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Aucune régression: toute la suite vitest et e2e reste verte (adapter les tests dépendant de couleurs/styles en gardant leur intention). Champs ≥ 16 px et aucun débordement à 320/375 px (`e2e/inputs-overflow.spec.js` reste vert). Structure/comportement des écrans inchangés; textes en français; `esc` pour toute valeur affichée.
- Les nouveaux modules `public/*.js` se chargent comme `public/rollover.js`/`swipe.js` (balise `<script>`, import vitest dynamique; Dockerfile copie déjà `public/`).
- Ne jamais écrire la position (lat/lon) côté serveur.

---
### Task 1: `Sun` et `Themes` (modules purs)
**Files:** Create `public/sun.js`, `public/themes.js`, `test/sun.test.js`, `test/themes.test.js`.
- [ ] Tests RED puis implémenter (voir « Accessibilité et tests » de la spec): `Sun.times/isNight` (Paris 21/06 et 21/12/2026, tolérance 3 min, cas polaires), registre (fiches Clair et Bleu nuit complètes: toutes les variables obligatoires listées dans la spec), 6 accents avec rampes 100–900 clair/sombre, `normalizeAppearance`, `resolve` (avant/après coucher, modes forcés, thème/accent inconnus → défaut, `systemDark` utilisé seulement si `mode` indéfini côté appareil), `cssVars`, garde-fou de contraste AA sur chaque thème × accent (calcul WCAG sur le pire fond: verre composité sur chaque stop du dégradé et chaque tache; texte principal, texte secondaire, texte du bouton primaire sur l'accent), et vérification que l'ajout d'une fiche factice incorrecte (variable manquante ou contraste insuffisant) fait échouer la fonction de validation exportée (`Themes.validateTheme(theme)` → liste d'erreurs).
- [ ] RED → GREEN; vitest complet vert; commit `feat(theme): moteur de thèmes, accents et coucher du soleil`.

### Task 2: style verre + moteur d'application
**Files:** Modify `public/styles.css`, `public/index.html`; Create `e2e/theme-engine.spec.js`.
- [ ] Tests e2e RED: `data-theme`/variables posés selon le mode (clair, sombre, Auto avec `page.clock` avant/après le coucher de Paris, passage en cours de session sans rechargement), `<meta name="theme-color">` mis à jour, réévaluation au retour de visibilité, repli sans flou (`@media (prefers-reduced-transparency: reduce)` émulé via `page.emulateMedia({ reducedTransparency: 'reduce' })` si disponible, sinon test de la règle `@supports not (backdrop-filter)` via injection), `prefers-reduced-motion`, aucun clignotement (pas de changement de DOM quand le résultat est identique).
- [ ] Implémenter: variables de thème appliquées par `applyAppearance()` depuis `Themes.cssVars`, fond dégradé + taches, classes `.glass`/`.glass-bar`, reprise des composants de base (cartes, barres haute/basse, boutons, champs, dialogues) pour utiliser les variables, aucun changement de structure; état provisoire de l'apparence lu de `localStorage` `dk-appearance` puis `prefers-color-scheme`, sinon Auto. Vérifie à l'œil sur captures clair et sombre.
- [ ] RED → GREEN; vitest + e2e complets verts; commit `feat(ui): style liquid glass et application des thèmes`.

### Task 3: menu Apparence + synchronisation par profil
**Files:** Modify `src/core.mjs` (action `setAppearance`, `appearance` dans `me`/familles pour les enfants, conservation dans `saveFamily`), `public/index.html` (menu Apparence parent/enfant, réglage par enfant côté parent, localisation précise opt-in, lecture du profil à la connexion et à la synchro); Create `test/appearance.test.js`, `e2e/appearance.spec.js`.
- [ ] Tests vitest RED (liste dans la spec: parent compte/enfant, enfant soi-même seulement, enfant→autre refusé, autre famille refusée, champs inconnus 400, ids invalides 400, persistance + renvoi dans `me`, non écrasé par `saveFamily` d'un appareil périmé) puis serveur GREEN.
- [ ] Tests e2e RED: parent change mode/accent → persiste après rechargement et apparaît sur un 2ᵉ contexte (autre appareil) après `syncCycle`; enfant règle le sien sans toucher à celui du parent; parent règle celui d'un enfant; un thème ajouté dans le registre (injection `Themes.THEMES` factice avant chargement) apparaît au menu et « Thème de jour/de nuit » n'apparaît que s'il y a ≥ 2 thèmes d'une famille; localisation précise: permission accordée (contexte Playwright avec `geolocation`) → coucher recalculé, refusée → repli Paris + message; thème avant connexion (localStorage).
- [ ] RED → GREEN; vitest + e2e complets verts; commit `feat(theme): menu Apparence synchronisé par profil`.

### Task 4: reprise de tous les écrans + audit visuel et contraste
**Files:** Modify `public/index.html`, `public/styles.css`; Create `e2e/theme-screens.spec.js`, `docs/v2-screenshots/*.png`.
- [ ] Test e2e RED: parcourt TOUS les écrans parent et enfant (connexion/inscription/déverrouillage/PIN, Quêtes, Notes, Boutique, Statistiques, Enfants, Famille, Apparence, formulaires ouverts, fenêtres) en clair et en sombre à 375 px et vérifie pour chaque élément de texte visible un contraste ≥ 4,5:1 (3:1 pour texte ≥ 24 px ou gras ≥ 18,66 px) contre son fond effectif (compose les couleurs de fond translucides des ancêtres sur le dégradé de la page), signale écran + sélecteur fautifs; aucune couleur codée en dur illisible en sombre; prend une capture par écran/thème dans `docs/v2-screenshots/`.
- [ ] Corriger les couleurs codées en dur (≈ 44 occurrences de `#hex` dans index.html/styles.css) et tous les défauts trouvés en utilisant les variables; les graphiques SVG des statistiques et les tags doivent suivre le thème. Vérifie à l'œil les captures (clair et sombre) et corrige ce qui est laid ou illisible.
- [ ] RED → GREEN; vitest + e2e complets verts; commit `feat(ui): tous les écrans en verre clair et sombre`.
