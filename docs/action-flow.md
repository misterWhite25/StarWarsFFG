# Fluidifier les jets d’action — 5 octobre 2026

Les modifications sont appliquées au dépôt de développement WSL `/home/tonio2581/StarWarsFFG`. Elles ne sont pas installées dans le système Windows de la campagne.

## Dernière arme sélectionnée

La dernière sélection est enregistrée sur le personnage, séparément pour chaque compétence compatible avec une arme. Elle survit à la fermeture du dialogue et à la reconnexion. Une attaque lancée depuis un objet sélectionne l’arme cliquée et actualise cette préférence. Le choix « Aucune arme » est également conservé. Une arme retirée de l’inventaire ou associée à une autre compétence n’est pas réutilisée.

À chaque ouverture, la réserve est reconstruite avec les valeurs actuelles du personnage et de l’arme. Les dés situationnels, le tir automatique et les talents ponctuels ne sont pas mémorisés comme bonus du prochain jet.

## Talents dans le dialogue du jet

Première série automatisée, à partir des talents effectivement acquis sur le personnage :

- **Concentration intense / Intense Focus** : une amélioration, une manœuvre à décompter et un point de stress.
- **Attaque frénétique / Frenzied Attack** : sur Corps à corps ou Pugilat, choix du nombre d’améliorations et de points de stress, dans la limite du rang.
- **Visée juste / True Aim** : sur une attaque à distance, bonus standard de visée et améliorations selon le rang ; une manœuvre à décompter. L’utilisation est suivie par round lorsqu’un combat est démarré. Hors combat, la confirmation de la limite reste manuelle.

Les effets sont inclus dans l’aperçu et dans la simulation, en conservant la difficulté globale du MJ. Le stress est payé au lancer, pas à la sélection ou à la fermeture du dialogue. Une publication qui échoue restaure le coût si la fiche n’a pas changé entre-temps. Les talents activés et leurs coûts apparaissent sur le message. Les talents ponctuels sont décochés après un lancer réussi.

Les autres talents, notamment les réactions défensives et les dépenses de Destin, conservent leur fonctionnement existant ; ils ne sont pas interprétés automatiquement par cette première série. Les compteurs généraux de manœuvres ne sont pas automatisés.

## Critiques depuis la dépense des symboles

Après une dépense critique, le système ouvre le choix de la cible, puis propose les tables critiques accessibles correspondant à son type. Les tables sont reconnues par leurs métadonnées `criticalTable` et `criticalKind`, dans le monde ou les compendiums. Les tables personnalisées disposant de ces métadonnées restent utilisables ; les résultats doivent fournir un nom et une gravité.

Le dialogue présente les modificateurs reconnus : critiques déjà présents, activations supplémentaires sur la même touche, Cruel / Vicious, Coup mortel / Lethal Blows et Dur au Mal / Durable. Les rangs sont lus sur les données structurées de l’arme et les talents acquis. Un champ permet d’ajuster les autres modificateurs. La confirmation des dégâts après encaissement ou blindage reste explicite.

Les activations critiques combinées dans une même sélection donnent **un seul tirage**, avec +10 par activation supplémentaire. Le total est limité à un minimum de 1 et peut dépasser 100. Une autre dépense du même jet sur une cible ayant déjà reçu un critique demande de confirmer qu’il s’agit d’une touche distincte.

Le résultat est ajouté à la fiche comme blessure critique ou avarie, avec sa description, sa plage, sa gravité et l’origine du tirage. Les conséquences particulières décrites par la blessure restent à résoudre en jeu. Un critique sur un groupe de sbires élimine un membre sans lancer de table ; il utilise le seuil individuel renseigné sur la fiche.

Un joueur qui ne possède pas la cible envoie une demande sur la carte du jet. Le MJ ouvre cette demande, confirme les conditions puis lance et applique le critique. Une reprise après erreur réutilise le résultat enregistré et recherche une blessure de même origine avant d’en créer une autre.

L’annulation retire la blessure créée et rembourse les dépenses critiques groupées. Si la blessure a été modifiée, ou si les blessures d’un groupe de sbires ont changé, l’annulation est bloquée pour conserver les modifications ultérieures. La publication du tirage conserve les destinataires et la confidentialité du jet initial.

## Validation

- Suite du dépôt : **131 tests réussis**, contrôle syntaxique des modules inclus.
- Client Foundry v14 réel, monde jetable séparé : arme retrouvée à la réouverture, aperçu des talents, absence de paiement après fermeture, paiement après lancer, dépenses critiques multiples donnant une seule blessure, application et annulation avec remboursement.
- Deux clients réels MJ/joueur : demande sans modification du PNJ par le joueur, validation et application par le MJ, synchronisation du résultat vers le joueur. Résultats enregistrés dans `browser-validation.json`.
- Captures et script reproductible conservés dans `tmp/action-flow` ; aucun personnage de la campagne n’a été utilisé pour les essais.

## Fichiers

Le patch `action-flow.patch` décrit uniquement le travail de cette demande, en conservant les changements déjà présents dans le dépôt au début de la tâche. Il est déjà appliqué au dépôt WSL. Les copies de modules servent à la revue ; ce dossier n’est pas une archive complète installable du système.

Implémentation : `modules/helpers/weapon-selection.js`, `modules/helpers/dice-helpers.js`, `modules/dice/roll-builder.js`, `modules/helpers/roll-talents.js`, `modules/helpers/combat-actions.js` et `modules/helpers/critical-actions.js`.

Sources des mécanismes de talents : livre de base Age of Rebellion fourni dans le projet, descriptions détaillées de Frenzied Attack, Intense Focus, True Aim, Lethal Blows et Durable. Les tables critiques restent celles du monde ou du compendium connecté.
