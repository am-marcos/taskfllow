# Screenshots

Dossier pour les captures d'écran référencées dans `JOURNAL.md`.

## Convention de nommage

```
phase<N>-<description-courte>.png
```

Exemples :

- `phase1-supabase-dashboard.png`
- `phase1-tables-editor.png`
- `phase2-rls-policies.png`
- `phase2-test-rls-output.png`
- `phase4-function-app-portal.png`
- `phase4-email-recu.png`
- `phase6-integration-logs.png`

## À capturer en priorité

Phase 1 : dashboard Supabase, Table Editor (6 tables), Authentication → Users (Alice + Bob), SQL Editor avec trigger.

Phase 2 : Authentication → Policies (13 policies), terminal avec `node test-rls.js`, fichier `.env` **avec les valeurs masquées** (floutées).

Phase 3 : terminal double (Alice watch + Bob actions), Uploadthing Dashboard.

Phase 4 : captures optionnelles seulement si elles montrent un état utile (Function App déployée, email réellement reçu, Resend). Ne rien créer si l'écran est vide ou inutile.

Phase 5 : portail Azure (4 fonctions listées), terminal avec appels curl/fetch aux fonctions.

Phase 6 : logs complets du `integration.js`, table `notifications` peuplée.
