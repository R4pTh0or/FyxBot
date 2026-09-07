# Carte du projet FyxBot

## Applications

- `dashboard/` : panel React 19 construit avec Vinext/Vite.
- `dashboard/app/Dashboard.tsx` : interface principale et appels vers l'API locale.
- `dashboard/app/globals.css` : design sombre rouge/orange et responsive.
- `src/services/dashboardServer.js` : passerelle HTTP locale du panel vers Discord.
- `src/services/serverSetup.js` : création ou réinitialisation de la structure Discord.
- `src/commands/` : commandes slash modulaires.
- `src/database/` et `data/` : stockage JSON local actuel.

## Contrats locaux

- Panel : `http://localhost:3000`.
- API : `http://localhost:3001/api`.
- Garder l'API limitée aux origines locales tant qu'une authentification Discord sécurisée n'est pas en place.
- Associer chaque configuration à l'identifiant du serveur sélectionné.

## Validation

Depuis `dashboard/` : exécuter le lint, la compilation et les tests disponibles. Depuis la racine : vérifier tous les fichiers JavaScript de `src/` avec Node et charger les commandes avec `readCommands()`.

