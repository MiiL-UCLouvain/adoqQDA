# Journal des versions — adoq QDA (anciennement QDA-md Étude)

Version pour l'initiation des étudiant·es au codage qualitatif. Elle est distincte de QDA-md, la version de recherche. Depuis la 0.3, elle s'appelle **adoq QDA**, « Analyse de données qualitatives ». Toute l'app tient dans **un seul fichier HTML**, sans installation ni serveur : un double-clic l'ouvre dans le navigateur, et aucune donnée ne quitte l'ordinateur. Le numéro de version fait partie du nom du fichier (`adoq-QDA-0.4.3.html` ; jusqu'à la 0.2.2, `QDA-md-Etude-<version>.html`).

Format : chaque version liste ce qui a été **ajouté**, **modifié** ou **corrigé**. La section « À venir » garde les améliorations décidées mais pas encore développées.

---

## À venir — 0.4.4 (prévu, pas encore développé)

### Sécurité (audit du 2026-11-20)
- **Politique de sécurité (CSP) intégrée au fichier**, comme seconde ligne de défense :
  - aucun accès réseau autorisé ;
  - seuls les deux scripts de l'app peuvent s'exécuter, identifiés par leur empreinte SHA-256 calculée à l'assemblage.
- **Code de déverrouillage de l'arbre** : saler l'empreinte avec l'identifiant du projet, et rappeler de ne jamais y mettre un vrai mot de passe.
- **Distribution** (consignes, pas de code) :
  - distribuer le fichier en téléchargement, ou l'héberger sur un domaine séparé (GitHub Pages), plutôt que de le faire ouvrir directement dans Moodle ;
  - publier l'empreinte SHA-256 du fichier sur la page du cours, pour qu'aucune version modifiée ne circule.

### Affichage
- **Bouton « Vue enseignant » visible** dans la barre du haut. Il n'est aujourd'hui accessible que par un lien sur l'accueil et par le menu Exporter.

### Constaté à l'audit, sans action prévue
- Aucun accès réseau, aucune dépendance externe, aucune exécution de code dynamique.
- Le navigateur ne donne accès qu'aux fichiers choisis par l'utilisateur ; l'app ne peut ni lancer de programme ni modifier le système.
- Les 26 points d'affichage échappent le contenu. Un projet piégé dans tous ses champs, ouvert dans 13 écrans (dont la vue enseignant), n'a exécuté aucun code.
- Un fichier énorme ou malformé peut figer l'onglet, sans dégât ni perte au-delà du travail non enregistré.

---

## 0.4.3 — 2026-11-26 · le format s'appelle « qda.md » (version 1)

### Modifié
- Le format de fichier commun à adoq QDA et à QDA-md s'appelle maintenant **format qda.md (version 1)**, au lieu de « format QDA 1 ». Le nom reprend l'extension des fichiers.
- Le nouveau nom apparaît :
  - dans l'app : fenêtre de conversion d'un ancien projet, message de fin de conversion, aide intégrée ;
  - dans le manuel : accueil et page « Le fichier projet » ;
  - dans `aspect-technique.md` ;
  - dans la spécification, renommée `specification-format-qda-md-1.md` (brouillon 0.1.1), qui précise que la version se lit dans l'en-tête.

### Compatibilité
- **Aucun changement dans les fichiers** : la clé d'en-tête reste `qda-format: 1`, et tout projet 0.4 à 0.4.2 s'ouvre tel quel.
- Les entrées 0.4 à 0.4.2 de ce journal gardent l'ancien nom « QDA 1 », qui désigne le même format.
- Tests : 54 tests du noyau et 93 tests de l'interface, tous réussis.

---

## 0.4.2 — 2026-11-26 · origine des codes : inductif ou déductif

### Ajouté
- **Origine d'un code**, avec le bouton **🧭** de l'arbre :
  - **inductif** : le code est né de la lecture des entretiens ;
  - **déductif** : il vient de la théorie, d'une hypothèse ou de la question de recherche ;
  - **non précisée** (par défaut).

  Un champ facultatif note la théorie ou l'auteur·e de référence, surtout utile pour un code déductif.
- Pastille **I** (vert) ou **D** (violet) devant le nom du code ; son survol rappelle l'origine et la théorie.
- Livre de codes exporté : ligne « *Origine : inductive / déductive (théorie)* » sous chaque code concerné.
- Journal de l'arbre : opération `origine` (« « Stratégies de vérification » (#verification) : déductif · théorie : Wardle »). Le changement est annulable (Ctrl+Z) et bloqué quand l'arbre est verrouillé, comme la définition.
- Aide intégrée et manuel (page « L'arbre de codes ») complétés.

### Format
- **Même structure que QDA-md** : champs `origine:: inductif` ou `origine:: deductif` et `theorie:: …`, sous la ligne du code et avant sa définition (spécification du format QDA 1, § 6.1). Un code sans origine n'a pas de champ. Aucun changement de format : ces champs étaient déjà lus et conservés depuis la 0.4.
- Fusion de copies et import d'un projet : un code déjà présent reçoit les champs qui lui manquent (origine, théorie…), sans que les siens soient écrasés.

### Compatibilité
- Un projet 0.4 ou 0.4.1 s'ouvre tel quel. La 0.4 et la 0.4.1 ouvrent un projet 0.4.2 sans rien perdre : elles conservent les champs `origine::` et `theorie::`, sans les afficher.
- Tests : 54 tests du noyau et 93 tests de l'interface, tous réussis.

---

## 0.4.1 — 2026-11-25 · nettoyage du code, sans changement de fonctionnalité

Audit du code accumulé depuis la 0.1, puis nettoyage validé point par point. Aucune fonction n'est ajoutée, retirée ou modifiée.

### Retiré (code mort)
- Noyau : la constante `FORMAT`, les champs `p.legacy` et `p.outside` (remplis mais jamais lus), un test sur le titre qui ne pouvait jamais être vrai, et le marqueur temporaire `_newSpk`, qui faisait double emploi avec la vérification finale des locuteurs.
- Interface : la constante `META_LABELS` (inutilisée), un filtre sans effet (`… || true`) dans la comparaison des codeurs, et la reprise du réglage « N'afficher que mes codages » de la 0.2.1, jamais diffusée.
- Outils : `outils/captures-manuel.py`, copie dépassée de `shots.py`, qui reste dans les sources du manuel.

### Simplifié
- Une seule fonction de téléchargement (`download`) pour le texte et les archives ; une seule fonction pour retirer les réglages du navigateur (`clearLocalKeys`), utilisée par « Effacer maintenant » et à la fermeture de l'onglet.
- **Feuille de style réorganisée par zone de l'écran** : les cinq blocs ajoutés version après version (0.2 à 0.4) sont rangés dans leurs sections, et les dix sélecteurs définis deux fois sont fusionnés (259 → 247 lignes).
- Le champ « Codeur » vide utilise sa propre classe (`missing`) au lieu de partager `empty` avec les messages « liste vide ». La rustine de la 0.3 qui corrigeait ce conflit est retirée.
- Vue enseignant et synthèse du groupe : les projets sont copiés avec la copie légère de l'annulation (`snapshot`), au lieu d'être réécrits puis relus en entier.
- Le noyau n'expose plus que les fonctions utilisées par l'interface et les tests (75 au lieu de 90). Les autres restent internes.

### Documentation
- `aspect-technique.md` réécrit pour la version actuelle : modèle de données avec codes et identifiants, section sur le format QDA 1, fichier unique et dossier, anciens formats, noms internes gardés, performances.

### Vérifié
- 53 tests du noyau et 91 tests de l'interface, tous réussis.
- Sorties identiques avant et après le nettoyage sur le projet d'exemple : fichier unique, dossier, trois exports CSV, extraits, vue enseignant.
- Captures d'écran des 23 écrans testés comparées pixel par pixel : seuls diffèrent l'heure affichée, le numéro de version et le curseur clignotant.

### Gardé volontairement
- La lecture et la conversion des anciens formats (adoq 0.1 à 0.3.1, QDA-md 0.9.1), demandées par la spécification.
- Les noms internes `qda-md-etude` (base du navigateur, empreinte du verrou) : les changer ferait perdre les sauvegardes et invaliderait les codes de verrou.
- L'empreinte de secours du verrou (`fnv:`) et les tolérances de lecture (`(réponse entière)`, citations entre guillemets droits).

---

## 0.4 — 2026-11-25 · format QDA 1, export en dossier, import de projets QDA-md

### Format
- **adoq QDA écrit maintenant le format QDA 1** (`qda-format: 1`), défini par la *Spécification du format QDA 1* (brouillon 0.1) et commun avec QDA-md, la version de recherche.
  - Chaque document a un **code** (`document:: E01`) et chaque paragraphe un **identifiant stable** (`### E01-004`) ; le locuteur passe dans un champ `locuteur::` sous le titre du paragraphe.
  - Rôles des locuteurs : `intervieweur`, `répondant`, `participant`, `autre`.
  - Les décisions de consensus désignent le document par son code.
  - Protection des lignes de texte selon la spécification (`\` devant `#`, `>`, `-`, `+`, `*`, `=`, `|`, `` ` ``, `~`, `<`, `[`, `!`, `^`, `%`, `\`, `1.` ou `1)`).
  - **Ce qui n'est pas compris est conservé** et réécrit à sa place : clés d'en-tête, sections (`# Équations`…), champs (`origine::`, `variables::`…), encadrés inconnus, mémos de paragraphe.
  - Garanties vérifiées sur le projet d'exemple de la spécification : ouvrir puis enregistrer redonne le fichier **à l'octet près**, ajouter puis retirer un codage aussi, et découper puis réunir redonne le fichier et le dossier d'exemple à l'octet près.

### Ajouté
- **Exporter › Projet en dossier (.zip)** : `arbre.md` et un fichier par entretien dans `donnees/`, prêts pour QDA-md ou Obsidian. Le mode de travail par défaut reste le fichier unique.
- **Importer › onglet « Projet QDA-md »** : ajoute au projet ouvert un dossier de projet (choix d'un dossier), une archive `.zip` ou un autre `.qda.md`.
  - Un aperçu indique les documents, codes et codages ajoutés. Rien n'est effacé, et l'import est noté dans le journal de l'arbre (`import`).
  - **Projets QDA-md 0.9.1** (ancien format, `## ID_…`, `corpus:`) convertis au passage. Les notes `>` sous les codes de leur arbre deviennent des **mémos** de codes ; les dossiers « un fichier par paragraphe » sont réunis par document ; `.qda/`, `analyses/`, `extraits_*` sont ignorés.
  - Un document d'un autre projet dont le code est déjà pris reçoit un nouveau code, et ses paragraphes suivent.
- **Code du document** modifiable dans ⓘ Fiche : les identifiants de paragraphes et les décisions de consensus suivent, et le changement est noté dans le journal.
- Code du document affiché dans la liste des documents (`E01`, `FG1`…).
- **Mémo de paragraphe** : affiché sous le texte, modifiable d'un clic (« ＋ mémo »).
- Les **variables Iramuteq** (`**** *ID_1373 *age_jeune`) sont lues dans un champ `variables::`, et l'identifiant `ID_1373` devient l'identifiant du paragraphe.

### Modifié
- **Ouverture d'un projet à l'ancien format** (QDA-md Étude, adoq 0.3) : conversion proposée, avec copie de l'ancien fichier dans les sauvegardes du navigateur et bouton « Télécharger une copie, puis convertir ».
- Exports CSV : colonnes `code_document` et `variables` ; les cellules qui commencent par `=`, `+`, `-` ou `@` sont précédées d'une apostrophe (protection contre l'injection de formules, prévue pour la 0.3.2).
- Projet d'exemple : documents `E01`, `E02`, `FG1`.
- Aide intégrée et manuel en ligne : nouveau format, export en dossier, import de projets QDA-md.

### Compatibilité
- Les projets 0.1 à 0.3.1 s'ouvrent et sont convertis.
- **Une version antérieure à 0.4 ne doit pas ouvrir un projet au format QDA 1** : elle lirait les champs `locuteur::` comme du texte et abîmerait le fichier en l'enregistrant. Dans un groupe, tout le monde passe à la 0.4.
- Tests : 53 tests du noyau et 91 tests de l'interface dans Chrome, tous réussis.

---

## 0.3.1 — 2026-11-23 · logo, manuel renommé

### Ajouté
- **Logo** : un petit poisson dont les écailles sont trois lignes de texte surlignées de couleurs différentes (orange, bleu, corail), comme des passages codés. Il apparaît :
  - en haut à gauche de l'app, à la place du petit carré ;
  - en grand sur l'accueil, à côté du nom ;
  - comme icône d'onglet du navigateur.

  Le dessin est un SVG intégré au fichier HTML : aucune image n'est chargée depuis l'extérieur. Les fichiers `adoq-logo.svg` (logo) et `adoq-icon.svg` (icône carrée) sont fournis avec les sources.

### Modifié
- **Manuel renommé adoq QDA**, avec le logo, le nom et le sous-titre en haut du bandeau latéral et l'icône d'onglet.
  - Le bouton de téléchargement pointe vers `adoq-QDA-0.3.1.html`.
  - La version Markdown complète s'appelle maintenant `manuel-adoq-QDA.md`.
  - Les captures d'écran ont été refaites avec le nouveau nom et le logo.
  - Une note rappelle l'ancien nom et précise que les projets créés avant le changement de nom s'ouvrent sans conversion. La page sur le fichier projet explique pourquoi l'en-tête garde `qda-md-etude: 2`.
- **Présentation sur la page d'accueil du manuel** :
  - la comparaison avec des logiciels existants est retirée ;
  - adoq QDA y est présenté comme un outil **conçu pour apprendre le codage qualitatif**, pensé pour les étudiant·es et les enseignant·es ;
  - un encadré « Un outil pour apprendre » précise qu'il n'est **pas recommandé pour l'analyse de grands corpus par des équipes de recherche professionnelles**, même s'il est sans doute assez robuste pour cela. Ces équipes ont besoin de fonctions qu'il laisse volontairement de côté : travail simultané sur un même projet, droits d'accès, sons et vidéos, requêtes avancées.

### Compatibilité
- Aucun changement de format ni de comportement par rapport à la 0.3. Tests : 43 tests du noyau et 81 tests de l'interface, tous réussis.

---

## 0.3 — 2026-11-23 · nouveau nom : adoq QDA

### Modifié
- **Le logiciel s'appelle maintenant adoq QDA**, avec le sous-titre **« Analyse de données qualitatives »**. « adoq » reprend les initiales d'« analyse de données qualitatives », et QDA (*qualitative data analysis*) le dit en anglais. Le nom se lit sans traduction en français, en anglais, en portugais et en espagnol.
- Le nouveau nom apparaît dans :
  - l'en-tête et le titre de l'onglet ;
  - l'accueil (nom et sous-titre), l'aide et la question sur l'effacement des données ;
  - les boîtes de dialogue d'ouverture et d'enregistrement de Chrome et Edge (« Projet adoq QDA »).
- **Nom du fichier distribué** : `adoq-QDA-<version>.html`, ici `adoq-QDA-0.3.html`.

### Corrigé
- **Barre du haut trop haute** quand le champ « Codeur » était vide : le champ reprenait par erreur les marges des messages « liste vide ». La barre retrouve sa hauteur normale (43 pixels au lieu de 118). Ce défaut existait déjà en 0.2.2.

### Compatibilité
- **Aucun changement de format.** Les identifiants internes gardent l'ancien nom pour que rien ne se perde :
  - la clé `qda-md-etude: 2` en tête des fichiers `.qda.md` ;
  - la base `qda-md-etude` du navigateur et les clés `qdaE.*` ;
  - l'empreinte du code de verrouillage de l'arbre.
- Un projet créé avec QDA-md Étude 0.2.x s'ouvre tel quel dans adoq QDA 0.3, et l'inverse est vrai aussi. Les copies de secours et le travail non enregistré sont retrouvés.
- Tests : 43 tests du noyau et 81 tests de l'interface dans Chrome, tous réussis.
- Le manuel en ligne a été renommé dans la 0.3.1.

---

## 0.2.2 — 2026-11-20 · effacement des données du navigateur, menu « Afficher », lecture rapide

### Ajouté
- **« Effacer les données de ce navigateur quand on ferme QDA-md Étude ? » Oui / Non** : la question est posée sur l'accueil et dans « Exporter › Sauvegardes et données du navigateur… ».
  - **Non** (par défaut, ordinateur personnel) : le comportement reste celui de la 0.2.1, avec copies de secours, reprise du travail non enregistré et projets récents.
  - **Oui** (ordinateur partagé, données sensibles) :
    - les données déjà gardées sont effacées immédiatement ;
    - pendant le travail, **rien n'est écrit dans le navigateur** : ni sauvegarde, ni reprise, ni projet récent, ni identifiant ;
    - à la fermeture de l'onglet, les réglages restants sont effacés ;
    - au démarrage, d'éventuels restes sont supprimés.

    Seul ce choix lui-même est mémorisé.
  - Le bouton **« Effacer maintenant les données de ce navigateur »** fait le ménage à tout moment, sans toucher aux fichiers projet.
  - Ce réglage corrige le point le plus sérieux de l'audit de sécurité (copies des entretiens lisibles par d'autres fichiers HTML locaux, et restant sur les ordinateurs partagés).
- **Menu « Afficher »** en bas de la colonne des codes, à la place de la case « N'afficher que mes codages ».
  - Il propose **tous les codeurs**, **mes codages** (codage à l'aveugle) ou **n'importe quel codeur du projet**, y compris `@consensus`.
  - Ce choix est indépendant de l'identifiant avec lequel on code. Un rappel s'affiche quand un autre codeur est affiché, car les nouveaux codages restent signés de son propre identifiant et n'apparaissent pas.
  - Le choix « N'afficher que mes codages » de la 0.2.1 est repris automatiquement.
- **Tests** : 43 tests du noyau et 81 tests de l'interface dans Chrome (menu Afficher, effacement des données, absence d'écriture en mode « Oui », retour à « Non »).

### Modifié
- **Nom du codeur sur toutes les étiquettes** dès que le projet compte au moins deux codeurs. Il est masqué quand il n'y en a qu'un ou quand un seul codeur est affiché. En 0.2.1, il n'apparaissait que si le paragraphe lui-même avait été codé par plusieurs codeurs.
- **Nom du fichier** : `QDA-md-Etude-<version>.html` (ici `QDA-md-Etude-0.2.2.html`).
- **Barre du haut** compactée : elle tient sur une ligne à partir de 1 280 pixels de large, même avec l'indicateur « Non enregistré ».
- Le menu « Sauvegardes automatiques… » devient **« Sauvegardes et données du navigateur… »**.

### Corrigé
- **Lecture d'un très long document** : la vérification des étiquettes de paragraphe en double avait un coût qui croissait avec le carré du nombre de paragraphes. Un document de 3 000 pages (24 000 paragraphes) se lit maintenant en 0,2 s au lieu de 5,4 s dans Chrome ; l'ouverture complète passe de 6,2 s à environ 1 s.

### Compatibilité
- Aucun changement de format : un projet 0.2.1 s'ouvre tel quel, et la 0.2.1 peut ouvrir un projet 0.2.2.
- Le manuel en ligne est mis à jour (lien de téléchargement, menu « Afficher », page « Données et confidentialité »).

---

## 0.2.1 — 2026-11-20 · paragraphes sans nom = répondant, caractéristiques des locuteurs

### Règle de retranscription
- **Seule l'intervieweuse est nommée dans le fichier source** : chaque question commence par son nom (« Zoé : … »). Tout paragraphe **sans mention de locuteur** est une réponse de la personne interviewée.
- **À l'import, l'app demande le pseudo** de cette personne. Sans pseudo, les réponses sont attribuées à « Répondant ». Le pseudo est aussi reporté dans la fiche de l'entretien si celle-ci n'en a pas.
- Un « Zoé : » au milieu d'un paragraphe n'est pas pris pour un changement de locuteur.

### Ajouté
- **Trois façons d'attribuer les paragraphes**, au choix pour chaque document à l'import et dans « 👥 Locuteurs » :
  1. **Seul·e l'intervieweur·euse est nommé·e** : les paragraphes sans nom sont les réponses de la personne interviewée. C'est le choix proposé dès qu'un seul nom est repéré ou que beaucoup de paragraphes n'ont pas de nom ; l'intervieweur·euse est alors repéré·e comme tel·le.
  2. **Chaque prise de parole commence par un nom** (focus group) : un paragraphe sans nom prolonge la prise de parole précédente, comme en 0.2.
  3. **Ne pas indiquer de locuteurs** : c'est le choix proposé pour un corpus Iramuteq, où chaque paragraphe vient d'une personne différente.
- **Caractéristiques de chaque locuteur** : âge, genre, profession, et autres caractéristiques libres saisies sous la forme `niveau d'études: master ; commune: Namur`.
  - Elles se saisissent **à l'import**, pour la personne interviewée et pour chaque participant·e nommé·e d'un focus group.
  - Elles se modifient ensuite dans « 👥 Locuteurs », qui présente une fiche par locuteur : nom, rôle, caractéristiques et nombre de paragraphes.
  - Elles s'affichent dans l'info-bulle du nom du locuteur, au-dessus de chaque paragraphe.
  - Elles sont reprises dans l'export des extraits (`_Locuteurs : Marie (âge : 24, genre : F)_`), dans les **segments codés** (une colonne `locuteur_âge`, `locuteur_genre`… par caractéristique) et dans la **matrice locuteurs × codes**. Ces exports permettent de croiser les codes avec l'âge ou le genre dans un tableur ou SPSS.
  - Fusion de copies : les caractéristiques manquantes sont complétées, sans rien écraser. Renommer ou fusionner un locuteur garde ses caractéristiques.
- **« 👥 Locuteurs »** permet aussi d'attribuer après coup les paragraphes restés sans locuteur.
- **Projet d'exemple** : le premier entretien suit la nouvelle règle (seules les questions de Léa sont nommées), et chaque locuteur a des caractéristiques.
- **Tests** : 42 tests du noyau et 71 tests de l'interface dans Chrome.

### Format
- La ligne d'un locuteur peut porter ses caractéristiques :
  ```
  > - Marie :: répondant :: âge: 24 ; genre: F ; profession: graphiste
  ```
  Les `;` et `:` saisis dans un nom de caractéristique et les `;` saisis dans une valeur sont remplacés par des virgules.
- Le numéro de format reste `qda-md-etude: 2`. Un fichier 0.2 s'ouvre tel quel et est réécrit à l'identique.

### Compatibilité
- La 0.2 lit un fichier 0.2.1 mais ignore les caractéristiques, qu'elle effacerait à l'enregistrement. Il faut donc utiliser la 0.2.1 partout.

---

## 0.2 — 2026-11-20 · locuteurs, fiche d'entretien, mémos de codes, journal, verrou, consensus, vue enseignant

### Format du projet (`qda-md-etude: 2`)
Les ajouts sont tous facultatifs. Un fichier 0.1 s'ouvre tel quel et est réécrit au format 2 à la première modification.

- **Locuteur d'un paragraphe** : il figure dans le titre, `### §4 · Marie`.
- **Locuteurs d'un document** et leur rôle, sous le titre du document :
  ```
  > [!locuteurs]- Locuteurs
  > - Enquêteur :: intervieweur
  > - Marie :: répondant
  ```
- **Fiche de l'entretien** : `> [!meta]- Fiche de l'entretien`, avec une ligne `clé:: valeur` par champ. Les champs `date`, `pseudo`, `intervieweur` et `lieu` sont prévus ; d'autres sont libres (durée, âge…).
- **Mémos des codes** : une section `# Mémos des codes`, avec un `## Libellé #identifiant` par code, puis un texte libre sur plusieurs paragraphes. Les lignes qui commencent par `#` sont protégées par `\`.
- **Décisions de consensus** : une section `# Décisions de consensus`, avec une ligne `- écarté :: document :: paragraphe :: #code` par codage écarté.
- **Journal de l'arbre de codes** : une section `# Journal de l'arbre de codes`, avec une ligne par opération :
  ```
  - 2026-11-20 10:32 · @zoe · fusion · « A » (#a) fusionné dans « B » (#b) · 12 codage(s) · motif : doublons
  ```
- **Verrou de l'arbre** dans l'en-tête : `verrou: oui`, ou `verrou: sha256:…` quand un code de déverrouillage a été choisi.

### Ajouté
- **Questions, réponses et locuteurs** :
  - **Repérage à l'import** des préfixes en début de paragraphe : `Nom :`, `[Nom]`, `Q.`, `R.`, éventuellement précédés d'un horodatage `[00:12:33]`. Le préfixe quitte le texte et devient le locuteur du paragraphe, et les paragraphes suivants sans préfixe en héritent.
  - Les variantes de casse et de ponctuation sont regroupées (`Int.`, `INT`). Les abréviations de titre (`M.`, `Dr.`) et les phrases du type « Il m'a dit : … » sont écartées.
  - Le rôle est deviné (Enquêteur, Q, Animatrice… → intervieweur). Dans l'aperçu d'import, l'étudiant peut décocher un préfixe, le renommer ou changer son rôle.
  - **Après coup**, le bouton « 👥 Locuteurs » permet de repérer les locuteurs dans un document déjà importé, en recalant les citations déjà codées. Il permet aussi de renommer, fusionner (même nom) ou changer de rôle, et affiche le tableau **« Qui mobilise quels codes ? »** (locuteurs × codes).
  - **Clic sur le nom du locuteur** d'un paragraphe pour le corriger, éventuellement avec les paragraphes suivants.
  - **Affichage** : questions en pointillés et grisées, option « masquer les questions », filtre par locuteur dès qu'il y a au moins deux répondants (focus group), couleur propre à chaque participant.
  - Le **kappa exclut les questions** de l'intervieweur, avec une option pour les inclure, et l'avancement d'un document compte les réponses codées.
- **Fiche de l'entretien** (« ⓘ Fiche ») : date, pseudo de la personne interviewée, intervieweur·euse, lieu et champs libres.
  - Elle se saisit aussi à l'import et s'affiche sous le titre du document et dans la liste des documents.
  - Elle est reprise dans les extraits et les exports CSV.
  - Un rappel d'anonymat accompagne la saisie.
- **Mémo par code** (🗒), distinct de la définition (📝) :
  - un long texte libre, qui reste modifiable quand l'arbre est verrouillé ;
  - affiché dans les extraits et repris dans l'export des extraits et le livre de codes ;
  - lors d'une fusion de codes, le mémo du code absorbé est ajouté à celui du code cible.
- **Journal de l'arbre de codes**, tenu automatiquement :
  - création (y compris depuis la fenêtre de codage), renommage, définition, imbrication et désimbrication par glisser-déposer, fusion (avec le nombre de codages), suppression, verrouillage et déverrouillage ;
  - les codes reçus par fusion d'une copie sont aussi notés ;
  - un motif facultatif peut être saisi dans les fenêtres de fusion et de suppression, ou ajouté après coup dans le journal ;
  - consultation filtrable par type et export `.md`.
- **Verrouillage de l'arbre** (🔓 / 🔒), avec un code de déverrouillage facultatif. Une fois l'arbre verrouillé :
  - on code avec les codes existants et on écrit des mémos ;
  - on ne peut plus créer de code, ni depuis l'arbre ni depuis la fenêtre de codage, ni renommer, définir, déplacer, fusionner ou supprimer ;
  - c'est un verrou pédagogique : le fichier reste modifiable à la main, ce que l'interface explique.
- **Codage de consensus** (« Comparer les codeurs », onglet 3) :
  - chaque point (paragraphe × code) proposé par l'un ou l'autre codeur est à **garder** ou à **écarter** ;
  - les passages de chaque codeur sont soulignés dans leur couleur ;
  - les accords peuvent être repris d'un coup, et une barre de progression suit l'avancement ;
  - on peut revenir sur une décision ;
  - le résultat est signé `@consensus`, les codages de départ restent intacts, et il se compare ensuite aux autres codeurs dans l'onglet 2.
- **Vue enseignant** (accueil et menu Exporter) :
  - charge les fichiers de tout un groupe, avec un codage de référence facultatif ;
  - **par étudiant·e** : codeur, documents, part des réponses codées, codages, codes, codes sans définition, codes hors référence, **kappa moyen avec la référence**, taille du journal, arbre verrouillé ;
  - **par code** : nombre de codages par étudiant·e, en surlignant les codes isolés ou absents de la référence ;
  - export CSV, et **« Ouvrir la synthèse du groupe »** : un projet qui réunit tous les codages, les identifiants en double étant renommés (`zoe` → `zoe-2`).
- **Exports** :
  - nouvelle matrice locuteurs × codes (`.csv`) ;
  - les segments codés portent maintenant le locuteur, le rôle et la fiche ;
  - la matrice documents × codes porte la fiche.
- **Fusion de copies** : elle réunit aussi les mémos de codes (sans rien écraser), les fiches (champs manquants), les locuteurs (paragraphes qui n'en ont pas), le journal (trié par date) et les décisions de consensus.
- **Projet d'exemple** enrichi : deux entretiens individuels avec locuteurs et fiche, un focus group de trois participants, un mémo de code et un journal.
- **Tests** : 37 tests du noyau (Node) et 66 tests de l'interface dans Chrome.

### Modifié
- **Actions sur un code** : elles s'affichent sous la ligne du code sélectionné (un clic), et non plus au survol, où elles masquaient le libellé.
- **En-tête du document** : fiche et filtres sur deux lignes.
- Le filtre « pas encore codés » ignore les questions.

### Compatibilité
- Les projets 0.1 s'ouvrent sans conversion.
- Un projet 0.2 ouvert avec la 0.1 garde ses codages, mais la 0.1 ne lit ni les mémos de codes, ni le journal, ni les décisions de consensus, et elle les perdrait à l'enregistrement. Il faut donc utiliser la 0.2 partout.

---

## 0.1 — 2026-11-20 · première version

### Format du projet
- **Un seul fichier `.qda.md` par projet**, lisible dans n'importe quel éditeur de texte. Il contient, dans l'ordre :
  - un en-tête (`titre`, `id`, `qda-md-etude: 1`) ;
  - `# Arbre de codes` : une ligne `- Libellé #identifiant` par code, la hiérarchie par l'indentation, la définition en lignes `>` ;
  - `# Documents` : un entretien par section `##`, un paragraphe par section `###`, puis un mémo facultatif `> [!memo]-`.
- **Codage** dans un encadré `> [!codage]-` sous chaque paragraphe, avec la même syntaxe que QDA-md :
  - `> - #code1 #code2 @codeur : « citation »` ;
  - `[n]` désigne la n-ième occurrence de la citation ;
  - `(paragraphe entier)` code tout le paragraphe.
- Le texte des entretiens n'est jamais modifié par le codage. Une citation introuvable est signalée ⚠ sans être perdue, et une ligne de codage illisible est conservée telle quelle.
- La lecture tolère un fichier retouché à la main : fins de ligne Windows, BOM, tabulations, codes absents de l'arbre (ajoutés à la racine).

### Ajouté
- **Accueil** : nouveau projet, ouvrir un projet, projet d'exemple (deux courts entretiens inventés), projets récents (Chrome et Edge).
- **Import** de `.txt` (UTF-8 ou Windows), `.docx` (lu sans bibliothèque), texte collé et format Iramuteq (`**** *ID_…`). Un aperçu est affiché avant l'import.
  - Chaque paragraphe séparé par une ligne vide devient une unité de codage.
  - Sans ligne vide, chaque ligne devient une unité.
- **Codage** : on sélectionne un passage, une petite fenêtre propose les codes ; taper un nom crée un nouveau code.
  - Le dernier code utilisé est proposé en premier : sélection puis `Entrée` suffisent pour le réappliquer.
  - Codes multiples sur un même passage et chevauchements, signalés par des barres de couleur empilées.
  - Bouton « paragraphe entier ».
  - Étiquettes sous chaque paragraphe : × retire un code, le survol montre le passage codé.
- **Un document affiché à la fois**, avec une barre d'avancement par document dans la colonne de gauche.
- **Arbre de codes** : créer, ajouter un sous-code, renommer (l'identifiant reste stable), définir, fusionner, supprimer, déplacer par glisser-déposer (dans un code, avant ou après).
  - Un point orange signale un code sans définition.
  - Les couleurs sont distinctes et restent stables pour un projet.
- **Extraits par code** : avec ou sans sous-codes, filtrables par codeur, chacun dans son contexte avec un lien « Aller au texte ». Export en `.md`.
- **Mémo par document**, **recherche** dans tout le corpus, **filtre** des paragraphes (avec le code actif, ou pas encore codés).
- **Annuler / rétablir** (Ctrl+Z, Ctrl+Y) pour toutes les opérations.
- **Travail à plusieurs** :
  - « N'afficher que mes codages », pour coder à l'aveugle ;
  - **fusion de la copie d'un·e collègue**, avec un aperçu, sans doublons, sans rien retirer et avec renommage possible du codeur ;
  - **accord entre codeurs** : kappa de Cohen par code au niveau du paragraphe, avec la liste des désaccords et un accès direct au texte.
- **Exports** : livre de codes (arbre et définitions, `.md`), segments codés (`.csv`), matrice documents × codes (`.csv`).
- **Enregistrement** :
  - **Chrome et Edge** : enregistrement automatique dans le fichier choisi, environ une seconde après chaque modification ;
  - **Firefox et Safari** : bouton « Enregistrer » (ou Ctrl+S), qui télécharge le fichier, avec le statut « Non enregistré » bien visible et un avertissement à la fermeture de l'onglet.
- **Filets de sécurité dans le navigateur** :
  - reprise du travail non enregistré après une fermeture accidentelle ;
  - 20 sauvegardes automatiques par projet, à ouvrir ou télécharger.
- **Aide intégrée** : premiers pas, organisation des codes, travail à deux, enregistrement, exemple du format.
- **Tests** : 23 tests du noyau (Node) et 41 tests de l'interface dans Chrome.
  - Ils couvrent l'aller-retour à l'identique, l'import `.docx` et cp1252, la fusion et le kappa, l'enregistrement avec et sans écriture directe, la reprise et les sauvegardes.
  - Un corpus de 30 entretiens × 35 pages (3,7 Mo) s'ouvre en 0,2 s ; changer de document ou coder prend moins de 0,1 s.

### Différences avec QDA-md (version de recherche)
- Un seul fichier au lieu d'un dossier ; pas de serveur Python ni de lanceur.
- Pas de mode abductif, d'équations de codes, de saturation ni de variables Iramuteq.
- La syntaxe des lignes de codage et de l'arbre est la même.
