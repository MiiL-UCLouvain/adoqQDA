/* adoq QDA — noyau : format du fichier projet, import, analyses.
   Sans dépendance ; fonctionne dans le navigateur et sous Node (tests). */
const QDA = (() => {
  const VERSION = '0.4.3';
  const ROLE_I = 'intervieweur', ROLE_R = 'répondant';
  const CONSENSUS = 'consensus';
  const META_KEYS = ['date', 'pseudo', 'intervieweur', 'lieu'];
  const ATTR_KEYS = ['âge', 'genre', 'profession'];
  const DEFAULT_RESPONDENT = 'Répondant';
  /** « âge: 24 ; genre: F » → { âge: '24', genre: 'F' } */
  function parseAttrs(str) {
    const o = {};
    for (const part of String(str || '').split(/\s*;\s*/)) {
      const m = part.match(/^\s*([^:=]+?)\s*[:=]\s*(.*?)\s*$/);
      if (m && m[1] && m[2]) o[m[1]] = m[2];
    }
    return o;
  }
  const cleanKey = (k) => String(k).replace(/[;:=\n]/g, ',').replace(/\s+/g, ' ').trim();
  const cleanAttrs = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [cleanKey(k), String(v ?? '').replace(/[;\n]/g, ',').trim()]).filter(([k, v]) => k && v));
  const formatAttrs = (o) => Object.entries(o || {}).filter(([k, v]) => k && v).map(([k, v]) => `${String(k).replace(/[;:=\n]/g, ',').trim()}: ${String(v).replace(/[;\n]/g, ',')}`).join(' ; ');

  // ---------- utilitaires ----------
  const uid = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  };
  function slugify(label) {
    const s = String(label || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/['’]/g, '-')
      .replace(/[^a-z0-9_\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return s && /[a-z]/.test(s) ? s : 'code-' + (s || '1');
  }
  function cleanCoder(name) {
    return String(name || '').trim().replace(/^@/, '').replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_\-.]/gu, '');
  }
  const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const pad = (n) => String(n).padStart(2, '0');
  function stamp(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function guessRole(name) {
    const n = fold(name).replace(/\.$/, '');
    if (/^(q|e|i|int|enq|interv|anim|mod)$/.test(n)) return ROLE_I;
    if (/^(enquet|interv|interview|moder|anim|cherch|journalist|investig|question)/.test(n)) return ROLE_I;
    return ROLE_R;
  }
  const ROLES = [ROLE_I, ROLE_R, 'participant', 'autre'];
  const normRole = (r) => { const f = fold(r || ''); return /^(interv|enqu|anim|mod|q$)/.test(f) ? ROLE_I : /^partic/.test(f) ? 'participant' : /^autre/.test(f) ? 'autre' : ROLE_R; };

  // ---------- modèle ----------
  function newProject(titre) {
    return { meta: { id: uid(), titre: titre || 'Nouveau projet' }, tree: [], docs: [], journal: [], rejects: [], warnings: [], order: [], preamble: [] };
  }
  const newDoc = (name) => ({ name, code: '', fields: {}, memo: '', meta: {}, speakers: [], paras: [], extra: [] });
  function* walk(nodes, parent = null, depth = 0) {
    for (const n of nodes) {
      yield { node: n, parent, depth };
      yield* walk(n.children, n, depth + 1);
    }
  }
  const allCodes = (p) => [...walk(p.tree)].map((x) => x.node);
  const findCode = (p, id) => allCodes(p).find((n) => n.id === id) || null;
  function parentOf(p, id) {
    for (const x of walk(p.tree)) if (x.node.id === id) return x.parent;
    return null;
  }
  function siblingsOf(p, id) {
    const par = parentOf(p, id);
    return par ? par.children : p.tree;
  }
  const descendants = (node) => [...walk(node.children)].map((x) => x.node.id);
  function codePath(p, id) {
    const out = [];
    let n = findCode(p, id);
    while (n) { out.unshift(n.label); n = parentOf(p, n.id); }
    return out.join(' › ');
  }
  function uniqueCodeId(p, base) {
    const ids = new Set(allCodes(p).map((n) => n.id));
    let id = slugify(base), i = 2;
    const root = id;
    while (ids.has(id)) id = `${root}-${i++}`;
    return id;
  }
  // ---------- origine des codes (même champ que QDA-md : « origine:: inductif | deductif ») ----------
  const ORIGINS = ['inductif', 'deductif'];
  const originOf = (node) => { const v = fold((node.fields && node.fields.origine) || ''); return v.startsWith('induc') ? 'inductif' : v.startsWith('deduc') ? 'deductif' : ''; };
  /** Fixe l'origine d'un code (« inductif », « deductif » ou '' pour non précisée) et, au besoin, sa théorie de référence. */
  function setOrigin(node, origine, theorie = null) {
    node.fields = node.fields || {};
    if (origine && !ORIGINS.includes(origine)) throw new Error('Origine inconnue : ' + origine);
    if (origine) node.fields.origine = origine; else delete node.fields.origine;
    if (theorie !== null) { const t = String(theorie).replace(/\s+/g, ' ').trim(); if (t) node.fields.theorie = t; else delete node.fields.theorie; }
  }
  function addCode(p, label, parentId = null, def = '') {
    const node = { id: uniqueCodeId(p, label), label: String(label).trim(), def, memo: '', fields: {}, children: [] };
    const par = parentId ? findCode(p, parentId) : null;
    (par ? par.children : p.tree).push(node);
    return node;
  }
  const isLocked = (p) => !!(p.meta.verrou && p.meta.verrou !== 'non');
  const codeRef = (p, id) => { const n = findCode(p, id); return `« ${n ? n.label : id} » (#${id})`; };

  // ---------- journal de l'arbre ----------
  function logTree(p, type, desc, { coder = '', motif = '', date = null } = {}) {
    const e = { date: date || stamp(), coder: cleanCoder(coder), type, desc, motif };
    p.journal.push(e);
    return e;
  }
  const journalLine = (e) => `- ${e.date} · @${e.coder || '?'} · ${e.type} · ${e.desc}${e.motif ? ` · motif : ${e.motif.replace(/\n/g, ' ')}` : ''}`;
  function parseJournalLine(line) {
    const m = line.match(/^[-*]\s+(\d{4}-\d\d-\d\d(?: \d\d:\d\d)?)\s+·\s+@(\S*)\s+·\s+([^·]+?)\s+·\s+(.*)$/);
    if (!m) return null;
    let desc = m[4], motif = '';
    const mm = desc.match(/^(.*?)\s+·\s+motif : (.*)$/);
    if (mm) { desc = mm[1]; motif = mm[2]; }
    return { date: m[1], coder: m[2] === '?' ? '' : m[2], type: m[3].trim(), desc, motif };
  }

  // ---------- localisation des citations ----------
  function locate(text, quote, occ = 1) {
    if (!quote) return -1;
    let pos = -1;
    for (let i = 0; i < occ; i++) {
      pos = text.indexOf(quote, pos + 1);
      if (pos < 0) return -1;
    }
    return pos;
  }
  function occurrenceAt(text, quote, start) {
    let n = 0, pos = -1;
    while ((pos = text.indexOf(quote, pos + 1)) >= 0 && pos <= start) n++;
    return Math.max(n, 1);
  }
  function spans(para) {
    return para.codings.map((c, i) => {
      if (c.quote === null) return { i, start: 0, end: para.text.length, whole: true, coding: c };
      const s = locate(para.text, c.quote, c.occ);
      return s < 0 ? { i, orphan: true, coding: c } : { i, start: s, end: s + c.quote.length, coding: c };
    });
  }
  /** Retire [rs, re) du texte d'un paragraphe et recale les citations codées. */
  function cutText(para, rs, re) {
    const old = para.text;
    const neu = old.slice(0, rs) + old.slice(re);
    const len = re - rs;
    for (const c of para.codings) {
      if (c.quote === null) continue;
      const s = locate(old, c.quote, c.occ);
      if (s < 0) continue;
      let a = s, b = s + c.quote.length;
      const map = (x) => (x <= rs ? x : x >= re ? x - len : rs);
      a = map(a); b = map(b);
      let q = neu.slice(a, b);
      const lead = q.length - q.trimStart().length;
      q = q.trim();
      if (!q) continue; // la citation n'était que le préfixe : elle restera signalée comme introuvable
      c.quote = q;
      c.occ = occurrenceAt(neu, q, a + lead);
    }
    para.text = neu;
  }

  // ---------- lecture / écriture du fichier (format qda.md) ----------
  // Protection d'une ligne de texte (spéc. § 8.3) : un « \ » initial, retiré à la lecture (un seul).
  const ESC_RE = /^([#>\-+*=|`~<\[!^%\\]|\d+[.)])/;
  const escapeLine = (l) => (ESC_RE.test(l) ? '\\' + l : l);
  const unescapeLine = (l) => (l.startsWith('\\') ? l.slice(1) : l);
  // mémos des codes : seules les lignes qui commencent par « # » ou « \ » sont protégées
  const escapeMemo = (l) => (/^[#\\]/.test(l) ? '\\' + l : l);

  const DOC_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
  const RESERVED = /^(arbre|con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  function checkDocCode(p, code, doc = null) {
    if (!DOC_CODE_RE.test(code) || code.endsWith('.')) return 'Le code ne peut contenir que des lettres sans accent, des chiffres, « - », « _ » et « . » (64 caractères au plus).';
    if (RESERVED.test(code)) return `« ${code} » est un nom réservé.`;
    if (p.docs.some((d) => d !== doc && (d.code || '').toLowerCase() === code.toLowerCase())) return `Le code « ${code} » est déjà utilisé.`;
    return '';
  }
  function nextDocCode(p, prefix = 'D') {
    const used = new Set(p.docs.map((d) => (d.code || '').toLowerCase()));
    let n = 1, c;
    do c = `${prefix}${String(n++).padStart(2, '0')}`; while (used.has(c.toLowerCase()));
    return c;
  }
  const PARA_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
  const paraIdSet = (p, except = null) => {
    const s = new Set();
    for (const d of p.docs) if (d !== except) for (const pa of d.paras) s.add(String(pa.label).toLowerCase());
    return s;
  };
  /** Identifiant libre « <code>-NNN » à la suite des numéros déjà pris dans le document. */
  function nextParaId(doc, used) {
    let max = 0;
    const re = new RegExp('^' + doc.code.replace(/[.]/g, '\\.') + '-(\\d+)', 'i');
    for (const pa of doc.paras) { const m = String(pa.label).match(re); if (m) max = Math.max(max, +m[1]); }
    let id;
    do id = `${doc.code}-${String(++max).padStart(3, '0')}`; while (used.has(id.toLowerCase()));
    return id;
  }
  /** Donne un code au document et des identifiants valides et uniques (dans le projet) à ses paragraphes.
      Un identifiant importé valide et unique (ID_1373) est gardé ; « §4 » devient « <code>-004 ». */
  function assignIds(p, doc) {
    if (!doc.code || checkDocCode(p, doc.code, doc)) doc.code = nextDocCode(p);
    const used = paraIdSet(p, doc);
    const map = {};
    const todo = [];
    doc.paras.forEach((pa, i) => {
      const old = String(pa.label || '');
      const sec = old.match(/^§\s*(\d+)$/);
      let id = sec ? `${doc.code}-${sec[1].padStart(3, '0')}` : old;
      if (!sec && PARA_ID_RE.test(id) && used.has(id.toLowerCase())) id = `${doc.code}-${old}`;
      if (!PARA_ID_RE.test(id) || used.has(id.toLowerCase())) { todo.push(pa); map[old] = null; return; }
      used.add(id.toLowerCase());
      if (old && old !== id) map[old] = id;
      pa.label = id;
    });
    for (const pa of todo) { const old = pa.label; pa.label = nextParaId(doc, used); used.add(pa.label.toLowerCase()); if (old) map[old] = pa.label; }
    return map;
  }
  /** Change le code d'un document : préfixe des paragraphes et décisions de consensus suivent. */
  function renameDocCode(p, doc, code) {
    code = String(code || '').trim();
    const err = checkDocCode(p, code, doc);
    if (err) throw new Error(err);
    const old = doc.code;
    const pre = old.toLowerCase() + '-';
    const ids = {};
    for (const pa of doc.paras) if (String(pa.label).toLowerCase().startsWith(pre)) { const n = code + pa.label.slice(old.length); ids[pa.label] = n; pa.label = n; }
    for (const r of p.rejects) if (r.doc === old) { r.doc = code; if (ids[r.para]) r.para = ids[r.para]; }
    doc.code = code;
    return old;
  }

  // YAML minimal : une ligne « clé: valeur »
  const yamlValue = (v) => {
    v = String(v ?? '');
    return /: |^#|^["']|"/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v;
  };
  const yamlRead = (v) => {
    v = v.trim();
    const m = v.match(/^"(.*)"$/);
    if (m) return m[1].replace(/\\(["\\])/g, '$1');
    const s = v.match(/^'(.*)'$/);
    return s ? s[1].replace(/''/g, "'") : v;
  };
  function readYaml(lines) {
    const meta = {};
    let i = 0;
    if (lines[0] !== undefined && lines[0].trim() === '---') {
      for (i = 1; i < lines.length && lines[i].trim() !== '---'; i++) {
        const m = lines[i].match(/^([\p{L}\p{N}_.\-]+)\s*:\s?(.*)$/u);
        if (m) meta[m[1]] = yamlRead(m[2]);
      }
      i++;
    }
    return { meta, next: i };
  }
  const FIELD_RE = /^([\p{L}\p{N}_][\p{L}\p{N}_ .'’\-]*?)::\s?(.*)$/u;

  function codingLine(c) {
    const codes = c.codes.map((x) => '#' + x).join(' ');
    const tail = c.quote === null ? (c.whole || '(paragraphe entier)') : `« ${c.quote} »` + (c.occ > 1 ? ` [${c.occ}]` : '');
    return `> - ${codes} @${c.coder} : ${tail}`;
  }
  function parseCodingLine(line) {
    const m = line.match(/^>\s*[-*]\s+(.*)$/);
    if (!m) return null;
    let rest = m[1].trim();
    const codes = [];
    let t;
    while ((t = rest.match(/^#([^\s#@]+)\s*/))) { codes.push(t[1]); rest = rest.slice(t[0].length); }
    const cm = rest.match(/^@(\S+?)\s*:\s*(.*)$/);
    if (!codes.length || !cm) return null;
    const coder = cm[1];
    let q = cm[2].trim();
    if (/^\(paragraphe entier\)$/i.test(q)) return { codes, coder, quote: null, occ: 1 };
    if (/^\(réponse entière\)$/i.test(q)) return { codes, coder, quote: null, occ: 1, whole: q };
    let occ = 1;
    const om = q.match(/\s*\[([1-9]\d*)\]$/);
    if (om) { occ = parseInt(om[1], 10) || 1; q = q.slice(0, om.index).trim(); }
    let quote;
    const a = q.indexOf('«'), b = q.lastIndexOf('»');
    if (a === 0 && b === q.length - 1 && b > a) quote = q.slice(1, -1).replace(/^[\s\u00a0\u202f]/, '').replace(/[\s\u00a0\u202f]$/, '');
    else if (/^".*"$/.test(q)) quote = q.slice(1, -1);
    else return null;
    if (!quote) return null;
    return { codes, coder, quote, occ };
  }
  function splitHeading(h) {
    const k = h.lastIndexOf(' · ');
    return k > 0 ? { label: h.slice(0, k).trim(), speaker: h.slice(k + 3).trim() || null } : { label: h.trim(), speaker: null };
  }
  function addSpeaker(doc, name, role = null, attrs = null) {
    let s = doc.speakers.find((x) => x.name === name);
    if (!s) { s = { name, role: role || guessRole(name), attrs: {} }; doc.speakers.push(s); }
    else if (role) s.role = role;
    if (!s.attrs) s.attrs = {};
    for (const [k, v] of Object.entries(cleanAttrs(attrs))) if (!s.attrs[k]) s.attrs[k] = v;
    return s;
  }
  const PROJECT_SECTIONS = ['tree', 'memos', 'consensus', 'journal'];
  const SECTION_TITLES = { tree: '# Arbre de codes', memos: '# Mémos des codes', consensus: '# Décisions de consensus', journal: "# Journal de l'arbre de codes" };
  const sectionKind = (title) => {
    const t = fold(title);
    return /^memos? des codes|^memos?$/.test(t) ? 'memos' : /^journal/.test(t) ? 'journal' : /^decisions? de consensus|^consensus/.test(t) ? 'consensus'
      : /^arbre|^codes$/.test(t) ? 'tree' : /^documents?$/.test(t) ? 'docs' : null;
  };

  /** Lit un projet : format qda.md (`qda-format: 1`), ancien format adoq (`qda-md-etude`) ou
      arbre de QDA-md 0.9.1 (opts.legacyTree : lignes « > » sous un code = mémo). */
  function parseProject(src, opts = {}) {
    let text = String(src);
    const bom = text.startsWith('\uFEFF');
    if (bom) text = text.slice(1);
    const crlf = /\r\n/.test(text);
    text = text.replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const p = newProject('');
    const { meta, next } = readYaml(lines);
    const fmt = meta['qda-format'];
    const legacy = fmt === undefined;
    delete meta['qda-format']; delete meta['qda-md-etude']; if (opts.legacyTree) delete meta.type;
    p.meta = meta;
    if (legacy) { // ordre canonique : id, titre, puis le reste
      const { id, titre, ...rest } = meta;
      p.meta = { id: id || uid(), titre: titre || 'Projet sans titre', ...rest };
    }
    if (!p.meta.id) p.meta.id = uid();
    p.bom = bom; p.crlf = crlf; p.titles = {};
    p.order = []; p.preamble = [];
    let i = next;

    let section = opts.legacyTree ? 'tree' : null, raw = null;
    const stack = [];
    let lastCode = null, doc = null, para = null, memoCode = null;
    let part = null; // 'docfields' | 'doc' | 'parafields' | 'para'
    let box = null; // { kind, target, lines }
    const closeBox = () => {
      if (!box) return;
      const b = box; box = null;
      if (b.kind === 'other') (b.target.extra = b.target.extra || []).push(b.lines);
    };
    const flushPara = () => {
      closeBox();
      if (para) {
        para.text = para._lines.join(' ').replace(/\s+/g, ' ').trim();
        delete para._lines;
        if (!para.text) p.warnings.push(`Paragraphe vide : ${doc ? doc.name : ''} › ${para.label}`);
        para = null;
      }
    };
    const flushMemo = () => {
      if (!memoCode) return;
      if (memoCode.orphan) { const l = [...memoCode.lines]; while (l.length && !l[l.length - 1].trim()) l.pop(); (p.orphanMemos = p.orphanMemos || []).push(...(p.orphanMemos && p.orphanMemos.length ? [''] : []), ...l); }
      else memoCode.node.memo = memoCode.lines.join('\n').replace(/^\n+|\n+$/g, '');
      memoCode = null;
    };
    const newPara = (label, speaker = null) => {
      if (!doc) { doc = newDoc('Document'); p.docs.push(doc); }
      para = { label, speaker, fields: {}, text: '', codings: [], raw: [], memo: '', extra: [], _lines: [] };
      if (speaker) addSpeaker(doc, speaker);
      doc.paras.push(para);
      part = 'parafields';
    };

    for (; i < lines.length; i++) {
      const line = lines[i].replace(/[ \t]+$/, '');
      const h1 = !box && line.match(/^#\s+(.+?)\s*$/);
      if (h1) {
        flushPara(); flushMemo();
        const kind = sectionKind(h1[1]);
        section = kind || 'raw';
        doc = null; part = null;
        if (kind === 'docs') continue;
        if (kind) { if (!p.order.includes(kind)) p.order.push(kind); (p.titles = p.titles || {})[kind] = line; }
        else { raw = { raw: [line] }; p.order.push(raw); }
        continue;
      }
      if (section === null) { if (line.trim() || p.preamble.length) p.preamble.push(line); continue; }
      if (section === 'raw') { raw.raw.push(line); continue; }
      if (section === 'tree') {
        const m = line.match(/^(\s*)[-*+]\s+(.*?)\s*$/);
        if (m) {
          const indent = m[1].replace(/\t/g, '  ').length;
          let label = m[2], id;
          const idm = label.match(/^(.*?)\s+#([\p{L}\p{N}_\-]+)$/u) || label.match(/^()#([\p{L}\p{N}_\-]+)$/u);
          if (idm) { label = idm[1].trim() || idm[2]; id = idm[2]; } else id = slugify(label);
          const node = { id, label, def: '', memo: '', fields: {}, children: [] };
          while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
          (stack.length ? stack[stack.length - 1].node.children : p.tree).push(node);
          stack.push({ indent, node });
          lastCode = node;
          continue;
        }
        const d = line.match(/^\s*>\s?(.*)$/);
        if (d && lastCode) {
          if (opts.legacyTree) lastCode.memo += (lastCode.memo ? '\n' : '') + d[1];
          else lastCode.def += (lastCode.def ? '\n' : '') + d[1];
          continue;
        }
        const f = lastCode && line.match(/^\s+(.*)$/) && line.trim().match(FIELD_RE);
        if (f) { lastCode.fields[f[1].trim()] = f[2].trim(); continue; }
        if (!line.trim()) continue;
        (p.treeExtra = p.treeExtra || []).push(line);
        continue;
      }
      if (section === 'memos') {
        const h2 = line.match(/^##\s+(.*?)\s+#([^\s#]+)\s*$/);
        if (h2) {
          flushMemo();
          const node = findCode(p, h2[2]);
          if (node) memoCode = { node, lines: [] };
          else { p.warnings.push(`Mémo d'un code inconnu (#${h2[2]}) conservé tel quel.`); memoCode = { orphan: true, lines: [line] }; }
          continue;
        }
        if (memoCode) memoCode.lines.push(memoCode.orphan ? line : unescapeLine(line));
        continue;
      }
      if (section === 'journal') {
        if (!line.trim()) continue;
        const e = parseJournalLine(line);
        p.journal.push(e ? { ...e, raw: line } : { raw: line });
        continue;
      }
      if (section === 'consensus') {
        const m = line.match(/^[-*]\s+écarté\s+::\s+(.*?)\s+::\s+(.*?)\s+::\s+#(\S+)\s*$/);
        if (m) p.rejects.push({ doc: m[1], para: m[2], code: m[3] });
        continue;
      }
      if (section !== 'docs') continue;

      // ----- documents -----
      if (box) {
        if (/^>/.test(line)) {
          const body = line.replace(/^>\s?/, '');
          if (box.kind === 'other') box.lines.push(line);
          else if (box.kind === 'codage') {
            const c = parseCodingLine(line);
            if (c) para.codings.push(c);
            else if (body.trim()) { para.raw.push(line); p.warnings.push(`Ligne de codage illisible (${doc.name} › ${para.label}) : « ${line} »`); }
          } else if (box.kind === 'memo') box.target.memo += (box.started ? '\n' : '') + body, box.started = true;
          else if (box.kind === 'meta') { const m = body.match(/^\s*([^:]+?)\s*::\s?(.*)$/); if (m) doc.meta[m[1].trim()] = m[2].trim(); }
          else if (box.kind === 'locuteurs') {
            const m = body.match(/^\s*[-*]\s+(.+?)(?:\s+::\s+(.*?))?(?:\s+::\s+(.*))?\s*$/);
            if (m) addSpeaker(doc, m[1].trim(), m[2] ? normRole(m[2]) : null, parseAttrs(m[3]));
          }
          continue;
        }
        closeBox();
      }
      const h2 = line.match(/^##\s+(.+?)\s*$/);
      const h3 = line.match(/^###\s+(.+?)\s*$/);
      if (h2 && !h3) {
        flushPara();
        doc = newDoc(h2[1]);
        p.docs.push(doc); part = 'docfields';
        continue;
      }
      if (h3) {
        flushPara();
        const { label, speaker } = legacy ? splitHeading(h3[1]) : { label: h3[1].trim(), speaker: null };
        newPara(label, speaker);
        continue;
      }
      const call = line.match(/^>\s*\[!([\wéè-]+)\]([+-]?)\s*(.*)$/);
      if (call) {
        const kind = fold(call[1]);
        const k = { codage: 'codage', memo: 'memo', meta: 'meta', metadonnees: 'meta', fiche: 'meta', locuteurs: 'locuteurs' }[kind] || 'other';
        if (para) {
          part = 'para';
          if (k === 'codage') box = { kind: 'codage' };
          else if (k === 'memo') box = { kind: 'memo', target: para };
          else box = { kind: 'other', target: para, lines: [line] };
        } else if (doc) {
          part = 'doc';
          if (k === 'meta') { box = { kind: 'meta' }; doc.metaTitle = call[3] || ''; }
          else if (k === 'locuteurs') box = { kind: 'locuteurs' };
          else if (k === 'memo') { box = { kind: 'memo', target: doc }; doc.memoTitle = call[3] || ''; }
          else box = { kind: 'other', target: doc, lines: [line] };
        }
        continue;
      }
      if (!line.trim()) {
        if (part === 'docfields') part = 'doc';
        else if (part === 'parafields') part = 'para';
        continue;
      }
      const f = (part === 'docfields' || part === 'parafields') && line.match(FIELD_RE);
      if (f) {
        const k = f[1].trim(), v = f[2].trim();
        if (part === 'docfields') { if (k === 'document') doc.code = v; else doc.fields[k] = v; }
        else if (k === 'locuteur') para.speaker = v || null;
        else para.fields[k] = v;
        continue;
      }
      if (para) { part = 'para'; para._lines.push(unescapeLine(line)); }
      else if (doc) { // ancien format : texte sans titre de paragraphe
        newPara(`§${doc.paras.length + 1}`);
        part = 'para'; para._lines.push(unescapeLine(line));
      }
    }
    flushPara(); flushMemo();
    // locuteurs cités par un paragraphe mais absents de l'encadré : rôle « autre »
    for (const d of p.docs) for (const pa of d.paras) {
      if (pa.speaker && !d.speakers.some((s) => s.name === pa.speaker)) d.speakers.push({ name: pa.speaker, role: 'autre', attrs: {} });
    }
    // codes et identifiants
    if (legacy || p.docs.some((d) => !d.code)) {
      const rejMap = new Map();
      for (const d of p.docs) {
        const oldName = d.name;
        d.code = d.code && !checkDocCode({ docs: p.docs.filter((x) => x.code) }, d.code, d) ? d.code : '';
        const map = assignIds(p, d);
        rejMap.set(oldName, { code: d.code, map });
      }
      if (legacy) for (const r of p.rejects) { const m = rejMap.get(r.doc); if (m) { r.para = m.map[r.para] || r.para; r.doc = m.code; } }
      if (legacy && p.docs.length) p.converted = true;
    } else {
      const seenCode = new Set(), seenPara = new Set();
      for (const d of p.docs) {
        if (seenCode.has(d.code.toLowerCase())) p.warnings.push(`Code de document en double : ${d.code}`);
        seenCode.add(d.code.toLowerCase());
        for (const pa of d.paras) {
          if (seenPara.has(pa.label.toLowerCase())) p.warnings.push(`Identifiant de paragraphe en double : ${pa.label}`);
          seenPara.add(pa.label.toLowerCase());
        }
      }
    }
    const known = new Set(allCodes(p).map((n) => n.id));
    for (const d of p.docs) for (const pa of d.paras) for (const c of pa.codings) for (const id of c.codes) {
      if (!known.has(id)) {
        p.tree.push({ id, label: id, def: '', memo: '', fields: {}, children: [] });
        known.add(id);
        p.warnings.push(`Code « ${id} » utilisé mais absent de l'arbre : ajouté à la racine.`);
      }
    }
    return p;
  }

  /** Lignes d'un document (sans ligne vide finale). */
  function docLines(d) {
    const out = [`## ${d.name}`, `document:: ${d.code}`];
    for (const [k, v] of Object.entries(d.fields || {})) out.push(`${k}:: ${v}`);
    const metaKeys = Object.keys(d.meta || {}).filter((k) => d.meta[k] !== '' && d.meta[k] != null);
    if (metaKeys.length) {
      out.push('', `> [!meta]-${d.metaTitle === '' ? '' : ' ' + (d.metaTitle || "Fiche de l'entretien")}`);
      for (const k of metaKeys) out.push(`> ${k}:: ${String(d.meta[k]).replace(/\n/g, ' ')}`);
    }
    if (d.speakers && d.speakers.length) {
      out.push('', '> [!locuteurs]- Locuteurs');
      for (const s of d.speakers) { const a = formatAttrs(s.attrs); out.push(`> - ${s.name} :: ${s.role}${a ? ' :: ' + a : ''}`); }
    }
    if (d.memo) {
      out.push('', `> [!memo]-${d.memoTitle === '' ? '' : ' ' + (d.memoTitle || 'Mémo du document')}`);
      for (const l of d.memo.split('\n')) out.push(`> ${l}`.replace(/\s+$/, ''));
    }
    for (const b of d.extra || []) out.push('', ...b);
    for (const pa of d.paras) {
      out.push('', `### ${pa.label}`);
      if (pa.speaker) out.push(`locuteur:: ${pa.speaker}`);
      for (const [k, v] of Object.entries(pa.fields || {})) out.push(`${k}:: ${v}`);
      out.push('', escapeLine(pa.text));
      if (pa.codings.length || (pa.raw && pa.raw.length)) {
        out.push('', '> [!codage]-');
        for (const c of pa.codings) out.push(codingLine(c));
        for (const r of pa.raw || []) out.push(r);
      }
      if (pa.memo) {
        out.push('', '> [!memo]-');
        for (const l of pa.memo.split('\n')) out.push(`> ${l}`.replace(/\s+$/, ''));
      }
      for (const b of pa.extra || []) out.push('', ...b);
    }
    return out;
  }
  /** Partie « projet » (en-tête et sections), sans « # Documents ». */
  function headLines(p) {
    const out = ['---', 'qda-format: 1'];
    const meta = { id: p.meta.id, ...p.meta };
    for (const [k, v] of Object.entries(meta)) if (v !== undefined && v !== '' && k !== 'qda-format') out.push(`${k}: ${yamlValue(v)}`);
    out.push('---');
    if (p.preamble && p.preamble.length) { const pr = [...p.preamble]; while (pr.length && !pr[pr.length - 1].trim()) pr.pop(); if (pr.length) out.push('', ...pr); }
    const order = [...(p.order || [])];
    PROJECT_SECTIONS.forEach((k, j) => {
      if (order.includes(k)) return;
      let at = 0;
      for (let q = j - 1; q >= 0; q--) { const x = order.indexOf(PROJECT_SECTIONS[q]); if (x >= 0) { at = x + 1; break; } }
      order.splice(at, 0, k);
    });
    const T = (k) => (p.titles && p.titles[k]) || SECTION_TITLES[k];
    for (const s of order) {
      if (s === 'tree') {
        out.push('', T('tree'));
        let first = true;
        for (const { node, depth } of walk(p.tree)) {
          const ind = '  '.repeat(depth);
          if (first) { out.push(''); first = false; }
          out.push(`${ind}- ${node.label} #${node.id}`);
          for (const [k, v] of Object.entries(node.fields || {})) out.push(`${ind}  ${k}:: ${v}`);
          if (node.def) for (const l of node.def.split('\n')) out.push(`${ind}  > ${l}`.replace(/\s+$/, ''));
        }
        for (const l of p.treeExtra || []) out.push(l);
      } else if (s === 'memos') {
        const memos = allCodes(p).filter((n) => n.memo && n.memo.trim());
        if (!memos.length && !(p.orphanMemos || []).length) continue;
        out.push('', T('memos'));
        for (const n of memos) out.push('', `## ${n.label} #${n.id}`, '', ...n.memo.split('\n').map((l) => (l.trim() ? escapeMemo(l) : '')));
        if ((p.orphanMemos || []).length) out.push('', ...p.orphanMemos);
      } else if (s === 'consensus') {
        if (!p.rejects || !p.rejects.length) continue;
        out.push('', T('consensus'), '');
        for (const r of p.rejects) out.push(`- écarté :: ${r.doc} :: ${r.para} :: #${r.code}`);
      } else if (s === 'journal') {
        if (!p.journal || !p.journal.length) continue;
        out.push('', T('journal'), '');
        for (const e of p.journal) out.push(e.raw || journalLine(e));
      } else if (s.raw) {
        const r = [...s.raw]; while (r.length > 1 && !r[r.length - 1].trim()) r.pop();
        out.push('', ...r);
      }
    }
    while (out.length && !out[out.length - 1].trim()) out.pop();
    for (let k = out.length - 1; k > 0; k--) if (!out[k].trim() && !out[k - 1].trim()) out.splice(k, 1);
    return out;
  }
  const finish = (p, s) => (p.bom ? '\uFEFF' : '') + (p.crlf ? s.replace(/\n/g, '\r\n') : s);
  function serializeProject(p) {
    const blocks = p.docs.map((d) => docLines(d).join('\n') + '\n');
    return finish(p, headLines(p).join('\n') + '\n\n# Documents\n' + (blocks.length ? '\n' + blocks.join('\n') : ''));
  }
  /** Emballage « dossier » (spéc. § 2.2) : { 'arbre.md': …, 'donnees/E01.md': … }. */
  function splitProject(p) {
    const lower = new Set();
    for (const d of p.docs) {
      const k = d.code.toLowerCase();
      if (lower.has(k)) throw new Error(`Deux documents ont le code « ${d.code} » : impossible de les mettre dans deux fichiers.`);
      lower.add(k);
    }
    const files = { 'arbre.md': finish(p, headLines(p).join('\n') + '\n') };
    for (const d of p.docs) files[`donnees/${d.code}.md`] = finish(p, `---\nqda-format: 1\nprojet: ${p.meta.id}\n---\n\n` + docLines(d).join('\n') + '\n');
    return files;
  }
  /** Lecture d'un dossier de projet : [{path, text}] → projet. Lit le format qda.md et QDA-md 0.9.1. */
  function joinProject(files) {
    const norm = files.map((f) => ({ path: f.path.replace(/\\/g, '/').replace(/^\/+/, ''), text: String(f.text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') }));
    const arbres = norm.filter((f) => /(^|\/)arbre\.md$/i.test(f.path)).sort((a, b) => a.path.length - b.path.length);
    if (!arbres.length) throw new Error('Aucun fichier arbre.md : ce dossier n’est pas un projet QDA-md.');
    const arbre = arbres[0];
    const root = arbre.path.slice(0, arbre.path.length - 'arbre.md'.length);
    const IGNORED = /(^|\/)(\.qda|\.sauvegardes|analyses|cadres|echantillons|verification)\//i;
    const data = norm.filter((f) => f.path.startsWith(root + 'donnees/') && /\.md$/i.test(f.path) && !IGNORED.test(f.path)
      && !/(^|\/)(extraits_|fusion_)[^/]*$/i.test(f.path));
    const isNew = /^---\n(?:[^\n]*\n)*?qda-format:\s*1\s*\n/.test(arbre.text);
    const warnings = [];
    const stripYaml = (t) => { const l = t.split('\n'); const { meta, next } = readYaml(l); return { meta, body: l.slice(next).join('\n').replace(/^\n+/, '').replace(/\n+$/, '') }; };
    const newBlocks = [], oldDocs = [];
    // fichiers par paragraphe (QDA-md 0.9.1) : donnees/<document>/0001_ID.md → réunis par document
    const groups = new Map();
    for (const f of data.sort((a, b) => a.path.localeCompare(b.path))) {
      const rel = f.path.slice(root.length + 'donnees/'.length);
      const parts = rel.split('/');
      const key = parts.length > 1 ? parts[0] : rel.replace(/\.md$/i, '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...f, nested: parts.length > 1 });
    }
    const projId = readYaml(arbre.text.split('\n')).meta.id;
    for (const [key, list] of groups) {
      const first = stripYaml(list[0].text);
      if (first.meta['qda-format'] !== undefined && !list[0].nested) {
        if (first.meta.projet && projId && first.meta.projet !== projId) warnings.push(`${list[0].path} vient d'un autre projet (${first.meta.projet}).`);
        newBlocks.push({ code: key, text: first.body });
        continue;
      }
      // ancien format QDA-md : « ## ID » par paragraphe, en-tête « corpus: »
      const meta = { ...first.meta };
      const title = meta.corpus || key;
      delete meta.corpus;
      let code = key.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[^A-Za-z0-9]+|[-.]+$/g, '').slice(0, 64) || 'D';
      const L = [`## ${title}`, `document:: ${code}`];
      const mk = Object.keys(meta).filter((k) => meta[k]);
      if (mk.length) L.push('', '> [!meta]- Fiche du document', ...mk.map((k) => `> ${k}:: ${meta[k]}`));
      for (const f of list) {
        const body = (f === list[0] ? first : stripYaml(f.text)).body;
        for (const line of body.split('\n')) {
          const h = line.match(/^##\s+(.+)$/);
          L.push(h ? `### ${h[1].trim()}` : line.replace(/^#\s+.*$/, ''));
        }
        L.push('');
      }
      oldDocs.push({ code, text: L.join('\n') });
    }
    const blocks = [...newBlocks, ...oldDocs].sort((a, b) => a.code.toLowerCase().localeCompare(b.code.toLowerCase()));
    const head = arbre.text.replace(/\n+$/, '') + '\n';
    let single;
    if (isNew) single = head + '\n# Documents\n' + (blocks.length ? '\n' + blocks.map((b) => b.text + '\n').join('\n') : '');
    else {
      // arbre de QDA-md 0.9.1 : lu à part (les lignes « > » sous un code sont des mémos)
      const tp = parseProject(head, { legacyTree: true });
      if (!readYaml(head.split('\n')).meta.titre && root) tp.meta.titre = root.replace(/\/$/, '').split('/').pop();
      const tmp = { ...tp, docs: [] };
      single = headLines(tmp).join('\n') + '\n\n# Documents\n' + (blocks.length ? '\n' + blocks.map((b) => b.text + '\n').join('\n') : '');
      warnings.push('Ancien format QDA-md : les notes placées sous les codes de l’arbre sont devenues des mémos de codes (la définition reste à écrire).');
    }
    const p = parseProject(single);
    p.warnings.push(...warnings);
    if (!isNew) p.converted = 'qda-md';
    // identifiants de paragraphe en double entre documents : préfixés par le code du document
    const seen = new Set();
    for (const d of p.docs) for (const pa of d.paras) {
      let id = pa.label;
      if (seen.has(id.toLowerCase())) { id = `${d.code}-${pa.label}`; let k = 2; while (seen.has(id.toLowerCase())) id = `${d.code}-${pa.label}-${k++}`; pa.label = id; }
      seen.add(id.toLowerCase());
    }
    return p;
  }
  function uniqueDocName(p, name) {
    let n = String(name).trim() || 'Document', k = 2;
    const base = n;
    while (p.docs.some((d) => d.name === n)) n = `${base} (${k++})`;
    return n;
  }

  // ---------- import ----------
  const isIramuteq = (text) => /^\*{4}(\s|$)/m.test(text);
  function textToDoc(name, raw) {
    const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
    let items;
    if (isIramuteq(text)) {
      const paras = [];
      let cur = null;
      for (const line of text.split('\n')) {
        const m = line.match(/^\*{4}\s*(.*)$/);
        if (m) {
          const toks = m[1].trim().split(/\s+/).filter(Boolean);
          const idt = toks.find((t) => /^\*ID_/i.test(t));
          const vars = toks.filter((t) => t !== idt && t.startsWith('*'));
          cur = { label: idt ? idt.slice(1) : `§${paras.length + 1}`, vars, lines: [] };
          paras.push(cur);
        } else if (cur && line.trim()) cur.lines.push(line.trim());
      }
      items = paras.filter((x) => x.lines.length).map((x) => ({ label: x.label, vars: x.vars, text: x.lines.join(' ') }));
    } else {
      const blocks = /\n\s*\n/.test(text.trim()) ? text.split(/\n\s*\n/) : text.split('\n');
      items = blocks.map((b) => b.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
        .map((t, i) => ({ label: `§${i + 1}`, text: t }));
    }
    const seen = new Map();
    const doc = newDoc(String(name).replace(/\.(txt|md|docx)$/i, ''));
    doc.paras = items.map((x) => {
      let label = x.label;
      const k = seen.get(label) || 0;
      seen.set(label, k + 1);
      if (k) label = `${label}-${k + 1}`;
      const fields = x.vars && x.vars.length ? { variables: x.vars.join(' ') } : {};
      return { label, speaker: null, fields, text: x.text, codings: [], raw: [], memo: '', extra: [] };
    });
    return doc;
  }
  function addDoc(p, doc) {
    doc.name = uniqueDocName(p, doc.name);
    assignIds(p, doc);
    p.docs.push(doc);
    return doc;
  }

  // ---------- locuteurs ----------
  const TS_RE = /^\s*[\[(]?\d{1,2}:\d{2}(?::\d{2})?[\])]?\s*[-–]?\s*/;
  /** Préfixe de locuteur en tête de paragraphe : {name, start, end} (positions dans le texte) ou null. */
  function speakerPrefix(text) {
    const ts = text.match(TS_RE);
    const off = ts ? ts[0].length : 0;
    const rest = text.slice(off);
    let m = rest.match(/^\[([^\]\n\d][^\]\n]{0,29})\]\s*:?\s*/u);
    if (!m) m = rest.match(/^([\p{L}][\p{L}\p{N}'’ ._\-]{0,29}?)\s*[:：]\s+/u);
    if (m && m[1].trim().split(/\s+/).length > 3) m = null;
    if (!m) { m = rest.match(/^(\p{Lu}{1,4})\.\s+/u); if (m && /^(M|MM|ST|DR|PR|ME)$/.test(m[1])) m = null; }
    if (!m || !rest.slice(m[0].length).trim()) return null;
    const name = m[1].trim().replace(/\s*\.$/, '');
    if (!name) return null;
    return { name, start: off, end: off + m[0].length };
  }
  /** Locuteurs candidats d'un document : [{name, count, role, accepted}] regroupés sans tenir compte de la casse. */
  function detectSpeakers(doc) {
    const groups = new Map();
    for (const pa of doc.paras) {
      const sp = speakerPrefix(pa.text);
      if (!sp) continue;
      const key = fold(sp.name);
      const g = groups.get(key) || { name: sp.name, count: 0, variants: new Set() };
      g.count++; g.variants.add(sp.name);
      groups.set(key, g);
    }
    const few = doc.paras.length <= 4;
    return [...groups.values()].sort((a, b) => b.count - a.count).map((g) => ({
      name: g.name, count: g.count, variants: [...g.variants], role: guessRole(g.name), accepted: g.count >= 2 || few, target: g.name,
    }));
  }
  /** Applique les locuteurs retenus : retire le préfixe, attribue le locuteur (hérité par les paragraphes suivants sans préfixe).
      cands : [{name, accepted, target, role}]. Les codages sont recalés. */
  /** mode : 'inherit' (un paragraphe sans nom reprend le locuteur précédent) ou
      'respondent' (un paragraphe sans nom est attribué au répondant : respondent = {name, attrs}). */
  function applySpeakers(doc, cands, { mode = 'inherit', respondent = null } = {}) {
    const map = new Map();
    for (const c of cands) if (c.accepted && (c.target || '').trim()) map.set(fold(c.name), c.target.trim());
    const resp = mode === 'respondent' ? ((respondent && respondent.name || '').trim() || DEFAULT_RESPONDENT) : null;
    let cur = null, n = 0, nr = 0;
    for (const pa of doc.paras) {
      const sp = speakerPrefix(pa.text);
      const target = sp && map.get(fold(sp.name));
      if (target) {
        cutText(pa, sp.start, sp.end);
        pa.speaker = target; cur = target; n++;
      } else if (pa.speaker) continue;
      else if (resp) { pa.speaker = resp; nr++; }
      else if (mode === 'inherit' && cur) pa.speaker = cur;
    }
    for (const c of cands) {
      if (!c.accepted || !(c.target || '').trim()) continue;
      addSpeaker(doc, c.target.trim(), c.role || guessRole(c.target), c.attrs || null);
    }
    if (resp && nr) addSpeaker(doc, resp, ROLE_R, respondent && respondent.attrs);
    pruneSpeakers(doc);
    return n + nr;
  }
  /** Mode conseillé : si seul l'intervieweur est nommé, ou si beaucoup de paragraphes n'ont pas de nom,
      les paragraphes sans nom sont des réponses. Sinon (chaque prise de parole est nommée), ils prolongent la précédente. */
  function suggestMode(doc, cands) {
    const acc = cands.filter((c) => c.accepted);
    const unnamed = doc.paras.filter((pa) => !speakerPrefix(pa.text)).length;
    if (!unnamed) return 'inherit';
    if (acc.length <= 1 || unnamed / doc.paras.length >= 0.3) return 'respondent';
    return 'inherit';
  }
  function setSpeakerAttrs(doc, name, attrs) {
    const s = doc.speakers.find((x) => x.name === name);
    if (s) s.attrs = cleanAttrs(attrs);
  }
  function attrKeys(p) {
    const keys = new Set(ATTR_KEYS.filter((k) => p.docs.some((d) => d.speakers.some((s) => s.attrs && s.attrs[k]))));
    for (const d of p.docs) for (const s of d.speakers) for (const k of Object.keys(s.attrs || {})) keys.add(k);
    return [...keys];
  }
  const speakerOf = (doc, name) => doc.speakers.find((s) => s.name === name) || null;
  function pruneSpeakers(doc) {
    const used = new Set(doc.paras.map((x) => x.speaker).filter(Boolean));
    doc.speakers = doc.speakers.filter((s) => used.has(s.name));
  }
  /** Renomme ou fusionne un locuteur dans un document. */
  function renameSpeaker(doc, from, to, role = null) {
    to = to.trim();
    if (!to) return;
    for (const pa of doc.paras) if (pa.speaker === from) pa.speaker = to;
    const old = doc.speakers.find((s) => s.name === from);
    addSpeaker(doc, to, role || (old && old.role), old && old.attrs);
    pruneSpeakers(doc);
  }
  const roleOf = (doc, name) => (doc.speakers.find((s) => s.name === name) || { role: name ? guessRole(name) : null }).role;
  const isQuestion = (doc, pa) => !!pa.speaker && roleOf(doc, pa.speaker) === ROLE_I;

  // ZIP sans bibliothèque : lecture (.docx, projet en dossier) et écriture (export en dossier)
  async function unzipAll(buf, filter = () => true) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Ce fichier n'est pas une archive valide.");
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const out = [];
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true);
      const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      const local = dv.getUint32(off + 42, true);
      const name = dec.decode(u8.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + elen + clen;
      if (name.endsWith('/') || !filter(name)) continue;
      const ln = dv.getUint16(local + 26, true), le = dv.getUint16(local + 28, true);
      const data = u8.subarray(local + 30 + ln + le, local + 30 + ln + le + csize);
      let text;
      if (method === 0) text = dec.decode(data);
      else if (method === 8) text = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      else throw new Error('Compression non prise en charge dans l’archive.');
      out.push({ path: name, text });
    }
    return out;
  }
  async function unzipEntry(buf, wanted) {
    let r;
    try { r = await unzipAll(buf, (n) => n === wanted); } catch { throw new Error("Ce fichier n'est pas un .docx valide."); }
    if (!r.length) throw new Error(`Élément ${wanted} introuvable dans le .docx.`);
    return r[0].text;
  }
  let CRC_T = null;
  function crc32(u8) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  /** Archive ZIP non compressée : { 'dossier/fichier.md': texte } → Uint8Array. */
  function zipFiles(files, date = new Date()) {
    const enc = new TextEncoder();
    const dosT = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const dosD = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const locals = [], centrals = [];
    let off = 0;
    for (const [name, text] of Object.entries(files)) {
      const nb = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosT, true); h.setUint16(12, dosD, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosT, true); c.setUint16(14, dosD, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true);
      c.setUint32(42, off, true);
      locals.push(new Uint8Array(h.buffer), nb, data);
      centrals.push(new Uint8Array(c.buffer), nb);
      off += 30 + nb.length + data.length;
    }
    const csize = centrals.reduce((a, x) => a + x.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true);
    const n = Object.keys(files).length;
    e.setUint16(8, n, true); e.setUint16(10, n, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    const parts = [...locals, ...centrals, new Uint8Array(e.buffer)];
    const out = new Uint8Array(parts.reduce((a, x) => a + x.length, 0));
    let k = 0;
    for (const x of parts) { out.set(x, k); k += x.length; }
    return out;
  }
  const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
  async function docxToText(buf) {
    const xml = await unzipEntry(buf, 'word/document.xml');
    const body = xml.replace(/<w:p\/>/g, '<w:p></w:p>');
    const paras = [];
    for (const m of body.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
      let t = '';
      for (const r of m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
        t += r[1] !== undefined ? decodeXml(r[1]) : ' ';
      }
      paras.push(t.trim());
    }
    return paras.join('\n\n');
  }

  // ---------- codage ----------
  function addCoding(para, codes, coder, quote, occ = 1) {
    const same = para.codings.find((c) => c.coder === coder && c.quote === quote && (quote === null || c.occ === occ));
    if (same) {
      for (const x of codes) if (!same.codes.includes(x)) same.codes.push(x);
      return same;
    }
    const c = { codes: [...new Set(codes)], coder, quote, occ: quote === null ? 1 : occ };
    para.codings.push(c);
    return c;
  }
  function removeCodeFromCoding(para, coding, codeId) {
    coding.codes = coding.codes.filter((x) => x !== codeId);
    if (!coding.codes.length) para.codings.splice(para.codings.indexOf(coding), 1);
  }
  function* allParas(p) { for (const d of p.docs) for (const pa of d.paras) yield { doc: d, para: pa }; }
  function renameCodeId(p, oldId, newId) {
    for (const { para } of allParas(p)) for (const c of para.codings) c.codes = [...new Set(c.codes.map((x) => (x === oldId ? newId : x)))];
    for (const r of p.rejects) if (r.code === oldId) r.code = newId;
  }
  function mergeCodes(p, srcId, targetId) {
    if (srcId === targetId) return 0;
    const src = findCode(p, srcId), tgt = findCode(p, targetId);
    if (!src || !tgt) throw new Error('Code introuvable.');
    if (descendants(src).includes(targetId)) throw new Error('Impossible de fusionner un code dans un de ses sous-codes.');
    let n = 0;
    for (const { para } of allParas(p)) for (const c of para.codings) if (c.codes.includes(srcId)) n++;
    renameCodeId(p, srcId, targetId);
    for (const { para } of allParas(p)) {
      const keep = [];
      for (const c of para.codings) {
        const twin = keep.find((k) => k.coder === c.coder && k.quote === c.quote && k.occ === c.occ);
        if (twin) { for (const x of c.codes) if (!twin.codes.includes(x)) twin.codes.push(x); } else keep.push(c);
      }
      para.codings = keep;
    }
    tgt.children.push(...src.children);
    if (src.def && !tgt.def) tgt.def = src.def;
    if (src.memo) tgt.memo = tgt.memo ? `${tgt.memo}\n\n— Mémo repris de « ${src.label} » —\n${src.memo}` : src.memo;
    const sib = siblingsOf(p, srcId);
    sib.splice(sib.indexOf(src), 1);
    return n;
  }
  function deleteCode(p, id) {
    const node = findCode(p, id);
    if (!node) return 0;
    let n = 0;
    for (const { para } of allParas(p)) for (const c of [...para.codings]) {
      if (c.codes.includes(id)) { n++; removeCodeFromCoding(para, c, id); }
    }
    p.rejects = p.rejects.filter((r) => r.code !== id);
    const sib = siblingsOf(p, id);
    sib.splice(sib.indexOf(node), 1, ...node.children);
    return n;
  }
  /** position : 'before' | 'after' | 'inside' | 'root' */
  function moveCode(p, id, targetId, position) {
    const node = findCode(p, id);
    if (!node || id === targetId) return false;
    if (targetId && descendants(node).includes(targetId)) return false;
    const sib = siblingsOf(p, id);
    sib.splice(sib.indexOf(node), 1);
    if (position === 'root' || !targetId) { p.tree.push(node); return true; }
    const tgt = findCode(p, targetId);
    if (position === 'inside') { tgt.children.push(node); return true; }
    const tsib = siblingsOf(p, targetId);
    tsib.splice(tsib.indexOf(tgt) + (position === 'after' ? 1 : 0), 0, node);
    return true;
  }

  // ---------- analyses ----------
  function coders(p) {
    const s = new Set();
    for (const { para } of allParas(p)) for (const c of para.codings) s.add(c.coder);
    return [...s].sort();
  }
  function codeSet(p, id, withChildren) {
    const n = findCode(p, id);
    return new Set(n && withChildren ? [id, ...descendants(n)] : [id]);
  }
  function counts(p, coder = null) {
    const seg = {}, docs = {};
    for (const { doc, para } of allParas(p)) for (const c of para.codings) {
      if (coder && c.coder !== coder) continue;
      for (const id of c.codes) {
        seg[id] = (seg[id] || 0) + 1;
        (docs[id] = docs[id] || new Set()).add(doc.name);
      }
    }
    return { seg, docs };
  }
  function extracts(p, id, { withChildren = false, coder = null, speaker = null } = {}) {
    const set = codeSet(p, id, withChildren);
    const out = [];
    for (const { doc, para } of allParas(p)) {
      if (speaker && para.speaker !== speaker) continue;
      const sp = spans(para);
      para.codings.forEach((c, i) => {
        if (coder && c.coder !== coder) return;
        const hit = c.codes.filter((x) => set.has(x));
        if (hit.length) out.push({ doc, para, coding: c, span: sp[i], codes: hit });
      });
    }
    return out;
  }
  function extractsMarkdown(p, id, opts = {}) {
    const ex = extracts(p, id, opts);
    const node = findCode(p, id);
    const L = [`# Extraits — ${node ? node.label : id}`, '', `Projet : ${p.meta.titre}  `, `Code : ${codePath(p, id)} (#${id})${opts.withChildren ? ', avec ses sous-codes' : ''}  `];
    if (opts.coder) L.push(`Codeur : @${opts.coder}  `);
    L.push(`Extraits : ${ex.length}, dans ${new Set(ex.map((e) => e.doc.name)).size} document(s)`, '');
    if (node && node.def) L.push('## Définition', '', ...node.def.split('\n').map((l) => '> ' + l), '');
    if (node && node.memo) L.push('## Mémo', '', node.memo, '');
    let cur = null;
    for (const e of ex) {
      if (e.doc.name !== cur) {
        cur = e.doc.name;
        L.push(`## ${cur}`, '');
        const m = META_KEYS.filter((k) => e.doc.meta[k]).map((k) => `${k} : ${e.doc.meta[k]}`);
        if (m.length) L.push(`_${m.join(' · ')}_`, '');
        const sp = e.doc.speakers.filter((s) => s.role !== ROLE_I && s.attrs && Object.keys(s.attrs).length);
        if (sp.length) L.push(`_Locuteurs : ${sp.map((s) => `${s.name} (${Object.entries(s.attrs).map(([k, v]) => `${k} : ${v}`).join(', ')})`).join(' ; ')}_`, '');
      }
      const q = e.coding.quote === null ? e.para.text : e.coding.quote;
      L.push(`**${e.para.label}**${e.para.speaker ? ' · ' + e.para.speaker : ''} · @${e.coding.coder}${opts.withChildren ? ' · ' + e.codes.map((x) => '#' + x).join(' ') : ''}${e.span.orphan ? ' · ⚠ citation introuvable' : ''}`, '', `> ${q}`, '');
    }
    return L.join('\n');
  }
  const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = (rows) => '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  const metaCols = (d) => META_KEYS.map((k) => (d.meta && d.meta[k]) || '');
  function segmentsCSV(p) {
    const ak = attrKeys(p);
    const rows = [['document', 'code_document', ...META_KEYS, 'paragraphe', 'variables', 'locuteur', 'role', ...ak.map((k) => 'locuteur_' + k), 'code', 'chemin', 'codeur', 'citation', 'paragraphe_entier', 'introuvable']];
    for (const { doc, para } of allParas(p)) {
      const sp = spans(para);
      const so = para.speaker ? speakerOf(doc, para.speaker) : null;
      para.codings.forEach((c, i) => {
        for (const id of c.codes) rows.push([doc.name, doc.code, ...metaCols(doc), para.label, (para.fields && para.fields.variables) || '', para.speaker || '', para.speaker ? roleOf(doc, para.speaker) : '', ...ak.map((k) => (so && so.attrs && so.attrs[k]) || ''), id, codePath(p, id), c.coder,
          c.quote === null ? para.text : c.quote, c.quote === null ? 1 : 0, sp[i].orphan ? 1 : 0]);
      });
    }
    return csv(rows);
  }
  function matrixCSV(p) {
    const codes = allCodes(p);
    const rows = [['document', 'code_document', ...META_KEYS, ...codes.map((c) => codePath(p, c.id))]];
    for (const d of p.docs) {
      const n = {};
      for (const pa of d.paras) for (const c of pa.codings) for (const id of c.codes) n[id] = (n[id] || 0) + 1;
      rows.push([d.name, d.code, ...metaCols(d), ...codes.map((c) => n[c.id] || 0)]);
    }
    return csv(rows);
  }
  /** Locuteurs × codes : nombre de paragraphes de chaque locuteur portant le code. */
  function speakerMatrix(p, coder = null) {
    const codes = allCodes(p);
    const rows = [];
    for (const d of p.docs) {
      const by = new Map();
      for (const pa of d.paras) {
        const k = pa.speaker || '(sans locuteur)';
        const so = pa.speaker ? speakerOf(d, pa.speaker) : null;
        const r = by.get(k) || { doc: d, speaker: k, role: pa.speaker ? roleOf(d, pa.speaker) : '', attrs: (so && so.attrs) || {}, paras: 0, n: {} };
        r.paras++;
        const got = new Set();
        for (const c of pa.codings) if (!coder || c.coder === coder) c.codes.forEach((x) => got.add(x));
        for (const x of got) r.n[x] = (r.n[x] || 0) + 1;
        by.set(k, r);
      }
      rows.push(...by.values());
    }
    return { codes, rows };
  }
  function speakerMatrixCSV(p, coder = null) {
    const { codes, rows } = speakerMatrix(p, coder);
    const ak = attrKeys(p);
    return csv([['document', 'locuteur', 'role', ...ak, 'paragraphes', ...codes.map((c) => codePath(p, c.id))],
      ...rows.map((r) => [r.doc.name, r.speaker, r.role, ...ak.map((k) => r.attrs[k] || ''), r.paras, ...codes.map((c) => r.n[c.id] || 0)])]);
  }

  /** Kappa de Cohen par code, au niveau du paragraphe, sur les documents codés par les deux codeurs.
      Les questions de l'intervieweur sont exclues des unités. */
  function agreement(p, a, b, { withQuestions = false } = {}) {
    const docs = p.docs.filter((d) => [a, b].every((k) => d.paras.some((pa) => pa.codings.some((c) => c.coder === k))));
    const units = docs.flatMap((d) => d.paras.filter((pa) => withQuestions || !isQuestion(d, pa)).map((pa) => ({ doc: d, para: pa })));
    const has = (pa, k, id) => pa.codings.some((c) => c.coder === k && c.codes.includes(id));
    const used = new Set();
    for (const u of units) for (const c of u.para.codings) if (c.coder === a || c.coder === b) c.codes.forEach((x) => used.add(x));
    const rows = [];
    for (const id of allCodes(p).map((n) => n.id).filter((x) => used.has(x))) {
      let both = 0, onlyA = 0, onlyB = 0, none = 0;
      const diff = [];
      for (const u of units) {
        const x = has(u.para, a, id), y = has(u.para, b, id);
        if (x && y) both++; else if (x) { onlyA++; diff.push({ ...u, who: a }); } else if (y) { onlyB++; diff.push({ ...u, who: b }); } else none++;
      }
      const n = units.length;
      const po = n ? (both + none) / n : 0;
      const pa = n ? (both + onlyA) / n : 0, pb = n ? (both + onlyB) / n : 0;
      const pe = pa * pb + (1 - pa) * (1 - pb);
      const kappa = pe === 1 ? (po === 1 ? 1 : 0) : (po - pe) / (1 - pe);
      rows.push({ id, both, onlyA, onlyB, none, po, kappa, diff });
    }
    const excluded = docs.reduce((s, d) => s + d.paras.filter((pa) => isQuestion(d, pa)).length, 0);
    return { docs: docs.map((d) => d.name), units: units.length, excluded: withQuestions ? 0 : excluded, rows };
  }

  // ---------- consensus ----------
  const isRejected = (p, doc, para, code) => p.rejects.some((r) => r.doc === doc.code && r.para === para.label && r.code === code);
  /** Points à trancher entre deux codeurs : un point = (paragraphe, code). */
  function consensusItems(p, a, b) {
    const items = [];
    for (const doc of p.docs) {
      if (![a, b].every((k) => doc.paras.some((pa) => pa.codings.some((c) => c.coder === k)))) continue;
      for (const para of doc.paras) {
        const codes = new Set();
        for (const c of para.codings) if (c.coder === a || c.coder === b) c.codes.forEach((x) => codes.add(x));
        for (const code of codes) {
          const segA = para.codings.filter((c) => c.coder === a && c.codes.includes(code));
          const segB = para.codings.filter((c) => c.coder === b && c.codes.includes(code));
          const kept = para.codings.some((c) => c.coder === CONSENSUS && c.codes.includes(code));
          const rejected = isRejected(p, doc, para, code);
          items.push({ doc, para, code, segA, segB, agree: segA.length > 0 && segB.length > 0, kept, rejected, decided: kept || rejected });
        }
      }
    }
    return items;
  }
  function consensusKeep(p, item, from) {
    const segs = from === 'b' ? item.segB : from === 'both' ? [...item.segA, ...item.segB] : item.segA.length ? item.segA : item.segB;
    p.rejects = p.rejects.filter((r) => !(r.doc === item.doc.code && r.para === item.para.label && r.code === item.code));
    for (const s of segs) addCoding(item.para, [item.code], CONSENSUS, s.quote, s.occ);
  }
  function consensusReject(p, item) {
    for (const c of [...item.para.codings]) if (c.coder === CONSENSUS && c.codes.includes(item.code)) removeCodeFromCoding(item.para, c, item.code);
    if (!isRejected(p, item.doc, item.para, item.code)) p.rejects.push({ doc: item.doc.code, para: item.para.label, code: item.code });
  }

  /** Ajoute dans `base` les codages, codes, mémos, fiches, locuteurs et le journal de `other`. Ne retire jamais rien. */
  function mergeInto(base, other, { addDocs = true, renameCoder = {}, coder = '' } = {}) {
    const rep = { codings: 0, completed: 0, already: 0, codes: [], docs: [], orphans: [], memos: 0, journal: 0 };
    for (const { node, parent } of walk(other.tree)) {
      const mine = findCode(base, node.id);
      if (mine) {
        if (node.memo && !mine.memo) { mine.memo = node.memo; rep.memos++; }
        else if (node.memo && mine.memo && node.memo !== mine.memo && !mine.memo.includes(node.memo)) {
          mine.memo += `\n\n— Mémo reçu par fusion —\n${node.memo}`; rep.memos++;
        }
        if (node.def && !mine.def) mine.def = node.def;
        mine.fields = mine.fields || {};
        for (const [k, v] of Object.entries(node.fields || {})) if (!(k in mine.fields)) mine.fields[k] = v;
        continue;
      }
      const par = parent && findCode(base, parent.id);
      const copy = { id: node.id, label: node.label, def: node.def, memo: node.memo || '', fields: { ...(node.fields || {}) }, children: [] };
      (par ? par.children : base.tree).push(copy);
      rep.codes.push(node.label);
    }
    const sameText = (a, b) => a.paras.length === b.paras.length && a.paras.every((x, k) => x.text === b.paras[k].text);
    const docMap = new Map(), paraMap = new Map();
    for (const od of other.docs) {
      const lc = (od.code || '').toLowerCase();
      let bd = base.docs.find((d) => (d.code || '').toLowerCase() === lc && (d.name === od.name || sameText(d, od)))
        || base.docs.find((d) => d.name === od.name) || base.docs.find((d) => sameText(d, od));
      if (!bd) {
        if (!addDocs) { rep.orphans.push(`Document absent : ${od.name}`); continue; }
        bd = { ...newDoc(uniqueDocName(base, od.name)), code: od.code, fields: { ...(od.fields || {}) }, memo: od.memo, memoTitle: od.memoTitle, metaTitle: od.metaTitle, extra: od.extra || [],
          meta: { ...od.meta }, speakers: od.speakers.map((s) => ({ ...s, attrs: { ...(s.attrs || {}) } })),
          paras: od.paras.map((x) => ({ label: x.label, speaker: x.speaker, fields: { ...(x.fields || {}) }, text: x.text, memo: x.memo || '', extra: x.extra || [], codings: [], raw: [] })) };
        const old = bd.paras.map((x) => x.label);
        if (!bd.code || checkDocCode(base, bd.code, bd)) { // code déjà pris : nouveau code, préfixe des paragraphes suivi
          const nc = nextDocCode(base), pre = (od.code || '').toLowerCase() + '-';
          if (od.code) for (const x of bd.paras) if (x.label.toLowerCase().startsWith(pre)) x.label = nc + x.label.slice(od.code.length);
          bd.code = nc;
        }
        assignIds(base, bd);
        bd.paras.forEach((x, k) => paraMap.set(`${od.code}\u0000${old[k]}`, x.label));
        base.docs.push(bd);
        rep.docs.push(od.name);
      } else {
        for (const [k, v] of Object.entries(od.meta || {})) if (v && !bd.meta[k]) bd.meta[k] = v;
        if (od.memo && !bd.memo) bd.memo = od.memo;
        for (const s of od.speakers) { const mine = speakerOf(bd, s.name); if (mine) addSpeaker(bd, s.name, null, s.attrs); }
      }
      docMap.set(od.code, bd);
      for (const opa of od.paras) {
        const bpa = bd.paras.find((x) => x.label === (paraMap.get(`${od.code}\u0000${opa.label}`) || opa.label)) || bd.paras.find((x) => x.text === opa.text);
        if (!bpa) { opa.codings.forEach((c) => rep.orphans.push(`${od.name} › ${opa.label} : ${codingLine(c)}`)); continue; }
        paraMap.set(`${od.code}\u0000${opa.label}`, bpa.label);
        if (opa.speaker && !bpa.speaker && bpa.text === opa.text) {
          bpa.speaker = opa.speaker;
          const s = od.speakers.find((x) => x.name === opa.speaker);
          addSpeaker(bd, opa.speaker, s && s.role, s && s.attrs);
        }
        if (opa.memo && !bpa.memo) bpa.memo = opa.memo;
        for (const c of opa.codings) {
          const who = renameCoder[c.coder] || c.coder;
          if (c.quote !== null && locate(bpa.text, c.quote, c.occ) < 0) { rep.orphans.push(`${od.name} › ${opa.label} : ${codingLine(c)}`); continue; }
          const same = bpa.codings.find((k) => k.coder === who && k.quote === c.quote && k.occ === c.occ);
          if (!same) { bpa.codings.push({ codes: [...c.codes], coder: who, quote: c.quote, occ: c.occ, ...(c.whole ? { whole: c.whole } : {}) }); rep.codings++; }
          else {
            const add = c.codes.filter((x) => !same.codes.includes(x));
            if (add.length) { same.codes.push(...add); rep.completed++; } else rep.already++;
          }
        }
      }
    }
    for (const r0 of other.rejects || []) {
      const bd = docMap.get(r0.doc);
      if (!bd) continue;
      const r = { doc: bd.code, para: paraMap.get(`${r0.doc}\u0000${r0.para}`) || r0.para, code: r0.code };
      if (!base.rejects.some((x) => x.doc === r.doc && x.para === r.para && x.code === r.code)) base.rejects.push(r);
    }
    const key = (e) => (e.date ? journalLine(e) : e.raw);
    const seen = new Set(base.journal.map(key));
    const add = (other.journal || []).filter((e) => !seen.has(key(e)));
    if (add.length) {
      base.journal.push(...add.map((e) => ({ ...e })));
      base.journal.sort((x, y) => (x.date || '').localeCompare(y.date || ''));
      rep.journal = add.length;
    }
    for (const label of rep.codes) {
      const n = allCodes(base).find((x) => x.label === label);
      logTree(base, 'ajout par fusion', `${codeRef(base, n.id)} reçu de la copie « ${other.meta.titre} »`, { coder });
    }
    return rep;
  }

  function stats(p) {
    let paras = 0, coded = 0, codings = 0, chars = 0, questions = 0;
    for (const { doc, para } of allParas(p)) {
      paras++; chars += para.text.length;
      if (isQuestion(doc, para)) questions++;
      if (para.codings.length) coded++;
      codings += para.codings.length;
    }
    return { docs: p.docs.length, paras, questions, coded, codings, chars, codes: allCodes(p).length };
  }

  /** Synthèse pour l'enseignant : une ligne par fichier d'étudiant, et l'usage de chaque code. */
  function teacherSummary(files, ref = null) {
    const mainCoder = (p) => {
      const n = {};
      for (const { para } of allParas(p)) for (const c of para.codings) if (c.coder !== CONSENSUS) n[c.coder] = (n[c.coder] || 0) + 1;
      return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || null;
    };
    const refCodes = ref ? new Set(allCodes(ref.p).map((n) => n.id)) : null;
    const refCoder = ref ? mainCoder(ref.p) : null;
    const codeUse = new Map();
    const students = files.map((f) => {
      const p = f.p, s = stats(p), coder = mainCoder(p);
      const codes = allCodes(p);
      const { seg } = counts(p, coder);
      for (const n of codes) {
        const u = codeUse.get(n.id) || { id: n.id, label: n.label, inRef: refCodes ? refCodes.has(n.id) : null, by: {} };
        u.by[f.name] = seg[n.id] || 0;
        codeUse.set(n.id, u);
      }
      const answers = s.paras - s.questions;
      let codedAns = 0;
      for (const { doc, para } of allParas(p)) if (!isQuestion(doc, para) && para.codings.some((c) => c.coder === coder)) codedAns++;
      const row = {
        name: f.name, title: p.meta.titre, coder, coders: coders(p), docs: s.docs, coverage: answers ? codedAns / answers : 0,
        codings: Object.values(seg).reduce((a, b) => a + b, 0), codes: codes.length,
        noDef: codes.filter((n) => !n.def).length, extra: refCodes ? codes.filter((n) => !refCodes.has(n.id)).map((n) => n.label) : [],
        locked: isLocked(p), journal: p.journal.length, kappa: null,
      };
      if (ref && coder && refCoder) {
        const both = snapshot(ref.p);
        const ren = {}; ren[coder] = '__etu';
        const tmp = snapshot(p);
        for (const { para } of allParas(tmp)) para.codings = para.codings.filter((c) => c.coder === coder);
        for (const { para } of allParas(both)) para.codings = para.codings.filter((c) => c.coder === refCoder);
        mergeInto(both, tmp, { addDocs: false, renameCoder: ren });
        const ag = agreement(both, refCoder, '__etu');
        const rows = ag.rows.filter((r) => refCodes.has(r.id));
        row.kappa = rows.length ? rows.reduce((a, r) => a + r.kappa, 0) / rows.length : null;
        row.kappaCodes = rows.length;
      }
      return row;
    });
    return { students, codes: [...codeUse.values()], refCoder };
  }
  /** Réunit plusieurs projets en un seul ; un codeur déjà présent est renommé (zoe → zoe-2). */
  function mergeAll(files) {
    const base = snapshot(files[0].p);
    base.meta = { titre: 'Synthèse de groupe', id: uid() };
    const reports = [];
    for (const f of files.slice(1)) {
      const have = new Set(coders(base));
      const ren = {};
      for (const c of coders(f.p)) if (have.has(c)) { let k = 2; while (have.has(`${c}-${k}`)) k++; ren[c] = `${c}-${k}`; have.add(ren[c]); }
      reports.push({ name: f.name, renamed: ren, ...mergeInto(base, f.p, { renameCoder: ren }) });
    }
    return { p: base, reports };
  }

  /** Copie légère pour l'annulation : les textes sont partagés. */
  function snapshot(p) {
    const cloneNode = (n) => ({ id: n.id, label: n.label, def: n.def, memo: n.memo || '', fields: { ...(n.fields || {}) }, children: n.children.map(cloneNode) });
    return {
      meta: { ...p.meta }, titles: { ...(p.titles || {}) }, warnings: [], order: [...(p.order || [])], preamble: [...(p.preamble || [])], treeExtra: p.treeExtra, orphanMemos: p.orphanMemos,
      bom: p.bom, crlf: p.crlf,
      tree: p.tree.map(cloneNode),
      journal: p.journal.map((e) => ({ ...e })),
      rejects: p.rejects.map((r) => ({ ...r })),
      docs: p.docs.map((d) => ({
        name: d.name, code: d.code, fields: { ...(d.fields || {}) }, memo: d.memo, memoTitle: d.memoTitle, metaTitle: d.metaTitle, extra: d.extra || [],
        meta: { ...d.meta }, speakers: d.speakers.map((s) => ({ ...s, attrs: { ...(s.attrs || {}) } })),
        paras: d.paras.map((x) => ({ label: x.label, speaker: x.speaker, fields: { ...(x.fields || {}) }, text: x.text, memo: x.memo || '', extra: x.extra || [], raw: [...(x.raw || [])], codings: x.codings.map((c) => ({ ...c, codes: [...c.codes] })) })),
      })),
    };
  }

  return {
    ORIGINS, originOf, setOrigin,
    VERSION, ROLES, checkDocCode, renameDocCode, splitProject, joinProject, unzipAll, zipFiles, ROLE_I, ROLE_R,
    CONSENSUS, META_KEYS, ATTR_KEYS, DEFAULT_RESPONDENT, parseAttrs, formatAttrs, suggestMode, setSpeakerAttrs,
    speakerOf, slugify, cleanCoder, fold, newProject, walk, allCodes, findCode, parentOf, descendants, codePath,
    addCode, isLocked, codeRef, logTree, journalLine, locate, occurrenceAt, spans, parseProject, serializeProject,
    isIramuteq, textToDoc, addDoc, speakerPrefix, detectSpeakers, applySpeakers, renameSpeaker, pruneSpeakers,
    addSpeaker, roleOf, isQuestion, docxToText, addCoding, removeCodeFromCoding, allParas, mergeCodes, deleteCode,
    moveCode, coders, counts, extracts, extractsMarkdown, segmentsCSV, matrixCSV, speakerMatrix, speakerMatrixCSV,
    agreement, consensusItems, consensusKeep, consensusReject, mergeInto, mergeAll, teacherSummary, stats, snapshot,
    uniqueDocName,
  };
})();
if (typeof module !== 'undefined') module.exports = QDA;
