# Rappels de quêtes + diagnostic e-mail — conception

## 1. E-mail
- `EMAIL_FROM` (env) remplace l'expéditeur factice `noreply@dailykids.local`; nom `EMAIL_FROM_NAME` (défaut DailyKids).
- Journal au démarrage (clé présente ou non, expéditeur). Le corps de l'erreur Brevo est journalisé.
- Action admin `testEmail {to}` (ADMIN_KEY) : envoie un e-mail de test et renvoie le statut/corps Brevo.
- Logique d'envoi extraite dans `src/email.mjs` (`makeBrevoSender({apiKey, from, name, fetch})`) pour être testable avec un `fetch` injecté.

## 2. Bouton « Notifier »
- Action `remindQuest {familyId?, child, taskId}` (parent/membre uniquement, enfant refusé) : push vers les appareils de l'enfant, texte avec le nom de la quête.
- Refus si la quête est déjà validée ou inconnue. Anti-spam : 1 rappel / quête / 60 s (429).
- UI parent (`screenTaches`) : bouton 🔔 sur chaque quête non validée, toast de confirmation/erreur.

## 3. Rappels planifiés
- Champ famille `reminders: [{id, childId, questName?, days:[0-6 (0=lundi)], time:"HH:MM", enabled, lastSent?}]`, ajouté à la liste blanche de `saveFamily` (+ merge par id, enfant ne peut pas l'écrire).
- `src/reminders.mjs` : `dueReminders(families, now)` pur (fuseau Paris, jour+heure atteints, pas déjà envoyé ce jour) et `runReminders(store, now)` : envoie un push à l'enfant listant ses quêtes non validées (aucun envoi s'il n'y en a pas), puis enregistre `lastSent`.
- Surcharge par quête : un rappel avec `questName` ne concerne que cette quête ; sinon toutes les quêtes non validées de l'enfant.
- `server.js` : minuteur 60 s (désactivé en NODE_ENV=test sauf `REMINDER_TICK_MS`), arrêté au shutdown.
- UI parent : bloc « Rappels » (liste, ajout jours/heure/quête optionnelle, activer/supprimer).

## 4. Tests
Vitest : email, remindQuest, dueReminders/runReminders (jours, heure, doublon, validée, fuseau, redémarrage), permissions enfant. Playwright : bouton Notifier, CRUD rappels, déclenchement via horloge simulée.
