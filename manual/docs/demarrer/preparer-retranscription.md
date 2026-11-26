# Préparer ses retranscriptions

Un peu de rigueur dans la retranscription fait gagner beaucoup de temps à l’import.

## Formats acceptés

- **Word (`.docx`)** et **texte brut (`.txt`)**, en UTF-8 ou en encodage Windows ;
- du **texte collé** directement dans la fenêtre d’import ;
- le format **Iramuteq** (`**** *ID_…`).

Les formats `.doc`, `.odt` et `.pdf` ne sont pas lus : enregistrez votre fichier en `.docx` ou `.txt`.

## Un paragraphe par prise de parole

Chaque **paragraphe** devient une **unité de codage**. Séparez les prises de parole par une **ligne vide** (dans Word : un simple retour à la ligne suffit, chaque paragraphe Word devient un paragraphe).

## La règle des locuteurs

Pour un **entretien individuel**, ne nommez que l’intervieweur·euse : **chaque question commence par son prénom suivi de deux-points**. Les réponses ne portent aucune mention.

```text
Zoé : Comment vous informez-vous en général ?

Surtout par la radio, le matin, dans la voiture.

Le soir, je regarde parfois le JT avec mes parents.

Zoé : Et les réseaux sociaux ?

Très peu. Je m’en méfie.
```

À l’import, l’application repère « Zoé », la classe comme **intervieweuse**, retire son nom du texte et **vous demande le pseudo de la personne interviewée** : tous les paragraphes sans nom lui sont attribués.

Pour un **focus group**, commencez **chaque prise de parole** par le pseudo de la personne qui parle :

```text
Animatrice : D’où vient l’info que vous voyez passer ?

Inès : De TikTok, surtout.

Hugo : Pareil, mais je vérifie sur le site de la RTBF.
```

Un paragraphe sans nom prolonge alors la prise de parole précédente.

!!! tip "Variantes reconnues"
    `Zoé :`, `[Zoé]`, `Q.`, `R.`, et un horodatage avant le nom (`[00:12:33] Zoé : …`). Les variantes d’écriture (`Int.`, `INT`) sont regroupées. Un « Zoé : » au milieu d’un paragraphe n’est pas pris pour un changement de locuteur.

## Anonymiser avant d’importer

Remplacez les noms réels par des **pseudos** dans la retranscription elle-même, ainsi que les lieux ou détails qui permettraient d’identifier une personne. Le texte n’est plus modifiable une fois importé : **relisez votre retranscription avant**.
