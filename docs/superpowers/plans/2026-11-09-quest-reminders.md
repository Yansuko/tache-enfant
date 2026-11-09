# Rappels de quêtes + diagnostic e-mail — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-11-09-quest-reminders-design.md`.

**Goal:** corriger/diagnostiquer l'e-mail Brevo, ajouter un bouton « Notifier » et des rappels planifiés par enfant/quête.

**Architecture:** modules purs `src/email.mjs` et `src/reminders.mjs`, actions dans `src/core.mjs` (`handleApi`), minuteur dans `server.js`, UI dans `public/index.html`.

**Tech Stack:** Node ESM, Express, better-sqlite3, web-push, vitest (`npm test`), Playwright (`npm run test:e2e`, besoin de `CHROMIUM_PATH=...` dans la même commande).

## Global Constraints
- TDD strict: écrire le test, le lancer, constater l'échec (RED), puis implémenter (GREEN). Reporter la sortie RED et GREEN.
- Branche `feat/quest-reminders`; commits locaux seulement, JAMAIS de push.
- Aucun secret dans le dépôt. Textes UI en français. Ne pas toucher `data/dailykids.db`.
- Fuseau Paris via `franceOffsetMs`/`dateToISO` de `src/core.mjs` (à exporter si besoin). Jours: 0=lundi … 6=dimanche.
- Familles: `store.get('family:<id>')`, `store.list()` (clés), `store.set`. Push enfant: `sendPush(store, famId, payload, {only: s => parseChildEmail(s.email)?.name === childName})` (voir `notifyChild`, src/core.mjs:1584). Parent = `fam.members.includes(email)`; un jeton enfant ne l'est pas.
- Toute la suite vitest (`npm test`) doit rester verte à chaque tâche.
- Helpers de test: `test/helpers.js` (`api`, `newParent`), e2e: `e2e/helpers.js`.

---
### Task 1: E-mail Brevo diagnostiquable
**Files:** Create `src/email.mjs`, `test/email.test.js`; Modify `server.js` (`setupEmailSender`), `src/core.mjs` (action `testEmail`), `README.md`.
**Interfaces — Produces:** `makeBrevoSender({apiKey, from, name='DailyKids', fetchImpl=fetch})` → `async ({to,subject,body}) => {ok:boolean,status:number,detail:string}`; ne jette jamais; sur réponse non-ok, `console.error('[EMAIL] Brevo <status> to=<to>: <corps>')` et `ok:false`. Action API `testEmail {adminKey, to}` (non-public auth: ajouter à `PUBLIC` comme les autres actions admin) → 403 si clé invalide, 400 si `to` invalide, 503 si aucun expéditeur configuré, sinon 200 `{ok,status,detail}` du dernier envoi. Besoin: `core.mjs` doit pouvoir lire le résultat: faire retourner par `emailSender` l'objet ci-dessus (les appelants existants ignorent la valeur de retour).
- [ ] Tests (fetch injecté): envoie POST `https://api.brevo.com/v3/smtp/email` avec header `api-key`, `sender {name,email:from}`, `to`; 201 → ok:true; 401 corps `{"message":"Key not found"}` → ok:false, detail contient le corps, console.error appelé; exception réseau → ok:false sans jeter; `from` absent → erreur claire à la construction (`throw`). `testEmail`: 403 sans clé, 400 sans `to`, 503 sans expéditeur, 200 avec un faux `setEmailSender` renvoyant `{ok:true,status:201}`.
- [ ] RED → implémenter → GREEN.
- [ ] `server.js`: `EMAIL_FROM` requis (sinon log `[EMAIL] EMAIL_FROM non défini: e-mails désactivés` et pas de sender); log au démarrage `[EMAIL] Brevo configuré (expéditeur: …)` ou `[EMAIL] BREVO_API_KEY absent: e-mails désactivés`; `EMAIL_FROM_NAME` optionnel. Documenter `EMAIL_FROM`, `EMAIL_FROM_NAME` et `testEmail` dans le README (expéditeur à valider dans Brevo).
- [ ] `npm test` vert; commit `feat(email): expéditeur configurable, erreurs Brevo journalisées, action testEmail`.

### Task 2: Action `remindQuest` (bouton Notifier côté API)
**Files:** Create `src/reminders.mjs`, `test/remind-quest.test.js`; Modify `src/core.mjs` (case `remindQuest`).
**Interfaces — Produces (src/reminders.mjs):** `pendingTasks(child)` → tâches `!t.done`; `reminderPayload(childName, tasks)` → `{title, body, icon:'🔔', badge:'/icon-96.svg', tag:'reminder', data:{url:'/'}}` (titre `Rappel de quête`, corps = nom de la quête si 1, sinon `N quêtes à faire : A, B, C`). API: `remindQuest {familyId, childId, taskId}` (jeton parent).
- [ ] Tests: parent → 200 `{ok:true, sent:n}` et `web-push` (mocké comme dans `test/notifications-targeting.test.js`) appelé seulement pour l'abonnement de CET enfant (pas ses frères/parents), corps contient le nom de la quête; jeton enfant → 403; famille d'un autre parent → 403; tâche validée (`done`) → 409; tâche/enfant inconnu → 404; 2e appel < 60 s pour la même tâche → 429 `Rappel déjà envoyé…` (horloge injectable ou `vi.useFakeTimers`); `pendingTasks`/`reminderPayload` unitaires (1 et plusieurs quêtes).
- [ ] RED → implémenter → GREEN; `npm test` vert; commit `feat(reminders): action remindQuest`.

### Task 3: Rappels planifiés (serveur)
**Files:** Modify `src/reminders.mjs`, `src/core.mjs` (`famPayload` + merge de `reminders` dans `saveFamily`, normalisation), `server.js` (minuteur); Create `test/reminders-schedule.test.js`.
**Interfaces — Produces:** famille `reminders: [{id, childId, questName?, days:number[], time:'HH:MM', enabled:boolean, lastSent?:'YYYY-MM-DD'}]`. `dueReminders(fam, now)` → liste des rappels à envoyer (enabled, jour Paris ∈ days, heure Paris ≥ time, `lastSent !== jourParis`). `runReminders(store, now=Date.now())` → parcourt `family:*`, pour chaque rappel dû: calcule les quêtes non validées de l'enfant (filtrées par `questName` si présent), envoie `reminderPayload` à cet enfant (`sendPush` avec `only`), met `lastSent=jourParis` et sauvegarde la famille même s'il n'y avait rien à envoyer (pas de renvoi plus tard dans la journée); renvoie `{sent:n}`. `server.js`: `setInterval(() => runReminders(store), Number(process.env.REMINDER_TICK_MS)||60000)`, démarré dans `start()`, `clearInterval` au shutdown, désactivé si `NODE_ENV==='test'` sauf `REMINDER_TICK_MS` défini. `saveFamily`: `reminders` conservé (liste, validée: ids, days entiers 0-6, time regex), fusion par id, un jeton enfant ne peut pas le modifier; `lastSent` est géré côté serveur (un client ne peut ni l'effacer ni le reculer).
- [ ] Tests: lundi 17:00 Paris (utiliser `new Date('2026-11-09T16:30:00Z')` = lundi 17:30 Paris) → un push; même jour 2e tick → 0 (lastSent); mardi → 0; avant l'heure → 0; toutes quêtes validées → 0 push mais `lastSent` posé; rappel `enabled:false` → 0; `questName` ne cible que cette quête (corps ne contient pas les autres); push uniquement à l'enfant concerné; changement d'heure été/hiver (ex. `2026-07-06T15:30:00Z` = 17:30 Paris été); redémarrage (relire depuis le store) ne renvoie pas; `saveFamily` conserve `reminders`, rejette `days:[9]`/`time:'25:99'` (400 ou nettoyé), parent peut modifier, enfant ne peut pas; un client qui renvoie un rappel sans `lastSent` ne le fait pas perdre.
- [ ] RED → implémenter → GREEN; `npm test` vert; commit `feat(reminders): rappels planifiés par enfant/quête`.

### Task 4: Interface parent + tests Playwright
**Files:** Modify `public/index.html` (`screenTaches`, `ACTIONS`, `SERVER_ACTIONS`, bloc Rappels), `public/sw.js` si nécessaire; Create `e2e/reminders.spec.js`.
- [ ] Tests e2e RED d'abord (style `e2e/notifications.spec.js`, `newFamily`/`parentLogin`/`childLogin`/`settle`): (a) quête non validée → bouton 🔔 `data-action="remind-task"` visible; clic → toast « Rappel envoyé » et appel `remindQuest` réseau avec le bon `taskId`; quête validée → pas de bouton; double clic rapide → message « déjà envoyé »; (b) bloc « Rappels »: ajouter un rappel (enfant, jours lundi, heure 17:00), il apparaît après `syncCycle`, persiste après rechargement, se désactive et se supprime; (c) déclenchement: créer un rappel puis appeler `runReminders` via un endpoint de test? NON: utiliser `REMINDER_TICK_MS` n'est pas fiable en e2e — à la place vérifier côté API que `reminders` est bien enregistré et laisser le déclenchement couvert par Task 3.
- [ ] Implémenter UI: bouton 🔔 sur les quêtes non validées dans `taskRow` (parent seulement, pas sur l'écran enfant), action `remind-task` → `api('remindQuest',…)`, toast succès/erreur (429/409 → message du serveur). Bloc « Rappels » dans `screenTaches`: liste (enfant, quête ou « toutes », jours, heure, interrupteur, supprimer) et formulaire d'ajout (select enfant, select quête optionnel, cases jours Lun–Dim, `<input type=time>`); persiste via `persistFamily` (champ `reminders`, ids `rem-<timestamp>-<rand>`); `reminders` doit survivre au pull (`api('me')`).
- [ ] RED → GREEN; `npm test` et `CHROMIUM_PATH=… npm run test:e2e` verts (toute la suite); commit `feat(ui): bouton Notifier et planification des rappels`.
