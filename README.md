# Star Wars FFG - Tonio

**Star Wars FFG - Tonio** est un système de jeu pour **Foundry VTT v14**, créé en septembre 2026 à partir du système original Star Wars FFG. Il constitue désormais une version totalement indépendante, développée et maintenue séparément du projet d’origine.

Il permet de jouer aux jeux de rôle Star Wars de Fantasy Flight Games et comprend également les fonctionnalités héritées pour les jeux fondés sur Genesys.

## Un projet personnel et indépendant

Ce dépôt est développé et maintenu uniquement par **Tonio (misterWhite25)**, avec l’assistance d’OpenAI Codex. Les orientations du projet, les modifications et les publications sont gérées par son mainteneur. Les contributions externes et les pull requests ne sont pas sollicitées.

Le projet a commencé par l’adaptation du système à Foundry VTT v14 et suit désormais sa propre évolution. Il ne fait pas partie du projet StarWarsFoundryVTT et n’a pas vocation à lui soumettre ses modifications.

Les versions sont distribuées directement dans les [releases de ce dépôt](https://github.com/misterWhite25/StarWarsFFG/releases), sans publication au catalogue officiel de Foundry VTT.

## Installation

1. Ouvrir Foundry VTT et accéder à **Game Systems**.
2. Cliquer sur **Install System**.
3. Coller le lien suivant dans **Manifest URL**, puis cliquer sur **Install** :

```text
https://github.com/misterWhite25/StarWarsFFG/releases/latest/download/system.json
```

Pour une installation manuelle, télécharger **system.zip** dans les releases, puis extraire son contenu dans `Data/systems/starwarsffg`. Les archives GitHub « Source code » ne sont pas les paquets d’installation.

Le système conserve l’identifiant technique `starwarsffg` pour les mondes existants. Son nom affiché est **Star Wars FFG - Tonio**. Vérifier que le manifest de l’installation pointe vers **misterWhite25/StarWarsFFG**.

## Mises à jour

Après l’installation initiale, utiliser **Check Update**, puis **Update** dans **Game Systems** pour installer les nouvelles versions compatibles. Il n’est pas nécessaire de réinstaller le système à chaque publication.

Sauvegarder le monde avant une mise à jour : sa première ouverture peut migrer des données. Sauvegarder également les éventuelles modifications locales du système avant de les remplacer.

Le manifest utilise le canal `releases/latest`, destiné aux releases stables. Les préversions s’installent avec le manifest de la release correspondante.

## Compendium FR / EN

Le compendium **Star Wars FFG — Compendium FR / EN** est un module séparé ; il n’est pas inclus dans `system.zip`. Ses archives sont distribuées séparément via les releases du même dépôt.

Il s’installe dans **Add-on Modules**, avec Babele et les dépendances indiquées dans son manifest. Consulter les fichiers joints et les notes de la release pour connaître la version disponible et ses instructions d’installation.

Les versions du système et du compendium sont indépendantes. Les modules se mettent à jour dans **Add-on Modules**. Les documents déjà importés dans un monde restent des copies et ne sont pas remplacés par une mise à jour du compendium.

## Compatibilité

Cette version cible **Foundry VTT v14**. Le manifest déclare la version 14 comme version minimale, vérifiée et maximale.

Les fonctionnalités et la compatibilité de ce projet évoluent indépendamment de celles du système d’origine. Consulter les notes de chaque release avant une mise à jour.

## Origine et crédits

Ce projet repose sur le travail des développeurs et contributeurs du [système original Star Wars FFG](https://github.com/StarWarsFoundryVTT/StarWarsFFG). Leurs contributions constituent la base de cette version indépendante.

## Licence et mentions

Les conditions de licence héritées du projet original sont conservées ; consulter [LICENSE.txt](LICENSE.txt).

Ce système est une réalisation non officielle de fans, sans affiliation à Fantasy Flight Games ni à ses partenaires. Il ne remplace pas les livres de règles nécessaires pour jouer.

Star Wars, ses logos, personnages, noms et autres éléments associés appartiennent à leurs détenteurs respectifs.
