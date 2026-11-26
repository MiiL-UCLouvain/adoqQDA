# Le fichier projet `.qda.md`

Un projet est un **simple fichier texte** au format Markdown. On peut l’ouvrir dans le Bloc-notes, TextEdit, VS Code ou Obsidian pour voir comment le codage est noté. L’application le relit et l’écrit ; un humain peut le lire, et même le corriger à la main.

Le format s’appelle **qda.md**, version 1 : sa version est indiquée en tête du fichier (`qda-format: 1`). Il est commun à adoq QDA et à **QDA-md**, la version de recherche : un projet passe de l’un à l’autre sans conversion.

```markdown
---
qda-format: 1
id: memoire-info-2026
titre: Mémoire — rapport à l’information
---

# Arbre de codes

- Méfiance envers les médias #mefiance
  > Le répondant met en doute l’indépendance des journalistes.
  - Dépendance au politique #dependance-politique

# Documents

## Entretien avec Julie
document:: E01

> [!meta]- Fiche de l'entretien
> date:: 2026-02-14
> lieu:: Bruxelles

> [!locuteurs]- Locuteurs
> - Zoé :: intervieweur
> - Julie :: répondant :: âge: 24 ; genre: F

### E01-002
locuteur:: Julie

Ils sont à la solde des politiciens, c’est évident.

> [!codage]-
> - #dependance-politique @zoe : « à la solde des politiciens »
```

## Ce qu’il faut savoir

- **Le texte des entretiens n’est jamais modifié** par le codage. Chaque codage cite le passage codé ; `[2]` désigne la deuxième occurrence d’une même citation ; `(paragraphe entier)` code tout le paragraphe.
- **Chaque document a un code** (`E01`, `FG1`), modifiable dans **ⓘ Fiche**, et **chaque paragraphe un identifiant stable** (`E01-002`). Renommer un document ou un locuteur ne change pas ces identifiants : un lien Obsidian comme `[[mon-projet.qda#E01-002]]` reste valable.
- **Chaque code a un identifiant** (`#mefiance`) qui ne change pas quand on le renomme. Sous la ligne du code peuvent venir des champs, comme son origine (`origine:: inductif` ou `origine:: deductif`, et `theorie::`), puis sa définition (lignes `>`).
- Chaque paragraphe tient sur **une seule ligne**. Une ligne qui pourrait être lue comme autre chose que du texte (elle commence par `-`, `#`, `1.`…) est précédée d’une barre oblique inverse `\`, retirée à la lecture.
- D’autres sections apparaissent au besoin : `# Mémos des codes`, `# Décisions de consensus`, `# Journal de l'arbre de codes`. Un paragraphe peut aussi porter un mémo (`> [!memo]-`), affiché sous son texte.
- Une citation qui ne se retrouve plus dans le texte est signalée **⚠** mais jamais perdue ; une ligne illisible est conservée telle quelle. Ce que le logiciel ne connaît pas (un champ, un encadré, une section ajoutés par QDA-md ou à la main) est **recopié à l’identique**.

## Un fichier ou un dossier

Par défaut, adoq QDA travaille sur **un seul fichier** `.qda.md`. Le même projet peut aussi prendre la forme d’un **dossier**, celle qu’utilise QDA-md :

```
mon-projet/
  arbre.md          ← l’en-tête et les sections du projet
  donnees/
    E01.md          ← un fichier par entretien
    E02.md
    FG1.md
```

- **Exporter › Projet en dossier** télécharge ce dossier dans une archive `.zip`.
- **Importer › Projet QDA-md** fait le chemin inverse : il lit un dossier, une archive `.zip` ou un autre fichier `.qda.md`, et ajoute son contenu au projet ouvert.

Le passage de l’un à l’autre ne perd rien : découper un fichier en dossier puis le réunir redonne le même fichier.

## Projets créés avec une version antérieure

Un projet créé avec QDA-md Étude ou adoq QDA 0.3 (en-tête `qda-md-etude: 2`) est **converti à l’ouverture**, après confirmation : chaque document reçoit un code (`D01`, `D02`…) et chaque paragraphe un identifiant (`D01-004`). Le texte et le codage ne changent pas. Une copie de l’ancien fichier est gardée dans les sauvegardes du navigateur, et peut être téléchargée.

!!! warning "Après la conversion"
    N’ouvrez plus le projet avec adoq QDA 0.3 ou une version antérieure : elles ne comprennent pas le format qda.md et abîmeraient le fichier en l’enregistrant.

Les projets de **QDA-md 0.9** (version de recherche, ancien format) s’importent aussi par **Importer › Projet QDA-md**. Les notes placées sous les codes de leur arbre deviennent des **mémos** de codes ; leur définition reste à écrire.

## Glossaire

Code
:   Étiquette appliquée à un passage pour signaler qu’il relève d’un thème, d’une catégorie ou d’un concept.

Arbre de codes (livre de codes)
:   L’ensemble organisé des codes, avec leurs définitions.

Segment, codage
:   Un passage précis auquel un ou plusieurs codes ont été appliqués, par un codeur donné.

Locuteur
:   La personne qui prend la parole dans un paragraphe ; son rôle est intervieweur·euse, répondant·e, participant·e (focus group) ou autre.

Code du document, identifiant de paragraphe
:   Repères stables du format qda.md (`E01`, `E01-004`), qui ne dépendent ni du titre ni de la position.

Kappa de Cohen
:   Mesure de l’accord entre deux codeurs, corrigée de l’accord attendu par le hasard (1 = accord parfait, 0 = pas mieux que le hasard).

Consensus
:   Codage commun construit en tranchant les désaccords entre deux codeurs, signé `@consensus`.
