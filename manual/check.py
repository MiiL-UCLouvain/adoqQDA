import os
from pathlib import Path
from playwright.sync_api import sync_playwright
site = (Path(__file__).resolve().parent / "site")
(Path(__file__).resolve().parent / "build").mkdir(exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    pg = b.new_page(viewport={"width":1280,"height":900})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    for name, path in [("site-accueil","index.html"),("site-import","fonctions/importer.html"),("site-format","concepts/format.html")]:
        pg.goto((site/path).as_uri()); pg.wait_for_timeout(400)
        pg.screenshot(path=str(Path(__file__).resolve().parent / "build" / f"{name}.png"))
    # liens internes cassés ?
    bad=[]
    for html in site.rglob("*.html"):
        if html.name.startswith("adoq-QDA-"): continue
        pg.goto(html.as_uri())
        for href in pg.eval_on_selector_all("a[href]", "els => els.map(e => e.href)"):
            if href.startswith("file://"):
                f = Path(href.split("#")[0].replace("file://",""))
                if not f.exists(): bad.append((html.name, href))
    print("liens cassés:", bad[:10]); print("erreurs:", errs[:3])
    b.close()
