# Contributing to adoq QDA

Thank you for your interest. Bug reports, suggestions and pull requests are welcome.

## Reporting a bug

Please open an issue with:
- the version (shown on the home screen and in the file name, `adoq-QDA-<version>.html`);
- your browser and operating system;
- what you did, what you expected, and what happened;
- if possible, a small `.qda.md` file that shows the problem. **Never attach real interview data**: replace it with invented text.

For security problems, follow [`SECURITY.md`](SECURITY.md) instead of opening a public issue.

## Principles

These choices are deliberate. A change that breaks one of them is unlikely to be accepted.

1. **One self-contained HTML file.** No build tool beyond `build.py`, no framework, no external library, no CDN. Everything the app needs is in the file.
2. **No network access.** The app never sends or loads anything. Interview data stays on the computer.
3. **The file is the source of truth.** Projects follow the [qda.md format](README.md#the-qdamd-file-format). Reading is tolerant, writing is strict, and anything the app does not understand is kept. A file that is opened and saved without changes must stay byte-identical.
4. **Coding never modifies the text** of the interviews.
5. **Simple for students.** New features must not make the first steps harder. Advanced research features belong in QDA-md.

## Code organisation

- `src/core.js` contains everything that does not touch the page: file format, import, analyses. It runs in Node, so it can be tested without a browser. Keep it free of DOM code.
- `src/app.js` contains the user interface. Every change to the project must go through `mutate(fn)`, which records the undo snapshot, marks the project as modified and redraws the screen.
- Text coming from a file must always go through `esc()` before being inserted into the page.

See [`docs/architecture.fr.md`](docs/architecture.fr.md) for details (in French).

## Before submitting a pull request

```bash
python build.py
node tests/test-core.js
python tests/test-ui.py        # needs requirements-dev.txt and a Chromium browser
```

- Add tests for any new behaviour: in `tests/test-core.js` for the core, in `tests/test-ui.py` for the interface.
- If the change affects what users see, update the manual in `manual/docs/` (in French).
- Add an entry to `CHANGELOG.md` (English) and `docs/CHANGELOG.fr.md` (French).
- A change to the file format must first be agreed in the format repository, because QDA-md reads the same files.

## Language

- Code, comments and commit messages may be in English or French. Most existing comments are in French.
- The user interface and the user manual are in French. An English interface is a possible future addition; it would need a translation layer rather than duplicated code.
