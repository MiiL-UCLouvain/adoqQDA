"""Assemble adoq QDA into a single HTML file: python build.py

Reads src/index.html, src/style.css, src/core.js and src/app.js, and writes
dist/adoq-QDA-<version>.html (the version is read from src/core.js).
Prints the SHA-256 checksum to publish next to the download link.
"""
import hashlib, re
from pathlib import Path

root = Path(__file__).parent
src = root / "src"
html = (src / "index.html").read_text(encoding="utf-8")
parts = {
    "/*CSS*/": (src / "style.css").read_text(encoding="utf-8"),
    "/*CORE*/": (src / "core.js").read_text(encoding="utf-8"),
    "/*APP*/": (src / "app.js").read_text(encoding="utf-8"),
}
for key, text in parts.items():
    assert "</script" not in text.lower(), key
    html = html.replace(key, text, 1)
version = re.search(r"const VERSION = '([^']+)'", parts["/*CORE*/"]).group(1)
out = root / "dist" / f"adoq-QDA-{version}.html"
out.parent.mkdir(exist_ok=True)
out.write_bytes(html.encode("utf-8"))
print(out, f"{out.stat().st_size / 1024:.0f} KB")
print("SHA-256:", hashlib.sha256(out.read_bytes()).hexdigest())
