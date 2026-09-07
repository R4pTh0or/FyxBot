# Carte de sécurité FyxBot

## Composants

- `src/index.js` : démarrage du bot et de l’API locale.
- `src/services/dashboardServer.js` : routes HTTP, CORS, autorisations et actions Discord.
- `src/services/dashboardAuth.js` : OAuth Discord, sessions et cookies.
- `src/config.js` et `.env.example` : contrat de configuration sans secrets.
- `src/commands/` et `src/events/` : commandes et interactions Discord.
- `src/database/` et `data/` : stockage local et séparation par identifiant de serveur.
- `dashboard/app/` : client web; aucun secret ou contrôle d’autorisation ne doit y être confié.
- `tests/backend-security.test.js` : tests de sécurité backend existants.

## Frontières de confiance

- Le navigateur et toute valeur reçue par HTTP sont non fiables.
- Un identifiant de serveur, salon, rôle, membre, panneau ou suggestion doit être revérifié dans le serveur autorisé.
- Les permissions affichées par le client ne remplacent jamais les contrôles côté API.
- Une session authentifiée ne garantit pas que l’utilisateur conserve ses permissions Discord.
- Discord et OAuth sont des services externes : limiter les appels, gérer les erreurs et ne pas exposer leurs jetons.

## Priorités d’audit

1. Isolation entre serveurs et contrôle d’accès par objet.
2. Authentification fail-closed et revalidation des permissions.
3. Actions destructrices, confirmations et journalisation.
4. CORS, cookies Secure/HttpOnly/SameSite, OAuth state et redirections.
5. Validation des corps, taille des requêtes, injection et contenu Discord.
6. Limitation de débit, idempotence et doubles soumissions.
7. Secrets, logs, fichiers générés et dépendances.
8. Disponibilité, gestion des erreurs et préparation HTTPS/proxy.

## Validation minimale

- Vérifier tous les fichiers JavaScript sous `src/` avec Node.
- Exécuter `node --test tests/backend-security.test.js`.
- Depuis `dashboard/`, exécuter le lint, la compilation et les tests.
- Pour une correction d’autorisation, couvrir au minimum : accès permis, serveur étranger refusé, permissions retirées, absence de session et mauvaise configuration production.
