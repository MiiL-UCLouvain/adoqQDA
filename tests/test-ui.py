import os
"""Tests de l'interface dans Chrome : python tests/test-ui.py"""
import sys, time, json, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = max((ROOT / "dist").glob("adoq-QDA-*.html"), key=lambda f: f.stat().st_mtime).as_uri()
SHOTS = ROOT / "tests" / "shots"; SHOTS.mkdir(exist_ok=True)
TMP = Path(tempfile.mkdtemp())
ok = ko = 0
errors = []

def check(name, cond, info=""):
    global ok, ko
    if cond: ok += 1; print("  ✓", name)
    else: ko += 1; print("  ✗", name, info)

FS_MOCK = """
window.__files = {};
const mkHandle = (name) => ({ kind:'file', name,
  queryPermission: async()=>'granted', requestPermission: async()=>'granted',
  createWritable: async()=>{ let buf=''; return { write: async(t)=>{buf+=t}, close: async()=>{ window.__files[name]=buf; } }; },
  getFile: async()=> new File([window.__files[name]||''], name) });
window.showSaveFilePicker = async (o) => mkHandle(o && o.suggestedName || 'x.qda.md');
window.showOpenFilePicker = async () => [mkHandle(window.__openName)];
"""

def select_text(page, para_sel, text, nth=1):
    page.evaluate("""([sel, text, nth]) => {
      const box = document.querySelector(sel + ' .ptext');
      const full = box.textContent; let pos=-1; for(let i=0;i<nth;i++) pos = full.indexOf(text, pos+1);
      if (pos<0) throw new Error('texte absent');
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); let n, acc=0, s=null, e=null;
      while((n=walker.nextNode())){ const L=n.data.length;
        if(!s && pos < acc+L) s=[n,pos-acc];
        if(!e && pos+text.length <= acc+L) { e=[n,pos+text.length-acc]; break; }
        acc+=L; }
      const r=document.createRange(); r.setStart(...s); r.setEnd(...e);
      const sel2=getSelection(); sel2.removeAllRanges(); sel2.addRange(r);
      box.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    }""", [para_sel, text, nth])
    page.wait_for_selector("#pop:not([hidden])")

def proj(page):
    return page.evaluate("() => window.__qda.Q.serializeProject(window.__qda.S.p)")

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--allow-file-access-from-files"])

    # ===== 1. Chrome avec enregistrement automatique (API simulée) =====
    print("Chrome, enregistrement automatique")
    ctx = browser.new_context(viewport={"width": 1400, "height": 860}, accept_downloads=True)
    ctx.add_init_script(FS_MOCK)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(URL)
    page.wait_for_selector(".bigbtns")
    page.screenshot(path=SHOTS / "01-accueil.png")
    check("accueil : enregistrement automatique annoncé", "enregistre automatiquement" in page.inner_text("#home"))

    page.click("text=Projet d’exemple")
    page.wait_for_selector("#dlg[open]")
    page.fill("#askv", "lea m")
    page.click("#dlgbtns button.primary")
    page.wait_for_timeout(200)
    check("identifiant nettoyé", page.input_value("#coder") == "lea_m")
    page.wait_for_selector(".para")
    page.screenshot(path=SHOTS / "02-exemple.png")
    check("2e entretien affiché", "Marc" in page.inner_text("#dochead"))

    # coder avec un nouveau code
    select_text(page, "#p-1-3", "Dans l’ensemble, oui")
    page.screenshot(path=SHOTS / "03-popover.png")
    page.fill("#popq", "Confiance dans les médias")
    page.keyboard.press("Enter")
    page.wait_for_timeout(200)
    s = proj(page)
    check("nouveau code créé et appliqué", "- Confiance dans les médias #confiance-dans-les-medias" in s and "> - #confiance-dans-les-medias @lea_m : « Dans l’ensemble, oui »" in s)
    # même code par Entrée (code actif)
    select_text(page, "#p-1-3", "Ce sont des professionnels, ils ont des règles.")
    page.keyboard.press("Enter")
    page.wait_for_timeout(150)
    check("Entrée réapplique le code actif", "« Ce sont des professionnels, ils ont des règles. »" in proj(page))
    # chevauchement + 2e code via la liste
    select_text(page, "#p-1-3", "ils les corrigent. Ce sont des professionnels")
    page.fill("#popq", "expert")
    page.wait_for_timeout(100)
    page.click("#poplist .pitem >> nth=0")
    page.wait_for_timeout(150)
    check("chevauchement codé avec un code existant", "#rapport-a-l-expertise @lea_m : « ils les corrigent. Ce sont des professionnels »" in proj(page))
    check("barres de couleur empilées", page.evaluate("() => [...document.querySelectorAll('#p-1-3 mark')].some(m => m.style.paddingBottom === '6px')"))
    # paragraphe entier
    page.hover("#p-1-7")
    page.click("#p-1-7 [data-whole]")
    page.fill("#popq", "réseaux")
    page.keyboard.press("Enter")
    page.wait_for_timeout(150)
    check("paragraphe entier", "#reseaux @lea_m : (paragraphe entier)" in proj(page))
    page.screenshot(path=SHOTS / "04-codage.png")
    # sélection à cheval sur deux paragraphes : refusée
    page.evaluate("""() => { const tx=(sel)=>document.createTreeWalker(document.querySelector(sel),NodeFilter.SHOW_TEXT).nextNode(); const a=tx('#p-1-1 .ptext'), b=tx('#p-1-3 .ptext');
      const r=document.createRange(); r.setStart(a,2); r.setEnd(b,4); getSelection().removeAllRanges(); getSelection().addRange(r);
      document.querySelector('#p-1-1 .ptext').dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); }""")
    page.wait_for_timeout(100)
    check("sélection sur deux paragraphes refusée", page.is_hidden("#pop") and "un seul paragraphe" in page.inner_text("#toast"))

    # retrait, annuler, rétablir
    n0 = proj(page).count("@lea_m")
    page.click("#p-1-7 .chip .x")
    page.wait_for_timeout(100)
    check("retrait d’un code", proj(page).count("@lea_m") == n0 - 1)
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Ctrl+Z", proj(page).count("@lea_m") == n0)
    page.keyboard.press("Control+y"); page.wait_for_timeout(100)
    check("Ctrl+Y", proj(page).count("@lea_m") == n0 - 1)
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)

    # enregistrement automatique
    page.click("#saveBtn")
    page.wait_for_timeout(500)
    files = page.evaluate("() => window.__files")
    check("Enregistrer → fichier écrit", "exemple.qda.md" in files and "@lea_m" in files["exemple.qda.md"])
    check("statut « Enregistré »", "Enregistré" in page.inner_text("#status"))
    select_text(page, "#p-1-5", "Il y a sans doute des liens")
    page.fill("#popq", "Dépendance au politique"); page.keyboard.press("Enter")
    page.wait_for_timeout(1800)
    files = page.evaluate("() => window.__files")
    check("enregistrement automatique après un codage", "« Il y a sans doute des liens »" in files["exemple.qda.md"])

    # arbre : renommer, définition, glisser-déposer, fusion, suppression
    row = lambda cid: f'.trow[data-code="{cid}"]'
    page.click(row("reseaux") + " .lab"); page.click(row("reseaux") + ' [data-t="ren"]')
    page.fill("#askv", "Méfiance envers les réseaux sociaux"); page.click("#dlgbtns .primary"); page.wait_for_timeout(100)
    check("renommer : identifiant inchangé", "- Méfiance envers les réseaux sociaux #reseaux" in proj(page))
    page.click(row("reseaux") + " .lab"); page.click(row("reseaux") + ' [data-t="def"]')
    page.fill("#askv", "Méfiance exprimée envers les contenus des réseaux sociaux."); page.click("#dlgbtns .primary"); page.wait_for_timeout(100)
    check("définition", "  > Méfiance exprimée envers les contenus des réseaux sociaux." in proj(page))
    page.drag_and_drop(row("reseaux"), row("mefiance-envers-les-medias"))
    page.wait_for_timeout(150)
    check("glisser-déposer dans un code", page.evaluate("() => window.__qda.Q.parentOf(window.__qda.S.p,'reseaux')?.id") == "mefiance-envers-les-medias")
    page.drag_and_drop(row("mefiance-envers-les-medias"), row("reseaux"))
    page.wait_for_timeout(150)
    check("refus de ranger un code dans son sous-code", page.evaluate("() => window.__qda.Q.parentOf(window.__qda.S.p,'mefiance-envers-les-medias')") is None)
    page.click(row("dependance-economique") + " .lab"); page.click(row("dependance-economique") + ' [data-t="mrg"]')
    page.select_option("#mrgto", "dependance-au-politique"); page.click("#dlgbtns .primary"); page.wait_for_timeout(150)
    s = proj(page)
    check("fusion de codes", "#dependance-economique @" not in s and "- Dépendance économique #" not in s and "· fusion · « Dépendance économique » (#dependance-economique) fusionné dans « Dépendance au politique »" in s and "#dependance-au-politique @exemple : « Un média qui vit de la publicité" in s)
    page.screenshot(path=SHOTS / "05-arbre.png")
    page.click(row("sources-alternatives") + " .lab"); page.click(row("sources-alternatives") + ' [data-t="del"]')
    page.click("#dlgbtns .primary"); page.wait_for_timeout(100)
    check("suppression", "#sources-alternatives @" not in proj(page) and "· suppression · « Sources alternatives »" in proj(page))
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("suppression annulée", "#sources-alternatives @exemple" in proj(page))

    # extraits
    page.dblclick(row("mefiance-envers-les-medias") + " .lab")
    page.wait_for_selector("#dlg[open] .ex")
    page.check("#exch"); page.wait_for_timeout(100)
    n_ex = page.locator("#dlg .ex").count()
    page.screenshot(path=SHOTS / "06-extraits.png")
    check("extraits avec sous-codes", n_ex >= 4, n_ex)
    with page.expect_download() as dl:
        page.click('#dlgbtns button[value="exp"]')
    txt = Path(dl.value.path()).read_text(encoding="utf-8")
    check("export des extraits .md", txt.startswith("# Extraits — Méfiance envers les médias") and "## Définition" in txt)

    # filtre, mémo, recherche
    page.click(row("confiance-dans-les-medias") + " .lab")
    page.select_option("#filter", "active"); page.wait_for_timeout(100)
    check("filtre « code actif »", page.locator(".para").count() == 1)
    page.select_option("#filter", "all")
    page.click("#memobtn"); page.fill("#memotext", "Lecteur fidèle de la presse écrite.")
    page.wait_for_timeout(100)
    check("mémo de document", "> [!memo]- Mémo du document\n> Lecteur fidèle de la presse écrite." in proj(page))
    page.fill("#search", "tiktok"); page.wait_for_timeout(350)
    check("recherche", page.locator("#searchres .res").count() == 2)
    page.click("#searchres .res"); page.wait_for_timeout(200)
    check("aller au résultat", "Julie" in page.inner_text("#dochead"))

    # import .txt et .docx
    (TMP / "Entretien 3.txt").write_text("Q : Bonjour.\n\nR : Je lis la presse locale.\n\nR : Et Vers l’Avenir.", encoding="cp1252")
    page.click("#left button.add")
    with page.expect_file_chooser() as fc:
        page.click("#impbtn")
    fc.value.set_files([str(TMP / "Entretien 3.txt"), str(ROOT / "tests" / "exemple.docx")])
    page.wait_for_selector("#implist .ex >> nth=1")
    page.screenshot(path=SHOTS / "07-import.png")
    page.click("#dlgbtns .primary"); page.wait_for_timeout(200)
    names = page.evaluate("() => window.__qda.S.p.docs.map(d=>d.name)")
    check("import .txt (cp1252) et .docx", names[-2:] == ["Entretien 3", "exemple"] and "Vers l’Avenir" in proj(page), names)

    # livre de codes
    with page.expect_download() as dl:
        page.hover(".drop"); page.click('[data-act="exp-codebook"]')
    cb = Path(dl.value.path()).read_text(encoding="utf-8")
    check("livre de codes", "## Méfiance envers les médias" in cb and "### Méfiance envers les réseaux sociaux" in cb)

    # comparaison : copie d'un collègue
    other = page.evaluate("""() => { const Q=window.__qda.Q; const o=Q.parseProject(Q.serializeProject(window.__qda.S.p));
      for (const d of o.docs) for (const p of d.paras) p.codings = p.codings.filter(c=>c.coder==='exemple');
      const d=o.docs[1]; Q.addCoding(d.paras[3], ['confiance-dans-les-medias'], 'tom', 'Dans l’ensemble, oui', 1);
      Q.addCoding(d.paras[5], ['mefiance-envers-les-medias'], 'tom', null, 1);
      Q.addCoding(d.paras[7], ['reseaux'], 'tom', null, 1);
      return Q.serializeProject(o); }""")
    page.evaluate("t => { window.__files['tom.qda.md'] = t; window.__openName = 'tom.qda.md'; }", other)
    page.click('[data-act="compare"]')
    page.click('[data-tab="m"]')
    page.wait_for_selector("#pickother")
    page.click("#pickother"); page.wait_for_selector("#domerge")
    page.screenshot(path=SHOTS / "08-fusion.png")
    page.click("#domerge"); page.wait_for_selector("#ka")
    page.select_option("#ka", "lea_m"); page.select_option("#kb", "tom"); page.wait_for_timeout(100)
    page.screenshot(path=SHOTS / "09-kappa.png")
    rows = page.locator("[data-pane=k] tr.click").count()
    check("fusion puis tableau d’accord", "tom" in page.evaluate("() => window.__qda.Q.coders(window.__qda.S.p)") and rows >= 2, rows)
    page.click("[data-pane=k] tr.click >> nth=0"); page.wait_for_timeout(100)
    check("liste des désaccords", page.locator("#kdiff .ex").count() >= 1)
    page.keyboard.press("Escape")

    # gros corpus
    t = page.evaluate("""() => { const Q=window.__qda.Q; const p=Q.newProject('Gros'); Q.addCode(p,'A'); Q.addCode(p,'B');
      const para='Alors oui, je crois que les médias, enfin les journaux surtout, ne disent pas toujours tout ce qu’ils savent, et ça me pose question. ';
      for (let d=0; d<30; d++) { const txt = Array.from({length:280},(_,i)=>`R${i} : ${para.repeat(3)}`).join('\\n\\n');
        const doc=Q.addDoc(p,Q.textToDoc('E'+d,txt)); doc.paras.forEach((pa,i)=>{ if(i%3===0) Q.addCoding(pa,['a'],'x','les médias',1); if(i%5===0) Q.addCoding(pa,['b','a'],'y',null);}); }
      const text=Q.serializeProject(p); let t0=performance.now(); window.__qda.openText(text,'gros.qda.md'); const open=performance.now()-t0;
      return {mo: text.length/1e6, open}; }""")
    page.wait_for_timeout(300)
    t1 = time.time(); page.click("#docs li >> nth=12"); page.wait_for_selector("#dochead >> text=E12"); sw = (time.time() - t1) * 1000
    t1 = time.time(); select_text(page, "#p-12-40", "ne disent pas toujours"); page.fill("#popq", "B"); page.keyboard.press("Enter"); page.wait_for_timeout(50)
    code_ms = (time.time() - t1) * 1000
    print(f"     gros corpus {t['mo']:.1f} Mo : ouverture {t['open']:.0f} ms, changement de document {sw:.0f} ms, codage {code_ms:.0f} ms")
    check("gros corpus utilisable", t["open"] < 2000 and sw < 1500 and code_ms < 1500)
    page.screenshot(path=SHOTS / "10-gros.png")
    ctx.close()


    # ===== 0.2 : locuteurs, fiche, mémos, journal, verrou, consensus =====
    print("Fonctions 0.2")
    ctx = browser.new_context(viewport={"width": 1400, "height": 860}, accept_downloads=True)
    ctx.add_init_script(FS_MOCK)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept("trop proche de la méfiance"))
    page.goto(URL); page.wait_for_selector(".bigbtns")
    page.evaluate("localStorage.setItem('qdaE.coder', JSON.stringify('zoe'))"); page.reload(); page.wait_for_selector(".bigbtns")
    page.click("text=Projet d’exemple"); page.wait_for_selector(".para")
    page.click("#docs li >> nth=2"); page.wait_for_timeout(150)
    check("exemple : focus group avec locuteurs", page.locator(".para.q").count() == 2 and page.locator("#spkfilter option").count() == 5)
    page.screenshot(path=SHOTS / "12-focus.png")
    page.select_option("#spkfilter", "Hugo"); page.wait_for_timeout(100)
    check("filtre par locuteur", page.locator(".para").count() == 2)
    page.select_option("#spkfilter", "")
    page.check("#hideq"); page.wait_for_timeout(100)
    check("masquer les questions", page.locator(".para.q").count() == 0 and page.locator(".para").count() == 6)
    page.uncheck("#hideq")
    # locuteurs : tableau qui code quoi
    page.click("#spkbtn"); page.wait_for_selector("#dlg[open] table.t")
    check("dialogue des locuteurs : qui mobilise quels codes", "Qui mobilise" in page.inner_text("#dlgbody") and "Inès" in page.inner_text("#dlgbody"))
    page.screenshot(path=SHOTS / "13-locuteurs.png")
    page.fill('[data-sname="1"]', "Inès B.")
    page.click("#spksave"); page.wait_for_timeout(150)
    page.keyboard.press("Escape")
    check("renommer un locuteur", "### FG1-002\nlocuteur:: Inès B." in proj(page) and "> - Inès B. :: répondant" in proj(page))
    # locuteur d'un paragraphe
    page.click("#p-2-2 [data-spk]"); page.wait_for_selector("#psel")
    page.select_option("#psel", "Lucas"); page.uncheck("#pnext"); page.click("#dlgbtns .primary"); page.wait_for_timeout(150)
    check("changer le locuteur d’un paragraphe", "### FG1-003\nlocuteur:: Lucas" in proj(page))
    # fiche
    page.click("#fichebtn"); page.wait_for_selector("#m_lieu")
    page.fill("#m_lieu", "Louvain-la-Neuve (auditoire)"); page.fill("#m_date", "2026-03-05")
    page.click("#dlgbody details summary"); page.fill("#m_nk", "durée"); page.fill("#m_nv", "45 min")
    page.click("#dlgbtns .primary"); page.wait_for_timeout(150)
    s = proj(page)
    check("fiche de l’entretien", "> lieu:: Louvain-la-Neuve (auditoire)" in s and "> date:: 2026-03-05" in s and "> durée:: 45 min" in s)
    check("fiche affichée sous le titre", "05/03/2026" in page.inner_text("#dochead"))
    # import avec repérage des locuteurs
    page.click("#left button.add"); page.wait_for_selector("#impbtn")
    page.click('[data-tab="c"]'); page.fill("#pname", "Entretien Nadia")
    page.fill("#ptext", "Int. : Bonjour, vous lisez la presse ?\n\nNadia : Oui, Le Soir.\n\nINT : Pourquoi ?\n\nNadia : Par habitude.\n\nC’est mon père qui le lisait.")
    page.click("#padd"); page.wait_for_selector('[data-ktgt]')
    check("import : variantes « Int. » et « INT » regroupées", page.locator('[data-ktgt]').count() == 2)
    page.screenshot(path=SHOTS / "14-import-locuteurs.png")
    page.click("#dlgbtns .primary"); page.wait_for_timeout(200)
    s = proj(page)
    check("import : locuteurs repérés, variantes fusionnées, héritage", "### D01-001\nlocuteur:: Int\n\nBonjour, vous lisez la presse ?" in s and "### D01-003\nlocuteur:: Int" in s and "### D01-005\nlocuteur:: Nadia\n\nC’est mon père" in s and "> - Int :: intervieweur" in s, s[s.find('## Entretien Nadia'):][:500])
    # règle 0.2.1 : seule l'intervieweuse est nommée ; pseudo et caractéristiques demandés à l'import
    page.click("#left button.add"); page.wait_for_selector("#impbtn")
    page.click('[data-tab="c"]'); page.fill("#pname", "Entretien 4")
    page.fill("#ptext", "Zoé : Bonjour, vous lisez la presse ?\n\nOui, Le Soir, tous les matins.\n\nC’est une habitude familiale.\n\nZoé : Et les réseaux sociaux ?\n\nTrès peu.")
    page.click("#padd"); page.wait_for_selector("[data-resp]")
    check("import : mode « paragraphes sans nom = répondant » proposé", page.is_checked('[data-mode="respondent"]') and page.input_value('[data-krole="0"]') == "intervieweur")
    page.fill("[data-resp]", "Paul")
    page.fill('[data-attr="__resp"][data-ak="âge"]', "67"); page.fill('[data-attr="__resp"][data-ak="genre"]', "H")
    page.fill('[data-attr="__resp"][data-ak="profession"]', "retraité"); page.fill('[data-attr="__resp"][data-ak="__autres"]', "commune: Namur ; diplôme: CESS")
    page.screenshot(path=SHOTS / "19-import-repondant.png")
    page.click("#dlgbtns .primary"); page.wait_for_timeout(200)
    s = proj(page)
    seg = s[s.find("## Entretien 4"):]
    check("import : réponses attribuées au pseudo, caractéristiques gardées", "> - Paul :: répondant :: âge: 67 ; genre: H ; profession: retraité ; commune: Namur ; diplôme: CESS" in seg and "### D02-002\nlocuteur:: Paul\n\nOui, Le Soir" in seg and "### D02-003\nlocuteur:: Paul" in seg and "### D02-004\nlocuteur:: Zoé" in seg and "> pseudo:: Paul" in seg, seg[:700])
    page.hover("#p-4-1 [data-spk]")
    check("info-bulle du locuteur : caractéristiques", "âge : 67" in page.get_attribute("#p-4-1 [data-spk]", "title"))
    # caractéristiques modifiées dans le dialogue Locuteurs
    page.click("#spkbtn"); page.wait_for_selector("#spksave")
    page.fill('[data-attr="s:1"][data-ak="profession"]', "ancien cheminot")
    page.click("#spksave"); page.wait_for_timeout(150); page.keyboard.press("Escape")
    check("caractéristiques modifiées", "profession: ancien cheminot" in proj(page))
    check("export segments : colonnes des caractéristiques", "locuteur_âge" in page.evaluate("() => window.__qda.Q.segmentsCSV(window.__qda.S.p)").split("\n")[0])
    # mémo de code
    page.click('.trow[data-code="mefiance-envers-les-medias"] .lab'); page.click('.trow[data-code="mefiance-envers-les-medias"] [data-t="memo"]')
    page.fill("#askv", "Nouveau mémo.\n\n# Avec un titre"); page.click("#dlgbtns .primary"); page.wait_for_timeout(150)
    s = proj(page)
    check("mémo de code", "# Mémos des codes\n\n## Méfiance envers les médias #mefiance-envers-les-medias\n\nNouveau mémo.\n\n\\# Avec un titre" in s)
    # journal : création par le popover, motif
    page.click("#docs li >> nth=0"); page.wait_for_timeout(100)
    select_text(page, "#p-0-7", "je vérifie quand même")
    page.fill("#popq", "Vérification"); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    check("journal : création notée", "· @zoe · création · « Vérification » (#verification)" in proj(page))
    page.click('[data-act="journal"]'); page.wait_for_selector("#dlg[open] .jline")
    page.screenshot(path=SHOTS / "15-journal.png")
    page.click("[data-jm] >> nth=0"); page.wait_for_timeout(150)
    check("journal : motif ajouté", "création · « Vérification » (#verification) · motif : trop proche de la méfiance" in proj(page))
    page.keyboard.press("Escape")
    page.drag_and_drop('.trow[data-code="verification"]', '.trow[data-code="sources-alternatives"]'); page.wait_for_timeout(150)
    check("journal : imbrication notée", "· imbrication · « Vérification » (#verification) placé sous « Sources alternatives »" in proj(page))
    # verrou
    page.click('[data-act="lock"]'); page.fill("#lockcode", "prof"); page.click("#dlgbtns .primary"); page.wait_for_timeout(200)
    check("verrouillage avec code", "verrou: sha256:" in proj(page) and page.locator('#treebar [data-act="newcode"]').count() == 0)
    page.click('.trow[data-code="verification"] .lab')
    check("arbre verrouillé : seules les actions extraits et mémo", page.locator('.trow[data-code="verification"] .tact button').count() == 2)
    select_text(page, "#p-0-7", "Je ne suis pas naïve")
    page.fill("#popq", "Naïveté"); page.wait_for_timeout(100)
    check("arbre verrouillé : pas de création dans le popover", page.locator("#poplist .create").count() == 0)
    page.keyboard.press("Escape")
    page.screenshot(path=SHOTS / "16-verrou.png")
    page.click('[data-act="lock"]'); page.fill("#askv", "faux"); page.click("#dlgbtns .primary"); page.wait_for_timeout(200)
    check("mauvais code refusé", "verrou: sha256:" in proj(page))
    page.click('[data-act="lock"]'); page.fill("#askv", "prof"); page.click("#dlgbtns .primary"); page.wait_for_timeout(200)
    check("déverrouillage", "verrou:" not in proj(page) and "· déverrouillage ·" in proj(page))
    # consensus
    other = page.evaluate("""() => { const Q=window.__qda.Q; const o=Q.parseProject(Q.serializeProject(window.__qda.S.p));
      for (const d of o.docs) for (const p of d.paras) p.codings = p.codings.filter(c=>c.coder==='exemple').map(c=>({...c, coder:'tom'}));
      const d=o.docs[0]; d.paras[5].codings = d.paras[5].codings.filter(c=>!c.codes.includes('dependance-economique'));
      Q.addCoding(d.paras[7], ['sources-alternatives'], 'tom', 'je croise avec d’autres comptes', 1);
      return Q.serializeProject(o); }""")
    page.evaluate("t => { window.__files['tom.qda.md'] = t; window.__openName = 'tom.qda.md'; }", other)
    page.click('[data-act="compare"]'); page.click('[data-tab="m"]'); page.click("#pickother"); page.wait_for_selector("#domerge")
    page.click("#domerge"); page.wait_for_selector("#ka")
    check("kappa : questions exclues", "questions de l’intervieweur exclues" in page.inner_text("[data-pane=k]"))
    page.click('[data-tab="c"]'); page.wait_for_selector("#ca")
    page.select_option("#ca", "exemple"); page.select_option("#cb", "tom"); page.wait_for_timeout(100)
    page.screenshot(path=SHOTS / "17-consensus.png")
    n_agree = page.evaluate("() => window.__qda.Q.consensusItems(window.__qda.S.p,'exemple','tom').filter(x=>x.agree).length")
    page.click("#takeagree"); page.wait_for_timeout(150)
    s = proj(page)
    check("consensus : accords repris", s.count("@consensus") == n_agree and n_agree >= 5, (s.count("@consensus"), n_agree))
    page.click("[data-pane=c] [data-keep] >> nth=0"); page.wait_for_timeout(150)
    page.click("[data-pane=c] [data-rej] >> nth=0"); page.wait_for_timeout(150)
    s = proj(page)
    check("consensus : garder et écarter", s.count("@consensus") == n_agree + 1 and "# Décisions de consensus" in s and "- écarté :: " in s)
    check("consensus : tout est tranché", "Tout est tranché" in page.inner_text("[data-pane=c]"))
    page.keyboard.press("Escape")
    ctx.close()

    # ===== 0.2.2 : menu « Afficher », effacement des données du navigateur =====
    print("Fonctions 0.2.2")
    ctx = browser.new_context(viewport={"width": 1400, "height": 860}, accept_downloads=True)
    ctx.add_init_script(FS_MOCK)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_selector(".bigbtns")
    page.evaluate("localStorage.setItem('qdaE.coder', JSON.stringify('lea'))"); page.reload(); page.wait_for_selector(".bigbtns")
    page.click("text=Projet d’exemple"); page.wait_for_selector(".para")
    page.click("#docs li >> nth=0"); page.wait_for_timeout(150)
    select_text(page, "#p-0-1", "Le journal télévisé"); page.fill("#popq", "Télévision"); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    opts = page.eval_on_selector_all("#viewsel option", "els => els.map(e => e.value)")
    check("menu Afficher : tous, mes codages, autres codeurs", opts == ["", "__me", "exemple"], opts)
    check("nom du codeur sur toutes les étiquettes dès deux codeurs", page.locator("#p-0-1 .chip .who").count() == 2)
    page.select_option("#viewsel", "exemple"); page.wait_for_timeout(150)
    check("Afficher @exemple : seuls ses codages", page.locator("#p-0-1 .chip").count() == 1 and page.locator("#p-0-1 .chip .who").count() == 0 and "@exemple" in page.inner_text("#viewhint"))
    page.select_option("#viewsel", "__me"); page.wait_for_timeout(150)
    check("Afficher mes codages", page.locator("#p-0-1 .chip").count() == 1 and "Télévision" in page.inner_text("#p-0-1 .chip"))
    page.select_option("#viewsel", ""); page.wait_for_timeout(100)
    # données du navigateur
    page.wait_for_timeout(1800)
    has_work = page.evaluate("() => new Promise(r => { const q = indexedDB.open('qda-md-etude'); q.onsuccess = () => { const t = q.result.transaction('kv').objectStore('kv').get('work'); t.onsuccess = () => { r(!!t.result); q.result.close(); }; }; })")
    check("par défaut, le travail est gardé pour la reprise", has_work)
    page.hover(".drop"); page.click('.dropmenu [data-act="backups"]'); page.wait_for_selector("[name=privmode]")
    page.screenshot(path=SHOTS / "20-donnees-navigateur.png")
    page.check('[name=privmode][value="oui"]'); page.wait_for_timeout(1200)
    gone = page.evaluate("() => new Promise(r => { indexedDB.databases ? indexedDB.databases().then(l => r(!l.some(d => d.name === 'qda-md-etude'))) : r(null); })")
    check("Oui : données du navigateur effacées", gone and page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('qdaE.'))") == ["qdaE.private"])
    page.keyboard.press("Escape")
    select_text(page, "#p-0-3", "ce qu’on leur dit"); page.keyboard.press("Enter"); page.wait_for_timeout(2200)
    gone2 = page.evaluate("() => indexedDB.databases().then(l => !l.some(d => d.name === 'qda-md-etude'))")
    check("mode Oui : aucune copie écrite pendant le travail", gone2 and page.evaluate("() => localStorage.getItem('qdaE.coder')") is None)
    page.evaluate("() => { window.__qda.S.dirty = false; }")
    page.goto("about:blank"); page.goto(URL); page.wait_for_selector(".bigbtns")
    check("mode Oui : rien à reprendre, réglage conservé", page.locator("#resume").count() == 0 and page.is_checked('[name=privmode][value="oui"]') and page.input_value("#coder") == "")
    page.screenshot(path=SHOTS / "21-accueil-prive.png")
    page.check('[name=privmode][value="non"]'); page.wait_for_timeout(200)
    check("retour à Non", page.evaluate("() => localStorage.getItem('qdaE.private')") == "false")
    page.click('[data-act="example"]'); page.wait_for_selector("#dlg[open] #askv"); page.fill("#askv", "zoe"); page.click("#dlgbtns .primary"); page.wait_for_timeout(2500)
    check("mode Non : le travail est de nouveau gardé", page.evaluate("() => new Promise(r => { const q = indexedDB.open('qda-md-etude'); q.onsuccess = () => { const t = q.result.transaction('kv').objectStore('kv').get('work'); t.onsuccess = () => { r(!!t.result); q.result.close(); }; }; })"))
    ctx.close()
    # ===== 2. navigateur sans enregistrement automatique (Firefox, Safari) =====
    print("Sans enregistrement automatique (comme Firefox/Safari)")
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
    ctx.add_init_script("delete window.showOpenFilePicker; delete window.showSaveFilePicker; window.showOpenFilePicker=undefined;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_selector(".bigbtns")
    check("accueil : avertissement d’enregistrement manuel", "pas automatique" in page.inner_text("#home"))
    page.click('.bigbtns [data-act="new"]')
    page.fill("#askv", "Mémoire Zoé"); page.click("#dlgbtns .primary")
    page.wait_for_selector("#dlg[open] #askv"); page.fill("#askv", "zoe"); page.click("#dlgbtns .primary")
    page.wait_for_selector("#impbtn")
    page.click('[data-tab="c"]'); page.fill("#pname", "Entretien A"); page.fill("#ptext", "Premier paragraphe à coder.\n\nDeuxième paragraphe.")
    page.click("#dlgbtns .primary"); page.wait_for_selector(".para")
    select_text(page, "#p-0-0", "paragraphe à coder"); page.fill("#popq", "Test"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("statut « Non enregistré »", "Non enregistré" in page.inner_text("#status"))
    with page.expect_download() as dl:
        page.keyboard.press("Control+s")
    saved = Path(dl.value.path()).read_text(encoding="utf-8")
    check("Ctrl+S télécharge le projet", dl.value.suggested_filename == "Mémoire Zoé.qda.md" and "#test @zoe" in saved, dl.value.suggested_filename)
    check("statut « Téléchargé »", "Téléchargé" in page.inner_text("#status"))
    # reprise après fermeture accidentelle
    select_text(page, "#p-0-1", "Deuxième"); page.keyboard.press("Enter"); page.wait_for_timeout(2000)
    page.evaluate("() => { window.onbeforeunload = null; }")
    page.goto("about:blank"); page.goto(URL); page.wait_for_selector(".bigbtns")
    check("travail non enregistré retrouvé", page.locator("#resume").count() == 1)
    page.click("#resume"); page.wait_for_selector(".para")
    check("travail repris", "« Deuxième »" in proj(page))
    # sauvegardes
    page.hover(".drop"); page.click('.dropmenu [data-act="backups"]'); page.wait_for_selector("#dlg[open]")
    check("liste des sauvegardes", page.locator("[data-bopen]").count() >= 1)
    page.keyboard.press("Escape")
    # ouvrir un fichier projet
    p2 = TMP / "rendu.qda.md"; p2.write_text(saved, encoding="utf-8")
    page.evaluate("() => { window.__qda.S.dirty = false; }")
    with page.expect_file_chooser() as fc:
        page.click('#menu [data-act="open"]')
    fc.value.set_files(str(p2)); page.wait_for_timeout(300)
    check("ouvrir un .qda.md", page.inner_text("#title") == "Mémoire Zoé" and "« Deuxième »" not in proj(page))
    page.screenshot(path=SHOTS / "11-sans-fs.png")
    # vue enseignant
    page.evaluate("() => { window.__qda.S.dirty = false; }")
    base = page.evaluate("""() => { const Q=window.__qda.Q; const p=Q.newProject('TP');
      Q.addCode(p,'A'); Q.addCode(p,'B'); const d=Q.addDoc(p,Q.textToDoc('E1','E : Question ?\\n\\nR : Un.\\n\\nR : Deux.\\n\\nR : Trois.'));
      Q.applySpeakers(d,Q.detectSpeakers(d)); return Q.serializeProject(p); }""")
    def variant(coder, codes, extra=False):
        return page.evaluate("""([t, coder, codes, extra]) => { const Q=window.__qda.Q; const p=Q.parseProject(t);
          const d=p.docs[0]; codes.forEach((c,i)=>{ if(c) Q.addCoding(d.paras[i+1],[c],coder,null,1); });
          if (extra) Q.addCode(p,'Perso'); return Q.serializeProject(p); }""", [base, coder, codes, extra])
    (TMP / "ref.qda.md").write_text(variant("prof", ["a", "b", "a"]), encoding="utf-8")
    (TMP / "lea.qda.md").write_text(variant("lea", ["a", "b", "a"]), encoding="utf-8")
    (TMP / "max.qda.md").write_text(variant("max", ["a", "a", None], True), encoding="utf-8")
    page.hover(".drop"); page.click('.dropmenu [data-act="teacher"]'); page.wait_for_selector("#tpick")
    with page.expect_file_chooser() as fc:
        page.click("#tpick")
    fc.value.set_files([str(TMP / "lea.qda.md"), str(TMP / "max.qda.md")])
    page.wait_for_selector("#topen")
    with page.expect_file_chooser() as fc:
        page.click("#tref")
    fc.value.set_files(str(TMP / "ref.qda.md")); page.wait_for_timeout(300)
    page.screenshot(path=SHOTS / "18-enseignant.png")
    txt = page.inner_text("#dlgbody")
    check("vue enseignant : synthèse et kappa avec la référence", "lea.qda.md" in txt and "max.qda.md" in txt and "1,00" in txt and "Perso" in txt, txt[:600])
    page.click("#topen"); page.wait_for_timeout(300)
    check("vue enseignant : synthèse ouverte", page.evaluate("() => window.__qda.Q.coders(window.__qda.S.p)") == ["lea", "max", "prof"])

    ctx.close()

    # ===== 0.4 : format qda.md =====
    print("Format qda.md 1 (0.4)")
    import zipfile, io
    FX = ROOT / "tests" / "fixtures"
    ex_text = (FX / "exemple-projet.qda.md").read_text(encoding="utf-8")
    ctx = browser.new_context(viewport={"width": 1400, "height": 860}, accept_downloads=True)
    ctx.add_init_script(FS_MOCK)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_selector(".bigbtns")
    page.evaluate("localStorage.setItem('qdaE.coder', JSON.stringify('lea'))"); page.reload(); page.wait_for_selector(".bigbtns")
    page.evaluate("([t]) => window.__qda.openText(t, 'exemple-projet.qda.md')", [ex_text]); page.wait_for_selector(".para")
    check("qda.md 1 : ouvert sans conversion, réécrit à l’identique", proj(page) == ex_text and not page.evaluate("() => window.__qda.S.dirty"))
    check("qda.md 1 : codes des documents dans la liste", page.inner_text("#docs li >> nth=0").startswith("E01"))
    check("qda.md 1 : mémo de paragraphe affiché", "Désaccord sur #fatigue-info" in page.inner_text("#p-0-3 .pmemo"))
    page.screenshot(path=SHOTS / "20-qda1.png")

    # origine des codes (0.4.2)
    page.click('#tree .trow[data-code="verification"]'); page.click('#tree .trow[data-code="verification"] [data-t="ori"]'); page.wait_for_selector("#oritheo")
    page.check('input[name=ori][value=deductif]'); page.fill("#oritheo", "Wardle"); page.click("#dlgbtns button.primary"); page.wait_for_timeout(200)
    s = proj(page)
    check("origine : code déductif écrit sous le code, pastille D, journal", "- Stratégies de vérification #verification\n  origine:: deductif\n  theorie:: Wardle\n  >" in s
          and page.inner_text('#tree .trow[data-code="verification"] .ori') == "D" and "· origine · « Stratégies de vérification » (#verification) : déductif · théorie : Wardle" in s, s[:900])
    page.screenshot(path=SHOTS / "22-origine.png")
    page.keyboard.press("Control+z"); page.wait_for_timeout(200)
    check("origine : annulable", "origine:: deductif" not in proj(page))
    # export en dossier
    page.hover(".drop")
    with page.expect_download() as dl:
        page.click('.dropmenu [data-act="exp-folder"]')
    zpath = TMP / dl.value.suggested_filename; dl.value.save_as(zpath)
    z = zipfile.ZipFile(zpath)
    names = sorted(z.namelist())
    ref = sorted("exemple-projet/" + str(f.relative_to(FX / "exemple-projet")).replace("\\", "/") for f in (FX / "exemple-projet").rglob("*.md"))
    same = names == ref and all(z.read(n).decode("utf-8") == (FX / n).read_text(encoding="utf-8") for n in names)
    check("export en dossier : .zip identique au dossier d’exemple", dl.value.suggested_filename == "exemple-projet.zip" and same, names)
    # ancien format : conversion à l’ouverture
    old = "---\nqda-md-etude: 2\ntitre: Vieux\nid: v1\n---\n\n# Arbre de codes\n\n- A #a\n\n# Documents\n\n## Doc\n\n### §1 · Zoé\n\nBonjour le monde\n\n> [!codage]-\n> - #a @moi : « le monde »\n\n# Décisions de consensus\n\n- écarté :: Doc :: §1 :: #a\n"
    page.evaluate("() => { window.__qda.S.dirty = false; }")
    page.evaluate("([t]) => { window.__qda.openText(t, 'vieux.qda.md'); }", [old]); page.wait_for_selector("#dlg[open]")
    check("ancien format : conversion proposée", "format qda.md" in page.inner_text("#dlgbody"))
    page.click("#dlgbtns button.primary"); page.wait_for_timeout(300)
    s = proj(page)
    check("ancien format : converti (codes, identifiants, consensus)", "qda-format: 1" in s and "### D01-001\nlocuteur:: Zoé" in s and "- écarté :: D01 :: D01-001 :: #a" in s and page.evaluate("() => window.__qda.S.dirty"), s)
    # code du document modifié dans la fiche
    page.click("#fichebtn"); page.wait_for_selector("#m_code")
    page.fill("#m_code", "E07"); page.click("#dlgbtns button.primary"); page.wait_for_timeout(200)
    s = proj(page)
    check("fiche : code du document modifié, identifiants et consensus suivent", "document:: E07" in s and "### E07-001" in s and "- écarté :: E07 :: E07-001 :: #a" in s, s)
    # import d’un projet QDA-md (zip) dans le projet ouvert
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w") as zz:
        zz.writestr("recherche/arbre.md", "---\ntype: arbre-de-codes\n---\n\n- Politique #politique\n  > Note de recherche.\n")
        zz.writestr("recherche/donnees/corpus_confiance.md", "---\ncorpus: corpus_confiance\n---\n\n## ID_1373\nvariables:: *a\n\nA la botte des politiques.\n\n> [!codage]-\n> - #politique @OA : (réponse entière)\n")
    (TMP / "recherche.zip").write_bytes(zbuf.getvalue())
    page.click("#left button.add"); page.wait_for_selector("#impbtn")
    page.click('[data-tab="q"]')
    with page.expect_file_chooser() as fc:
        page.click("#qzip")
    fc.value.set_files(str(TMP / "recherche.zip")); page.wait_for_selector("#qinfo .notice")
    info = page.inner_text("#qinfo")
    check("import QDA-md : aperçu", "1 document(s)" in info and "Ancien format QDA-md" in info, info)
    page.screenshot(path=SHOTS / "21-import-qdamd.png")
    page.click("#dlgbtns button.primary"); page.wait_for_timeout(300)
    s = proj(page)
    check("import QDA-md : document, code et codage ajoutés", "document:: corpus_confiance" in s and "### ID_1373" in s and "> - #politique @OA : (réponse entière)" in s and "## Politique #politique\n\nNote de recherche." in s and "· import · projet" in s, s[-900:])
    # import d’un dossier (sélection de dossier)
    page.click("#left button.add"); page.wait_for_selector("#impbtn"); page.click('[data-tab="q"]')
    try:
        with page.expect_file_chooser() as fc:
            page.click("#qdir")
        fc.value.set_files(str(FX / "exemple-projet"))
        page.wait_for_selector("#qinfo .notice", timeout=3000)
        info = page.inner_text("#qinfo")
        check("import d’un dossier : 4 documents lus", "4 document(s)" in info, info)
    except Exception as e:
        print("  (sélection de dossier non testable ici :", str(e).splitlines()[0], ")")
    page.keyboard.press("Escape")
    ctx.close()

    browser.close()

print(f"\n{ok} réussi(s), {ko} échec(s)")
if errors: print("Erreurs JS :", *errors, sep="\n  ")
sys.exit(1 if ko or errors else 0)
