# DailyKids Quest IV

Appli familiale de quêtes/XP/or pour enfants, avec espace parent protégé,
multi-famille et partage d'accès entre adultes. Front statique + backend
serverless sur **Netlify Functions + Netlify Blobs**.

## Structure

```
tache-enfant/           # front statique (publié par Netlify)
  index.html            # l'app (appelle POST /api)
  styles.css            # design system "Organic"
netlify/functions/
  api.mjs               # fonction Netlify → Netlify Blobs
  _core.mjs             # logique d'API partagée (auth, familles) — pure
dev-server.mjs          # serveur local (statique + /api, store fichier)
test-backend.mjs        # tests du cœur d'API (node test-backend.mjs)
netlify.toml            # publish + redirection /api
package.json
```

## Développer en local

```bash
npm run dev      # http://localhost:8123  (front + /api, données dans .data/)
npm test         # tests du backend
```

Aucune dépendance n'est nécessaire pour `dev`/`test` (Node pur). `@netlify/blobs`
n'est utilisé qu'en production par la fonction.

## Déployer sur Netlify

1. Pousser ce dossier sur un dépôt Git, puis « Add new site » → « Import » sur Netlify
   (ou `netlify deploy` avec la CLI). Aucune commande de build n'est requise ;
   `netlify.toml` fixe `publish = "tache-enfant"` et `functions = "netlify/functions"`.
2. Netlify **Blobs** est activé par défaut — rien à configurer. Le secret de
   signature des jetons est auto-généré et stocké dans Blobs au premier appel.
3. L'API est servie sur `/api`. Un compte de démo est créé automatiquement :
   `parent@demo.fr` / `demo`.

## Sécurité (état actuel)

- Mots de passe : hachés **scrypt** + sel côté serveur (jamais stockés en clair).
- Sessions : jetons **HMAC** signés, expiration 30 j, vérifiés à chaque appel.
- Le serveur est seul maître de `owner`/`members`/`id` d'une famille : un membre
  ne peut pas s'auto-promouvoir via `saveFamily`.
- PIN enfants : simple barrière anti-fratrie sur l'appareil (pas un secret fort).
- `ponytail:` la persistance famille est en « dernier-écrit-gagne » (pas d'etag) —
  suffisant à l'échelle d'une famille ; ajouter un merge/etag si conflits multi-appareils.
