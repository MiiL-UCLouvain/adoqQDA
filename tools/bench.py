import os
from pathlib import Path
from playwright.sync_api import sync_playwright
APP = max((Path(__file__).resolve().parent.parent / "dist").glob("adoq-QDA-*.html"), key=lambda f: f.stat().st_mtime).as_uri()
GEN = """([ndocs, nparas]) => { const Q=window.__qda.Q; const p=Q.newProject('Bench'); for (let i=0;i<20;i++) Q.addCode(p,'Code '+i);
  const phrase='Alors oui, je crois que les médias, enfin les journaux surtout, ne disent pas toujours tout ce qu’ils savent, et ça me pose question. ';
  for (let d=0; d<ndocs; d++) { const lines=[]; for (let i=0;i<nparas;i++) lines.push((i%2? '' : 'Zoé : ') + 'R'+i+' '+phrase.repeat(i%2?3:1));
    const doc=Q.addDoc(p,Q.textToDoc('E'+d, lines.join('\\n\\n'))); Q.applySpeakers(doc,Q.detectSpeakers(doc),{mode:'respondent',respondent:{name:'P'+d}});
    doc.paras.forEach((pa,i)=>{ if(i%3===1) Q.addCoding(pa,['code-'+(i%20)],'zoe','les médias',1); if(i%7===1) Q.addCoding(pa,['code-'+((i+5)%20)],'tom',null,1); }); }
  return Q.serializeProject(p); }"""
def run(pg, ndocs, nparas):
    text = pg.evaluate(GEN, [ndocs, nparas])
    r = pg.evaluate("""(t) => { const {Q,S,mutate,openText}=window.__qda; const T={};
      let t0=performance.now(); const p=Q.parseProject(t); T.lecture=performance.now()-t0;
      t0=performance.now(); window.__qda.setProject(p,{fileName:'b.qda.md'}); T.ouverture=performance.now()-t0;
      return T; }""", text)
    pg.wait_for_timeout(300)
    r2 = pg.evaluate("""() => { const {Q,S,mutate}=window.__qda; const T={};
      let t0=performance.now(); S.cur=Math.floor(S.p.docs.length/2); document.querySelector('#docs li[data-doc="'+S.cur+'"]').click(); T.changer_doc=performance.now()-t0;
      const pa=S.p.docs[S.cur].paras[3];
      t0=performance.now(); mutate(()=>Q.addCoding(pa,['code-3'],'zoe','journaux',1),{di:S.cur,pi:3}); T.coder=performance.now()-t0;
      t0=performance.now(); for(let i=0;i<10;i++) mutate(()=>Q.addCoding(pa,['code-4'],'zoe','surtout',1),{di:S.cur,pi:3}); T.coder_x10=performance.now()-t0;
      t0=performance.now(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true})); T.annuler=performance.now()-t0;
      t0=performance.now(); const s=Q.serializeProject(S.p); T.ecriture=performance.now()-t0; T.Mo=s.length/1e6;
      t0=performance.now(); Q.agreement(S.p,'zoe','tom'); T.kappa=performance.now()-t0;
      t0=performance.now(); Q.extracts(S.p,'code-1'); T.extraits=performance.now()-t0;
      T.memoire_Mo = performance.memory ? performance.memory.usedJSHeapSize/1e6 : null;
      return T; }""")
    r.update(r2); return r
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--enable-precise-memory-info"])
    print(f"{'corpus':34} {'Mo':>5} {'lecture':>8} {'ouvrir':>7} {'chg doc':>8} {'coder':>6} {'annul.':>7} {'écrit.':>7} {'kappa':>6} {'mém.Mo':>7}")
    for ndocs, nparas, label in [(30,280,'30 entretiens × 35 p.'),(100,280,'100 entretiens × 35 p.'),(300,280,'300 entretiens × 35 p.'),(600,280,'600 entretiens × 35 p.'),
                                  (1,2800,'1 document de 350 p.'),(1,8000,'1 document de 1 000 p.'),(1,24000,'1 document de 3 000 p.')]:
        ctx = b.new_context(viewport={"width":1400,"height":900}); pg = ctx.new_page()
        pg.goto(APP); pg.wait_for_selector(".bigbtns")
        pg.evaluate("localStorage.setItem('qdaE.coder', JSON.stringify('zoe'))")
        try:
            r = run(pg, ndocs, nparas)
            print(f"{label:34} {r['Mo']:5.1f} {r['lecture']:7.0f}ms {r['ouverture']:6.0f}ms {r['changer_doc']:7.0f}ms {r['coder']:5.0f}ms {r['annuler']:6.0f}ms {r['ecriture']:6.0f}ms {r['kappa']:5.0f}ms {r['memoire_Mo'] or 0:7.0f}")
        except Exception as e:
            print(label, "ÉCHEC", str(e)[:120])
        ctx.close()
    b.close()
