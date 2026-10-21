# API statistiques

Trois actions en lecture seule qui agrègent les notes, les achats de récompenses et les sanctions d'une famille.
Implémentation : `netlify/functions/_core.mjs` (`statsContext`, `getGradeStats`, `getRewardStats`, `getSanctionStats`).
Tests : `node test/stats-api.test.mjs`.

## Transport

Toutes les actions passent par un seul endpoint :

```
POST /api
Content-Type: application/json
Authorization: Bearer <token>

{ "action": "<nom de l'action>", ...paramètres }
```

`action` et les paramètres sont au même niveau dans le JSON. La réponse est toujours du JSON ; une erreur a la forme `{ "error": "<message>" }`.

Obtenir un token (compte démo local) :

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api \
  -H 'Content-Type: application/json' \
  -d '{"action":"login","email":"parent@demo.fr","password":"demo"}' | jq -r .token)
```

Helper JavaScript utilisé dans les exemples ci-dessous :

```js
async function api(action, body = {}) {
  const res = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${data.error}`);
  return data;
}
```

## Paramètres communs

Les trois actions acceptent les mêmes paramètres.

| Paramètre   | Type     | Requis | Défaut               | Description |
|-------------|----------|--------|----------------------|-------------|
| `familyId`  | string   | oui    | -                    | Id de la famille (`family:<familyId>` dans le store). L'utilisateur doit être dans `members`. |
| `childId`   | string   | non    | tous les enfants     | Restreint les stats à un enfant. |
| `startDate` | `AAAA-MM-JJ` | non | `endDate` - 90 jours | Début de période, inclus (00:00:00 UTC). |
| `endDate`   | `AAAA-MM-JJ` | non | maintenant           | Fin de période, incluse (23:59:59.999 UTC). |

Règles de la période :

- Les dates sont interprétées en UTC.
- **Sans `startDate` ni `endDate`** : fenêtre des 90 derniers jours, **plus** tous les enregistrements sans date (données legacy). Leur champ `date` / `purchaseDate` vaut alors `null`.
- **Dès qu'une des deux dates est fournie** : les enregistrements sans date sont exclus.
- La date d'un enregistrement est lue dans le premier champ présent parmi `date`, `appliedAt`, `purchaseDate`, `approvedAt`, `submittedAt`, `at` (timestamp ms ou chaîne ISO).
- Les listes renvoyées sont triées par ordre chronologique (les entrées sans date en premier).

### `frequency`

Renvoyé par `getRewardStats` et `getSanctionStats`. Calculé sur la longueur de la période (minimum 1 jour), arrondi à 2 décimales :

- `perMonth` = n / (jours / 30)
- `perWeek` = n / (jours / 7)

Exemple : 1 achat avec `startDate` = `endDate` (1 jour) donne `perWeek: 7`.

## Codes d'erreur

Communs aux trois actions, vérifiés dans cet ordre :

| Statut | `error`                              | Cause |
|--------|--------------------------------------|-------|
| 401    | `Non authentifié.`                   | Token absent ou invalide. |
| 400    | `familyId requis.`                   | `familyId` absent. |
| 404    | `Famille introuvable.`               | Aucune famille avec cet id. |
| 403    | `Accès refusé.`                      | L'email du token n'est pas dans `members` de la famille. |
| 400    | `startDate invalide (AAAA-MM-JJ).`   | Format incorrect ou date impossible. |
| 400    | `endDate invalide (AAAA-MM-JJ).`     | Idem. |
| 400    | `startDate doit précéder endDate.`   | Période inversée. |
| 404    | `Enfant non trouvé.`                 | `childId` absent de la famille. |
| 500    | `Erreur serveur : <message>`         | Exception non gérée (ajoutée par `api.mjs` / `server.js`). |

Exemple :

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{ "error": "startDate invalide (AAAA-MM-JJ)." }
```

> **Limite connue :** l'accès est vérifié par email. Avec un token Firebase, `handleApi` ne résout que l'UID, l'email reste `null`, et ces actions répondent `403 Accès refusé.`. Seuls les tokens legacy (renvoyés par `login`) fonctionnent aujourd'hui.

---

## getGradeStats

Statistiques des notes par matière et par jour, avec une tendance. Sert au tableau de bord parent et au widget de profil enfant (suivre la progression scolaire, repérer une matière en baisse).

**Sources :**
- `child.grades[]` ayant une note saisie (`grade` non vide) ;
- `family.gradeRequests[]` au statut `approved` (rattachées à l'enfant via son nom). Les demandes `pending` ou refusées sont ignorées.

### Requête

```bash
curl -s -X POST http://localhost:3000/api \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"getGradeStats","familyId":"fam-demo","childId":"child-emma-demo"}'
```

```js
const stats = await api('getGradeStats', {
  familyId: 'fam-demo',
  childId: 'child-emma-demo',
  startDate: '2026-10-01',
  endDate: '2026-10-21',
});
console.log(stats.trend, stats.bySubject);
```

### Réponse 200

```json
{
  "grades": [
    { "childId": "child-emma-demo", "subject": "Mathématiques", "grade": "16/20", "xp": 50, "gold": 10, "date": null },
    { "childId": "child-emma-demo", "subject": "Français",      "grade": "13/20", "xp": 30, "gold": 5,  "date": null },
    { "childId": "child-emma-demo", "subject": "Mathématiques", "grade": "18/20", "xp": 60, "gold": 12, "date": "2026-10-20" }
  ],
  "bySubject": {
    "Mathématiques": { "count": 2, "avg": "17", "grades": ["16/20", "18/20"] },
    "Français":      { "count": 1, "avg": "13", "grades": ["13/20"] }
  },
  "byDay": {
    "2026-10-20": { "count": 1, "subjects": ["Mathématiques"] }
  },
  "trend": "improving",
  "totalXP": 140,
  "totalGold": 27
}
```

### Champs

| Champ | Type | Description |
|-------|------|-------------|
| `grades[]` | array | Notes retenues, ordre chronologique. |
| `grades[].childId` | string | Id de l'enfant. |
| `grades[].subject` | string | Matière. |
| `grades[].grade` | string | Note brute telle que saisie (`"16/20"`, `"16"`, `"8/10"`...). |
| `grades[].xp` | number | XP gagnée (0 si absent). |
| `grades[].gold` | number | Or gagné (0 si absent). |
| `grades[].date` | string \| null | Jour `AAAA-MM-JJ` (UTC), `null` si non daté. |
| `bySubject` | object | Clé = matière. |
| `bySubject.*.count` | number | Nombre de notes. |
| `bySubject.*.avg` | string \| null | Moyenne **ramenée sur 20**, 2 décimales max, en chaîne (`"17"`, `"12.5"`). `null` si aucune note lisible. |
| `bySubject.*.grades` | string[] | Notes brutes. |
| `byDay` | object | Clé = jour `AAAA-MM-JJ`. Les notes sans date n'y figurent pas. |
| `byDay.*.count` | number | Nombre de notes ce jour. |
| `byDay.*.subjects` | string[] | Matières distinctes ce jour. |
| `trend` | `"improving"` \| `"stable"` \| `"declining"` | Moyenne (sur 20) de la 2e moitié chronologique vs la 1re. Écart > 1 point = `improving`, < -1 = `declining`. `stable` si moins de 2 notes lisibles. |
| `totalXP` | number | Somme des `xp`. |
| `totalGold` | number | Somme des `gold`. |

Conversion sur 20 : `"a/b"` donne `a / b * 20` ; `"a"` seul est considéré sur 20 ; virgule décimale acceptée (`"15,5/20"`). Une note illisible (`"A+"`) reste dans `grades` mais est exclue des moyennes et de la tendance.

---

## getRewardStats

Récompenses achetées en boutique : total dépensé, récompense la plus populaire, fréquence. Sert à voir combien d'or part en récompenses et lesquelles plaisent.

**Source :** `family.requests[]` au statut `approved` (un achat = une demande approuvée). La date d'achat est `approvedAt`, posée côté serveur par `saveFamily` (`stampRewardPurchases`) au moment où la demande passe à `approved`. Les achats approuvés avant cette fonctionnalité n'ont pas de date.

### Requête

```bash
curl -s -X POST http://localhost:3000/api \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"getRewardStats","familyId":"fam-demo","startDate":"2026-10-01","endDate":"2026-10-21"}'
```

```js
const { totalSpent, mostPopular, frequency } = await api('getRewardStats', { familyId: 'fam-demo' });
```

### Réponse 200

```json
{
  "purchases": [
    { "name": "Sortie cinéma",       "cost": 40, "purchaseDate": null,         "rewardId": null, "childId": "child-emma-demo" },
    { "name": "30 min de jeu vidéo", "cost": 50, "purchaseDate": "2026-10-18", "rewardId": null, "childId": "child-emma-demo" }
  ],
  "byReward": {
    "Sortie cinéma":       { "count": 1, "totalCost": 40, "lastPurchase": null },
    "30 min de jeu vidéo": { "count": 1, "totalCost": 50, "lastPurchase": "2026-10-18" }
  },
  "totalSpent": 90,
  "avgCost": 45,
  "mostPopular": "Sortie cinéma",
  "frequency": { "perMonth": 0.67, "perWeek": 0.16 }
}
```

### Champs

| Champ | Type | Description |
|-------|------|-------------|
| `purchases[]` | array | Achats retenus, ordre chronologique. |
| `purchases[].name` | string | Nom de la récompense. |
| `purchases[].cost` | number | Coût en or (0 si absent). |
| `purchases[].purchaseDate` | string \| null | Jour `AAAA-MM-JJ` (UTC), `null` si non daté. |
| `purchases[].rewardId` | string \| null | `rewardId` de la demande, sinon id de la récompense du catalogue `family.rewards` de même nom, sinon `null`. |
| `purchases[].childId` | string \| null | Id de l'enfant acheteur. |
| `byReward` | object | Clé = nom de la récompense. |
| `byReward.*.count` | number | Nombre d'achats. |
| `byReward.*.totalCost` | number | Or total dépensé pour cette récompense. |
| `byReward.*.lastPurchase` | string \| null | Dernier jour d'achat daté, `null` si aucun daté. |
| `totalSpent` | number | Or total dépensé. |
| `avgCost` | number | `totalSpent / nombre d'achats`, 2 décimales ; 0 si aucun achat. |
| `mostPopular` | string \| null | Récompense la plus achetée (à égalité : la première rencontrée chronologiquement). `null` si aucun achat. |
| `frequency` | object | Achats par mois / semaine, voir [`frequency`](#frequency). |

---

## getSanctionStats

Sanctions appliquées : nombre, or perdu, motif le plus fréquent. Sert à suivre le comportement et l'impact des sanctions sur l'or de l'enfant.

**Source :** `child.sanctions[]`. Si une sanction n'a pas de `gold` (données legacy), le montant est repris du barème `family.sanctionsList` (entrée dont `name` = `motif`), sinon 0.

### Requête

```bash
curl -s -X POST http://localhost:3000/api \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"getSanctionStats","familyId":"fam-demo","childId":"child-emma-demo"}'
```

```js
const s = await api('getSanctionStats', { familyId: 'fam-demo', childId: 'child-emma-demo' });
console.log(`${s.totalCount} sanctions, ${s.totalGoldLost} or perdu, motif principal : ${s.mostCommon}`);
```

### Réponse 200

```json
{
  "sanctions": [
    { "motif": "Croix de conduite", "gold": 10, "date": null,         "childId": "child-emma-demo" },
    { "motif": "Devoirs non faits", "gold": 5,  "date": "2026-10-19", "childId": "child-emma-demo" }
  ],
  "byMotif": {
    "Croix de conduite": { "count": 1, "totalGold": 10 },
    "Devoirs non faits": { "count": 1, "totalGold": 5 }
  },
  "totalCount": 2,
  "totalGoldLost": 15,
  "avgGoldPerSanction": 7.5,
  "frequency": { "perMonth": 0.67, "perWeek": 0.16 },
  "mostCommon": "Croix de conduite"
}
```

Sans aucune sanction dans la période :

```json
{ "sanctions": [], "byMotif": {}, "totalCount": 0, "totalGoldLost": 0, "avgGoldPerSanction": 0,
  "frequency": { "perMonth": 0, "perWeek": 0 }, "mostCommon": null }
```

### Champs

| Champ | Type | Description |
|-------|------|-------------|
| `sanctions[]` | array | Sanctions retenues, ordre chronologique. |
| `sanctions[].motif` | string | Motif de la sanction. |
| `sanctions[].gold` | number | Or retiré (valeur positive). |
| `sanctions[].date` | string \| null | Jour `AAAA-MM-JJ` (UTC), `null` si non daté. |
| `sanctions[].childId` | string | Id de l'enfant. |
| `byMotif` | object | Clé = motif. |
| `byMotif.*.count` | number | Nombre de sanctions. |
| `byMotif.*.totalGold` | number | Or total retiré pour ce motif. |
| `totalCount` | number | Nombre de sanctions. |
| `totalGoldLost` | number | Or total retiré. |
| `avgGoldPerSanction` | number | `totalGoldLost / totalCount`, 2 décimales ; 0 si aucune sanction. |
| `frequency` | object | Sanctions par mois / semaine, voir [`frequency`](#frequency). |
| `mostCommon` | string \| null | Motif le plus fréquent (à égalité : le premier rencontré). `null` si aucune sanction. |

---

## Charger les trois en parallèle

Comme le fait `public/index.html` :

```js
const body = { familyId, childId };
const [grades, rewards, sanctions] = await Promise.all(
  ['getGradeStats', 'getRewardStats', 'getSanctionStats'].map(a => api(a, body))
);
```
