# adoq QDA user manual

The user manual is written in French, for students and teachers. It is built with [MkDocs](https://www.mkdocs.org) and the Read the Docs theme.

| Path | Content |
|---|---|
| `mkdocs.yml` | Site configuration and page order |
| `docs/` | Pages (Markdown), screenshots (`docs/img/`) and styles (`docs/extra.css`) |
| `overrides/` | Theme override: logo, name and subtitle in the sidebar, favicon |
| `build_manual.py` | Copies the latest `dist/adoq-QDA-<version>.html` into the site, then builds `site/` and `build/manuel-adoq-QDA.md` |
| `shots.py` | Takes the screenshots of the app used in the manual |
| `make_md.py` | Assembles all pages into a single Markdown file |
| `check.py` | Checks internal links and takes screenshots of the built site |

## Building

From the repository root:

```bash
pip install -r requirements-dev.txt
python build.py                        # the app must be built first
python manual/build_manual.py          # add --shots to refresh the screenshots
```

The site is written to `manual/site/`. It works from any folder (`use_directory_urls: false`), so it can be copied as is onto any web server, for example into a `…/app/QDA-MD-Student/` folder of a personal website.

The single-file Markdown version is written to `manual/build/manuel-adoq-QDA.md`, and is also included in the site.

## Publishing on GitHub Pages

The site can be published from another repository, for example a personal one, while the code stays here:

1. Build the site as above.
2. Copy the content of `manual/site/` to the root of the publishing repository (or to its `docs/` folder).
3. In that repository's settings, enable GitHub Pages from the corresponding branch and folder.

Alternatively, `mkdocs gh-deploy --config-file manual/mkdocs.yml --remote-name <remote>` pushes the site to the `gh-pages` branch of the given remote. Before running it, copy the app file into `manual/docs/` with `build_manual.py`.
