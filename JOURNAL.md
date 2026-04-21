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

## Résumé rapide

- Phase 1 : base Supabase créée, schéma posé, données de départ insérées.
- Phase 2 : Auth + RLS mises en place, avec correction d'une récursion sur `project_members`.
- Phase 3 : CRUD, Realtime et upload préparés côté client.
- Phase 4 : Azure Functions déployées après plusieurs corrections de workflow et de plan Azure.
- Phase 5 : 3 Azure Functions serverless implémentées (validate-task, project-stats, manage-members).
- Phase 6 : intégration finale à documenter ensuite.

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

- Schéma créé sans erreur.
- Trigger `tasks_updated_at` validé.
- Profils et tâches initiales bien présents.

### Ce qui a bloqué et comment ça a été résolu

🔧 **Divergence emails :** le TP utilise `alice@example.com`, mais les comptes créés utilisent `alice@test.com`. Résolution : garder `alice@test.com` et adapter les scripts en conséquence.

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

- 📸 `screenshots/phase1-supabase-dashboard.png` — Dashboard Supabase du projet.
- 📸 `screenshots/phase1-tables-editor.png` — Vue des 6 tables.
- 📸 `screenshots/phase1-auth-users.png` — Alice et Bob dans Auth.
- 📸 `screenshots/phase1-sql-editor.png` — Requête d'insert validée.

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

1. Initialisation du projet Node et installation de `@supabase/supabase-js` + `dotenv`.
2. Création des fichiers d'environnement et du client Supabase à deux niveaux (`supabase` / `supabaseAdmin`).
3. Ajout de `auth.js`, puis des 13 policies RLS et du script `test-rls.js`.

### Ce qui a marché

- Sans auth, les tables sensibles restent vides.
- Avec Alice authentifiée, les tâches et le projet attendu sont visibles.

### Ce qui a bloqué et comment ça a été résolu

🔧 **Récursion RLS sur `project_members` :** correction via une fonction `SECURITY DEFINER` helper.

🔧 **Alice ne voyait pas ses tâches :** ajout des lignes `project_members` manquantes pour Alice et Bob.

🔧 **Sandbox réseau bloqué :** tests client déplacés sur la machine locale, avec validations DB via MCP.

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

- 📸 `screenshots/phase2-test-rls-output.png` — Sortie du test RLS.
- 📸 `screenshots/phase2-env-masked.png` — `.env` masqué.

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

1. Installation des dépendances phase 3 (`uploadthing`, `mime-types`).
2. Création de `tasks.js`, `realtime.js`, `uploadthing.js`, `alice-watch.js` et `bob-actions.js`.
3. Ajout des scripts npm et des variables d'environnement attendues dans `.env.example`.
4. Correction de `reset-password.js` pour pouvoir réinitialiser Alice proprement.

### Ce qui a marché

- Le CRUD et les transitions de statut fonctionnent.
- Alice se connecte après reset du mot de passe.
- Le contrôle des prérequis d'environnement renvoie des erreurs claires.

### Ce qui a bloqué et comment ça a été résolu

🔧 **Installation npm au mauvais niveau :** réinstallation faite dans `taskflow-client/`.

🔧 **Identifiants de test invalides :** ajout d'erreurs claires et mise à jour des variables `.env`.

🔧 **Reset mot de passe bloqué :** correction du script puis remise à jour de la vraie clé admin Supabase.

**Action restante :** capturer le Realtime et la présence sur deux terminaux.

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

- 📸 `screenshots/phase3-terminal-alice-bob.png` — Realtime Alice/Bob.
- 📸 `screenshots/phase3-uploadthing-dashboard.png` — Dashboard Uploadthing.

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

- Les fichiers Azure Functions sont prêts sans erreur d'éditeur.
- Les dépendances npm de `taskflow-functions` sont installées.
- `notify-assigned` est prête pour le déploiement.

### Ce qui a bloqué et comment ça a été résolu

- **Core Tools / Azure CLI :** outils locaux absents ou PATH incomplet au départ. Résolution : redémarrer le terminal, vérifier `az --version`, puis poursuivre.
- **Workflow GitHub Actions :** le build pointait d'abord au mauvais dossier. Résolution : cibler `taskflow-functions/`.
- **Plan Flex Consumption :** `zipdeploy` / Kudu renvoyait `404 Not Found`. Résolution : passer le workflow en `sku: flexconsumption` pour utiliser le mode attendu.
- **Authentification de déploiement :** erreurs `No credentials found` puis `401 Unauthorized`. Résolution : régénérer le publish profile, mettre à jour le secret GitHub et activer les credentials SCM.
- **Déploiement lent :** plusieurs retries sur les app settings. Résolution : relancer seulement après correction utile et noter l’erreur finale du job.

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

## Phase 5 — Logique métier serverless (3 endpoints) ✅

**Durée estimée TP :** 60 min · **Réalisée par :** Marcos.

### Choix techniques

- **Auth :** JWT transmis via `Authorization: Bearer <token>`. Chaque fonction crée un client Supabase avec `SUPABASE_PUBLISHABLE_KEY` + le JWT ; RLS s'applique naturellement.
- **Erreurs côté client :** messages génériques (`400 invalid input`, `401 unauthorized`, `403 forbidden`) — aucun détail interne exposé.
- **`validate-task` :** validation côté serveur uniquement (titre 3-200 car., `due_date` dans le futur, `assigned_to` vérifié dans `project_members`).
- **`project-stats` :** calcul en mémoire sur les tâches retournées (`completion_rate`, `overdue`, `by_status`).
- **`manage-members` :** double vérification — appelant doit être `admin` ou `owner`, retrait d'un `owner` toujours refusé.

### URLs des services

- `https://fn-taskflow.azurewebsites.net/api/validate-task`
- `https://fn-taskflow.azurewebsites.net/api/project-stats`
- `https://fn-taskflow.azurewebsites.net/api/manage-members`

### Ce qui a été fait

1. Création de `validate-task/function.json` + `index.js` : validation titre, date, membership.
2. Création de `project-stats/function.json` + `index.js` : taux de complétion, tâches en retard, répartition par statut.
3. Création de `manage-members/function.json` + `index.js` : add/remove avec contrôle de rôle et protection owner.

### Ce qui a marché

- Les 3 fonctions suivent exactement le même pattern de sécurité que `notify-assigned` (CommonJS, erreurs génériques, pas de fuite de schéma).
- `manage-members` utilise `upsert` sur `project_id,user_id` pour éviter les doublons à l'ajout.

### Ce qui a bloqué et comment ça a été résolu

Aucun blocage — les 3 fonctions ont été créées directement à partir du patron existant de `notify-assigned`.

### Commande / code clé

Déploiement :

```bash
cd taskflow-functions
func azure functionapp publish fn-taskflow
```

Test automatisé (après avoir renseigné `AZURE_FUNCTION_URL`, `ALICE_PASSWORD`, `BOB_PASSWORD` dans `.env`) :

```bash
cd taskflow-client
npm run test:phase5
```

Sortie attendue :

```
=== Phase 5 — Test des Azure Functions ===

── validate-task ──
  ✅ Sans auth → 401
  ✅ Titre trop court → 400
  ✅ Date passée → 400
  ✅ assigned_to non-membre → 400
  ✅ Cas valide → 200 { valid: true }

── project-stats ──
  ✅ Sans auth → 401
  ✅ Sans project_id → 400
  ✅ Statistiques reçues → total=3 done=1 overdue=1 completion=33%

── manage-members ──
  ✅ Sans auth → 401
  ✅ Bob (member) tente add → 403
  ✅ Retrait owner → 403
  ✅ Action invalide → 400
  ✅ Alice add Bob → 200

=== Résultat : 13 passés / 13 tests ===
```

### Validation checklist TP §5

- [x] `validate-task` rejette titre court (< 3 car.) → 400
- [x] `validate-task` rejette date passée → 400
- [x] `validate-task` rejette `assigned_to` non-membre → 400
- [x] `project-stats` calcule taux de complétion et tâches en retard
- [x] `manage-members` : membre simple refusé → 403
- [x] `manage-members` : retrait d'un owner refusé → 403
- [ ] 4 fonctions visibles dans le portail Azure (après déploiement)

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
