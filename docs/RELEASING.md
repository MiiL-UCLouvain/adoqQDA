# Release checklist

1. **Version number.** Update `const VERSION` in `src/core.js`. The output file name follows it.
2. **Changelogs.** Add an entry to `CHANGELOG.md` (English) and `docs/CHANGELOG.fr.md` (French).
3. **Build and test.**
   ```bash
   python build.py
   node tests/test-core.js
   python tests/test-ui.py
   ```
   All tests must pass. `build.py` prints the SHA-256 checksum of the file.
4. **Manual.** Update the version in `manual/mkdocs.yml` (`copyright`), `manual/docs/index.md` (download button and version note) and `manual/docs/demarrer/installer.md`. Update the pages affected by the changes. Then:
   ```bash
   python manual/build_manual.py --shots    # --shots refreshes the screenshots
   python manual/check.py                   # optional: checks internal links
   ```
   `build_manual.py` refuses to build if a page still mentions another version.
5. **Commit and tag** the release: `git tag v<version>`.
6. **Release.** Create a release from the tag. Attach `dist/adoq-QDA-<version>.html`, and paste the changelog entry and the SHA-256 checksum into the release notes.
7. **Publish the manual** (see `manual/README.md`), so that its download button points to the new version.
