// Each tour keeps its own native Foundry progress. The text is authored HTML, never document data.
const imageRoot = 'systems/starwarsffg/images/system-guide';

function capture(file, alt, caption) {
  return `<figure><img src="${imageRoot}/${file}.webp" alt="${alt}"><figcaption>${caption}</figcaption></figure>`;
}

function page(id, title, location, body) {
  // Foundry splits step content on newlines, so pass the page as one HTML fragment.
  const content = `<div class="ffg-system-guide-step"><span class="ffg-guide-path">${location}</span>${body}</div>`;
  return {id, title, content: content.replace(/\s*\n\s*/g, ' ')};
}

function tour(id, title, description, steps, restricted = false) {
  return {id: `steelers-${id}`, title: `Steelers - ${title}`, description, steps, restricted,
    display: true, canBeResumed: true, closeWindows: false};
}

export const systemGuideTours = [
  tour('systeme', 'Spécificités du système',
    'Découvrir les fiches, les arbres de talents et les trois répertoires. Comprendre la règle de dégâts de Tonio.', [
    page('module', 'Activer les règles de base', 'Paramètres du jeu › Gestion des modules', `
      <p>Steelers fonctionne pleinement avec le module <strong>Star Wars FFG - Règles de base FR / EN</strong> (Core Rule Steelers). Le système gère les fiches et les jets. Le module fournit les compendiums de règles ainsi que la carte galactique et les outils de voyage.</p>
      <p>Côté MJ, ouvre la gestion des modules du monde, coche ce module et enregistre. Pour apprendre à préparer un trajet, ouvre ensuite la présentation <strong>Carte galactique et voyages hyperspatiaux</strong>.</p>`),
    page('fiches', 'Trouver un talent en pleine partie', 'Fiche de personnage › Barre latérale droite', `
      <p>Les fiches ont été épurées pour laisser plus de place aux informations utilisées en jeu. En bas de la barre latérale, trois raccourcis évitent de parcourir plusieurs onglets.</p>
      <dl><dt>Liste · Récapitulatif des talents</dt><dd>Ouvre les descriptions des talents acquis à côté de la fiche.</dd>
      <dt>Éclair · Déclencher un talent</dt><dd>Prépare le test d’un talent qui se déclenche de lui-même.</dd>
      <dt>Valise · Récapitulatif de l’équipement</dt><dd>Affiche les objets équipés et leurs qualités.</dd></dl>
      ${capture('fiche-raccourcis', 'Barre latérale de la fiche avec les icônes liste, éclair et valise.', 'En bas de la barre de la fiche, la liste sert à consulter et l’éclair à agir.')}`),
    page('arbres', 'Lire un arbre de talents', 'Fiche de spécialité › Talents', `
      <p>Le dessin des arbres a été revu pour faciliter la lecture d’une spécialité. Chaque case porte le nom du talent et son coût en XP. Les traits entre les cases permettent de suivre les chemins d’acquisition.</p>
      <p>Pour préparer ta prochaine dépense, pars d’un talent déjà acquis et suis les liaisons jusqu’à la case qui t’intéresse. Pour retrouver le texte d’un talent déjà acheté en cours de partie, reviens au <strong>Récapitulatif des talents</strong> du personnage.</p>
      ${capture('arbre-talents', 'Cases d’un arbre de spécialité avec leurs liaisons et leur coût en XP.', 'Suis les liaisons entre les cases et repère le coût du prochain talent.')}`),
    page('repertoires', 'Choisir le bon répertoire', 'Barre latérale Foundry › Acteurs · Acteurs PNJ · Véhicules', `
      <p>Ces trois onglets sont des <strong>répertoires</strong>. Tous ouvrent les fiches du monde. Steelers a ajouté deux vues au répertoire Acteurs pour que le MJ retrouve ses adversaires et ses véhicules sans les mêler aux personnages des joueurs.</p>
      <dl><dt>Acteurs</dt><dd>Les personnages joueurs et les autres fiches classées avec eux.</dd>
      <dt>Acteurs PNJ</dt><dd>La vue du MJ pour les sbires, rivaux et némésis. Un clic droit permet au MJ de reclasser un personnage sans dupliquer sa fiche.</dd>
      <dt>Véhicules</dt><dd>Les véhicules terrestres et les vaisseaux du monde, visibles selon les droits de chaque utilisateur.</dd></dl>
      ${capture('repertoires', 'Icônes des trois répertoires et exemple de recherche dans Acteurs PNJ.', 'Dans la barre latérale, choisis le répertoire avant de rechercher la fiche.')}`),
    page('tonio', 'Compter les dégâts avec la règle de Tonio', 'Paramètres du système › Activer les règles personnalisées Tonio', `
      <p>Cette option modifie uniquement les dégâts d’une attaque réussie. La première réussite nette fait toucher l’attaque. Chaque réussite nette <strong>au-delà de la première</strong> ajoute un point aux dégâts de base.</p>
      <p class="ffg-guide-example"><strong>Exemple :</strong> une arme à 6 dégâts inflige 6 dégâts avec une réussite nette, ou 8 avec trois réussites nettes, avant encaissement.</p>`),
  ]),
  tour('voyages', 'Carte galactique et voyages hyperspatiaux',
    'Comparer deux routes, préparer le saut avec un vaisseau et retrouver le voyage dans son journal.', [
    page('route', 'Comparer les itinéraires', 'Barre d’outils de la scène › Carte galactique et voyages', `
      <p>Clique sur l’icône de galaxie, puis choisis un <strong>Départ</strong> et une <strong>Arrivée</strong>. La route recommandée privilégie les voies connues. Compare sa durée et le nombre de cases hors réseau avec les autres trajets proposés.</p>
      <p>Le <strong>Multiplicateur de durée</strong> sert à comparer les hyperpropulseurs : ×0,5 divise le temps par deux, ×2 le double. Les passages hors réseau restent des estimations que le MJ peut ajuster.</p>
      ${capture('carte-galactique', 'Carte galactique et calculateur montrant un trajet entre deux lieux.', 'Choisis les deux lieux dans le calculateur, puis compare le trajet affiché sur la carte.')}`),
    page('preparation', 'Préparer le saut', 'Carte galactique › Préparer le voyage : équipage, jet et réserves', `
      <ol><li>Choisis le <strong>Navigateur</strong> et le <strong>Vaisseau</strong>. Si quelqu’un l’assiste, renseigne le copilote ou le droïde.</li>
      <li>Sélectionne l’hyperpropulseur principal ou de secours. Vérifie la durée et les réserves annoncées pour ce vaisseau.</li>
      <li>Renseigne les conditions du saut, puis clique sur <strong>Préparer le jet natif</strong>. Vérifie la réserve de dés d’Astrogation avant de lancer.</li></ol>
      ${capture('voyage-vaisseau', 'Sélection du vaisseau dans la préparation du voyage et aperçu de ses caractéristiques.', 'Le vaisseau sélectionné fournit son hyperpropulseur et ses réserves pour ce trajet.')}`),
    page('arrivee', 'Enregistrer l’issue du voyage', 'Tchat › Jet d’Astrogation › Résolution du voyage › Valider le voyage', `
      <p>Dans le tchat, <strong>Résumé du trajet</strong> permet aux joueurs de relire le voyage. Le MJ ouvre <strong>Résolution du voyage</strong>, précise l’issue, les escales ou les complications, puis vérifie les réserves avant de valider.</p>
      <p>Sur le vaisseau choisi, ouvre le <strong>Journal de bord</strong> pour retrouver le départ, l’arrivée, le navigateur, la durée et l’état du trajet. Tu peux ainsi reprendre la campagne à partir du dernier voyage enregistré.</p>`),
  ]),
  tour('des', 'Jets de dés et dépenses de symboles',
    'Lire le résultat d’un test, dépenser les avantages ou les menaces et résoudre un critique depuis le tchat.', [
    page('resultat', 'Lire les deux résultats d’un jet', 'Fiche › Compétences › Jet › Tchat', `
      <p>Clique sur les dés d’une compétence, vérifie la difficulté, puis lance le <strong>Jet</strong>. Dans le tchat, lis d’abord les réussites nettes pour savoir si l’action aboutit. Lis ensuite les avantages ou les menaces restants pour en déterminer les conséquences.</p>
      <p class="ffg-guide-example"><strong>Exemple :</strong> une action peut échouer tout en laissant deux avantages à dépenser. Une réussite peut, elle aussi, s’accompagner d’une menace.</p>`),
    page('depenses', 'Dépenser les avantages et les menaces', 'Tchat › Message du jet › Utiliser les avantages / menaces', `
      <p>Le système appelle les désavantages des <strong>menaces</strong>. Sous le résultat, ouvre <strong>Utiliser les avantages / menaces</strong>, choisis un effet et sa quantité. Le solde se met à jour avant validation.</p>
      <p>Une fois validée, la dépense apparaît sous le message. Pour corriger un choix, utilise la commande d’annulation de cette dépense. Les effets narratifs se jouent avec le MJ.</p>
      ${capture('depense-symboles', 'Message de jet dans le tchat avec la commande de dépense des symboles.', 'La dépense part du message du jet, même si la fiche du personnage est déjà fermée.')}`),
    page('critique', 'Résoudre une blessure critique', 'Tchat › Dépense de critique › Résoudre le critique…', `
      <p>Sur une attaque qui permet un critique, sélectionne l’effet correspondant et paie son coût. Sous le jet, clique ensuite sur <strong>Résoudre le critique…</strong>. Vérifie la cible et les modificateurs avant de confirmer.</p>
      <p>Confirme que la cible a subi des dégâts après encaissement ou blindage. Choisis <strong>Lancer et appliquer</strong> si tu contrôles la cible, ou <strong>Demander au MJ</strong> dans le cas contraire.</p>`),
  ]),
  tour('vehicules', 'Véhicules',
    'Prendre en main la nouvelle fiche, affecter les postes d’équipage, identifier les propriétaires et suivre les trajets.', [
    page('tableau', 'Se repérer sur la fiche', 'Répertoire Véhicules › Ouvrir une fiche', `
      <p>La refonte rassemble les informations par usage. Les compteurs en tête de fiche donnent l’état du véhicule. L’onglet <strong>Kits et Armes</strong> réunit l’armement, l’entretien et l’équipage. La soute, les avaries et le journal disposent chacun de leur propre vue.</p>
      <p>En combat, pars de <strong>Kits et Armes</strong> pour voir qui est en poste. Entre deux séances, pars du <strong>Journal de bord</strong> pour reprendre le dernier trajet.</p>`),
    page('equipage', 'Affecter l’équipage', 'Fiche véhicule › Kits et Armes › Équipage', `
      <p>Sur une fiche modifiable, glisse un personnage depuis son répertoire sur le tableau <strong>Équipage</strong>. Utilise le crayon de sa ligne pour choisir son poste. Pour un artilleur, précise l’arme qui lui est affectée.</p>
      <p>Les dés de la ligne ouvrent le jet disponible pour ce poste. Le MJ peut ainsi préparer le pilotage ou le tir avec les compétences du membre d’équipage concerné.</p>
      ${capture('vehicule-equipage', 'Tableau d’équipage montrant les postes et les commandes de jet.', 'Chaque ligne relie un personnage, un poste à bord et les jets disponibles.')}`),
    page('proprietaires', 'Identifier les propriétaires', 'Fiche véhicule › Propriétaires &amp; Biographie', `
      <p>Glisse la fiche du personnage sur la <strong>liste des propriétaires</strong>. Son nom permet de rouvrir sa fiche si tu y as accès. Plusieurs personnages peuvent être propriétaires du même vaisseau.</p>
      <p>La propriété indique à qui appartient le véhicule dans la fiction. L’équipage indique qui tient un poste à bord. Pour qu’un propriétaire soit aussi pilote, affecte-lui ce poste dans <strong>Kits et Armes</strong>.</p>
      ${capture('vehicule-proprietaires', 'Liste des propriétaires sur la fiche du véhicule.', 'Dépose le personnage dans la zone Propriétaires pour l’associer au véhicule.')}`),
    page('journal', 'Retrouver un voyage hyperspatial', 'Fiche véhicule › Journal de bord › Trajets', `
      <p>Le lien se fait en choisissant la fiche du vaisseau dans la préparation du voyage sur la carte galactique. Le jet d’Astrogation alimente son journal et la validation y inscrit l’issue du voyage.</p>
      <p>Ouvre une ligne pour consulter son détail. Le bouton <strong>Ajouter un trajet</strong> sert à consigner manuellement un déplacement, par exemple un trajet joué sans jet d’Astrogation.</p>`),
  ]),
  tour('talents', 'Jets de dés et talents',
    'Choisir l’arme d’une attaque, appliquer un talent associé au jet ou déclencher le test propre à un talent.', [
    page('arme', 'Choisir l’arme de l’attaque', 'Fiche › Compétence de combat › Arme utilisée (facultatif)', `
      <p>Quand tu prépares une attaque depuis une compétence de combat, le sélecteur propose les armes compatibles de l’inventaire du personnage. Choisis celle qui sert à l’attaque pour que le jet tienne compte de ses données.</p>
      <p>En Pugilat, <strong>Mains nues</strong> permet de préparer l’attaque sans arme. Le choix d’arme est mémorisé par compétence : vérifie-le si tu viens de changer d’équipement.</p>`),
    page('associes', 'Appliquer un talent au jet en cours', 'Fenêtre du jet › Utiliser des talents associés', `
      <p>Si tu contrôles la fiche et qu’un talent acquis propose une action pour ce jet, le bouton <strong>Utiliser des talents associés</strong> apparaît avant <strong>Jet</strong>. Ouvre-le, lis les conditions et sélectionne le talent. Vérifie les dés et le coût annoncés avant de lancer.</p>
      <p class="ffg-guide-note"><strong>Portée de l’automatisation.</strong> Tous les talents ne disposent pas d’une mécanique implémentée. Leur description reste la référence ; le joueur et le MJ appliquent ensemble les effets qui ne sont pas pris en charge.</p>
      ${capture('jet-talents', 'Préparation d’un jet avec la commande Utiliser des talents associés.', 'Le choix d’un talent associé se fait avant le lancer des dés.')}`),
    page('declencher', 'Déclencher ou paramétrer un talent', 'Fiche › Éclair ou onglet Talents', `
      <p>Certains talents lancent leur propre test. Dans ce cas, clique sur l’<strong>éclair</strong> à droite de la fiche et choisis le talent. Par exemple, <strong>Défaut de motivateur</strong> prépare son test de Mécanique directement.</p>
      <p>D’autres talents exigent un choix préalable. Dans l’onglet <strong>Talents</strong>, utilise la roue crantée à côté du nom lorsqu’elle est proposée. Pour <strong>Beau Parleur</strong>, choisis la compétence sociale concernée et vérifie qu’elle apparaît sous le talent.</p>`),
  ]),
  tour('pilotage-mj', 'Pilotage MJ',
    'Régler la difficulté commune et attribuer un bonus ou un malus au prochain jet d’un pion.', [
    page('commun', 'Fixer une difficulté commune', 'Tchat › Icône de curseurs › Pilotage MJ', `
      <p>Ouvre les curseurs près du choix de mode de message dans le tchat. Dans la colonne <strong>Difficulté</strong>, prépare les dés de Difficulté, de Défi ou d’Infortune, coche <strong>Utiliser pour tous les jets</strong> et clique sur <strong>Appliquer la difficulté</strong>.</p>
      <p>À la fin de la situation, décoche cette option et applique à nouveau le réglage pour revenir aux difficultés individuelles.</p>
      ${capture('pilotage-mj', 'Panneau Pilotage MJ avec les réglages communs et la sélection des pions.', 'La difficulté commune et les effets individuels se règlent séparément dans ce panneau.')}`),
    page('individuel', 'Attribuer des dés au prochain jet', 'Pilotage MJ › Personnages de la scène', `
      <ol><li>Sélectionne le pion concerné. Deux pions du même nom peuvent recevoir des effets différents.</li>
      <li>Indique les dés de Fortune ou d’Infortune, le motif et, si nécessaire, la compétence ciblée.</li>
      <li>Clique sur <strong>Attribuer au prochain jet</strong>. L’effet apparaît dans <strong>Bonus et malus en cours</strong> et dans la préparation du jet concerné.</li></ol>
      <p>Les dés sont consommés au lancer. Fermer la préparation les conserve pour la prochaine tentative. Utilise <strong>Retirer</strong> si l’effet a été attribué au mauvais pion.</p>`),
  ], true),
];
