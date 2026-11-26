# Changelog

All notable changes to adoq QDA are listed here, newest first. A more detailed changelog, in French, is kept in [`docs/CHANGELOG.fr.md`](docs/CHANGELOG.fr.md).

Version numbers follow the pattern `major.minor.patch`. Each release is a single file, `adoq-QDA-<version>.html`.

## 0.4.3 — 2026-11-26
### Changed
- The shared file format is now called the **qda.md format (version 1)** instead of "QDA 1". Files do not change: the header key remains `qda-format: 1`.

## 0.4.2 — 2026-11-26
### Added
- **Code origin**: each code can be marked as *inductive* (it emerged from the data) or *deductive* (it comes from theory), with an optional reference. It is shown as an **I** or **D** badge in the code tree, logged in the journal, included in the codebook export, and stored under the code (`origine::`, `theorie::`) as in QDA-md.
- Merging a copy fills in the missing fields of existing codes without overwriting them.

## 0.4.1 — 2026-11-25
### Changed
- Code clean-up with no functional change: dead code removed, duplicates merged, stylesheet reorganised, technical documentation rewritten. Outputs and screenshots were checked to be identical before and after.

## 0.4 — 2026-11-25
### Added
- **qda.md format (version 1)**, shared with QDA-md: stable document codes (`E01`) and paragraph identifiers (`E01-004`), speakers as `locuteur::` fields, unknown content preserved, byte-identical round trip.
- Export of the project as a folder (`arbre.md` + one file per document), as a `.zip`.
- Import of a QDA-md project (folder, `.zip` or `.qda.md`) into the open project, including QDA-md 0.9.1 projects.
- Editable document code; paragraph memos; Iramuteq variables kept in a `variables::` field.
### Changed
- Projects created with earlier versions are converted when opened, after confirmation; a copy of the original file is kept.
- CSV exports: cells starting with `=`, `+`, `-` or `@` are prefixed with an apostrophe (formula injection protection).
### Compatibility
- Versions earlier than 0.4 must not open a project in the qda.md format.

## 0.3.1 — 2026-11-23
### Added
- Logo (a small fish whose scales are highlighted lines of text), in the app, the browser tab and the manual.
### Changed
- The user manual is renamed adoq QDA and no longer compares the tool to commercial software.

## 0.3 — 2026-11-23
### Changed
- The software is renamed **adoq QDA** (*Analyse de données qualitatives*), formerly *QDA-md Étude*. Internal identifiers keep the old name so that existing projects and backups remain readable.
### Fixed
- The top bar was too tall when the coder field was empty.

## 0.2.2 — 2026-11-20
### Added
- Option to erase the app's browser data when the tab is closed (for shared computers), and a button to erase it at any time.
- "Afficher" menu: show all coders, only your own coding, or any coder (including `@consensus`).
### Fixed
- Reading a very long document took a time that grew with the square of its number of paragraphs (3,000 pages: 5.4 s → 0.2 s).

## 0.2.1 — 2026-11-20
### Added
- Transcription rule: only the interviewer's turns are prefixed with a name; unprefixed paragraphs belong to the respondent, whose pseudonym is asked at import.
- Speaker attributes (age, gender, occupation, free fields), carried into the exports.

## 0.2 — 2026-11-20
### Added
- Speakers (questions and answers, focus groups), interview records, code memos, code-tree journal, code-tree lock, consensus coding, teacher view, speakers × codes matrix.

## 0.1 — 2026-11-20
### Added
- First version: single HTML file, one `.qda.md` file per project, import of `.txt`, `.docx` and Iramuteq corpora, coding with multiple and overlapping codes, code tree, extracts, merging of copies, Cohen's kappa, CSV exports, automatic saving (Chrome, Edge), backups in the browser.
