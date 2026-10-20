# Star Wars FFG — contenu du système 0.0.4

Candidat de release préparé depuis la branche `misterWhite-2`, pour Foundry VTT v14. Le paquet contient le code du système, ses modèles, styles et données de présentation. Il ne contient ni monde, ni comptes, ni données privées de campagne.

## Fiches et présentation

- Palette sombre adoucie pour les fiches, les talents, Pilotage MJ, le jet en cours et les résumés d’équipement/modificateurs ; fond clair uni.
- Onglets et tailles de fenêtres adaptés à Foundry v14 ; éditeur de texte et présentation des arbres de talents.
- Agrandissement des images d’équipement depuis la fiche d’objet et les lignes d’inventaire.
- Résumé des talents pour les personnages et pour les PNJ qui en possèdent ; marqueur de talents dans Pilotage MJ et le suivi des initiatives, réservé au MJ.
- Bonus et malus regroupés quand plusieurs compétences partagent le même modificateur.

## Inventaire et création

- Section **Possession** : armes, armures ou matériel possédés mais non transportés ; création, déplacement et reprise des objets.
- Les possessions restent consultables mais ne comptent pas dans l’encombrement, les bonus d’équipement et le choix des armes utilisables. Une macro d’arme ne contourne pas cet état.
- Aide à la création et aux XP : ordre des choix, distinction entre attribution gratuite et achat, ajout d’une spécialité et acquisition séparée de ses talents. Ce guide n’impose pas automatiquement une phase de création ou de progression.

## Pilotage et jets

- Difficulté commune réglée par le MJ, bonus/malus au prochain jet et filtres séparés des joueurs/PNJ dans Pilotage MJ.
- Le filtre **Mort** signifie ici strictement « blessures actuelles supérieures au seuil », selon la définition demandée pour cette interface.
- Dernière arme sélectionnée mémorisée par personnage et compétence, avec reconstruction des modificateurs courants.
- Talents acquis associés aux jets, coûts au lancer et compensation en cas d’échec de publication ; aide à l’application et à l’annulation des critiques.
- Informations de compétence reliées aux journaux du compendium quand ils sont disponibles.

## Compendium et limites

Le compendium bilingue reste un module séparé, version de travail associée **0.41.1**. Il ne fait pas partie de `system.zip`. Les descriptions et références consultées dans ses journaux dépendent de son installation et de son activation. Le système conserve les fichiers de présentation `assets/data/specialization-presentation.json` et de référence `data/skill-references-fr.json` nécessaires à ses propres interfaces.

L’**Esquive** est un prototype limité au même navigateur. Elle ne constitue pas une réaction multijoueur achevée ; sa fenêtre le signale explicitement. Les talents non automatisés ou les conditions non reconnues restent à résoudre en jeu. Les textes vérifiés sur source et les textes validés par Antoine restent des statuts distincts.

Le bouton et le prototype de test des déplacements/manœuvres, ainsi que le diagnostic du matériel, ont été retirés conformément à la demande. Ils ne sont pas des fonctionnalités de cette version.

## Vérification et livraison

La préparation de release contrôle la syntaxe JavaScript, les tests de compatibilité et le contenu de l’archive installable. Le compte rendu de revue du 20 octobre 2026 distingue les tests automatiques, les vérifications dans Foundry et les essais multijoueurs restant à effectuer. Une suite verte ne garantit pas l’absence de toute régression.

Cette préparation ne modifie pas l’installation Windows utilisée en production. Les anciens essais, comptes rendus et validations restent conservés dans le projet de travail.
