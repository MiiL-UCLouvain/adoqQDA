<p align="center">
  <img src="logo/adoq-logo.svg" alt="" width="140">
</p>

<h1 align="center">adoq QDA</h1>

<p align="center"><b>Analyse de données qualitatives</b> — a qualitative data analysis tool for learning and teaching interview coding</p>

<p align="center">
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="#user-manual">User manual (French)</a> ·
  <a href="#the-qdamd-file-format">qda.md format</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="SECURITY.md">Security</a>
</p>

---

adoq QDA is a small qualitative coding tool designed for **students and teachers**. Students import their interview transcripts, highlight passages, assign codes, organise the codes into a tree, and compare their coding with a classmate's. Teachers can collect a whole group's projects and review them side by side.

The whole application is **a single HTML file** (about 230 KB). There is nothing to install and no server to run: you double-click the file and it opens in your browser. The app makes no network requests, and the interview data never leaves the computer.

Projects are stored in the **qda.md format**: plain Markdown files that a person can read, that open in [Obsidian](https://obsidian.md), and that are shared with QDA-md, the research version of the tool.

> **Language.** The user interface and the user manual are in French. This README and the contributor documentation are in English.

## Intended use

adoq QDA is optimised for learning and teaching. It takes a few minutes to get started, fits in one file, and helps teachers follow a group's work. It is probably robust enough for a sizeable corpus (several hundred interviews open in a few seconds), but it is **not recommended for large corpora analysed by professional research teams**. Such teams need features the tool deliberately leaves out: simultaneous work on the same project, access rights, audio and video coding, and advanced queries.

## How to cite

If you use adoq QDA or the qda.md format in your work, please cite the  MiiL working paper presenting the qda.md open format: 

Lits, G. (2026). _qda.md: An open, readable and durable format for coded qualitative
data_ (Working paper, version 1). UCLouvain, Media Innovation and Intelligibility Lab. https://github.com/MiiL-UCLouvain/qdamd-format/blob/main/paper/fr/qdamd-working-paper.pdf

## Features

**Data**
- Import `.txt` (UTF-8 or Windows encoding), `.docx` (read without any library), pasted text, and Iramuteq corpora (`**** *ID_…`).
- Speaker detection: interviewer questions vs. answers, focus groups with several participants. Each speaker can have attributes (age, gender, occupation…).
- An interview record for each document: date, pseudonym, interviewer, place, and free fields.

**Coding**
- Select a passage, pick or create a code. A passage can carry several codes, and coded passages can overlap.
- Code tree: create, rename, define, nest, merge, delete; drag and drop to reorganise.
- Code definitions and code memos; document and paragraph memos.
- Each code can be marked as **inductive** (it emerged from the data) or **deductive** (it comes from theory), with an optional reference.
- An automatic journal of changes to the code tree (creation, merge, move…), with optional reasons.
- The code tree can be locked once the codebook is final.
- Unlimited undo and redo.

**Working together**
- Blind coding: show only your own coding, or any one coder's.
- Merging a classmate's copy of the project (it only adds, never removes).
- Inter-coder agreement: Cohen's kappa per code, at paragraph level, with the list of disagreements.
- Consensus coding: keep or discard each point proposed by either coder; the result is signed `@consensus`.
- Teacher view: one table per student (coverage, codes, kappa against a reference coding), and a merged group project.

**Output**
- Extracts by code (with or without sub-codes), exported as Markdown.
- CSV exports for spreadsheets or SPSS: coded segments, documents × codes matrix, speakers × codes matrix.
- Codebook export.
- Export of the project as a folder: one file per interview (`.zip`), ready for QDA-md or Obsidian.
- Import of a QDA-md project (folder, `.zip` or `.qda.md`) into the open project.

**Saving and privacy**
- Chrome and Edge: the project is saved automatically to the chosen file (File System Access API).
- Firefox and Safari: the project is saved by downloading the file (Save button or Ctrl+S).
- Safety nets in the browser: recovery of unsaved work and the 20 most recent automatic backups for each project.
- On shared computers, the browser can be set to keep nothing and to erase the app's data when the tab is closed.

## Getting started

1. Download `adoq-QDA-0.4.3.html` from the [Releases](https://gregoirelits.eu/app/adoqQDA/)) page.
2. Double-click it. It opens in your browser.
3. Click **Projet d'exemple** for a guided tour, or **Nouveau projet** to start.

Chrome or Edge is recommended, because projects are then saved automatically. To update, download the new version: projects from earlier versions open in it and are converted if needed.

## User manual

The user manual is in French and is published as a separate website:

https://gregoirelits.eu/app/adoqQDA/ **MANUAL-URL**

Its sources are in [`manual/`](manual/) (MkDocs). See [`manual/README.md`](manual/README.md) to build it or publish it elsewhere.

## The qda.md file format

A project is one `.qda.md` file. It holds, in order, a YAML header, the code tree, code memos, consensus decisions, the code-tree journal, and the documents:

```markdown
---
qda-format: 1
id: thesis-information-2026
titre: Rapport à l'information
---

# Arbre de codes

- Distrust of the media #distrust
  origine:: inductif
  > The respondent doubts the independence of journalists.

# Documents

## Interview with Julie
document:: E01

### E01-002
locuteur:: Julie

They are in the pocket of the politicians, that's obvious.

> [!codage]-
> - #distrust @zoe : « in the pocket of the politicians »
```

The format has a few key properties:
- **Coding never changes the text.** A coding line quotes the passage it codes (`[2]` designates the second occurrence of the same quote).
- **Stable identifiers.** Documents (`E01`), paragraphs (`E01-002`) and codes (`#distrust`) keep their identifier when they are renamed, which makes Obsidian links and merges reliable.
- **What a program does not understand is kept.** A file that is opened and saved without changes is identical, byte for byte.
- **One file or a folder.** The same project can be stored as a folder (`arbre.md` plus one file per document in `donnees/`). Splitting and joining lose nothing.

The format is shared with QDA-md and is specified in its own repository:

**https://github.com/MiiL-UCLouvain/qdamd-format FORMAT-REPOSITORY-URL**

The format keywords (`# Arbre de codes`, `document::`, `locuteur::`, `[!codage]`…) are in French. They are part of the format, not of the interface.

## Repository layout

| Path | Content |
|---|---|
| `src/index.html` | Page skeleton |
| `src/style.css` | Styles |
| `src/core.js` | **Core**: file format, import, analyses. No user interface; runs in Node and in the browser. |
| `src/app.js` | **User interface**: display, selection, saving, dialogs |
| `build.py` | Assembles the four files into `dist/adoq-QDA-<version>.html` and prints its SHA-256 |
| `tests/test-core.js` | Core tests (Node, no dependency) |
| `tests/test-ui.py` | User interface tests in Chrome (Playwright) |
| `tests/fixtures/` | Example project from the format specification, as one file and as a folder |
| `tools/bench.py` | Benchmarks on generated corpora of increasing size |
| `manual/` | User manual (French, MkDocs) |
| `logo/` | Logo and square icon (SVG) |
| `docs/architecture.fr.md` | Architecture, main functions, data model, benchmarks (French) |
| `docs/CHANGELOG.fr.md` | Detailed changelog (French) |
| `docs/RELEASING.md` | Release checklist |

## Building and testing

Requirements: Python 3.9+ and Node 18+. The UI tests and the manual also need the packages in `requirements-dev.txt`.

```bash
python build.py                       # writes dist/adoq-QDA-<version>.html
node tests/test-core.js               # core tests (no dependency)

pip install -r requirements-dev.txt
python -m playwright install chromium
python tests/test-ui.py               # user interface tests
python tools/bench.py                 # benchmarks
python manual/build_manual.py         # user manual (manual/site/)
```

The UI tests use Playwright's Chromium by default. To use an installed Chrome instead, set `CHROME_PATH` (for example `CHROME_PATH=/usr/bin/google-chrome`).

The architecture is described in [`docs/architecture.fr.md`](docs/architecture.fr.md). In short, `src/core.js` reads a project into plain JavaScript objects (`parseProject`), every change goes through a single function that records an undo snapshot (`mutate`), and the project is written back as text (`serializeProject`).

## Browser support

| Browser | Status |
|---|---|
| Chrome, Edge (desktop) | Recommended: automatic saving to the chosen file |
| Firefox, Safari (desktop) | Supported: saving by download (Ctrl+S) |
| Tablets and phones | Not supported: text selection is impractical on a touch screen |

## About this project

adoq QDA was developed by Grégoire Lits (UCLouvain, Institut Langage et Communication, Media Innovation and Intelligibility Lab - MiiL). 

Until version 0.2.2, the software was called *QDA-md Étude*. "adoq" comes from *analyse de données qualitatives*; QDA stands for *qualitative data analysis*.

## AI disclosure

adoq QDA was designed and written with intensive use of Claude Opus 5.5 (Anthropic), as part of an experiment on the use of a large language model in qualitative research and in the design of qualitative analysis software.

## License

adoq QDA is released under the European Union Public Licence v. 1.2 (EUPL-1.2). See [`LICENSE`](LICENSE).
