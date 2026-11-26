/* adoq QDA — interface. Tout tourne dans le navigateur : aucune donnée n'est envoyée. */
(() => {
'use strict';
const Q = QDA; // défini par le script du noyau
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = Q.fold;
const hasFS = typeof window.showOpenFilePicker === 'function' && window.isSecureContext && window.self === window.top;
const fmtTime = (d) => new Date(d).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => new Date(d).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtSize = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1e3)) + ' ko');
const fmtDay = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d\d)-(\d\d)$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const ls = {
  get(k, d) { try { const v = localStorage.getItem('qdaE.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  /* En mode « effacer à la fermeture », seul ce réglage est gardé dans le navigateur. */
  set(k, v) { if (k !== 'private' && ls.get('private', false)) return; try { localStorage.setItem('qdaE.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const isPrivate = () => ls.get('private', false) === true;

// ---------- couleurs ----------
const PALETTE = ['#2a9d8f', '#e76f51', '#457b9d', '#e9a23b', '#8e5ea2', '#6a994e', '#d1495b', '#3d5a80', '#b5838d', '#c08a2d', '#4d908e', '#9c6644', '#577590', '#bc4b51'];
const SPK_COLORS = ['#1f5f5b', '#8e5ea2', '#b4531f', '#3d5a80', '#9c4f6b', '#5a7d2a', '#7a5c2e'];
/* Chaque code reçoit une couleur libre de la palette, gardée par ce navigateur pour ce projet. */
let colorMap = {};
function color(id) {
  if (colorMap[id]) return colorMap[id];
  const used = Object.values(colorMap);
  let c = PALETTE.find((x) => !used.includes(x));
  if (!c) { const n = {}; used.forEach((x) => (n[x] = (n[x] || 0) + 1)); c = PALETTE.reduce((a, b) => ((n[b] || 0) < (n[a] || 0) ? b : a)); }
  colorMap[id] = c;
  if (S.p) ls.set('colors.' + S.p.meta.id, colorMap);
  return c;
}
function loadColors() {
  colorMap = ls.get('colors.' + S.p.meta.id, {}) || {};
  const ids = new Set(Q.allCodes(S.p).map((n) => n.id));
  for (const k of Object.keys(colorMap)) if (!ids.has(k)) delete colorMap[k];
  for (const id of ids) color(id);
}
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
function spkColor(doc, name) {
  const resp = doc.speakers.filter((s) => s.role !== Q.ROLE_I).map((s) => s.name);
  const k = resp.indexOf(name);
  return k < 0 ? null : SPK_COLORS[k % SPK_COLORS.length];
}

// ---------- stockage du navigateur (sauvegardes, reprise, projets récents) ----------
const DB = {
  db: null,
  open() {
    if (this.db) return this.db;
    this.db = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB indisponible'));
      const r = indexedDB.open('qda-md-etude', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('kv');
        d.createObjectStore('backups', { keyPath: 'n', autoIncrement: true }).createIndex('pid', 'pid');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async run(store, mode, fn) {
    try {
      const d = await this.open();
      return await new Promise((res, rej) => {
        const t = d.transaction(store, mode);
        const r = fn(t.objectStore(store));
        t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    } catch (e) { console.warn('Stockage navigateur :', e); return undefined; }
  },
  get: (k) => DB.run('kv', 'readonly', (s) => s.get(k)),
  set: (k, v) => DB.run('kv', 'readwrite', (s) => s.put(v, k)),
  backups: (pid) => DB.run('backups', 'readonly', (s) => (pid ? s.index('pid').getAll(pid) : s.getAll())),
  addBackup: (rec) => DB.run('backups', 'readwrite', (s) => s.add(rec)),
  delBackup: (n) => DB.run('backups', 'readwrite', (s) => s.delete(n)),
};

// ---------- état ----------
const S = {
  p: null, handle: null, fileName: '', dirty: false, version: 0, savedAt: null, saving: false, saveError: false,
  coder: Q.cleanCoder(ls.get('coder', '')), view: ls.get('view', ''), hideQ: ls.get('hideQ', false), nCoders: 0,
  cur: 0, active: null, filter: 'all', spk: '', collapsed: new Set(), undo: [], redo: [],
  pending: null, popItems: [], popSel: 0, lastBackup: 0, drag: null,
};
const locked = () => S.p && Q.isLocked(S.p);
const curDoc = () => S.p && S.p.docs[S.cur];

// ---------- petits outils d'interface ----------
let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'on' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), err ? 5000 : 2600);
}
/** Fenêtre modale. buttons : [{label, value, primary, danger}] ; renvoie la valeur du bouton, ou null. */
function dialog({ title, html, buttons = [{ label: 'Fermer', value: 'ok', primary: true }], wide = false, onOpen }) {
  const d = $('#dlg');
  if (d.open) d.close();
  d.className = wide ? 'wide' : '';
  $('#dlgtitle').textContent = title;
  $('#dlgbody').innerHTML = html;
  $('#dlgbtns').innerHTML = buttons.map((b) => `<button value="${esc(b.value)}" class="${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}">${esc(b.label)}</button>`).join('');
  d.returnValue = '';
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(d.returnValue || null), { once: true });
    d.showModal();
    if (onOpen) onOpen($('#dlgbody'));
    const first = $('#dlgbody input[type=text]:not([data-nofocus]), #dlgbody textarea', d);
    if (first) { first.focus(); if (first.select && first.tagName === 'INPUT') first.select(); }
  });
}
const confirmDlg = (title, html, label = 'Confirmer', danger = false) =>
  dialog({ title, html, buttons: [{ label, value: 'ok', primary: true, danger }, { label: 'Annuler', value: '' }] }).then((v) => v === 'ok');
async function ask(title, label, value = '', { textarea = false, hint = '', before = '', big = false } = {}) {
  const field = textarea ? `<textarea id="askv" ${big ? 'style="min-height:280px"' : ''}>${esc(value)}</textarea>` : `<input type="text" id="askv" value="${esc(value)}">`;
  const v = await dialog({ title, wide: big, html: `${before}<label class="f">${esc(label)}</label>${field}${hint ? `<p class="muted">${hint}</p>` : ''}`, buttons: [{ label: 'Valider', value: 'ok', primary: true }, { label: 'Annuler', value: '' }] });
  return v === 'ok' ? $('#askv').value : null;
}
/** Télécharge un texte (UTF-8) ou des octets (archive .zip). */
function download(data, name, mime = 'text/markdown') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: typeof data === 'string' ? mime + ';charset=utf-8' : mime }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const safeName = (s) => String(s || 'projet').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'projet';
async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
  return t;
}
const looksProject = (text) => /^#\s+(arbre|documents)/im.test(text) || /^\uFEFF?---\r?\n(?:[^\n]*\n)*?qda-format\s*:/.test(text);
/** Choisit un ou plusieurs fichiers .md (sélecteur du système si possible). Renvoie [{name, text}]. */
async function pickMd(multiple = false) {
  if (hasFS) {
    try {
      const hs = await window.showOpenFilePicker({ multiple, types: [{ description: 'Projet adoq QDA', accept: { 'text/markdown': ['.md'] } }] });
      return Promise.all(hs.map(async (h) => { const f = await h.getFile(); return { name: f.name, text: await readTextFile(f) }; }));
    } catch (e) { if (e && e.name === 'AbortError') return []; }
  }
  return new Promise((resolve) => {
    const inp = multiple ? $('#fileMulti') : $('#fileOther');
    inp.value = '';
    inp.onchange = async () => resolve(await Promise.all([...inp.files].map(async (f) => ({ name: f.name, text: await readTextFile(f) }))));
    inp.click();
  });
}
const codeLabel = (id) => (Q.findCode(S.p, id) || { label: id }).label;
const chipHTML = (id) => `<span class="chip"><i class="dot" style="background:${color(id)}"></i>${esc(codeLabel(id))}</span>`;

// ---------- modifications, annulation, journal ----------
function countCoders() { S.nCoders = S.p ? Q.coders(S.p).length : 0; }
function changed() {
  countCoders();
  S.dirty = true;
  S.version++;
  S.saveError = false;
  updateStatus();
  scheduleAutosave();
  schedulePersist();
}
/** Applique fn au projet avec possibilité d'annuler. where = {di, pi} pour ne redessiner qu'un paragraphe. */
function mutate(fn, where = null) {
  const snap = Q.snapshot(S.p);
  let r;
  try { r = fn(); } catch (e) { console.error(e); toast(e.message, true); return false; }
  if (r === false) return false;
  S.undo.push(snap);
  if (S.undo.length > 60) S.undo.shift();
  S.redo = [];
  changed();
  if (where) { renderPara(where.di, where.pi); renderTree(); renderDocs(); renderStats(); } else renderAll();
  return r;
}
const log = (type, desc, motif = '') => Q.logTree(S.p, type, desc, { coder: S.coder, motif: (motif || '').trim() });
const ref = (id) => Q.codeRef(S.p, id);
function undo() {
  if (!S.undo.length) return toast('Rien à annuler');
  S.redo.push(Q.snapshot(S.p));
  S.p = S.undo.pop();
  afterHistory();
  toast('Annulé');
}
function redo() {
  if (!S.redo.length) return toast('Rien à rétablir');
  S.undo.push(Q.snapshot(S.p));
  S.p = S.redo.pop();
  afterHistory();
  toast('Rétabli');
}
function afterHistory() {
  S.cur = Math.min(S.cur, Math.max(0, S.p.docs.length - 1));
  if (S.active && !Q.findCode(S.p, S.active)) S.active = null;
  changed();
  renderAll();
}

// ---------- enregistrement ----------
let autosaveTimer, persistTimer;
function scheduleAutosave() {
  if (!S.handle) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => writeFile(), 1200);
}
async function writeFile() {
  if (!S.handle || S.saving) { if (S.saving) scheduleAutosave(); return false; }
  S.saving = true; updateStatus();
  const v = S.version;
  const text = Q.serializeProject(S.p);
  try {
    if (S.handle.queryPermission && (await S.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      if ((await S.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Permission refusée');
    }
    const w = await S.handle.createWritable();
    await w.write(text);
    await w.close();
    if (S.version === v) S.dirty = false;
    S.savedAt = Date.now();
    S.saveError = false;
    backup(text);
    schedulePersist();
  } catch (e) {
    console.warn(e);
    S.saveError = true;
  }
  S.saving = false;
  updateStatus();
  return !S.saveError;
}
async function save() {
  if (!S.p) return;
  if (S.handle) {
    if (await writeFile()) toast('Projet enregistré');
    else toast("Enregistrement impossible dans le fichier. Utilisez « Exporter › Enregistrer une copie ».", true);
    return;
  }
  return saveAs();
}
async function saveAs() {
  if (!S.p) return;
  const name = S.fileName || safeName(S.p.meta.titre) + '.qda.md';
  if (hasFS) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Projet adoq QDA', accept: { 'text/markdown': ['.md'] } }] });
      S.handle = h;
      S.fileName = h.name;
      await writeFile();
      addRecent();
      toast('Enregistré : ' + h.name + ' — les modifications suivantes seront enregistrées automatiquement');
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
      console.warn(e);
    }
  }
  const text = Q.serializeProject(S.p);
  download(text, name);
  S.fileName = name;
  S.dirty = false;
  S.savedAt = Date.now();
  backup(text, true);
  schedulePersist();
  updateStatus();
  toast(`Fichier téléchargé : ${name}. Pour reprendre votre travail, rouvrez ce fichier.`);
  return true;
}
function updateStatus() {
  const st = $('#status');
  if (!S.p) { st.textContent = ''; return; }
  let txt, cls = '';
  if (S.saveError) { txt = '⚠ Non enregistré'; cls = 'dirty'; }
  else if (S.handle) {
    if (S.saving || S.dirty) txt = 'Enregistrement…';
    else { txt = `✓ Enregistré${S.savedAt ? ' à ' + fmtTime(S.savedAt) : ''}`; cls = 'ok'; }
  } else if (S.dirty) { txt = '● Non enregistré'; cls = 'dirty'; }
  else { txt = S.savedAt ? `✓ Téléchargé à ${fmtTime(S.savedAt)}` : ''; cls = 'ok'; }
  st.textContent = txt;
  st.className = 'status ' + cls;
  st.title = S.handle ? `Fichier : ${S.handle.name} (enregistrement automatique)` : (hasFS ? 'Cliquez sur Enregistrer pour choisir où ranger le fichier' : 'Votre navigateur ne permet pas l’enregistrement automatique : cliquez sur Enregistrer');
  document.title = (S.dirty && !S.handle ? '● ' : '') + (S.p.meta.titre || 'Projet') + ' — adoq QDA';
}
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistWork, 1500);
}
async function persistWork() {
  if (!S.p || isPrivate()) return;
  const text = Q.serializeProject(S.p);
  await DB.set('work', { pid: S.p.meta.id, title: S.p.meta.titre, fileName: S.fileName, text, dirty: S.dirty && !S.handle, date: Date.now() });
  if (Date.now() - S.lastBackup > 5 * 60e3 && S.dirty) backup(text);
}
async function backup(text, force = false) {
  if (!S.p || isPrivate()) return;
  if (!force && Date.now() - S.lastBackup < 3 * 60e3) return;
  S.lastBackup = Date.now();
  await DB.addBackup({ pid: S.p.meta.id, title: S.p.meta.titre, date: Date.now(), size: text.length, text });
  const all = (await DB.backups(S.p.meta.id)) || [];
  all.sort((a, b) => b.date - a.date);
  for (const old of all.slice(20)) await DB.delBackup(old.n);
}
async function addRecent() {
  if (!S.handle || isPrivate()) return;
  const list = ((await DB.get('recents')) || []).filter((r) => r.pid !== S.p.meta.id);
  list.unshift({ pid: S.p.meta.id, title: S.p.meta.titre, fileName: S.handle.name, date: Date.now(), handle: S.handle });
  await DB.set('recents', list.slice(0, 8));
}

// ---------- ouverture, création ----------
function setProject(p, { handle = null, fileName = '', dirty = false } = {}) {
  S.p = p; S.handle = handle; S.fileName = fileName || safeName(p.meta.titre) + '.qda.md';
  S.dirty = dirty; S.saveError = false; S.savedAt = handle ? Date.now() : null;
  S.undo = []; S.redo = []; S.cur = 0; S.active = null; S.filter = 'all'; S.spk = ''; S.collapsed = new Set(); S.pending = null;
  S.lastBackup = 0;
  countCoders();
  loadColors();
  document.body.classList.remove('nop');
  $('#memo').hidden = true;
  $('#home').hidden = true;
  $('#home').innerHTML = '';
  $('#work').hidden = false;
  $('#search').value = ''; $('#searchres').innerHTML = '';
  renderAll();
  updateStatus();
  persistWork();
  if (handle) addRecent();
  if (p.warnings.length) {
    dialog({ title: 'Remarques à l’ouverture', html: `<p>Le fichier a été ouvert. Quelques lignes ont été interprétées ou mises de côté :</p><ul>${p.warnings.slice(0, 30).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>${p.warnings.length > 30 ? `<p class="muted">… et ${p.warnings.length - 30} autre(s).</p>` : ''}<p class="muted">Les lignes de codage illisibles sont conservées telles quelles dans le fichier.</p>` });
    p.warnings = [];
  }
}
async function guardUnsaved() {
  if (!S.p || !S.dirty || S.handle) return true;
  const v = await dialog({ title: 'Modifications non enregistrées', html: '<p>Le projet ouvert contient des modifications qui ne sont pas enregistrées dans un fichier.</p><p class="muted">Elles restent récupérables quelque temps via « Sauvegardes », mais il est plus sûr de les enregistrer.</p>', buttons: [{ label: 'Enregistrer d’abord', value: 'save', primary: true }, { label: 'Continuer sans enregistrer', value: 'go' }, { label: 'Annuler', value: '' }] });
  if (v === 'save') return !!(await saveAs());
  return v === 'go';
}
async function newProjectFlow() {
  if (!(await guardUnsaved())) return;
  const title = await ask('Nouveau projet', 'Titre du projet', '', { hint: 'Par exemple : « Mémoire — rapport à l’information des jeunes ». Vous pourrez le changer plus tard.' });
  if (title === null) return;
  const p = Q.newProject(title.trim() || 'Nouveau projet');
  setProject(p, { dirty: true });
  if (!(await ensureCoder())) return;
  if (hasFS) {
    const go = await confirmDlg('Où ranger le projet ?', '<p>Choisissez maintenant l’emplacement du fichier projet (par exemple dans le dossier de votre mémoire).</p><p class="muted">Ensuite, chaque modification sera enregistrée automatiquement dans ce fichier.</p>', 'Choisir l’emplacement');
    if (go) await saveAs();
  }
  importDialog();
}
async function openFlow() {
  if (!(await guardUnsaved())) return;
  if (hasFS) {
    try {
      const [h] = await window.showOpenFilePicker({ types: [{ description: 'Projet adoq QDA', accept: { 'text/markdown': ['.md'], 'text/plain': ['.txt'] } }] });
      const f = await h.getFile();
      return openText(await readTextFile(f), f.name, h);
    } catch (e) { if (e && e.name === 'AbortError') return; console.warn(e); }
  }
  $('#fileOpen').value = '';
  $('#fileOpen').click();
}
async function openText(text, name, handle = null) {
  if (!looksProject(text)) {
    if (!text.trim()) return toast('Fichier vide', true);
    const ok = await confirmDlg('Ce fichier n’est pas un projet', `<p><b>${esc(name)}</b> ne contient pas de projet adoq QDA.</p><p>Voulez-vous créer un nouveau projet et y importer ce texte comme entretien ?</p>`, 'Créer un projet avec ce texte');
    if (!ok) return;
    const p = Q.newProject(name.replace(/\.(txt|md)$/i, ''));
    setProject(p, { dirty: true });
    importDialog([new File([text], name)]);
    return;
  }
  let p;
  try { p = Q.parseProject(text); } catch (e) { return toast('Lecture impossible : ' + e.message, true); }
  if (p.converted) {
    const v = await dialog({ title: 'Projet à l’ancien format', html: `<p><b>${esc(name)}</b> a été créé avec une version antérieure (QDA-md Étude ou adoq QDA 0.3). Il va être converti au <b>format qda.md</b> (version 1), commun à adoq QDA et à QDA-md, la version de recherche.</p>
      <ul><li>Chaque document reçoit un code (<span class="kbd">D01</span>, <span class="kbd">D02</span>… modifiable dans ⓘ Fiche) et chaque paragraphe un identifiant stable (<span class="kbd">D01-004</span>).</li><li>Le texte et le codage ne changent pas.</li></ul>
      <p>${isPrivate() ? 'Les données du navigateur sont effacées à la fermeture : <b>téléchargez une copie de l’ancien fichier</b> si vous voulez la garder.' : 'Une copie de l’ancien fichier est gardée dans les sauvegardes du navigateur ; vous pouvez aussi en télécharger une.'}</p>
      <p class="muted">Après la conversion, n’ouvrez plus ce projet avec adoq QDA 0.3 ou une version antérieure : elles ne comprennent pas le nouveau format.</p>`,
      buttons: [{ label: 'Convertir', value: 'ok', primary: true }, { label: 'Télécharger une copie, puis convertir', value: 'dl' }, { label: 'Annuler', value: '' }] });
    if (!v) return;
    if (v === 'dl') download(text, name.replace(/(\.qda)?\.md$/i, '') + '.ancien-format.qda.md');
  }
  setProject(p, { handle, fileName: name });
  backup(text, true);
  if (p.converted) { changed(); toast(`Projet converti au format qda.md : ${p.meta.titre}`); return; }
  toast(`Projet ouvert : ${p.meta.titre}${Q.isLocked(p) ? ' — arbre de codes verrouillé' : ''}`);
}
async function ensureCoder() {
  if (S.coder) return true;
  const v = await ask('Votre identifiant de codeur', 'Identifiant (initiales ou prénom, sans espace)', '', { hint: 'Il accompagne chacun de vos codages (<span class="kbd">@identifiant</span>). Il permet de comparer votre codage avec celui d’un ou d’une collègue.' });
  const c = Q.cleanCoder(v || '');
  if (!c) { toast('Un identifiant est nécessaire pour coder', true); renderCoder(); return false; }
  S.coder = c; ls.set('coder', c); renderCoder();
  return true;
}
function renderCoder() {
  const i = $('#coder');
  i.value = S.coder;
  i.classList.toggle('missing', !S.coder);
}

// ---------- accueil ----------
async function renderHome() {
  document.body.classList.add('nop');
  $('#work').hidden = true;
  $('#home').hidden = false;
  const work = isPrivate() ? null : await DB.get('work');
  const recents = hasFS && !isPrivate() ? (await DB.get('recents')) || [] : [];
  $('#home').innerHTML = `<div class="card">
    <h1><svg class="homelogo" viewBox="0 0 140 72" aria-hidden="true"><ellipse cx="56" cy="36" rx="50" ry="32" fill="#E1F5EE" stroke="#0F6E56" stroke-width="4"/><polygon points="104,36 137,8 137,64" fill="#0F6E56"/><circle cx="21" cy="27" r="4.5" fill="#0F6E56"/><rect x="34" y="20" width="50" height="8" rx="4" fill="#EF9F27"/><rect x="34" y="33" width="58" height="8" rx="4" fill="#378ADD"/><rect x="34" y="46" width="42" height="8" rx="4" fill="#D85A30"/></svg>adoq <span class="qda">QDA</span></h1>
    <p class="subtitle">Analyse de données qualitatives</p>
    <p class="lead">Un logiciel d’initiation au codage qualitatif d’entretiens. Il tourne entièrement dans votre navigateur : vos données restent sur votre ordinateur et ne sont envoyées nulle part.</p>
    ${work && work.dirty ? `<div class="notice">Un travail non enregistré a été retrouvé : <b>${esc(work.title)}</b> (${fmtDate(work.date)}). <button class="small primary" id="resume">Reprendre ce travail</button></div>` : ''}
    <div class="bigbtns">
      <button class="primary" data-act="new"><b>Nouveau projet</b><span>Créer un projet et importer vos entretiens (.txt, .docx)</span></button>
      <button data-act="open"><b>Ouvrir un projet</b><span>Reprendre un fichier <code>.qda.md</code></span></button>
      <button data-act="example"><b>Projet d’exemple</b><span>Découvrir l’outil sur deux entretiens et un focus group</span></button>
    </div>
    <p class="homeextra">Enseignant·e ? La <a href="#" data-act="teacher">vue enseignant</a> réunit les fichiers de tout un groupe.</p>
    ${privacyHTML()}
    ${recents.length ? `<div class="panel-h" style="padding-left:0">Projets récents</div><ul class="recent">${recents.map((r, i) => `<li><button data-recent="${i}"><b>${esc(r.title)}</b> <span class="when">— ${esc(r.fileName)} · ${fmtDate(r.date)}</span></button></li>`).join('')}</ul>` : ''}
    ${hasFS ? '<div class="notice info">Votre navigateur enregistre automatiquement le projet dans son fichier, à chaque modification.</div>'
      : '<div class="notice"><b>Avec ce navigateur, l’enregistrement n’est pas automatique.</b> Cliquez régulièrement sur « Enregistrer » : le projet est alors téléchargé (dossier Téléchargements). Pour reprendre, rouvrez le dernier fichier téléchargé. <br>Avec <b>Chrome</b> ou <b>Edge</b>, le fichier est enregistré automatiquement à sa place.</div>'}
    <p class="muted">Un projet = un seul fichier texte <code>.qda.md</code> qui contient vos codes, vos entretiens et votre codage. Vous pouvez l’ouvrir dans n’importe quel éditeur de texte, le copier, le rendre à votre enseignant·e. <a href="#" data-act="backups">Sauvegardes et données du navigateur</a> · <a href="#" data-act="help">Aide</a> · version ${Q.VERSION}.</p>
  </div>`;
  const rb = $('#resume');
  if (rb) rb.onclick = () => { const p = Q.parseProject(work.text); setProject(p, { dirty: true, fileName: work.fileName }); toast('Travail repris — pensez à l’enregistrer'); };
  $$('[data-recent]').forEach((b) => (b.onclick = () => openRecent(recents[+b.dataset.recent])));
  bindPrivacy(() => renderHome());
}
async function openRecent(r) {
  try {
    if ((await r.handle.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await r.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return toast('Accès au fichier refusé', true);
    const f = await r.handle.getFile();
    openText(await readTextFile(f), f.name, r.handle);
  } catch (e) { toast(`Impossible d’ouvrir ${r.fileName} (déplacé ou supprimé ?). Utilisez « Ouvrir ».`, true); }
}

// ---------- rendu ----------
function renderAll() {
  if (!S.p) return;
  $('#title').textContent = S.p.meta.titre || 'Projet sans titre';
  renderDocs(); renderDoc(); renderTree(); renderStats(); updateStatus();
  renderView();
}
/** Codeur affiché : null = tous ; '__me' = l'identifiant courant ; sinon un codeur précis. */
const mineFilter = () => (!S.view ? null : S.view === '__me' ? (S.coder || null) : S.view);
function renderView() {
  if (!S.p) return;
  const others = Q.coders(S.p).filter((c) => c !== S.coder);
  if (S.view && S.view !== '__me' && !others.includes(S.view) && S.view !== S.coder) others.push(S.view);
  if (S.view === S.coder && S.coder) S.view = '__me';
  const opt = (v, label) => `<option value="${esc(v)}" ${S.view === v ? 'selected' : ''}>${esc(label)}</option>`;
  $('#viewsel').innerHTML = opt('', 'tous les codeurs') + opt('__me', `mes codages${S.coder ? ' (@' + S.coder + ')' : ''} — codage à l’aveugle`) + others.map((c) => opt(c, '@' + c)).join('');
  const v = mineFilter();
  $('#viewhint').textContent = S.view && S.view !== '__me' && v
    ? `Vous voyez les codages de @${v}. Vos nouveaux codages restent signés @${S.coder || '?'} et ne s’afficheront pas tant que ce choix est actif.`
    : '';
}
function visible(pa) {
  const who = mineFilter();
  return Q.spans(pa).filter((s) => !who || s.coding.coder === who);
}
function metaLine(d) {
  const m = d.meta || {};
  return [m.date && fmtDay(m.date), m.pseudo, m.intervieweur && 'par ' + m.intervieweur, m.lieu].filter(Boolean).join(' · ');
}
function renderDocs() {
  const who = mineFilter();
  $('#docs').innerHTML = S.p.docs.map((d, i) => {
    const ans = d.paras.filter((pa) => !Q.isQuestion(d, pa));
    const coded = ans.filter((pa) => pa.codings.some((c) => !who || c.coder === who)).length;
    const pct = ans.length ? Math.round((100 * coded) / ans.length) : 0;
    const ml = metaLine(d);
    return `<li data-doc="${i}" class="${i === S.cur ? 'cur' : ''}"><span class="dname"><span class="dcode">${esc(d.code)}</span>${esc(d.name)}</span>
      ${ml ? `<span class="dsub">${esc(ml)}</span>` : ''}
      <span class="dmeta">${coded}/${ans.length} ${ans.length < d.paras.length ? 'réponses' : 'paragraphes'} codé(e)s${d.speakers.length > 2 ? ` · ${d.speakers.filter((s) => s.role !== Q.ROLE_I).length} locuteurs` : ''}${d.memo ? ' · mémo' : ''}</span><span class="bar"><i style="width:${pct}%"></i></span>
      <span class="dact"><button data-docren="${i}" title="Renommer">✎</button><button data-docdel="${i}" title="Retirer du projet">🗑</button></span></li>`;
  }).join('');
}
function renderStats() {
  const s = Q.stats(S.p);
  $('#stats').innerHTML = `${s.docs} document(s) · ${s.paras} paragraphes${s.questions ? ` (dont ${s.questions} questions)` : ''}<br>${s.coded} paragraphes codés · ${s.codings} codages · ${s.codes} codes<br>Codeurs : ${Q.coders(S.p).map((c) => '@' + esc(c)).join(', ') || '—'}`;
}
function renderDoc() {
  const d = curDoc();
  if (!d) {
    $('#dochead').innerHTML = '';
    $('#memo').hidden = true;
    $('#paras').innerHTML = `<div class="empty"><p><b>Ce projet ne contient pas encore d’entretien.</b></p><p>Importez vos retranscriptions au format .txt ou .docx (ou collez le texte). Chaque paragraphe deviendra une unité que vous pourrez coder.</p><button class="primary" data-act="import">＋ Importer des entretiens</button></div>`;
    return;
  }
  const act = S.active ? Q.findCode(S.p, S.active) : null;
  const hasQ = d.paras.some((pa) => Q.isQuestion(d, pa));
  if (S.spk && !d.speakers.some((s) => s.name === S.spk)) S.spk = '';
  const ml = metaLine(d);
  $('#dochead').innerHTML = `<div class="dh1"><h2>${esc(d.name)}</h2><span class="meta">${d.paras.length} paragraphes</span>
      <button class="small" id="fichebtn" title="Date, pseudo, intervieweur, lieu…">ⓘ Fiche</button>
      <button class="small" id="spkbtn" title="Questions, réponses, participants d’un focus group">👥 Locuteurs${d.speakers.length ? ` (${d.speakers.length})` : ''}</button>
      <button class="small" id="memobtn">${d.memo ? '📝 Mémo' : '📝 Écrire un mémo'}</button></div>
    <div class="dh2"><span class="metaline">${ml ? esc(ml) : '<a href="#" id="fichelink">Compléter la fiche de l’entretien</a>'}</span>
      ${hasQ ? `<label title="Les questions restent dans le fichier"><input type="checkbox" id="hideq" ${S.hideQ ? 'checked' : ''}> masquer les questions</label>` : ''}
      ${d.speakers.filter((s) => s.role !== Q.ROLE_I).length >= 2 ? `<select id="spkfilter"><option value="">Tous les locuteurs</option>${d.speakers.map((s) => `<option ${s.name === S.spk ? 'selected' : ''} value="${esc(s.name)}">${esc(s.name)}${s.role === Q.ROLE_I ? ' (intervieweur)' : ''}</option>`).join('')}</select>` : ''}
      <select id="filter" title="Afficher">
        <option value="all">Tous les paragraphes</option>
        <option value="active" ${act ? '' : 'disabled'}>Avec le code actif${act ? ' : ' + esc(act.label) : ''}</option>
        <option value="uncoded">Pas encore codés</option>
      </select></div>`;
  $('#filter').value = S.filter === 'active' && !act ? 'all' : S.filter;
  $('#memotext').value = d.memo || '';
  const html = d.paras.map((_, i) => paraHTML(S.cur, i)).join('');
  $('#paras').innerHTML = html || `<div class="empty">Aucun paragraphe ne correspond aux filtres.</div>`;
}
function paraHTML(di, pi) {
  const doc = S.p.docs[di];
  const pa = doc.paras[pi];
  const q = Q.isQuestion(doc, pa);
  const vis = visible(pa);
  if (S.hideQ && q) return '';
  if (S.spk && pa.speaker !== S.spk) return '';
  if (S.filter === 'active' && S.active && !vis.some((s) => s.coding.codes.includes(S.active))) return '';
  if (S.filter === 'uncoded' && (vis.length || q)) return '';
  const located = vis.filter((s) => !s.orphan && !s.whole);
  if (S.pending && S.pending.di === di && S.pending.pi === pi && S.pending.quote !== null) {
    located.push({ i: -1, start: S.pending.start, end: S.pending.end, coding: { codes: [] }, pending: true });
  }
  const whole = vis.filter((s) => s.whole);
  const manyCoders = !mineFilter() && S.nCoders > 1;
  const chips = vis.map((s) => s.coding.codes.map((id) => {
    const tip = `@${s.coding.coder} : ${s.whole ? '(paragraphe entier)' : '« ' + s.coding.quote + ' »'}${s.orphan ? ' — citation introuvable dans le texte' : ''}`;
    return `<span class="chip${s.orphan ? ' orphan' : ''}" data-ci="${s.i}" title="${esc(tip)}"><i class="dot" style="background:${color(id)}"></i>${s.orphan ? '⚠ ' : ''}${esc(codeLabel(id))}${s.whole ? ' ¶' : ''}${manyCoders ? `<span class="who">@${esc(s.coding.coder)}</span>` : ''}<button class="x" data-rm="${s.i}" data-code="${esc(id)}" title="Retirer ce code">×</button></span>`;
  }).join('')).join('');
  const role = pa.speaker ? Q.roleOf(doc, pa.speaker) : '';
  const sc = pa.speaker && !q ? spkColor(doc, pa.speaker) : null;
  const spk = pa.speaker
    ? `<button class="spk ${role === Q.ROLE_I ? 'intervieweur' : ''}" data-spk="1" title="${esc(((so) => (so && so.attrs && Object.keys(so.attrs).length ? Object.entries(so.attrs).map(([k, v]) => `${k} : ${v}`).join(' · ') + ' — ' : ''))(Q.speakerOf(doc, pa.speaker)) + 'cliquer pour changer le locuteur')}" ${sc ? `style="color:${sc}"` : ''}>${esc(pa.speaker)}</button>`
    : `<button class="spk none" data-spk="1" title="Indiquer le locuteur">＋ locuteur</button>`;
  return `<div class="para${q ? ' q' : ''}" id="p-${di}-${pi}" data-di="${di}" data-pi="${pi}">
    ${whole.length ? `<div class="whole">${whole.flatMap((s) => s.coding.codes).map((id) => `<i style="background:${color(id)}"></i>`).join('')}</div>` : ''}
    <div class="plabel">${esc(pa.label)} ${spk}</div>
    <div class="ptext">${markup(pa.text, located)}</div>
    ${pa.memo ? `<div class="pmemo" data-pmemo="1" title="Mémo du paragraphe — cliquer pour le modifier">🗒 ${esc(pa.memo)}</div>` : ''}
    <div class="pfoot">${chips}<button class="ghost pwhole" data-whole="1" title="Coder tout le paragraphe">＋ paragraphe entier</button>${pa.memo ? '' : '<button class="ghost pwhole" data-pmemo="1" title="Écrire un mémo sur ce paragraphe">＋ mémo</button>'}</div>
  </div>`;
}
function markup(text, spans) {
  if (!spans.length) return esc(text);
  const pts = new Set([0, text.length]);
  for (const s of spans) { pts.add(s.start); pts.add(s.end); }
  const arr = [...pts].sort((a, b) => a - b);
  let out = '';
  for (let k = 0; k < arr.length - 1; k++) {
    const a = arr[k], b = arr[k + 1];
    if (a === b) continue;
    const seg = esc(text.slice(a, b));
    const cov = spans.filter((s) => s.start <= a && s.end >= b);
    if (!cov.length) { out += seg; continue; }
    if (cov.some((s) => s.pending) && cov.length === 1) { out += `<span class="sq">${seg}</span>`; continue; }
    const ids = [...new Set(cov.flatMap((s) => s.coding.codes))];
    const cols = ids.map(color);
    const n = Math.min(cols.length, 4);
    const bg = cols.slice(0, n).map((c) => `linear-gradient(${c},${c})`).join(',');
    const pos = cols.slice(0, n).map((_, i) => `0 calc(100% - ${i * 3}px)`).join(',');
    const labels = ids.map(codeLabel).join(' · ');
    const style = `background-color:${rgba(cols[cols.length - 1] || '#f7e08a', Math.min(0.14 + 0.06 * cov.length, 0.34))};background-image:${bg};background-size:100% 3px;background-position:${pos};padding-bottom:${n * 3}px`;
    out += `<mark data-ci="${cov.filter((s) => !s.pending).map((s) => s.i).join(' ')}" title="${esc(labels)}" style="${style}"${cov.some((s) => s.pending) ? ' class="sq"' : ''}>${seg}</mark>`;
  }
  return out;
}
function renderPara(di, pi) {
  if (di !== S.cur) return;
  const el = document.getElementById(`p-${di}-${pi}`);
  const html = paraHTML(di, pi);
  if (!el) { if (html) renderDoc(); return; }
  if (!html) { el.remove(); return; }
  el.outerHTML = html;
}
const ORIGIN_TXT = { inductif: 'Code inductif : issu du travail sur les données', deductif: 'Code déductif : issu de la théorie' };
function originBadge(n) {
  const o = Q.originOf(n);
  if (!o) return '';
  const th = o === 'deductif' && n.fields.theorie ? ` (${n.fields.theorie})` : '';
  return `<span class="ori ori-${o[0]}" title="${esc(ORIGIN_TXT[o] + th)}">${o === 'inductif' ? 'I' : 'D'}</span>`;
}
function renderTree() {
  const lk = locked();
  $('#treebar').innerHTML = (lk ? '' : '<button data-act="newcode">＋ Nouveau code</button>')
    + `<button data-act="journal" title="Créations, fusions, déplacements de codes">Journal${S.p.journal.length ? ` (${S.p.journal.length})` : ''}</button>`
    + `<button data-act="lock" title="${lk ? 'Déverrouiller l’arbre de codes' : 'Empêcher les modifications de l’arbre'}">${lk ? '🔒 Déverrouiller' : '🔓 Verrouiller'}</button>`
    + (lk ? '<div class="lockbanner">🔒 Arbre verrouillé : codez avec les codes existants et écrivez des mémos ; l’arbre lui-même ne peut pas être modifié.</div>' : '');
  const { seg } = Q.counts(S.p, mineFilter());
  const rows = [];
  const acts = lk ? [['ex', '≡', 'Voir les extraits'], ['memo', '🗒', 'Mémo du code']]
    : [['ex', '≡', 'Voir les extraits'], ['sub', '＋', 'Ajouter un sous-code'], ['ren', '✎', 'Renommer'], ['def', '📝', 'Définition'], ['ori', '🧭', 'Origine : inductif ou déductif'], ['memo', '🗒', 'Mémo du code'], ['mrg', '⤵', 'Fusionner dans un autre code'], ['del', '🗑', 'Supprimer']];
  const rec = (nodes, depth) => {
    for (const n of nodes) {
      const open = !S.collapsed.has(n.id);
      const sum = n.children.length && !open ? Q.descendants(n).reduce((a, id) => a + (seg[id] || 0), seg[n.id] || 0) : seg[n.id] || 0;
      rows.push(`<div class="trow${S.active === n.id ? ' active' : ''}" draggable="${lk ? 'false' : 'true'}" data-code="${esc(n.id)}" style="padding-left:${6 + depth * 16}px" title="${esc(n.def || 'Pas encore de définition : cliquez sur 📝 pour en écrire une')}">
        <span class="tw" data-tw="1">${n.children.length ? (open ? '▾' : '▸') : ''}</span><i class="dot" style="background:${color(n.id)}"></i>
        ${originBadge(n)}<span class="lab${n.def ? '' : ' nodef'}">${esc(n.label)}${n.memo ? ' <span class="mm" title="Ce code a un mémo">🗒</span>' : ''}</span><span class="n">${sum || ''}</span>
        <span class="tact">${acts.map(([k, ic, t]) => `<button data-t="${k}" title="${t}">${ic}</button>`).join('')}</span></div>`);
      if (open) rec(n.children, depth + 1);
    }
  };
  rec(S.p.tree, 0);
  $('#tree').innerHTML = rows.join('') || `<p class="muted" style="padding:0 8px">${lk ? 'L’arbre est verrouillé et vide.' : 'Aucun code. Créez-en un avec « ＋ Nouveau code », ou sélectionnez un passage du texte et tapez le nom d’un nouveau code.'}</p>`;
}
function goTo(di, pi) {
  if (S.cur !== di) { $('#memo').hidden = true; S.spk = ''; }
  S.cur = di;
  if (S.filter !== 'all') S.filter = 'all';
  const doc = S.p.docs[di];
  if (S.hideQ && Q.isQuestion(doc, doc.paras[pi])) { S.hideQ = false; ls.set('hideQ', false); }
  if (S.spk && doc.paras[pi].speaker !== S.spk) S.spk = '';
  renderDocs(); renderDoc();
  const el = document.getElementById(`p-${di}-${pi}`);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  requestAnimationFrame(() => { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700); });
}

// ---------- codage ----------
function textOffset(container, node, off) {
  const r = document.createRange();
  r.setStart(container, 0);
  r.setEnd(node, off);
  return r.toString().length;
}
function checkSelection() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const r = sel.getRangeAt(0);
  const el = (n) => (n.nodeType === 1 ? n : n.parentElement);
  const a = el(r.startContainer)?.closest('.ptext'), b = el(r.endContainer)?.closest('.ptext');
  if (!a && !b) return;
  if (a !== b) return toast('Sélectionnez un passage à l’intérieur d’un seul paragraphe.');
  const box = a.closest('.para');
  const di = +box.dataset.di, pi = +box.dataset.pi;
  const pa = S.p.docs[di].paras[pi];
  let s = textOffset(a, r.startContainer, r.startOffset), e = textOffset(a, r.endContainer, r.endOffset);
  while (s < e && /\s/.test(pa.text[s])) s++;
  while (e > s && /\s/.test(pa.text[e - 1])) e--;
  if (e <= s) return;
  const quote = pa.text.slice(s, e);
  openPop({ di, pi, start: s, end: e, quote, occ: Q.occurrenceAt(pa.text, quote, s) }, r.getBoundingClientRect());
}
function openPop(target, rect) {
  S.pending = target;
  renderPara(target.di, target.pi);
  window.getSelection().removeAllRanges();
  const pop = $('#pop');
  pop.hidden = false;
  $('#popq').value = '';
  $('#popq').placeholder = locked() ? 'Chercher un code…' : 'Chercher ou créer un code…';
  fillPop();
  const w = 300, h = pop.offsetHeight;
  const x = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8);
  let y = rect.bottom + 8;
  if (y + h > window.innerHeight - 8) y = rect.top - h - 8 >= 8 ? rect.top - h - 8 : Math.max(8, window.innerHeight - h - 8);
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  $('#popq').focus();
}
function closePop() {
  if ($('#pop').hidden) return;
  $('#pop').hidden = true;
  const t = S.pending;
  S.pending = null;
  if (t) renderPara(t.di, t.pi);
}
function fillPop() {
  const q = $('#popq').value.trim();
  const fq = fold(q);
  const items = [];
  const list = [...Q.walk(S.p.tree)];
  if (!q && S.active && Q.findCode(S.p, S.active)) items.push({ type: 'code', id: S.active, depth: 0, hint: 'code actif' });
  for (const { node, depth } of list) {
    if (fq && !fold(node.label).includes(fq)) continue;
    if (!q && node.id === S.active) continue;
    items.push({ type: 'code', id: node.id, depth: fq ? 0 : depth, hint: fq ? Q.codePath(S.p, node.id) : '' });
  }
  if (q && !locked() && !list.some(({ node }) => fold(node.label) === fq)) items.push({ type: 'create', label: q });
  S.popItems = items;
  S.popSel = 0;
  drawPop();
}
function drawPop() {
  $('#poplist').innerHTML = S.popItems.map((it, i) => {
    if (it.type === 'create') return `<div class="pitem create${i === S.popSel ? ' sel' : ''}" data-i="${i}">＋ Créer le code « ${esc(it.label)} »</div>`;
    return `<div class="pitem${i === S.popSel ? ' sel' : ''}" data-i="${i}" style="padding-left:${8 + it.depth * 14}px"><i class="dot" style="background:${color(it.id)}"></i>${esc(codeLabel(it.id))}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</div>`;
  }).join('') || `<div class="muted" style="padding:6px">${locked() ? 'Arbre verrouillé : aucun code ne correspond.' : 'Tapez le nom d’un code pour le créer.'}</div>`;
  const sel = $('#poplist .sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}
async function applyPop(i) {
  const it = S.popItems[i];
  const t = S.pending;
  if (!it || !t) return;
  if (!S.coder && !(await ensureCoder())) return;
  const pa = S.p.docs[t.di].paras[t.pi];
  $('#pop').hidden = true;
  S.pending = null;
  let id = it.id;
  mutate(() => {
    if (it.type === 'create') { id = Q.addCode(S.p, it.label).id; log('création', ref(id)); }
    Q.addCoding(pa, [id], S.coder, t.quote, t.occ);
  }, it.type === 'create' ? null : t);
  S.active = id;
  renderTree();
  if (it.type !== 'create') renderPara(t.di, t.pi);
}

// ---------- arbre : opérations ----------
const motifField = '<label class="f">Motif (facultatif, gardé dans le journal de l’arbre)</label><input type="text" id="motif" data-nofocus placeholder="Pourquoi ce changement ?">';
async function codeAction(kind, id) {
  const n = Q.findCode(S.p, id);
  if (!n) return;
  const used = (Q.counts(S.p).seg[id] || 0);
  if (kind === 'ex') return showExtracts(id);
  if (kind === 'memo') return codeMemoDialog(id);
  if (locked()) return toast('L’arbre de codes est verrouillé', true);
  if (kind === 'sub') {
    const label = await ask(`Sous-code de « ${n.label} »`, 'Nom du sous-code');
    if (label && label.trim()) { S.collapsed.delete(id); mutate(() => { const c = Q.addCode(S.p, label.trim(), id); S.active = c.id; log('création', `${ref(c.id)} sous ${ref(id)}`); }); }
  }
  if (kind === 'ren') {
    const label = await ask('Renommer le code', 'Nouveau nom', n.label, { hint: 'L’identifiant du code dans le fichier (<span class="kbd">#' + esc(n.id) + '</span>) ne change pas : vos codages restent attachés.' });
    if (label && label.trim() && label.trim() !== n.label) mutate(() => { const old = n.label; n.label = label.trim(); log('renommage', `« ${old} » → « ${n.label} » (#${n.id})`); });
  }
  if (kind === 'def') {
    const def = await ask(`Définition de « ${n.label} »`, 'Quand appliquer ce code ?', n.def, { textarea: true, hint: 'Une bonne définition dit ce que le code désigne, donne un exemple typique et précise ce qui n’en relève pas. Elle aide à coder de façon constante et à comparer avec un·e collègue. Pour vos réflexions d’analyse, utilisez plutôt le mémo du code (🗒).' });
    if (def !== null && def.trim() !== n.def) mutate(() => { const had = !!n.def; n.def = def.trim(); log('définition', `${ref(id)} : définition ${!n.def ? 'effacée' : had ? 'modifiée' : 'ajoutée'}`); });
  }
  if (kind === 'ori') {
    const o = Q.originOf(n), th = (n.fields && n.fields.theorie) || '';
    const opt = (v, t, d) => `<label class="oriopt"><input type="radio" name="ori" value="${v}" ${o === v ? 'checked' : ''}> <b>${t}</b><span class="muted"> — ${d}</span></label>`;
    const v = await dialog({ title: `Origine de « ${n.label} »`, html: `<div class="modes">
        ${opt('inductif', 'Inductif', 'le code est né de la lecture des entretiens')}
        ${opt('deductif', 'Déductif', 'le code vient de la théorie, d’une hypothèse ou de la question de recherche')}
        ${opt('', 'Non précisée', '')}</div>
      <label class="f">Théorie ou auteur·e de référence <span class="muted">(facultatif, surtout pour un code déductif)</span></label>
      <input type="text" id="oritheo" value="${esc(th)}" placeholder="par exemple : Bourdieu, capital culturel">
      <p class="muted">Noter l’origine des codes aide à distinguer ce que vous cherchiez au départ de ce que les données vous ont appris. Elle est écrite dans le fichier sous le code (<span class="kbd">origine:: inductif</span>), comme dans QDA-md.</p>`,
      buttons: [{ label: 'Enregistrer', value: 'ok', primary: true }, { label: 'Annuler', value: '' }] });
    if (v !== 'ok') return;
    const no = ($('input[name=ori]:checked') || { value: '' }).value, nth = $('#oritheo').value.replace(/\s+/g, ' ').trim();
    if (no === o && nth === th) return;
    mutate(() => {
      Q.setOrigin(n, no, nth);
      log('origine', `${ref(id)} : ${no ? (no === 'inductif' ? 'inductif' : 'déductif') : 'origine non précisée'}${nth ? ` · théorie : ${nth}` : ''}`);
    });
    return;
  }
  if (kind === 'del') {
    const v = await dialog({ title: 'Supprimer le code', html: `<p>Supprimer « <b>${esc(n.label)}</b> » ?</p><p>${used ? `Il est utilisé <b>${used}</b> fois : ces codages seront retirés.` : 'Il n’est utilisé nulle part.'}${n.children.length ? ' Ses sous-codes remontent d’un niveau.' : ''}</p>${motifField}<p class="muted">Vous pouvez annuler avec Ctrl+Z.</p>`, buttons: [{ label: 'Supprimer', value: 'ok', primary: true, danger: true }, { label: 'Annuler', value: '' }] });
    if (v === 'ok') {
      const motif = $('#motif').value, desc = ref(id);
      mutate(() => { const k = Q.deleteCode(S.p, id); log('suppression', `${desc}${k ? ` · ${k} codage(s) retiré(s)` : ''}`, motif); });
      if (S.active === id) S.active = null;
      renderTree();
    }
  }
  if (kind === 'mrg') {
    const banned = new Set([id, ...Q.descendants(n)]);
    const opts = [...Q.walk(S.p.tree)].filter((x) => !banned.has(x.node.id)).map((x) => `<option value="${esc(x.node.id)}">${'  '.repeat(x.depth)}${esc(x.node.label)}</option>`).join('');
    if (!opts) return toast('Aucun autre code dans lequel fusionner');
    const v = await dialog({ title: `Fusionner « ${n.label} »`, html: `<p>Tous les codages de « <b>${esc(n.label)}</b> » (${used}) passeront au code choisi, puis « ${esc(n.label)} » disparaîtra. Ses sous-codes iront sous le code choisi, et son mémo sera ajouté à celui du code choisi.</p><label class="f">Fusionner dans</label><select id="mrgto" size="9">${opts.replace('<option', '<option selected')}</select>${motifField}`, buttons: [{ label: 'Fusionner', value: 'ok', primary: true }, { label: 'Annuler', value: '' }] });
    if (v === 'ok') {
      const to = $('#mrgto').value, motif = $('#motif').value, desc = ref(id);
      const k = mutate(() => { const c = Q.mergeCodes(S.p, id, to); log('fusion', `${desc} fusionné dans ${ref(to)} · ${c} codage(s)`, motif); return c; });
      if (k !== false) { S.active = to; renderTree(); toast(`${k} codage(s) déplacé(s) vers « ${codeLabel(to)} »`); }
    }
  }
}
function codeMemoDialog(id) {
  const n = Q.findCode(S.p, id);
  ask(`Mémo — ${n.label}`, 'Mémo du code', n.memo, {
    textarea: true, big: true,
    before: `<p class="muted">${esc(Q.codePath(S.p, id))}</p>${n.def ? `<div class="notice info" style="white-space:pre-wrap"><b>Définition</b>\n${esc(n.def)}</div>` : ''}`,
    hint: 'Le mémo accompagne l’analyse : interprétations, hypothèses, liens avec vos lectures, cas limites rencontrés, questions à discuter. Contrairement à la définition, il évolue librement, et il reste modifiable quand l’arbre est verrouillé.',
  }).then((v) => {
    if (v !== null && v.trim() !== (n.memo || '').trim()) mutate(() => { n.memo = v.replace(/\s+$/, ''); });
  });
}
async function newCodeDialog() {
  if (locked()) return toast('L’arbre de codes est verrouillé', true);
  const opts = [...Q.walk(S.p.tree)].map((x) => `<option value="${esc(x.node.id)}">${'  '.repeat(x.depth + 1)}${esc(x.node.label)}</option>`).join('');
  const v = await dialog({ title: 'Nouveau code', html: `<label class="f">Nom</label><input type="text" id="ncl"><label class="f">Placer</label><select id="ncp"><option value="">au premier niveau</option>${opts}</select><label class="f">Définition (facultative)</label><textarea id="ncd" placeholder="Quand appliquer ce code ? Exemple typique ? Ce qui n’en relève pas ?"></textarea>`, buttons: [{ label: 'Créer', value: 'ok', primary: true }, { label: 'Annuler', value: '' }] });
  if (v !== 'ok') return;
  const label = $('#ncl').value.trim();
  if (!label) return;
  const parent = $('#ncp').value || null, def = $('#ncd').value.trim();
  mutate(() => { const c = Q.addCode(S.p, label, parent, def); S.active = c.id; log('création', ref(c.id) + (parent ? ` sous ${ref(parent)}` : '')); });
}
async function lockDialog() {
  if (!locked()) {
    const v = await dialog({ title: 'Verrouiller l’arbre de codes', html: `<p>Une fois l’arbre verrouillé, on peut toujours <b>coder</b> avec les codes existants et écrire des <b>mémos</b>, mais plus créer, renommer, définir, déplacer, fusionner ou supprimer de codes.</p>
      <p>Utile quand l’enseignant·e distribue un livre de codes imposé, ou quand un binôme a stabilisé son arbre avant de coder séparément.</p>
      <label class="f">Code de déverrouillage (facultatif)</label><input type="text" id="lockcode" placeholder="laisser vide : tout le monde peut déverrouiller">
      <p class="muted">Ce verrou est pédagogique : le fichier reste un texte modifiable à la main. Il empêche les modifications par erreur, pas un contournement volontaire.</p>`, buttons: [{ label: 'Verrouiller', value: 'ok', primary: true }, { label: 'Annuler', value: '' }] });
    if (v !== 'ok') return;
    const code = $('#lockcode').value.trim();
    const val = code ? await hashCode(code) : 'oui';
    mutate(() => { S.p.meta.verrou = val; log('verrouillage', `arbre verrouillé${code ? ' avec un code' : ''}`); });
    toast('Arbre de codes verrouillé');
    return;
  }
  const v = S.p.meta.verrou;
  if (/^(sha256|fnv):/.test(v)) {
    const code = await ask('Déverrouiller l’arbre de codes', 'Code de déverrouillage');
    if (code === null) return;
    if ((await hashCode(code.trim(), v.split(':')[0])) !== v) return toast('Code incorrect', true);
  } else if (!(await confirmDlg('Déverrouiller l’arbre de codes', '<p>L’arbre pourra de nouveau être modifié.</p>', 'Déverrouiller'))) return;
  mutate(() => { delete S.p.meta.verrou; log('déverrouillage', 'arbre déverrouillé'); });
  toast('Arbre de codes déverrouillé');
}
async function hashCode(code, algo = null) {
  if ((algo === null || algo === 'sha256') && window.crypto && crypto.subtle) {
    try {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('qda-md-etude:' + code));
      return 'sha256:' + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch { /* repli ci-dessous */ }
  }
  let h = 0x811c9dc5;
  for (const ch of 'qda-md-etude:' + code) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'fnv:' + h.toString(16);
}
function journalDialog() {
  let type = '';
  const draw = () => {
    const J = S.p.journal;
    const types = [...new Set(J.filter((e) => e.date).map((e) => e.type))];
    const list = J.map((e, i) => ({ e, i })).filter(({ e }) => !type || e.type === type).reverse();
    $('#dlgbody').innerHTML = `<p class="muted">Chaque modification de l’arbre est notée ici et dans le fichier du projet (section « Journal de l’arbre de codes »). Ajouter un motif aide à reconstituer, au moment de rédiger, comment votre grille d’analyse s’est construite.</p>
      <p>${J.length} opération(s) · <select id="jtype"><option value="">tous les types</option>${types.map((t) => `<option ${t === type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></p>
      ${list.map(({ e, i }) => !e.date ? `<div class="jline"><span>${esc(e.raw)}</span></div>` : `<div class="jline"><span class="jd">${esc(e.date)}</span><span><span class="badge">${esc(e.type)}</span> ${esc(e.desc)} <span class="muted">@${esc(e.coder || '?')}</span>${e.motif ? `<br><span class="jm">Motif : ${esc(e.motif)}</span>` : ''}</span><button type="button" class="small" data-jm="${i}">${e.motif ? '✎ motif' : '＋ motif'}</button></div>`).join('') || '<p class="muted">Aucune opération pour l’instant.</p>'}`;
    $('#jtype').onchange = (ev) => { type = ev.target.value; draw(); };
    $$('[data-jm]').forEach((b) => (b.onclick = () => {
      const e = S.p.journal[+b.dataset.jm];
      const cur = e.motif || '';
      const v = prompt('Motif de cette opération', cur);
      if (v !== null && v.trim() !== cur) { mutate(() => { const je = S.p.journal[+b.dataset.jm]; je.motif = v.trim(); delete je.raw; }); draw(); }
    }));
  };
  dialog({ title: 'Journal de l’arbre de codes', wide: true, html: '', onOpen: draw, buttons: [{ label: 'Fermer', value: 'ok', primary: true }, { label: 'Exporter (.md)', value: 'exp' }] }).then((v) => {
    if (v === 'exp') download(`# Journal de l’arbre de codes — ${S.p.meta.titre}\n\n${S.p.journal.map((e) => (e.date ? Q.journalLine(e) : e.raw)).join('\n')}\n`, `journal-arbre_${safeName(S.p.meta.titre)}.md`);
  });
}

// ---------- locuteurs et fiche ----------
const ROLE_LABELS = { [Q.ROLE_R]: 'répondant·e', [Q.ROLE_I]: 'intervieweur·euse', participant: 'participant·e', autre: 'autre' };
const ROLE_OPTS = (r) => Q.ROLES.map((x) => `<option value="${x}" ${(Q.ROLES.includes(r) ? r : Q.ROLE_R) === x ? 'selected' : ''}>${ROLE_LABELS[x]}</option>`).join('');
function candRows(cands, prefix) {
  return cands.map((c, i) => `<div class="cand"><input type="checkbox" data-${prefix}acc="${i}" ${c.accepted ? 'checked' : ''}>
    <span title="${esc(c.variants ? c.variants.join(', ') : c.name)}">« ${esc(c.name)} : » <span class="muted">${c.count} fois</span></span>
    <input type="text" data-nofocus data-${prefix}tgt="${i}" value="${esc(c.target)}" title="Nom retenu (donnez le même nom à deux variantes pour les fusionner)">
    <select data-${prefix}role="${i}">${ROLE_OPTS(c.role)}</select></div>`).join('');
}
function bindCands(root, cands, prefix) {
  root.addEventListener('input', (e) => {
    const t = e.target;
    const i = t.dataset[prefix + 'acc'] ?? t.dataset[prefix + 'tgt'] ?? t.dataset[prefix + 'role'];
    if (i === undefined) return;
    const c = cands[+i];
    if (t.dataset[prefix + 'acc'] !== undefined) c.accepted = t.checked;
    if (t.dataset[prefix + 'tgt'] !== undefined) c.target = t.value;
    if (t.dataset[prefix + 'role'] !== undefined) c.role = t.value;
  });
}
/** Champs de caractéristiques : âge, genre, profession, autres (« clé: valeur ; … »). key identifie la personne. */
function attrFields(attrs, key) {
  const a = attrs || {};
  const others = Q.formatAttrs(Object.fromEntries(Object.entries(a).filter(([k]) => !Q.ATTR_KEYS.includes(k))));
  return `<div class="attrs">${Q.ATTR_KEYS.map((k) => `<label>${esc(k[0].toUpperCase() + k.slice(1))}<input type="text" data-nofocus data-attr="${esc(key)}" data-ak="${esc(k)}" value="${esc(a[k] || '')}"></label>`).join('')}
    <label class="wide">Autres caractéristiques<input type="text" data-nofocus data-attr="${esc(key)}" data-ak="__autres" value="${esc(others)}" placeholder="niveau d’études: master ; commune: Namur"></label></div>`;
}
/** Lit les champs de caractéristiques d'un conteneur : { clé de personne: attrs } */
function readAttrs(root) {
  const out = {};
  for (const inp of $$('[data-attr]', root)) {
    const o = (out[inp.dataset.attr] = out[inp.dataset.attr] || {});
    if (inp.dataset.ak === '__autres') Object.assign(o, Q.parseAttrs(inp.value));
    else if (inp.value.trim()) o[inp.dataset.ak] = inp.value.trim();
  }
  return out;
}
const MODE_LABELS = {
  respondent: 'Seul·e l’intervieweur·euse est nommé·e : les paragraphes sans nom sont les réponses de la personne interviewée',
  inherit: 'Chaque prise de parole commence par un nom (focus group) : un paragraphe sans nom prolonge la prise de parole précédente',
  none: 'Ne pas indiquer de locuteurs',
};
/** Bloc « locuteurs » commun à l'import et au dialogue Locuteurs. st = {cands, mode, resp:{name, attrs}} */
function speakerSetupHTML(st, key, { allowNone = true } = {}) {
  const modes = allowNone ? ['respondent', 'inherit', 'none'] : ['respondent', 'inherit'];
  const named = st.cands.filter((c) => c.accepted && c.role !== Q.ROLE_I && (c.target || '').trim());
  return `<div class="modes">${modes.map((m) => `<label><input type="radio" name="mode-${key}" data-mode="${m}" ${st.mode === m ? 'checked' : ''}> ${MODE_LABELS[m]}</label>`).join('')}</div>
    ${st.mode !== 'none' && st.cands.length ? `<p class="muted" style="margin:6px 0 2px">Noms repérés en début de paragraphe — décochez ce qui n’est pas un locuteur ; donnez le même nom à deux variantes pour les fusionner :</p>${candRows(st.cands, 'k')}` : ''}
    ${st.mode !== 'none' && !st.cands.length ? '<p class="muted" style="margin:6px 0 2px">Aucun nom « Prénom : » trouvé en début de paragraphe.</p>' : ''}
    ${st.mode === 'respondent' ? `<div class="respbox"><label class="f">Pseudo de la personne interviewée <span class="muted">(paragraphes sans nom)</span></label>
      <input type="text" data-nofocus data-resp="1" value="${esc(st.resp.name)}" placeholder="${esc(Q.DEFAULT_RESPONDENT)}">${attrFields(st.resp.attrs, '__resp')}</div>` : ''}
    ${st.mode !== 'none' && named.length ? `<p class="muted" style="margin:8px 0 2px">Caractéristiques des participant·es nommé·es :</p>${named.map((c) => `<div class="respbox"><b>${esc(c.target)}</b>${attrFields(c.attrs, 'c:' + st.cands.indexOf(c))}</div>`).join('')}` : ''}`;
}
/** Branche les événements du bloc ; redraw() redessine quand un choix change la structure. */
function bindSpeakerSetup(root, st, redraw) {
  bindCands(root, st.cands, 'k');
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.resp) st.resp.name = t.value;
    if (t.dataset.attr) {
      const all = readAttrs(root);
      st.resp.attrs = all.__resp || {};
      st.cands.forEach((c, i) => { if (all['c:' + i]) c.attrs = all['c:' + i]; });
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.mode) {
      st.mode = t.dataset.mode;
      if (st.mode === 'respondent') st.cands.forEach((c) => { if (c.accepted && st.cands.filter((x) => x.accepted).length === 1) c.role = Q.ROLE_I; });
      redraw();
    } else if (t.dataset.kacc !== undefined || t.dataset.krole !== undefined) redraw();
    else if (t.dataset.ktgt !== undefined) redraw();
  });
}
function newSpeakerSetup(doc, isIramuteq = false) {
  const cands = Q.detectSpeakers(doc);
  const mode = isIramuteq ? 'none' : Q.suggestMode(doc, cands);
  if (mode === 'respondent' && cands.filter((c) => c.accepted).length === 1) cands.forEach((c) => { if (c.accepted) c.role = Q.ROLE_I; });
  cands.forEach((c) => (c.attrs = c.attrs || {}));
  return { cands, mode, resp: { name: '', attrs: {} } };
}
function speakersDialog() {
  const di = S.cur;
  let st = null;
  const draw = () => {
    const d = S.p.docs[di];
    const counts = {};
    d.paras.forEach((pa) => { if (pa.speaker) counts[pa.speaker] = (counts[pa.speaker] || 0) + 1; });
    const none = d.paras.filter((pa) => !pa.speaker).length;
    if (!st) { st = newSpeakerSetup(d); if (!d.speakers.length && st.mode === 'none') st.mode = 'respondent'; }
    const m = Q.speakerMatrix({ docs: [d], tree: S.p.tree }, mineFilter());
    const usedCodes = m.codes.filter((c) => m.rows.some((r) => r.n[c.id]));
    $('#dlgbody').innerHTML = `
      <h3 style="font-size:14px;margin:0 0 6px">Locuteurs de ce document</h3>
      ${d.speakers.length ? `${d.speakers.map((s, i) => `<div class="spkrow"><div class="spkhead"><input type="text" data-nofocus data-sname="${i}" value="${esc(s.name)}"><select data-srole="${i}">${ROLE_OPTS(s.role)}</select><span class="muted">${counts[s.name] || 0} paragraphe(s)</span></div>${attrFields(s.attrs, 's:' + i)}</div>`).join('')}
        <p class="muted">Pour fusionner deux locuteurs (par exemple « E » et « Enquêteur »), donnez-leur le même nom. Pour changer le locuteur d’un seul paragraphe, cliquez sur son nom dans le texte.</p>
        <p><button type="button" class="primary" id="spksave">Enregistrer noms, rôles et caractéristiques</button></p>`
        : '<p class="muted">Aucun locuteur n’est encore indiqué dans ce document.</p>'}
      ${st.cands.length || none ? `<h3 style="font-size:14px;margin:16px 0 6px">Attribuer les locuteurs${none ? ` — ${none} paragraphe(s) sans locuteur` : ''}</h3>
        <div id="spksetup">${speakerSetupHTML(st, 'dlg', { allowNone: false })}</div>
        <p class="muted">Les noms repérés en début de paragraphe sont retirés du texte et deviennent le locuteur ; vos codages sont recalés. Les paragraphes qui ont déjà un locuteur ne changent pas.</p>
        <p><button type="button" id="candapply">Appliquer</button></p>` : ''}
      ${usedCodes.length && d.speakers.length ? `<h3 style="font-size:14px;margin:16px 0 6px">Qui mobilise quels codes ?</h3><p class="muted">Nombre de paragraphes de chaque locuteur portant le code${mineFilter() ? ' (vos codages)' : ''}.</p>
        <div style="overflow:auto"><table class="t"><tr><th>Locuteur</th><th class="num">¶</th>${usedCodes.map((c) => `<th class="num" title="${esc(Q.codePath(S.p, c.id))}">${esc(c.label)}</th>`).join('')}</tr>
        ${m.rows.map((r) => `<tr><td>${esc(r.speaker)}${r.role === Q.ROLE_I ? ' <span class="muted">(int.)</span>' : ''}</td><td class="num">${r.paras}</td>${usedCodes.map((c) => `<td class="num ${r.n[c.id] ? '' : 'zero'}">${r.n[c.id] || 0}</td>`).join('')}</tr>`).join('')}</table></div>` : ''}`;
    const setup = $('#spksetup');
    if (setup) bindSpeakerSetup(setup, st, () => { setup.innerHTML = speakerSetupHTML(st, 'dlg', { allowNone: false }); });
    const ap = $('#candapply');
    if (ap) ap.onclick = () => {
      const n = mutate(() => Q.applySpeakers(S.p.docs[di], st.cands, { mode: st.mode, respondent: st.resp }));
      if (n !== false) toast(`${n} paragraphe(s) attribué(s)`);
      st = null;
      draw();
    };
    const sv = $('#spksave');
    if (sv) sv.onclick = () => {
      const attrs = readAttrs($('#dlgbody'));
      const edits = d.speakers.map((s, i) => ({ from: s.name, to: $(`[data-sname="${i}"]`).value.trim(), role: $(`[data-srole="${i}"]`).value, attrs: attrs['s:' + i] || {} }));
      mutate(() => {
        const doc = S.p.docs[di];
        for (const e of edits) {
          if (!e.to) continue;
          if (e.to !== e.from) Q.renameSpeaker(doc, e.from, e.to, e.role);
        }
        for (const e of edits) {
          if (!e.to) continue;
          const s = doc.speakers.find((x) => x.name === e.to);
          if (!s) continue;
          s.role = e.role;
          Q.setSpeakerAttrs(doc, e.to, { ...(edits.filter((x) => x.to === e.to && x !== e).reduce((a, x) => ({ ...a, ...x.attrs }), {})), ...e.attrs });
        }
      });
      toast('Locuteurs mis à jour');
      draw();
    };
  };
  dialog({ title: `Locuteurs — ${S.p.docs[di].name}`, wide: true, html: '', onOpen: draw });
}
// mutate remplace S.p par une copie seulement lors des annulations ; d reste valide entre-temps.
async function paraSpeakerDialog(di, pi) {
  const d = S.p.docs[di], pa = d.paras[pi];
  const opts = d.speakers.map((s) => `<option ${s.name === pa.speaker ? 'selected' : ''} value="${esc(s.name)}">${esc(s.name)}${s.role === Q.ROLE_I ? ' (intervieweur)' : ''}</option>`).join('');
  const v = await dialog({ title: `Locuteur de ${pa.label}`, html: `<p class="prev">${esc(pa.text.slice(0, 200))}</p>
      <label class="f">Locuteur</label><select id="psel"><option value="">— aucun —</option>${opts}<option value="__new">Nouveau locuteur…</option></select>
      <div id="pnew" hidden><label class="f">Nom</label><input type="text" id="pname" data-nofocus><label class="f">Rôle</label><select id="prole"><option value="${Q.ROLE_R}">répondant·e</option><option value="${Q.ROLE_I}">intervieweur·euse</option></select></div>
      <p><label><input type="checkbox" id="pnext" checked> appliquer aussi aux paragraphes suivants qui ont le même locuteur actuel, jusqu’au prochain changement</label></p>`,
  buttons: [{ label: 'Valider', value: 'ok', primary: true }, { label: 'Annuler', value: '' }],
  onOpen: () => { $('#psel').onchange = (e) => { $('#pnew').hidden = e.target.value !== '__new'; if (e.target.value === '__new') $('#pname').focus(); }; } });
  if (v !== 'ok') return;
  let name = $('#psel').value, role = null;
  if (name === '__new') { name = $('#pname').value.trim(); role = $('#prole').value; if (!name) return; }
  const next = $('#pnext').checked;
  mutate(() => {
    const old = pa.speaker;
    const target = name || null;
    pa.speaker = target;
    if (next) for (let k = pi + 1; k < d.paras.length && d.paras[k].speaker === old; k++) d.paras[k].speaker = target;
    if (target) Q.addSpeaker(d, target, role);
    Q.pruneSpeakers(d);
  });
}
async function ficheDialog() {
  const d = curDoc();
  if (!d) return;
  const extra = Object.keys(d.meta).filter((k) => !Q.META_KEYS.includes(k));
  const v = await dialog({ title: `Fiche — ${d.name}`, html: `<div class="grid2">
      <div><label class="f">Code du document</label><input type="text" data-nofocus id="m_code" value="${esc(d.code)}" maxlength="64"></div>
      <div><p class="muted" style="margin-top:22px">Court et stable (<span class="kbd">E01</span>, <span class="kbd">FG1</span>) : il préfixe les identifiants des paragraphes et nomme le fichier de l’entretien dans l’export en dossier.</p></div>
      <div><label class="f">Date de l’entretien</label><input type="date" id="m_date" value="${esc(/^\d{4}-\d\d-\d\d$/.test(d.meta.date || '') ? d.meta.date : '')}"></div>
      <div><label class="f">Lieu</label><input type="text" data-nofocus id="m_lieu" value="${esc(d.meta.lieu || '')}" placeholder="ville, domicile, café, visio…"></div>
      <div><label class="f">Pseudo de la personne interviewée</label><input type="text" data-nofocus id="m_pseudo" value="${esc(d.meta.pseudo || '')}" placeholder="jamais le vrai nom"></div>
      <div><label class="f">Intervieweur·euse</label><input type="text" data-nofocus id="m_intervieweur" value="${esc(d.meta.intervieweur || '')}"></div></div>
      ${extra.map((k, i) => `<label class="f">${esc(k)}</label><input type="text" data-nofocus data-mx="${i}" value="${esc(d.meta[k])}">`).join('')}
      <details><summary>Ajouter un champ (durée, âge, profession…)</summary><div class="grid2"><div><label class="f">Nom du champ</label><input type="text" data-nofocus id="m_nk"></div><div><label class="f">Valeur</label><input type="text" data-nofocus id="m_nv"></div></div></details>
      <p class="muted">La fiche est reprise dans les extraits et dans les exports CSV. Pensez à l’anonymat : un pseudo, pas de nom réel, pas d’adresse précise.</p>`,
  buttons: [{ label: 'Enregistrer', value: 'ok', primary: true }, { label: 'Annuler', value: '' }] });
  if (v !== 'ok') return;
  const meta = {};
  for (const k of Q.META_KEYS) meta[k] = $('#m_' + k).value.trim();
  if (/^\d{4}-\d\d-\d\d$/.test(d.meta.date || '') === false && d.meta.date && !meta.date) meta.date = d.meta.date;
  extra.forEach((k, i) => (meta[k] = $(`[data-mx="${i}"]`).value.trim()));
  const nk = $('#m_nk').value.trim().replace(/::/g, ':');
  if (nk) meta[nk] = $('#m_nv').value.trim();
  const code = $('#m_code').value.trim();
  if (code !== d.code) {
    const err = Q.checkDocCode(S.p, code, d);
    if (err) { toast(err, true); return; }
  }
  mutate(() => {
    for (const k of Object.keys(meta)) { if (meta[k]) d.meta[k] = meta[k]; else delete d.meta[k]; }
    if (code !== d.code) { const old = Q.renameDocCode(S.p, d, code); log('code de document', `« ${d.name} » : ${old} → ${code}`); }
  });
}

// ---------- extraits ----------
function showExtracts(id) {
  const n = Q.findCode(S.p, id);
  let withChildren = false, coder = mineFilter() || '';
  const draw = () => {
    const ex = Q.extracts(S.p, id, { withChildren, coder: coder || null });
    const docs = new Set(ex.map((e) => e.doc.name)).size;
    const cs = Q.coders(S.p);
    const body = ex.slice(0, 400).map((e, k) => {
      const t = e.para.text;
      let txt;
      if (e.coding.quote === null) txt = esc(t.length > 700 ? t.slice(0, 700) + '…' : t) + ' <span class="muted">(paragraphe entier)</span>';
      else if (e.span.orphan) txt = `<mark>${esc(e.coding.quote)}</mark> <span class="muted">⚠ citation introuvable dans le texte actuel</span>`;
      else {
        const a = Math.max(0, e.span.start - 180), b = Math.min(t.length, e.span.end + 180);
        txt = (a > 0 ? '…' : '') + esc(t.slice(a, e.span.start)) + `<mark>${esc(e.coding.quote)}</mark>` + esc(t.slice(e.span.end, b)) + (b < t.length ? '…' : '');
      }
      return `<div class="ex"><div class="exh"><b>${esc(e.doc.name)}</b> › ${esc(e.para.label)}${e.para.speaker ? ` · <b>${esc(e.para.speaker)}</b>` : ''} · @${esc(e.coding.coder)}${withChildren ? ' · ' + e.codes.map((c) => esc(codeLabel(c))).join(', ') : ''}<button type="button" class="small" data-go="${k}">Aller au texte</button></div><div class="ext">${txt}</div></div>`;
    }).join('');
    $('#dlgbody').innerHTML = `<p class="muted">${esc(Q.codePath(S.p, id))}</p>
      ${n.def ? `<div class="notice info" style="white-space:pre-wrap">${esc(n.def)}</div>` : '<div class="notice">Ce code n’a pas encore de définition.</div>'}
      ${n.memo ? `<details><summary><b>Mémo du code</b></summary><div class="notice" style="white-space:pre-wrap;background:#fffbe9">${esc(n.memo)}</div></details>` : ''}
      <p><label><input type="checkbox" id="exch" ${withChildren ? 'checked' : ''} ${n.children.length ? '' : 'disabled'}> inclure les sous-codes</label>
      &nbsp; Codeur : <select id="excd"><option value="">tous</option>${cs.map((c) => `<option ${c === coder ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      &nbsp; <b>${ex.length}</b> extrait(s) dans <b>${docs}</b> document(s) &nbsp; <button type="button" class="small" id="exmemo">🗒 ${n.memo ? 'Modifier le mémo' : 'Écrire un mémo'}</button></p>${body}${ex.length > 400 ? '<p class="muted">Seuls les 400 premiers extraits sont affichés ; l’export les contient tous.</p>' : ''}`;
    $('#exch').onchange = (ev) => { withChildren = ev.target.checked; draw(); };
    $('#excd').onchange = (ev) => { coder = ev.target.value; draw(); };
    $('#exmemo').onclick = () => { $('#dlg').close(); codeMemoDialog(id); };
    $$('[data-go]').forEach((b) => (b.onclick = () => { const e = ex[+b.dataset.go]; $('#dlg').close(); goTo(S.p.docs.indexOf(e.doc), e.doc.paras.indexOf(e.para)); }));
  };
  dialog({ title: `Extraits — ${n.label}`, html: '', wide: true, buttons: [{ label: 'Fermer', value: 'ok', primary: true }, { label: 'Exporter en .md', value: 'exp' }], onOpen: draw }).then((v) => {
    if (v === 'exp') download(Q.extractsMarkdown(S.p, id, { withChildren, coder: coder || null }), `extraits_${id}.md`);
  });
}

// ---------- import ----------
/** Lit un projet en dossier (fichiers d'un dossier choisi), un .zip ou un .qda.md → projet. */
async function readProjectFiles(files) {
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    const list = await Q.unzipAll(await files[0].arrayBuffer(), (n) => /\.md$/i.test(n));
    return { p: Q.joinProject(list), name: files[0].name };
  }
  if (files.length === 1 && /\.md$/i.test(files[0].name) && !/(^|\/)arbre\.md$/i.test(files[0].webkitRelativePath || files[0].name)) {
    const text = await readTextFile(files[0]);
    if (!looksProject(text)) throw new Error(`${files[0].name} n’est pas un projet.`);
    return { p: Q.parseProject(text), name: files[0].name };
  }
  const md = files.filter((f) => /\.md$/i.test(f.name));
  const list = await Promise.all(md.map(async (f) => ({ path: f.webkitRelativePath || f.name, text: await readTextFile(f) })));
  const root = (md[0] && md[0].webkitRelativePath || '').split('/')[0];
  return { p: Q.joinProject(list), name: root || 'dossier' };
}
function importDialog(preFiles = null, startTab = 'f') {
  const pending = [];
  let proj = null;
  const drawProj = () => {
    const box = $('#qinfo');
    if (!box) return;
    if (!proj) { box.innerHTML = ''; return; }
    if (proj.error) { box.innerHTML = `<div class="notice">${esc(proj.error)}</div>`; return; }
    const p = proj.p;
    const nCod = [...Q.allParas(p)].reduce((a, x) => a + x.para.codings.length, 0);
    const rep = Q.mergeInto(Q.snapshot(S.p), p, { addDocs: true });
    box.innerHTML = `<div class="notice info"><b>${esc(p.meta.titre || proj.name)}</b> — ${p.docs.length} document(s), ${Q.allCodes(p).length} code(s), ${nCod} codage(s)${Q.coders(p).length ? ` par ${Q.coders(p).map((c) => '@' + esc(c)).join(', ')}` : ''}${p.converted === 'qda-md' ? '<br>Ancien format QDA-md : il sera converti au format qda.md.' : ''}</div>
      <table class="t"><tr><td>Documents ajoutés</td><td class="num">${rep.docs.length}</td></tr><tr><td>Codes ajoutés à l’arbre</td><td class="num">${rep.codes.length}</td></tr><tr><td>Codages ajoutés</td><td class="num">${rep.codings}</td></tr><tr><td>Déjà présents</td><td class="num">${rep.already}</td></tr><tr><td>Codages non repris (texte différent)</td><td class="num">${rep.orphans.length}</td></tr></table>
      ${p.warnings.length ? `<details><summary>Remarques (${p.warnings.length})</summary><ul>${p.warnings.slice(0, 30).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}`;
  };
  const loadProj = async (files) => {
    try { proj = await readProjectFiles(files); } catch (e) { proj = { error: e.message }; }
    drawProj();
  };
  const prep = (d, isIra = false) => { d._st = newSpeakerSetup(d, isIra); return d; };
  const card = (d, i) => `<div class="exh"><b>${esc(d.name)}</b> · ${d.paras.length} paragraphe(s)${d.error ? ` · <span style="color:var(--bad)">${esc(d.error)}</span>` : ''}<button type="button" class="small" data-del="${i}">Retirer</button></div>
      ${d.paras[0] ? `<div class="prev">${esc(d.paras[0].text.slice(0, 220))}${d.paras.length > 1 ? '<br>' + esc(d.paras[1].text.slice(0, 140)) : ''}</div>` : ''}
      ${d._st ? `<details open><summary><b>Locuteurs</b></summary><div data-setup="${i}">${speakerSetupHTML(d._st, 'imp' + i)}</div></details>` : ''}
      ${d.paras.length ? `<details><summary>Fiche de l’entretien (facultatif)</summary><div class="grid2">
        <div><label class="f">Date</label><input type="date" data-meta="date" data-i="${i}" value="${esc(d.meta.date || '')}"></div>
        <div><label class="f">Lieu</label><input type="text" data-nofocus data-meta="lieu" data-i="${i}" value="${esc(d.meta.lieu || '')}"></div>
        <div><label class="f">Pseudo de la personne interviewée</label><input type="text" data-nofocus data-meta="pseudo" data-i="${i}" value="${esc(d.meta.pseudo || '')}" placeholder="repris du pseudo ci-dessus si vide"></div>
        <div><label class="f">Intervieweur·euse</label><input type="text" data-nofocus data-meta="intervieweur" data-i="${i}" value="${esc(d.meta.intervieweur || '')}"></div></div></details>` : ''}`;
  const bindCard = (i) => {
    const box = $(`[data-setup="${i}"]`);
    if (box) bindSpeakerSetup(box, pending[i]._st, () => { box.innerHTML = speakerSetupHTML(pending[i]._st, 'imp' + i); });
  };
  const drawList = () => {
    $('#implist').innerHTML = pending.map((d, i) => `<div class="ex" data-pd="${i}">${card(d, i)}</div>`).join('');
    $$('[data-del]', $('#implist')).forEach((b) => (b.onclick = () => { pending.splice(+b.dataset.del, 1); drawList(); }));
    pending.forEach((_, i) => bindCard(i));
  };
  const addFiles = async (files) => {
    for (const f of files) {
      try {
        let text;
        if (/\.zip$/i.test(f.name)) { tab('q'); await loadProj([f]); continue; }
        if (/\.docx$/i.test(f.name)) text = await Q.docxToText(await f.arrayBuffer());
        else if (/\.doc$|\.pdf$|\.odt$/i.test(f.name)) { pending.push({ name: f.name, paras: [], error: 'format non pris en charge : enregistrez-le en .docx ou .txt' }); continue; }
        else text = await readTextFile(f);
        if (looksProject(text)) { pending.push({ name: f.name, paras: [], error: 'c’est un projet : utilisez l’onglet « Projet QDA-md » pour l’ajouter à celui-ci' }); continue; }
        pending.push(prep(Q.textToDoc(f.name, text), Q.isIramuteq(text)));
      } catch (e) { pending.push({ name: f.name, paras: [], error: e.message }); }
    }
    drawList();
  };
  const addPasted = () => {
    const t = $('#ptext').value;
    if (!t.trim()) return;
    pending.push(prep(Q.textToDoc($('#pname').value.trim() || `Entretien ${S.p.docs.length + pending.length + 1}`, t), Q.isIramuteq(t)));
    $('#ptext').value = ''; $('#pname').value = '';
    drawList();
  };
  const tab = (k) => { $$('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === k)); $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== k)); $('#implist').hidden = k === 'q'; $('#imphelp').hidden = k === 'q'; };
  dialog({
    title: 'Importer', wide: true,
    html: `<div class="tabs"><button type="button" class="on" data-tab="f">Fichiers</button><button type="button" data-tab="c">Coller un texte</button><button type="button" data-tab="q">Projet QDA-md</button></div>
      <div data-pane="f"><p><button type="button" class="primary" id="impbtn">Choisir des fichiers…</button> <span class="muted">.txt ou .docx, plusieurs à la fois (ou glissez-les dans la fenêtre)</span></p></div>
      <div data-pane="c" hidden><label class="f">Nom de l’entretien</label><input type="text" data-nofocus id="pname" placeholder="Entretien 1 — Marie"><label class="f">Texte</label><textarea id="ptext" style="min-height:160px"></textarea><p><button type="button" id="padd">Ajouter à la liste</button></p></div>
      <div data-pane="q" hidden><p>Ajoutez à ce projet un <b>projet QDA-md</b> (version de recherche) ou un projet adoq exporté en dossier : le dossier qui contient <span class="kbd">arbre.md</span> et <span class="kbd">donnees/</span>, une archive <span class="kbd">.zip</span> de ce dossier, ou un autre fichier <span class="kbd">.qda.md</span>. Ses entretiens, ses codes, ses mémos et ses codages sont <b>ajoutés</b> ; rien n’est effacé dans votre projet.</p>
        <p><button type="button" class="primary" id="qdir">Choisir un dossier…</button> <button type="button" id="qzip">Choisir un .zip ou un .qda.md…</button></p><div id="qinfo"></div></div>
      <div id="implist"></div>
      <p class="muted" id="imphelp"><b>Préparer la retranscription</b> : un paragraphe par prise de parole, séparés par une ligne vide. Commencez les questions par le nom de l’intervieweur·euse (« Zoé : Comment vous informez-vous ? ») ; les paragraphes sans nom sont attribués à la personne interviewée, dont l’import demande le pseudo. En focus group, commencez chaque prise de parole par le pseudo du ou de la participant·e. Le format Iramuteq (<span class="kbd">**** *ID_…</span>) est reconnu. Le texte importé n’est plus modifié ensuite : relisez votre retranscription avant.</p>`,
    buttons: [{ label: 'Importer', value: 'ok', primary: true }, { label: 'Annuler', value: '' }],
    onOpen: () => {
      $$('[data-tab]').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
      if (startTab !== 'f') tab(startTab);
      $('#qdir').onclick = () => { const inp = $('#fileDir'); inp.value = ''; inp.onchange = () => inp.files.length && loadProj([...inp.files]); inp.click(); };
      $('#qzip').onclick = () => { const inp = $('#fileProj'); inp.value = ''; inp.onchange = () => inp.files.length && loadProj([...inp.files]); inp.click(); };
      $('#impbtn').onclick = () => { const inp = $('#fileImport'); inp.value = ''; inp.onchange = () => addFiles([...inp.files]); inp.click(); };
      $('#padd').onclick = addPasted;
      $('#implist').addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.meta) pending[+t.dataset.i].meta[t.dataset.meta] = t.value.trim();
      });
      if (preFiles) addFiles(preFiles);
    },
  }).then((v) => {
    if (v === 'ok' && $('#ptext') && $('#ptext').value.trim()) addPasted();
    const docs = pending.filter((d) => !d.error && d.paras.length);
    if (v === 'ok' && proj && proj.p) {
      const other = proj.p, wasEmpty = !S.p.docs.length && !Q.allCodes(S.p).length;
      backup(Q.serializeProject(S.p), true);
      const rep = mutate(() => {
        const r = Q.mergeInto(S.p, other, { addDocs: true, coder: S.coder });
        if (wasEmpty) for (const [k, val] of Object.entries(other.meta)) if (!['id', 'titre'].includes(k) && S.p.meta[k] === undefined) S.p.meta[k] = val;
        log('import', `projet « ${other.meta.titre || proj.name} » : ${r.docs.length} document(s), ${r.codings} codage(s)`);
        return r;
      });
      if (rep) { S.cur = Math.max(0, S.p.docs.length - rep.docs.length); renderAll(); toast(`Projet importé : ${rep.docs.length} document(s), ${rep.codes.length} code(s), ${rep.codings} codage(s)`); }
    }
    if (v !== 'ok' || !docs.length) return;
    const first = S.p.docs.length;
    let nsp = 0;
    mutate(() => {
      for (const d of docs) {
        const st = d._st;
        if (st && st.mode !== 'none') {
          nsp += Q.applySpeakers(d, st.cands, { mode: st.mode, respondent: st.resp });
          if (st.mode === 'respondent' && st.resp.name.trim() && !d.meta.pseudo) d.meta.pseudo = st.resp.name.trim();
        }
        for (const k of Object.keys(d.meta)) if (!d.meta[k]) delete d.meta[k];
        delete d._st;
        Q.addDoc(S.p, d);
      }
    });
    S.cur = first;
    renderAll();
    toast(`${docs.length} entretien(s) importé(s), ${docs.reduce((a, d) => a + d.paras.length, 0)} paragraphes${nsp ? `, ${nsp} attribués à un locuteur` : ''}`);
    if (!S.handle && S.dirty && !hasFS) setTimeout(() => toast('Pensez à cliquer sur « Enregistrer »'), 2800);
  });
}

// ---------- comparaison, accord, consensus ----------
function compareDialog(startTab = null) {
  let other = null, otherName = '';
  const kclass = (k) => (k >= 0.8 ? 'k-good' : k >= 0.6 ? 'k-mid' : 'k-bad');
  const opts = () => {
    const o = { addDocs: $('#adddocs') ? $('#adddocs').checked : true, renameCoder: {}, coder: S.coder };
    const ren = $('#rencoder') && Q.cleanCoder($('#rencoder').value);
    if (ren && S.coder) o.renameCoder[S.coder] = ren;
    return o;
  };
  const drawMerge = () => {
    const pane = $('[data-pane="m"]');
    let html = `<p>Vous avez codé les mêmes entretiens qu’un·e collègue, chacun·e dans sa copie du projet ? Ouvrez ici sa copie : ses codages seront <b>ajoutés</b> aux vôtres (rien n’est effacé), ainsi que ses mémos, sa fiche d’entretien et son journal de l’arbre. Ensuite, mesurez votre accord et construisez un codage de consensus.</p>
      <p><button type="button" class="primary" id="pickother">Choisir le fichier .qda.md du ou de la collègue…</button></p>`;
    if (other) {
      const o = opts();
      const rep = Q.mergeInto(Q.snapshot(S.p), other, o);
      const oc = Q.coders(other);
      const clash = S.coder && oc.includes(S.coder);
      html += `<div class="notice info"><b>${esc(otherName)}</b> — codeur(s) : ${oc.map((c) => '@' + esc(c)).join(', ') || 'aucun'}</div>
        ${clash ? `<div class="notice">Cette copie contient des codages signés <b>@${esc(S.coder)}</b>, votre identifiant. S’ils ont été faits par une autre personne, renommez-les : <input type="text" data-nofocus id="rencoder" size="12" placeholder="nouvel identifiant" value="${esc(o.renameCoder[S.coder] || '')}"></div>` : ''}
        <table class="t"><tr><td>Codages ajoutés</td><td class="num">${rep.codings}</td></tr><tr><td>Codages complétés par de nouveaux codes</td><td class="num">${rep.completed}</td></tr><tr><td>Déjà présents</td><td class="num">${rep.already}</td></tr><tr><td>Codes ajoutés à l’arbre</td><td class="num">${rep.codes.length}${rep.codes.length && locked() ? ' <span class="muted">(ajoutés malgré le verrou, pour ne rien perdre)</span>' : ''}</td></tr><tr><td>Mémos de codes reçus</td><td class="num">${rep.memos}</td></tr><tr><td>Entrées du journal de l’arbre reçues</td><td class="num">${rep.journal}</td></tr><tr><td>Documents ajoutés</td><td class="num">${rep.docs.length}</td></tr><tr><td>Codages non fusionnables (texte différent)</td><td class="num">${rep.orphans.length}</td></tr></table>
        <p><label><input type="checkbox" id="adddocs" ${o.addDocs ? 'checked' : ''}> ajouter aussi les entretiens absents de mon projet</label></p>
        <p><button type="button" class="primary" id="domerge" ${rep.codings + rep.completed + rep.codes.length + rep.docs.length + rep.memos + rep.journal ? '' : 'disabled'}>Fusionner dans mon projet</button></p>
        ${rep.orphans.length ? `<details><summary>Codages non fusionnables</summary><pre class="code">${esc(rep.orphans.join('\n'))}</pre></details>` : ''}`;
    }
    pane.innerHTML = html;
    $('#pickother').onclick = async () => {
      const [f] = await pickMd(false);
      if (!f) return;
      if (!looksProject(f.text)) return toast('Ce fichier n’est pas un projet adoq QDA', true);
      other = Q.parseProject(f.text); otherName = f.name; drawMerge();
    };
    if (other) {
      $('#adddocs').onchange = drawMerge;
      if ($('#rencoder')) $('#rencoder').onchange = drawMerge;
      $('#domerge').onclick = () => {
        const o = opts();
        backup(Q.serializeProject(S.p), true);
        const rep = mutate(() => Q.mergeInto(S.p, other, o));
        if (rep) toast(`Fusion faite : ${rep.codings} codage(s) ajouté(s)`);
        other = null;
        drawMerge();
        tab('k');
      };
    }
  };
  let ka = null, kb = null, withQ = false;
  const pickPair = () => {
    const cs = Q.coders(S.p);
    if (!cs.includes(ka)) ka = cs.includes(S.coder) ? S.coder : cs.find((c) => c !== Q.CONSENSUS) || cs[0];
    if (!cs.includes(kb) || kb === ka) kb = cs.find((c) => c !== ka && c !== Q.CONSENSUS) || cs.find((c) => c !== ka);
    return cs;
  };
  const sel = (id, v, cs) => `<select id="${id}">${cs.map((c) => `<option ${c === v ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
  const drawKappa = () => {
    const pane = $('[data-pane="k"]');
    const cs = pickPair();
    if (cs.length < 2) { pane.innerHTML = '<p>Il faut au moins deux codeurs dans le projet. Fusionnez d’abord la copie d’un·e collègue (onglet 1).</p>'; return; }
    const r = Q.agreement(S.p, ka, kb, { withQuestions: withQ });
    pane.innerHTML = `<p>Comparer ${sel('ka', ka, cs)} et ${sel('kb', kb, cs)} — ${r.units} paragraphes, dans les ${r.docs.length} document(s) codés par les deux${r.excluded ? ` (${r.excluded} questions de l’intervieweur exclues)` : ''}.
      ${r.excluded || withQ ? `<label><input type="checkbox" id="withq" ${withQ ? 'checked' : ''}> inclure les questions</label>` : ''}</p>
      ${r.rows.length ? `<table class="t"><tr><th>Code</th><th class="num">les deux</th><th class="num">@${esc(ka)} seul</th><th class="num">@${esc(kb)} seul</th><th class="num">accord</th><th class="num">kappa</th></tr>
      ${r.rows.map((x, i) => `<tr class="click" data-row="${i}"><td><i class="dot" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${color(x.id)}"></i> ${esc(codeLabel(x.id))}</td><td class="num">${x.both}</td><td class="num">${x.onlyA}</td><td class="num">${x.onlyB}</td><td class="num">${Math.round(x.po * 100)} %</td><td class="num ${kclass(x.kappa)}">${x.kappa.toFixed(2).replace('.', ',')}</td></tr>`).join('')}</table>` : '<p>Aucun code commun à comparer.</p>'}
      <div id="kdiff"></div>
      <p class="muted">Kappa de Cohen calculé par paragraphe : pour chaque paragraphe, le code est-il présent chez l’un, chez l’autre, chez les deux, chez aucun ? Le kappa corrige l’accord dû au hasard. Les questions de l’intervieweur sont exclues, car on ne les code généralement pas : les compter gonflerait l’accord. Repères usuels : au-dessus de 0,8, très bon accord ; de 0,6 à 0,8, accord substantiel ; en dessous, la définition du code est à discuter. Cliquez sur une ligne pour voir les désaccords.</p>`;
    $('#ka').onchange = (e) => { ka = e.target.value; drawKappa(); };
    $('#kb').onchange = (e) => { kb = e.target.value; drawKappa(); };
    if ($('#withq')) $('#withq').onchange = (e) => { withQ = e.target.checked; drawKappa(); };
    $$('[data-row]', pane).forEach((tr) => (tr.onclick = () => {
      const x = r.rows[+tr.dataset.row];
      $('#kdiff').innerHTML = `<h3 style="font-size:14px">Désaccords sur « ${esc(codeLabel(x.id))} » (${x.diff.length})</h3>` + x.diff.slice(0, 200).map((d, k) => `<div class="ex"><div class="exh"><b>${esc(d.doc.name)}</b> › ${esc(d.para.label)}${d.para.speaker ? ' · ' + esc(d.para.speaker) : ''} · codé par <b>@${esc(d.who)}</b> seulement<button type="button" class="small" data-kgo="${k}">Aller au texte</button></div><div class="ext">${esc(d.para.text.slice(0, 400))}${d.para.text.length > 400 ? '…' : ''}</div></div>`).join('');
      $$('[data-kgo]').forEach((b) => (b.onclick = () => { const d = x.diff[+b.dataset.kgo]; $('#dlg').close(); S.view = ''; ls.set('view', ''); goTo(S.p.docs.indexOf(d.doc), d.doc.paras.indexOf(d.para)); renderTree(); }));
    }));
  };
  let showDone = false;
  const segText = (para, segA, segB) => {
    const t = para.text;
    const marks = [];
    for (const [segs, cls] of [[segA, 'ua'], [segB, 'ub']]) for (const s of segs) {
      if (s.quote === null) continue;
      const st = Q.locate(t, s.quote, s.occ);
      if (st >= 0) marks.push({ a: st, b: st + s.quote.length, cls });
    }
    if (!marks.length) return esc(t.length > 600 ? t.slice(0, 600) + '…' : t);
    const pts = [...new Set([0, t.length, ...marks.flatMap((m) => [m.a, m.b])])].sort((x, y) => x - y);
    let out = '';
    for (let k = 0; k < pts.length - 1; k++) {
      const seg = esc(t.slice(pts[k], pts[k + 1]));
      const c = [...new Set(marks.filter((m) => m.a <= pts[k] && m.b >= pts[k + 1]).map((m) => m.cls))];
      out += c.length ? `<span class="${c.length > 1 ? 'uab' : c[0]}">${seg}</span>` : seg;
    }
    return out;
  };
  const drawCons = () => {
    const pane = $('[data-pane="c"]');
    const cs = pickPair().filter((c) => c !== Q.CONSENSUS);
    if (cs.length < 2) { pane.innerHTML = '<p>Il faut au moins deux codeurs (hors @consensus). Fusionnez d’abord la copie d’un·e collègue (onglet 1).</p>'; return; }
    if (ka === Q.CONSENSUS || !cs.includes(ka)) ka = cs[0];
    if (kb === Q.CONSENSUS || !cs.includes(kb) || kb === ka) kb = cs.find((c) => c !== ka);
    const items = Q.consensusItems(S.p, ka, kb);
    const done = items.filter((x) => x.decided).length;
    const agreeTodo = items.filter((x) => x.agree && !x.decided);
    const list = items.filter((x) => showDone || !x.decided).sort((x, y) => (x.agree === y.agree ? 0 : x.agree ? 1 : -1));
    const shown = list.slice(0, 40);
    pane.innerHTML = `<p>Le codage de consensus se construit à partir de deux codages : pour chaque paragraphe et chaque code, on décide ensemble de <b>garder</b> ou d’<b>écarter</b> le codage. Le résultat est signé <b>@consensus</b> ; les codages de départ restent intacts.</p>
      <p>Codeurs : ${sel('ca', ka, cs)} <span class="ua">souligné en orange</span> et ${sel('cb', kb, cs)} <span class="ub">souligné en bleu</span></p>
      <div class="progress"><i style="width:${items.length ? Math.round((100 * done) / items.length) : 0}%"></i></div>
      <p><b>${done}</b> point(s) tranché(s) sur <b>${items.length}</b> · ${items.filter((x) => !x.agree).length} désaccord(s), ${items.filter((x) => x.agree).length} accord(s)
        ${agreeTodo.length ? ` &nbsp;<button type="button" class="primary small" id="takeagree">Reprendre les ${agreeTodo.length} accord(s) d’un coup</button>` : ''}
        &nbsp;<label><input type="checkbox" id="showdone" ${showDone ? 'checked' : ''}> afficher aussi les points tranchés</label></p>
      ${shown.map((x, k) => {
        const who = x.agree ? `<span class="badge agree">accord</span>` : `proposé par <b>@${esc(x.segA.length ? ka : kb)}</b> seulement`;
        const st = x.kept ? '<span class="badge ok">gardé</span>' : x.rejected ? '<span class="badge no">écarté</span>' : '';
        return `<div class="ex cons"><div class="exh"><b>${esc(x.doc.name)}</b> › ${esc(x.para.label)}${x.para.speaker ? ' · ' + esc(x.para.speaker) : ''} · ${chipHTML(x.code)} ${who} ${st}
          <span style="margin-left:auto;display:flex;gap:4px">${x.agree ? `<button type="button" class="small" data-keep="${k}" data-from="a">Garder (@${esc(ka)})</button><button type="button" class="small" data-keep="${k}" data-from="b">Garder (@${esc(kb)})</button>` : `<button type="button" class="small" data-keep="${k}" data-from="">Garder</button>`}<button type="button" class="small" data-rej="${k}">Écarter</button><button type="button" class="small" data-cgo="${k}">Texte</button></span></div>
          <div class="ext">${segText(x.para, x.segA, x.segB)}${[...x.segA, ...x.segB].some((s) => s.quote === null) ? ' <span class="muted">(paragraphe entier)</span>' : ''}</div></div>`;
      }).join('') || '<p class="muted">Tout est tranché. Le codage @consensus peut maintenant être comparé aux autres (onglet 2) ou retouché en prenant l’identifiant « consensus ».</p>'}
      ${list.length > 40 ? `<p class="muted">${list.length - 40} autre(s) point(s) à suivre.</p>` : ''}`;
    $('#ca').onchange = (e) => { ka = e.target.value; drawCons(); };
    $('#cb').onchange = (e) => { kb = e.target.value; drawCons(); };
    $('#showdone').onchange = (e) => { showDone = e.target.checked; drawCons(); };
    const ta = $('#takeagree');
    if (ta) ta.onclick = () => { mutate(() => { for (const x of agreeTodo) Q.consensusKeep(S.p, x, 'a'); }); toast(`${agreeTodo.length} accord(s) repris dans @consensus`); drawCons(); };
    $$('[data-keep]', pane).forEach((b) => (b.onclick = () => { const x = shown[+b.dataset.keep]; mutate(() => Q.consensusKeep(S.p, x, b.dataset.from || 'a')); drawCons(); }));
    $$('[data-rej]', pane).forEach((b) => (b.onclick = () => { const x = shown[+b.dataset.rej]; mutate(() => Q.consensusReject(S.p, x)); drawCons(); }));
    $$('[data-cgo]', pane).forEach((b) => (b.onclick = () => { const x = shown[+b.dataset.cgo]; $('#dlg').close(); goTo(S.p.docs.indexOf(x.doc), x.doc.paras.indexOf(x.para)); }));
  };
  const tab = (k) => {
    $$('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === k));
    $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== k));
    ({ m: drawMerge, k: drawKappa, c: drawCons })[k]();
  };
  dialog({
    title: 'Comparer les codeurs', wide: true,
    html: `<div class="tabs"><button type="button" data-tab="m">1. Fusionner la copie d’un·e collègue</button><button type="button" data-tab="k">2. Accord entre codeurs</button><button type="button" data-tab="c">3. Codage de consensus</button></div><div data-pane="m"></div><div data-pane="k" hidden></div><div data-pane="c" hidden></div>`,
    onOpen: () => {
      $$('[data-tab]').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
      tab(startTab || (Q.coders(S.p).filter((c) => c !== Q.CONSENSUS).length >= 2 ? 'k' : 'm'));
    },
  });
}

// ---------- vue enseignant ----------
function teacherDialog() {
  const T = { files: [], ref: null };
  const draw = () => {
    const pane = $('#dlgbody');
    let html = `<p>Réunissez les fichiers <code>.qda.md</code> rendus par un groupe d’étudiant·es pour voir d’un coup leur avancement, leurs codes et, si vous fournissez votre propre codage de référence, leur accord avec lui. Les fichiers sont lus dans le navigateur ; rien n’est modifié.</p>
      <p><button type="button" class="primary" id="tpick">Choisir les fichiers des étudiant·es…</button> <button type="button" id="tref">${T.ref ? 'Changer' : 'Choisir'} le codage de référence (facultatif)…</button>${T.ref ? ` <span class="muted">Référence : ${esc(T.ref.name)}</span>` : ''}</p>`;
    if (T.files.length) {
      const sum = Q.teacherSummary(T.files, T.ref);
      const pct = (x) => `${Math.round(x * 100)} %`;
      html += `<h3 style="font-size:14px">${T.files.length} fichier(s)</h3><div style="overflow:auto"><table class="t"><tr><th>Fichier</th><th>Codeur</th><th class="num">Doc.</th><th class="num" title="Part des réponses (hors questions) codées par l’étudiant·e">Réponses codées</th><th class="num">Codages</th><th class="num">Codes</th><th class="num" title="Codes sans définition">Sans déf.</th>${T.ref ? '<th class="num" title="Codes absents du livre de codes de référence">Hors réf.</th><th class="num" title="Kappa moyen avec la référence, sur les codes de la référence">Kappa réf.</th>' : ''}<th class="num" title="Opérations dans le journal de l’arbre">Journal</th><th>Arbre</th></tr>
        ${sum.students.map((s) => `<tr><td>${esc(s.name)}<br><span class="muted">${esc(s.title)}</span></td><td>${s.coder ? '@' + esc(s.coder) : '—'}${s.coders.length > 1 ? ` <span class="muted">(+${s.coders.length - 1})</span>` : ''}</td><td class="num">${s.docs}</td><td class="num">${pct(s.coverage)}</td><td class="num">${s.codings}</td><td class="num">${s.codes}</td><td class="num ${s.noDef ? 'hi' : ''}">${s.noDef}</td>${T.ref ? `<td class="num ${s.extra.length ? 'hi' : ''}" title="${esc(s.extra.join(', '))}">${s.extra.length}</td><td class="num ${s.kappa === null ? 'zero' : s.kappa >= 0.8 ? 'k-good' : s.kappa >= 0.6 ? 'k-mid' : 'k-bad'}">${s.kappa === null ? '—' : s.kappa.toFixed(2).replace('.', ',')}</td>` : ''}<td class="num">${s.journal}</td><td>${s.locked ? '🔒' : ''}</td></tr>`).join('')}</table></div>
        <h3 style="font-size:14px;margin-top:16px">Usage des codes</h3><p class="muted">Nombre de codages par étudiant·e. En surligné : codes utilisés par une seule personne${T.ref ? ' ou absents de la référence' : ''}.</p>
        <div style="overflow:auto"><table class="t"><tr><th>Code</th>${T.ref ? '<th>Réf.</th>' : ''}${T.files.map((f) => `<th class="num">${esc(f.name.replace(/\.qda\.md$|\.md$/, ''))}</th>`).join('')}<th class="num">Étudiant·es</th></tr>
        ${sum.codes.sort((a, b) => Object.values(b.by).filter(Boolean).length - Object.values(a.by).filter(Boolean).length).map((c) => {
          const n = Object.values(c.by).filter(Boolean).length;
          return `<tr><td class="${n <= 1 || c.inRef === false ? 'hi' : ''}">${esc(c.label)}</td>${T.ref ? `<td>${c.inRef ? '✓' : ''}</td>` : ''}${T.files.map((f) => `<td class="num ${c.by[f.name] ? '' : 'zero'}">${c.by[f.name] ?? '·'}</td>`).join('')}<td class="num">${n}</td></tr>`;
        }).join('')}</table></div>
        <p><button type="button" class="primary" id="topen">Ouvrir la synthèse du groupe</button> <button type="button" id="tcsv">Exporter le tableau (.csv)</button></p>
        <p class="muted">« Ouvrir la synthèse » crée un nouveau projet qui réunit tous les codages, chacun signé par son auteur·e : pratique pour projeter les désaccords en séance, ou pour calculer l’accord entre deux étudiant·es.</p>`;
      T.sum = sum;
    }
    pane.innerHTML = html;
    $('#tpick').onclick = async () => {
      const fs = await pickMd(true);
      for (const f of fs) {
        if (!looksProject(f.text)) { toast(`${f.name} n’est pas un projet`, true); continue; }
        T.files = T.files.filter((x) => x.name !== f.name);
        T.files.push({ name: f.name, p: Q.parseProject(f.text) });
      }
      draw();
    };
    $('#tref').onclick = async () => {
      const [f] = await pickMd(false);
      if (f && looksProject(f.text)) { T.ref = { name: f.name, p: Q.parseProject(f.text) }; draw(); }
    };
    if ($('#topen')) $('#topen').onclick = async () => {
      $('#dlg').close();
      if (!(await guardUnsaved())) return;
      const all = Q.mergeAll(T.ref ? [T.ref, ...T.files] : T.files);
      all.p.meta.titre = `Synthèse de groupe (${T.files.length} fichiers)`;
      setProject(all.p, { dirty: true, fileName: 'synthese-groupe.qda.md' });
      const ren = all.reports.filter((r) => Object.keys(r.renamed).length);
      toast(`Synthèse ouverte : ${Q.coders(all.p).length} codeurs${ren.length ? ' (identifiants en double renommés)' : ''}`);
    };
    if ($('#tcsv')) $('#tcsv').onclick = () => {
      const rows = [['fichier', 'titre', 'codeur', 'documents', 'reponses_codees', 'codages', 'codes', 'codes_sans_definition', 'codes_hors_reference', 'kappa_reference', 'operations_journal', 'arbre_verrouille'],
        ...T.sum.students.map((s) => [s.name, s.title, s.coder || '', s.docs, s.coverage.toFixed(3), s.codings, s.codes, s.noDef, s.extra.join(' | '), s.kappa === null ? '' : s.kappa.toFixed(3), s.journal, s.locked ? 1 : 0])];
      download('﻿' + rows.map((r) => r.map((v) => (/[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(';')).join('\r\n'), 'vue-enseignant.csv', 'text/csv');
    };
  };
  dialog({ title: 'Vue enseignant', wide: true, html: '', onOpen: draw });
}

// ---------- données du navigateur ----------
/** Retire les réglages de l'app (clés « qdaE. »), sauf le choix d'effacement lui-même. */
const clearLocalKeys = () => { for (const k of Object.keys(localStorage)) if (k.startsWith('qdaE.') && k !== 'qdaE.private') localStorage.removeItem(k); };
/** Efface tout ce que l'app a rangé dans ce navigateur (sauvegardes, reprise, projets récents, réglages), sauf le réglage « private ». */
async function wipeBrowserData() {
  try { const d = await DB.db; if (d) d.close(); } catch { /* base absente */ }
  DB.db = null;
  await new Promise((res) => {
    try { const r = indexedDB.deleteDatabase('qda-md-etude'); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); }
    setTimeout(res, 1500);
  });
  try { clearLocalKeys(); } catch { /* stockage indisponible */ }
}
function setPrivate(on) {
  try { localStorage.setItem('qdaE.private', JSON.stringify(!!on)); } catch { /* stockage indisponible */ }
}
const privacyHTML = () => `<div class="notice ${isPrivate() ? '' : 'info'}"><b>Effacer les données de ce navigateur quand on ferme adoq QDA ?</b>
    <label style="display:block;margin-top:6px"><input type="radio" name="privmode" value="non" ${isPrivate() ? '' : 'checked'}> <b>Non</b> — sur votre ordinateur personnel : le navigateur garde des copies de secours et propose de reprendre un travail non enregistré.</label>
    <label style="display:block"><input type="radio" name="privmode" value="oui" ${isPrivate() ? 'checked' : ''}> <b>Oui</b> — sur un ordinateur partagé ou avec des données sensibles : aucune copie n’est gardée, et identifiant, réglages et projets récents sont effacés à la fermeture. Seul votre fichier projet compte : pensez à l’enregistrer.</label>
    <p style="margin:8px 0 0"><button type="button" class="small" id="wipenow">Effacer maintenant les données de ce navigateur</button></p></div>`;
function bindPrivacy(onDone = () => {}) {
  $$('[name=privmode]').forEach((r) => (r.onchange = async () => {
    if (r.value === 'oui' && r.checked) {
      setPrivate(true);
      await wipeBrowserData();
      toast('Plus aucune copie n’est gardée dans ce navigateur ; les données existantes ont été effacées');
    } else if (r.value === 'non' && r.checked) {
      setPrivate(false);
      if (S.coder) ls.set('coder', S.coder);
      toast('Le navigateur gardera de nouveau des copies de secours');
      if (S.p) persistWork();
    }
    onDone();
  }));
  const w = $('#wipenow');
  if (w) w.onclick = async () => {
    if (!(await confirmDlg('Effacer les données de ce navigateur', '<p>Sauvegardes automatiques, travail non enregistré gardé pour la reprise, projets récents, identifiant et réglages seront effacés de ce navigateur.</p><p><b>Vos fichiers projet ne sont pas touchés.</b> Si le projet ouvert n’est pas enregistré, enregistrez-le d’abord.</p>', 'Effacer', true))) return;
    await wipeBrowserData();
    if (S.coder && !isPrivate()) ls.set('coder', S.coder);
    toast('Données du navigateur effacées');
    if (!S.p) renderHome();
  };
}
window.addEventListener('pagehide', () => {
  if (!isPrivate()) return;
  try { clearLocalKeys(); } catch { /* indisponible */ }
  try { indexedDB.deleteDatabase('qda-md-etude'); } catch { /* indisponible */ }
});

// ---------- sauvegardes ----------
async function backupsDialog() {
  const list = isPrivate() ? [] : ((await DB.backups(S.p ? S.p.meta.id : null)) || []).sort((a, b) => b.date - a.date);
  return dialog({
    title: 'Sauvegardes et données du navigateur', wide: true,
    html: `${privacyHTML()}
      <h3 style="font-size:14px">Sauvegardes automatiques</h3>
      ${isPrivate() ? '<p class="muted">Désactivées : aucune copie n’est gardée dans ce navigateur.</p>' : `<p>Le navigateur garde une copie du projet ${hasFS ? 'à chaque enregistrement' : 'à chaque téléchargement'} et toutes les quelques minutes de travail (20 dernières par projet). Ces copies restent dans ce navigateur, sur cet ordinateur.</p>`}
      ${list.length ? `<table class="t"><tr><th>Date</th><th>Projet</th><th class="num">Taille</th><th></th></tr>${list.map((b, i) => `<tr><td>${fmtDate(b.date)}</td><td>${esc(b.title)}</td><td class="num">${fmtSize(b.size)}</td><td><button type="button" class="small" data-bopen="${i}">Ouvrir</button> <button type="button" class="small" data-bdl="${i}">Télécharger</button></td></tr>`).join('')}</table>` : '<p class="muted">Aucune sauvegarde pour l’instant.</p>'}
      <p class="muted">« Ouvrir » charge la sauvegarde comme un projet non enregistré : enregistrez-la ensuite sous un nouveau nom si vous voulez la garder.</p>`,
    onOpen: () => {
      bindPrivacy(() => { $('#dlg').close(); backupsDialog(); });
      $$('[data-bdl]').forEach((b) => (b.onclick = () => { const x = list[+b.dataset.bdl]; download(x.text, `${safeName(x.title)}_sauvegarde_${new Date(x.date).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.qda.md`); }));
      $$('[data-bopen]').forEach((b) => (b.onclick = async () => {
        $('#dlg').close();
        if (!(await guardUnsaved())) return;
        const x = list[+b.dataset.bopen];
        setProject(Q.parseProject(x.text), { dirty: true, fileName: `${safeName(x.title)}_restauré.qda.md` });
        toast('Sauvegarde ouverte — enregistrez-la pour la garder');
      }));
    },
  });
}

// ---------- aide, exemple, exports ----------
function helpDialog() {
  dialog({
    title: 'Aide — adoq QDA', wide: true,
    html: `<h3>Coder</h3><ol>
      <li><b>Sélectionnez un passage</b> dans un paragraphe : une petite fenêtre s’ouvre.</li>
      <li>Choisissez un code, ou <b>tapez un nom</b> pour en créer un nouveau, puis <span class="kbd">Entrée</span>. Le dernier code utilisé reste proposé en premier : sélection + <span class="kbd">Entrée</span> suffit pour l’appliquer à nouveau.</li>
      <li>Un même passage peut recevoir plusieurs codes, et des passages peuvent se chevaucher. « ＋ paragraphe entier » code tout le paragraphe.</li>
      <li>Les codes apparaissent sous le paragraphe ; <b>×</b> retire un code. Survolez une étiquette pour voir le passage.</li></ol>
      <h3>Questions, réponses, focus groups</h3><p><b>Préparer la retranscription</b> : un paragraphe par prise de parole. Commencez chaque question par le nom de l’intervieweur·euse (« Zoé : … ») ; les paragraphes sans nom sont les réponses de la personne interviewée, dont l’import demande le pseudo et les caractéristiques (âge, genre, profession…). En focus group, commencez chaque prise de parole par le pseudo du ou de la participant·e. Le nom quitte le texte et devient le <b>locuteur</b> du paragraphe. Les questions de l’intervieweur apparaissent en pointillés ; « masquer les questions » les cache pendant le codage. Le bouton <b>👥 Locuteurs</b> permet de renommer, fusionner, changer les rôles, compléter les caractéristiques, attribuer les locuteurs après coup, et montre qui mobilise quels codes (utile en focus group). Les caractéristiques sont reprises dans les extraits et les exports CSV. Cliquez sur le nom d’un locuteur dans le texte pour le corriger.</p>
      <h3>Fiche de l’entretien</h3><p><b>ⓘ Fiche</b> : date, pseudo de la personne interviewée, intervieweur·euse, lieu, et d’autres champs au besoin. Elle est reprise dans les extraits et les exports.</p>
      <h3>Organiser les codes</h3><p>Dans la colonne de droite : ≡ extraits, ＋ sous-code, ✎ renommer, 📝 définition, 🧭 origine, 🗒 mémo, ⤵ fusionner, 🗑 supprimer. <b>Glissez-déposez</b> un code sur un autre pour l’y ranger (au milieu de la ligne), ou au-dessus / en dessous pour le placer à côté. Un point orange signale un code sans définition. La pastille <span class="ori ori-i" style="display:inline-block">I</span> marque un code <b>inductif</b> (né de la lecture des données), <span class="ori ori-d" style="display:inline-block">D</span> un code <b>déductif</b> (venu de la théorie) : 🧭 permet de la choisir.</p>
      <p>La <b>définition</b> dit quand appliquer le code ; le <b>mémo</b> recueille vos réflexions d’analyse sur ce code. Le <b>journal</b> garde la trace des créations, fusions, déplacements et suppressions de codes, avec leur motif. Le bouton <b>🔓 Verrouiller</b> fige l’arbre : on code et on écrit des mémos, sans modifier l’arbre.</p>
      <h3>Travailler à deux</h3><p>Chacun·e code dans sa copie du projet avec son propre identifiant. Choisissez « Afficher : mes codages », en bas de la colonne des codes, pour ne pas être influencé·e ; le même menu permet d’afficher le codage d’un·e autre codeur·euse ou le consensus. Ensuite, « Comparer les codeurs » fusionne les deux copies, calcule l’accord (kappa de Cohen) code par code, puis aide à construire un <b>codage de consensus</b> en tranchant chaque désaccord.</p>
      <h3>Enregistrer</h3><p>${hasFS ? 'Votre navigateur enregistre automatiquement le projet dans son fichier.' : 'Votre navigateur ne permet pas l’enregistrement automatique : <b>cliquez régulièrement sur « Enregistrer »</b>. Le fichier est téléchargé ; pour reprendre, rouvrez le dernier.'} Des copies de secours sont gardées dans le navigateur (« Exporter › Sauvegardes et données du navigateur »). Sur un ordinateur partagé, choisissez d’<b>effacer les données de ce navigateur à la fermeture</b> : aucune copie n’est alors gardée. <span class="kbd">Ctrl+S</span> enregistre, <span class="kbd">Ctrl+Z</span> annule.</p>
      <h3>Le fichier projet</h3><p>C’est un simple fichier texte (Markdown). Vous pouvez l’ouvrir dans le Bloc-notes, TextEdit ou Obsidian pour voir comment votre codage est noté :</p>
      <pre class="code">### E01-003
locuteur:: Marie

Ils sont à la solde des politiciens, c’est évident.

&gt; [!codage]-
&gt; - #dependance-politique @marie : « à la solde des politiciens »</pre>
      <p>Le format, appelé <b>qda.md</b> (version 1), est commun à adoq QDA et à QDA-md, la version de recherche. « Exporter › Projet en dossier » produit le même projet sous forme d’un dossier (<span class="kbd">arbre.md</span> et un fichier par entretien dans <span class="kbd">donnees/</span>), lisible par QDA-md et par Obsidian. Inversement, « Importer › Projet QDA-md » ajoute à votre projet un projet en dossier, un .zip ou un autre fichier .qda.md.</p>
      <p class="muted">adoq QDA ${Q.VERSION} · Analyse de données qualitatives — fonctionne hors ligne, sans installation. Aucune donnée ne quitte votre ordinateur.</p>`,
  });
}
function exampleProject() {
  const p = Q.newProject('Exemple — Confiance dans l’information');
  const L = (type, desc, date) => Q.logTree(p, type, desc, { coder: 'exemple', date });
  const mef = Q.addCode(p, 'Méfiance envers les médias', null, 'Le ou la répondant·e met en doute l’honnêteté, l’indépendance ou la compétence des journalistes.\nExemple : « ils racontent ce qu’on leur dit de raconter ».\nNe relève pas de ce code : une simple critique de la forme (trop long, trop négatif).');
  mef.memo = 'La méfiance prend deux formes chez Julie : une dépendance politique et une dépendance économique. Chez Marc, elle est nuancée (« il y a sans doute des liens ») et contrebalancée par la confiance dans les règles professionnelles.\n\nPiste : distinguer méfiance « systémique » et méfiance « ponctuelle » ?';
  L('création', Q.codeRef(p, mef.id), '2026-03-10 14:02');
  const pol = Q.addCode(p, 'Dépendance au politique', mef.id, 'Les médias sont décrits comme soumis aux gouvernements ou aux partis.');
  L('création', `${Q.codeRef(p, pol.id)} sous ${Q.codeRef(p, mef.id)}`, '2026-03-10 14:05');
  const eco = Q.addCode(p, 'Dépendance économique', null, 'Les médias sont décrits comme soumis à l’argent : propriétaires, publicité, industrie.');
  L('création', Q.codeRef(p, eco.id), '2026-03-10 14:09');
  Q.moveCode(p, eco.id, mef.id, 'inside');
  p.journal.push({ date: '2026-03-10 14:20', coder: 'exemple', type: 'imbrication', desc: `${Q.codeRef(p, eco.id)} placé sous ${Q.codeRef(p, mef.id)}`, motif: 'deux formes de la même méfiance' });
  const alt = Q.addCode(p, 'Sources alternatives', null, 'Le ou la répondant·e décrit d’autres manières de s’informer que les médias traditionnels.');
  L('création', Q.codeRef(p, alt.id), '2026-03-10 14:25');
  const exp = Q.addCode(p, 'Rapport à l’expertise');
  L('création', Q.codeRef(p, exp.id), '2026-03-11 09:40');
  const imp = (name, txt, meta, resp = null, attrs = {}) => {
    const d = Q.addDoc(p, Q.textToDoc(name, txt));
    const c = Q.detectSpeakers(d);
    if (resp) c.forEach((x) => (x.role = Q.ROLE_I));
    Q.applySpeakers(d, c, resp ? { mode: 'respondent', respondent: resp } : {});
    for (const [n, a] of Object.entries(attrs)) Q.setSpeakerAttrs(d, n, a);
    Object.assign(d.meta, meta);
    return d;
  };
  const d1 = imp('Entretien 1 — Julie', `Léa : Comment vous informez-vous en général ?

Surtout sur Instagram et TikTok, je suis des comptes de journalistes indépendants. Le journal télévisé, je ne le regarde plus depuis longtemps.

Léa : Pourquoi l’avoir arrêté ?

J’ai l’impression qu’ils racontent tous la même chose, ce qu’on leur dit de raconter. Pendant le Covid, c’était flagrant : les mêmes experts tous les soirs, et personne ne posait vraiment de questions.

Léa : Qui leur dirait quoi raconter, selon vous ?

Le gouvernement, en partie. Et puis les grands groupes qui possèdent les journaux. Un média qui vit de la publicité ne va pas critiquer ses annonceurs.

Léa : Et les journalistes indépendants que vous suivez, vous leur faites confiance ?

Plus, oui. Mais je vérifie quand même, je croise avec d’autres comptes. Je ne suis pas naïve non plus.`, { date: '2026-02-14', pseudo: 'Julie', intervieweur: 'Léa M.', lieu: 'Bruxelles (café)' },
  { name: 'Julie', attrs: { 'âge': '24', genre: 'F', profession: 'graphiste' } });
  imp('Entretien 2 — Marc', `Enquêteur : Comment vous informez-vous en général ?

Marc : Je lis Le Soir le matin, sur la tablette, et j’écoute La Première dans la voiture. Le soir, le JT, c’est un rituel avec ma femme.

Enquêteur : Vous avez confiance dans ces médias ?

Marc : Dans l’ensemble, oui. Ils font des erreurs, comme tout le monde, mais ils les corrigent. Ce sont des professionnels, ils ont des règles.

Enquêteur : Certaines personnes disent que les médias dépendent du pouvoir politique. Qu’en pensez-vous ?

Marc : Il y a sans doute des liens, des journalistes qui connaissent trop bien les ministres. Mais de là à dire qu’ils sont à la botte du gouvernement, non. Les affaires sortent quand même, c’est la presse qui les a révélées.

Enquêteur : Et les réseaux sociaux ?

Marc : Je m’en méfie beaucoup plus. N’importe qui peut y dire n’importe quoi, et mon fils me montre parfois des vidéos complètement folles.`, { date: '2026-02-20', pseudo: 'Marc', intervieweur: 'Léa M.', lieu: 'Namur (domicile)' }, null, { Marc: { 'âge': '58', genre: 'H', profession: 'comptable' } });
  const d3 = imp('Focus group — étudiant·es', `Animatrice : Pour commencer, d’où vient l’info que vous voyez passer ?

Inès : Franchement, de TikTok. Je ne cherche pas l’info, elle arrive dans mon fil.

Hugo : Pareil, mais moi je vais vérifier sur le site de la RTBF quand ça a l’air gros.

Lucas : Moi j’écoute des podcasts. Les médias classiques, je trouve qu’ils simplifient tout.

Animatrice : Est-ce que vous leur faites confiance, aux médias classiques ?

Hugo : Plus qu’aux influenceurs, quand même. Il y a des gens derrière qui vérifient.

Inès : Je ne sais pas. Ils ont aussi leurs intérêts, leurs propriétaires.

Lucas : C’est ça. On ne sait jamais qui paie.`, { date: '2026-03-03', pseudo: 'Groupe BAC2', intervieweur: 'Léa M.', lieu: 'Louvain-la-Neuve (local du cercle)' }, null,
  { 'Inès': { 'âge': '19', genre: 'F' }, Hugo: { 'âge': '20', genre: 'H' }, Lucas: { 'âge': '21', genre: 'H' } });
  const c = (d, i, codes, quote) => Q.addCoding(d.paras[i], codes, 'exemple', quote, 1);
  c(d1, 1, [alt.id], 'Surtout sur Instagram et TikTok, je suis des comptes de journalistes indépendants');
  c(d1, 3, [mef.id], 'ce qu’on leur dit de raconter');
  c(d1, 3, [exp.id], 'les mêmes experts tous les soirs, et personne ne posait vraiment de questions');
  c(d1, 5, [pol.id], 'Le gouvernement, en partie.');
  c(d1, 5, [eco.id], 'Un média qui vit de la publicité ne va pas critiquer ses annonceurs.');
  c(d3, 1, [alt.id], 'de TikTok');
  c(d3, 6, [eco.id], 'Ils ont aussi leurs intérêts, leurs propriétaires.');
  ['E01', 'E02', 'FG1'].forEach((code, i) => p.docs[i] && Q.renameDocCode(p, p.docs[i], code));
  setProject(p, { dirty: false, fileName: 'exemple.qda.md' });
  S.cur = 1; renderDocs(); renderDoc();
  toast('Projet d’exemple : sélectionnez un passage du 2e entretien pour le coder');
  if (!S.coder) setTimeout(ensureCoder, 600);
}
function exportFolder() {
  let files;
  try { files = Q.splitProject(S.p); } catch (e) { return toast(e.message, true); }
  const root = safeName(S.fileName.replace(/(\.qda)?\.md$/i, '') || S.p.meta.titre).replace(/\s+/g, '-');
  const zip = Q.zipFiles(Object.fromEntries(Object.entries(files).map(([k, v]) => [`${root}/${k}`, v])));
  download(zip, `${root}.zip`, 'application/zip');
  toast(`Projet exporté en dossier : arbre.md et ${S.p.docs.length} fichier(s) dans donnees/`);
}
function codebookMarkdown() {
  const { seg, docs } = Q.counts(S.p);
  const L = [`# Livre de codes — ${S.p.meta.titre}`, '', `Exporté le ${fmtDate(Date.now())} · ${Q.allCodes(S.p).length} codes${locked() ? ' · arbre verrouillé' : ''}`, ''];
  for (const { node, depth } of Q.walk(S.p.tree)) {
    L.push(`${'#'.repeat(Math.min(depth + 2, 6))} ${node.label}`, '', `\`#${node.id}\` · ${seg[node.id] || 0} codage(s) dans ${docs[node.id] ? docs[node.id].size : 0} document(s)`, '');
    const o = Q.originOf(node);
    if (o) L.push(`*Origine : ${o === 'inductif' ? 'inductive' : 'déductive'}${node.fields.theorie ? ` (${node.fields.theorie})` : ''}*`, '');
    if (node.def) L.push(...node.def.split('\n').map((l) => '> ' + l), '');
    else L.push('_Pas de définition._', '');
    if (node.memo) L.push('**Mémo**', '', node.memo, '');
  }
  return L.join('\n');
}

// ---------- événements ----------
async function act(a) {
  switch (a) {
    case 'new': return newProjectFlow();
    case 'open': return openFlow();
    case 'example': if (await guardUnsaved()) exampleProject(); return;
    case 'save': return save();
    case 'saveas': return saveAs();
    case 'import': return S.p && importDialog();
    case 'compare': return compareDialog();
    case 'backups': return backupsDialog();
    case 'teacher': return teacherDialog();
    case 'undo': return undo();
    case 'redo': return redo();
    case 'help': return helpDialog();
    case 'newcode': return newCodeDialog();
    case 'journal': return journalDialog();
    case 'lock': return lockDialog();
    case 'exp-folder': return exportFolder();
    case 'exp-codebook': return download(codebookMarkdown(), `livre-de-codes_${safeName(S.p.meta.titre)}.md`);
    case 'exp-seg': return download(Q.segmentsCSV(S.p), `segments_${safeName(S.p.meta.titre)}.csv`, 'text/csv');
    case 'exp-matrix': return download(Q.matrixCSV(S.p), `matrice_${safeName(S.p.meta.titre)}.csv`, 'text/csv');
    case 'exp-spk': return download(Q.speakerMatrixCSV(S.p), `locuteurs-codes_${safeName(S.p.meta.titre)}.csv`, 'text/csv');
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && !b.closest('dialog')) {
    if (b.tagName === 'A') e.preventDefault();
    if (document.activeElement && b.closest('.dropmenu')) document.activeElement.blur();
    act(b.dataset.act);
  }
});
$('#title').onclick = async () => {
  const t = await ask('Titre du projet', 'Titre', S.p.meta.titre);
  if (t && t.trim()) mutate(() => { S.p.meta.titre = t.trim(); });
};
$('#coder').addEventListener('change', (e) => {
  const c = Q.cleanCoder(e.target.value);
  S.coder = c; ls.set('coder', c); renderCoder();
  if (c) toast(`Vos codages seront signés @${c}`);
  if (S.p) renderAll();
});
$('#viewsel').addEventListener('change', async (e) => {
  if (e.target.value === '__me' && !S.coder && !(await ensureCoder())) { renderView(); return; }
  S.view = e.target.value; ls.set('view', S.view); renderAll();
});
$('#fileOpen').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) openText(await readTextFile(f), f.name); });

// documents
$('#docs').addEventListener('click', async (e) => {
  const ren = e.target.closest('[data-docren]'), del = e.target.closest('[data-docdel]');
  if (ren) {
    const d = S.p.docs[+ren.dataset.docren];
    const n = await ask('Renommer le document', 'Nom', d.name);
    if (n && n.trim() && n.trim() !== d.name) mutate(() => { d.name = Q.uniqueDocName(S.p, n.trim()); });
    return;
  }
  if (del) {
    const i = +del.dataset.docdel, d = S.p.docs[i];
    const nc = d.paras.reduce((a, pa) => a + pa.codings.length, 0);
    if (await confirmDlg('Retirer le document', `<p>Retirer « <b>${esc(d.name)}</b> » du projet, avec ses ${nc} codage(s) ?</p><p class="muted">Vous pouvez annuler avec Ctrl+Z.</p>`, 'Retirer', true)) {
      mutate(() => { S.p.docs.splice(i, 1); S.cur = Math.max(0, Math.min(S.cur, S.p.docs.length - 1)); });
    }
    return;
  }
  const li = e.target.closest('[data-doc]');
  if (li) { if (S.cur !== +li.dataset.doc) { $('#memo').hidden = true; S.spk = ''; } S.cur = +li.dataset.doc; renderDocs(); renderDoc(); $('#center').scrollTop = 0; }
});
// en-tête du document
$('#dochead').addEventListener('click', (e) => {
  const id = e.target.id;
  if (id === 'memobtn') { $('#memo').hidden = !$('#memo').hidden; if (!$('#memo').hidden) $('#memotext').focus(); }
  if (id === 'fichebtn' || id === 'fichelink') { e.preventDefault(); ficheDialog(); }
  if (id === 'spkbtn') speakersDialog();
});
$('#dochead').addEventListener('change', (e) => {
  if (e.target.id === 'filter') { S.filter = e.target.value; renderDoc(); }
  if (e.target.id === 'spkfilter') { S.spk = e.target.value; renderDoc(); }
  if (e.target.id === 'hideq') { S.hideQ = e.target.checked; ls.set('hideQ', S.hideQ); renderDoc(); }
});
let memoSnapTaken = false;
$('#memotext').addEventListener('focus', () => { memoSnapTaken = false; });
$('#memotext').addEventListener('input', (e) => {
  const d = curDoc();
  if (!d) return;
  if (!memoSnapTaken) { S.undo.push(Q.snapshot(S.p)); S.redo = []; memoSnapTaken = true; }
  d.memo = e.target.value;
  changed();
});
$('#memotext').addEventListener('blur', () => renderDocs());
// paragraphes
const paras = $('#paras');
paras.addEventListener('mouseup', () => setTimeout(checkSelection, 0));
paras.addEventListener('keyup', (e) => { if (e.shiftKey) checkSelection(); });
paras.addEventListener('click', async (e) => {
  const rm = e.target.closest('[data-rm]');
  const box = e.target.closest('.para');
  if (!box) return;
  const di = +box.dataset.di, pi = +box.dataset.pi;
  const pa = S.p.docs[di].paras[pi];
  if (rm) {
    const c = pa.codings[+rm.dataset.rm];
    if (c) mutate(() => Q.removeCodeFromCoding(pa, c, rm.dataset.code), { di, pi });
    return;
  }
  if (e.target.closest('[data-spk]')) return paraSpeakerDialog(di, pi);
  if (e.target.closest('[data-whole]')) return openPop({ di, pi, quote: null, occ: 1 }, e.target.getBoundingClientRect());
  if (e.target.closest('[data-pmemo]')) {
    const pa = S.p.docs[di].paras[pi];
    const v = await ask(`Mémo — ${pa.label}`, 'Mémo du paragraphe', pa.memo || '', { textarea: true, hint: 'Une remarque sur ce passage : un désaccord, une hésitation, une piste d’analyse. Elle est gardée dans le fichier, sous le paragraphe.' });
    if (v !== null && v.trim() !== (pa.memo || '')) mutate(() => { pa.memo = v.trim(); }, { di, pi });
    return;
  }
  const chip = e.target.closest('.chip');
  if (chip) {
    const c = pa.codings[+chip.dataset.ci];
    if (c) { S.active = c.codes[0]; renderTree(); }
  }
});
paras.addEventListener('mouseover', (e) => {
  const chip = e.target.closest('.chip');
  $$('mark.hot', paras).forEach((m) => m.classList.remove('hot'));
  if (!chip) return;
  const box = chip.closest('.para');
  $$('mark', box).forEach((m) => { if ((m.dataset.ci || '').split(' ').includes(chip.dataset.ci)) m.classList.add('hot'); });
});
// fenêtre de codage
$('#popq').addEventListener('input', fillPop);
$('#popq').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { S.popSel = Math.min(S.popSel + 1, S.popItems.length - 1); drawPop(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { S.popSel = Math.max(S.popSel - 1, 0); drawPop(); e.preventDefault(); }
  else if (e.key === 'Enter') { e.preventDefault(); applyPop(S.popSel); }
  else if (e.key === 'Escape') { e.preventDefault(); closePop(); }
});
$('#poplist').addEventListener('mousedown', (e) => { const it = e.target.closest('.pitem'); if (it) { e.preventDefault(); applyPop(+it.dataset.i); } });
document.addEventListener('mousedown', (e) => { if (!$('#pop').hidden && !e.target.closest('#pop')) closePop(); });
// arbre
const tree = $('#tree');
function renderDocHeadOnly() {
  const f = $('#filter');
  if (!f) return;
  const act = S.active ? Q.findCode(S.p, S.active) : null;
  const o = f.querySelector('option[value=active]');
  o.disabled = !act;
  o.textContent = 'Avec le code actif' + (act ? ' : ' + act.label : '');
}
tree.addEventListener('click', (e) => {
  const row = e.target.closest('.trow');
  if (!row) return;
  const id = row.dataset.code;
  const t = e.target.closest('[data-t]');
  if (t) return codeAction(t.dataset.t, id);
  if (e.target.closest('[data-tw]')) { S.collapsed.has(id) ? S.collapsed.delete(id) : S.collapsed.add(id); return renderTree(); }
  S.active = id;
  $$('.trow.active', tree).forEach((r) => r.classList.remove('active'));
  row.classList.add('active');
  if (S.filter === 'active') renderDoc(); else renderDocHeadOnly();
});
tree.addEventListener('dblclick', (e) => { const row = e.target.closest('.trow'); if (row && !e.target.closest('[data-t]')) showExtracts(row.dataset.code); });
const clearDz = () => $$('.dz-before,.dz-after,.dz-inside', tree).forEach((r) => r.classList.remove('dz-before', 'dz-after', 'dz-inside'));
const dzPos = (row, e) => { const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height; return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside'; };
tree.addEventListener('dragstart', (e) => {
  const row = e.target.closest('.trow');
  if (!row || locked()) { e.preventDefault(); return; }
  S.drag = row.dataset.code;
  e.dataTransfer.setData('text/x-qda-code', S.drag);
  e.dataTransfer.effectAllowed = 'move';
  document.body.classList.add('dragging');
});
tree.addEventListener('dragover', (e) => {
  if (!S.drag) return;
  const row = e.target.closest('.trow');
  if (!row) return;
  e.preventDefault();
  clearDz();
  if (row.dataset.code !== S.drag) row.classList.add('dz-' + dzPos(row, e));
});
function moveWithLog(id, target, pos) {
  return mutate(() => {
    const before = Q.parentOf(S.p, id);
    if (!Q.moveCode(S.p, id, target, pos)) return false;
    const after = Q.parentOf(S.p, id);
    if ((before && before.id) !== (after && after.id)) {
      if (after) log('imbrication', `${ref(id)} placé sous ${ref(after.id)}${before ? ` (auparavant sous ${ref(before.id)})` : ''}`);
      else log('désimbrication', `${ref(id)} placé au premier niveau (auparavant sous ${ref(before.id)})`);
    }
    return true;
  });
}
tree.addEventListener('drop', (e) => {
  if (!S.drag) return;
  const row = e.target.closest('.trow');
  e.preventDefault();
  clearDz();
  if (!row || row.dataset.code === S.drag) return;
  const pos = dzPos(row, e), id = S.drag, target = row.dataset.code;
  if (pos === 'inside') S.collapsed.delete(target);
  if (moveWithLog(id, target, pos) === false) toast('Impossible de ranger un code dans un de ses propres sous-codes', true);
});
const rootdrop = $('#rootdrop');
rootdrop.addEventListener('dragover', (e) => { if (S.drag) { e.preventDefault(); rootdrop.classList.add('over'); } });
rootdrop.addEventListener('dragleave', () => rootdrop.classList.remove('over'));
rootdrop.addEventListener('drop', (e) => { e.preventDefault(); rootdrop.classList.remove('over'); const id = S.drag; if (id) moveWithLog(id, null, 'root'); });
document.addEventListener('dragend', () => { S.drag = null; clearDz(); document.body.classList.remove('dragging'); });
// recherche
let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = e.target.value.trim().toLowerCase();
    const out = $('#searchres');
    if (q.length < 2) { out.innerHTML = ''; return; }
    const res = [];
    S.p.docs.forEach((d, di) => d.paras.forEach((pa, pi) => {
      const k = pa.text.toLowerCase().indexOf(q);
      if (k >= 0 && res.length < 150) res.push({ di, pi, d, pa, k });
    }));
    out.innerHTML = `<p class="muted">${res.length >= 150 ? '150+' : res.length} résultat(s)</p>` + res.map((r, i) => {
      const a = Math.max(0, r.k - 40);
      return `<div class="res" data-r="${i}"><b>${esc(r.d.name)} › ${esc(r.pa.label)}${r.pa.speaker ? ' · ' + esc(r.pa.speaker) : ''}</b><br>${a ? '…' : ''}${esc(r.pa.text.slice(a, r.k))}<mark>${esc(r.pa.text.slice(r.k, r.k + q.length))}</mark>${esc(r.pa.text.slice(r.k + q.length, r.k + q.length + 60))}…</div>`;
    }).join('');
    $$('.res', out).forEach((el) => (el.onclick = () => { const r = res[+el.dataset.r]; goTo(r.di, r.pi); }));
  }, 200);
});
// clavier
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (S.p) save(); return; }
  if (!S.p || typing || $('#dlg').open) return;
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
});
// glisser-déposer des fichiers dans la fenêtre
let dragDepth = 0;
const isFileDrag = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => { if (isFileDrag(e)) { dragDepth++; document.body.classList.add('dropping'); } });
window.addEventListener('dragleave', (e) => { if (isFileDrag(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dropping'); } });
window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0; document.body.classList.remove('dropping');
  const items = [...e.dataTransfer.items].filter((i) => i.kind === 'file');
  const files = [...e.dataTransfer.files];
  if (!files.length) return;
  if (files.length === 1 && /\.md$/i.test(files[0].name)) {
    const text = await readTextFile(files[0]);
    if (looksProject(text)) {
      if (!(await guardUnsaved())) return;
      let handle = null;
      try { if (items[0] && items[0].getAsFileSystemHandle) { const h = await items[0].getAsFileSystemHandle(); if (h && h.kind === 'file') handle = h; } } catch { /* pas de poignée */ }
      return openText(text, files[0].name, handle);
    }
  }
  if (!S.p) {
    if (files.length === 1) return openText(await readTextFile(files[0]), files[0].name);
    return toast('Créez d’abord un projet, puis déposez vos entretiens', true);
  }
  importDialog(files);
});
window.addEventListener('beforeunload', (e) => { if (S.p && S.dirty && !S.handle) { persistWork(); e.preventDefault(); e.returnValue = ''; } });

// ---------- démarrage ----------
renderCoder();
(isPrivate() ? wipeBrowserData() : Promise.resolve()).then(renderHome);
window.__qda = { S, Q, act, setProject, openText, mutate };
})();
