# Bascule PostgreSQL de FyxBot — état et critères

## État actuel

La production reste sur SQLite (volume du bot). Le PostgreSQL Railway est
partagé avec FyxStream ; l'état du schéma `fyxbot` doit être vérifié à nouveau
juste avant l'import. Le script d'import transactionnel et sa répétition locale
existent. La version locale sait désormais démarrer sur PostgreSQL après avoir
vérifié la connexion, les 27 tables et la version du schéma **avant la connexion
Discord**. Ce code n'est pas encore déployé : ne pas activer le mode PostgreSQL
sur Railway avant les contrôles de préproduction et la sauvegarde restaurable.

Magasins PostgreSQL implémentés et raccordés au runtime local :
configurations, avertissements, demandes Support, personnel Support,
sessions/OAuth du panel, journaux d'audit, suggestions, statistiques de
commandes, statistiques créateur/activation, droits Premium Discord, essais
Fondateur, concours, connexions/commandes Twitch, rétention des données en base
et historique des changements.

Le planificateur de sauvegarde externe sélectionne le format PostgreSQL lorsque
ce moteur est actif. Son bon fonctionnement et la restauration depuis le
stockage R2 de production restent à vérifier avec les vrais accès. Les fichiers
annexes et l'ancienne copie SQLite doivent être conservés pour un retour
arrière, puis purgés selon une politique de rétention explicite : une demande
d'effacement après la bascule doit aussi couvrir ces copies historiques.
Le parcours `/setup`, la bibliothèque des messages publiés et la corbeille du
panel acceptent maintenant des magasins de configurations asynchrones ; leurs
appels ont été adaptés et vérifiés avec PostgreSQL embarqué. Le magasin
PostgreSQL sérialise aussi leurs mises à jour d'une même configuration par
serveur pour éviter les écrasements entre actions simultanées. Leur stockage par
défaut reste SQLite tant que `FYXBOT_STORAGE_BACKEND=sqlite`. En mode
PostgreSQL, ils utilisent le magasin commun, sans appel à la base SQLite.

Le parcours de connexion Discord du panel (état OAuth à usage unique, session,
CSRF et déconnexion) accepte maintenant un magasin PostgreSQL injecté ; il a
été testé de bout en bout sans appel Discord réel. Les configurations de
règlement, anniversaires, changelog, rôles à boutons, notifications sociales et
salons vocaux temporaires ont aussi une interface asynchrone testée. Les
sauvegardes locales de serveur peuvent recevoir un magasin PostgreSQL pour les
configurations. Un export PostgreSQL cohérent, chiffré et séparé des sauvegardes
SQLite dans le stockage externe a été testé localement, y compris sa
restauration et la séquence des journaux. La rétention des sauvegardes SQLite
ne supprime pas les fichiers PostgreSQL. Il n'est **pas encore activé en
production** ; il ne couvre pas les fichiers annexes du volume.
La purge RGPD du serveur utilise le magasin PostgreSQL transactionnel dans ce
mode et supprime les sauvegardes locales du serveur. La copie historique SQLite
gardée pour retour arrière nécessite une procédure d'effacement distincte.
Les parcours des journaux d'audit et des suggestions (commande et revue depuis
le panel) acceptent eux aussi un magasin PostgreSQL injecté et ont des tests
locaux. Le compteur d'utilisation des commandes accepte également ce magasin ;
un échec de statistique ne fait plus échouer une commande Discord réussie.
Leur magasin par défaut suit maintenant le moteur configuré.
Les parcours Premium (droits Discord, essai Fondateur, calcul des limites),
Support (conversations et droits du personnel), statistiques créateur et
activation, avertissements, concours communautaires et parcours Twitch
du panel et du gestionnaire de chat acceptent désormais des
magasins PostgreSQL injectés et leurs
appelants sont asynchrones. Les événements de droits Premium attendent
l'écriture avant d'annoncer un succès. En mode PostgreSQL, le registre global
redirige ces parcours vers leurs magasins PostgreSQL. L'accès SQLite reste
interdit dans ce mode : un oubli provoque un échec visible, pas une écriture
silencieuse dans l'ancienne base. Un test local lance aussi l'API du panel en
mode PostgreSQL et vérifie les routes de santé et d'authentification.

Contrôle Railway du 19 septembre 2026 : les services bot et
panel sont `SUCCESS`, `/`, `/api/health` et `/api/auth/status` répondent en 200
et Discord est connecté. Le bot utilise encore SQLite. Son fichier actif a
passé `PRAGMA integrity_check` et ses 27 tables sont compatibles avec les
colonnes et le `rowid` attendus par le migrateur. Le fichier `warnings.json`
existe mais ne contient aucun avertissement. Le schéma PostgreSQL `fyxbot`
n'existe pas encore dans la base partagée. Le PostgreSQL partagé n'a pas de
PITR actif (`enabled=false`). La création d'une sauvegarde native Railway a été
refusée par les droits OAuth courants ; aucune sauvegarde native n'a été créée.

Une sauvegarde SQLite R2 fraîche a été créée le 19 septembre à 14:53 UTC,
retéléchargée, déchiffrée et contrôlée par `PRAGMA integrity_check`. Elle a été
importée via un tunnel Railway dans un schéma temporaire du vrai PostgreSQL :
27 tables et 102 lignes ont été copiées avec des comptes identiques. Une
sauvegarde PostgreSQL chiffrée de ce schéma a ensuite été envoyée dans R2,
retéléchargée et restaurée dans un second schéma temporaire. Les 102 lignes et
le condensat complet des données restaurées correspondent à la source. Les
deux schémas temporaires ont été supprimés et un contrôle final confirme qu'il
n'en reste aucun ; le schéma de production `fyxbot` n'a pas été créé.

La sauvegarde R2 du schéma FyxBot de préproduction est restaurable, mais elle
ne remplace pas une protection de la base PostgreSQL partagée qui contient
aussi FyxStream. L'export logique complet de cette base n'a pas été exécuté,
car il élargirait la copie aux données FyxStream. Une autorisation explicite sur
ce périmètre ou le rétablissement des droits de sauvegarde native Railway reste
nécessaire avant la bascule réelle.

## Conditions obligatoires avant la bascule

1. Vérifier que tous les chemins de lecture/écriture utilisent exclusivement
   PostgreSQL en mode PostgreSQL ; interdire les chemins SQLite ou JSON actifs
   dans ce mode. Tester les fonctions sensibles : OAuth, support, Premium,
   Twitch, commandes Discord, suppression RGPD et sauvegardes.
2. Effectuer un test de préproduction complet sur PostgreSQL, avec un jeu de
   données représentatif et la répétition du retour arrière. Vérifier les
   droits du schéma isolé `fyxbot` sans modifier le schéma FyxStream.
3. Produire une sauvegarde cohérente et restaurable du volume SQLite de
   production et des fichiers actifs annexes (dont `warnings.json`). Vérifier
   sa lecture et conserver l'original. Ne jamais remplacer la source de
   production par la petite base locale de développement.
4. Prévoir une fenêtre de maintenance et arrêter toutes les écritures du bot
   et du panel avant l'instantané final. L'import lit un instantané SQLite et
   `warnings.json` séparément ; des écritures concurrentes créeraient un
   instantané incohérent.
5. Importer en transaction dans un schéma FyxBot vide. Comparer les comptes de
   lignes, les données critiques par serveur et les séquences d'identité.
6. Déployer le service bot/API avec `FYXBOT_STORAGE_BACKEND=postgres` et la
   référence privée `FYXBOT_POSTGRES_URL`. Le panel web consomme cette API ; il
   ne doit pas ouvrir une seconde base. Vérifier les déploiements Railway
   jusqu'à `SUCCESS`, puis contrôler Discord/OAuth, commandes, panel, Twitch,
   Premium, support et journaux. Ne rouvrir le trafic qu'après ces contrôles.

## Retour arrière

Si l'import, le déploiement ou les tests fonctionnels échouent, ne pas ouvrir
un runtime mixte. Restaurer le code et la configuration SQLite des deux
services, conserver PostgreSQL isolé pour analyse et vérifier que l'ancienne
base SQLite est toujours la source de vérité. Si des écritures ont déjà eu
lieu sur PostgreSQL après ouverture, un retour arrière exige une procédure de
réconciliation ; ne pas repointer simplement vers l'ancienne SQLite.
