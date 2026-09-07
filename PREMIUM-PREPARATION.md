# Préparation de FyxBot Premium

Ce document décrit les fondations techniques et les décisions encore nécessaires. **Aucun paiement, abonnement ou blocage de fonction n’est actif.**

## Positionnement préparé

### FyxBot Free

- Modération, sécurité, tickets, règlement, accueil et rôles.
- Configuration guidée du serveur.
- Une source sociale automatique envisagée dans la future grille de limites.

### FyxBot Premium

- Sources sociales supplémentaires.
- Historique et statistiques avancés.
- Personnalisation enrichie des messages et automatisations.
- Support prioritaire.

Ces limites ne sont pas encore appliquées. Elles doivent être validées avec les coûts réels d’hébergement et les règles Discord avant publication.

## Travaux restant avant activation

1. Obtenir la validation de l’application Discord et vérifier l’éligibilité aux Applications Premium.
2. Définir les produits, tarifs, durée, renouvellement et conditions d’annulation.
3. Utiliser les droits d’accès Discord (*entitlements*) comme source de vérité côté bot et panel.
4. Traiter les créations, renouvellements, expirations, remboursements et annulations de manière idempotente.
5. Tester le parcours d’achat complet dans un environnement de développement séparé.
6. Mettre à jour les pages légales avant la première transaction.
7. Activer les contrôles Premium seulement après validation fonctionnelle et juridique.

## Garde-fous déjà intégrés

- Le panel affiche clairement que Premium est en préparation.
- `/premium statut` et `/premium offres` ne permettent aucun achat.
- Le commutateur technique d’application des limites reste désactivé.
- Aucune donnée bancaire n’est demandée ou conservée par FyxBot.
- Les droits Discord sont stockés sans identité utilisateur et traités de façon idempotente.
- Les créations, fins, suppressions et remboursements de droits sont synchronisés depuis Discord.
- Au démarrage, une resynchronisation avec l’API Discord est possible uniquement lorsqu’un identifiant de produit est configuré.
- Discord reste la source de vérité : une ancienne configuration locale ne peut pas accorder Premium.

## Préparation technique locale

- Renseigner plus tard `FYXBOT_PREMIUM_SKU_IDS` avec les identifiants officiels créés dans le portail Discord.
- Utiliser d’abord un droit de test Discord sur le serveur de développement.
- Vérifier dans le panel que le droit de test est détecté tout en conservant le forfait Free.
- Tester ensuite la création, l’expiration et la suppression du droit.
- Ne basculer le commutateur d’application des avantages qu’après validation du produit, des tarifs, des pages légales et du parcours complet.
