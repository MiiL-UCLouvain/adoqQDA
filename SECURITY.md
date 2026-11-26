# Security

adoq QDA handles interview transcripts, which are often personal data. Security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Contact the maintainer privately:

<!-- TODO: add a contact address -->
SECURITY-CONTACT

Include the version, the browser, and a minimal file or set of steps that shows the problem. You will receive an answer as soon as possible.

## Security model

- **No network.** The app makes no network requests and loads no external resource. It runs entirely in the browser, from a local file.
- **Limited file access.** The browser only gives the app access to the files the user chooses. The app cannot run programs or modify the system.
- **Untrusted project files.** A `.qda.md` file may come from someone else. Every piece of text read from a file is escaped before display, so a crafted file cannot run code in the app. This was checked during an audit (November 2026) on all display points.
- **CSV exports.** Cells that start with `=`, `+`, `-` or `@` are prefixed with an apostrophe, so that a spreadsheet does not run them as formulas.
- **Code-tree lock.** The lock is a teaching aid, not a protection: the file can still be edited by hand. Never use a real password as an unlock code.

## Data kept by the browser

To protect against lost work, the app keeps in the browser's storage (IndexedDB and localStorage) a copy of the work in progress, the 20 most recent backups of each project and the list of recent projects. This storage is **shared with other HTML files opened from the computer** in the same browser, and it remains on the computer after the tab is closed.

On a shared computer, or with sensitive data, answer **"Oui"** to *"Effacer les données de ce navigateur quand on ferme adoq QDA ?"* on the home screen. The app then writes nothing to the browser, and erases what was kept when the tab is closed. The button *"Effacer maintenant les données de ce navigateur"* erases the app's data at any time; it does not touch other websites' data or project files.

## Verifying a download

Each release lists the SHA-256 checksum of `adoq-QDA-<version>.html`. To check a downloaded file:

```bash
sha256sum adoq-QDA-<version>.html                      # Linux
shasum -a 256 adoq-QDA-<version>.html                  # macOS
certutil -hashfile adoq-QDA-<version>.html SHA256      # Windows
```

Teachers should distribute the file from the Releases page, or as a download, rather than letting students open it directly inside a learning platform.
