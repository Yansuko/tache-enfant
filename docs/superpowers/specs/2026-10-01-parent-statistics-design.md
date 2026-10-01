# Design: Page de Statistiques Parents

**Date:** 2026-10-01  
**Scope:** Nouvel onglet "Statistiques" pour que les parents suivent l'évolution des tâches jour après jour avec analytics multi-niveaux (jour, semaine, mois, année)

---

## 1. Vue d'ensemble

La page de statistiques est un nouvel onglet accessible depuis la navigation principale du parent. Elle permet de:
- Suivre les performances de chaque enfant sur différentes périodes
- Visualiser tendances et comparaisons avec périodes précédentes
- Identifier les tâches les plus/moins complétées
- Comparer les enfants entre eux

### Architecture
```
┌─ Sélecteur enfant + période (Jour/Semaine/Mois/Année)
├─ Enfant sélectionné en détail
│  ├─ 4 cartes synthèse (Tâches, XP, Or, Meilleur jour)
│  └─ 3 graphiques (Tâches/jour, Progression XP/Or, Top 5 tâches)
└─ Aperçu compact des autres enfants (tableau)
```

---

## 2. Sélecteur enfant + période

**Composants:**
- Dropdown "Enfant": liste des enfants de la famille active
- Boutons période: Jour | Semaine | Mois | Année
- Affiche la plage de dates actuelle (ex: "7-13 Oct 2026")

**Comportement:**
- Changement d'enfant ou de période met à jour tous les graphiques
- L'état (enfant/période sélectionné) est sauvegardé en localStorage pour persistence

---

## 3. Cartes de synthèse (enfant sélectionné)

Afficher 4 cartes, chacune avec:
- Titre + icône
- Chiffre principal (large)
- Sous-texte: comparaison avec période précédente (ex: "+15% vs semaine dernière")
- Flèche indicatrice (↑ vert / ↓ orange / → gris si stable)

### Carte 1: Tâches complétées
- **Chiffre:** nombre total de tâches faites pendant la période
- **% de complétion:** (tâches faites) / (tâches assignées) × 100
- **Comparaison:** % vs période précédente

### Carte 2: XP gagné
- **Chiffre:** total XP accumulé
- **Comparaison:** delta vs période précédente

### Carte 3: Or gagné
- **Chiffre:** total or accumulé
- **Comparaison:** delta vs période précédente

### Carte 4: Meilleur jour
- **Chiffre:** jour (ex: "Jeudi 10 Oct") + nombre de tâches ce jour
- **Sous-texte:** "X tâches" et XP/or gagnés ce jour

---

## 4. Graphiques (enfant sélectionné)

### Graphique 1: Tâches complétées par jour
- **Type:** Barres verticales
- **Axe X:** Jours de la période (ex: "Lun 7", "Mar 8", ..., "Dim 13")
- **Axe Y:** Nombre de tâches complétées (0-max du dataset)
- **Couleurs:**
  - Vert si ≥ moyenne de la période
  - Gris si < moyenne
- **Interactivité:** hover montre le détail (X tâches, Y XP, Z or)

### Graphique 2: Progression XP/Or
- **Type:** Deux courbes superposées
- **Axe X:** Jours de la période
- **Axe Y:** Cumul depuis le début de la période
- **Couleurs:** Bleu pour XP, Orange pour Or
- **Interactivité:** Légende clickable pour show/hide une courbe

### Graphique 3: Top 5 tâches
- **Type:** Barres horizontales
- **Données:** 5 tâches les plus souvent complétées pendant la période
- **Axe Y:** Nom de la tâche (ex: "Ranger sa chambre")
- **Axe X:** Nombre de fois complétées
- **Couleur:** Uniforme (bleu/vert)

---

## 5. Aperçu compact des autres enfants

**Tableau avec colonnes:**
- Nom enfant
- Tâches complétées (nombre + %)
- XP gagné
- Or gagné
- Bouton "Voir détail" → sélectionne l'enfant

**Tri:** Configurable par colonne (défaut: par nom)

---

## 6. Implémentation technique

### Backend (_core.mjs)

**Modification du modèle Task:**
Ajouter un champ `completedAt` (timestamp en ms) au moment où `done` passe à `true`.

```javascript
// Quand une tâche est marquée comme faite:
task.completedAt = Date.now();
```

**Nouvelle fonction: `aggregateTaskStats(child, startDate, endDate)`**
Retourne:
```javascript
{
  tasksCount: number,        // tâches complétées
  tasksAttempted: number,    // tâches assignées
  completionRate: percent,
  xpGained: number,
  goldGained: number,
  dailyBreakdown: {
    // Par jour: { tasksCount, xp, gold }
  },
  topTasks: [ { name, count }, ... ],
  bestDay: { date, tasksCount, xp, gold }
}
```

### Frontend (index.html)

**Nouvelle fonction: `screenStats()`**
Rend l'écran statistiques avec tous les graphiques.

**State variables:**
```javascript
let statsChildIndex = 0;    // Enfant sélectionné
let statsPeriod = 'week';   // 'day', 'week', 'month', 'year'
```

**Librairie graphiques:** Chart.js (CDN) ou SVG simple selon complexité

---

## 7. Flux de données

1. Parent clique sur onglet "Statistiques"
2. Frontend charge les stats de l'enfant actif pour la période "semaine" (défaut)
3. Appel API: `/api/getTaskStats?childId=X&period=week`
4. Backend agrège les données et retourne JSON
5. Frontend rend les 4 cartes + 3 graphiques
6. Parent change enfant/période → boucle 3-5

---

## 8. Données requises

Pour chaque enfant:
- Historique complet des tâches avec `completedAt`
- Date d'aujourd'hui (pour calculs de périodes)

---

## 9. Points limites et extensions futures

**Limites actuelles (YAGNI):**
- Pas de stockage d'historique permanent - on recalcule à partir des `completedAt`
- Pas d'export PDF/CSV
- Pas de notifications ou alertes sur tendances

**Extensions possibles:**
- Graphiques par type de tâche (tâches quotidiennes vs ponctuelles)
- Objectifs et seuils configurables
- Comparaison entre enfants sur le même graphique
- Prédictions (ex: "À ce rythme, niveau X le Y")

