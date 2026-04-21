# TaskFlow

Plateforme de gestion de tâches collaborative en temps réel — projet réalisé dans le cadre du TP Master 2 « Serverless » (Supabase + Azure Functions).

## Fonctionnalités

- Authentification utilisateur (email / password via Supabase Auth)
- Projets multi-membres avec rôles (`owner`, `admin`, `member`)
- Tâches avec statut, priorité, assignation, pièce jointe (image / PDF)
- Commentaires par tâche
- Notifications email + in-app lors de l'assignation
- Collaboration temps réel (Supabase Realtime) avec présence
- Logique métier serverless : validation, statistiques, gestion des membres

## Stack

| Composant        | Technologie                                        |
| ---------------- | -------------------------------------------------- |
| Base de données  | Supabase (PostgreSQL 17, RLS)                      |
| Authentification | Supabase Auth                                      |
| Temps réel       | Supabase Realtime                                  |
| Fichiers         | Uploadthing                                        |
| Fonctions        | Azure Functions (Node 20, plan Consumption)        |
| Email            | Resend                                             |
| Monitoring       | Azure Application Insights *(bonus)*               |
| Tests de charge  | k6 *(bonus)*                                       |

## Arborescence

```
taskflow/
├── CLAUDE.md                  # Contexte pour agent IA
├── README.md                  # Ce fichier
├── JOURNAL.md                 # Journal de bord (une entrée par phase)
├── screenshots/               # Captures d'écran référencées dans le journal
├── taskflow-client/           # Scripts Node (CRUD, realtime, tests)
└── taskflow-functions/        # Azure Functions (phases 4+)
```

## Journal de bord

Le fichier [`JOURNAL.md`](./JOURNAL.md) tient le compte-rendu phase par phase :
choix techniques, URLs déployées, ce qui a marché, ce qui a bloqué et comment
ça a été résolu, commande-clé, captures d'écran. **À mettre à jour au fur et à mesure de l'avancement.**

## Prérequis

- Node.js 20 ou supérieur
- npm
- Un compte Supabase (free tier)
- Pour les phases 4+ : Azure CLI + compte Azure for Students, compte Resend, compte Uploadthing

## Installation

```bash
git clone <url>
cd taskflow/taskflow-client
cp .env.example .env
# Remplir .env avec tes clés
npm install
```

## Configuration — variables d'environnement

Créer `taskflow-client/.env` à partir de `.env.example` :

| Variable                    | Où la trouver                                            | Rôle                                      |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| `SUPABASE_URL`              | Supabase Dashboard → Settings → API → Project URL        | URL du projet                             |
| `SUPABASE_PUBLISHABLE_KEY`  | Supabase Dashboard → Settings → API → Publishable / anon | Clé publique (front)                      |
| `SUPABASE_SECRET_KEY`       | Supabase Dashboard → Settings → API → Secret / service_role | Clé secrète (back uniquement) ⚠️      |
| `UPLOADTHING_SECRET`        | Uploadthing Dashboard → API Keys                         | Upload de fichiers (phase 3)              |
| `UPLOADTHING_APP_ID`        | Uploadthing Dashboard → API Keys                         | ID d'application Uploadthing              |
| `RESEND_API_KEY`            | Resend Dashboard → API Keys                              | Emails transactionnels (phase 4)          |

⚠️ **`SUPABASE_SECRET_KEY` n'est jamais exposée côté client.** Elle contourne RLS — quiconque la possède a un accès admin total à la base. Ne jamais la committer, ne jamais l'embarquer dans un bundle front.

## Phases

### Phase 1 — Setup & modélisation ✅

6 tables (`profiles`, `projects`, `project_members`, `tasks`, `comments`, `notifications`), trigger `updated_at`, données de test (Alice, Bob, projet « Refonte API » + 3 tâches).

### Phase 2 — Auth & RLS ✅

- `client.js` : clients `supabase` (publishable) et `supabaseAdmin` (secret).
- `auth.js` : `signUp`, `signIn`, `signOut`.
- 13 policies RLS + fix récursion via `is_project_member()` en `SECURITY DEFINER`.
- `test-rls.js` : tests de sécurité.

### Phase 3 — CRUD, uploads, realtime ⏳

Service de tâches, upload Uploadthing, subscription Realtime + présence.

### Phase 4 — Notifications email ⏳

Azure Function `notify-assigned` déclenchée par un webhook Supabase, envoi d'email via Resend, insertion dans `notifications`.

### Phase 5 — Logique métier serverless ⏳

Fonctions `validate-task`, `project-stats`, `manage-members`.

### Phase 6 — Intégration finale ⏳

Script `integration.js` orchestrant le scénario complet.

## Utilisation — scripts disponibles

Dans `taskflow-client/` :

```bash
node test-rls.js         # Tester les policies RLS (phase 2)
node alice-watch.js      # Terminal 1 — abonné Realtime (phase 3)
node bob-actions.js      # Terminal 2 — actions (phase 3)
node integration.js      # Scénario end-to-end complet (phase 6)
```

## Tests de sécurité (phase 2)

Le script `test-rls.js` vérifie trois scénarios :

1. **Sans authentification** → toutes les tables protégées retournent 0 résultats.
2. **Alice authentifiée** → voit ses tâches, pas celles des autres projets.
3. **Alice → tâche de Bob** → modification refusée par RLS.

Les tests 2 et 3 sont commentés tant que les mots de passe des comptes de test ne sont pas renseignés.

## Données de test

| User       | Email            | UUID profils                              | Rôle dans « Refonte API » |
| ---------- | ---------------- | ----------------------------------------- | ------------------------- |
| Alice      | `alice@test.com` | `ea194a0a-007d-4e9c-b660-0e17b0b15a26`    | owner                     |
| Bob        | `bob@test.com`   | `c1645f1d-bf7f-4633-ac32-423c371f8604`    | member                    |

Projet « Refonte API » : `dfabcd64-3ba7-4102-a90c-8c7ec5c82e1e`.

## Sécurité — rappels

- `.env` est dans `.gitignore`. Ne jamais le commiter.
- Ne jamais exposer `SUPABASE_SECRET_KEY` côté client.
- RLS activé sur toutes les tables ; ajouter une policy à chaque nouvelle table.
- Webhook Supabase → Azure Function protégé par `X-Webhook-Secret`.
- Azure Functions : validation d'entrée obligatoire, erreurs génériques au client.

## Nettoyage

À la fin du TP, supprimer les ressources Azure pour arrêter toute facturation :

```bash
az group delete --name rg-taskflow --yes --no-wait
```

Le projet Supabase se met en pause automatiquement après 7 jours sans activité (free tier).

## Licence

Usage pédagogique — TP Master 2.

## Auteur

Marcos — avec son binôme.
