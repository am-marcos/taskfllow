# JOURNAL — TaskFlow (TP M2 Serverless)

> Journal de bord du TP, rempli phase par phase.
> Auteurs : Marcos + binôme.
> Date de démarrage : 2026-04-21.

## Légende

- ✅ Phase terminée et validée
- 🟡 Phase en cours
- ⏳ Phase à venir
- 🔧 Fix ou écart par rapport au TP
- 📸 Capture d'écran attendue (voir dossier `screenshots/`)

---

## Phase 1 — Setup & modélisation de la base de données ✅

**Durée estimée TP :** 45 min · **Réalisée par :** binôme.

### Choix techniques

- **Plateforme :** Supabase (free tier, 2 projets max, 500 Mo DB, 1 Go Storage).
- **Projet :** `taskflow`.
- **Région :** `eu-west-3` (Paris) au lieu du `West EU` suggéré par le TP — plus proche géographiquement, latence inférieure.
- **Moteur :** PostgreSQL 17.6.1 (dernière version disponible sur Supabase).
- **Modélisation :** 6 tables conformes au TP §1.2 avec FK en cascade, `gen_random_uuid()` pour les PKs, contraintes CHECK sur `status`, `priority`, `role`.

### URLs des services

- **Supabase Dashboard :** `https://supabase.com/dashboard/project/vesdhzwordkkgtmxucrt`
- **Status :** `ACTIVE_HEALTHY`

### Ce qui a été fait

1. Création du compte Supabase (Sign up avec GitHub, pas de CB).
2. `New Project` → nom `taskflow`, mot de passe DB fort, région `eu-west-3`.
3. Récupération via Settings → API :
   - Project URL
   - Clé publishable (`sb_publishable_...`)
   - Clé secrète (`sb_secret_...` / service_role)
4. Invitation du binôme via Settings → Team → Invite by email.
5. Exécution du schéma SQL (TP §1.2) dans SQL Editor :
   - 6 tables
   - Fonction `update_updated_at()`
   - Trigger `tasks_updated_at`
6. Création manuelle de deux utilisateurs via Authentication → Add User :
   - `alice@test.com` → UUID `ea194a0a-007d-4e9c-b660-0e17b0b15a26`
   - `bob@test.com` → UUID `c1645f1d-bf7f-4633-ac32-423c371f8604`
7. Exécution des INSERT du TP §1.3 (profils, projet « Refonte API », 3 tâches).

### Ce qui a marché

- Tous les `CREATE TABLE` passent sans erreur.
- Le trigger `tasks_updated_at` se déclenche correctement sur `UPDATE`.
- Les 2 profils et les 3 tâches sont présents.

### Ce qui a bloqué et comment ça a été résolu

🔧 **Divergence emails :** le TP utilise `alice@example.com` dans les scripts, mais les comptes créés utilisent `alice@test.com`. Résolution : conserver `alice@test.com` et adapter les scripts `test-rls.js` et suivants en conséquence (documenté dans `CLAUDE.md §5`).

### Commande / code clé

Trigger `updated_at` (SQL Editor) :

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

Test du trigger (validé via MCP) :

```
before_update : 2026-04-21 08:03:21.076448+00
after_update  : 2026-04-21 08:16:11.162334+00   ← le trigger a bien déclenché
```

### Validation checklist TP

- [x] Les 6 tables existent dans Table Editor
- [x] Le trigger `updated_at` fonctionne
- [x] 2 profils et au moins 3 tâches insérés
- [x] Le binôme peut accéder au projet

### Captures d'écran

- 📸 `screenshots/phase1-supabase-dashboard.png` — Dashboard Supabase avec le projet `taskflow`.
- 📸 `screenshots/phase1-tables-editor.png` — Table Editor avec les 6 tables.
- 📸 `screenshots/phase1-auth-users.png` — Authentication → Users avec Alice et Bob.
- 📸 `screenshots/phase1-sql-editor.png` — SQL Editor avec les INSERT du §1.3 exécutés.

---

## Phase 2 — Authentification & Row Level Security ✅

**Durée estimée TP :** 45 min · **Réalisée par :** Marcos (via MCP Supabase + script local).

### Choix techniques

- **SDK :** `@supabase/supabase-js` v2.
- **Module système :** ES Modules (`"type": "module"` dans `package.json`) pour pouvoir utiliser `import` comme dans les exemples du TP.
- **Chargement env :** `dotenv` (standard Node).
- **Clés :** format nouvelle génération Supabase (`sb_publishable_...` / `sb_secret_...`) — équivalents modernes de `anon_key` / `service_role_key`.
- **RLS :** activé sur les 6 tables (par le binôme en fin de phase 1) ; 13 policies créées en phase 2 conformes au TP §2.3.

### URLs des services

- **Supabase Project URL :** `https://vesdhzwordkkgtmxucrt.supabase.co`
- Pas de nouveau service déployé cette phase (RLS reste dans Supabase).

### Ce qui a été fait

1. Initialisation du projet Node :
   ```bash
   mkdir taskflow-client && cd taskflow-client
   npm init -y
   npm install @supabase/supabase-js dotenv
   ```
2. Création de `.env` + `.env.example` + `.gitignore` (pour protéger les secrets).
3. Création de `client.js` avec deux exports :
   - `supabase` → client public (publishable key), utilisable côté front.
   - `supabaseAdmin` → client admin (secret key), **réservé au serveur**.
4. Création de `auth.js` : `signUp`, `signIn`, `signOut` (strictement comme le TP §2.2).
5. Application des 13 policies RLS du TP §2.3 via MCP Supabase (`apply_migration`).
6. Création de `test-rls.js` avec Test 1 actif et Tests 2/3 commentés (mot de passe binôme pas encore disponible).

### Ce qui a marché

- Le Test 1 (sans auth → 0 résultats) passe via MCP en simulant `SET LOCAL ROLE anon` :
  - `tasks`, `projects`, `project_members`, `comments`, `notifications` → 0 résultat.
  - `profiles` → 2 résultats (policy `USING (true)` = lecture publique, conforme au TP).
- Simulation Alice authentifiée (via `SET LOCAL ROLE authenticated` + JWT claim) → 3 tâches, 1 projet, 2 membres visibles.

### Ce qui a bloqué et comment ça a été résolu

#### 🔧 Blocage #1 — Récursion infinie dans la policy `members_read`

**Symptôme :** `ERROR 42P17: infinite recursion detected in policy for relation "project_members"` dès qu'on tente de lire `tasks`, `projects` ou `project_members`.

**Cause :** la policy `members_read` du TP §2.3 référence `project_members` dans sa propre sous-requête `USING`, ce qui crée une boucle infinie lorsqu'elle est évaluée :

```sql
-- Policy fautive (TP)
CREATE POLICY "members_read" ON project_members FOR SELECT
  USING (user_id = auth.uid() OR
         project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
                                          -- ^^^^^^^^^^^^^^^^^^ récursion
```

**Résolution :** pattern officiel Supabase — encapsuler la vérification d'appartenance dans une fonction `SECURITY DEFINER` qui bypasse RLS. Le sens fonctionnel est préservé (chaque user voit ses memberships et ceux des projets où il est membre), mais sans récursion.

```sql
CREATE OR REPLACE FUNCTION public.is_project_member(pid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = pid AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "members_read" ON project_members;
CREATE POLICY "members_read" ON project_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_project_member(project_id));
```

#### 🔧 Blocage #2 — Alice ne voit pas ses tâches même authentifiée

**Symptôme :** `SELECT * FROM tasks` renvoie 0 lignes pour Alice, alors qu'elle est `owner_id` du projet « Refonte API ».

**Cause :** la policy `tasks_read` filtre via `project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())`. Or la phase 1 du TP crée un projet avec un `owner_id`, mais n'insère **pas** la ligne correspondante dans `project_members`. Donc Alice n'est techniquement pas « membre » de son propre projet au regard de RLS.

**Résolution :** compléter la table `project_members` avec les 2 lignes manquantes (Alice `owner`, Bob `member`) pour que RLS se comporte cohéremment.

```sql
INSERT INTO project_members (project_id, user_id, role)
SELECT 'dfabcd64-3ba7-4102-a90c-8c7ec5c82e1e', id,
       CASE username WHEN 'alice' THEN 'owner' ELSE 'member' END
FROM profiles WHERE username IN ('alice','bob')
ON CONFLICT (project_id, user_id) DO NOTHING;
```

Vérification après fix :
- Alice simulée voit : 3 tâches, 1 projet, 2 membres ✅
- Anonyme voit : 0 tâches, 0 projets, 0 membres (profiles : 2, lecture publique) ✅

#### 🔧 Blocage #3 — Sandbox Cowork ne peut pas tester les appels client

**Symptôme :** `node test-rls.js` dans le sandbox → `TypeError: fetch failed. getaddrinfo EAI_AGAIN vesdhzwordkkgtmxucrt.supabase.co`.

**Cause :** le sandbox est derrière un allowlist réseau qui bloque `*.supabase.co` (`HTTP 403 blocked-by-allowlist`).

**Résolution :** tests client exécutés manuellement depuis la machine locale PowerShell. Les validations « côté base » passent par le MCP Supabase qui attaque la DB directement (test plus fiable que le client).

### Commande / code clé

**Policies RLS (migration `phase2_rls_policies`) :**

```sql
-- Profiles : lecture publique, modification par le propriétaire
CREATE POLICY "profiles_read"   ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Projects : visible uniquement si membre
CREATE POLICY "projects_read" ON projects FOR SELECT
  USING (id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ... (10 autres policies pour project_members, tasks, comments, notifications)
```

**Client Supabase (`client.js`) :**

```js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.supabase_url
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.sb_publishable_key
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.sb_secret_key

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
  throw new Error('Missing Supabase env vars. Required: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
export const supabaseAdmin = createClient(
  SUPABASE_URL, SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

### Validation checklist TP §2.4

- [x] Sans auth : 0 résultats sur toutes les tables (sauf `profiles` en lecture publique volontaire)
- [x] Alice voit ses tâches, pas celles d'un autre projet
- [ ] Modification d'une tâche de Bob refusée par RLS *(skip — nécessite mot de passe)*
- [x] Notifications : chaque user ne voit que les siennes (policy active, 0 notif existante)

### Captures d'écran

 — Supabase Dashboard → Authentication → Policies avec les 13 policies listées.
- 📸 `screenshots/phase2-test-rls-output.png` — Terminal PowerShell avec sortie de `node test-rls.js`.
- 📸 `screenshots/phase2-env-masked.png` — Fichier `.env` avec les valeurs **floutées/masquées** (ne jamais montrer les clés secrètes !).

### Output terminal (attendu, à remplacer par le vrai après test local)

```
PS C:\Users\ambin\Documents\taskflow\taskflow-client> node test-rls.js
Sans auth — tasks: 0 (attendu: 0)
Sans auth — projects: 0 (attendu: 0)
Sans auth — profiles: 2 (attendu: lecture publique autorisée)
```

---

## Phase 3 — CRUD, uploads de fichiers & temps réel 🟡

**Durée estimée TP :** 60 min.

### Choix techniques

- **Client Node ESM** conserve le style des phases 1-2 (`import`/`export`).
- **Service CRUD dédié** dans `taskflow-client/tasks.js` pour isoler `getProjectTasks`, `createTask`, `updateTaskStatus`, `attachTaskFile`.
- **Realtime par projet** : un channel PostgreSQL `tasks:<project_id>` pour capter `INSERT/UPDATE/DELETE` sur `tasks`.
- **Présence séparée** : channel `presence:<project_id>` avec `track()` côté client connecté.
- **Uploadthing** via SDK serveur (`UTApi`) dans `taskflow-client/uploadthing.js` pour uploader un fichier local et stocker l'URL publique dans `tasks.file_url`.

### URLs des services

- Uploadthing Dashboard : configuré (compte déjà créé).
- Uploadthing App ID : configuré dans `.env` (valeur non exposée ici).

### Ce qui a été fait

1. Installation des dépendances phase 3 dans `taskflow-client` :
  - `uploadthing`
  - `mime-types`
2. Création des scripts phase 3 :
  - `taskflow-client/tasks.js` (CRUD + projection des tâches)
  - `taskflow-client/realtime.js` (subscriptions changements + présence)
  - `taskflow-client/uploadthing.js` (upload de fichier local via Uploadthing)
  - `taskflow-client/alice-watch.js` (watch Realtime + présence)
  - `taskflow-client/bob-actions.js` (création de tâche, changements de statut, upload optionnel)
3. Mise à jour de `taskflow-client/package.json` :
  - `npm run phase3:alice`
  - `npm run phase3:bob`
4. Mise à jour de `taskflow-client/.env.example` avec les variables d'exécution phase 3 :
  - `TASKFLOW_PROJECT_ID`
  - `ALICE_EMAIL`, `ALICE_PASSWORD`
  - `BOB_EMAIL`, `BOB_PASSWORD`
  - `UPLOAD_FILE_PATH` optionnel pour le test d'upload
5. Ajout/correction de `taskflow-client/reset-password.js` pour accepter `SUPABASE_SECRET_KEY` (ou fallback `SUPABASE_SERVICE_KEY`) puis reset du compte Alice.

### Ce qui a marché

- Les nouveaux fichiers sont reconnus sans erreurs d'éditeur (`tasks.js`, `realtime.js`, `uploadthing.js`, `alice-watch.js`, `bob-actions.js`).
- Le script `npm run phase3:bob` s'exécute en bout-en-bout : création de tâche, transitions `todo -> in_progress -> review -> done`, puis lecture finale des tâches.
- Le script `npm run phase3:alice` se connecte désormais correctement (`connected as alice@test.com`) après reset du mot de passe.
- Le contrôle de prérequis d'environnement fonctionne (échec explicite si mot de passe manquant, au lieu d'un comportement implicite).

### Ce qui a bloqué et comment ça a été résolu

🔧 **Blocage #1 — installation npm lancée au mauvais niveau (racine du workspace)**

**Symptôme :** `uploadthing`/`mime-types` installés dans `taskflow/` au lieu de `taskflow-client/`.

**Résolution :** suppression des artefacts npm créés à la racine puis réinstallation dans `taskflow-client`.

🔧 **Blocage #2 — identifiants de test invalides**

**Symptôme :** `npm run phase3:alice` échoue avec `Invalid login credentials`.

**Résolution :** scripts durcis avec un message clair et ajout des variables attendues dans `.env.example`.

**Vérification complémentaire :** login isolé validé pour Bob, non validé pour Alice avec `alice@test.com` et `alice@example.com`.

🔧 **Blocage #3 — reset mot de passe impossible via API admin**

**Symptôme :** `node reset-password.js` retournait d'abord `supabaseKey is required`, puis `403 not_admin (User not allowed)`.

**Cause :**
- le script utilisait `SUPABASE_SERVICE_KEY` alors que le projet stocke la clé dans `SUPABASE_SECRET_KEY` ;
- la valeur de `SUPABASE_SECRET_KEY` était une clé non-admin (role `anon`) au lieu de la vraie clé secret/service_role.

**Résolution :**
1. correction de `reset-password.js` pour accepter `SUPABASE_SECRET_KEY` (fallback `SUPABASE_SERVICE_KEY`),
2. remplacement dans `.env` par la vraie clé admin Supabase,
3. exécution réussie de `node reset-password.js` (exit code 0),
4. mise à jour de `ALICE_PASSWORD`, puis validation de `npm run phase3:alice`.

**Action restante pour validation complète :** capturer les preuves realtime/presence sur deux terminaux, puis finaliser la checklist.

### Commande / code clé

```bash
cd taskflow-client
npm run phase3:alice
# terminal 2
npm run phase3:bob

# optionnel pour tester l'upload réel
# set UPLOAD_FILE_PATH=./fixtures/test.pdf
```

```js
// tasks.js (extrait)
export async function getProjectTasks(projectId = PROJECT_ID) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id, title, status, priority, due_date, file_url,
      assignee:profiles!tasks_assigned_to_fkey(id, username, full_name),
      comments(count)
    `)
    .eq('project_id', projectId)
  if (error) throw error
  return data ?? []
}
```

### Validation checklist TP §3

- [x] `getProjectTasks()` retourne tâches + profils + comptage de commentaires (implémenté)
- [x] Compte Uploadthing créé, clés dans `.env`
- [ ] Colonne `file_url` existe dans la table `tasks` (à confirmer en exécution)
- [ ] Alice reçoit en temps réel les créations de Bob (< 500 ms) (en attente credentials)
- [ ] Les changements de statut arrivent instantanément (en attente credentials)
- [ ] La présence affiche les 2 utilisateurs simultanément (en attente credentials)

### Captures d'écran

- 📸 `screenshots/phase3-terminal-alice-bob.png` — Deux terminaux côte à côte (`phase3:alice` + `phase3:bob`) après ajout des mots de passe.
- 📸 `screenshots/phase3-uploadthing-dashboard.png` — Dashboard Uploadthing avec l'app `taskflow`.

---

## Phase 4 — Azure Functions — Notifications par email 🟡

**Durée estimée TP :** 60 min.

### Choix techniques

- **Runtime ciblé :** Node 20 / Functions v4 (aligné avec le cahier de contraintes).
- **Pattern de sécurité webhook :** endpoint HTTP `anonymous` mais protégé par `X-Webhook-Secret` (`WEBHOOK_SECRET` en App Settings).
- **Client Supabase côté fonction :** `SUPABASE_SECRET_KEY` utilisé uniquement côté serveur pour:
  - lecture enrichie (`projects`),
  - récupération email assigné (`auth.admin.getUserById`),
  - insertion `notifications`.
- **Emails :** Resend SDK avec expéditeur paramétrable (`RESEND_FROM_EMAIL`, fallback `onboarding@resend.dev`).
- **Erreurs :** réponses génériques (`401 unauthorized`, `500 server error`) sans fuite d'informations sensibles.

### URLs des services

- Resend Dashboard : configuré (clé déjà disponible côté projet).
- Azure Function App (nom) : `fn-taskflow`
- Azure Function URL (`notify-assigned`) : _à remplir après déploiement_ (format : `https://fn-taskflow.azurewebsites.net/api/notify-assigned`)
- Resource Group Azure : `rg-taskflow`
- Storage Account : `stgtaskflow`

### Ce qui a été fait

1. Création de l'app Azure Functions locale `taskflow-functions/` :
  - `host.json`
  - `package.json`
  - `.gitignore`
  - `local.settings.example.json`
2. Création de `notify-assigned` :
  - `notify-assigned/function.json` (HTTP POST, route `notify-assigned`, `authLevel: anonymous`)
  - `notify-assigned/index.js` avec logique métier phase 4
3. Implémentation de la logique `notify-assigned` :
  - validation du header `X-Webhook-Secret`,
  - parsing payload webhook Supabase (`record`/`old_record`),
  - skip si assignation absente ou inchangée,
  - lecture projet pour enrichir le message,
  - résolution de l'email assigné via `auth.admin.getUserById`,
  - insertion dans `notifications`,
  - envoi email via Resend.
4. Installation des dépendances côté functions (`@supabase/supabase-js`, `resend`).

### Ce qui a marché

- Tous les fichiers phase 4 sont créés et sans erreur d'éditeur.
- Les dépendances npm de `taskflow-functions` sont installées.
- Le code de la fonction `notify-assigned` est prêt pour un test local/déploiement.

### Ce qui a bloqué et comment ça a été résolu

🔧 **Blocage #1 — Azure Functions Core Tools absents localement**

**Symptôme :** la commande `func --version` retourne `CommandNotFoundException`.

**Résolution :** code et structure finalisés en attente d'installation de Functions Core Tools pour exécution locale (`func start`) et publication.

🔧 **Blocage #2 — version Node locale supérieure à la cible Azure**

**Symptôme :** warning npm `EBADENGINE` (`node v24` vs cible `20.x`).

**Résolution :** dépendances installées malgré le warning; contrainte runtime explicitée dans `taskflow-functions/package.json` (`engines.node = 20.x`).

🔧 **Blocage #3 — Azure CLI non reconnu dans le terminal courant**

**Symptôme :** après installation d'Azure CLI, la commande `az --version` retourne `CommandNotFoundException`.

**Résolution :** redémarrer le terminal (ou VS Code) pour recharger le PATH Windows, puis vérifier avec `az --version` avant les commandes de déploiement.

🔧 **Blocage #4 — Déploiement GitHub Actions lancé au mauvais endroit**

**Symptôme :** le workflow exécutait `npm` à la racine du dépôt alors que `package.json` est dans `taskflow-functions/`, ce qui provoquait `ENOENT package.json`.

**Résolution :** définir `AZURE_FUNCTIONAPP_PACKAGE_PATH: './taskflow-functions'` et lancer `npm ci` dans ce sous-dossier.

🔧 **Blocage #5 — Plan Azure Flex Consumption incompatible avec zipdeploy/Kudu**

**Symptôme :** le run GitHub Actions affichait `Package deployment using ZIP Deploy initiated` puis `404 Not Found` sur Kudu.

**Résolution :** conserver la Function App en Flex Consumption, mais adapter le workflow pour lui passer `sku: flexconsumption` afin que `Azure/functions-action@v1` bascule sur le mode `one deploy` pris en charge par ce plan.

🔧 **Blocage #6 — Credentials SCM non pris en compte proprement**

**Symptôme :** le workflow a d'abord échoué avec `No credentials found`, puis avec `401 Unauthorized` sur Kudu quand le publish profile était utilisé.

**Résolution :** régénérer le publish profile, le stocker dans le secret GitHub `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`, activer les credentials de publication SCM dans Azure, puis relancer le workflow.

🔧 **Blocage #7 — Run lent et bruit de logs**

**Symptôme :** les premiers runs prennent plusieurs minutes et répètent des warnings d'attente de propagation des app settings.

**Résolution :** ne pas se fier uniquement aux captures du portail ; noter les erreurs exactes du job, corriger le workflow, puis relancer seulement après chaque changement utile.

### Commande / code clé

```bash
az functionapp create \
  --resource-group rg-taskflow \
  --consumption-plan-location westeurope \
  --runtime node --runtime-version 20 --functions-version 4 \
  --name fn-taskflow \
  --storage-account stgtaskflow \
  --os-type Linux
```

### Validation checklist TP §4

- [x] Compte Resend créé, clé API dans `.env`
- [ ] Function App `fn-taskflow` déployée (visible dans le portail)
- [ ] Webhook Supabase configuré sur `UPDATE` de `tasks`
- [ ] Assignation d'une tâche → notification insérée + email reçu
- [ ] Logs de la fonction visibles via `az functionapp logs tail`

### Captures d'écran

Captures optionnelles. Si une capture n'apporte rien ou n'a pas été prise, ne pas créer de fichier vide juste pour remplir le journal.

---

## Phase 5 — Logique métier serverless (3 endpoints) ⏳

**Durée estimée TP :** 60 min.

### Choix techniques

_À remplir. Exemples : transmission du JWT via `Authorization: Bearer`, création d'un client Supabase par requête, validation d'entrée stricte, erreurs génériques côté client._

### URLs des services

- `https://fn-taskflow.azurewebsites.net/api/validate-task`
- `https://fn-taskflow.azurewebsites.net/api/project-stats`
- `https://fn-taskflow.azurewebsites.net/api/manage-members`

### Ce qui a été fait

_À remplir._

### Ce qui a marché

_À remplir._

### Ce qui a bloqué et comment ça a été résolu

_À remplir._

### Commande / code clé

```bash
cd taskflow-functions
func new --name validate-task --template "HTTP trigger" --authlevel anonymous
# ... (idem project-stats, manage-members)
func azure functionapp publish fn-taskflow
```

### Validation checklist TP §5

- [ ] 4 fonctions visibles dans le portail Azure
- [ ] `validate-task` rejette titre court / date passée / non-membre (400)
- [ ] `project-stats` calcule taux de complétion et tâches en retard
- [ ] `manage-members` : membre simple refusé (403), owner non retirable (403)

### Captures d'écran

- 📸 `screenshots/phase5-4-functions-azure.png` — Portail Azure → Function App avec les 4 fonctions.
- 📸 `screenshots/phase5-stats-output.png` — Terminal avec appel `project-stats` et JSON renvoyé.

---

## Phase 6 — Intégration finale & pipeline complet ⏳

**Durée estimée TP :** 60 min.

### Choix techniques

_À remplir. Structure du script `integration.js`, ordre des appels, gestion de la présence Realtime, agrégation des événements reçus._

### URLs des services

Aucun nouveau service. Tous les précédents sont réutilisés.

### Ce qui a été fait

_À remplir._

### Ce qui a marché

_À remplir._

### Ce qui a bloqué et comment ça a été résolu

_À remplir._

### Commande / code clé

```bash
node integration.js
```

### Validation checklist TP §6

- [ ] `integration.js` tourne sans erreur
- [ ] Taux de complétion : 100 %
- [ ] Alice reçoit exactement 6 événements Realtime (2 × 3 tâches)
- [ ] Table `notifications` contient des entrées pour Bob
- [ ] Azure Functions répondent en < 500 ms

### Captures d'écran

- 📸 `screenshots/phase6-integration-logs.png` — Logs complets du `integration.js` avec les événements Realtime.
- 📸 `screenshots/phase6-notifications-table.png` — Table `notifications` peuplée après le test.

---

## Bonus — Monitoring & tests de charge ⏳

**Durée :** libre.

### Choix techniques

_À remplir. Configuration Application Insights, métriques suivies, seuils d'alerte, paliers de charge k6._

### URLs des services

- Application Insights : `ai-taskflow` — _URL portail à remplir_
- Script k6 : `taskflow-client/load-test.js`

### Ce qui a été fait

_À remplir._

### Commande / code clé

```bash
az monitor app-insights component create --app ai-taskflow --location westeurope --resource-group rg-taskflow
k6 run load-test.js
```

### Validation

- [ ] Application Insights : métriques visibles dans Live Metrics
- [ ] Alerte configurée sur taux d'erreur
- [ ] k6 : p95 < 500 ms sous 50 VUs

### Captures d'écran

- 📸 `screenshots/bonus-appinsights-livemetrics.png` — App Insights Live Metrics.
- 📸 `screenshots/bonus-k6-report.png` — Rapport k6 avec p95 et taux d'erreur.

---

## Clôture du TP — nettoyage final

À faire une fois la démo validée :

```bash
az group delete --name rg-taskflow --yes --no-wait
```

Cette commande supprime le Resource Group Azure et toutes les ressources dedans (Function App, Storage, App Insights, secrets) — coût post-TP = 0. Supabase se met en pause automatiquement après 7 jours sans activité.

### Captures d'écran

- 📸 `screenshots/cleanup-rg-deleted.png` — Portail Azure confirmant que `rg-taskflow` n'existe plus.
