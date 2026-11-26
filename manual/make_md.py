"""Assemble les pages du manuel en un seul fichier Markdown."""
import re, yaml
from pathlib import Path
HERE = Path(__file__).resolve().parent
cfg = yaml.safe_load(open(HERE / 'mkdocs.yml', encoding='utf-8'))
version = re.search(r'(\d+\.\d+(?:\.\d+)?)', cfg['copyright']).group(1)
pages = []
def walk(n):
    for item in n:
        for k, v in item.items():
            walk(v) if isinstance(v, list) else pages.append(v)
walk(cfg['nav'])
out = [f"# Manuel d’adoq QDA {version}", "", "_Version Markdown complète du manuel. La version en ligne contient les mêmes pages._", ""]
for p in pages:
    t = (HERE / 'docs' / p).read_text(encoding='utf-8')
    t = re.sub(r'\]\((?:\.\./)*img/', '](img/', t)
    t = re.sub(r'\{[^}]*download[^}]*\}', '', t)
    t = re.sub(r'\[([^\]]+)\]\((?!http)(?:\.\./)*[\w/-]+\.md(?:#[^)]*)?\)', r'\1', t)
    t = re.sub(r'\]\((?:\.\./)+(adoq-QDA[\w.-]*\.html)\)', r'](\1)', t)
    def adm(m):
        kind, title, body = m.group(1), m.group(2), m.group(3)
        label = title or {'note': 'Note', 'info': 'Information', 'tip': 'Conseil', 'warning': 'Attention'}.get(kind, kind)
        lines = [l[4:] if l.startswith('    ') else l for l in body.rstrip('\n').split('\n')]
        return '> **' + label + '** — ' + '\n> '.join(lines) + '\n'
    t = re.sub(r'^!!! (\w+)(?: "([^"]*)")?\n((?:    .*\n?)+)', adm, t, flags=re.M)
    t = re.sub(r'^(#{1,5}) ', lambda m: '#' + m.group(1) + ' ', t, flags=re.M)
    out += [t.strip(), '\n---\n']
md = '\n\n'.join(out)
parts = md.split('```')
for i in range(1, len(parts), 2):
    parts[i] = re.sub(r'^#(#{1,5}) ', r'\1 ', parts[i], flags=re.M)
md = '```'.join(parts)
(HERE / 'build').mkdir(exist_ok=True)
for dest in (HERE / 'site' / 'manuel-adoq-QDA.md', HERE / 'build' / 'manuel-adoq-QDA.md'):
    dest.write_text(md, encoding='utf-8')
print(len(md.split()), 'mots')
