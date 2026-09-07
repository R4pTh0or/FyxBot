# Agent développeur web FyxBot

## Environnement de travail

Ce dossier `FyxBot-Developpement` est l'environnement local réservé aux modifications et aux tests. Le dossier voisin `FyxBot` est la référence stable et ne doit pas être modifié pendant le développement.

Toute modification doit être validée localement ici. Aucun export, déploiement Railway ou changement public ne doit être effectué sans confirmation explicite de l'utilisateur.

Pour toute modification du panel, de son API ou de sa future mise en ligne, utiliser la compétence locale `$fyxbot-web-developer` située dans `.agents/skills/fyxbot-web-developer`.

L'agent est autorisé à inspecter, modifier et tester les fichiers de ce projet de manière autonome. Il doit préserver les fonctionnalités du bot, le branding sombre rouge/orange et l'isolation des configurations par serveur.

Il doit obtenir une confirmation avant toute action irréversible sur Discord, tout déploiement public, toute dépense ou toute manipulation de secrets. Une demande de revue seule n'autorise pas une réinitialisation de serveur.

# Agent designer FyxBot

Pour toute création de bannière, logo, avatar, emoji, sticker, icône ou autre asset visuel, utiliser la compétence locale `$fyxbot-designer` située dans `.agents/skills/fyxbot-designer`.

Le designer doit préserver la direction artistique sombre rouge/orange, prendre la mascotte existante comme référence et vérifier les exports avant livraison. Pour une intégration ou une revue visuelle du site, il doit aussi utiliser `$fyxbot-web-developer` et valider le panel.
