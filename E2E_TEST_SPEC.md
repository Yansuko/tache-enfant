# DailyKids Quest - E2E Test Specifications

## Overview
Ce document spécifie tous les tests E2E pour l'application DailyKids Quest. Chaque test suit le format:
- **Titre**: Nom de l'action testée
- **Préconditions**: État initial
- **Étapes**: Actions à effectuer
- **Résultat attendu**: Comportement attendu
- **Vérifications**: Points à vérifier

---

## 1. AUTHENTIFICATION

### 1.1 Créer un compte
**Préconditions:** Utilisateur non authentifié
**Étapes:**
1. Naviguer vers la page de connexion
2. Cliquer sur "Créer un nouveau compte"
3. Remplir email: `new-user@test.fr`
4. Remplir mot de passe: `testpass123`
5. Confirmer le mot de passe: `testpass123`
6. Cliquer sur "Créer un compte"

**Résultat attendu:**
- Compte créé avec succès
- Utilisateur automatiquement connecté
- Redirection vers l'onglet "Enfants"

**Vérifications:**
- ✓ Compte existe dans Firebase Auth
- ✓ Document utilisateur créé dans Firebase Realtime DB
- ✓ `users/{uid}` contient email et familyIds[]

---

### 1.2 Se connecter
**Préconditions:** Utilisateur créé (parent@demo.fr / testpass123)
**Étapes:**
1. Naviguer vers la page de connexion
2. Remplir email: `parent@demo.fr`
3. Remplir mot de passe: `testpass123`
4. Cliquer sur "Se connecter"

**Résultat attendu:**
- Connexion réussie
- Redirection vers l'onglet "Quêtes"
- Affichage des enfants et de leurs tâches

**Vérifications:**
- ✓ Token Firebase obtenu
- ✓ Données utilisateur chargées
- ✓ Enfants affichés correctement

---

### 1.3 Se déconnecter
**Préconditions:** Utilisateur connecté
**Étapes:**
1. Cliquer sur le bouton "Se déconnecter"
2. Confirmer la déconnexion

**Résultat attendu:**
- Déconnexion réussie
- Redirection vers la page d'accueil
- Données utilisateur vidées du local storage

**Vérifications:**
- ✓ Token Firebase supprimé
- ✓ État de l'application réinitialisé
- ✓ Aucune donnée sensible en cache

---

### 1.4 Changer le mot de passe
**Préconditions:** Utilisateur connecté
**Étapes:**
1. Aller à l'onglet "Famille"
2. Scroller jusqu'à la section "Sécurité"
3. Remplir "Nouveau mot de passe": `newpass456`
4. Remplir "Confirmer le mot de passe": `newpass456`
5. Cliquer sur "Mettre à jour"

**Résultat attendu:**
- Mot de passe changé avec succès
- Message de confirmation affiché
- Enfants toujours visibles (**BUG FIX**)

**Vérifications:**
- ✓ Ancien mot de passe ne fonctionne plus
- ✓ Nouveau mot de passe fonctionne
- ✓ 3 enfants (Emma, Lucas, Test) toujours présents après reconnexion
- ✓ Données familiales intactes dans Firebase

---

## 2. GESTION DES FAMILLES

### 2.1 Créer une famille
**Préconditions:** Utilisateur connecté sans famille
**Étapes:**
1. Aller à l'onglet "Famille"
2. Remplir "Créer une nouvelle famille": `Famille Test`
3. Cliquer sur "+ Créer la famille"

**Résultat attendu:**
- Nouvelle famille créée
- Utilisateur ajouté comme propriétaire
- Affichage dans la liste des familles

**Vérifications:**
- ✓ Famille créée dans Firebase
- ✓ `families/{familyId}` contient name, owner, members
- ✓ `users/{uid}.familyIds` mis à jour
- ✓ Enfants array initialisé vide

---

### 2.2 Inviter un adulte à une famille
**Préconditions:** Utilisateur propriétaire d'une famille
**Étapes:**
1. Aller à l'onglet "Famille"
2. Trouver "Donner l'accès à un autre adulte"
3. Remplir email: `spouse@test.fr`
4. Cliquer sur "Inviter"

**Résultat attendu:**
- Invitation envoyée
- Email de confirmation affiché
- Nouvel adulte peut se connecter et accéder à la famille

**Vérifications:**
- ✓ Email invitation envoyé
- ✓ Compte créé automatiquement si n'existe pas
- ✓ Adulte ajouté à `families/{familyId}.members[]`
- ✓ FamilyId ajouté à `users/{spouse-uid}.familyIds[]`

---

## 3. GESTION DES ENFANTS

### 3.1 Ajouter un enfant
**Préconditions:** Utilisateur connecté, onglet "Enfants"
**Étapes:**
1. Scroller jusqu'à "+ Ajouter un enfant"
2. Remplir "Prénom": `Alice`
3. Cliquer sur "Ajouter l'enfant"
4. Cliquer sur "Enregistrer les enfants"

**Résultat attendu:**
- Enfant ajouté à la liste
- Affichage dans l'onglet "Enfants" avec Niv. 1, 0 XP, 0 coins

**Vérifications:**
- ✓ Child créé dans `families/{familyId}/children[]`
- ✓ ID unique généré (child-uuid)
- ✓ Propriétés par défaut: xp: 0, gold: 0, tasks: []
- ✓ PIN à créer (pas encore défini)

---

### 3.2 Réinitialiser le PIN d'un enfant
**Préconditions:** Enfant avec PIN défini
**Étapes:**
1. Aller à l'onglet "Enfants"
2. Cliquer sur "Réinitialiser le PIN" pour un enfant
3. Confirmer

**Résultat attendu:**
- PIN réinitialisé
- Nouveau PIN généré aléatoirement
- Enfant doit entrer le nouveau PIN pour se connecter

**Vérifications:**
- ✓ `children[childId].pin` mis à jour
- ✓ Ancien PIN ne fonctionne plus
- ✓ Nouveau PIN fonctionne

---

### 3.3 Supprimer un enfant
**Préconditions:** Enfant existe dans la famille
**Étapes:**
1. Aller à l'onglet "Enfants"
2. Cliquer sur "Supprimer" pour l'enfant
3. Confirmer la suppression

**Résultat attendu:**
- Enfant supprimé de la liste
- Données de l'enfant supprimées de Firebase
- Redirection vers le prochain enfant ou "Aucun enfant"

**Vérifications:**
- ✓ Child supprimé de `families/{familyId}/children[]`
- ✓ Tâches associées supprimées
- ✓ Historique d'activité conservé (audit trail)

---

## 4. GESTION DES TÂCHES

### 4.1 Ajouter une tâche
**Préconditions:** Enfant sélectionné, onglet "Quêtes"
**Étapes:**
1. Remplir le champ "Ajouter une quête"
2. Remplir XP requis (ex: 50)
3. Remplir coins (ex: 25)
4. Cliquer sur "Ajouter"

**Résultat attendu:**
- Tâche ajoutée à la liste des quêtes
- Affichage avec récompenses
- Disponible immédiatement

**Vérifications:**
- ✓ Task créée dans `children[childId].tasks[]`
- ✓ Propriétés: name, xp, gold, done, daily (par défaut false)
- ✓ Timestamp créé

---

### 4.2 Valider une tâche (Enfant)
**Préconditions:** Enfant connecté, tâche disponible
**Étapes:**
1. Naviguer vers l'onglet "Quêtes"
2. Cliquer sur le cercle blanc devant une tâche

**Résultat attendu:**
- Cercle devient vert avec checkmark
- XP et coins ajoutés au total de l'enfant
- Animation de gain affichée
- Vérification du niveau up

**Vérifications:**
- ✓ `children[childId].tasks[taskId].done = true`
- ✓ `children[childId].xp += task.xp`
- ✓ `children[childId].gold += task.gold`
- ✓ Niveau recalculé si XP >= threshold
- ✓ Bonus quotidien appliqué si applicable

---

### 4.3 Annuler une tâche validée
**Préconditions:** Tâche validée (cercle vert)
**Étapes:**
1. Cliquer sur le cercle vert

**Résultat attendu:**
- Cercle redevient blanc
- XP et coins soustraits du total
- Tâche reste dans l'historique

**Vérifications:**
- ✓ `children[childId].tasks[taskId].done = false`
- ✓ `children[childId].xp -= task.xp`
- ✓ `children[childId].gold -= task.gold`

---

### 4.4 Marquer une tâche comme quotidienne
**Préconditions:** Tâche créée
**Étapes:**
1. Cliquer sur l'icône calendar/daily sur une tâche (si disponible)
2. Confirmer

**Résultat attendu:**
- Tâche marquée comme quotidienne
- Réapparaît automatiquement chaque jour
- Historique conservé

**Vérifications:**
- ✓ `children[childId].tasks[taskId].daily = true`
- ✓ Réinitialisation automatique à minuit
- ✓ Historique avec timestamps

---

### 4.5 Supprimer une tâche
**Préconditions:** Tâche existe
**Étapes:**
1. Long-press ou cliquer sur X de la tâche
2. Confirmer

**Résultat attendu:**
- Tâche supprimée de la liste active
- Historique conservé pour audit

**Vérifications:**
- ✓ Task supprimée de `children[childId].tasks[]`
- ✓ Historique toujours présent

---

## 5. GESTION DES RÉCOMPENSES

### 5.1 Ajouter une récompense (Parent)
**Préconditions:** Parent connecté, onglet "Boutique"
**Étapes:**
1. Cliquer sur "+ Ajouter une récompense"
2. Remplir nom: `Glace`
3. Remplir coût: 50 coins
4. Cliquer sur "Ajouter"

**Résultat attendu:**
- Récompense ajoutée à la boutique
- Visible pour tous les enfants

**Vérifications:**
- ✓ Reward créée dans `families/{familyId}/rewards[]`
- ✓ Propriétés: name, cost, id

---

### 5.2 Demander une récompense (Enfant)
**Préconditions:** Enfant a assez de coins, récompense disponible
**Étapes:**
1. Onglet "Boutique"
2. Cliquer sur une récompense
3. Cliquer sur "Demander"

**Résultat attendu:**
- Demande envoyée au parent
- Coins déduits temporairement (pending)
- Message "En attente d'approbation"

**Vérifications:**
- ✓ Request créée dans `families/{familyId}/requests[]`
- ✓ Status: "pending"
- ✓ `children[childId].gold -= reward.cost`
- ✓ Parent notifié par email

---

### 5.3 Approuver une demande de récompense (Parent)
**Préconditions:** Demande pendante reçue
**Étapes:**
1. Onglet "Famille" ou notification
2. Trouver la demande pendante
3. Cliquer sur "Approuver"

**Résultat attendu:**
- Récompense validée
- Coins définitivement soustraits
- Enfant notifié

**Vérifications:**
- ✓ `families/{familyId}.requests[requestId].status = "approved"`
- ✓ Coins restent déduits
- ✓ Email de confirmation envoyé à l'enfant

---

### 5.4 Refuser une demande de récompense (Parent)
**Préconditions:** Demande pendante reçue
**Étapes:**
1. Onglet "Famille" ou notification
2. Trouver la demande pendante
3. Cliquer sur "Refuser"

**Résultat attendu:**
- Coins remboursés à l'enfant
- Demande marquée comme refusée
- Enfant notifié

**Vérifications:**
- ✓ `families/{familyId}.requests[requestId].status = "rejected"`
- ✓ `children[childId].gold += reward.cost` (remboursement)
- ✓ Email d'explication envoyé à l'enfant

---

### 5.5 Supprimer une récompense (Parent)
**Préconditions:** Récompense existe
**Étapes:**
1. Onglet "Boutique"
2. Cliquer sur X pour supprimer une récompense
3. Confirmer

**Résultat attendu:**
- Récompense supprimée de la boutique
- Demandes pendantes annulées avec remboursement

**Vérifications:**
- ✓ Reward supprimée de `families/{familyId}/rewards[]`
- ✓ Demandes annulées avec remboursement

---

## 6. GESTION DES NIVEAUX

### 6.1 Consulter la configuration des niveaux
**Préconditions:** Parent connecté
**Étapes:**
1. Onglet "Statistiques"
2. Chercher section "Niveaux" ou "Configuration"

**Résultat attendu:**
- Affichage des seuils XP pour chaque niveau
- Configuration défaut: 100 XP par niveau

**Vérifications:**
- ✓ `levelConfigs/{familyId}.levels[]` chargé correctement
- ✓ Affichage lisible et intuitif

---

### 6.2 Modifier la configuration des niveaux
**Préconditions:** Parent connecté, section niveaux accessible
**Étapes:**
1. Cliquer sur "Modifier configuration"
2. Changer le coût du niveau 2 de 100 à 150 XP
3. Cliquer sur "Sauvegarder"

**Résultat attendu:**
- Configuration mise à jour
- Nouveaux enfants utilisent la nouvelle config
- Enfants existants: comportement TBD

**Vérifications:**
- ✓ `levelConfigs/{familyId}.levels[1].xpRequired = 150`
- ✓ Changement effectif pour enfants futurs

---

## 7. GESTION DES NOTES

### 7.1 Ajouter une note pour un enfant
**Préconditions:** Parent connecté, enfant sélectionné, onglet "Notes"
**Étapes:**
1. Cliquer sur "+ Ajouter une note"
2. Remplir le contenu: `Alice a été très sage aujourd'hui!`
3. Cliquer sur "Ajouter"

**Résultat attendu:**
- Note ajoutée à l'historique
- Affichage avec date/heure

**Vérifications:**
- ✓ Note créée dans `children[childId].notes[]` ou équivalent
- ✓ Timestamp enregistré
- ✓ Visible au prochain login

---

### 7.2 Supprimer une note
**Préconditions:** Note existe
**Étapes:**
1. Onglet "Notes"
2. Cliquer sur X pour supprimer une note
3. Confirmer

**Résultat attendu:**
- Note supprimée de l'affichage
- Historique conservé en base

**Vérifications:**
- ✓ Note supprimée de la liste d'affichage
- ✓ Audit trail conservé en base

---

## 8. NAVIGATION ET INTERFACE

### 8.1 Basculer entre enfants
**Préconditions:** Famille avec 3+ enfants, parent connecté
**Étapes:**
1. Cliquer sur le sélecteur d'enfant (dropdown "Emma")
2. Sélectionner "Lucas"

**Résultat attendu:**
- Affichage mis à jour pour Lucas
- Tâches, récompenses et stats de Lucas affichées

**Vérifications:**
- ✓ Données de Lucas chargées
- ✓ Aucun mélange de données entre enfants
- ✓ PIN de Lucas indépendant

---

### 8.2 Mode Parent vs Mode Enfant
**Préconditions:** Utilisateur sur page d'accueil
**Étapes:**
1. Cliquer sur "Enfant"
2. Remplir PIN d'un enfant
3. Se connecter

**Résultat attendu:**
- Vue enfant avec tâches et récompenses
- Pas d'accès aux paramètres parents

**Vérifications:**
- ✓ PIN vérifié correctement
- ✓ Menus différents enfant vs parent
- ✓ Pas d'accès aux données d'autres enfants

---

## 9. SYNCHRONISATION ET DONNÉES

### 9.1 Synchronisation multi-device
**Préconditions:** Parent connecté sur 2 appareils
**Étapes:**
1. Appareil A: Valider une tâche pour Emma
2. Appareil B: Actualiser

**Résultat attendu:**
- Tâche synchronisée sur l'appareil B
- Même XP/coins sur les deux appareils

**Vérifications:**
- ✓ Firebase Realtime DB synchronisé
- ✓ Listeners mis à jour en temps réel

---

### 9.2 Sauvegarde des données après déconnexion
**Préconditions:** Parent connecté, données modifiées
**Étapes:**
1. Valider une tâche
2. Immédiatement se déconnecter
3. Se reconnecter

**Résultat attendu:**
- Tâche reste validée
- XP/coins conservés

**Vérifications:**
- ✓ Données sauvegardées malgré déconnexion rapide
- ✓ Pas de perte de données

---

## 10. RÉSISTANCE AUX BOGUES (TESTS DE RÉGRESSION)

### 10.1 Les enfants ne disparaissent pas après changement de mot de passe (BUG FIX)
**Préconditions:** Utilisateur avec 3 enfants
**Étapes:**
1. Vérifier que 3 enfants sont visibles
2. Changer le mot de passe
3. Se déconnecter
4. Se reconnecter avec le nouveau mot de passe

**Résultat attendu:**
- 3 enfants toujours visibles après reconnexion
- Aucun enfant supprimé ou perdu

**Vérifications:**
- ✓ `families/{familyId}.children[]` contient 3 items
- ✓ Données des enfants intactes (XP, coins, tâches)

---

## 11. ACTIONS DE L'ENFANT (MODE ENFANT)

### 11.1 Créer un code PIN (Premier accès)
**Préconditions:** Enfant non encore connecté, famille existe
**Étapes:**
1. À l'écran d'accueil, cliquer sur "Enfant"
2. Sélectionner le prénom de l'enfant
3. Voir "PIN non défini - Créez votre code PIN"
4. Remplir 4 chiffres: `1234`
5. Confirmer: `1234`
6. Cliquer sur "Créer le PIN"

**Résultat attendu:**
- PIN créé avec succès
- Redirection vers onglet "Quêtes"
- Mode enfant actif
- Enfant peut voir ses tâches

**Vérifications:**
- ✓ `children[childId].pin = "1234"` (hash en base)
- ✓ PIN non réversible (pas de plaintext en base)
- ✓ Interface enfant affichée (quêtes, boutique, profil)

---

### 11.2 Se connecter avec le PIN
**Préconditions:** Enfant a déjà un PIN, page d'accueil
**Étapes:**
1. Cliquer sur "Enfant"
2. Sélectionner le prénom de l'enfant
3. Remplir PIN: `1234`
4. Cliquer sur "Entrer"

**Résultat attendu:**
- Connexion réussie
- Redirection vers onglet "Quêtes"
- Accès à ses tâches et récompenses

**Vérifications:**
- ✓ PIN vérifié correctement
- ✓ Données de l'enfant chargées
- ✓ Pas d'accès aux données d'autres enfants

---

### 11.3 Valider une tâche (Vue Enfant)
**Préconditions:** Enfant connecté, tâche disponible dans "Quêtes"
**Étapes:**
1. Onglet "Quêtes"
2. Cliquer sur le cercle blanc devant une tâche "Faire les devoirs"
3. Confirmer la validation

**Résultat attendu:**
- Cercle devient vert avec checkmark
- XP gagnés affichés en animation (+50 XP)
- Coins gagnés affichés en animation (+25 coins)
- Barre d'expérience se met à jour
- Vérification de level up si applicable

**Vérifications:**
- ✓ `children[childId].tasks[taskId].done = true`
- ✓ `children[childId].xp += 50`
- ✓ `children[childId].gold += 25`
- ✓ Niveau recalculé si XP >= seuil
- ✓ Synchronisation en temps réel via Firebase

---

### 11.4 Annuler une tâche validée (Vue Enfant)
**Préconditions:** Enfant connecté, tâche avec cercle vert
**Étapes:**
1. Onglet "Quêtes"
2. Cliquer sur le cercle vert

**Résultat attendu:**
- Cercle redevient blanc
- XP soustraits (-50 XP)
- Coins soustraits (-25 coins)
- Barre mise à jour

**Vérifications:**
- ✓ `children[childId].tasks[taskId].done = false`
- ✓ `children[childId].xp -= 50`
- ✓ `children[childId].gold -= 25`

---

### 11.5 Consulter la boutique de récompenses
**Préconditions:** Enfant connecté, récompenses disponibles
**Étapes:**
1. Cliquer sur onglet "Boutique"
2. Scroller et voir les récompenses

**Résultat attendu:**
- Affichage de toutes les récompenses de la famille
- Chaque récompense affiche: nom, coût, description
- Boutons "Demander" pour chaque récompense

**Vérifications:**
- ✓ Récompenses chargées depuis `families/{familyId}/rewards[]`
- ✓ Coûts affichés correctement
- ✓ Bouton "Demander" présent

---

### 11.6 Demander une récompense (Vue Enfant)
**Préconditions:** Enfant a assez de coins, récompense visible
**Étapes:**
1. Onglet "Boutique"
2. Cliquer sur une récompense "Glace (50 coins)"
3. Cliquer sur "Demander"

**Résultat attendu:**
- Message de confirmation
- Coins déduits immédiatement (50 - 50 = 0)
- Statut "En attente d'approbation" affiché
- Enfant ne peut plus demander la même récompense (coins insuffisants)

**Vérifications:**
- ✓ Request créée dans `families/{familyId}/requests[]`
- ✓ Request.status = "pending"
- ✓ Request.childId = enfant actuel
- ✓ `children[childId].gold -= 50` immédiatement
- ✓ Parent reçoit notification

---

### 11.7 Demander une récompense avec coins insuffisants
**Préconditions:** Enfant connecté, coins insuffisants
**Étapes:**
1. Onglet "Boutique"
2. Essayer de demander une récompense coûtant plus que les coins disponibles
3. Vérifier le comportement

**Résultat attendu:**
- Bouton "Demander" désactivé ou grisé
- Message: "Vous n'avez pas assez de coins" (50/100 coins)

**Vérifications:**
- ✓ Bouton non-cliquable
- ✓ Pas de request créée
- ✓ Aucune déduction de coins

---

### 11.8 Consulter son profil (Vue Enfant)
**Préconditions:** Enfant connecté
**Étapes:**
1. Cliquer sur onglet "Profil" ou icône utilisateur
2. Voir les informations de l'enfant

**Résultat attendu:**
- Affichage du prénom
- Affichage du niveau actuel
- Affichage des XP/coins totaux
- Barre de progression vers niveau suivant
- Bouton "Changer PIN"
- Bouton "Déconnexion"

**Vérifications:**
- ✓ Données chargées depuis `children[childId]`
- ✓ Niveau calculé correctement
- ✓ Barre de progression fidèle

---

### 11.9 Changer son PIN (Vue Enfant)
**Préconditions:** Enfant connecté
**Étapes:**
1. Onglet "Profil"
2. Cliquer sur "Changer PIN"
3. Remplir ancien PIN: `1234`
4. Remplir nouveau PIN: `5678`
5. Confirmer nouveau PIN: `5678`
6. Cliquer sur "Sauvegarder"

**Résultat attendu:**
- PIN changé avec succès
- Message de confirmation
- Déconnexion automatique
- Reconnexion nécessaire avec nouveau PIN

**Vérifications:**
- ✓ Ancien PIN ne fonctionne plus
- ✓ Nouveau PIN fonctionne
- ✓ Hash de PIN mis à jour en base
- ✓ Session invalidée

---

### 11.10 Se déconnecter (Mode Enfant)
**Préconditions:** Enfant connecté
**Étapes:**
1. Onglet "Profil"
2. Cliquer sur "Déconnexion"
3. Confirmer

**Résultat attendu:**
- Déconnexion réussie
- Retour à l'écran d'accueil
- Mode sélection enfant/parent visible

**Vérifications:**
- ✓ Session enfant supprimée
- ✓ Données non persistées en cache non-chiffré
- ✓ Sélection enfant réinitialisée

---

### 11.11 Voir la progression vers le niveau suivant
**Préconditions:** Enfant connecté, niveau < 50
**Étapes:**
1. Onglet "Quêtes"
2. Observer la barre de progression
3. Valider une tâche pour voir la barre s'animer

**Résultat attendu:**
- Barre affiche XP actuel / XP requis pour niveau suivant
- Animation fluide lors des gains d'XP
- Texte "XP pour niveau 3" visible
- Quand level up: notification visuelle/animation

**Vérifications:**
- ✓ Barre calculée: `(xp % levelThreshold) / levelThreshold`
- ✓ Animation de progression
- ✓ Level up détecté correctement

---

### 11.12 Consulter l'historique des tâches
**Préconditions:** Enfant connecté avec tâches validées
**Étapes:**
1. Onglet "Quêtes"
2. Scroller en bas ou accéder à "Historique"
3. Voir les tâches validées aujourd'hui/hier

**Résultat attendu:**
- Affichage des tâches validées par date
- Groupées par jour
- Avec horodatage

**Vérifications:**
- ✓ Historique triés par date décroissante
- ✓ Timestamps affichés correctement
- ✓ Tâches quotidiennes marquées

---

### 11.13 Notification de statut de récompense (Vue Enfant)
**Préconditions:** Enfant a demandé une récompense, parent l'approuve
**Étapes:**
1. Enfant connecté, affichant "En attente d'approbation"
2. Parent approuve la demande
3. Enfant actualise ou page se met à jour

**Résultat attendu:**
- Notification: "Votre récompense a été approuvée!"
- Récompense disparaît de la boutique
- Historique des récompenses approuvées visible

**Vérifications:**
- ✓ Request.status passe à "approved"
- ✓ Récompense marquée comme obtenue
- ✓ Synchronisation en temps réel

---

### 11.14 Ajouter une note personnelle (Vue Enfant)
**Préconditions:** Enfant connecté, onglet "Notes"
**Étapes:**
1. Onglet "Notes" ou "Journal"
2. Cliquer sur "+ Ajouter une note"
3. Remplir: `J'ai réussi mes devoirs de maths!`
4. Cliquer sur "Sauvegarder"

**Résultat attendu:**
- Note ajoutée avec horodatage
- Note visible pour parent et enfant
- Affichage avec emoji/icône

**Vérifications:**
- ✓ Note créée dans `children[childId].notes[]`
- ✓ Timestamp enregistré
- ✓ Visible après reconnexion

---

### 11.15 Voir les statistiques personnelles
**Préconditions:** Enfant connecté, un minimum d'activité
**Étapes:**
1. Onglet "Statistiques" ou "Profil"
2. Consulter répartition XP par tâche
3. Voir récompenses obtenues
4. Voir bonus/malus appliqués

**Résultat attendu:**
- Graphique ou tableau de statistiques
- Nombre de tâches validées
- Total de coins gagnés
- Progression par semaine

**Vérifications:**
- ✓ Données calculées correctement
- ✓ Historique conservé
- ✓ Affichage lisible

---

## 12. VÉRIFICATION DES STATISTIQUES

### 12.1 Afficher les statistiques d'un enfant (Parent)
**Préconditions:** Parent connecté, enfant avec activité (5+ tâches validées)
**Étapes:**
1. Onglet "Statistiques"
2. Sélectionner enfant "Emma"
3. Observer les statistiques affichées

**Résultat attendu:**
- Affichage du niveau actuel (ex: Niv. 5)
- Total XP (ex: 450/500)
- Total coins (ex: 125)
- Nombre de tâches validées (ex: 12)
- Nombre de récompenses obtenues (ex: 2)
- Historique des 7 derniers jours

**Vérifications:**
- ✓ XP = somme de tous les `tasks[].xp` où `done = true`
- ✓ Coins = somme de tous les `tasks[].gold` où `done = true`
- ✓ Niveau calculé correctement (XP / levelThreshold)
- ✓ Compteurs mis à jour en temps réel

---

### 12.2 Filtrer les statistiques par période
**Préconditions:** Parent connecté, enfant avec historique de 30+ jours
**Étapes:**
1. Onglet "Statistiques"
2. Sélectionner enfant
3. Cliquer sur filtre "Période"
4. Sélectionner "Cette semaine"

**Résultat attendu:**
- Affichage des statistiques pour les 7 derniers jours
- XP et coins de cette semaine calculés
- Autres filtres disponibles: "Ce mois", "Tous les temps"

**Vérifications:**
- ✓ Données filtrées correctement par date
- ✓ Timestamps de tâches respectent le filtre
- ✓ Calculs exacts pour la période

---

### 12.3 Voir les tâches validées par enfant
**Préconditions:** Parent connecté, statistiques d'enfant ouvertes
**Étapes:**
1. Onglet "Statistiques"
2. Sélectionner enfant
3. Scroller jusqu'à "Tâches validées"
4. Voir la liste des tâches avec XP et coins

**Résultat attendu:**
- Tableau avec colonnes: Tâche, Date, XP, Coins
- Triées par date décroissante
- Total en bas du tableau

**Vérifications:**
- ✓ Tâches affichées avec `done = true`
- ✓ Dates et heures correctes
- ✓ XP et coins correspondant à la tâche

---

### 12.4 Comparer les enfants
**Préconditions:** Parent avec 2+ enfants
**Étapes:**
1. Onglet "Statistiques"
2. Cliquer sur "Comparer enfants"
3. Sélectionner Emma et Lucas
4. Observer le tableau comparatif

**Résultat attendu:**
- Tableau avec colonnes: Enfant, Niveau, XP, Coins, Tâches complétées
- Enfants classés par niveau (descendant)
- Code couleur pour les différences

**Vérifications:**
- ✓ Données de chaque enfant correctes
- ✓ Classement exact
- ✓ Calculs exacts

---

### 12.5 Voir les récompenses obtenues par enfant
**Préconditions:** Parent connecté, enfant avec récompenses approuvées
**Étapes:**
1. Onglet "Statistiques"
2. Sélectionner enfant
3. Cliquer sur "Récompenses obtenues"

**Résultat attendu:**
- Liste des récompenses approuvées
- Chacune avec: nom, date d'approbation, coût
- Total de coins dépensés

**Vérifications:**
- ✓ Récompenses avec status = "approved"
- ✓ Dates correctes
- ✓ Coûts correspondent aux récompenses

---

### 12.6 Voir le graphique de progression XP
**Préconditions:** Parent connecté, enfant avec historique XP
**Étapes:**
1. Onglet "Statistiques"
2. Sélectionner enfant
3. Observer le graphique XP par jour

**Résultat attendu:**
- Graphique linéaire montrant XP accumulé par jour
- Axe X: jours, Axe Y: XP cumulatif
- Points interactifs pour voir détails

**Vérifications:**
- ✓ Graphique reflète données réelles
- ✓ Courbe monotone croissante (jamais décroissante)
- ✓ Légende et labels clairs

---

### 12.7 Calculer le temps moyen par tâche
**Préconditions:** Parent connecté avec statistiques d'enfant
**Étapes:**
1. Onglet "Statistiques"
2. Sélectionner enfant
3. Voir "Temps moyen / tâche"

**Résultat attendu:**
- Affichage du temps moyen: "45 min par tâche"
- Calculé à partir des timestamps
- Total de temps investi

**Vérifications:**
- ✓ Calcul = (dernière tâche.timestamp - première tâche.timestamp) / nombre de tâches
- ✓ Unités cohérentes (minutes ou heures)

---

### 12.8 Exporter les statistiques (CSV/PDF)
**Préconditions:** Parent connecté, statistiques d'enfant visibles
**Étapes:**
1. Onglet "Statistiques"
2. Sélectionner enfant
3. Cliquer sur "Exporter"
4. Sélectionner format: CSV ou PDF

**Résultat attendu:**
- Fichier téléchargé: `emma-stats-2026-10-19.csv` ou `.pdf`
- Contient: niveau, XP, coins, liste des tâches, récompenses

**Vérifications:**
- ✓ Fichier téléchargé correctement
- ✓ Données complètes et correctes
- ✓ Format lisible (CSV ouvert dans Excel, PDF en lecteur)

---

### 12.9 Vérifier la cohérence des XP entre parent et enfant
**Préconditions:** Enfant connecté, a validé une tâche; parent peut voir stats
**Étapes:**
1. Enfant: voir XP dans "Profil" (ex: 50 XP)
2. Parent: voir XP dans "Statistiques" pour enfant
3. Comparer les chiffres

**Résultat attendu:**
- XP identiques dans les deux vues
- Niveau identique
- Coins identiques

**Vérifications:**
- ✓ `children[childId].xp` = affichage enfant = affichage parent
- ✓ Synchronisation Firebase en temps réel
- ✓ Pas de décalage de données

---

### 12.10 Historique complet des transactions
**Préconditions:** Parent connecté, enfant avec 2 semaines d'activité
**Étapes:**
1. Onglet "Statistiques"
2. Sélectionner enfant
3. Cliquer sur "Historique complet"
4. Voir toutes les transactions (tâches + récompenses)

**Résultat attendu:**
- Liste chronologique de TOUS les événements
- Gain XP/coins pour chaque tâche
- Perte coins pour chaque récompense approuvée
- Dates et heures exactes

**Vérifications:**
- ✓ Toutes les transactions présentes
- ✓ Triées par date/heure (récent d'abord)
- ✓ Soldes intermédiaires calculables manuellement

---

### 12.11 Vérifier les données Firebase directement
**Préconditions:** Accès Firebase Console ou script Node.js
**Étapes:**
1. Ouvrir Firebase Console
2. Naviguer vers: `children/{childId}`
3. Vérifier: `xp`, `gold`, `level`, `tasks[]`, `notes[]`
4. Comparer avec affichage UI

**Résultat attendu:**
- Données Firebase = données affichées à l'écran
- Structure respectée (tableau/objet)
- Aucune donnée dupliquée ou orpheline

**Vérifications:**
- ✓ `children[childId].xp` (number) = XP affiché
- ✓ `children[childId].gold` (number) = coins affichés
- ✓ `children[childId].tasks` (array) = liste des tâches
- ✓ `children[childId].notes` (array) = historique notes
- ✓ Chaque tâche a: `id`, `name`, `xp`, `gold`, `done`, `daily`, `createdAt`

---

### 12.12 Vérifier la cohérence des niveaux
**Préconditions:** Parent/enfant avec activité
**Étapes:**
1. Voir XP: 250
2. Voir niveau: 3
3. Vérifier configuration des niveaux
4. Calculer manuellement le niveau attendu

**Résultat attendu:**
- Niveau = XP / xpPerLevel (ex: 250 / 100 = Niv. 2 ou 3 selon formule)
- Formule cohérente (floor ou ceiling)
- Barre de progression correcte

**Vérifications:**
- ✓ `level = floor(xp / levelThreshold)` (ou ceil)
- ✓ Configuration appliquée correctement
- ✓ Pas d'erreur de calcul

---

### 12.13 Vérifier l'intégrité des récompenses
**Préconditions:** Parent connecté, statistiques visibles
**Étapes:**
1. Voir enfant: 2 récompenses approuvées (100 coins)
2. Voir XP/coins historique
3. Vérifier que coins dépensés = récompenses.cost

**Résultat attendu:**
- Coins dépensés = somme des `requests[].cost` où status = "approved"
- Coins restants = XP validées - coins dépensés
- Compteurs exacts

**Vérifications:**
- ✓ `coinsRemaining = totalCoinsGained - totalCoinsSpent`
- ✓ Approuvements reflétés dans historique
- ✓ Demandes refusées n'affectent pas les coins

---

### 12.14 Benchmark: 100 tâches validées
**Préconditions:** Tâche de test: créer enfant avec 100 tâches validées
**Étapes:**
1. Script: créer 100 tâches (chacune: 10 XP, 5 coins)
2. Valider les 100 tâches
3. Ouvrir statistiques enfant
4. Mesurer temps de chargement

**Résultat attendu:**
- Statistiques chargent en < 1 sec
- Affichage fluide (pas de lag)
- Calculs exacts: 1000 XP, 500 coins, 10/10 niveau

**Vérifications:**
- ✓ Performance acceptable
- ✓ Pas d'erreurs de calcul avec gros volumes
- ✓ Interface reste réactive

---

### 12.15 Données manquantes / orphelines
**Préconditions:** Parent avec accès console
**Étapes:**
1. Vérifier `families/{familyId}/children[]` vs statistiques affichées
2. Chercher des enfants supprimés mais pas nettoyés
3. Vérifier des tâches sans enfant associé
4. Chercher des récompenses dans demandes mais pas dans famille

**Résultat attendu:**
- Zéro données orphelines
- Suppression en cascade fonctionne
- Intégrité référentielle respectée

**Vérifications:**
- ✓ Pas de tâches pointant vers childId inexistant
- ✓ Pas de requêtes de récompense orphelines
- ✓ Pas de notes sans enfant

---

