# CLAUDE.md — TaskFlow (TP M2 Serverless)

> Fichier de contexte pour un agent Claude (Claude Code / Cowork) travaillant sur ce dépôt.
> **Lire ce fichier en entier avant toute action.**

---

## 1. Contexte & objectif

**TaskFlow** est une plateforme SaaS de gestion de tâches collaborative en temps réel, construite pour un TP de Master 2 en architecture serverless. 100 % gratuit pour étudiants, aucun serveur à gérer.

Durée cible : 5 h · Niveau : M2 · Prérequis : JS/TS, SQL, API REST.

---

## 2. Stack

| Outil                | Rôle                                              |
| -------------------- | ------------------------------------------------- |
| Supabase             | PostgreSQL + Auth + Realtime + Storage            |
| Azure Functions      | 4 fonctions serverless (notify, validate, stats, members) |
| Resend               | Emails transactionnels (3 000/mois)               |
| Uploadthing          | Upload de pièces jointes (2 Go)                   |
| k6 *(bonus)*         | Tests de charge                                   |
| Azure Monitor *(bonus)* | Monitoring & alertes                           |

Runtime Azure : Node 20, Functions v4, plan Consumption, OS Linux.

---

## 3. Arborescence

```
taskflow/
├── CLAUDE.md                  ← ce fichier
├── README.md                  ← documentation utilisateur
├── JOURNAL.md                 ← journal de bord (1 entrée par phase)
├── screenshots/               ← captures référencées dans le journal
├── .gitignore
├── taskflow-client/           ← scripts Node (auth, CRUD, realtime, tests)
│   ├── .env                   ← JAMAIS commité
│   ├── .env.example           ← template à commit
│   ├── package.json           (type: module)
│   ├── client.js              (exports supabase + supabaseAdmin)
│   ├── auth.js                (signUp / signIn / signOut)
│   ├── tasks.js               (phase 3)
│   ├── realtime.js            (phase 3)
│   ├── test-rls.js            (phase 2)
│   └── integration.js         (phase 6)
└── taskflow-functions/        ← Azure Functions App `fn-taskflow` (phases 4-5)
    ├── local.settings.json    ← JAMAIS commité
    ├── host.json
    ├── notify-assigned/index.js
    ├── validate-task/index.js
    ├── project-stats/index.js
    └── manage-members/index.js
```

Flux :

```
Client ─► Supabase (Auth, CRUD via RLS, Realtime, Storage)
                    │
                    │ UPDATE tasks.assigned_to
                    ▼
           Database Webhook Supabase
                    │ POST JSON + X-Webhook-Secret
                    ▼
             Azure Function notify-assigned
                    ├──► Resend (email)
                    └──► insert notifications

Client ─► Azure Functions (validate-task / project-stats / manage-members)
         (JWT utilisateur transmis en Authorization: Bearer)
```

---

## 4. Sécurité — règles NON-NÉGOCIABLES

### 4.1 Gestion des secrets

- **Aucune clé, URL de projet, token ou mot de passe ne doit apparaître dans le code source**, les commits, les logs Azure, les messages d'erreur renvoyés au client, ni les screenshots.
- Emplacements autorisés uniquement :
  - `taskflow-client/.env` (ignoré par Git)
  - `taskflow-functions/local.settings.json` en local (ignoré par Git)
  - `az functionapp config appsettings set` côté Azure (production)
- `.gitignore` doit contenir au minimum : `.env`, `.env.*`, `local.settings.json`, `node_modules/`, `.DS_Store`, `*.log`.
- Avant chaque `git add`, vérifier avec `git status` qu'aucun secret n'est staged. Fuite d'une clé ⇒ **révoquer immédiatement** (Supabase → Settings → API → Reset ; Resend → API Keys → Revoke ; Azure → rotate).

### 4.2 Séparation des clés Supabase

Deux clés avec des portées radicalement différentes :

| Clé (variable d'env)            | Où la stocker                        | Portée                               |
| ------------------------------- | ------------------------------------ | ------------------------------------ |
| `SUPABASE_PUBLISHABLE_KEY`      | `.env` côté client ET côté Functions | **Publique** — embarquable dans un front |
| `SUPABASE_SECRET_KEY`           | **Uniquement** côté serveur          | **Secrète** — bypass total du RLS   |

> La `SECRET_KEY` ne doit jamais être chargée dans un bundle client, un navigateur, un repo public, un log, ni transmise à un endpoint non-authentifié. Elle contourne RLS : quiconque la possède a un accès admin total à la base.

Dans les Azure Functions, n'utiliser la `SECRET_KEY` que pour des opérations **légitimement admin** (insertion de notifications système, vérification de rôle cross-user). Pour les opérations qui doivent respecter l'identité de l'utilisateur, créer un client avec la `PUBLISHABLE_KEY` + le JWT de l'appelant en header.

### 4.3 Row Level Security

- RLS **activé** sur les 6 tables : `profiles`, `projects`, `project_members`, `tasks`, `comments`, `notifications`. Sans policy = personne ne peut rien faire.
- Toute nouvelle table doit recevoir immédiatement `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` + ses policies.
- Les policies `UPDATE` / `DELETE` doivent utiliser `USING` **et** `WITH CHECK` quand pertinent.
- Fix appliqué : la policy `members_read` utilise une **fonction helper `is_project_member(uuid)` en `SECURITY DEFINER`** pour éviter une récursion infinie sur `project_members`. Pattern recommandé par Supabase.
- Trois scénarios à tester pour chaque policy :
  1. Sans authentification → 0 résultat.
  2. Utilisateur légitime → accède à ses ressources.
  3. Utilisateur tiers → accès refusé.

### 4.4 Authentification des Azure Functions

- Toutes les fonctions sont déclarées `--authlevel anonymous` côté Azure. **Cela ne signifie pas qu'elles sont ouvertes** : l'authentification est déléguée à Supabase via JWT.
- `validate-task`, `manage-members`, `project-stats` : exiger `Authorization: Bearer <jwt>` et créer un client Supabase avec `PUBLISHABLE_KEY` + `global.headers.Authorization`.
- `manage-members` : vérifier explicitement que l'appelant est `admin` ou `owner` et interdire le retrait d'un `owner`.
- `notify-assigned` : appelé par webhook Supabase. Protéger l'endpoint via header `X-Webhook-Secret` (valeur aléatoire 32+ caractères stockée dans AppSettings Azure et dans la config du webhook côté Supabase).

### 4.5 Validation des entrées

Côté Azure Functions (ne jamais faire confiance au client) :

- `validate-task` : titre 3-200 caractères, `due_date` non dans le passé, `assigned_to` doit être membre du projet.
- `manage-members` : `action ∈ {'add','remove'}`, `role ∈ {'owner','admin','member'}`, interdiction de retirer un owner.
- Toujours retourner des erreurs **génériques** (`400 invalid input`) et loguer les détails côté serveur. Ne pas echo-er les messages d'erreur Supabase (fuite de schéma).

### 4.6 Uploadthing & Storage

- Le middleware `uploadRouter` doit **exiger** un JWT Supabase dans `Authorization` et le valider avant d'accepter l'upload.
- Limiter types MIME (`image`, `pdf`) et taille (`4MB` / `8MB`).
- Les URLs Uploadthing stockées dans `tasks.file_url` sont publiques — ne pas y mettre de fichiers sensibles.

### 4.7 Logs

Ne jamais loguer : JWT, mots de passe, emails complets, clés API, corps de requête avec secrets. Application Insights : désactiver la collecte d'`Authorization` dans les headers.

### 4.8 Nettoyage final (OBLIGATOIRE)

À la fin du TP, supprimer le Resource Group Azure :

```bash
az group delete --name rg-taskflow --yes --no-wait
```

Supabase se met en pause automatiquement après 7 jours d'inactivité.

---

## 5. État actuel du projet

### Phase 1 — Setup & modélisation ✅

- Projet Supabase `taskflow` créé (ref `vesdhzwordkkgtmxucrt`, région eu-west-3, status ACTIVE_HEALTHY).
- 6 tables : `profiles`, `projects`, `project_members`, `tasks`, `comments`, `notifications`.
- Trigger `tasks_updated_at` fonctionnel.
- Comptes de test : `alice@test.com` (UUID `ea194a0a-007d-4e9c-b660-0e17b0b15a26`) et `bob@test.com` (UUID `c1645f1d-bf7f-4633-ac32-423c371f8604`).
- Projet « Refonte API » (UUID `dfabcd64-3ba7-4102-a90c-8c7ec5c82e1e`) avec 3 tâches.

### Phase 2 — Auth & RLS ✅

- `taskflow-client/` initialisé avec `@supabase/supabase-js` + `dotenv`.
- `client.js` exporte `supabase` (publishable) et `supabaseAdmin` (secret).
- `auth.js` : `signUp` / `signIn` / `signOut`.
- 13 policies RLS créées (toutes celles du TP §2.3).
- Fix récursion : fonction `public.is_project_member(uuid)` en `SECURITY DEFINER`.
- Complément de la phase 1 : `project_members` peuplée (Alice owner, Bob member du projet « Refonte API »).
- Test 1 (sans auth → 0 résultats) : **validé via MCP**.
- Tests 2-3 (signIn) : **skip** jusqu'à ce que le mot de passe des comptes de test soit disponible.

### Phase 3 — CRUD, uploads, realtime ⏳

Pas encore démarré.

### Phase 4 — Azure Functions / email ⏳

Pas encore démarré. Prérequis : `SUPABASE_SECRET_KEY` doit contenir la vraie clé secrète (pas l'anon/publishable).

### Phase 5 — Logique métier serverless ⏳

Pas encore démarré.

### Phase 6 — Intégration finale ⏳

Pas encore démarré.

---

## 6. Variables d'environnement

### 6.1 `taskflow-client/.env`

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...          # ou JWT legacy service_role
UPLOADTHING_SECRET=sk_live_...
UPLOADTHING_APP_ID=...
RESEND_API_KEY=re_...
```

### 6.2 Azure AppSettings (`fn-taskflow`) — phases 4-5

```bash
az functionapp config appsettings set \
  --name fn-taskflow --resource-group rg-taskflow \
  --settings \
    "SUPABASE_URL=..." \
    "SUPABASE_PUBLISHABLE_KEY=..." \
    "SUPABASE_SECRET_KEY=..." \
    "RESEND_API_KEY=..." \
    "WEBHOOK_SECRET=<aléatoire 32+ car.>"
```

---

## 7. Commandes

### Client

```bash
cd taskflow-client
npm install
node test-rls.js         # Phase 2
node alice-watch.js      # Phase 3 (terminal 1)
node bob-actions.js      # Phase 3 (terminal 2)
node integration.js      # Phase 6
```

### Azure Functions (phases 4-5)

```bash
cd taskflow-functions
func start
func azure functionapp publish fn-taskflow
az functionapp logs tail --name fn-taskflow --resource-group rg-taskflow
```

### Nettoyage final

```bash
az group delete --name rg-taskflow --yes --no-wait
```

---

## 8. Conventions

- **Node** : 20 (aligné runtime Azure).
- **Style** : ES Modules côté `taskflow-client` (`"type": "module"` dans package.json), CommonJS côté Azure Functions (`require` / `module.exports`).
- **Nommage** :
  - Ressources Azure en kebab-case (`rg-taskflow`, `fn-taskflow`, `ai-taskflow`, `stgtaskflow`).
  - Tables Supabase en snake_case pluriel (`project_members`, `tasks`).
  - Fonctions JS en camelCase (`getProjectTasks`, `updateTaskStatus`).
- **Statuts & rôles** :
  - `status ∈ {'todo','in_progress','review','done'}`
  - `priority ∈ {'low','medium','high','urgent'}`
  - `role ∈ {'owner','admin','member'}`
  - Toute valeur hors liste doit être rejetée côté serveur.
- **Commits** : messages impératif en anglais (`add: webhook secret check`, `fix: rls policy on project_members`). Interdit : `git add .` aveugle.

---

## 9. Fixes et écarts par rapport au TP

Ces modifications sont conservées pour garantir le fonctionnement sans dénaturer l'objectif pédagogique :

1. **Policy `members_read` réécrite** : la version du TP §2.3 génère une récursion infinie PostgreSQL (`42P17`). Fix via fonction `is_project_member(uuid)` en `SECURITY DEFINER` (pattern officiel Supabase).
2. **`project_members` peuplée après la phase 1** : le TP §1.3 crée un projet avec un owner mais n'insère pas la ligne `project_members` correspondante. Sans cela, les policies `projects_read` / `tasks_read` bloqueraient même le propriétaire. Insertion ajoutée : Alice `owner`, Bob `member`.
3. **Webhook Supabase protégé par `X-Webhook-Secret`** (phase 4, à implémenter) : le TP expose la fonction Azure sans authentification. Ajout d'un secret partagé pour éviter l'appel non-autorisé.

---

## 11. Documentation annexe

- [`README.md`](./README.md) — documentation utilisateur (install, usage, phases).
- [`JOURNAL.md`](./JOURNAL.md) — journal de bord à remplir à chaque phase (choix techniques, blocages, commandes-clés, captures d'écran).
- `screenshots/` — dossier contenant les captures référencées par le journal. Convention : `phase<N>-<description>.png`. Voir `screenshots/README.md`.

**Rappel opérationnel :** à chaque fin de phase, renseigner la section correspondante de `JOURNAL.md` avant de passer à la suivante (ne pas rattraper à la fin, les détails s'oublient).

---

## 10. En cas de problème

- **Clé commitée par erreur** → révoquer immédiatement, puis nettoyer l'historique (`git filter-repo` ou repartir d'un commit propre). Considérer la clé comme compromise même après suppression.
- **Policy RLS bloque un cas légitime** → ne **pas** désactiver RLS. Affiner avec `USING` + `WITH CHECK`, re-tester les 3 scénarios.
- **Azure Function 500** → `az functionapp logs tail`, vérifier AppSettings, ne **pas** renvoyer `err.stack` au client.
- **Webhook Supabase ne déclenche rien** → vérifier `UPDATE` (pas `*`), URL `/api/notify-assigned`, header `X-Webhook-Secret`, `Content-Type: application/json`.
- **Dépassement free tier** → Azure Cost Management + Supabase Usage. Le nettoyage final évite 99 % des dérapages.
