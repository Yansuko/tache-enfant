# Notes: validation de saisie, tableau d'appréciations, correction par le parent — conception

## Module partagé `public/grades.js` (global `Grades`, chargeable en Node comme `public/rollover.js`)
- `DEFAULT_SCALE = [{labels:['tb','tres bien'],value:18},{labels:['b','bien'],value:15},{labels:['ab','assez bien'],value:12}]`.
- `normLabel(s)`: minuscules, sans accents, espaces/points compactés (`T.B.` → `tb`).
- `parseGrade(raw, scale)` → `{ok:true, value20:number, text}` ou `{ok:false}`: accepte un nombre décimal (`15`, `15,5`, `15.5`), `/N` avec N > 0 (`8,5/10`), valeur ≥ 0 et ≤ N, ou une appréciation du tableau. Rejette tout autre caractère. `text` = saisie nettoyée (espaces rognés).

## Serveur
- Champ famille `gradeScale: [{labels:[string], value:number 0–20}]` (parents seulement, 1–20 lignes, 1–4 libellés de 1–30 caractères, libellés uniques après `normLabel`; absent = `DEFAULT_SCALE`). Traité comme `reminders` (famPayload, restriction enfant, normalizeFamilyData, arrayFields client, persistFamily, pull).
- `submitGrade`: 400 `Note invalide.` si `parseGrade` échoue (échelle de la famille).
- `approveGrade {gradeId, gold, grade?}`: le parent peut corriger la note; validée avec `parseGrade` (400 sinon); la valeur d'origine est conservée dans `submittedGrade` si elle change.
- Statistiques (`getGradeStats`): moyennes, tendance et graphique utilisent `Grades.parseGrade(...).value20` avec l'échelle de la famille (remplace `gradeOn20`/`on20` client).

## Interface
- Enfant: champ note avec `inputmode="decimal"`, aide « 15,5 ou 17/20 ou TB », refus avec message clair avant envoi.
- Parent, « À valider »: champ note modifiable (même validation) à côté de l'or; mention « soumise: … » si corrigée.
- Parent, onglet Famille: éditeur « Appréciations » (lignes libellés/valeur, ajout, suppression, rétablir les valeurs par défaut).

## Tests
Vitest: `parseGrade`, submitGrade/approveGrade, `gradeScale` parents seulement + validation, moyennes avec appréciations. Playwright: saisie refusée (`abc`, `15,5€`), `15,5` et `TB` acceptés, parent corrige avant d'approuver, édition du tableau et moyenne recalculée dans les stats.
