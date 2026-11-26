// Tests du noyau : node tests/test-core.js
const Q = require('../src/core.js');
const fs = require('fs');
const path = require('path');
let ok = 0, ko = 0;
async function t(name, fn) {
  try { await fn(); ok++; console.log('  ✓', name); } catch (e) { ko++; console.log('  ✗', name, '\n    ', e.message); }
}
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); };
const yes = (v, m) => { if (!v) throw new Error(m || 'faux'); };

(async () => {
  const sample = `Je ne lis plus les journaux depuis le Covid. Ils sont à la solde des politiciens.

# Titre piégé : une ligne qui commence par un dièse
- et une autre par un tiret

Les experts, on ne savait pas qui les payait. Les experts mentaient.`;

  await t('import texte : paragraphes séparés par des lignes vides', () => {
    const d = Q.textToDoc('Entretien Marie.txt', sample);
    eq(d.name, 'Entretien Marie');
    eq(d.paras.length, 3);
    eq(d.paras[1].text, '# Titre piégé : une ligne qui commence par un dièse - et une autre par un tiret');
  });
  await t('import texte : une ligne = un paragraphe sans lignes vides', () => {
    eq(Q.textToDoc('x', 'a\nb\nc').paras.map((p) => p.text), ['a', 'b', 'c']);
  });
  await t('import Iramuteq', () => {
    const d = Q.textToDoc('c', '**** *ID_1 *sexe_f\nA la botte.\nSuite.\n**** *ID_2\nTexte deux');
    eq(d.paras.map((p) => [p.label, p.text, p.fields.variables || '']), [['ID_1', 'A la botte. Suite.', '*sexe_f'], ['ID_2', 'Texte deux', '']]);
  });

  const build = () => {
    const p = Q.newProject('Test');
    const m = Q.addCode(p, 'Méfiance envers la presse', null, 'Doute sur l’honnêteté.\nDeuxième ligne.');
    Q.addCode(p, 'Dépendance au politique', m.id);
    Q.addCode(p, 'Expertise');
    const d = Q.addDoc(p, Q.textToDoc('Entretien Marie', sample));
    Q.addCoding(d.paras[0], ['dependance-au-politique'], 'etu1', 'à la solde des politiciens', 1);
    Q.addCoding(d.paras[0], ['mefiance-envers-la-presse'], 'etu1', null);
    Q.addCoding(d.paras[2], ['expertise'], 'etu1', 'Les experts', 2);
    Q.addCoding(d.paras[2], ['expertise', 'mefiance-envers-la-presse'], 'etu2', 'qui les payait', 1);
    return p;
  };

  await t('aller-retour écriture → lecture → écriture identique', () => {
    const p = build();
    const s1 = Q.serializeProject(p);
    const p2 = Q.parseProject(s1);
    eq(p2.warnings, []);
    const s2 = Q.serializeProject(p2);
    eq(s2, s1);
    eq(p2.docs[0].paras[1].text, p.docs[0].paras[1].text, 'texte échappé');
    eq(p2.tree[0].def, 'Doute sur l’honnêteté.\nDeuxième ligne.');
    eq(p2.tree[0].children[0].id, 'dependance-au-politique');
  });
  await t('le fichier est lisible (extrait)', () => {
    const s = Q.serializeProject(build());
    yes(s.includes('> - #dependance-au-politique @etu1 : « à la solde des politiciens »'));
    yes(s.includes('> - #expertise @etu1 : « Les experts » [2]'));
    yes(s.includes('\\# Titre piégé'));
  });
  await t('occurrences : la 2e « Les experts » est bien localisée', () => {
    const p = build();
    const pa = p.docs[0].paras[2];
    const sp = Q.spans(pa);
    const s = sp.find((x) => x.coding.occ === 2);
    eq(pa.text.slice(s.start, s.end), 'Les experts');
    yes(s.start > 10);
    eq(Q.occurrenceAt(pa.text, 'Les experts', s.start), 2);
  });
  await t('citation introuvable → orpheline, conservée', () => {
    const p = Q.parseProject(Q.serializeProject(build()).replace('qui les payait. Les', 'qui finançait. Les'));
    const sp = Q.spans(p.docs[0].paras[2]);
    yes(sp.some((x) => x.orphan));
    yes(Q.serializeProject(p).includes('« qui les payait »'));
  });
  await t('même codeur, même passage → codes ajoutés sur la même ligne', () => {
    const p = build();
    const pa = p.docs[0].paras[0];
    Q.addCoding(pa, ['expertise'], 'etu1', 'à la solde des politiciens', 1);
    eq(pa.codings.length, 2);
    eq(pa.codings[0].codes, ['dependance-au-politique', 'expertise']);
  });
  await t('retrait d’un code ; ligne supprimée quand vide', () => {
    const p = build();
    const pa = p.docs[0].paras[2];
    Q.removeCodeFromCoding(pa, pa.codings[1], 'expertise');
    eq(pa.codings[1].codes, ['mefiance-envers-la-presse']);
    Q.removeCodeFromCoding(pa, pa.codings[1], 'mefiance-envers-la-presse');
    eq(pa.codings.length, 1);
  });
  await t('fusion de codes : codages réécrits, doublons réunis, sous-codes déplacés', () => {
    const p = build();
    const n = Q.mergeCodes(p, 'mefiance-envers-la-presse', 'expertise');
    eq(n, 2);
    eq(Q.findCode(p, 'mefiance-envers-la-presse'), null);
    eq(Q.findCode(p, 'expertise').children.map((c) => c.id), ['dependance-au-politique']);
    eq(p.docs[0].paras[2].codings[1].codes, ['expertise']);
  });
  await t('fusion dans son propre sous-code refusée', () => {
    const p = build();
    let err = null;
    try { Q.mergeCodes(p, 'mefiance-envers-la-presse', 'dependance-au-politique'); } catch (e) { err = e; }
    yes(err);
  });
  await t('suppression : sous-codes remontés, codages retirés', () => {
    const p = build();
    eq(Q.deleteCode(p, 'mefiance-envers-la-presse'), 2);
    eq(p.tree.map((c) => c.id), ['dependance-au-politique', 'expertise']);
  });
  await t('déplacement : dans, avant, après, refus dans un descendant', () => {
    const p = build();
    yes(Q.moveCode(p, 'expertise', 'mefiance-envers-la-presse', 'inside'));
    eq(Q.parentOf(p, 'expertise').id, 'mefiance-envers-la-presse');
    yes(Q.moveCode(p, 'expertise', 'mefiance-envers-la-presse', 'before'));
    eq(p.tree.map((c) => c.id), ['expertise', 'mefiance-envers-la-presse']);
    yes(!Q.moveCode(p, 'mefiance-envers-la-presse', 'dependance-au-politique', 'inside'));
  });
  await t('codes utilisés mais absents de l’arbre ajoutés à la lecture', () => {
    const s = Q.serializeProject(build()).replace('- Expertise #expertise\n', '');
    const p = Q.parseProject(s);
    yes(Q.findCode(p, 'expertise'));
    eq(p.warnings.length, 1);
  });
  await t('ligne de codage illisible gardée telle quelle', () => {
    const s = Q.serializeProject(build()).replace('> - #expertise @etu1', '> - quelque chose de faux\n> - #expertise @etu1');
    const p = Q.parseProject(s);
    yes(Q.serializeProject(p).includes('> - quelque chose de faux'));
  });
  await t('fichier écrit à la main avec CRLF, BOM, indentation par tabulations', () => {
    const src = '﻿---\r\ntitre: Main\r\n---\r\n# Arbre de codes\r\n- A #a\r\n\t- B #b\r\n# Documents\r\n## Doc\r\n### §1\r\nBonjour tout\r\nle monde\r\n> [!codage]\r\n> - #b @moi : « tout le »\r\n';
    const p = Q.parseProject(src);
    eq(p.tree[0].children[0].id, 'b');
    eq(p.docs[0].paras[0].text, 'Bonjour tout le monde');
    yes(!Q.spans(p.docs[0].paras[0])[0].orphan);
  });
  await t('kappa : accord parfait = 1 ; désaccords listés', () => {
    const p = build();
    const r = Q.agreement(p, 'etu1', 'etu2');
    eq(r.units, 3);
    const e = r.rows.find((x) => x.id === 'expertise');
    eq([e.both, e.onlyA, e.onlyB, e.none], [1, 0, 0, 2]);
    eq(e.kappa, 1);
    const m = r.rows.find((x) => x.id === 'mefiance-envers-la-presse');
    eq([m.both, m.onlyA, m.onlyB, m.none], [0, 1, 1, 1]);
    eq(m.diff.length, 2);
  });
  await t('fusion de deux copies : ajoute, ne duplique pas, idempotente', () => {
    const base = build();
    const other = Q.parseProject(Q.serializeProject(build()));
    Q.addCoding(other.docs[0].paras[1], ['expertise'], 'etu3', 'Titre piégé', 1);
    Q.addCode(other, 'Nouveau code');
    Q.addDoc(other, Q.textToDoc('Entretien Paul', 'Bonjour.\n\nAu revoir.'));
    const r = Q.mergeInto(base, other);
    eq([r.codings, r.already, r.codes, r.docs], [1, 4, ['Nouveau code'], ['Entretien Paul']]);
    const s = Q.serializeProject(base);
    const r2 = Q.mergeInto(base, other);
    eq(r2.codings, 0);
    eq(Q.serializeProject(base), s);
  });
  await t('fusion : renommage du codeur reçu', () => {
    const base = build();
    const other = Q.parseProject(Q.serializeProject(build()));
    const r = Q.mergeInto(base, other, { renameCoder: { etu1: 'etu1b' } });
    eq(r.codings, 3);
    yes(Q.coders(base).includes('etu1b'));
  });
  await t('extraits et exports', () => {
    const p = build();
    eq(Q.extracts(p, 'mefiance-envers-la-presse').length, 2);
    eq(Q.extracts(p, 'mefiance-envers-la-presse', { withChildren: true }).length, 3);
    eq(Q.extracts(p, 'mefiance-envers-la-presse', { coder: 'etu2' }).length, 1);
    const md = Q.extractsMarkdown(p, 'mefiance-envers-la-presse', { withChildren: true });
    yes(md.includes('## Définition') && md.includes('> qui les payait'));
    const c = Q.segmentsCSV(p);
    eq(c.split('\r\n').length, 6);
    const m = Q.matrixCSV(p);
    yes(m.includes('Entretien Marie;D01;;;;;2;1;2'), m);
  });
  await t('annulation : la copie est indépendante', () => {
    const p = build();
    const s = Q.snapshot(p);
    Q.deleteCode(p, 'expertise');
    eq(Q.serializeProject(s), Q.serializeProject(build()).replace(/id: .*/, `id: ${s.meta.id}`).replace(/id: .*/, `id: ${s.meta.id}`));
  });
  await t('import .docx', async () => {
    const buf = fs.readFileSync(path.join(__dirname, 'exemple.docx'));
    const txt = await Q.docxToText(buf);
    const d = Q.textToDoc('exemple.docx', txt);
    eq(d.paras.map((x) => x.text), ['Enquêteur : Vous lisez la presse ?', 'Répondante : Plus depuis 2020 & le Covid.', 'Fin<de>l’entretien.']);
  });
  await t('gros corpus : 30 entretiens × 35 pages, lecture et écriture rapides', () => {
    const p = Q.newProject('Gros');
    Q.addCode(p, 'A'); Q.addCode(p, 'B');
    const para = 'Alors oui, je crois que les médias, enfin les journaux surtout, ne disent pas toujours tout ce qu’ils savent, et ça me pose question. ';
    for (let d = 0; d < 30; d++) {
      const txt = Array.from({ length: 35 * 8 }, (_, i) => `R${i} : ${para.repeat(3)}`).join('\n\n');
      const doc = Q.addDoc(p, Q.textToDoc(`E${d}`, txt));
      doc.paras.forEach((pa, i) => { if (i % 3 === 0) Q.addCoding(pa, ['a'], 'x', 'les médias', 1); if (i % 5 === 0) Q.addCoding(pa, ['b', 'a'], 'y', null); });
    }
    let t0 = Date.now();
    const s = Q.serializeProject(p);
    const tw = Date.now() - t0; t0 = Date.now();
    const p2 = Q.parseProject(s);
    const tr = Date.now() - t0;
    eq(Q.stats(p2).paras, 30 * 280);
    console.log(`     ${(s.length / 1e6).toFixed(1)} Mo — écriture ${tw} ms, lecture ${tr} ms`);
    yes(tw < 1500 && tr < 1500);
  });


  // ===================== 0.2 =====================
  const FG = `[00:01:12] Animatrice : Comment vous informez-vous ?

Marie : Surtout par la radio, le matin.

MARIE : Et un peu Instagram.

Paul : Moi plus du tout. Les journaux mentent.

Ils sont tous pareils : achetés par les mêmes.

Animatrice : Et vous, Sophie ?

Sophie : Je lis Le Soir. Il m'a dit : tu verras bien.`;

  await t('détection des locuteurs : casse, horodatage, phrase avec deux-points', () => {
    const d = Q.textToDoc('Focus', FG);
    const c = Q.detectSpeakers(d);
    const names = c.map((x) => [x.name, x.count, x.role, x.accepted]);
    eq(names.slice(0, 2), [['Animatrice', 2, 'intervieweur', true], ['Marie', 2, 'répondant', true]]);
    yes(c.find((x) => x.name === 'Paul' && !x.accepted), 'Paul (1 fois) proposé mais pas retenu par défaut');
    yes(!c.some((x) => /Ils sont/.test(x.name)), 'phrase avec deux-points');
    eq(Q.speakerPrefix('[00:01:12] Animatrice : Comment ?'), { name: 'Animatrice', start: 11, end: 24 });
    eq(Q.speakerPrefix('Q. Vous lisez ?').name, 'Q');
    eq(Q.speakerPrefix('M. Dupont est venu'), null);
  });
  await t('application : préfixe retiré, héritage, horodatage gardé, rôles', () => {
    const d = Q.textToDoc('Focus', FG);
    const c = Q.detectSpeakers(d).map((x) => ({ ...x, accepted: true }));
    Q.applySpeakers(d, c);
    eq(d.paras.map((x) => x.speaker), ['Animatrice', 'Marie', 'Marie', 'Paul', 'Paul', 'Animatrice', 'Sophie']);
    eq(d.paras[0].text, '[00:01:12] Comment vous informez-vous ?');
    eq(d.paras[2].text, 'Et un peu Instagram.');
    eq(d.speakers.map((s) => [s.name, s.role]), [['Animatrice', 'intervieweur'], ['Marie', 'répondant'], ['Paul', 'répondant'], ['Sophie', 'répondant']]);
    yes(Q.isQuestion(d, d.paras[5]) && !Q.isQuestion(d, d.paras[6]));
  });
  await t('locuteurs repérés après coup : les citations codées sont recalées', () => {
    const d = Q.textToDoc('E', 'Marie : Les journaux mentent. Les journaux mentent.\n\nMarie : la radio.\n\nE : Pourquoi ?');
    Q.addCoding(d.paras[0], ['a'], 'x', 'Les journaux mentent.', 2);
    Q.addCoding(d.paras[0], ['b'], 'x', 'Marie : Les journaux', 1);
    Q.addCoding(d.paras[1], ['c'], 'x', 'Marie', 1);
    Q.addCoding(d.paras[2], ['d'], 'x', null, 1);
    Q.applySpeakers(d, Q.detectSpeakers(d).map((x) => ({ ...x, accepted: true })));
    const pa = d.paras[0];
    eq(pa.text, 'Les journaux mentent. Les journaux mentent.');
    eq(pa.text.slice(Q.locate(pa.text, pa.codings[0].quote, pa.codings[0].occ)), 'Les journaux mentent.');
    eq([pa.codings[1].quote, pa.codings[1].occ], ['Les journaux', 1]);
    yes(Q.spans(d.paras[1])[0].orphan, 'citation qui n’était que le préfixe : signalée');
    eq(d.paras[2].codings[0].quote, null);
    eq(d.paras[2].speaker, 'E');
  });
  await t('renommer / fusionner des locuteurs', () => {
    const d = Q.textToDoc('Focus', FG);
    Q.applySpeakers(d, Q.detectSpeakers(d).map((x) => ({ ...x, accepted: true })));
    Q.renameSpeaker(d, 'Paul', 'Marie');
    eq(d.paras.filter((x) => x.speaker === 'Marie').length, 4);
    eq(d.speakers.map((s) => s.name), ['Animatrice', 'Marie', 'Sophie']);
  });
  const build2 = () => {
    const p = Q.newProject('Groupe');
    const a = Q.addCode(p, 'Méfiance', null, 'Doute.');
    a.memo = 'Premier mémo.\n\n# Une ligne qui commence par un dièse\nFin.';
    Q.addCode(p, 'Radio', a.id);
    const d = Q.addDoc(p, Q.textToDoc('Focus 1', FG));
    Q.applySpeakers(d, Q.detectSpeakers(d).map((x) => ({ ...x, accepted: true })));
    Object.assign(d.meta, { date: '2026-03-12', pseudo: 'Groupe A', intervieweur: 'Zoé D.', lieu: 'Louvain-la-Neuve', durée: '1 h 10' });
    Q.addCoding(d.paras[1], ['radio'], 'zoe', 'par la radio', 1);
    Q.addCoding(d.paras[3], ['mefiance'], 'zoe', 'Les journaux mentent.', 1);
    Q.addCoding(d.paras[4], ['mefiance'], 'zoe', null, 1);
    Q.addCoding(d.paras[3], ['mefiance'], 'tom', 'Les journaux mentent.', 1);
    Q.addCoding(d.paras[6], ['mefiance'], 'tom', 'Je lis Le Soir.', 1);
    Q.addCoding(d.paras[5], ['radio'], 'tom', null, 1);
    Q.logTree(p, 'création', Q.codeRef(p, 'mefiance'), { coder: 'zoe', motif: 'premier code', date: '2026-03-13 10:00' });
    Q.logTree(p, 'imbrication', '« Radio » (#radio) placé sous « Méfiance » (#mefiance)', { coder: 'zoe', date: '2026-03-13 10:05' });
    p.meta.verrou = 'oui';
    return p;
  };
  await t('format qda.md : aller-retour identique (fiche, locuteurs, mémos de codes, journal, verrou)', () => {
    const p = build2();
    const s1 = Q.serializeProject(p);
    const p2 = Q.parseProject(s1);
    eq(p2.warnings, []);
    eq(Q.serializeProject(p2), s1);
    yes(s1.includes('### D01-002\nlocuteur:: Marie\n') && s1.includes('> - Animatrice :: intervieweur') && s1.includes('> lieu:: Louvain-la-Neuve'));
    yes(s1.includes('## Méfiance #mefiance') && s1.includes('\\# Une ligne qui commence par un dièse'));
    yes(s1.includes('- 2026-03-13 10:00 · @zoe · création · « Méfiance » (#mefiance) · motif : premier code'));
    eq(p2.tree[0].memo, 'Premier mémo.\n\n# Une ligne qui commence par un dièse\nFin.');
    eq(p2.docs[0].meta.durée, '1 h 10');
    yes(Q.isLocked(p2));
    eq(p2.journal[1].type, 'imbrication');
  });
  await t('un fichier 0.1 est converti au format qda.md', () => {
    const v1 = '---\nqda-md-etude: 1\ntitre: Ancien\nid: x1\n---\n\n# Arbre de codes\n\n- A #a\n\n# Documents\n\n## Doc\n\n### §1\n\nBonjour le monde\n\n> [!codage]-\n> - #a @moi : « le monde »\n';
    const p = Q.parseProject(v1);
    eq([p.docs[0].paras[0].speaker, p.docs[0].speakers, p.journal, p.rejects, p.tree[0].memo], [null, [], [], [], '']);
    yes(Q.serializeProject(p).startsWith('---\nqda-format: 1\nid: x1\ntitre: Ancien\n---'));
    eq([p.converted, p.docs[0].code, p.docs[0].paras[0].label], [true, 'D01', 'D01-001']);
  });
  await t('kappa : les questions de l’intervieweur sont exclues', () => {
    const p = build2();
    const r = Q.agreement(p, 'tom', 'zoe');
    eq([r.units, r.excluded], [5, 2]);
    const r2 = Q.agreement(p, 'tom', 'zoe', { withQuestions: true });
    eq(r2.units, 7);
  });
  await t('consensus : accords, garder, écarter, revenir sur une décision', () => {
    const p = build2();
    let it = Q.consensusItems(p, 'zoe', 'tom');
    eq(it.length, 5);
    const agree = it.filter((x) => x.agree);
    eq(agree.length, 1);
    Q.consensusKeep(p, agree[0]);
    const onlyTom = it.find((x) => x.para.label === 'D01-007');
    Q.consensusReject(p, onlyTom);
    const onlyZoe = it.find((x) => x.para.label === 'D01-005');
    Q.consensusKeep(p, onlyZoe, 'a');
    it = Q.consensusItems(p, 'zoe', 'tom');
    eq(it.filter((x) => x.decided).length, 3);
    yes(p.docs[0].paras[3].codings.some((c) => c.coder === 'consensus' && c.quote === 'Les journaux mentent.'));
    yes(p.docs[0].paras[4].codings.some((c) => c.coder === 'consensus' && c.quote === null));
    const s = Q.serializeProject(p);
    yes(s.includes('- écarté :: D01 :: D01-007 :: #mefiance'));
    const p2 = Q.parseProject(s);
    eq(Q.consensusItems(p2, 'zoe', 'tom').filter((x) => x.decided).length, 3);
    Q.consensusKeep(p2, Q.consensusItems(p2, 'zoe', 'tom').find((x) => x.para.label === 'D01-007'), 'b');
    eq(p2.rejects.length, 0);
    Q.consensusReject(p2, Q.consensusItems(p2, 'zoe', 'tom').find((x) => x.para.label === 'D01-005'));
    yes(!p2.docs[0].paras[4].codings.some((c) => c.coder === 'consensus'));
  });
  await t('fusion de copies : journal, mémos, fiche et locuteurs réunis', () => {
    const base = build2();
    const other = Q.parseProject(Q.serializeProject(build2()));
    other.tree[0].memo = 'Mémo de Tom.';
    other.docs[0].meta.lieu = 'Autre';
    Q.logTree(other, 'fusion', '« X » (#x) → « Méfiance » (#mefiance) · 2 codage(s)', { coder: 'tom', date: '2026-03-12 09:00' });
    const nouveau = Q.addCode(other, 'Télévision');
    const r = Q.mergeInto(base, other, { coder: 'zoe' });
    eq([r.journal, r.memos, r.codes], [1, 1, ['Télévision']]);
    eq(base.journal[0].coder, 'tom', 'trié par date');
    yes(base.tree[0].memo.includes('Mémo de Tom.') && base.tree[0].memo.startsWith('Premier mémo.'));
    eq(base.docs[0].meta.lieu, 'Louvain-la-Neuve', 'la fiche existante est gardée');
    eq(base.journal[base.journal.length - 1].type, 'ajout par fusion');
    const s = Q.serializeProject(base);
    Q.mergeInto(base, other, { coder: 'zoe' });
    eq(Q.serializeProject(base).split('\n').filter((l) => l.includes('ajout par fusion')).length, 1);
    yes(nouveau);
  });
  await t('fusion : locuteurs reçus sur un document sans locuteurs', () => {
    const base = Q.newProject('B');
    Q.addDoc(base, Q.textToDoc('Focus 1', 'Bonjour.\n\nAu revoir.'));
    const other = Q.newProject('O');
    const d = Q.addDoc(other, Q.textToDoc('Focus 1', 'Bonjour.\n\nAu revoir.'));
    d.paras[0].speaker = 'E'; Q.addSpeaker(d, 'E', 'intervieweur');
    Q.mergeInto(base, other);
    eq([base.docs[0].paras[0].speaker, base.docs[0].speakers[0].role], ['E', 'intervieweur']);
  });
  await t('fusion de codes : le mémo suit, le journal n’est pas touché par le noyau', () => {
    const p = build2();
    const r = Q.addCode(p, 'Presse');
    r.memo = 'À propos de la presse.';
    Q.mergeCodes(p, 'presse', 'mefiance');
    yes(p.tree[0].memo.includes('— Mémo repris de « Presse » —\nÀ propos de la presse.'));
  });
  await t('exports : locuteur, rôle et fiche dans les CSV ; matrice locuteurs × codes', () => {
    const p = build2();
    const seg = Q.segmentsCSV(p).split('\r\n');
    eq(seg[0], '﻿document;code_document;date;pseudo;intervieweur;lieu;paragraphe;variables;locuteur;role;code;chemin;codeur;citation;paragraphe_entier;introuvable');
    yes(seg.some((l) => l.startsWith('Focus 1;D01;2026-03-12;Groupe A;Zoé D.;Louvain-la-Neuve;D01-004;;Paul;répondant;mefiance')));
    const m = Q.speakerMatrix(p, 'zoe');
    const paul = m.rows.find((r) => r.speaker === 'Paul');
    eq([paul.paras, paul.n.mefiance, paul.role], [2, 2, 'répondant']);
    yes(Q.speakerMatrixCSV(p).includes('Focus 1;Animatrice;intervieweur;2;0;1'));
    const md = Q.extractsMarkdown(p, 'mefiance');
    yes(md.includes('## Mémo') && md.includes('**D01-004** · Paul · @zoe') && md.includes('_date : 2026-03-12 · pseudo : Groupe A'));
  });
  await t('vue enseignant : synthèse, couverture, codes hors référence, kappa avec la référence', () => {
    const ref = build2();
    for (const { para } of Q.allParas(ref)) para.codings = para.codings.filter((c) => c.coder === 'tom').map((c) => ({ ...c, coder: 'prof' }));
    const s1 = Q.parseProject(Q.serializeProject(build2()));
    for (const { para } of Q.allParas(s1)) para.codings = para.codings.filter((c) => c.coder === 'zoe');
    Q.addCode(s1, 'Code perso');
    const s2 = Q.parseProject(Q.serializeProject(build2()));
    for (const { para } of Q.allParas(s2)) para.codings = para.codings.filter((c) => c.coder === 'tom');
    const sum = Q.teacherSummary([{ name: 'zoe.qda.md', p: s1 }, { name: 'tom.qda.md', p: s2 }], { name: 'prof', p: ref });
    const [z, tm] = sum.students;
    eq([z.coder, z.extra, tm.coder], ['zoe', ['Code perso'], 'tom']);
    eq(Math.round(z.coverage * 100), 60);
    eq(tm.kappa, 1);
    yes(z.kappa < 1);
    eq(sum.codes.find((c) => c.id === 'code-perso').inRef, false);
    const all = Q.mergeAll([{ name: 'zoe', p: s1 }, { name: 'tom', p: s2 }, { name: 'zoe bis', p: s1 }]);
    eq(Q.coders(all.p), ['tom', 'zoe', 'zoe-2']);
    eq(all.reports[1].renamed, { zoe: 'zoe-2' });
  });
  await t('annulation : la copie 0.2 garde tout', () => {
    const p = build2();
    const snap = Q.snapshot(p);
    p.tree[0].memo = 'changé'; p.docs[0].meta.lieu = 'x'; p.journal.pop(); p.docs[0].paras[1].speaker = 'Paul';
    eq(Q.serializeProject(snap), Q.serializeProject(build2()).replace(/^id: .*$/m, `id: ${snap.meta.id}`));
  });

  // ===================== 0.2.1 =====================
  const ZOE = `Zoé : Bonjour, pouvez-vous vous présenter ?

Je m'appelle Marie, j'ai 24 ans. Zoé : c'est vous qui menez l'étude ?

Et j'habite à Namur.

Zoé : Comment vous informez-vous ?

Surtout par la radio.

Zoé : Merci.`;
  await t('règle 0.2.1 : seule l’intervieweuse est nommée, le reste est au répondant', () => {
    const d = Q.textToDoc('E1', ZOE);
    const c = Q.detectSpeakers(d);
    eq(c.map((x) => [x.name, x.count]), [['Zoé', 3]]);
    eq(Q.suggestMode(d, c), 'respondent');
    c[0].role = Q.ROLE_I;
    Q.applySpeakers(d, c, { mode: 'respondent', respondent: { name: 'Marie', attrs: { 'âge': '24', genre: 'F', profession: 'étudiante' } } });
    eq(d.paras.map((x) => x.speaker), ['Zoé', 'Marie', 'Marie', 'Zoé', 'Marie', 'Zoé']);
    eq(d.paras[1].text, "Je m'appelle Marie, j'ai 24 ans. Zoé : c'est vous qui menez l'étude ?", '« Zoé : » au milieu d’un paragraphe ne compte pas');
    eq(d.speakers.map((x) => [x.name, x.role, x.attrs]), [['Zoé', 'intervieweur', {}], ['Marie', 'répondant', { 'âge': '24', genre: 'F', profession: 'étudiante' }]]);
  });
  await t('pseudo vide → « Répondant »', () => {
    const d = Q.textToDoc('E1', ZOE);
    Q.applySpeakers(d, Q.detectSpeakers(d), { mode: 'respondent' });
    eq(d.paras[2].speaker, 'Répondant');
  });
  await t('mode conseillé : chaque prise de parole nommée → héritage', () => {
    const d = Q.textToDoc('F', FG);
    eq(Q.suggestMode(d, Q.detectSpeakers(d)), 'inherit');
    const d2 = Q.textToDoc('x', 'a\n\nb');
    eq(Q.suggestMode(d2, Q.detectSpeakers(d2)), 'respondent');
  });
  await t('caractéristiques : aller-retour, renommage, fusion de copies, exports', () => {
    const p = Q.newProject('C');
    Q.addCode(p, 'Radio');
    const d = Q.addDoc(p, Q.textToDoc('E1', ZOE));
    Q.applySpeakers(d, Q.detectSpeakers(d).map((x) => ({ ...x, role: Q.ROLE_I })), { mode: 'respondent', respondent: { name: 'Marie', attrs: { 'âge': '24', genre: 'F', 'niveau; études': 'master' } } });
    Q.addCoding(d.paras[4], ['radio'], 'zoe', 'la radio', 1);
    const s = Q.serializeProject(p);
    yes(s.includes('> - Marie :: répondant :: âge: 24 ; genre: F ; niveau, études: master'), s);
    const p2 = Q.parseProject(s);
    eq(Q.serializeProject(p2), s);
    eq(p2.docs[0].speakers[1].attrs, { 'âge': '24', genre: 'F', 'niveau, études': 'master' });
    Q.renameSpeaker(p2.docs[0], 'Marie', 'M.');
    eq(p2.docs[0].speakers.find((x) => x.name === 'M.').attrs.genre, 'F');
    const seg = Q.segmentsCSV(p).split('\r\n');
    yes(seg[0].includes('locuteur;role;locuteur_âge;locuteur_genre;"locuteur_niveau, études";code'), seg[0]);
    yes(seg[1].includes(';Marie;répondant;24;F;master;radio;'), seg[1]);
    yes(Q.speakerMatrixCSV(p).includes('E1;Marie;répondant;24;F;master;3;1'));
    yes(Q.extractsMarkdown(p, 'radio').includes('_Locuteurs : Marie (âge : 24, genre : F, niveau, études : master)_'));
    const base = Q.newProject('B');
    const bd = Q.addDoc(base, Q.textToDoc('E1', ZOE));
    Q.applySpeakers(bd, Q.detectSpeakers(bd).map((x) => ({ ...x, role: Q.ROLE_I })), { mode: 'respondent', respondent: { name: 'Marie', attrs: { genre: 'F' } } });
    Q.mergeInto(base, p);
    eq(base.docs[0].speakers[1].attrs, { genre: 'F', 'âge': '24', 'niveau, études': 'master' });
  });
  await t('fichier 0.2 converti au format qda.md', () => {
    const v = '---\nqda-md-etude: 2\ntitre: X\nid: y\n---\n\n# Arbre de codes\n\n\n# Documents\n\n## D\n\n> [!locuteurs]- Locuteurs\n> - E :: intervieweur\n\n### §1 · E\n\nQuestion ?\n';
    eq(Q.serializeProject(Q.parseProject(v)), '---\nqda-format: 1\nid: y\ntitre: X\n---\n\n# Arbre de codes\n\n# Documents\n\n## D\ndocument:: D01\n\n> [!locuteurs]- Locuteurs\n> - E :: intervieweur\n\n### D01-001\nlocuteur:: E\n\nQuestion ?\n');
  });

  // ===================== 0.2.2 =====================
  await t('lecture rapide d’un document de 3 000 pages (24 000 paragraphes)', () => {
    const p = Q.newProject('Long');
    const d = Q.addDoc(p, Q.textToDoc('E', Array.from({ length: 24000 }, (_, i) => `R${i} : texte du paragraphe ${i}.`).join('\n\n')));
    d.paras[5].label = d.paras[4].label; // deux étiquettes identiques dans le fichier
    const s = Q.serializeProject(p);
    const t0 = Date.now();
    const p2 = Q.parseProject(s);
    const ms = Date.now() - t0;
    console.log(`     ${ms} ms`);
    eq(p2.docs[0].paras.length, 24000);
    eq(p2.docs[0].paras[5].label, 'D01-005');
    eq(p2.warnings, ['Identifiant de paragraphe en double : D01-005']);
    yes(ms < 1500, `${ms} ms`);
  });

  // ===================== 0.4 : format qda.md =====================
  const FX = path.join(__dirname, 'fixtures');
  const exemple = fs.readFileSync(path.join(FX, 'exemple-projet.qda.md'), 'utf8');
  const readDir = (dir, pre = '') => fs.readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return fs.statSync(f).isDirectory() ? readDir(f, pre + n + '/') : [{ path: pre + n, text: fs.readFileSync(f, 'utf8') }];
  });
  await t('qda.md 1 : projet d’exemple lu sans avertissement et réécrit à l’octet près', () => {
    const p = Q.parseProject(exemple);
    eq(p.warnings, []);
    eq([Q.allCodes(p).length, p.docs.length, [...Q.allParas(p)].length], [8, 4, 17]);
    let n = 0, orphans = 0;
    for (const { para } of Q.allParas(p)) { n += para.codings.length; orphans += Q.spans(para).filter((x) => x.orphan).length; }
    eq([n, orphans], [27, 0]);
    eq(Q.serializeProject(p), exemple);
    eq(p.docs[0].paras[3].memo.startsWith('Désaccord sur #fatigue-info'), true);
    eq(p.docs[2].speakers.map((x) => x.role), ['intervieweur', 'participant', 'participant', 'participant']);
    eq(p.docs[3].paras[0].fields.variables, '*age_jeune *genre_f *diplome_sup');
    eq(p.docs[1].paras[1].text.startsWith('1. La radio'), true, 'protection « \\ » retirée');
    eq(p.rejects, [{ doc: 'E01', para: 'E01-004', code: 'fatigue-info' }]);
    eq(Q.consensusItems(p, 'gl', 'zoe').filter((x) => x.rejected).length, 1);
  });
  await t('qda.md 1 : découper en dossier puis réunir redonne le fichier (et le dossier d’exemple)', () => {
    const p = Q.parseProject(exemple);
    const files = Q.splitProject(p);
    const ref = readDir(path.join(FX, 'exemple-projet'));
    eq(Object.keys(files).sort(), ref.map((f) => f.path).sort());
    for (const f of ref) eq(files[f.path], f.text, f.path);
    const back = Q.joinProject(ref.map((f) => ({ path: 'exemple-projet/' + f.path, text: f.text })));
    eq(Q.serializeProject(back), exemple);
  });
  await t('qda.md 1 : archive .zip du dossier, écrite puis relue', async () => {
    const p = Q.parseProject(exemple);
    const files = Object.fromEntries(Object.entries(Q.splitProject(p)).map(([k, v]) => ['mon-projet/' + k, v]));
    const zip = Q.zipFiles(files);
    const back = await Q.unzipAll(zip.buffer, (n) => n.endsWith('.md'));
    eq(back.length, 5);
    eq(Q.serializeProject(Q.joinProject(back)), exemple);
  });
  await t('qda.md 1 : ce qui n’est pas compris est conservé', () => {
    const src = exemple
      .replace('verrou: non\n', 'verrou: non\nequipe: "labo: ORM"\n')
      .replace('# Documents\n', '# Équations\n\n- E1 = #a ET #b\n\n# Documents\n')
      .replace('- Fatigue informationnelle #fatigue-info\n', '- Fatigue informationnelle #fatigue-info\n  origine:: inductif\n')
      .replace('document:: E02\n', 'document:: E02\nlangue:: fr\n')
      .replace('### E02-002\nlocuteur:: Paul\n', '### E02-002\nlocuteur:: Paul\nminutage:: 00:03:12\n')
      .replace('> - #dependance-economique @zoe : « ils ne vont pas taper sur leurs annonceurs »\n', '> - #dependance-economique @zoe : « ils ne vont pas taper sur leurs annonceurs »\n\n> [!note]- Remarque\n> à revoir\n');
    const p = Q.parseProject(src);
    eq(Q.serializeProject(p), src);
    eq(Q.findCode(p, 'fatigue-info').fields, { origine: 'inductif' });
    eq(p.meta.equipe, 'labo: ORM');
    Q.addCoding(p.docs[1].paras[1], ['verification'], 'gl', 'tous les matins');
    const s2 = Q.serializeProject(p);
    yes(s2.includes('minutage:: 00:03:12') && s2.includes('> [!note]- Remarque') && s2.includes('# Équations'));
  });
  await t('qda.md 1 : ajouter puis retirer un codage redonne le fichier', () => {
    const p = Q.parseProject(exemple);
    const pa = p.docs[0].paras[5];
    const c = Q.addCoding(pa, ['fatigue-info'], 'test', 'pas souvent');
    yes(Q.serializeProject(p) !== exemple);
    Q.removeCodeFromCoding(pa, c, 'fatigue-info');
    eq(Q.serializeProject(p), exemple);
  });
  await t('qda.md 1 : protection des lignes de texte', () => {
    const p = Q.newProject('P');
    const d = Q.addDoc(p, Q.textToDoc('D', '1) un\n\n- deux\n\n%% trois\n\nquatre\n\n\\cinq\n\nsix'));
    d.paras[3].text = '**** quatre';
    const s = Q.serializeProject(p);
    yes(s.includes('\n\\1) un\n') && s.includes('\n\\- deux\n') && s.includes('\n\\%% trois\n') && s.includes('\n\\**** quatre\n') && s.includes('\n\\\\cinq\n') && s.includes('\nsix\n'), s);
    eq(Q.parseProject(s).docs[0].paras.map((x) => x.text), d.paras.map((x) => x.text));
  });
  await t('qda.md 1 : codes de documents et identifiants de paragraphes', () => {
    const p = Q.newProject('P');
    const a = Q.addDoc(p, Q.textToDoc('A', 'un\n\ndeux'));
    const b = Q.addDoc(p, Q.textToDoc('B', '**** *ID_1 *g_f\nx\n**** *ID_2\ny'));
    const c = Q.addDoc(p, Q.textToDoc('C', '**** *ID_1\nz'));
    eq([a.code, b.code, c.code], ['D01', 'D02', 'D03']);
    eq([a.paras.map((x) => x.label), b.paras.map((x) => x.label), c.paras.map((x) => x.label)], [['D01-001', 'D01-002'], ['ID_1', 'ID_2'], ['D03-ID_1']]);
    p.rejects.push({ doc: 'D01', para: 'D01-002', code: 'x' });
    Q.renameDocCode(p, a, 'E01');
    eq([a.paras.map((x) => x.label), p.rejects[0]], [['E01-001', 'E01-002'], { doc: 'E01', para: 'E01-002', code: 'x' }]);
    let err = '';
    try { Q.renameDocCode(p, b, 'e01'); } catch (e) { err = e.message; }
    yes(/déjà utilisé/.test(err), err);
    try { Q.renameDocCode(p, b, 'CON'); } catch (e) { err = e.message; }
    yes(/réservé/.test(err), err);
    eq(Q.slugify('2024'), 'code-2024');
  });
  await t('qda.md 1 : import d’un projet d’un autre projet (codes en conflit) par fusion', () => {
    const base = Q.parseProject(exemple);
    const other = Q.newProject('Autre');
    const d = Q.addDoc(other, Q.textToDoc('Autre entretien', 'Bonjour\n\nAu revoir'));
    Q.renameDocCode(other, d, 'E01');
    Q.addCoding(d.paras[1], ['adieu'], 'max', null);
    other.tree.push({ id: 'adieu', label: 'Adieu', def: '', memo: '', fields: {}, children: [] });
    const rep = Q.mergeInto(base, other);
    eq(rep.docs, ['Autre entretien']);
    const nd = base.docs[base.docs.length - 1];
    eq([nd.code, nd.paras.map((x) => x.label), nd.paras[1].codings.length], ['D01', ['D01-001', 'D01-002'], 1]);
    const again = Q.mergeInto(base, Q.parseProject(exemple));
    eq([again.codings, again.docs.length], [0, 0]);
  });
  await t('QDA-md 0.9.1 : dossier ancien format importé et converti', () => {
    const files = [
      { path: 'vieux/arbre.md', text: '---\ntype: arbre-de-codes\nmethode: thematique\n---\n\n- Dépendance #dependance\n  > Réflexion sur ce code.\n  - Politique #politique\n' },
      { path: 'vieux/donnees/corpus_confiance.md', text: '---\ncorpus: corpus_confiance\nsource: enquête 2021\n---\n\n## ID_1373\nvariables:: *age_1 *sexe_f\n\nA la botte\ndes politiques.\n\n> [!codage]-\n> - #politique @OA : (réponse entière)\n\n## ID_7353\nvariables:: *age_2\n\nA la solde des gouvernements.\n\n> [!codage]-\n> - #dependance @OA : « A la solde »\n' },
      { path: 'vieux/donnees/extraits_politique.md', text: '# extraits' },
      { path: 'vieux/.qda/journal.jsonl', text: '{}' },
    ];
    const p = Q.joinProject(files);
    eq(p.converted, 'qda-md');
    eq([p.meta.methode, Q.findCode(p, 'dependance').memo, Q.findCode(p, 'dependance').def], ['thematique', 'Réflexion sur ce code.', '']);
    const d = p.docs[0];
    eq([d.name, d.code, d.meta.source, d.paras.map((x) => x.label)], ['corpus_confiance', 'corpus_confiance', 'enquête 2021', ['ID_1373', 'ID_7353']]);
    eq([d.paras[0].text, d.paras[0].fields.variables, d.paras[0].codings[0].quote], ['A la botte des politiques.', '*age_1 *sexe_f', null]);
    const s = Q.serializeProject(p);
    yes(s.includes('> - #politique @OA : (réponse entière)'), 'ancienne forme gardée tant que la ligne n’est pas modifiée');
    eq(Q.serializeProject(Q.parseProject(s)), s);
    yes(p.warnings.some((w) => /mémos de codes/.test(w)));
  });

  await t('origine des codes : champ « origine:: » lu, modifié, réécrit et fusionné', () => {
    const p = Q.parseProject(exemple.replace('- Fatigue informationnelle #fatigue-info\n', '- Fatigue informationnelle #fatigue-info\n  origine:: inductif\n'));
    eq([Q.originOf(Q.findCode(p, 'fatigue-info')), Q.originOf(Q.findCode(p, 'verification'))], ['inductif', '']);
    const n = Q.findCode(p, 'defiance-medias');
    Q.setOrigin(n, 'deductif', '  Hallin et  Mancini ');
    const s = Q.serializeProject(p);
    yes(s.includes('- Défiance envers les médias #defiance-medias\n  origine:: deductif\n  theorie:: Hallin et Mancini\n  > Passage où'), s.slice(0, 600));
    eq(Q.serializeProject(Q.parseProject(s)), s);
    Q.setOrigin(n, '', '');
    eq(n.fields, {});
    let err = ''; try { Q.setOrigin(n, 'abductif'); } catch (e) { err = e.message; }
    yes(/inconnue/.test(err));
    const base = Q.parseProject(exemple), other = Q.parseProject(s);
    Q.setOrigin(Q.findCode(base, 'fatigue-info'), 'deductif');
    Q.mergeInto(base, other);
    eq([Q.originOf(Q.findCode(base, 'defiance-medias')), Q.findCode(base, 'defiance-medias').fields.theorie, Q.originOf(Q.findCode(base, 'fatigue-info'))], ['deductif', 'Hallin et Mancini', 'deductif'], 'fusion : ajoute sans écraser');
  });
  await t('exports CSV : formules neutralisées', () => {
    const p = Q.newProject('P');
    const d = Q.addDoc(p, Q.textToDoc('D', '=HYPERLINK("http://x","clic")'));
    Q.addCoding(d.paras[0], ['a'], 'z', null);
    yes(Q.segmentsCSV(p).includes(`"'=HYPERLINK(""http://x"",""clic"")"`), Q.segmentsCSV(p));
  });
  console.log(`\n${ok} réussi(s), ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})();
