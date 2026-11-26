import os
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE = Path(__file__).resolve().parent
APP = max((HERE.parent / "dist").glob("adoq-QDA-*.html"), key=lambda f: f.stat().st_mtime).as_uri()
OUT = HERE / "docs" / "img"
FS_MOCK = """window.__files={};const mk=(n)=>({kind:'file',name:n,queryPermission:async()=>'granted',requestPermission:async()=>'granted',createWritable:async()=>{let b='';return{write:async t=>{b+=t},close:async()=>{window.__files[n]=b}}},getFile:async()=>new File([window.__files[n]||''],n)});window.showSaveFilePicker=async o=>mk(o&&o.suggestedName||'x');window.showOpenFilePicker=async()=>[mk(window.__openName)];"""
def sel(pg, para, text):
    pg.evaluate("""([s,t])=>{const box=document.querySelector(s+' .ptext');const full=box.textContent;const pos=full.indexOf(t);
      const w=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);let n,acc=0,a=null,b=null;
      while((n=w.nextNode())){const L=n.data.length;if(!a&&pos<acc+L)a=[n,pos-acc];if(!b&&pos+t.length<=acc+L){b=[n,pos+t.length-acc];break;}acc+=L;}
      const r=document.createRange();r.setStart(...a);r.setEnd(...b);getSelection().removeAllRanges();getSelection().addRange(r);
      box.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));}""",[para,text]); pg.wait_for_selector("#pop:not([hidden])")
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    ctx = b.new_context(viewport={"width":1280,"height":780}, device_scale_factor=1.5)
    ctx.add_init_script(FS_MOCK)
    pg = ctx.new_page()
    pg.goto(APP); pg.wait_for_selector(".bigbtns")
    pg.evaluate("localStorage.setItem('qdaE.coder', JSON.stringify('lea'))"); pg.reload(); pg.wait_for_selector(".bigbtns")
    pg.screenshot(path=OUT/"accueil.png")
    pg.click("text=Projet d’exemple"); pg.wait_for_selector(".para"); pg.wait_for_timeout(2700)
    pg.click("#docs li >> nth=0"); pg.wait_for_timeout(200)
    pg.click('.trow[data-code="mefiance-envers-les-medias"] .lab'); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT/"espace-de-travail.png")
    pg.click("#docs li >> nth=1"); pg.wait_for_timeout(150)
    sel(pg, "#p-1-3", "Ce sont des professionnels, ils ont des règles.")
    pg.fill("#popq", "Conf"); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT/"fenetre-de-codage.png")
    pg.fill("#popq", "Confiance dans les médias"); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    sel(pg, "#p-1-3", "Dans l’ensemble, oui"); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    sel(pg, "#p-1-5", "Il y a sans doute des liens"); pg.fill("#popq", "politique"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT/"paragraphes-codes.png", clip={"x":250,"y":40,"width":780,"height":560})
    pg.click("#docs li >> nth=2"); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT/"focus-group.png")
    pg.click("#spkbtn"); pg.wait_for_selector("#spksave"); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT/"locuteurs.png"); pg.keyboard.press("Escape")
    pg.click("#fichebtn"); pg.wait_for_selector("#m_lieu"); pg.screenshot(path=OUT/"fiche.png"); pg.keyboard.press("Escape")
    # import
    pg.click("#left button.add"); pg.wait_for_selector("#impbtn"); pg.click('[data-tab="c"]'); pg.fill("#pname","Entretien 3 — Paul")
    pg.fill("#ptext","Zoé : Bonjour, vous lisez la presse ?\n\nOui, Le Soir, tous les matins.\n\nC’est une habitude familiale.\n\nZoé : Et les réseaux sociaux ?\n\nTrès peu.")
    pg.click("#padd"); pg.wait_for_selector("[data-resp]"); pg.fill("[data-resp]","Paul")
    pg.fill('[data-attr="__resp"][data-ak="âge"]',"67"); pg.fill('[data-attr="__resp"][data-ak="genre"]',"H"); pg.fill('[data-attr="__resp"][data-ak="profession"]',"retraité")
    pg.evaluate("document.querySelector('#dlgbody').scrollTop = 280"); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT/"import.png"); pg.click("#dlgbtns .primary"); pg.wait_for_timeout(300)
    # arbre + extraits + mémo + journal
    pg.click('.trow[data-code="mefiance-envers-les-medias"] .lab'); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT/"arbre.png", clip={"x":1020,"y":40,"width":260,"height":330})
    pg.dblclick('.trow[data-code="mefiance-envers-les-medias"] .lab'); pg.wait_for_selector("#dlg[open] .ex"); pg.check("#exch"); pg.wait_for_timeout(150)
    pg.screenshot(path=OUT/"extraits.png"); pg.keyboard.press("Escape")
    pg.click('[data-act="journal"]'); pg.wait_for_selector("#dlg[open] .jline"); pg.screenshot(path=OUT/"journal.png"); pg.keyboard.press("Escape")
    # comparaison
    other = pg.evaluate("""()=>{const Q=window.__qda.Q;const o=Q.parseProject(Q.serializeProject(window.__qda.S.p));
      for(const d of o.docs)for(const p of d.paras)p.codings=p.codings.filter(c=>c.coder==='exemple').map(c=>({...c,coder:'tom'}));
      const d=o.docs[0];d.paras[5].codings=d.paras[5].codings.filter(c=>!c.codes.includes('dependance-economique'));
      Q.addCoding(d.paras[7],['sources-alternatives'],'tom','je croise avec d’autres comptes',1);return Q.serializeProject(o);}""")
    pg.evaluate("t=>{window.__files['tom.qda.md']=t;window.__openName='tom.qda.md';}", other)
    pg.click('[data-act="compare"]'); pg.click('[data-tab="m"]'); pg.click("#pickother"); pg.wait_for_selector("#domerge")
    pg.screenshot(path=OUT/"fusion.png"); pg.click("#domerge"); pg.wait_for_selector("#ka")
    pg.select_option("#ka","exemple"); pg.select_option("#kb","tom"); pg.wait_for_timeout(100)
    pg.click("[data-pane=k] tr.click >> nth=0"); pg.wait_for_timeout(150)
    pg.screenshot(path=OUT/"kappa.png")
    pg.click('[data-tab="c"]'); pg.wait_for_selector("#ca"); pg.select_option("#ca","exemple"); pg.select_option("#cb","tom"); pg.wait_for_timeout(150)
    pg.screenshot(path=OUT/"consensus.png"); pg.keyboard.press("Escape")
    # verrou
    pg.click('[data-act="lock"]'); pg.wait_for_selector("#lockcode"); pg.screenshot(path=OUT/"verrou.png"); pg.keyboard.press("Escape")
    pg.hover('.drop'); pg.click('.dropmenu [data-act="backups"]'); pg.wait_for_selector("[name=privmode]"); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT/"donnees-navigateur.png"); pg.keyboard.press("Escape")
    pg.select_option("#viewsel", "tom"); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT/"afficher-codeur.png", clip={"x":980,"y":650,"width":300,"height":130}); pg.select_option("#viewsel", "")
    ctx.close()
    # vue enseignant (sans API fichiers)
    ctx = b.new_context(viewport={"width":1280,"height":780}, device_scale_factor=1.5)
    ctx.add_init_script("window.showOpenFilePicker=undefined;window.showSaveFilePicker=undefined;")
    pg = ctx.new_page(); pg.goto(APP); pg.wait_for_selector(".bigbtns")
    pg.evaluate("localStorage.setItem('qdaE.coder', JSON.stringify('lea'))"); pg.reload(); pg.wait_for_selector(".bigbtns")
    import tempfile; tmp = Path(tempfile.mkdtemp())
    pg.click("text=Projet d’exemple"); pg.wait_for_selector(".para")
    base = pg.evaluate("()=>window.__qda.Q.serializeProject(window.__qda.S.p)")
    def variant(coder, drop):
        return pg.evaluate("""([t,coder,drop])=>{const Q=window.__qda.Q;const p=Q.parseProject(t);let k=0;
          for(const d of p.docs)for(const pa of d.paras){pa.codings=pa.codings.filter(c=>c.coder==='exemple').filter(()=> (k++ % drop)!==1).map(c=>({...c,coder}));}
          if(coder==='max') Q.addCode(p,'Habitudes familiales'); return Q.serializeProject(p);}""",[base,coder,drop])
    (tmp/"reference-prof.qda.md").write_text(variant("prof", 1000), encoding="utf-8")
    for name, d in [("lea",3),("max",2),("ines",1000)]: (tmp/f"{name}.qda.md").write_text(variant(name,d), encoding="utf-8")
    pg.hover('.drop'); pg.click('.dropmenu [data-act="teacher"]')
    pg.wait_for_selector("#tpick")
    with pg.expect_file_chooser() as fc: pg.click("#tpick")
    fc.value.set_files([str(tmp/f"{n}.qda.md") for n in ["lea","max","ines"]]); pg.wait_for_selector("#topen")
    with pg.expect_file_chooser() as fc: pg.click("#tref")
    fc.value.set_files(str(tmp/"reference-prof.qda.md")); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT/"vue-enseignant.png")
    b.close()
print(sorted(p.name for p in OUT.iterdir()))
