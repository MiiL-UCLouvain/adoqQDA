# adoq QDA — Aspect technique

Version 0.4.3 — novembre 2026

Ce document décrit l'architecture du code, ses fonctions principales et les performances mesurées. Il accompagne les sources de l'application. Le format des fichiers est décrit à part, dans la spécification du format qda.md (version 1), publiée dans son propre dépôt.

---

## 1. Organisation des fichiers

Le fichier distribué, `adoq-QDA-<version>.html`, est assemblé à partir de quatre fichiers sources par le script `build.py`, qui les colle dans un seul HTML.

| Fichier | Lignes | Rôle |
|---|---|---|
| `src/index.html` | 94 | Squelette de la page : barre du haut, trois colonnes, fenêtre de codage, boîte de dialogue, logo |
| `src/style.css` | 252 | Apparence, rangée par zone de l'écran |
| `src/core.js` | ~1 370 | **Le noyau** : format du fichier, import, analyses. Aucune interface. |
| `src/app.js` | ~1 870 | **L'interface** : affichage, clics, sélections, enregistrement |
| `build.py` | 20 | Assemble les quatre fichiers dans `dist/adoq-QDA-<version>.html` (le numéro est lu dans `core.js`) |
| `tests/test-core.js` | ~620 | Tests du noyau, sous Node (54 tests) |
| `tests/test-ui.py` | ~550 | Tests de l'interface dans Chrome, avec Playwright (93 tests) |
| `tests/fixtures/` | — | Projet d'exemple de la spécification, en fichier unique et en dossier |
| `tests/exemple.docx` | — | Petit fichier Word utilisé par les tests d'import |
| `tools/bench.py` | 44 | Chronométrage sur des corpus de taille croissante (section 7) |
| `logo/` | — | Logo (`adoq-logo.svg`) et icône carrée (`adoq-icon.svg`) |

| `manual/` | — | Manuel d'utilisation (MkDocs) : pages, captures (`shots.py`), assemblage (`build_manual.py`) |
| `docs/` | — | Cette documentation, le journal des versions détaillé et la procédure de publication |

### Commandes

```bash
python build.py                  # produit dist/adoq-QDA-<version>.html et affiche son empreinte SHA-256
node tests/test-core.js          # tests du noyau (aucune dépendance)
python tests/test-ui.py          # tests de l'interface (Playwright)
python tools/bench.py            # chronométrage
python manual/build_manual.py    # manuel (manual/site/)
```

Les tests de l'interface, le chronométrage et le manuel demandent les paquets de `requirements-dev.txt`. Ils utilisent le Chromium de Playwright (`python -m playwright install chromium`) ; la variable d'environnement `CHROME_PATH` permet d'utiliser un Chrome installé à la place.

---

## 2. Principe général

La séparation entre **noyau** et **interface** est le choix d'architecture principal. Le noyau ne sait rien de la page web : il reçoit du texte et des objets, il rend du texte et des objets. On peut donc le tester sans navigateur, avec Node, alors que l'interface est testée en pilotant un vrai Chrome.

Le fonctionnement tient en une ligne :

```
fichier .qda.md  →  parseProject  →  projet en mémoire  →  modifications  →  serializeProject  →  fichier .qda.md
```

Le fichier est lu une fois et transformé en objets JavaScript. Toutes les opérations (coder, fusionner des codes…) modifient ces objets, puis le projet entier est réécrit en texte à l'enregistrement. L'app ne modifie jamais le fichier « ligne par ligne ». L'écriture est faite pour qu'un fichier relu puis réécrit sans modification soit identique à l'octet près.

---

## 3. Le modèle de données

En mémoire, un projet est un objet imbriqué :

```
projet
├── meta          { id, titre, verrou, … autres clés d'en-tête, dans leur ordre }
├── tree          [ code { id, label, def, memo, fields { origine… }, children: [codes…] } ]
├── docs          [ document ]
│     ├── name (titre), code ("E01"), fields { … }, meta { date, pseudo, intervieweur, lieu… }
│     ├── memo, metaTitle, memoTitle, extra [encadrés inconnus]
│     ├── speakers  [ { name, role, attrs { âge, genre… } } ]
│     └── paras     [ paragraphe ]
│           ├── label ("E01-004"), speaker ("Marie"), fields { variables… }, text, memo, extra
│           ├── codings [ { codes: ["mefiance"], coder: "zoe", quote: "…", occ: 1 } ]
│           └── raw     [ lignes de codage illisibles, gardées telles quelles ]
├── journal       [ { date, coder, type, desc, motif, raw } ]
├── rejects       [ { doc: "E01", para: "E01-004", code } ]   décisions de consensus « écarté »
└── order, titles, preamble, treeExtra, orphanMemos, bom, crlf   (ce qu'il faut pour réécrire le fichier à l'identique)
```

**Un codage ne stocke pas de position** (caractère 120 à 145) mais **la citation elle-même et son numéro d'occurrence** : « la 2ᵉ fois que "Les experts" apparaît dans ce paragraphe ». C'est ce qui rend le fichier lisible et modifiable par un humain. C'est aussi ce qui permet de signaler un codage « orphelin » sans le perdre quand le texte a changé. Deux petites fonctions font la conversion :

- `locate(texte, citation, occ)` donne la position de la n-ième occurrence ;
- `occurrenceAt(texte, citation, position)` donne le numéro d'occurrence d'une citation qui commence à cette position.

**Identifiants.** Chaque document a un code (`E01`) et chaque paragraphe un identifiant (`E01-004`), uniques dans le projet sans tenir compte de la casse. Ils ne dépendent ni du titre, ni du locuteur, ni de la position : c'est ce qui permet la fusion de copies, les décisions de consensus et les liens Obsidian.

---

## 4. Le format du fichier (format qda.md)

### Lecture et écriture

- `parseProject(texte)` parcourt le fichier ligne par ligne. Selon le titre de niveau 1 rencontré (`# Arbre de codes`, `# Mémos des codes`, `# Décisions de consensus`, `# Journal de l'arbre de codes`, `# Documents`), il change de mode de lecture.
  - Dans l'arbre, l'indentation des tirets donne la hiérarchie ; les lignes `clé:: valeur` sous un code sont ses champs, les lignes `>` sa définition.
  - Dans les documents, `##` ouvre un document (suivi de `document:: <code>`) et `###` un paragraphe (suivi de ses champs, dont `locuteur::`). Les encadrés `> [!codage]`, `> [!meta]`, `> [!locuteurs]` et `> [!memo]` sont lus selon leur type.
  - Il est tolérant : fins de ligne Windows, BOM, tabulations, texte sur plusieurs lignes, codes utilisés mais absents de l'arbre (ajoutés à la racine), lignes de codage illisibles (gardées telles quelles).
- `serializeProject(projet)` fait le chemin inverse, avec `headLines()` (en-tête et sections du projet) et `docLines()` (un document). Une ligne de texte d'entretien qui pourrait être lue comme autre chose que du texte (`#`, `>`, `-`, `1.`…) est protégée par un `\` (`escapeLine`) : un entretien ne peut pas casser la structure du fichier.
- **Conservation de l'inconnu** : les clés d'en-tête, sections, champs, encadrés et lignes que l'app ne connaît pas sont gardés dans le modèle (`p.order`, `p.preamble`, `doc.fields`, `doc.extra`, `para.fields`, `para.extra`, `node.fields`) et réécrits à leur place. Les titres des sections et des encadrés sont gardés tels qu'écrits.

### Fichier unique et dossier

- `splitProject(p)` produit l'emballage « dossier » : `{ 'arbre.md', 'donnees/<code>.md' }`. Il refuse deux documents dont les codes ne diffèrent que par la casse (Windows et macOS les confondraient).
- `joinProject(fichiers)` fait l'inverse : il réunit les fichiers d'un dossier, rangés dans l'ordre alphabétique des codes, puis les lit avec `parseProject`. Il ignore ce qui ne fait pas partie du format (`.qda/`, `.sauvegardes/`, `analyses/`, `extraits_*`…).
- `zipFiles(fichiers)` écrit une archive ZIP sans compression (avec un calcul CRC-32 maison) ; `unzipAll(octets)` lit une archive, en décompressant avec l'outil intégré au navigateur (`DecompressionStream`).

### Identifiants

- `addDoc(p, doc)` donne un code au nouveau document (`D01`, `D02`…, via `nextDocCode`) et des identifiants à ses paragraphes (`assignIds`) : `§4` devient `D01-004`, un identifiant Iramuteq unique (`ID_1373`) est gardé.
- `checkDocCode` vérifie un code (caractères permis, noms réservés par Windows, unicité) ; `renameDocCode` change le code d'un document, et les identifiants de ses paragraphes et les décisions de consensus suivent.

### Anciens formats

- **adoq QDA 0.1 à 0.3.1** (en-tête `qda-md-etude`) : `parseProject` les lit et les convertit (`p.converted`). Le locuteur est lu dans le titre du paragraphe (`### §4 · Marie`), les codes et identifiants sont créés, les décisions de consensus recalées.
- **QDA-md 0.9.1** (dossier, en-tête `corpus:`, paragraphes `## ID_…`) : `joinProject` transforme chaque fichier de données en bloc de document du format qda.md, et lit l'arbre avec l'option `legacyTree`, qui range les lignes `>` sous un code dans son mémo. Les dossiers « un fichier par paragraphe » sont réunis par document.

---

## 5. Le noyau (`core.js`) : autres fonctions

### Import

- `textToDoc(nom, texte)` découpe un texte en paragraphes : lignes vides, ou une ligne par paragraphe, ou le format Iramuteq `****` (l'identifiant `*ID_…` devient l'identifiant du paragraphe, les autres variables vont dans le champ `variables::`).
- `docxToText()` lit un .docx sans bibliothèque. Un .docx est une archive zip : `unzipEntry` y retrouve `word/document.xml`, puis la fonction en extrait le texte des paragraphes Word.

### Locuteurs

- `speakerPrefix(texte)` repère un nom en tête de paragraphe (« Zoé : », « [Zoé] », « Q. », éventuellement après un horodatage). Il écarte « M. », « Dr. » et les débuts de phrase de plus de trois mots.
- `detectSpeakers(doc)` compte ces noms et regroupe les variantes (`Int.`, `INT`).
- `suggestMode(doc, candidats)` propose le mode d'attribution : `respondent` si un seul nom est repéré ou si beaucoup de paragraphes n'ont pas de nom, sinon `inherit`.
- `applySpeakers(doc, candidats, {mode, respondent})` retire le nom du texte et l'attribue au paragraphe, selon le mode :
  - `respondent` : les paragraphes sans nom vont au pseudo de la personne interviewée (règle : seule l'intervieweuse est nommée dans la source) ;
  - `inherit` : un paragraphe sans nom prolonge le précédent (focus group).
- `cutText()` recale les citations déjà codées quand on retire un préfixe du texte : si « Marie : » disparaît, toutes les positions se décalent et les numéros d'occurrence sont recalculés.
- `addSpeaker`, `renameSpeaker`, `setSpeakerAttrs`, `parseAttrs` et `formatAttrs` gèrent les locuteurs et leurs caractéristiques (`âge: 24 ; genre: F`). Les rôles sont `intervieweur`, `répondant`, `participant` et `autre` (`ROLES`).

### Opérations sur les codes

- `addCode`, `moveCode` (avant, après, dedans, racine ; refus de ranger un code dans son propre descendant), `mergeCodes` (réécrit les codages, réunit les doublons, déplace les sous-codes, concatène les mémos), `deleteCode`.
- `addCoding(paragraphe, codes, codeur, citation, occ)` : si le même codeur a déjà codé exactement le même passage, les codes s'ajoutent à la ligne existante au lieu d'en créer une nouvelle.
- `setOrigin(code, origine, théorie)` et `originOf(code)` gèrent l'origine d'un code : champ `origine::` (`inductif` ou `deductif`) et champ facultatif `theorie::`, sous la ligne du code, comme dans QDA-md. La fusion de copies complète les champs manquants d'un code sans écraser ceux qui existent.
- `logTree()` ajoute une entrée au journal de l'arbre.

### Analyses

- `extracts()` et `extractsMarkdown()` : les passages d'un code, avec ou sans sous-codes.
- `segmentsCSV()`, `matrixCSV()`, `speakerMatrixCSV()` : les exports. Une cellule qui commence par `=`, `+`, `-` ou `@` est précédée d'une apostrophe, pour qu'un tableur ne l'exécute pas comme une formule.
- `agreement(p, a, b)` : le **kappa de Cohen**. L'unité est le paragraphe (questions exclues) ; pour chaque code, on compte « les deux / A seul / B seul / aucun », puis on calcule accord observé et accord attendu.
- `consensusItems()`, `consensusKeep()`, `consensusReject()` : chaque couple (paragraphe, code) proposé par l'un des deux codeurs devient un point à trancher. « Garder » copie les codages sous `@consensus`, « Écarter » note la décision dans `rejects`.
- `mergeInto(base, autre)` : la fusion de copies, et l'import d'un projet. Elle **ne fait qu'ajouter** (codes, codages, mémos, fiches, locuteurs, journal, décisions de consensus) et ignore ce qui est déjà présent : refaire une fusion ne change rien.
  - Un document est retrouvé par son code (avec le même titre ou le même texte), sinon par son titre, sinon par son texte. Un document nouveau dont le code est déjà pris reçoit un nouveau code, et ses paragraphes suivent.
  - Un paragraphe est retrouvé par son identifiant, sinon par son texte.
- `teacherSummary()` et `mergeAll()` : les calculs de la vue enseignant.

### Annulation

- `snapshot(p)` fait une copie légère du projet : les codages, l'arbre et les métadonnées sont copiés, mais les textes des entretiens sont partagés, puisqu'ils ne changent jamais. C'est ce qui rend l'annulation rapide même sur 30 entretiens. La vue enseignant s'en sert aussi pour copier les projets avant de les comparer.

---

## 6. L'interface (`app.js`)

### L'état

Un seul objet `S` contient le projet ouvert (`S.p`), le document affiché (`S.cur`), le code actif, l'identifiant du codeur, les filtres, la pile d'annulation et l'état d'enregistrement.

### La fonction centrale : `mutate(fn)`

Toute modification passe par elle :

1. elle prend un `snapshot` du projet et le met sur la pile d'annulation ;
2. elle exécute la modification `fn` ;
3. elle appelle `changed()`, qui marque le projet comme modifié, programme l'enregistrement automatique et la copie de secours ;
4. elle redessine l'écran, entièrement ou seulement le paragraphe concerné.

`undo()` et `redo()` ne font qu'échanger le projet courant avec un snapshot. Ce schéma unique garantit que chaque action est annulable, et que rien n'est oublié à l'enregistrement.

### L'affichage

- `renderAll()` appelle `renderDocs()` (colonne de gauche, avec le code de chaque document), `renderDoc()` (le document affiché), `renderTree()` (l'arbre) et `renderStats()`.
- Seul le document courant est affiché, ce qui garde l'app fluide même avec 1 000 pages de corpus.
- `paraHTML()` construit un paragraphe : identifiant, nom du locuteur, texte surligné, mémo, étiquettes des codes, et applique les filtres (questions masquées, locuteur, code actif).
- `markup(texte, segments)` produit le surlignage. Elle découpe le texte à chaque début et fin de segment codé ; chaque morceau reçoit la couleur de ses codes, avec une barre colorée par code empilée sous le texte quand des codages se chevauchent.
- Tout texte venant du fichier passe par `esc()` avant d'être inséré dans la page. C'est ce qui empêche un fichier piégé d'exécuter du code (vérifié pendant l'audit de sécurité).

### Le codage à la souris

- `checkSelection()` est déclenchée au relâchement de la souris. Elle vérifie que la sélection reste dans un seul paragraphe, convertit la sélection du navigateur en positions dans le texte (`textOffset`), retire les espaces aux extrémités, puis calcule citation et occurrence.
- `openPop()` affiche la petite fenêtre de codage, et `fillPop()` la remplit : code actif en tête, codes filtrés par la saisie, proposition « Créer le code… » (sauf si l'arbre est verrouillé).
- `applyPop()` applique le code, via `mutate`.

### Ouvrir, enregistrer, exporter

- `openText()` lit un projet. Si `parseProject` signale un ancien format, l'app demande confirmation, propose de télécharger une copie de l'ancien fichier, garde l'original dans les sauvegardes du navigateur, puis enregistre la version convertie.
- `save()` et `saveAs()` :
  - **Chrome et Edge** : ils ont une API (File System Access) qui permet d'écrire dans un fichier choisi par l'utilisateur. L'app garde une « poignée » sur ce fichier (`S.handle`), et `writeFile()` le réécrit 1,2 seconde après chaque modification.
  - **Firefox et Safari** : sans cette API, l'app produit un téléchargement (`download()`, qui sert aussi à tous les exports, texte ou archive).
- `exportFolder()` télécharge le projet en dossier (archive `.zip` produite par `splitProject` et `zipFiles`).
- `DB` est une petite couche sur IndexedDB, la base de données intégrée au navigateur. Elle stocke :
  - le travail en cours (`persistWork`), proposé à la reprise sur l'accueil ;
  - les 20 dernières sauvegardes par projet (`backup`) ;
  - la liste des projets récents.

  C'est ce stockage que l'audit de sécurité a signalé comme le point sensible : il contient le texte complet des entretiens et il est partagé entre toutes les pages ouvertes depuis l'ordinateur (`file://`) dans Chrome.

### Les dialogues

- Une fonction générique `dialog()` affiche toutes les fenêtres modales et renvoie le bouton cliqué.
- Les fenêtres sont : `importDialog` (fichiers, texte collé, projet QDA-md), `speakersDialog`, `ficheDialog` (dont le code du document), `showExtracts`, `codeMemoDialog`, `journalDialog`, `lockDialog`, `compareDialog` (trois onglets : fusion, kappa, consensus), `teacherDialog`, `backupsDialog` et `helpDialog`.
- Elles construisent leur contenu à partir des fonctions du noyau. Par exemple, l'onglet kappa n'est qu'une mise en tableau du résultat de `agreement()`, et l'aperçu de l'import d'un projet est une fusion faite sur une copie (`snapshot`).
- `readProjectFiles()` lit, pour l'onglet « Projet QDA-md », un dossier choisi (fichiers avec leur chemin `webkitRelativePath`), une archive `.zip` ou un fichier `.qda.md`.
- `speakerSetupHTML()` et `bindSpeakerSetup()` forment le bloc « Locuteurs » commun à l'import et au dialogue Locuteurs : choix du mode, noms repérés, pseudo, caractéristiques.

### Le menu « Afficher »

`S.view` vaut `''` (tous les codeurs), `'__me'` (l'identifiant courant, pour le codage à l'aveugle) ou le nom d'un codeur. `mineFilter()` traduit ce choix en un codeur à afficher, et toutes les fonctions d'affichage (texte, étiquettes, compteurs de l'arbre, avancement des documents, extraits) s'y réfèrent. `renderView()` remplit le menu avec les codeurs présents dans le projet. Le nombre de codeurs (`S.nCoders`, recalculé à chaque modification par `countCoders()`) décide si le nom du codeur s'affiche sur les étiquettes.

### Les données gardées par le navigateur

Le réglage « Effacer les données de ce navigateur quand on ferme adoq QDA ? » est la seule clé gardée en mode « Oui » (`qdaE.private` dans `localStorage`).

- `isPrivate()` est consulté par `persistWork()`, `backup()`, `addRecent()` et `ls.set()` : en mode « Oui », rien n'est écrit dans le navigateur.
- `wipeBrowserData()` ferme la base IndexedDB, la supprime (`deleteDatabase`) et retire les clés `qdaE.*` de `localStorage` (`clearLocalKeys()`). Elle est appelée quand on passe à « Oui », par le bouton « Effacer maintenant », et au démarrage en mode « Oui » pour supprimer d'éventuels restes.
- À la fermeture de l'onglet (`pagehide`), en mode « Oui », les clés sont retirées et la suppression de la base est relancée.
- `privacyHTML()` et `bindPrivacy()` affichent et gèrent le choix, sur l'accueil et dans « Sauvegardes et données du navigateur ».

### Le verrou

`lockDialog()` enregistre dans l'en-tête `verrou: oui`, ou l'empreinte du code de déverrouillage : SHA-256 (`sha256:…`), ou, si le navigateur refuse le calcul, une empreinte de secours (`fnv:…`). L'interface consulte `locked()` pour masquer les actions sur l'arbre et l'option de création dans la fenêtre de codage.

### Noms internes

Le logiciel s'est appelé QDA-md Étude jusqu'à la 0.2.2. Quelques identifiants internes gardent l'ancien nom, pour que les sauvegardes et les codes de verrou déjà créés restent valables : la base IndexedDB `qda-md-etude`, les clés `qdaE.*` de `localStorage` et le préfixe de l'empreinte du verrou.

Le logo est un SVG écrit directement dans `index.html` (en-tête) et dans `renderHome()` (accueil). L'icône d'onglet est le même dessin, encodé en `data:` URI dans une balise `<link rel="icon">`. Aucune image externe n'est chargée.

### Les tests

- `tests/test-core.js` (Node) teste le noyau sur des projets construits en mémoire et sur le projet d'exemple de la spécification : aller-retour, découpage et réunion à l'octet près, conservation de l'inconnu, anciens formats, détection des locuteurs, recalage des citations, fusion, kappa, consensus, exports, et un corpus de 30 entretiens × 35 pages.
- `tests/test-ui.py` pilote un vrai Chrome avec Playwright. Il simule des sélections de texte, des clics, du glisser-déposer, des imports de fichiers et de dossiers, et vérifie après chaque action le contenu du fichier projet produit.
- Le même script teste la version sans enregistrement automatique (comme Firefox et Safari) en désactivant l'API correspondante.

---

## 7. Performances mesurées

### Méthode

Le script `tools/bench.py` génère des corpus de taille croissante et chronomètre les opérations dans Chrome (mesures du 20 novembre 2026, sur serveur).

- Chaque entretien fait 35 pages, soit environ 280 paragraphes et 1 100 lignes.
- Un tiers des paragraphes est codé, par deux codeurs ; l'arbre compte 20 codes.
- Les opérations chronométrées sont l'ouverture, le changement de document, un codage, une annulation, l'enregistrement et le kappa.

### Plusieurs entretiens

| Corpus | Lignes (env.) | Taille | Ouvrir | Changer de document | Coder | Annuler | Mémoire |
|---|---|---|---|---|---|---|---|
| 30 entretiens | 33 000 | 2,6 Mo | 0,2 s | 0,02 s | 0,01 s | 0,08 s | 50 Mo |
| 100 entretiens | 110 000 | 9 Mo | 0,5 s | 0,03 s | 0,04 s | 0,06 s | 150 Mo |
| 300 entretiens | 330 000 | 26 Mo | 0,8 s | 0,06 s | 0,1 s | 0,08 s | 320 Mo |
| 600 entretiens | 660 000 | 53 Mo | 1,8 s | 0,09 s | 0,2 s | 0,2 s | 810 Mo |

Lecture :

- **Jusqu'à environ 100 entretiens** (un peu plus de 100 000 lignes), tout est instantané. Un mémoire avec 30 entretiens de 35 pages est très loin de la limite.
- **De 100 à 300 entretiens**, ça reste fluide, avec un léger délai au codage. Il faut surtout surveiller l'enregistrement automatique : l'app réécrit le fichier entier à chaque modification, ce qui à 25 Mo charge la synchronisation OneDrive.
- **Au-delà de 500 entretiens**, ça devient lourd : près d'un quart de seconde par codage et 800 Mo de mémoire. C'est utilisable sur une bonne machine, pénible sur un ordinateur portable d'étudiant.

Ces mesures datent de la 0.2.2. Le format qda.md (0.4) n'a pas changé l'ordre de grandeur : le test du corpus de 30 entretiens × 35 pages (3,7 Mo) s'écrit en environ 20 ms et se lit en environ 0,1 s sous Node.

### Un seul long document

L'app n'affiche qu'un document à la fois : un très long document pèse donc plus lourd que beaucoup de petits.

| Un seul document de… | Lire le fichier | Ouvrir au total | Afficher le document |
|---|---|---|---|
| 350 pages | 0,03 s | 0,2 s | 0,1 s |
| 1 000 pages | 0,07 s | 0,4 s | 0,4 s |
| 3 000 pages | 0,2 s | 1 s | 0,9 s |

Il reste préférable de découper un gros corpus en plusieurs documents (un par entretien) plutôt que de le coller d'un bloc : l'affichage d'un document de 3 000 pages prend près d'une seconde.

Jusqu'à la 0.2.1, la lecture du document de 3 000 pages prenait 5,4 secondes : chaque nouveau paragraphe était comparé à tous les précédents pour repérer les étiquettes en double, un coût qui croît avec le carré du nombre de paragraphes. Les identifiants déjà vus sont maintenant gardés dans un ensemble (`Set`), et un test vérifie que 24 000 paragraphes se lisent en moins de 1,5 seconde sous Node (environ 0,1 seconde en pratique).

### Limites des mesures

- Elles ont été faites sur un serveur, avec Chrome. Sur un portable d'étudiant d'entrée de gamme, compte deux à trois fois plus lent.
- Firefox et Safari n'ont pas été mesurés.
- Les corpus sont générés (texte répétitif, codage régulier). Avec de vrais entretiens, plus riches en codes et en chevauchements, le texte surligné d'un document s'affiche un peu plus lentement, mais pas dans des proportions différentes.
