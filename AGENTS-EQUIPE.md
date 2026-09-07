# Équipe IA FyxBot

Cette équipe intervient sur le même projet FyxBot. Les agents ne sont pas déployés comme des services Railway séparés afin d’éviter une consommation et des frais supplémentaires.

| Agent | Mission principale | Hébergement |
|---|---|---|
| **Nova** | Développement du panel web, ergonomie et API du dashboard | Travaille sur le dépôt ; le résultat validé rejoint `fyxbot-panel` |
| **Orion** | Commandes Discord, événements, permissions et tests du bot | Travaille sur le dépôt ; le résultat validé rejoint `fyxbot-bot` |
| **Sentinel** | Surveillance de Railway, des journaux et des pages publiques | Automation Codex en lecture seule, sans service Railway supplémentaire |
| **Aegis** | Audits de cybersécurité, secrets, OAuth et durcissement | Lancé à la demande avant les changements sensibles |
| **Ember** | Logo, bannières, emojis et cohérence visuelle | Lancé à la demande ; les ressources validées rejoignent le panel et le bot |
| **Pulse** | Positionnement, lancement, contenus, acquisition et suivi marketing | Tâche marketing séparée ; aucune publication ni dépense sans validation |

## Règles de fonctionnement

- Sentinel contrôle régulièrement l’état des deux services, leurs journaux récents et les routes publiques importantes.
- Une anomalie mineure peut être corrigée localement et testée automatiquement.
- Une panne, une erreur Discord répétée, un échec Railway, une erreur de permissions ou une indisponibilité publique déclenche une alerte rapide.
- Aucun agent ne crée un nouveau service payant, ne dépense de crédits, ne révèle de secret ou ne déploie publiquement sans validation explicite.
- Toute correction destinée à Railway passe d’abord par les tests locaux du bot et du panel concernés.

## Services Railway

- `fyxbot-bot` : bot Discord et API.
- `fyxbot-panel` : site et panel web.
