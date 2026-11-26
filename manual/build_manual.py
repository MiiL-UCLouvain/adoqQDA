"""Build the user manual (MkDocs site + single Markdown file).

Usage, from the repository root:
    python build.py                      # builds dist/adoq-QDA-<version>.html
    python manual/build_manual.py        # builds manual/site/ and manual/build/manuel-adoq-QDA.md
    python manual/build_manual.py --shots   # also refreshes the screenshots in manual/docs/img/

The app file is copied into the site so that the manual's download button works.
"""
import re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
apps = sorted((ROOT / "dist").glob("adoq-QDA-*.html"), key=lambda f: f.stat().st_mtime)
if not apps:
    sys.exit("No dist/adoq-QDA-<version>.html: run `python build.py` first.")
app = apps[-1]
version = re.search(r"adoq-QDA-(.+)\.html$", app.name).group(1)

# the manual must point to the version being published
for page in ["docs/index.md", "docs/demarrer/installer.md", "mkdocs.yml"]:
    text = (HERE / page).read_text(encoding="utf-8")
    found = set(re.findall(r"adoq-QDA-([\d.]+)\.html|adoq QDA ([\d.]+)", text))
    stale = {a or b for a, b in found} - {version}
    if stale:
        sys.exit(f"{page} still mentions version {', '.join(sorted(stale))} (app is {version}): update it first.")

for old in (HERE / "docs").glob("adoq-QDA-*.html"):
    old.unlink()
shutil.copy(app, HERE / "docs" / app.name)
if "--shots" in sys.argv:
    subprocess.run([sys.executable, str(HERE / "shots.py")], check=True, cwd=HERE)
subprocess.run([sys.executable, "-m", "mkdocs", "build", "--clean", "-q"], check=True, cwd=HERE)
subprocess.run([sys.executable, str(HERE / "make_md.py")], check=True, cwd=HERE)
print(f"Manual for adoq QDA {version} built in {HERE / 'site'}")
