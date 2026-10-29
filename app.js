/* 配筋検査アプリ：プログラム本体（index.html から読み込む。CSP のため画面に直接書かない） */
"use strict";
const APP_VERSION="2026.10.29-3";   /* アプリの版（変更して反映するたびに上げる。帳票タブの一番下に表示） */
/* ===== データ（データファイル .json から読み込む。build.py が project_*.py から作る） ===== */
let DATA=null, PROJECT={id:"",name:"",short:""};
let SLAB={}, BEAM={}, COL={}, WALL={}, REFS=[], LIST_PAGES={}, SECT={}, GRID={}, INSPECTIONS=[], FIGS={};
/* ===== 読み込んだファイルの検査・整形 =====
   データファイルやバックアップは他の人から受け取ることもあるので、画面に出す前に型と形を確かめる。
   ID は英数字のみ、数値は数値のみ、画像は data:image の Base64 のみを通す */
const safeId=s=>String(s??"").replace(/[^A-Za-z0-9_\-]/g,"").slice(0,80);
const safeStr=(s,max=2000)=>typeof s==="string"? s.slice(0,max) : (s==null? "" : String(s).slice(0,max));
const safeNum=(x,def=0)=>{ const n=+x; return Number.isFinite(n)? n : def; };
const safeImg=u=>typeof u==="string" && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=\s]+$/.test(u)? u : "";
const safeDate=s=>typeof s==="string" && /^\d{4}-\d{2}-\d{2}$/.test(s)? s : "";
const RES_VALUES=["ok","ng","na"];
function safeStrMap(o, depth=0){   /* 設計値マスタなど：文字列・数値・配列・入れ子のオブジェクトだけを残す */
  if(depth>8 || o==null) return null;   /* 入れ子は8段まで（小梁の端部・中央の配筋は5段目にある） */
  if(typeof o==="string") return o.slice(0,500);
  if(typeof o==="number") return Number.isFinite(o)? o : null;
  if(Array.isArray(o)) return o.slice(0,200).map(v=>safeStrMap(v,depth+1));
  if(typeof o==="object"){ const r={}; for(const [k,v] of Object.entries(o).slice(0,2000)) r[safeStr(k,80)]=safeStrMap(v,depth+1); return r; }
  return null;
}
function sanitizeDataset(ds){
  const num4=a=>Array.isArray(a)&&a.length===4? a.map(v=>safeNum(v)) : null;
  const grid={}; for(const [id,g] of Object.entries(ds.grid||{})){ const ax=o=>{ const r={}; for(const [k,v] of Object.entries(o||{})) r[safeNum(k)]=safeNum(v); return r; };
    grid[safeId(id)]={W:safeNum(g.W,1), H:safeNum(g.H,1), X:ax(g.X), Y:ax(g.Y)}; }
  const listPages={}; for(const [n,p] of Object.entries(ds.listPages||{})){ const img=safeImg(p&&p.img); if(img) listPages[safeNum(n)]={title:safeStr(p.title,120), w:safeNum(p.w,1), h:safeNum(p.h,1), img}; }
  const sect={}; for(const [t,o] of Object.entries(ds.sect||{})){ if(!TYPES.includes(t)) continue; sect[t]={}; for(const [s,r] of Object.entries(o||{})){ if(Array.isArray(r)&&r.length===5) sect[t][safeStr(s,40)]=r.map(v=>safeNum(v)); } }
  const plans={}; for(const [k,v] of Object.entries(ds.plans||{})) plans[safeStr(k,200)]=safeImg(v);
  const inspections=(Array.isArray(ds.inspections)?ds.inspections:[]).map(i=>({
    id:safeId(i.id), title:safeStr(i.title,120), place:safeStr(i.place,200), plan:safeStr(i.plan,200),
    refs:i.refs? safeStr(i.refs,40) : null, mst:i.mst? safeStr(i.mst,40) : null, colJoint:!!i.colJoint,
    members:(Array.isArray(i.members)?i.members:[]).filter(m=>m&&TYPES.includes(m.t)).map(m=>{
      const o={t:m.t, sym:safeStr(m.sym,40), a:safeStr(m.a,40), b:safeStr(m.b,40), loc:safeStr(m.loc,120)};
      if(m.box) o.box=num4(m.box); if(m.dir==="v") o.dir="v"; if(m.off!=null) o.off=safeNum(m.off); return o; })
  })).filter(i=>i.id && i.members.length);
  const refs={}; for(const [k,list] of Object.entries(ds.refs||{})) refs[safeStr(k,40)]=(Array.isArray(list)?list:[]).map(r=>({h:safeStr(r&&r.h,200), li:(Array.isArray(r&&r.li)?r.li:[]).map(x=>safeStr(x,500))}));
  /* 参考図：items「種別|符号」（または種別）→ [[見出し, ページ, x0, y0, x1, y1], …]。旧形式（種別 → [ページ, x0, y0, x1, y1]）も読む */
  const figs={}; for(const [name,f] of Object.entries(ds.figs||{})){ if(!f||typeof f!=="object") continue; const o={title:safeStr(f.title,120), items:{}};
    const src=f.items&&typeof f.items==="object" ? f.items : Object.fromEntries(TYPES.filter(t=>Array.isArray(f[t])).map(t=>[t,[["要領"].concat(f[t])]]));
    for(const [k,list] of Object.entries(src).slice(0,2000)){ if(!Array.isArray(list)) continue;
      const v=list.slice(0,12).filter(x=>Array.isArray(x)&&x.length===6).map(x=>[safeStr(x[0],80)].concat(x.slice(1).map(n=>safeNum(n))));
      if(v.length) o.items[safeStr(k,80)]=v; }
    figs[safeStr(name,40)]=o; }
  return {figs, format:ds.format, version:safeNum(ds.version,1), built:safeDate(ds.built),
    project:{id:safeId(ds.project&&ds.project.id)||"project", name:safeStr(ds.project&&ds.project.name,200), short:safeStr(ds.project&&ds.project.short,40)},
    masters:safeStrMap(ds.masters||{})||{}, mstSets:safeStrMap(ds.mstSets||{})||{}, refs, grid, inspections, plans, listPages, sect};
}
function applyData(raw){
  const ds=sanitizeDataset(raw);
  if(!ds.inspections.length) throw new Error("検査箇所がありません");
  DATA=ds; PROJECT=ds.project; DWG=null;
  ({slab:SLAB={}, beam:BEAM={}, col:COL={}, wall:WALL={}}=ds.masters);
  REFS=ds.refs.default||[]; LIST_PAGES=ds.listPages; SECT=ds.sect; GRID=ds.grid; FIGS=ds.figs||{};
  INSPECTIONS=ds.inspections.map(i=>Object.assign({},i,{
    plan:ds.plans[i.plan]||"", refs:i.refs?ds.refs[i.refs]||null:null, mst:i.mst?ds.mstSets[i.mst]||null:null,
    members:i.members.map(m=>Object.assign({uid:m.t+"|"+m.sym+"|"+m.loc},m))}));
  document.title="配筋検査 "+PROJECT.short;
}

/* ===== 確認項目（現行帳票の行構成） ===== */
const SPEC = {
  slab:{label:"耐圧盤", groups:[
    {g:"厚さ", items:["厚さ"], dv:m=>m.t},
    {g:"主筋・配力筋", items:["方向","径","ピッチ","2段筋レベル","継手","定着"]},
    {g:"補強筋", items:["補強筋"]},
    {g:"共通", items:["鉄筋のあき","かぶり厚さ"]}],
    design:m=>[["版厚",m.t],["上端 主筋",m.tm],["上端 配力",m.td],["下端 主筋",m.bm],["下端 配力",m.bd]]},
  beam:{label:"地中梁", groups:[
    {g:"断面サイズ", items:["幅","高さ"], dv:m=>m.bd},
    {g:"主筋", items:["径","本数","2段筋レベル","継手","定着","カットオフ"], dv:m=>"上 "+m.top+" / 下 "+m.bot},
    {g:"スタラップ", items:["径","本数","ピッチ"], dv:m=>m.stp},
    {g:"梁貫通", items:["型・径","本数","孔際補強"]},
    {g:"共通", items:["鉄筋のあき","かぶり厚さ"]}],
    design:m=>[["B×D",m.bd],["上端筋",m.top],["下端筋",m.bot],["STP",m.stp],["腹筋","18-D13"],["貫通補強",m.sl],["補強要領",{fig:"梁貫通", text:"梁貫通補強要領"}]]},
  col:{label:"柱", groups:[
    {g:"断面サイズ", items:["X方向","Y方向"], dv:m=>m.s},
    {g:"主筋", items:["径","本数","芯鉄筋・寄せ筋","継手","定着"], dv:m=>m.m+(m.c?" / 芯 "+m.c:"")},
    {g:"フープ", items:["径","本数","ピッチ"], dv:m=>m.h},
    {g:"共通", items:["鉄筋のあき","かぶり厚さ"]}],
    design:m=>[["Dx×Dy",m.s],["主筋",m.m],["芯鉄筋",m.c||"—"],["フープ",m.h],["仕口フープ（上層）",m.ju||"—"],["仕口フープ（下層）",m.j||"—"]]},   /* ju：上層（柱頭）の仕口、j：下層（柱脚）の仕口 */
  wall:{label:"壁", groups:[
    {g:"壁厚", items:["壁厚"], dv:m=>m.t},
    {g:"縦筋", items:["径","ピッチ","継手","定着"], dv:m=>m.v},
    {g:"横筋", items:["径","ピッチ","継手","定着"], dv:m=>m.h},
    {g:"開口補強", items:["縦","横","斜め"], dv:m=>m.o},
    {g:"共通", items:["幅止筋","鉄筋のあき","かぶり厚さ"], dv:()=>"幅止筋 D10@1,000"}],
    design:m=>[["壁厚",m.t],["縦筋",m.v],["横筋",m.h],["開口補強",m.o],["幅止筋","D10@1,000"]]},
  sbeam:{label:"小梁", groups:[
    {g:"断面サイズ", items:["幅","成"], dv:m=>m.bd},
    {g:"主筋", items:["径","本数","継手","定着"]},
    {g:"あばら筋", items:["径","ピッチ"], dv:m=>m.stp},
    {g:"腹筋・幅止筋", items:["腹筋","幅止筋"], dv:m=>m.web||"—"},
    {g:"共通", items:["鉄筋のあき","かぶり厚さ"]}],
    design:m=>[["B×D",m.bd],...(m.pos||[]).map(p=>[p[0],"上 "+p[1]+" / 下 "+p[2]]),["STP",m.stp],["腹筋",m.web||"—"],["梁貫通",{fig:"梁貫通", text:"梁貫通補強要領"}]]},
  floor:{label:"床", groups:[
    {g:"厚さ・レベル", items:["厚さ","天端レベル"], dv:m=>"t = "+m.t},
    {g:"主筋・配力筋", items:["方向","径","ピッチ","継手","定着"], dv:m=>m.r},
    {g:"補強筋", items:["開口補強","出隅・入隅補強"]},
    {g:"共通", items:["鉄筋のあき","かぶり厚さ"]}],
    design:m=>[["版厚",m.t],["上端筋",m.top],["下端筋",m.bot],["天端",m.lv||"伏図の凡例による"]]}
};
SPEC.girder = Object.assign({}, SPEC.beam, {label:"大梁",
  design:m=>[["B×D",m.bd],["上端筋",m.top],["下端筋",m.bot],["STP",m.stp],["腹筋",m.web],["貫通補強",{fig:"梁貫通", text:"梁貫通補強要領による"}]]});
const TYPES = ["slab","beam","girder","sbeam","floor","col","wall"];
const typesHere = () => TYPES.filter(t=>insp().members.some(m=>m.t===t));
function master(mem){
  const own = insp().mst && insp().mst[mem.t];
  if(own) return own[mem.sym]||{};
  if(mem.t==="slab") return SLAB[mem.sym]||{};
  if(mem.t==="beam") return Object.assign({sl:"—"},BEAM[mem.sym]||{});
  if(mem.t==="wall") return WALL[mem.sym]||{};
  return COL[mem.sym]||{};
}
const itemKeys = t => SPEC[t].groups.flatMap(g=>g.items.map(i=>g.g+"/"+i));

const LINE_TYPES = ["beam","girder","wall"];
/* 部材の図面上の範囲（% 指定）。柱＝交点、梁＝通り上のスパン中央、耐圧盤＝区画中央 */
function hotspot(gridId, m){
  const g=GRID[gridId]; if(!g) return null;
  const rng=s=>{const r=/^([XY])(\d+)(?:-(\d+))?$/.exec(s.trim()); if(!r) return null; const ax=g[r[1]], a=ax[r[2]], b=r[3]?ax[r[3]]:a; return a==null||b==null?null:{ax:r[1],a:Math.min(a,b),b:Math.max(a,b)};};
  let box;
  if(m.box) box=m.box;
  else if(m.t==="col"){ const x=rng(m.a), y=rng(m.b); if(!x||!y) return null; const s=14; box=[x.a-s,y.a-s,2*s,2*s]; }
  else if(LINE_TYPES.includes(m.t) && !m.a.includes("-")){ const line=rng(m.a), span=rng(m.b); if(!line||!span) return null; const L=(span.b-span.a)*.5, th=9;
    box= line.ax==="Y" ? [(span.a+span.b)/2-L/2, line.a-th, L, 2*th] : [line.a-th, (span.a+span.b)/2-L/2, 2*th, L]; }
  else if(m.t==="sbeam"){ const x=rng(m.a), y=rng(m.b); if(!x||!y) return null; const w=x.b-x.a, h=y.b-y.a, cx=(x.a+x.b)/2, cy=(y.a+y.b)/2, o=m.off||0;
    box= m.dir==="v" ? [cx+o*w*.22-6, y.a+h*.22, 12, h*.56] : [x.a+w*.22, cy+o*h*.22-6, w*.56, 12]; }
  else if(m.t==="floor"){ const x=rng(m.a), y=rng(m.b); if(!x||!y) return null; const w=x.b-x.a, h=y.b-y.a;
    box=[x.a+w*.14, y.a+h*.12, w*.26, h*.22]; }
  else { const x=rng(m.a), y=rng(m.b); if(!x||!y) return null; const w=(x.b-x.a)*(m.t==="wall"?.35:.55), h=(y.b-y.a)*(m.t==="wall"?.3:.42); box=[(x.a+x.b)/2-w/2,(y.a+y.b)/2-h/2,w,h]; }
  return {l:box[0]/g.W*100, t:box[1]/g.H*100, w:box[2]/g.W*100, h:box[3]/g.H*100};
}
const QUICK = ["定着の乱れ","アンカー定着の乱れ","ピッチ過大","かぶり不足","鉄筋のあき不足","本数不足","継手長さ不足","結束不良","スペーサー不足","残置物","立ちの乱れ"];
const QUICK2 = ["是正すること。","撤去すること。","適正なあきを確保すること。","適正なピッチに是正すること。"];

/* ===== 保存（この端末のブラウザ内：IndexedDB） ===== */
const mem = new Map(); let idb=null;
function openDB(){return new Promise(res=>{try{const r=indexedDB.open("haikin-kensa",1);r.onupgradeneeded=()=>{r.result.createObjectStore("kv");r.result.createObjectStore("photos")};r.onsuccess=()=>{idb=r.result;res()};r.onerror=()=>res()}catch(e){res()}})}
function dbGet(store,k){return new Promise(res=>{if(!idb)return res(mem.get(store+k));try{const q=idb.transaction(store).objectStore(store).get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>res(mem.get(store+k))}catch(e){res(mem.get(store+k))}})}
/* 端末の空き容量が足りないなどで保存できなかったときは知らせる（黙って消えないように。続けて出さないよう30秒あける） */
let dbWarnAt=0; function dbWarn(){ const t=Date.now(); if(t-dbWarnAt<30000) return; dbWarnAt=t; toastAct("保存できませんでした。端末の空き容量を確かめて、バックアップを保存してください","",null,6000); }
function dbPut(store,k,v){mem.set(store+k,v);if(!idb)return;try{const tx=idb.transaction(store,"readwrite"); tx.onabort=tx.onerror=dbWarn; tx.objectStore(store).put(v,k)}catch(e){dbWarn()}}
function dbDel(store,k){mem.delete(store+k);if(!idb)return;try{idb.transaction(store,"readwrite").objectStore(store).delete(k)}catch(e){}}

let S = {cur:null, data:{}};
function D(){ if(!S.data[S.cur]) S.data[S.cur]={head:{date:today(),method:"抜取り確認",kanri:"",genba:"",zesei:""},res:{},finds:[],seq:0}; return S.data[S.cur]; }
function insp(){ return INSPECTIONS.find(i=>i.id===S.cur); }
/* 部材に最初に記録した時刻（PDFの断面リストで、同じ符号は最初に記録した場所の結果を使うため） */
function markFirst(mi){ const d=D(), u=insp().members[mi].uid; d.firstAt=d.firstAt||{}; if(!d.firstAt[u]) d.firstAt[u]=Date.now(); }
/* 画面の中では部材を並び順（mi）で扱い、保存するときは部材の固有ID（uid）に変換する。
   データファイルを差し替えて部材の並びが変わっても、記録がずれないようにするため */
function toStore(){
  const out={cur:S.cur, data:{}};
  for(const [id,d] of Object.entries(S.data)){
    const ms=(INSPECTIONS.find(i=>i.id===id)||{members:[]}).members;
    const res=Object.assign({}, d.orphanRes||{});
    for(const [k,v] of Object.entries(d.res)){ const p=k.indexOf("|"), m=ms[+k.slice(0,p)]; if(m) res[m.uid+"#"+k.slice(p+1)]=v; }
    const finds=d.finds.map(f=>{ const o=Object.assign({},f); if(f.mi!=null&&ms[f.mi]) o.mu=ms[f.mi].uid; delete o.mi; return o; });
    out.data[id]={head:d.head, seq:d.seq, res, finds, firstAt:d.firstAt||{}};
  }
  return out;
}
/* 保存データ・バックアップの1件分の指摘を検査・整形する */
function sanitizeFind(f){
  const pin=f&&f.pin&&typeof f.pin==="object"? {x:Math.min(100,Math.max(0,safeNum(f.pin.x))), y:Math.min(100,Math.max(0,safeNum(f.pin.y)))} : null;
  return {id:safeId(f&&f.id)||("f"+Date.now()+Math.random().toString(36).slice(2,6)), no:Math.max(0,Math.floor(safeNum(f&&f.no))), mu:safeStr(f&&f.mu,200),
    item:f&&f.item? safeStr(f.item,80) : null, text:safeStr(f&&f.text,2000), photos:(Array.isArray(f&&f.photos)?f.photos:[]).map(safeId).filter(Boolean).slice(0,20),
    pin, status:f&&f.status==="done"?"done":"open", doneDate:safeDate(f&&f.doneDate), method:safeStr(f&&f.method,40)};
}
function fromStoreData(data){
  const out={};
  for(const [rawId,d] of Object.entries(data||{})){
    const id=safeId(rawId); if(!id || !d || typeof d!=="object") continue;
    const ms=(INSPECTIONS.find(i=>i.id===id)||{members:[]}).members, at={}; ms.forEach((m,i)=>at[m.uid]=i);
    const res={}, orphanRes={};
    for(const [k,v] of Object.entries(d.res||{})){ if(!RES_VALUES.includes(v)) continue; const p=k.lastIndexOf("#"), mi=at[k.slice(0,p)]; if(mi!=null) res[mi+"|"+safeStr(k.slice(p+1),80)]=v; else orphanRes[safeStr(k,300)]=v; }
    const finds=(Array.isArray(d.finds)?d.finds:[]).map(f=>{ const s=sanitizeFind(f); s.mi=at[s.mu]??null; return s; });
    const h=d.head||{}, head={date:safeDate(h.date)||today(), method:safeStr(h.method,20), kanri:safeStr(h.kanri,60), genba:safeStr(h.genba,60), zesei:safeStr(h.zesei,60)};
    const firstAt={}; for(const [u,t] of Object.entries(d.firstAt||{})) firstAt[safeStr(u,200)]=safeNum(t);
    out[id]={head, seq:Math.max(0,Math.floor(safeNum(d.seq))), res, finds, orphanRes, firstAt};
  }
  return out;
}
let saveT=null; function save(){ if(!DATA) return; clearTimeout(saveT); saveT=setTimeout(()=>{ saveT=null; dbPut("kv","state:"+PROJECT.id,toStore()); },250); }
/* ほかのアプリに切り替えたときは、待たずにすぐ保存する（iPhone は裏に回るとそのまま止まることがある） */
function flushSave(){ if(saveT!==null && DATA){ clearTimeout(saveT); saveT=null; dbPut("kv","state:"+PROJECT.id,toStore()); } if(INK) inkPersist(true); }
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") flushSave(); });
window.addEventListener("pagehide", flushSave);
async function loadState(){
  const st=await dbGet("kv","state:"+PROJECT.id);
  S={cur:null, data:st?fromStoreData(st.data):{}};
  S.cur=(st && INSPECTIONS.some(i=>i.id===st.cur)) ? st.cur : INSPECTIONS[0].id;
  UI.card=null; UI.pick=null; UI.flash=null; UI.focus=null;
}
const photoCache = new Map();
async function photo(id){ if(photoCache.has(id)) return photoCache.get(id); const v=safeImg(await dbGet("photos",id)); if(v) photoCache.set(id,v); return v; }

/* ===== UI 状態 ===== */
let UI = {tab:"list", card:null, zoom:1.75, pick:null, draft:null, flash:null, focus:null};
const $ = s=>document.querySelector(s);
const esc = s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function today(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function md(s){if(!s)return"";const p=s.split("-");return +p[1]+"/"+ +p[2]}
function toast(t){const e=document.createElement("div");e.className="toast";e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),1600)}
/* ボタン付きのお知らせ（「元に戻す」など）。ms 秒たつか押すと消える */
function toastAct(t,label,fn,ms=5000){
  document.querySelectorAll(".toast.act").forEach(x=>x.remove());
  const e=document.createElement("div"); e.className="toast act"; e.setAttribute("role","status");
  const s=document.createElement("span"); s.textContent=t; e.appendChild(s);
  if(label){ const b=document.createElement("button"); b.type="button"; b.textContent=label; b.addEventListener("click",()=>{ e.remove(); fn(); }); e.appendChild(b); }
  document.body.appendChild(e); setTimeout(()=>e.remove(),ms);
}

function memberStat(mi){
  const d=D(), m=insp().members[mi], keys=itemKeys(m.t);
  let n=0, ng=false;
  keys.forEach(k=>{const v=d.res[mi+"|"+k]; if(v){n++; if(v==="ng")ng=true}});
  if(d.finds.some(f=>f.mi===mi && f.status!=="done")) ng=true;
  return {n,total:keys.length,s: ng?"ng": n===0?"none": n===keys.length?"done":"part"};
}
function totals(){
  const ms=insp().members; let done=0,part=0,ng=0;
  ms.forEach((_,i)=>{const s=memberStat(i).s; if(s==="done")done++; else if(s==="part")part++; else if(s==="ng")ng++;});
  return {all:ms.length,done,part,ng};
}

/* ===== 描画 ===== */
function renderTop(){
  const sel=$("#insp-select");
  sel.innerHTML=INSPECTIONS.map(i=>`<option value="${esc(i.id)}" ${i.id===S.cur?"selected":""}>${esc(i.title)}　（${i.members.length}部材）</option>`).join("");
  const t=totals(), d=D();
  const w=x=>(x/t.all*100).toFixed(1)+"%";
  $("#topbar").innerHTML=`<i style="width:${w(t.done)};background:var(--ok)"></i><i style="width:${w(t.ng)};background:var(--ng)"></i><i style="width:${w(t.part)};background:var(--part)"></i>`;
  const open=d.finds.filter(f=>f.status!=="done").length;
  $("#topmeta").innerHTML=`<span>完了 <b class="num">${t.done+t.ng}</b> / ${t.all}　指摘 <b class="num">${d.finds.length}</b>件（未是正 ${open}）</span><span>検査日 ${esc(md(d.head.date))}</span>`;
  $("#fbadge").innerHTML= open? `<span class="badge">${open}</span>`:"";
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-current", String(b.dataset.tab===UI.tab && !(UI.tab==="list"&&UI.card!=null&&false))));
}
function viewWelcome(){
  return `<section class="welcome">
    <h1>配筋検査</h1>
    <p>はじめに、工事のデータファイル（<b>配筋検査データ_〇〇.json</b>）を読み込んでください。</p>
    <span class="btn primary filebtn">データファイルを選ぶ<input type="file" id="data-file" aria-label="データファイルを選ぶ"></span>
    <p class="note">端末に保存したファイルのほか、iPhone では「ファイル」アプリの画面から iCloud Drive や Box などのクラウドのフォルダも開いて選べます。読み込んだデータはこの端末の中に保存され、次回からは自動で開きます。アプリを開くときは電波が必要ですが、開いた後は電波が途切れても使い続けられます。</p>
  </section>`;
}
function render(){
  document.getElementById("app").classList.toggle("nodata", !DATA);
  if(!DATA){ $("#view").innerHTML=viewWelcome(); return; }
  renderTop();
  const v=$("#view");
  if(UI.tab==="list") v.innerHTML = UI.card==null ? viewList() : viewCard(UI.card);
  else if(UI.tab==="plan") v.innerHTML = viewPlan();
  else if(UI.tab==="finds") v.innerHTML = viewFinds();
  else if(UI.tab==="dwg") v.innerHTML = viewDwg();
  else v.innerHTML = viewSheet();
  if(UI.tab==="finds") hydrateThumbs();
  if(UI.tab==="plan") attachPlanGestures();
  initSectPanel();
  window.scrollTo(0, UI.keepScroll||0); UI.keepScroll=0;
}
/* 部材一覧：状態（未着手・途中・指摘あり・完了）でしぼり込み、符号・位置で探せる */
const LIST_FILTERS=[["all","すべて",""],["none","未着手","var(--line)"],["part","途中","var(--part)"],["ng","指摘あり","var(--ng)"],["done","完了","var(--ok)"]];
const normQ=x=>String(x||"").normalize("NFKC").toUpperCase().replace(/\s+/g,"");
function listBody(){
  const ms=insp().members, f=UI.lf||"all", q=normQ(UI.lq);
  const hit=i=>{ const m=ms[i]; return (f==="all"||memberStat(i).s===f) && (!q || normQ(m.sym+" "+m.loc).includes(q)); };
  const sec=t=>{
    const all=ms.map((m,i)=>m.t===t?i:-1).filter(i=>i>=0), idx=all.filter(hit); if(!idx.length) return "";
    const done=all.filter(i=>["done","ng"].includes(memberStat(i).s)).length;
    return `<section class="sec"><h2><span>${SPEC[t].label}</span><span class="num">${done} / ${all.length}</span></h2><div class="grid">${
      idx.map(i=>{const m=ms[i],st=memberStat(i);return `<button class="mbtn${UI.flash===i?" flash":""}" id="tile-${i}" data-act="open" data-i="${i}" data-s="${st.s}"><span class="st"></span><span class="sym">${esc(m.sym)}</span><span class="loc">${esc(m.loc)}</span></button>`}).join("")}</div></section>`;
  };
  const body=typesHere().map(sec).join("");
  return body || `<div class="empty">当てはまる部材がありません。</div>`;
}
function viewList(){
  const ms=insp().members, f=UI.lf||"all", cnt={all:ms.length,none:0,part:0,ng:0,done:0};
  ms.forEach((m,i)=>cnt[memberStat(i).s]++);
  const chips=LIST_FILTERS.map(([k,l,c])=>`<button data-act="lf" data-f="${k}" aria-pressed="${f===k}">${c?`<i class="dot" style="--c:${c}"></i>`:""}${l}<span class="num">${cnt[k]}</span></button>`).join("");
  return noticesHTML()+`<div class="listbar"><div class="chips lf">${chips}</div>
    <input class="dwg-q" id="list-q" type="search" placeholder="符号・位置で探す（例：C2、X3-Y2）" value="${esc(UI.lq||"")}" aria-label="部材を探す"></div>
    <div id="listbody">${listBody()}</div>`;
}
document.addEventListener("input", e=>{ if(e.target.id!=="list-q") return; UI.lq=e.target.value; const b=$("#listbody"); if(b) b.innerHTML=listBody(); });
function viewCard(mi){
  const d=D(), ms=insp().members, m=ms[mi], ma=master(m), sp=SPEC[m.t], st=memberStat(mi);
  const design=sp.design(ma).map(([k,v])=>{
    if(v && typeof v==="object" && v.fig){   /* 参考図へのリンク（データファイルに図があるときだけボタンにする） */
      const f=FIGS[v.fig]; return `<dt>${esc(k)}</dt><dd>${figItems(v.fig,m)? `<button class="figlink" data-act="fig" data-fig="${esc(v.fig)}" data-i="${mi}">${esc(v.text)}<small>（${esc(/検討書/.test(f.title)?"検討書":(f.title.match(/S-\d+\w*/)||[""])[0])}）</small> ▸</button>` : `<button class="figlink figmissing" data-act="fignone">${esc(v.text)}</button>`}</dd>`; }
    return `<dt>${esc(k)}</dt><dd>${esc(v||"—")}</dd>`; }).join("");
  const groups=sp.groups.map(g=>{
    const dv=g.dv?g.dv(ma):"";
    return `<div class="grp"><div class="grp-h"><b>${esc(g.g)}</b><span class="dv">${esc(dv)}</span></div>${
      g.items.map(it=>{const k=g.g+"/"+it, v=d.res[mi+"|"+k]||"";
        const f=d.finds.filter(f=>f.mi===mi&&f.item===k);
        return `<div class="row" data-v="${v}"><span class="lbl">${esc(it)}${f.map(x=>`<span class="fno">指摘${x.no}</span>`).join("")}</span><span class="seg">${
          [["ok","✓"],["ng","×"],["na","－"]].map(([kk,s])=>`<button data-act="set" data-k="${kk}" data-key="${esc(k)}" aria-pressed="${v===kk}" aria-label="${esc(it)} ${kk==="ok"?"適合":kk==="ng"?"不適合":"対象外"}">${s}</button>`).join("")}</span></div>`}).join("")}</div>`;
  }).join("");
  return `<button class="back" data-act="close">‹ 部材一覧</button>
  <div class="card-head"><div><div class="kind">${sp.label}　${mi+1-ms.findIndex(x=>x.t===m.t)} / ${ms.filter(x=>x.t===m.t).length}</div><div class="sym">${esc(m.sym)}</div><div class="loc">${esc(m.loc)}</div></div>
  <div style="text-align:right;display:grid;gap:6px;justify-items:end"><span class="num" style="font-size:20px">${st.n}<span style="color:var(--muted)"> / ${st.total}</span></span><button class="refbtn" data-act="refs">基準値メモ</button></div></div>
  <div class="cardbody">
  ${sectFor(m)?sectPanel(m,mi):""}
  <dl class="design">${design}</dl>
  <div class="groups">${groups}</div>
  <div class="cardbtns"><button class="btn" data-act="addfind">＋ この部材に指摘を追加</button>${hotspot(S.cur,m)?`<button class="btn" data-act="where" data-i="${mi}">図面で場所を見る</button>`:""}</div>
  </div>
  <div style="height:56px"></div>
  <div class="card-foot"><button class="btn" data-act="prev" ${mi===0?"disabled":""}>‹ 前</button><button class="btn primary" data-act="allok">残りを全て ✓</button><button class="btn" data-act="next" ${mi===ms.length-1?"disabled":""}>次 ›</button></div>`;
}
function viewPlan(){
  const d=D(), i=insp();
  const pins=d.finds.filter(f=>f.pin).map(f=>`<button class="pin ${f.status==="done"?"done":""}" style="left:${safeNum(f.pin.x)}%;top:${safeNum(f.pin.y)}%" data-act="editfind" data-id="${esc(f.id)}" aria-label="指摘${esc(f.no)}">${esc(f.no)}</button>`).join("");
  const pick=UI.pick?`<div class="pickmsg"><span>指摘 ${UI.draft?.no??""} の位置を図面上でタップ</span><button data-act="pickcancel">やめる</button></div>`:"";
  if(!i.plan) return pick+`<div class="empty">この検査にはキープランの図がありません。</div>`;
  const hs=i.members.map((m,mi)=>{const b=hotspot(i.id,m); if(!b) return "";
    return `<button class="hs ${esc(m.t)}${UI.focus===mi?" focus":""}" data-act="jump" data-i="${mi}" data-s="${memberStat(mi).s}" style="left:${b.l}%;top:${b.t}%;width:${b.w}%;height:${b.h}%" aria-label="${esc(m.sym+" "+m.loc)}"></button>`}).join("");
  return `${pick}<div class="planbar"><span class="note">${esc(i.place)}</span><span class="zoom"><button data-act="zoom" data-z="-1" aria-label="縮小">－</button><button data-act="zoom" data-z="1" aria-label="拡大">＋</button><button data-act="zoomfit" style="width:auto;padding:0 10px">全体</button></span></div>
  <div class="planbox"><div class="planwrap ${UI.pick?"picking":""}" id="planwrap" style="width:${UI.zoom*100}%"><img src="${esc(safeImg(i.plan))}" alt="${esc(i.title)} キープラン" id="planimg" style="width:100%">${hs}${pins}</div></div>
  <div class="legend"><span style="--c:var(--part)">検査対象</span><span style="--c:var(--ok)">完了</span><span style="--c:var(--ng)">指摘あり</span></div>
  <p class="note">2本指で図面だけを拡大・縮小できます。枠で囲んだ部材（柱・梁・耐圧盤）をタップすると、部材一覧のその部材へ移動します。番号のピンは指摘です。</p>`;
}
/* 図面の拡大縮小：図面の枠の中だけを拡大する（画面全体は拡大しない）。
   (px, py) は枠の中の基準点。指定がなければ枠の中央を基準にする */
function planZoomTo(z, px, py){
  const box=document.querySelector(".planbox"), wrap=$("#planwrap"); if(!box||!wrap) return;
  z=Math.max(1,Math.min(6,z));
  if(px==null){ px=box.clientWidth/2; py=box.clientHeight/2; }
  const old=UI.zoom, cx=(box.scrollLeft+px)/old, cy=(box.scrollTop+py)/old;
  UI.zoom=z; wrap.style.width=z*100+"%";
  box.scrollLeft=cx*z-px; box.scrollTop=cy*z-py;
}
function attachPlanGestures(){
  const box=document.querySelector(".planbox"), wrap=$("#planwrap"); if(!box||!wrap) return;
  /* ほかのタブから戻ったときも、図面の位置（倍率は UI.zoom）をそのままにする。検査を切り替えたときは最初から */
  const pos=UI.planPos, img=$("#planimg");
  if(pos && pos.cur===S.cur){ const put=()=>{ box.scrollLeft=pos.x; box.scrollTop=pos.y; }; put(); if(img && !img.complete) img.addEventListener("load",put,{once:true}); }
  box.addEventListener("scroll",()=>{ UI.planPos={cur:S.cur, x:box.scrollLeft, y:box.scrollTop}; },{passive:true});
  liveGestures(box, wrap, {
    getZ:()=>UI.zoom, clamp:z=>Math.max(1,Math.min(6,z)),
    commit:(z,cx,cy,mx,my)=>{ UI.zoom=z; wrap.style.width=z*100+"%"; box.scrollLeft=cx*z-mx; box.scrollTop=cy*z-my; }
  });
}
/* ===== 指の操作（拡大縮小・移動・スワイプ・2回タップ）を滑らかにする共通の仕組み =====
   指で操作している間は図を描き直さず、transform（画面の合成）だけで拡大・移動して見せ、指を離したときに1回だけ確定する。
   大きな画像を毎回描き直すと iPhone ではかくかくするため。c：getZ / clamp / commit(z,cx,cy,mx,my) / canSwipe / onSwipe / onDoubleTap */
function liveGestures(box, wrap, c){
  let pin=null, one=null, multi=false, lastTap=null, drag=null, live=null, raf=0;
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  wrap.style.transformOrigin="0 0";
  const show=()=>{ raf=0; if(live) wrap.style.transform=`translate(${live.tx}px,${live.ty}px) scale(${live.k})`; };
  const setLive=(k,tx,ty)=>{ live={k,tx,ty}; wrap.style.willChange="transform"; if(!raf) raf=requestAnimationFrame(show); };   /* 画面の更新1回につき1回だけ書き換える */
  const clearLive=()=>{ live=null; if(raf){ cancelAnimationFrame(raf); raf=0; } wrap.style.transform=""; wrap.style.willChange=""; };
  const pt=t=>{ const rc=box.getBoundingClientRect(); return {x:t.clientX-rc.left, y:t.clientY-rc.top}; };
  /* アニメーションの終わりに1回だけ done を呼ぶ。終了の合図が届かない場合（アプリの切り替え直後など）も時間が来たら必ず確定する */
  const onEnd=(an,ms,done)=>{ let fired=false; const f=()=>{ if(fired) return; fired=true; done(); }; an.onfinish=f; setTimeout(f, ms+80); };
  const mid=ts=>{ const a=pt(ts[0]), b=pt(ts[1]); return {x:(a.x+b.x)/2, y:(a.y+b.y)/2, d:Math.hypot(a.x-b.x,a.y-b.y)}; };
  /* (px, py) を基準点にして z まで滑らかに拡大してから確定する（2回タップ用） */
  const animateTo=(z,px,py)=>{
    const z0=c.getZ(); z=c.clamp(z); const sl=box.scrollLeft, st=box.scrollTop, cx=(sl+px)/z0, cy=(st+py)/z0, k=z/z0;
    if(reduce || !wrap.animate){ c.commit(z,cx,cy,px,py); return; }
    wrap.style.willChange="transform";
    const an=wrap.animate([{transform:"none"},{transform:`translate(${(px+sl)*(1-k)}px,${(py+st)*(1-k)}px) scale(${k})`}],{duration:180,easing:"ease-out",fill:"forwards"});
    onEnd(an,180,()=>{ c.commit(z,cx,cy,px,py); an.cancel(); wrap.style.willChange=""; });
  };
  box.addEventListener("touchstart",e=>{
    if(e.touches.length===1){ const p=pt(e.touches[0]); one={x:p.x, y:p.y, t:Date.now()}; multi=false; drag=null; }
    if(e.touches.length===2){ multi=true; if(drag){ clearLive(); drag=null; }
      const m=mid(e.touches), z0=c.getZ();
      pin={d0:m.d, z0, sl:box.scrollLeft, st:box.scrollTop, cx:(box.scrollLeft+m.x)/z0, cy:(box.scrollTop+m.y)/z0, z:z0, m}; } },{passive:true});
  box.addEventListener("touchmove",e=>{
    if(pin && e.touches.length===2){   /* 2本指：指の間の点が指に付いてくるように拡大・移動 */
      e.preventDefault(); const m=mid(e.touches), z=c.clamp(pin.z0*m.d/pin.d0), k=z/pin.z0;
      pin.z=z; pin.m=m; setLive(k, m.x+pin.sl-k*pin.cx*pin.z0, m.y+pin.st-k*pin.cy*pin.z0); return; }
    if(one && !multi && e.touches.length===1 && c.canSwipe && c.canSwipe()){   /* ページ送りできるときの横の動き：図面が指に付いてくる */
      const p=pt(e.touches[0]), dx=p.x-one.x, dy=p.y-one.y;
      if(drag || (Math.abs(dx)>8 && Math.abs(dx)>Math.abs(dy))){ e.preventDefault(); drag={dx}; if(c.dragMove) c.dragMove(dx); else setLive(1,dx,0); } } },{passive:false});
  box.addEventListener("touchend",e=>{
    if(pin && e.touches.length<2){ const p=pin; pin=null; clearLive(); c.commit(p.z,p.cx,p.cy,p.m.x,p.m.y); if(!e.touches.length) one=null; return; }
    if(e.touches.length || !one || multi){ if(!e.touches.length) one=null; return; }
    const p=pt(e.changedTouches[0]), dx=p.x-one.x, dy=p.y-one.y, dt=Date.now()-one.t, now=Date.now(); one=null;
    if(drag){   /* 十分に動かした（または素早く払った）ら次のページへ、足りなければ元の位置に戻す */
      const d=drag.dx; drag=null; lastTap=null;
      if(c.dragEnd){ c.dragEnd(d, dt); return; }
      if(Math.abs(d)>box.clientWidth*0.22 || (Math.abs(d)>40 && dt<300)){
        const dir=d<0?1:-1; live=null; if(raf){ cancelAnimationFrame(raf); raf=0; }
        if(reduce || !wrap.animate){ clearLive(); c.onSwipe(dir); return; }
        const an=wrap.animate([{transform:`translateX(${d}px)`},{transform:`translateX(${-dir*box.clientWidth}px)`,opacity:.2}],{duration:140,easing:"ease-in",fill:"forwards"});
        onEnd(an,140,()=>c.onSwipe(dir));
      } else { clearLive(); if(wrap.animate && !reduce) wrap.animate([{transform:`translateX(${d}px)`},{transform:"none"}],{duration:160,easing:"ease-out"}); }
      return; }
    if(Math.hypot(dx,dy)<12 && dt<300){
      if(lastTap && now-lastTap.t<350 && Math.hypot(p.x-lastTap.x,p.y-lastTap.y)<30){ lastTap=null; if(c.onDoubleTap){ e.preventDefault(); c.onDoubleTap(p.x,p.y,animateTo); } }
      else lastTap={t:now, x:p.x, y:p.y};
    } else lastTap=null; },{passive:false});
  box.addEventListener("touchcancel",()=>{ if(pin){ const p=pin; pin=null; clearLive(); c.commit(p.z,p.cx,p.cy,p.m.x,p.m.y); } if(drag){ drag=null; if(c.dragEnd) c.dragEnd(0,1000); else clearLive(); } one=null; });
  /* iPhone の Safari は gesture イベントで画面全体を拡大するので止める */
  ["gesturestart","gesturechange","gestureend"].forEach(ev=>box.addEventListener(ev,e=>e.preventDefault(),{passive:false}));
  /* パソコン：タッチパッドのピンチ（Ctrl＋ホイール） */
  box.addEventListener("wheel",e=>{ if(!e.ctrlKey) return; e.preventDefault(); const p=pt(e), z0=c.getZ(); c.commit(c.clamp(z0*Math.exp(-e.deltaY*0.01)),(box.scrollLeft+p.x)/z0,(box.scrollTop+p.y)/z0,p.x,p.y); },{passive:false});
  return {animateTo};
}
function findCard(f){
  const ms=insp().members, m=ms[f.mi];
  return `<article class="find ${f.status==="done"?"done":""}">
   <div class="find-h"><span class="no">${f.no}</span><span class="where">${m?esc(m.sym+"　"+m.loc):"全般"}</span><span class="note">${esc(f.item?f.item.replace("/"," ・ "):"")}</span><span class="stat">${f.status==="done"?"是正確認 "+esc(md(f.doneDate)):"未是正"}</span></div>
   <p>${esc(f.text)}</p>
   ${f.photos.length?`<div class="thumbs">${f.photos.map(p=>`<figure><img data-photo="${p}" alt="指摘${f.no}の写真"></figure>`).join("")}</div>`:""}
   ${f.status==="done"?`<div class="note">確認方法：${esc(f.method||"")}</div>`:""}
   <div class="acts"><button class="btn" data-act="editfind" data-id="${esc(f.id)}">編集</button>${f.status==="done"?`<button class="btn" data-act="undone" data-id="${esc(f.id)}">未是正に戻す</button>`:`<button class="btn primary" data-act="done" data-id="${esc(f.id)}">是正確認した</button>`}${f.pin?`<button class="btn" data-act="showpin" data-id="${esc(f.id)}">図面で見る</button>`:""}</div>
  </article>`;
}
/* 指摘タブ：この検査の指摘と、すべての検査の未是正の指摘（是正確認で現場を回るとき用）を切り替える */
function viewFinds(){
  const d=D(), others=INSPECTIONS.map(i=>({i, f:((S.data[i.id]||{}).finds||[]).filter(f=>f.status!=="done")})).filter(x=>x.f.length);
  const nAll=others.reduce((n,x)=>n+x.f.length,0);
  const scope=`<div class="seg2" role="group" aria-label="表示する指摘"><button data-act="fscope" data-v="one" aria-pressed="${!UI.fall}">この検査</button><button data-act="fscope" data-v="all" aria-pressed="${!!UI.fall}">全検査の未是正 <span class="num">${nAll}</span></button></div>`;
  if(UI.fall){
    if(!nAll) return scope+`<div class="empty">未是正の指摘はありません。</div>`;
    return scope+others.map(({i,f})=>`<section class="sec"><h2><span>${esc(i.title)}</span><span class="num">${f.length}</span></h2><div style="display:grid;gap:10px">${
      f.map(x=>{ const m=i.members[x.mi];
        return `<article class="find"><div class="find-h"><span class="no">${x.no}</span><span class="where">${m?esc(m.sym+"　"+m.loc):"全般"}</span><span class="note">${esc(x.item?x.item.replace("/"," ・ "):"")}</span><span class="stat">未是正</span></div>
          <p>${esc(x.text)}</p>${x.photos.length?`<div class="thumbs">${x.photos.map(p=>`<figure><img data-photo="${esc(p)}" alt="指摘${x.no}の写真"></figure>`).join("")}</div>`:""}</article>`; }).join("")
      }</div><button class="btn" data-act="openinsp" data-id="${esc(i.id)}" style="margin-top:10px;width:100%">${i.id===S.cur?"この検査の指摘を開く":"この検査に切り替えて是正確認する"}</button></section>`).join("");
  }
  if(!d.finds.length) return scope+`<div class="empty">指摘はまだありません。<br>部材カードで「×」を押すと、ここに番号付きで追加されます。</div>`;
  const open=d.finds.filter(f=>f.status!=="done"), done=d.finds.filter(f=>f.status==="done");
  return scope+(open.length?`<section class="sec"><h2><span>未是正</span><span class="num">${open.length}</span></h2><div style="display:grid;gap:10px">${open.map(findCard).join("")}</div></section>`:"")+
         (done.length?`<section class="sec"><h2><span>是正確認済み</span><span class="num">${done.length}</span></h2><div style="display:grid;gap:10px">${done.map(findCard).join("")}</div></section>`:"");
}
function viewSheet(){
  const d=D(), h=d.head, ms=insp().members;
  const tbl=t=>{
    const idx=ms.map((m,i)=>m.t===t?i:-1).filter(i=>i>=0);
    const rows=SPEC[t].groups.flatMap(g=>g.items.map((it,j)=>({k:g.g+"/"+it,label:(j===0?g.g+"｜":"　")+it})));
    const mark={ok:"✓",ng:"×",na:"－"};
    return `<h3 style="margin:6px 0 4px;font-size:14px">${SPEC[t].label}</h3><div class="tblwrap"><table class="rep"><thead><tr><th class="l">符号</th>${idx.map(i=>`<th>${esc(ms[i].sym)}</th>`).join("")}</tr><tr><th class="l">位置</th>${idx.map(i=>`<td>${esc(ms[i].loc)}</td>`).join("")}</tr></thead><tbody>${
      rows.map(r=>`<tr><th class="l">${esc(r.label)}</th>${idx.map(i=>{const v=d.res[i+"|"+r.k]||"";return `<td class="${v}">${mark[v]||""}</td>`}).join("")}</tr>`).join("")}</tbody></table></div>`;
  };
  const fl=d.finds.length?`<div class="tblwrap"><table class="fl"><thead><tr><th>No</th><th>部材・項目</th><th>指摘事項・処理方法</th><th>判定</th><th>確認日</th></tr></thead><tbody>${
    d.finds.map(f=>{const m=ms[f.mi];return `<tr><td class="num">${f.no}</td><td>${m?esc(m.sym+" "+m.loc):""}<br><span class="note">${esc((f.item||"").replace("/"," "))}</span></td><td>${esc(f.text)}</td><td>${f.status==="done"?"OK":""}</td><td>${f.status==="done"?esc(md(f.doneDate)):"/"}</td></tr>`}).join("")}</tbody></table></div>`:`<p class="note">指摘なし</p>`;
  return `<div class="headform">
    <div class="field wide"><label>検査箇所</label><div style="font-weight:700">${esc(insp().place)}</div></div>
    <div class="field"><label for="h-date">検査日</label><input type="date" id="h-date" data-h="date" value="${esc(h.date)}"></div>
    <div class="field"><label for="h-method">検査方法</label><select id="h-method" data-h="method">${["全部材確認","符号毎確認","抜取り確認"].map(x=>`<option ${h.method===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label for="h-kanri">監理担当者</label><input id="h-kanri" data-h="kanri" value="${esc(h.kanri)}" placeholder="氏名"></div>
    <div class="field"><label for="h-genba">現場担当者</label><input id="h-genba" data-h="genba" value="${esc(h.genba)}" placeholder="氏名"></div>
    <div class="field wide"><label for="h-zesei">是正確認者</label><input id="h-zesei" data-h="zesei" value="${esc(h.zesei)}" placeholder="氏名"></div>
  </div>
  ${typesHere().map(tbl).join("")}
  <h3 style="margin:6px 0 4px;font-size:14px">指摘事項</h3>${fl}
  <button class="btn primary" data-act="pdf" style="padding:14px">PDF帳票を書き出す（✓入り断面リスト付き）</button>
  <p class="note">帳票（検査表・キープラン・指摘事項）、指摘の写真、✓入りの断面リストを1つのPDF（A3横）にまとめます。断面リストには、記録した部材の符号の行ごとに✓（不適合は×）と、検査日・監理担当者を書き込みます。同じ符号が複数の場所にある場合は、最初に記録した場所の結果を使います。保存する前に、ページごとに指やペンで手書き（ペン・マーカー）を書き込めます。書き込みはこの端末に残り、次に書き出すときも続きから書けます（PDFにだけ入り、検査記録やバックアップには入りません。記録を変えると帳票のページの中身がずれることがあります）。</p>
  <button class="btn" data-act="xlsx">Excel帳票を書き出す（写真・図面付き）</button>
  <p class="note">書き出したファイルは社内サーバーに保存してください。抜取り検査では、記録のある部材だけを帳票に載せます。</p>
  <div class="two"><button class="btn" data-act="backup">バックアップを保存</button><span class="btn filebtn" style="text-align:center">バックアップを読み込む<input type="file" accept=".json,application/json" id="restore-file" aria-label="バックアップを読み込む"></span></div>
  <div class="two"><button class="btn" data-act="csv">CSVをコピー</button><button class="btn danger" data-act="reset">この検査の記録を削除</button></div>
  <p class="note">記録はこの端末のブラウザ内だけに保存されます。機種変更の前や、検査が終わるごとにバックアップ（写真込みの .json ファイル）を保存しておくと、別の端末で読み込んで続きを行えます。<br>バックアップ　${esc(agoText(BK.at))}</p>
  <h3 style="margin:10px 0 4px;font-size:14px">データファイル</h3>
  <p class="note">${esc(PROJECT.name)}　作成日 ${esc(DATA.built||"")}　検査箇所 ${INSPECTIONS.length} 件</p>
  <span class="btn filebtn" style="text-align:center">新しいデータファイルを読み込む<input type="file" id="data-file" aria-label="新しいデータファイルを読み込む"></span>
  <p class="note">階が追加されたときなどに、新しいデータファイルに差し替えます。これまでの検査記録はそのまま残ります。</p>
  <p class="note" style="text-align:right">アプリの版 ${APP_VERSION}</p>`;
}
async function hydrateThumbs(){
  for(const img of document.querySelectorAll("img[data-photo]")){ const v=await photo(img.dataset.photo); if(v) img.src=v; }
}

/* ===== 指摘入力シート ===== */
function openFindSheet(draft){
  UI.draft=draft;
  const ms=insp().members, m=ms[draft.mi];
  const ov=$("#overlay");
  ov.innerHTML=`<div class="scrim" data-act="sheetbg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fs-h">
    <h3 id="fs-h">指摘 ${draft.no}　<span class="note" style="font-weight:400">${m?esc(m.sym+" "+m.loc):""}${draft.item?" ・ "+esc(draft.item.replace("/"," ")):""}</span></h3>
    <div class="chips">${QUICK.map(q=>`<button data-act="q" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <div class="chips">${QUICK2.map(q=>`<button data-act="q" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <textarea id="fs-text" placeholder="指摘内容・処理方法">${esc(draft.text)}</textarea>
    <div class="thumbs" id="fs-thumbs"></div>
    <div class="two">
      <span class="btn filebtn" style="text-align:center">📷 撮影<input type="file" accept="image/*" capture="environment" id="fs-cam" aria-label="撮影"></span>
      <span class="btn filebtn" style="text-align:center">写真を選ぶ<input type="file" accept="image/*" multiple id="fs-pick" aria-label="写真を選ぶ"></span>
    </div>
    <button class="btn" data-act="pickpin">${draft.pin?"図面の位置を変更（記録済み）":"図面に位置を記録"}</button>
    <div class="two"><button class="btn" data-act="fcancel">${draft.isNew?"取り消す":"閉じる"}</button><button class="btn primary" data-act="fsave">保存</button></div>
    ${draft.isNew?"":`<button class="btn danger" data-act="fdelete">${UI.delArm?"本当に削除する":"この指摘を削除"}</button>`}
  </div></div>`;
  drawSheetThumbs();
  /* 写真は1件の指摘に20枚まで（保存・バックアップの上限）。縮小している間に入力を閉じたときは足さない */
  const onFiles=async e=>{ const dr=UI.draft, files=[...e.target.files]; e.target.value="";
    for(const f of files){ if(dr.photos.length>=20){ toast("写真は1件の指摘に20枚までです"); break; }
      const id="p"+Date.now()+Math.random().toString(36).slice(2,6); const url=await shrink(f); if(UI.draft!==dr) return;
      photoCache.set(id,url); dbPut("photos",id,url); dr.photos.push(id); }
    drawSheetThumbs(); };
  $("#fs-cam").onchange=onFiles; $("#fs-pick").onchange=onFiles;
  $("#fs-text").oninput=e=>{UI.draft.text=e.target.value};
}
/* 指摘の写真に書き込む（矢印・丸・文字など）。完了すると書き込み入りの写真に差し替える（元の写真は保存済みの指摘のために残す） */
async function inkPhoto(id){
  const url=await photo(id); if(!url) return;
  const im=await loadImg(url), c=document.createElement("canvas"); c.width=im.naturalWidth||im.width; c.height=im.naturalHeight||im.height; c.getContext("2d").drawImage(im,0,0);
  const back=()=>openFindSheet(UI.draft);
  openInk([c], "", {title:"写真に書き込み", doneLabel:"完了", hint:"指かペンで書き込めます。2本指で拡大・移動。「完了」で書き込み入りの写真に差し替えます。",
    unit:p=>Math.max(p.width,p.height)/1000, onCancel:back,
    onDone:out=>{ const nid="p"+Date.now()+Math.random().toString(36).slice(2,6), v=out[0].toDataURL("image/jpeg",0.85);
      photoCache.set(nid,v); dbPut("photos",nid,v); const k=UI.draft.photos.indexOf(id); if(k>=0) UI.draft.photos[k]=nid; else UI.draft.photos.push(nid);
      back(); toast("写真に書き込みました"); }});
}
async function drawSheetThumbs(){
  const box=$("#fs-thumbs"); if(!box) return;
  const arr=[]; for(const id of UI.draft.photos){ arr.push(`<figure><img src="${esc(safeImg(await photo(id)))}" alt="写真" data-act="inkphoto" data-id="${esc(id)}"><button data-act="rmphoto" data-id="${esc(id)}" aria-label="写真を外す">×</button><button class="ed" data-act="inkphoto" data-id="${esc(id)}" aria-label="写真に書き込む">✎</button></figure>`); }
  box.innerHTML=arr.join("");
}
function shrink(file){
  return new Promise(res=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const M=1280,s=Math.min(1,M/Math.max(im.width,im.height));const c=document.createElement("canvas");c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext("2d").drawImage(im,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",.72))};im.onerror=()=>res(r.result);im.src=r.result};r.readAsDataURL(file)});
}
/* ===== 構造図タブ：構造図ファイル（.json、構造図一式の全ページ）を一覧し、全画面で拡大して見る ===== */
let DWG=null;
function sanitizeDrawings(ds){
  const pages=(Array.isArray(ds&&ds.pages)?ds.pages:[]).map(p=>({p:Math.floor(safeNum(p&&p.p)), no:safeStr(p&&p.no,20), title:safeStr(p&&p.title,200),
    group:safeStr(p&&p.group,40)||"その他", w:safeNum(p&&p.w,1), h:safeNum(p&&p.h,1), img:safeImg(p&&p.img)})).filter(p=>p.p>0 && p.img);
  return {built:safeDate(ds&&ds.built), source:safeStr(ds&&ds.source,120), project:safeId(ds&&ds.project&&ds.project.id), pages};
}
async function ensureDrawings(){
  if(DWG || !DATA) return;
  const ds=await dbGet("kv","drawings:"+PROJECT.id);
  if(ds && ds.pages) DWG=sanitizeDrawings(ds);
}
function dwgFiltered(){
  const q=(UI.dwgQ||"").trim().toLowerCase().replace(/\s+/g,""), g=UI.dwgG||"すべて";
  return DWG.pages.filter(p=>(g==="すべて"||p.group===g) && (!q || (p.no+p.title).toLowerCase().replace(/\s+/g,"").includes(q)));
}
function dwgListHTML(){
  const list=dwgFiltered();
  return list.length? list.map(p=>`<button class="dwg-item" data-act="dwgopen" data-p="${p.p}"><span class="no">${esc(p.no)}</span><span>${esc(p.title)}</span></button>`).join("")
    : `<p class="note" style="text-align:center;padding:20px 0">見つかりませんでした</p>`;
}
function viewDwg(){
  if(!DWG) return `<section class="welcome" style="padding:20px 4px">
    <h1 style="font-size:22px">構造図</h1>
    <p>構造図ファイル（<b>配筋検査_構造図_〇〇.json</b>）を読み込むと、構造図一式をこのタブで拡大して見られます。</p>
    <span class="btn primary filebtn">構造図ファイルを選ぶ<input type="file" id="dwg-file" aria-label="構造図ファイルを選ぶ"></span>
    <p class="note">約20MBあります。読み込みは最初の1回だけで、この端末の中に保存されます。電波のよい場所で読み込んでください。</p></section>`;
  const groups=["すべて",...new Set(DWG.pages.map(p=>p.group))], g=UI.dwgG||"すべて";
  return `<input class="dwg-q" id="dwg-q" type="search" placeholder="図面番号・図面名で検索（例：B2、柱、S-025）" value="${esc(UI.dwgQ||"")}" aria-label="構造図を検索">
  <div class="chips">${groups.map(x=>`<button data-act="dwgg" data-g="${esc(x)}" aria-pressed="${x===g}">${esc(x)}</button>`).join("")}</div>
  <div class="dwg-list" id="dwg-list">${dwgListHTML()}</div>
  <p class="note">${esc(DWG.source)}　作成日 ${esc(DWG.built)}　${DWG.pages.length}ページ</p>
  <span class="btn filebtn" style="text-align:center">新しい構造図ファイルを読み込む<input type="file" id="dwg-file" aria-label="新しい構造図ファイルを読み込む"></span>`;
}
/* ページ送り（iPhone の写真アプリのように、隣のページが横から一緒に入ってくる） */
const DWG_GAP=24;   /* ページとページの間のすき間（px） */
function dwgNeighbor(d){ const ps=DWG.pages, k=ps.findIndex(x=>x.p===UI.dwgCur)+d; return ps[k]||null; }
let DWG_SLIDE=null;   /* スワイプ中の隣のページ {host, prev, next, wrap, w, raf, dx} */
let DWG_PRE={};        /* 前後のページの画像を先に読み込んでおく（スワイプした瞬間に白く見えないように） */
function dwgPreload(){
  const keep={};
  for(const d of [-1,1]){ const n=dwgNeighbor(d); if(!n) continue;
    const im=DWG_PRE[n.p] || (()=>{ const x=new Image(); x.decoding="async"; x.alt=""; x.src=n.img; if(x.decode) x.decode().catch(()=>{}); return x; })();
    keep[n.p]=im; }
  DWG_PRE=keep;
}
function dwgPeek(){
  if(DWG_SLIDE) return DWG_SLIDE;
  const box=$("#svbox"), sv=box.parentElement, rc=box.getBoundingClientRect(), src=sv.getBoundingClientRect();
  const host=document.createElement("div"); host.className="sv-peek";
  Object.assign(host.style,{left:(rc.left-src.left)+"px", top:(rc.top-src.top)+"px", width:rc.width+"px", height:rc.height+"px"});
  const mk=d=>{ const n=dwgNeighbor(d); if(!n) return null; const z=Math.min(rc.width/n.w, rc.height/n.h)*0.98;
    let im=DWG_PRE[n.p]; if(!im){ im=new Image(); im.decoding="async"; im.alt=""; im.src=n.img; }
    im.style.width=n.w*z+"px"; im.style.transform=""; host.appendChild(im); return im; };
  DWG_SLIDE={host, prev:mk(-1), next:mk(1), wrap:box.querySelector(".sv-wrap"), w:rc.width, raf:0, dx:0};
  sv.appendChild(host); return DWG_SLIDE;
}
function dwgPlace(s, dx){
  s.wrap.style.transform=`translateX(${dx}px)`;
  if(s.prev) s.prev.style.transform=`translateX(${dx-s.w-DWG_GAP}px)`;
  if(s.next) s.next.style.transform=`translateX(${dx+s.w+DWG_GAP}px)`;
}
function dwgDragMove(dx){
  const s=dwgPeek(), dir=dx<0?1:-1;
  if(!(dir>0?s.next:s.prev)) dx=dx*0.3;   /* その先にページがないときは少しだけ動く（端の手応え） */
  s.dx=dx; if(!s.raf) s.raf=requestAnimationFrame(()=>{ s.raf=0; dwgPlace(s, s.dx); });
}
/* 指を離したとき：十分に動かした・素早く払った → 隣のページへ。足りない → 元に戻す */
function dwgDragEnd(dx, dt){
  const s=DWG_SLIDE; if(!s) return; if(s.raf){ cancelAnimationFrame(s.raf); s.raf=0; }
  const dir=dx<0?1:-1, n=dwgNeighbor(dir), speed=Math.abs(dx)/Math.max(dt,1);
  const go = !!n && (Math.abs(dx)>s.w*0.3 || (speed>0.45 && Math.abs(dx)>30));
  dwgAnimate(s, s.dx, go? -dir*(s.w+DWG_GAP) : 0, ()=>{ if(go) openDwgViewer(n.p); else dwgSlideClear(); });
}
function dwgSlideClear(){ const s=DWG_SLIDE; if(!s) return; DWG_SLIDE=null; s.host.remove(); s.wrap.style.transform=""; }
function dwgAnimate(s, from, to, done){
  const dist=Math.abs(to-from), ms=Math.max(360, Math.min(720, dist/s.w*930));   /* 滑り込みの時間（ミリ秒）：残りの距離に応じて 0.36〜0.72 秒 */
  if(matchMedia("(prefers-reduced-motion: reduce)").matches || !s.wrap.animate || dist<1){ dwgPlace(s,to); done(); return; }
  const opt={duration:ms, easing:"cubic-bezier(.22,.8,.3,1)", fill:"forwards"};   /* 減速しながら止まる */
  const tr=off=>[{transform:`translateX(${from+off}px)`},{transform:`translateX(${to+off}px)`}];
  const ans=[s.wrap.animate(tr(0),opt)];
  if(s.prev) ans.push(s.prev.animate(tr(-s.w-DWG_GAP),opt));
  if(s.next) ans.push(s.next.animate(tr(s.w+DWG_GAP),opt));
  let fired=false; const f=()=>{ if(fired) return; fired=true; dwgPlace(s,to); ans.forEach(a=>a.cancel()); done(); };
  ans[0].onfinish=f; setTimeout(f, ms+80);
}
/* ‹ › ボタン：同じ動きで隣のページへ */
function dwgStep(d){
  const n=dwgNeighbor(d); if(!n){ toast(d>0?"最後のページです":"最初のページです"); return; }
  if(SV && SV.z>SV.zmin*1.05) SV.all();   /* 拡大中なら全体表示にしてから送る */
  const s=dwgPeek(); dwgPlace(s,0); dwgAnimate(s, 0, -d*(s.w+DWG_GAP), ()=>openDwgViewer(n.p));
}
function openDwgViewer(p){
  const pg=DWG&&DWG.pages.find(x=>x.p===p); if(!pg) return; UI.dwgCur=p; DWG_SLIDE=null;
  $("#overlay").innerHTML=`<div class="sv" role="dialog" aria-modal="true" aria-label="構造図">
    <div class="sv-bar"><b>${esc(pg.no+"　"+pg.title)}</b><button data-act="dwgnav" data-d="-1" aria-label="前のページ">‹</button><button data-act="dwgnav" data-d="1" aria-label="次のページ">›</button><button data-act="svzoom" data-z="-1" aria-label="縮小">－</button><button data-act="svzoom" data-z="1" aria-label="拡大">＋</button><button data-act="svall">全体</button><button data-act="svclose">閉じる</button></div>
    <div class="sv-box" id="svbox"></div>
    <div class="sv-hint">左右にスワイプで前後のページ。2回タップか2本指で拡大し、拡大中は指で図面を動かせます。</div></div>`;
  SV=sectView($("#svbox"), [p,0,0,pg.w,pg.h], {title:pg.no, w:pg.w, h:pg.h, img:pg.img}, null, {onSwipe:dwgStep, dragMove:dwgDragMove, dragEnd:dwgDragEnd});
  const fr=document.querySelector("#svbox .frame"); if(fr) fr.style.display="none";
  SV.all();
  dwgPreload();
}
document.addEventListener("input", e=>{ if(e.target.id!=="dwg-q") return; UI.dwgQ=e.target.value; const l=$("#dwg-list"); if(l) l.innerHTML=dwgListHTML(); });
document.addEventListener("change", e=>{
  if(e.target.id!=="dwg-file") return; const f=e.target.files[0]; e.target.value=""; if(!f) return;
  toast("構造図ファイルを読み込んでいます…");
  const r=new FileReader(); r.onload=()=>{
    let ds; try{ ds=JSON.parse(r.result); }catch(err){ toast("構造図ファイルを読めませんでした"); return; }
    if(!ds || ds.format!=="haikin-drawings"){ toast("構造図ファイルではありません"); return; }
    const clean=sanitizeDrawings(ds);
    if(clean.project && clean.project!==PROJECT.id){ toast("別の工事の構造図ファイルです（"+clean.project+"）"); return; }
    if(!clean.pages.length){ toast("構造図のページがありません"); return; }
    dbPut("kv","drawings:"+PROJECT.id, clean); DWG=clean; UI.dwgQ=""; UI.dwgG="すべて"; render();
    toast("構造図を読み込みました（"+clean.pages.length+"ページ）");
  }; r.readAsText(f);
});

/* ===== 断面リスト：部材カード内の表示欄と全画面表示（どちらも sectView で動かす） ===== */
function sectFor(m){ const d=(insp().sect&&insp().sect[m.t])||SECT[m.t]; return d&&d[m.sym]||null; }
/* box の中に断面リストのページを表示し、部材の枠をオレンジで囲む。2本指・ボタンで box の中だけを拡大縮小する */
/* opts.onSwipe(dir)：ページ全体が見えているときの左右スワイプ（dir：1＝次、-1＝前）。opts.reset：2回タップで戻す表示 */
function sectView(box, r, pg, onChange, opts={}){
  box.innerHTML=`<div class="sv-wrap"><img alt="${esc(pg.title)}"><span class="frame"></span></div>`;
  const wrap=box.firstChild, img=wrap.querySelector("img"), fr=wrap.querySelector(".frame"); img.decoding="async"; img.src=pg.img;
  const v={z:1}, rw=r[3]-r[1], rh=r[4]-r[2];
  const save=()=>{ if(onChange) onChange(v.z, box.scrollLeft, box.scrollTop); };
  v.apply=z=>{
    const zmin=Math.min(box.clientWidth/pg.w, box.clientHeight/pg.h)*0.98; v.zmin=zmin;
    v.z=z=Math.max(zmin,Math.min(4,z));
    wrap.style.width=pg.w*z+"px"; wrap.style.height=pg.h*z+"px"; img.style.width=pg.w*z+"px";
    Object.assign(fr.style,{left:(r[1]*z-3)+"px",top:(r[2]*z-3)+"px",width:(rw*z+6)+"px",height:(rh*z+6)+"px"});
  };
  /* (px, py) を基準点にして拡大縮小する（基準点の下の図は動かない）。指定がなければ表示の中央 */
  v.zoomAt=(z,px,py)=>{ if(px==null){ px=box.clientWidth/2; py=box.clientHeight/2; }
    const cx=(box.scrollLeft+px)/v.z, cy=(box.scrollTop+py)/v.z; v.apply(z); box.scrollLeft=cx*v.z-px; box.scrollTop=cy*v.z-py; save(); };
  v.zoom=dir=>v.zoomAt(v.z*Math.pow(1.5,dir));
  /* 部材の枠に合わせて表示する。readable のときは文字が読める倍率（0.7）を下限にし、
     枠が窓に収まらなければ枠の左上から表示する（部材カード内の小さな窓用） */
  v.fit=(readable)=>{
    const zf=Math.min(box.clientWidth/rw, box.clientHeight/rh)*0.92;
    v.apply(readable ? Math.max(zf,0.7) : zf);
    const W=rw*v.z, H=rh*v.z;
    box.scrollLeft = W<=box.clientWidth  ? (r[1]+rw/2)*v.z-box.clientWidth/2  : r[1]*v.z-6;
    box.scrollTop  = H<=box.clientHeight ? (r[2]+rh/2)*v.z-box.clientHeight/2 : r[2]*v.z-6;
    v.base=v.z; save(); };
  v.all=()=>{ v.apply(0); box.scrollLeft=0; box.scrollTop=0; v.base=v.z; save(); };   /* ページ全体（apply が最小倍率に丸める） */
  v.restore=(z,sl,st)=>{ v.apply(z); box.scrollLeft=sl; box.scrollTop=st; };
  box.addEventListener("scroll",save,{passive:true});
  liveGestures(box, wrap, {
    getZ:()=>v.z, clamp:z=>Math.max(v.zmin,Math.min(4,z)),
    commit:(z,cx,cy,mx,my)=>{ v.apply(z); box.scrollLeft=cx*v.z-mx; box.scrollTop=cy*v.z-my; save(); },
    canSwipe: opts.onSwipe? ()=>v.z<=v.zmin*1.05 : null,   /* ページ全体が見えている（拡大していない）ときだけページ送り */
    onSwipe: opts.onSwipe, dragMove: opts.dragMove, dragEnd: opts.dragEnd,
    onDoubleTap:(x,y,animateTo)=>{ const base=v.base||v.zmin; if(v.z<=base*1.3) animateTo(Math.max(base*2.5, v.zmin*2.5), x, y); else (opts.reset||v.all)(); }
  });
  return v;
}
function sectPanel(m, mi){
  const pg=LIST_PAGES[sectFor(m)[0]];
  return `<div class="sectpanel"><div class="sp-box" data-i="${mi}"></div><span class="sp-cap">${esc(pg.title.split(" ")[1]||pg.title)}</span>
    <div class="sp-ctl"><button data-act="spfit" aria-label="部材の表示に戻す">↺</button><button data-act="sect" data-i="${mi}" aria-label="全画面で表示">⤢</button></div></div>`;
}
let SV=null, SPV=null;
/* 部材カード内の表示欄。✓を押して画面を描き直しても、同じ部材なら倍率と位置を保つ */
function initSectPanel(){
  SPV=null; const box=document.querySelector(".sp-box"); if(!box) return;
  const m=insp().members[+box.dataset.i], r=sectFor(m); if(!r) return;
  SPV=sectView(box, r, LIST_PAGES[r[0]], (z,sl,st)=>{ UI.spState={uid:m.uid,z,sl,st}; }, {reset:()=>SPV.fit(true)});
  const s=UI.spState; if(s && s.uid===m.uid) SPV.restore(s.z,s.sl,s.st); else SPV.fit(true);
}
/* 参考図（梁貫通補強検討書など）：部材ごとのページの一覧（符号ごと → 種別ごとの順に探す） */
function figItems(name, m){ const f=FIGS[name]; return f&&(f.items[m.t+"|"+m.sym]||f.items[m.t])||null; }
/* 全画面で開く。上の見出しで「適用範囲」「一覧表」などを切り替え、拡大していないときは左右スワイプでも切り替わる。
   一覧表はその部材の段をオレンジで囲む */
function openFigViewer(name, mi, k=0){
  const f=FIGS[name], m=insp().members[mi], items=m&&figItems(name,m); if(!items) return;
  k=(k+items.length)%items.length; const it=items[k], pg=LIST_PAGES[it[1]]; if(!pg) return;
  const whole=it[2]===0&&it[3]===0&&it[4]>=pg.w*0.95;   /* ページ全体（適用範囲）は枠を出さず全体を表示 */
  $("#overlay").innerHTML=`<div class="sv" role="dialog" aria-modal="true" aria-label="${esc(f.title)}">
    <div class="sv-bar"><b>${esc(f.title)}　${esc(m.sym)}</b><button data-act="svzoom" data-z="-1" aria-label="縮小">－</button><button data-act="svzoom" data-z="1" aria-label="拡大">＋</button><button data-act="svall">全体</button>${whole?"":`<button data-act="svfit">部材</button>`}<button data-act="svclose">閉じる</button></div>
    <div class="sv-tabs">${items.map((x,j)=>`<button data-act="figpg" data-fig="${esc(name)}" data-i="${mi}" data-k="${j}" class="${j===k?"on":""}">${esc(x[0])}</button>`).join("")}</div>
    <div class="sv-box" id="svbox"></div>
    <div class="sv-hint">${esc(pg.title)}。左右にスワイプで切り替え、2回タップか2本指で拡大できます。</div></div>`;
  SV=sectView($("#svbox"), it.slice(1), pg, null, {reset:()=>whole?SV.all():SV.fit(), onSwipe:d=>openFigViewer(name, mi, k+d)});
  if(whole){ const fr=document.querySelector("#svbox .frame"); if(fr) fr.style.display="none"; SV.all(); } else SV.fit();
}
function openSectViewer(m){
  const r=sectFor(m); if(!r) return; const pg=LIST_PAGES[r[0]];
  $("#overlay").innerHTML=`<div class="sv" role="dialog" aria-modal="true" aria-label="断面リスト">
    <div class="sv-bar"><b>${esc(pg.title)}　${esc(m.sym)}</b><button data-act="svzoom" data-z="-1" aria-label="縮小">－</button><button data-act="svzoom" data-z="1" aria-label="拡大">＋</button><button data-act="svall">全体</button><button data-act="svfit">部材</button><button data-act="svclose">閉じる</button></div>
    <div class="sv-box" id="svbox"></div>
    <div class="sv-hint">2本指で断面リストだけを拡大・縮小できます。指でずらすと隣の部材も見られます。</div></div>`;
  SV=sectView($("#svbox"), r, pg, null, {reset:()=>SV.fit()}); SV.fit();
}
function closeSheet(){ $("#overlay").innerHTML=""; UI.delArm=false; }
function newDraft(mi,item){
  const d=D();
  return {id:"f"+Date.now(), no:d.seq+1, mi, item, text:"", photos:[], pin:null, status:"open", isNew:true, prev:item?d.res[mi+"|"+item]:undefined};
}
function commitDraft(){
  const d=D(), dr=UI.draft; if(!dr) return;
  const rec={id:dr.id,no:dr.no,mi:dr.mi,item:dr.item,text:dr.text.trim(),photos:dr.photos,pin:dr.pin,status:dr.status,doneDate:dr.doneDate,method:dr.method};
  const i=d.finds.findIndex(f=>f.id===dr.id);
  if(i>=0) d.finds[i]=rec; else { d.finds.push(rec); d.seq=Math.max(d.seq,dr.no); }
  if(dr.item){ d.res[dr.mi+"|"+dr.item]="ng"; if(dr.mi!=null){ const u=insp().members[dr.mi].uid; d.firstAt=d.firstAt||{}; if(!d.firstAt[u]) d.firstAt[u]=Date.now(); } }
  UI.draft=null; save();
}

/* ===== イベント ===== */
document.addEventListener("click", async e=>{
  const el=e.target.closest("[data-act]"); if(!el) return;
  const a=el.dataset.act, d=D(), ms=insp().members;
  if(a==="sheetbg"){ if(e.target===el){ cancelDraft(); } return; }
  if(a==="open"){ UI.card=+el.dataset.i; UI.flash=null; render(); return; }
  if(a==="lf"){ UI.lf=el.dataset.f; render(); return; }
  if(a==="fscope"){ UI.fall=el.dataset.v==="all"; render(); return; }
  if(a==="openinsp"){ S.cur=el.dataset.id; UI.card=null; UI.pick=null; UI.flash=null; UI.focus=null; UI.fall=false; UI.tab="finds"; save(); render(); window.scrollTo(0,0); return; }
  if(a==="jump"){ const mi=+el.dataset.i; UI.tab="list"; UI.lf="all"; UI.lq=""; UI.card=null; UI.flash=mi; UI.focus=mi; render();
    const t=document.getElementById("tile-"+mi); if(t){ t.scrollIntoView({block:"center"}); t.focus({preventScroll:true}); }
    toast(ms[mi].sym+"　"+ms[mi].loc); return; }
  if(a==="where"){ const mi=+el.dataset.i; UI.focus=mi; UI.tab="plan"; UI.planPos=null; UI.zoom=Math.max(UI.zoom,1.75); render();
    const h=document.querySelector(`.hs[data-i="${mi}"]`); h&&h.scrollIntoView({block:"center",inline:"center"}); return; }
  if(a==="close"){ UI.card=null; render(); return; }
  if(a==="prev"||a==="next"){ UI.card+= a==="next"?1:-1; render(); return; }
  if(a==="set"){
    const k=el.dataset.key, v=el.dataset.k, key=UI.card+"|"+k;
    if(v==="ng"){ const ex=d.finds.find(f=>f.mi===UI.card&&f.item===k); if(ex){ openFindSheet(Object.assign({},ex,{photos:[...ex.photos]})); } else { openFindSheet(newDraft(UI.card,k)); } d.res[key]="ng"; }
    else { d.res[key]= d.res[key]===v? undefined : v; if(!d.res[key]) delete d.res[key]; }
    if(d.res[key]) markFirst(UI.card);
    save(); UI.keepScroll=window.scrollY; render(); return;
  }
  if(a==="allok"){ const mi=UI.card, cur=S.cur, u=ms[mi].uid, hadFirst=!!(d.firstAt&&d.firstAt[u]), set=[];
    itemKeys(ms[mi].t).forEach(k=>{const key=mi+"|"+k; if(!d.res[key]){ d.res[key]="ok"; set.push(key); }}); markFirst(mi); save();
    const s=memberStat(mi);
    /* 押し間違えたときのために、数秒だけ「元に戻す」を出す（このボタンで付けた✓だけを外す） */
    toastAct(ms[mi].sym+"　"+(s.s==="ng"?"指摘あり":"完了"), set.length?"元に戻す":"", ()=>{
      set.forEach(k=>{ if(d.res[k]==="ok") delete d.res[k]; });   /* その後に自分で変えた項目は残す */
      if(!hadFirst && d.firstAt && !itemKeys(ms[mi].t).some(k=>d.res[mi+"|"+k])) delete d.firstAt[u]; save();
      if(S.cur===cur && UI.tab==="list" && UI.card===mi) UI.keepScroll=window.scrollY; render(); toast("元に戻しました"); });
    UI.keepScroll=window.scrollY; render(); return; }   /* 次の部材へは進まず、同じ部材のまま（位置もそのまま） */
  if(a==="addfind"){ openFindSheet(newDraft(UI.card,null)); return; }
  if(a==="sect"){ openSectViewer(insp().members[+el.dataset.i]); return; }
  if(a==="svclose"){ $("#overlay").innerHTML=""; SV=null; return; }
  if(a==="svzoom"){ SV&&SV.zoom(+el.dataset.z); return; }
  if(a==="svfit"){ SV&&SV.fit(); return; }
  if(a==="svall"){ SV&&SV.all(); return; }
  if(a==="dwgopen"){ openDwgViewer(+el.dataset.p); return; }
  if(a==="dwgg"){ UI.dwgG=el.dataset.g; render(); return; }
  if(a==="dwgnav"){ dwgStep(+el.dataset.d); return; }
  if(a==="fig"){ openFigViewer(el.dataset.fig, +el.dataset.i); return; }
  if(a==="figpg"){ openFigViewer(el.dataset.fig, +el.dataset.i, +el.dataset.k); return; }
  if(a==="fignone"){ toast("新しいデータファイル（10/27以降）を読み込むと、梁貫通補強検討書を見られます"); return; }
  if(a==="spzoom"){ SPV&&SPV.zoom(+el.dataset.z); return; }
  if(a==="spfit"){ SPV&&SPV.fit(true); return; }
  if(a==="spall"){ SPV&&SPV.all(); return; }
  if(a==="refs"){ $("#overlay").innerHTML=`<div class="scrim" data-act="sheetbg"><div class="sheet"><h3>基準値メモ</h3><div class="refs">${(insp().refs||REFS).map(r=>`<section><h4>${esc(r.h)}</h4><ul>${r.li.map(x=>`<li class="num" style="font-size:17px">${esc(x)}</li>`).join("")}</ul></section>`).join("")}</div><button class="btn primary" data-act="fclose">閉じる</button></div></div>`; return; }
  if(a==="fclose"){ closeSheet(); return; }
  if(a==="q"){ const t=$("#fs-text"); const add=el.dataset.q; t.value = t.value ? t.value.replace(/\s*$/,"")+(/[。、]$/.test(t.value.trim())?"":"。")+add : add; UI.draft.text=t.value; return; }
  if(a==="inkphoto"){ inkPhoto(el.dataset.id); return; }
  if(a==="rmphoto"){ UI.draft.photos=UI.draft.photos.filter(p=>p!==el.dataset.id); drawSheetThumbs(); return; }
  if(a==="fsave"){ commitDraft(); closeSheet(); render(); toast("指摘を保存しました"); return; }
  if(a==="fcancel"){ cancelDraft(); return; }
  if(a==="fdelete"){ if(!UI.delArm){UI.delArm=true; el.textContent="本当に削除する"; return;} const dr=UI.draft; d.finds=d.finds.filter(f=>f.id!==dr.id);
    /* その項目の×はこの指摘のために付けたものなので、ほかに同じ項目の指摘がなければ外す */
    if(dr.item && dr.mi!=null && d.res[dr.mi+"|"+dr.item]==="ng" && !d.finds.some(f=>f.mi===dr.mi && f.item===dr.item)) delete d.res[dr.mi+"|"+dr.item];
    UI.draft=null; save(); closeSheet(); render(); toast("指摘を削除しました"); return; }
  if(a==="pickpin"){ UI.pick={returnTab:UI.tab}; closeSheet(); UI.tab="plan"; render(); return; }
  if(a==="pickcancel"){ const back=UI.pick.returnTab; UI.pick=null; UI.tab=back; render(); openFindSheet(UI.draft); return; }
  if(a==="zoom"){ planZoomTo(UI.zoom*Math.pow(1.5,+el.dataset.z)); return; }
  if(a==="zoomfit"){ planZoomTo(1); return; }
  if(a==="editfind"){ if(UI.pick) return; const f=d.finds.find(x=>x.id===el.dataset.id); openFindSheet(Object.assign({},f,{photos:[...f.photos],isNew:false})); return; }
  if(a==="showpin"){ UI.tab="plan"; UI.planPos=null; UI.zoom=Math.max(UI.zoom,1.75); render(); const p=document.querySelector(`.pin[data-id="${el.dataset.id}"]`); p&&p.scrollIntoView({block:"center",inline:"center"}); return; }
  if(a==="done"){ $("#overlay").innerHTML=`<div class="scrim" data-act="sheetbg"><div class="sheet"><h3>是正確認</h3>
    <div class="field"><label for="dn-date">確認日</label><input type="date" id="dn-date" value="${today()}"></div>
    <div class="field"><label for="dn-m">確認方法</label><select id="dn-m"><option>再検査</option><option selected>是正写真確認</option><option>その場で是正確認</option><option>その他</option></select></div>
    <div class="two"><button class="btn" data-act="fclose">やめる</button><button class="btn primary" data-act="dosave" data-id="${el.dataset.id}">OKにする</button></div></div></div>`; return; }
  if(a==="dosave"){ const f=d.finds.find(x=>x.id===el.dataset.id); f.status="done"; f.doneDate=$("#dn-date").value; f.method=$("#dn-m").value; save(); closeSheet(); render(); return; }
  if(a==="undone"){ const f=d.finds.find(x=>x.id===el.dataset.id); f.status="open"; save(); render(); return; }
  if(a==="csv"){ copyText(toCSV()); return; }
  if(a==="xlsx"){ exportXlsx(el); return; }
  if(a==="pdf"){ exportPdf(el); return; }
  if(a==="backup"){ exportBackup(); return; }
  if(a==="bksnooze"){ BK_SNOOZE=Date.now()+12*3600e3; dbPut("kv","bksnooze:"+PROJECT.id,BK_SNOOZE); render(); return; }   /* 12時間は出さない */
  if(a==="a2hsoff"){ A2HS_OFF=Date.now()+14*864e5; dbPut("kv","a2hsoff",A2HS_OFF); render(); return; }   /* 2週間は出さない */
  if(a==="restoredo"){ const b=UI.restore; UI.restore=null; for(const [rid,u] of Object.entries(b.photos||{})){ const id=safeId(rid), url=safeImg(u); if(!id||!url) continue; photoCache.set(id,url); dbPut("photos",id,url); }
    Object.assign(S.data,fromStoreData(b.data)); save(); closeSheet(); render(); toast("バックアップを読み込みました"); return; }
  if(a==="reset"){   /* 確かめる画面を出し、「本当に削除する」を押したときだけ消す */
    const nm=new Set(Object.keys(d.res).map(k=>k.split("|")[0])).size, np=d.finds.reduce((n,f)=>n+f.photos.length,0);
    $("#overlay").innerHTML=`<div class="scrim" data-act="sheetbg"><div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="rs-h"><h3 id="rs-h">この検査の記録を削除しますか？</h3>
      <p><b>${esc(insp().title)}</b><br>記録した部材 ${nm}・指摘 ${d.finds.length}件・写真 ${np}枚 と検査日・担当者、PDF帳票の手書きがこの端末から消えます。元に戻せません。</p>
      <p class="note">残しておきたい場合は、先に「バックアップを保存」してください。</p>
      <div class="two"><button class="btn" data-act="fclose">やめる</button><button class="btn danger fill" data-act="resetdo">本当に削除する</button></div></div></div>`;
    return; }
  if(a==="resetdo"){ delete S.data[S.cur]; dbDel("kv",inkDbKey()); save(); closeSheet(); render(); toast("記録を削除しました"); return; }
});
function cancelDraft(){
  const dr=UI.draft, d=D();
  if(dr && dr.isNew && dr.item){ if(dr.prev) d.res[dr.mi+"|"+dr.item]=dr.prev; else delete d.res[dr.mi+"|"+dr.item]; save(); }
  UI.draft=null; closeSheet(); render();
}
document.addEventListener("click", e=>{
  if(!UI.pick) return; const img=e.target.closest("#planimg"); if(!img) return;
  const r=img.getBoundingClientRect();
  UI.draft.pin={x:+((e.clientX-r.left)/r.width*100).toFixed(2), y:+((e.clientY-r.top)/r.height*100).toFixed(2)};
  const back=UI.pick.returnTab; UI.pick=null; UI.tab=back; render(); openFindSheet(UI.draft); toast("位置を記録しました");
});
document.getElementById("tabs").addEventListener("click", e=>{
  const b=e.target.closest("button[data-tab]"); if(!b) return;
  if(UI.pick) abandonPick();
  if(b.dataset.tab==="list" && UI.tab==="list") UI.card=null;
  if(UI.tab==="plan") UI.planY=window.scrollY;   /* 図面タブの画面の縦位置も覚えておく */
  UI.tab=b.dataset.tab;
  if(UI.tab==="plan" && UI.planPos && UI.planPos.cur===S.cur) UI.keepScroll=UI.planY||0;
  if(UI.tab==="dwg" && !DWG){ ensureDrawings().then(render); return; }
  render();
});
/* 図面で位置を選んでいる途中に別の画面へ移ったときは、指摘の入力を取り消したのと同じに扱う（×だけが残らないように） */
function abandonPick(){ const dr=UI.draft, d=D(); UI.pick=null;
  if(dr && dr.isNew && dr.item){ if(dr.prev) d.res[dr.mi+"|"+dr.item]=dr.prev; else delete d.res[dr.mi+"|"+dr.item]; save(); }
  UI.draft=null; }
document.getElementById("insp-select").addEventListener("change", e=>{ if(UI.pick) abandonPick(); S.cur=e.target.value; UI.card=null; UI.pick=null; UI.flash=null; UI.focus=null; save(); render(); });
document.addEventListener("change", e=>{ const k=e.target.dataset?.h; if(k){ D().head[k]=e.target.value; save(); renderTop(); } });
function toCSV(){
  const d=D(), ms=insp().members, mark={ok:"✓",ng:"×",na:"－"}, out=[];
  const q=s=>`"${String(s??"").replace(/"/g,'""')}"`;
  out.push(["検査箇所",insp().place,"検査日",d.head.date,"検査方法",d.head.method,"監理担当者",d.head.kanri,"現場担当者",d.head.genba].map(q).join(","));
  typesHere().forEach(t=>{
    const idx=ms.map((m,i)=>m.t===t?i:-1).filter(i=>i>=0);
    out.push(""); out.push([SPEC[t].label+" 符号",...idx.map(i=>ms[i].sym)].map(q).join(","));
    out.push(["位置",...idx.map(i=>ms[i].loc)].map(q).join(","));
    itemKeys(t).forEach(k=>out.push([k,...idx.map(i=>mark[d.res[i+"|"+k]]||"")].map(q).join(",")));
  });
  out.push(""); out.push(["No","符号","位置","項目","指摘事項・処理方法","判定","確認日","確認方法"].map(q).join(","));
  d.finds.forEach(f=>{const m=ms[f.mi]||{};out.push([f.no,m.sym,m.loc,f.item,f.text,f.status==="done"?"OK":"",f.status==="done"?f.doneDate:"",f.method||""].map(q).join(","))});
  return out.join("\n");
}
/* ===== ファイル書き出し ===== */
function stamp(){const d=new Date();return d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0")+"_"+String(d.getHours()).padStart(2,"0")+String(d.getMinutes()).padStart(2,"0")}
async function saveFile(name, blob){
  let dl=null;
  try{ if(window.claude && window.claude.use) dl=await window.claude.use("downloads"); }catch(e){}
  if(dl){
    try{ await dl.save({filename:name,data:blob}); toast("保存しました"); return true; }
    catch(e){ if(e && e.code==="declined") return false; toast("保存できませんでした（"+(e&&e.code||"error")+"）"); }
    return false;
  }
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},3000); toast("保存しました"); return true;
}
/* 書き出したファイルを渡す。共有できる端末（iPhone・iPad など）では「共有（メール・LINE・ファイルなど）」か「保存」かを選ぶ画面を出す。
   共有はボタンを押した直後にしか呼べないので、ファイルを作り終えてから改めて押してもらう。onDone は共有・保存できたときに呼ぶ */
async function offerFile(name, blob, onDone){
  let file=null; try{ file=new File([blob],name,{type:blob.type||"application/octet-stream"}); }catch(e){}
  let can=false; try{ can=!!(file && navigator.canShare && navigator.canShare({files:[file]})) && !(window.claude && window.claude.use); }catch(e){}
  if(!can){ if(await saveFile(name,blob) && onDone) onDone(); return; }
  UI.offer={name, blob, file, onDone};
  $("#overlay").innerHTML=`<div class="scrim" data-act="sheetbg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="of-h"><h3 id="of-h">ファイルができました</h3>
    <p class="note" style="word-break:break-all">${esc(name)}</p>
    <button class="btn primary" data-act="offershare">共有（メール・LINE・ファイルなど）</button>
    <div class="two"><button class="btn" data-act="fclose">閉じる</button><button class="btn" data-act="offersave">この端末に保存</button></div></div></div>`;
}
document.addEventListener("click", async e=>{
  const el=e.target.closest('[data-act="offershare"],[data-act="offersave"]'); if(!el) return;
  const o=UI.offer; if(!o){ closeSheet(); return; }
  if(el.dataset.act==="offersave"){ UI.offer=null; closeSheet(); if(await saveFile(o.name,o.blob) && o.onDone) o.onDone(); return; }
  try{ await navigator.share({files:[o.file], title:o.name}); UI.offer=null; closeSheet(); toast("共有しました"); if(o.onDone) o.onDone(); }
  catch(err){ if(err && err.name==="AbortError") return; toast("共有できませんでした。「この端末に保存」を使ってください"); }
});
async function exportBackup(){
  const ids=new Set(); Object.values(S.data).forEach(d=>d.finds.forEach(f=>f.photos.forEach(p=>ids.add(p))));
  const photos={}; for(const id of ids){ const v=await photo(id); if(v) photos[id]=v; }
  const body=JSON.stringify({app:"haikin-kensa",version:2,project:PROJECT.id,saved:new Date().toISOString(),data:toStore().data,photos});
  const sig=recSig(), n=recCount();
  offerFile("配筋検査_バックアップ_"+PROJECT.short+"_"+stamp()+".json", new Blob([body],{type:"application/json"}), ()=>{
    BK={at:Date.now(), sig, n}; dbPut("kv","backup:"+PROJECT.id, BK); if(UI.tab==="sheet"||(UI.tab==="list"&&UI.card==null)) render(); });
}
/* ===== バックアップの案内：記録はこの端末の中にだけあるので、変わったのに長く保存していないときに知らせる ===== */
let BK={at:0, sig:"", n:0}, BK_SNOOZE=0, A2HS_OFF=0;
function recTotals(){ let r=0,f=0,p=0,dn=0; Object.values(S.data||{}).forEach(d=>{ r+=Object.keys(d.res||{}).length; (d.finds||[]).forEach(x=>{ f++; p+=x.photos.length; if(x.status==="done") dn++; }); }); return [r,f,p,dn]; }
const recSig=()=>recTotals().join(".");
const recCount=()=>{ const [r,f,p]=recTotals(); return r+f+p; };
async function loadBackupInfo(){
  const v=await dbGet("kv","backup:"+PROJECT.id);
  BK={at:safeNum(v&&v.at,0), sig:safeStr(v&&v.sig,60), n:safeNum(v&&v.n,0)};
  BK_SNOOZE=safeNum(await dbGet("kv","bksnooze:"+PROJECT.id),0); A2HS_OFF=safeNum(await dbGet("kv","a2hsoff"),0);
}
function backupNeeded(){
  const n=recCount(); if(!n || recSig()===BK.sig || Date.now()<BK_SNOOZE) return false;
  return !BK.at ? n>=10 : (Date.now()-BK.at>=2*864e5 || n-BK.n>=30);   /* 未保存なら記録10件から。保存済みなら2日たつか30件増えたら */
}
const isStandalone=()=>navigator.standalone===true || !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches);
const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
function agoText(t){ if(!t) return "まだ保存していません"; const m=Math.floor((Date.now()-t)/60000);
  return "最後の保存："+(m<60? m+"分前" : m<1440? Math.floor(m/60)+"時間前" : Math.floor(m/1440)+"日前")+"（"+new Date(t).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})+"）"; }
function noticesHTML(){
  let h="";
  if(backupNeeded()) h+=`<div class="notice"><div><b>バックアップを保存しましょう</b><span>${esc(agoText(BK.at))}。記録はこの端末の中にだけあり、端末をなくすと戻せません。</span></div>
    <div class="two"><button class="btn" data-act="bksnooze">あとで</button><button class="btn primary" data-act="backup">保存する</button></div></div>`;
  if(isIOS() && !isStandalone() && Date.now()>A2HS_OFF) h+=`<div class="notice"><div><b>ホーム画面に追加してください</b><span>Safari の共有ボタン（□に↑）→「ホーム画面に追加」。追加して使うと、しばらく開かなくても記録が消されにくくなります。</span></div>
    <button class="btn" data-act="a2hsoff">閉じる</button></div>`;
  return h;
}
/* データファイルの読み込み */
document.addEventListener("change", e=>{
  if(e.target.id!=="data-file") return; const f=e.target.files[0]; e.target.value=""; if(!f) return;
  toast("読み込んでいます…");
  const r=new FileReader(); r.onload=async()=>{
    let ds; try{ ds=JSON.parse(r.result); }catch(err){ toast("データファイルを読めませんでした"); return; }
    if(!ds || ds.format!=="haikin-data" || !ds.inspections){ toast("配筋検査のデータファイルではありません"); return; }
    if(DATA) save();
    dbPut("kv","dataset",ds); applyData(ds); await loadState(); await loadBackupInfo(); UI.tab="list"; render();
    toast(PROJECT.short+" のデータを読み込みました（"+(ds.built||"")+"）");
  }; r.readAsText(f);
});
document.addEventListener("change", e=>{
  if(e.target.id!=="restore-file") return; const f=e.target.files[0]; e.target.value=""; if(!f) return;
  const r=new FileReader(); r.onload=()=>{
    let b; try{ b=JSON.parse(r.result); }catch(err){ toast("バックアップファイルを読めませんでした"); return; }
    if(!b || b.app!=="haikin-kensa" || !b.data){ toast("このアプリのバックアップではありません"); return; }
    if(b.project && b.project!==PROJECT.id){ toast("別の工事のバックアップです（"+b.project+"）"); return; }
    UI.restore=b;
    const rows=Object.entries(b.data).filter(([,d])=>d&&typeof d==="object").map(([id,d])=>{const i=INSPECTIONS.find(x=>x.id===id); const n=Object.keys(d.res||{}).length; return `<li>${esc(i?i.title:id)}：記録 ${n} 項目、指摘 ${(Array.isArray(d.finds)?d.finds:[]).length} 件${S.data[id]?"（この端末の記録を置き換えます）":""}</li>`}).join("");
    $("#overlay").innerHTML=`<div class="scrim" data-act="sheetbg"><div class="sheet"><h3>バックアップの読み込み</h3><p class="note">保存日時：${esc(new Date(b.saved).toLocaleString("ja-JP"))}</p><ul>${rows}</ul><div class="two"><button class="btn" data-act="fclose">やめる</button><button class="btn primary" data-act="restoredo">読み込む</button></div></div></div>`;
  }; r.readAsText(f);
});
function loadImg(src){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src;})}
async function planWithPins(){
  const i=insp(), d=D(); if(!i.plan) return null;   /* キープランの図がない検査 */
  let im; try{ im=await loadImg(i.plan); }catch(e){ return null; }
  const c=document.createElement("canvas"); c.width=im.naturalWidth; c.height=im.naturalHeight; const g=c.getContext("2d");
  g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height); g.drawImage(im,0,0);
  const r=Math.max(11, c.width/70);
  d.finds.filter(f=>f.pin).forEach(f=>{const x=f.pin.x/100*c.width, y=f.pin.y/100*c.height;
    g.fillStyle=f.status==="done"?"#17834a":"#cf3527"; g.strokeStyle="#fff"; g.lineWidth=3;
    g.beginPath(); g.arc(x,y-r,r,0,Math.PI*2); g.fill(); g.stroke();
    g.fillStyle="#fff"; g.font="bold "+Math.round(r*1.2)+"px sans-serif"; g.textAlign="center"; g.textBaseline="middle"; g.fillText(String(f.no),x,y-r+1);});
  return {url:c.toDataURL("image/png"), w:c.width, h:c.height};
}
/* ===== PDF 帳票：帳票（検査表・キープラン・指摘事項）→ 写真 → ✓入り断面リスト。A3横、各ページを画像にして jsPDF でまとめる ===== */
const PDF_W=2480, PDF_H=1754;   /* A3横 150dpi */
const PDF_FONT='"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif';
const PEN_OK="#1849a9", PEN_NG="#d0271a";   /* 断面リストへの書き込み：✓は青ペン、×は赤ペン */
function pdfCanvas(w=PDF_W,h=PDF_H){ const c=document.createElement("canvas"); c.width=w; c.height=h; const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,w,h); return c; }
function pdfText(g,s,x,y,o={}){ g.font=(o.bold?"bold ":"")+(o.size||22)+"px "+PDF_FONT; g.fillStyle=o.color||"#111"; g.textAlign=o.align||"left"; g.textBaseline=o.base||"middle"; g.fillText(String(s??""),x,y); }
function pdfWrap(g,s,maxW,size){ g.font=size+"px "+PDF_FONT; const out=[]; for(const para of String(s??"").split("\n")){ let line=""; for(const ch of para){ if(g.measureText(line+ch).width>maxW && line){ out.push(line); line=ch; } else line+=ch; } out.push(line); } return out; }
function pdfRect(g,x,y,w,h,fill){ if(fill){ g.fillStyle=fill; g.fillRect(x,y,w,h); } g.strokeStyle="#555"; g.lineWidth=1.5; g.strokeRect(x,y,w,h); }
function penCheck(g,cx,cy,s,color){ g.save(); g.strokeStyle=color; g.lineWidth=Math.max(3,s*0.16); g.lineCap="round"; g.lineJoin="round";
  g.beginPath(); g.moveTo(cx-s*0.45,cy-s*0.02); g.lineTo(cx-s*0.12,cy+s*0.38); g.lineTo(cx+s*0.5,cy-s*0.48); g.stroke(); g.restore(); }
function penCross(g,cx,cy,s,color){ g.save(); g.strokeStyle=color; g.lineWidth=Math.max(3,s*0.15); g.lineCap="round";
  g.beginPath(); g.moveTo(cx-s*0.38,cy-s*0.38); g.lineTo(cx+s*0.38,cy+s*0.38); g.moveTo(cx+s*0.38,cy-s*0.38); g.lineTo(cx-s*0.38,cy+s*0.38); g.stroke(); g.restore(); }
function fmtDate(s){ return s? s.replace(/-/g,"/") : ""; }

/* 記録のある部材（帳票に載せる部材）。記録が1つもなければ全部材 */
function recordedIdx(t){
  const d=D(), ms=insp().members, all=ms.map((m,i)=>m.t===t?i:-1).filter(i=>i>=0);
  const rec=all.filter(i=>itemKeys(t).some(k=>d.res[i+"|"+k]) || d.finds.some(f=>f.mi===i));
  const anyRec=ms.some((m,i)=>itemKeys(m.t).some(k=>d.res[i+"|"+k]));
  return anyRec? rec : all;
}

/* ---- 1. 帳票ページ ---- */
async function pdfReportPages(){
  const i=insp(), d=D(), h=d.head, ms=i.members, pages=[];
  const M=60, mark={ok:"✓",ng:"×",na:"－"};
  let c, g, y, x0, xr;   /* xr：表を描ける右端 */
  const header=()=>{ pdfText(g,"監理者（構造）配筋検査帳票　"+i.title,M,M+18,{size:38,bold:true});
    pdfText(g,"検査日 "+fmtDate(h.date)+"　　検査方法 "+(h.method||""),PDF_W-M,M+18,{size:24,align:"right"});
    const rows=[["工事名称",PROJECT.name,"検査箇所",i.place],["監理担当者",h.kanri,"現場担当者",h.genba],["是正確認者",h.zesei,"","" ]];
    const cw=[180,980,180,980]; let yy=M+52;
    rows.forEach(r=>{ let xx=M; r.forEach((v,j)=>{ if(j>=2&&!r[2]){ xx+=cw[j]; return; } pdfRect(g,xx,yy,cw[j],40,j%2===0?"#eaf0fa":null); pdfText(g,v,xx+10,yy+20,{size:22}); xx+=cw[j]; }); yy+=40; });
    return yy+20; };
  const newPage=(withRight)=>{ c=pdfCanvas(); g=c.getContext("2d"); pages.push(c); y=header(); x0=M; xr=withRight? 1470 : PDF_W-M; };
  newPage(true);
  /* 右側：キープラン（指摘ピン入り）と指摘事項 */
  const pl=await planWithPins();
  const rx=1510, rw=PDF_W-M-rx; let ry=y;
  if(pl){ const plImg=await loadImg(pl.url);
    pdfText(g,"キープラン（赤：未是正　緑：是正確認済み）",rx,ry+14,{size:22,bold:true}); ry+=32;
    const ph=Math.min(rw*pl.h/pl.w, 700); const pw=ph*pl.w/pl.h; g.drawImage(plImg,rx,ry,pw,ph); g.strokeStyle="#555"; g.strokeRect(rx,ry,pw,ph); ry+=ph+24; }
  pdfText(g,"指摘事項",rx,ry+14,{size:22,bold:true}); ry+=32;
  const fcols=[60,200,rw-60-200-80-130,80,130];
  const fhead=["No","部材・位置","指摘事項・処理方法","判定","確認日"];
  const drawFindHead=(gg,xx,yy)=>{ let x=xx; fhead.forEach((s,j)=>{ pdfRect(gg,x,yy,fcols[j],36,"#eaf0fa"); pdfText(gg,s,x+fcols[j]/2,yy+18,{size:20,align:"center"}); x+=fcols[j]; }); return yy+36; };
  ry=drawFindHead(g,rx,ry);
  const restFinds=[];
  for(const f of d.finds){
    const m=ms[f.mi]||{}; const lines=pdfWrap(g,f.text,fcols[2]-16,20), mlines=pdfWrap(g,(m.sym||"")+" "+(m.loc||"")+"\n"+(f.item||"").replace("/"," "),fcols[1]-12,18);
    const rh=Math.max(lines.length*26,mlines.length*24)+14;
    if(restFinds.length || ry+rh>PDF_H-M){ restFinds.push(f); continue; }   /* 1件でもはみ出したら、残りは番号順のまま次のページへ */
    let x=rx; const cells=[String(f.no),null,null,f.status==="done"?"OK":"",f.status==="done"?md(f.doneDate):"/"];
    cells.forEach((s,j)=>{ pdfRect(g,x,ry,fcols[j],rh); if(s!=null) pdfText(g,s,x+fcols[j]/2,ry+rh/2,{size:20,align:"center",color:j===3&&s==="OK"?"#17834a":"#111"}); x+=fcols[j]; });
    mlines.forEach((l,k)=>pdfText(g,l,rx+fcols[0]+6,ry+18+k*24,{size:18}));
    lines.forEach((l,k)=>pdfText(g,l,rx+fcols[0]+fcols[1]+8,ry+20+k*26,{size:20}));
    ry+=rh;
  }
  if(!d.finds.length) pdfText(g,"指摘なし",rx+10,ry+24,{size:20,color:"#555"});
  /* 左側：部材種別ごとの検査表（入りきらなければ次のページへ） */
  const LW=150, IW=180, RH=30, HH1=34, HH2=52;
  for(const t of typesHere()){
    const idx=recordedIdx(t); if(!idx.length) continue;
    const rows=SPEC[t].groups.flatMap(gr=>gr.items.map((it,j)=>({g:gr.g, first:j===0, n:gr.items.length, k:gr.g+"/"+it, it})));
    let start=0;
    while(start<idx.length){
      const avail=xr-x0-LW-IW, cw=Math.max(58,Math.min(96,avail/Math.max(1,idx.length-start))), n=Math.min(idx.length-start, Math.floor(avail/cw));
      const part=idx.slice(start,start+n), need=38+HH1+HH2+rows.length*RH+20;
      if(y+need>PDF_H-M){ newPage(false); continue; }
      pdfText(g,SPEC[t].label+"（"+idx.length+"部材"+(idx.length>n?"・"+(start+1)+"〜"+(start+part.length):"")+"）",x0,y+16,{size:24,bold:true}); y+=38;
      pdfRect(g,x0,y,LW+IW,HH1,"#eaf0fa"); pdfText(g,"符号",x0+(LW+IW)/2,y+HH1/2,{size:20,align:"center"});
      pdfRect(g,x0,y+HH1,LW+IW,HH2,"#eaf0fa"); pdfText(g,"位置",x0+(LW+IW)/2,y+HH1+HH2/2,{size:20,align:"center"});
      part.forEach((mi,j)=>{ const x=x0+LW+IW+j*cw, m=ms[mi];
        pdfRect(g,x,y,cw,HH1,"#eaf0fa"); pdfText(g,m.sym,x+cw/2,y+HH1/2,{size:20,bold:true,align:"center"});
        pdfRect(g,x,y+HH1,cw,HH2,"#eaf0fa"); const ll=pdfWrap(g,m.loc.replace("通り ","通り\n").replace(" / ","\n"),cw-6,15).slice(0,3);
        ll.forEach((l,k)=>pdfText(g,l,x+cw/2,y+HH1+HH2/2+(k-(ll.length-1)/2)*16,{size:15,align:"center"})); });
      let yy=y+HH1+HH2;
      rows.forEach(r=>{
        if(r.first){ pdfRect(g,x0,yy,LW,RH*r.n); pdfWrap(g,r.g,LW-10,19).forEach((l,k,a)=>pdfText(g,l,x0+8,yy+RH*r.n/2+(k-(a.length-1)/2)*22,{size:19})); }
        pdfRect(g,x0+LW,yy,IW,RH); pdfText(g,r.it,x0+LW+8,yy+RH/2,{size:19});
        part.forEach((mi,j)=>{ const x=x0+LW+IW+j*cw, v=d.res[mi+"|"+r.k];
          pdfRect(g,x,yy,cw,RH,v==="ng"?"#fde5e2":null);
          if(v) pdfText(g,mark[v],x+cw/2,yy+RH/2,{size:22,bold:true,align:"center",color:v==="ng"?"#cf3527":v==="ok"?"#17834a":"#888"}); });
        yy+=RH; });
      y=yy+20; start+=part.length;
    }
  }
  /* 右側に入りきらなかった指摘事項 */
  if(restFinds.length){ newPage(false); pdfText(g,"指摘事項（続き）",x0,y+16,{size:24,bold:true}); y+=38;
    const W=PDF_W-2*M, cols=[70,320,W-70-320-90-160,90,160];
    let x=x0; fhead.forEach((s,j)=>{ pdfRect(g,x,y,cols[j],36,"#eaf0fa"); pdfText(g,s,x+cols[j]/2,y+18,{size:20,align:"center"}); x+=cols[j]; }); y+=36;
    for(const f of restFinds){ const m=ms[f.mi]||{}, lines=pdfWrap(g,f.text,cols[2]-16,20), rh=lines.length*26+14;
      if(y+rh>PDF_H-M){ newPage(false); }
      x=x0; [String(f.no),(m.sym||"")+" "+(m.loc||""),null,f.status==="done"?"OK":"",f.status==="done"?md(f.doneDate):"/"].forEach((s,j)=>{ pdfRect(g,x,y,cols[j],rh); if(s!=null) pdfText(g,s,j===1?x+8:x+cols[j]/2,y+rh/2,{size:20,align:j===1?"left":"center"}); x+=cols[j]; });
      lines.forEach((l,k)=>pdfText(g,l,x0+cols[0]+cols[1]+8,y+20+k*26,{size:20})); y+=rh; } }
  return pages;
}

/* ---- 2. 写真ページ（3列×2段） ---- */
async function pdfPhotoPages(){
  const d=D(), ms=insp().members, items=[];
  for(const f of d.finds) for(const p of f.photos){ const u=await photo(p); if(u) items.push({f,u}); }
  const pages=[], M=60, cols=3, rowsN=2, cw=(PDF_W-2*M)/cols, chh=(PDF_H-2*M-60)/rowsN;
  for(let k=0;k<items.length;k++){
    if(k%(cols*rowsN)===0){ const c=pdfCanvas(); pages.push(c); pdfText(c.getContext("2d"),"指摘写真　"+insp().title,M,M+18,{size:34,bold:true}); }
    const g=pages[pages.length-1].getContext("2d"), n=k%(cols*rowsN), x=M+(n%cols)*cw, y=M+60+Math.floor(n/cols)*chh;
    const {f,u}=items[k], im=await loadImg(u), m=ms[f.mi]||{};
    const bw=cw-30, bh=chh-130, s=Math.min(bw/im.naturalWidth,bh/im.naturalHeight), iw=im.naturalWidth*s, ih=im.naturalHeight*s;
    g.drawImage(im,x+(bw-iw)/2,y+(bh-ih)/2,iw,ih); g.strokeStyle="#999"; g.strokeRect(x,y,bw,bh);
    pdfWrap(g,"No."+f.no+"　"+(m.sym||"")+" "+(m.loc||"")+"　"+(f.item||"").replace("/"," ")+"\n"+f.text,bw,20).slice(0,4).forEach((l,j)=>pdfText(g,l,x,y+bh+20+j*26,{size:20}));
  }
  return pages;
}

/* ---- 3. ✓入り断面リスト ---- */
/* 断面リストの枠の「下から k 行目」と、アプリの確認項目の対応 */
function sectRows(t){
  const G=gname=>{ const gr=SPEC[t].groups.find(x=>x.g===gname); return gr? gr.items.map(i=>gname+"/"+i) : []; };
  const minus=(a,b)=>a.filter(x=>!b.includes(x));
  if(t==="col") return [[5,G("断面サイズ")],[4,minus(G("主筋"),["主筋/芯鉄筋・寄せ筋"])],[3,["主筋/芯鉄筋・寄せ筋"]],[2,G("フープ")],...(insp().colJoint?[[1,G("フープ")]]:[])];
  if(t==="beam") return [[7,G("断面サイズ")],[6,G("主筋")],[5,G("主筋")],[4,G("スタラップ")]];
  if(t==="girder") return [[5,G("断面サイズ")],[4,G("主筋")],[3,G("主筋")],[2,G("スタラップ")]];
  if(t==="sbeam") return [[5,G("断面サイズ")],[4,G("主筋")],[3,G("主筋")],[2,G("あばら筋")],[1,["腹筋・幅止筋/腹筋"]]];
  if(t==="wall") return [[6,G("縦筋")],[5,G("横筋")],[4,["開口補強/縦"]],[3,["開口補強/横"]],[2,["開口補強/斜め"]]];
  return [];
}
function keysStatus(keys, mi){ const d=D(); let ok=false; for(const k of keys){ const v=d.res[mi+"|"+k]; if(v==="ng") return "ng"; if(v==="ok") ok=true; } return ok?"ok":null; }
/* 枠の中の行の高さ：罫線の間隔のうち最も多いもの */
function rowPitch(g, r){
  const x0=r[1]+6, w=r[3]-r[1]-12, data=g.getImageData(x0,r[2]-3,w,r[4]-r[2]+7).data, lines=[];
  for(let y=0;y<r[4]-r[2]+7;y++){ let dark=0; for(let x=0;x<w;x++){ const p=(y*w+x)*4; if(data[p]<128) dark++; } if(dark/w>0.85){ if(lines.length&&y-lines[lines.length-1]<=3) lines[lines.length-1]=y; else lines.push(y); } }
  const cnt={}; for(let k=1;k<lines.length;k++){ const dd=lines[k]-lines[k-1]; if(dd>=14&&dd<=40) cnt[dd]=(cnt[dd]||0)+1; }
  const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]; return best? +best[0] : 28.6;
}
async function pdfSectPages(){
  const i=insp(), d=D(), ms=i.members, first=d.firstAt||{};
  /* 符号ごとに、最初に記録した部材を選ぶ（時刻がなければ並び順） */
  const pick={};
  ms.forEach((m,mi)=>{ if(!itemKeys(m.t).some(k=>d.res[mi+"|"+k])) return; const r=sectFor(m); if(!r) return;
    const key=m.t+"|"+m.sym, at=first[m.uid]??(1e15+mi);
    if(!pick[key] || at<pick[key].at) pick[key]={mi,at,r}; });
  const byPage={}; Object.values(pick).forEach(p=>(byPage[p.r[0]]=byPage[p.r[0]]||[]).push(p));
  const pages=[];
  for(const pn of Object.keys(byPage).map(Number).sort((a,b)=>a-b)){
    const pg=LIST_PAGES[pn], im=await loadImg(pg.img), c=pdfCanvas(pg.w,pg.h), g=c.getContext("2d"); g.drawImage(im,0,0);
    for(const {mi,r} of byPage[pn]){
      const m=ms[mi], t=m.t, w=r[3]-r[1];
      if(t==="slab"||t==="floor"){   /* スラブ表：行ごと（上端・下端…）に主筋方向・配力筋方向へ、版厚に1つ */
        const n=Math.max(1,Math.round((r[4]-r[2])/23.8)), h=(r[4]-r[2])/n, s=Math.min(h*0.9,26);
        const thick=keysStatus(itemKeys(t).filter(k=>k.startsWith("厚さ")),mi), bars=keysStatus(itemKeys(t).filter(k=>k.startsWith("主筋・配力筋")),mi);
        if(thick) (thick==="ng"?penCross:penCheck)(g,r[1]+w*0.25,r[2]+(r[4]-r[2])/2,s,thick==="ng"?PEN_NG:PEN_OK);
        if(bars) for(let k=0;k<n;k++){ const cy=r[2]+h*(k+0.5); [0.74,0.98].forEach(fx=>(bars==="ng"?penCross:penCheck)(g,r[1]+w*fx-s*0.6,cy,s,bars==="ng"?PEN_NG:PEN_OK)); }
        continue;
      }
      const ph=rowPitch(g,r), s=Math.min(ph*0.85,26);
      for(const [k,keys] of sectRows(t)){
        const st=keysStatus(keys,mi); if(!st) continue;
        const cy=r[4]-ph*(k-0.5);
        (st==="ng"?penCross:penCheck)(g,r[1]+w*0.87,cy,s,st==="ng"?PEN_NG:PEN_OK);
      }
    }
    /* 検査日と監理担当者（右下、表題欄の上） */
    const st=fmtDate(d.head.date)+"　"+(d.head.kanri||"");
    g.font="34px "+PDF_FONT; const tw=g.measureText(st).width;
    g.fillStyle="rgba(255,255,255,.85)"; g.fillRect(pg.w-tw-120,pg.h-300,tw+40,52);
    pdfText(g,st,pg.w-100,pg.h-274,{size:34,align:"right",color:PEN_OK});
    c.inkKey="s"+pn; pages.push(c);
  }
  return pages;
}
async function exportPdf(btn){
  if(!window.jspdf){ toast("PDF作成の部品を読み込み中です。電波のある場所で少し待ってから押してください"); return; }
  const old=btn.textContent; btn.disabled=true; btn.textContent="作成中…";
  try{
    /* 手書きを次回も同じページに出すための名前（帳票・写真は何枚目か、断面リストはページ番号） */
    const rep=await pdfReportPages(), ph=await pdfPhotoPages();
    rep.forEach((c,k)=>c.inkKey="r"+k); ph.forEach((c,k)=>c.inkKey="p"+k);
    const pages=[...rep, ...ph, ...await pdfSectPages()];
    const i=insp();
    await openInk(pages, "配筋検査帳票_"+i.title.replace(/\s+/g,"")+"_"+(D().head.date||"").replace(/-/g,"")+".pdf");
  }catch(e){ console.error(e); toast("PDFを作成できませんでした："+(e&&e.message||e)); }
  finally{ btn.disabled=false; btn.textContent=old; }
}
function pdfBlob(pages){
  const doc=new window.jspdf.jsPDF({orientation:"landscape",unit:"mm",format:"a3",compress:true});
  pages.forEach((c,k)=>{ if(k) doc.addPage("a3","landscape"); doc.addImage(c.toDataURL("image/jpeg",0.85),"JPEG",0,0,420,297); });
  return doc.output("blob");
}

/* ===== PDF帳票の手書き：書き出す前にページごとに指・ペンで書き込み、ページの絵に重ねて PDF にする =====
   1本指（またはペン）で書き、2本指で拡大・移動。Apple Pencil を一度使うと、それ以降は指では書かず1本指で動かす。
   線は点の並び [x, y, 半径, …]（ページの px）。ペンは筆圧で太さが変わり、手ぶれを抑えて描く。
   マーカーは別の層に描いて下の字と掛け合わせる（字が隠れない）。
   書き込みは検査ごとに端末に保存し（kv の ink:<工事id>:<検査id>、ページは inkKey で対応）、次に書き出すときも続きから書ける。
   検査記録（toStore）には入れない */
const INK_COLORS=[["black","黒","#111111"],["red","赤","#d0271a"],["blue","青","#1849a9"],["green","緑","#17834a"]];
const INK_MCOLORS=[["yellow","黄","#ffe14d"],["pink","桃","#ff9ecb"],["sky","水","#8fd3ff"],["lime","緑","#a6e88a"]];
const INK_SIZES=[["s","細",2.5],["m","中",4],["l","太",8]];   /* ペンの太さ（A3横 150dpi のページ上の px。中で約0.7mm） */
const INK_MSIZES=[["s","細",14],["m","中",24],["l","太",40]];  /* マーカーの太さ */
const INK_ESIZES=[["s","小",8],["m","中",16],["l","大",32]];   /* 部分消しゴムの大きさ（画面上の px） */
const INK_ALPHAS=[["0","0%",1],["40","40%",0.6],["70","70%",0.3]];   /* ペンの透明度 */
const INK_TOOLS=[["pen","ペン"],["marker","マーカー"],["erase","線を消す"],["cut","部分消し"]];
let INK=null, INK_PREF={color:"black", size:"m", alpha:"0", mcolor:"yellow", msize:"m", esize:"m"};
try{ const v=JSON.parse(localStorage.getItem("inkPref")||"null"); if(v&&typeof v==="object") for(const k of Object.keys(INK_PREF)) if(typeof v[k]==="string") INK_PREF[k]=v[k]; }catch(e){}
const inkPick=(list,k)=>(list.find(x=>x[0]===k)||list[0]);
const inkDbKey=()=>"ink:"+PROJECT.id+":"+S.cur;
/* 保存した書き込みを読み込む（端末の中のデータでも形を確かめてから使う） */
function sanitizeInk(v){
  const out={};
  if(!v||typeof v!=="object"||!v.pages||typeof v.pages!=="object") return out;
  for(const [rk,pg] of Object.entries(v.pages).slice(0,500)){
    const k=safeId(rk); if(!k||!pg||!Array.isArray(pg.strokes)) continue;
    const w=safeNum(pg.w,0), list=[];
    for(const s of pg.strokes.slice(0,5000)){
      if(!s||!Array.isArray(s.p)||!/^#[0-9a-f]{6}$/i.test(s.c||"")) continue;
      const p=s.p.slice(0,60000).map(x=>safeNum(x,0)); if(p.length<3) continue; p.length-=p.length%3;
      list.push({t:s.t==="mk"?"mk":"pen", c:s.c, a:Math.max(0.1,Math.min(1,safeNum(s.a,1))), p});
    }
    out[k]={w, strokes:list};
  }
  return out;
}
/* opt.onDone があるとき（写真への書き込み）は端末に残さず、完了で書き込み済みの canvas を渡す */
async function openInk(pages, name, opt={}){
  let saved={}; if(!opt.onDone) try{ saved=sanitizeInk(await dbGet("kv",inkDbKey())); }catch(e){}
  const strokes=pages.map(c=>{ const sv=c.inkKey&&saved[c.inkKey]; if(!sv) return [];
    const f=sv.w? c.width/sv.w : 1;   /* ページの大きさが変わっていたら合わせる */
    return f===1? sv.strokes : sv.strokes.map(s=>Object.assign({},s,{p:s.p.map(x=>x*f)})); });
  INK={pages, name, opt, key:opt.onDone? null : inkDbKey(), saved, cur:0, strokes, ops:pages.map(()=>[]), redo:pages.map(()=>[]), tool:"pen", penSeen:false, z:1, zmin:1};
  inkShow(0);
  if(inkCount()) toast("前回の書き込みを読み込みました");
}
function inkCount(){ return INK.strokes.reduce((n,a)=>n+a.length,0); }
/* 端末に保存（書くたびに少し待ってからまとめて保存） */
let inkSaveTimer=null;
function inkPersist(now){
  clearTimeout(inkSaveTimer); if(!INK || !INK.key) return;
  const run=()=>{ const pages=Object.assign({},INK.saved);
    INK.pages.forEach((c,k)=>{ if(!c.inkKey) return; if(INK.strokes[k].length) pages[c.inkKey]={w:c.width, strokes:INK.strokes[k]}; else delete pages[c.inkKey]; });
    INK.saved=pages;
    if(Object.keys(pages).length) dbPut("kv",INK.key,{v:1,pages}); else dbDel("kv",INK.key); };
  if(now) run(); else inkSaveTimer=setTimeout(run,600);
}
function inkBar(){
  const n=INK.pages.length, o=INK.opt;
  return `<b>${esc(o.title||"手書き　"+(INK.cur+1)+" / "+n+"ページ")}</b>`+(n>1?`<button data-ink="nav" data-d="-1" aria-label="前のページ">‹</button><button data-ink="nav" data-d="1" aria-label="次のページ">›</button>`:"")+
    `<button data-ink="undo">戻す</button><button data-ink="redo">進む</button><button data-ink="all">全体</button><button data-ink="cancel">${o.onDone?"やめる":"閉じる"}</button><button data-ink="save" class="go">${esc(o.doneLabel||"PDF保存")}</button>`;
}
/* 道具（ペン・マーカー・消しゴム）と、その道具の色・太さなど（次に書き出すときも同じ設定で始まる） */
function inkOpts(){
  const P=INK_PREF, t=INK.tool, on=(k,v)=>P[k]===v?' class="on"':"";
  const btns=(list,k,dot)=>list.map(([v,l,c])=>`<button data-ink="pref" data-k="${k}" data-v="${v}"${on(k,v)}>${dot?`<i class="ink-dot" style="background:${c}"></i>`:""}${l}</button>`).join("");
  const tools=INK_TOOLS.map(([k,l])=>`<button data-ink="tool" data-t="${k}"${t===k?' class="on"':""}>${l}</button>`).join("");
  let o="";
  if(t==="pen") o=btns(INK_COLORS,"color",1)+`<span class="ink-sep">太さ</span>`+btns(INK_SIZES,"size")+`<span class="ink-sep">透明度</span>`+btns(INK_ALPHAS,"alpha");
  else if(t==="marker") o=btns(INK_MCOLORS,"mcolor",1)+`<span class="ink-sep">太さ</span>`+btns(INK_MSIZES,"msize");
  else if(t==="cut") o=`<span class="ink-sep">大きさ</span>`+btns(INK_ESIZES,"esize")+`<span class="ink-sep">なぞった所だけ消えます</span>`;
  else o=`<span class="ink-sep">触れた線をまるごと消します</span>`;
  return `<div class="ink-row">${tools}</div><div class="ink-row">${o}</div>`;
}
function inkTools(){ $("#inkbar").innerHTML=inkBar(); $("#inkopts").innerHTML=inkOpts(); }
function inkShow(k){
  inkFree(); INK.cur=k; const c=INK.pages[k];
  $("#overlay").innerHTML=`<div class="sv ink" role="dialog" aria-modal="true" aria-label="PDF帳票の手書き">
    <div class="sv-bar" id="inkbar">${inkBar()}</div>
    <div class="ink-opts" id="inkopts">${inkOpts()}</div>
    <div class="sv-box" id="inkbox"><div class="sv-wrap" id="inkwrap"><canvas class="ink-layer ink-mk" id="inkhl"></canvas><canvas class="ink-layer" id="inkcv"></canvas><canvas class="ink-layer" id="inklive"></canvas></div></div>
    <div class="sv-hint">${esc(INK.opt.hint||"指かペンで書き込めます。2本指で拡大・移動。書き込みはこの端末に残り、PDF にだけ入ります（検査記録には入りません）。")}</div></div>`;
  const box=$("#inkbox"), wrap=$("#inkwrap"), hl=$("#inkhl"), cv=$("#inkcv"), live=$("#inklive");
  c.classList.add("ink-page"); wrap.insertBefore(c, hl);
  for(const x of [hl,cv,live]){ x.width=c.width; x.height=c.height; }
  Object.assign(INK,{box, wrap, hl, hg:hl.getContext("2d"), cv, g:cv.getContext("2d"), live, lg:live.getContext("2d")});
  inkRedraw(); inkApply(0); box.scrollLeft=0; box.scrollTop=0;
  inkGestures(box, live);
}
function inkApply(z){
  const c=INK.pages[INK.cur], b=INK.box;
  INK.zmin=Math.min(b.clientWidth/c.width, b.clientHeight/c.height)*0.98;
  INK.z=z=Math.max(INK.zmin,Math.min(2,z));
  INK.wrap.style.width=c.width*z+"px"; INK.wrap.style.height=c.height*z+"px";
}
function inkZoomAt(z,px,py){ const b=INK.box, cx=(b.scrollLeft+px)/INK.z, cy=(b.scrollTop+py)/INK.z; inkApply(z); b.scrollLeft=cx*INK.z-px; b.scrollTop=cy*INK.z-py; }
/* 線の形：点ごとの円と、隣の点どうしをつなぐ四角形を同じ向きで1つの道にして塗る。
   重なっても1回しか塗られないので、透明度があっても重なりが濃くならない */
function inkSeg(g,x1,y1,r1,x2,y2,r2){
  const dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy); if(L<1e-6) return;
  const nx=-dy/L, ny=dx/L;
  let q=[x1+nx*r1,y1+ny*r1, x2+nx*r2,y2+ny*r2, x2-nx*r2,y2-ny*r2, x1-nx*r1,y1-ny*r1];
  let A=0; for(let i=0;i<8;i+=2){ const j=(i+2)%8; A+=q[i]*q[j+1]-q[j]*q[i+1]; }
  if(A<0) q=[q[6],q[7],q[4],q[5],q[2],q[3],q[0],q[1]];
  g.moveTo(q[0],q[1]); g.lineTo(q[2],q[3]); g.lineTo(q[4],q[5]); g.lineTo(q[6],q[7]); g.closePath();
}
function inkDot(g,x,y,r){ g.moveTo(x+r,y); g.arc(x,y,r,0,Math.PI*2,false); g.closePath(); }
function inkPath(g,p){
  g.beginPath(); inkDot(g,p[0],p[1],p[2]);
  for(let i=3;i<p.length;i+=3){ inkSeg(g,p[i-3],p[i-2],p[i-1],p[i],p[i+1],p[i+2]); inkDot(g,p[i],p[i+1],p[i+2]); }
}
function inkLine(g,s,alpha){ g.save(); g.globalAlpha=alpha??(s.a??1); g.fillStyle=s.c; inkPath(g,s.p); g.fill("nonzero"); g.restore(); }
function inkRedraw(){
  const {g,hg,cv}=INK; g.clearRect(0,0,cv.width,cv.height); hg.clearRect(0,0,cv.width,cv.height);
  INK.strokes[INK.cur].forEach(s=>s.t==="mk"? inkLine(hg,s,1) : inkLine(g,s));
}
/* 書いた後の変更は {add:[追加した線], rm:[消した線]} で記録し、戻す・進むに使う */
function inkCommit(op){
  if(!op.add.length && !op.rm.length) return;
  INK.ops[INK.cur].push(op); INK.redo[INK.cur]=[]; inkPersist();
}
function inkSwap(rm,add){ const k=INK.cur; INK.strokes[k]=INK.strokes[k].filter(s=>!rm.includes(s)).concat(add); }
const inkNear=(s,x,y,R)=>{ const p=s.p;
  for(let i=0;i<p.length;i+=3){
    if(Math.hypot(p[i]-x,p[i+1]-y)<=R+p[i+2]) return true;
    if(i>=3){ const ax=p[i-3], ay=p[i-2], dx=p[i]-ax, dy=p[i+1]-ay, L=dx*dx+dy*dy, t=L? Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/L)) : 0;
      if(Math.hypot(ax+dx*t-x, ay+dy*t-y)<=R+Math.max(p[i-1],p[i+2])) return true; } }
  return false; };
/* 線を消す：触れた線をまるごと消す */
function inkErase(x,y,op){
  const R=Math.max(10,18/INK.z), hit=INK.strokes[INK.cur].filter(s=>inkNear(s,x,y,R)); if(!hit.length) return;
  inkSwap(hit,[]); hit.forEach(s=>{ const i=op.add.indexOf(s); if(i>=0) op.add.splice(i,1); else op.rm.push(s); }); inkRedraw();
}
/* 部分消し：円の中の部分だけを消し、残りを別々の線に分ける */
function inkCut(x,y,R,op){
  const hit=INK.strokes[INK.cur].filter(s=>inkNear(s,x,y,R)); if(!hit.length) return;
  const pieces=[];
  for(const s of hit){
    const p=s.p, step=Math.max(1,R/3), q=[];   /* 円より細かく点を足してから切る */
    for(let i=0;i<p.length;i+=3){
      if(i>=3){ const ax=p[i-3], ay=p[i-2], ar=p[i-1], n=Math.floor(Math.hypot(p[i]-ax,p[i+1]-ay)/step);
        for(let j=1;j<n;j++){ const t=j/n; q.push(ax+(p[i]-ax)*t, ay+(p[i+1]-ay)*t, ar+(p[i+2]-ar)*t); } }
      q.push(p[i],p[i+1],p[i+2]); }
    let run=[];
    const flush=()=>{ if(run.length) pieces.push(Object.assign({},s,{p:run})); run=[]; };
    for(let i=0;i<q.length;i+=3){ if(Math.hypot(q[i]-x,q[i+1]-y)<=R+q[i+2]*0.5) flush(); else run.push(q[i],q[i+1],q[i+2]); }
    flush();
  }
  inkSwap(hit,pieces);
  hit.forEach(s=>{ const i=op.add.indexOf(s); if(i>=0) op.add.splice(i,1); else op.rm.push(s); }); op.add.push(...pieces);
  inkRedraw();
}
function inkGestures(box, cv){
  const pts=new Map(); let st=null, pan=null, pinch=null, hold=false;
  const liveClear=()=>INK.lg.clearRect(0,0,INK.live.width,INK.live.height);
  const pos=e=>{ const r=INK.wrap.getBoundingClientRect(); return [(e.clientX-r.left)/INK.z, (e.clientY-r.top)/INK.z]; };
  const touches=()=>[...pts.values()].filter(p=>p.type==="touch");
  const local=p=>{ const r=box.getBoundingClientRect(); return {x:p.x-r.left, y:p.y-r.top}; };
  const startPinch=()=>{ const [a,b]=touches(), m=local({x:(a.x+b.x)/2, y:(a.y+b.y)/2});
    pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1, z:INK.z, cx:(box.scrollLeft+m.x)/INK.z, cy:(box.scrollTop+m.y)/INK.z}; };
  /* 筆圧：Apple Pencil だけ使う（指・マウスは一定の太さ）。押す強さ 0.5 前後で「太さ」の設定どおりになる */
  const radius=(e,s)=>{ if(s.t==="mk") return s.base/2;
    const pr=e.pointerType==="pen" && e.pressure>0 ? e.pressure : 0.5;
    s.pr=s.pr==null? pr : s.pr+(pr-s.pr)*0.3;
    return Math.max(0.6, s.base/2*(0.35+1.3*s.pr)); };
  /* 手ぶれ止め：入力点を少し遅れて追いかける（拡大しているほど弱くする） */
  const smooth=(s,x,y)=>{ const k=Math.min(0.75,0.4+INK.z*0.25); s.sx=s.sx==null? x : s.sx+(x-s.sx)*k; s.sy=s.sy==null? y : s.sy+(y-s.sy)*k; return [s.sx,s.sy]; };
  const addPt=(s,x,y,r)=>{ const p=s.p, n=p.length;
    if(n && Math.hypot(p[n-3]-x,p[n-2]-y)<0.6) return;
    p.push(x,y,r); const g=INK.lg; g.beginPath();
    if(n) inkSeg(g,p[n-3],p[n-2],p[n-1],x,y,r); inkDot(g,x,y,r); g.fill("nonzero"); };
  const ring=(x,y,R)=>{ liveClear(); const g=INK.lg; g.save(); g.strokeStyle="#ff9f1a"; g.lineWidth=2/INK.z; g.beginPath(); g.arc(x,y,R,0,Math.PI*2); g.stroke(); g.restore(); };
  const eraseAt=(x,y)=>{ if(st.cut){ const R=inkPick(INK_ESIZES,INK_PREF.esize)[2]/INK.z; inkCut(x,y,R,st.op); ring(x,y,R); } else inkErase(x,y,st.op); };
  cv.addEventListener("pointerdown", e=>{
    e.preventDefault(); try{ cv.setPointerCapture(e.pointerId); }catch(_){}
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});
    if(e.pointerType==="pen") INK.penSeen=true;
    if(e.pointerType==="touch"){
      const n=touches().length;
      if(n>=2){ if(st&&st.type==="touch"){ if(st.op) inkCommit(st.op); st=null; liveClear(); } pan=null; hold=true; startPinch(); return; }
      if(hold) return;
      if(INK.penSeen){ pan={id:e.pointerId,x:e.clientX,y:e.clientY,sl:box.scrollLeft,st:box.scrollTop}; return; }
    }
    if(st) return;
    const [x,y]=pos(e), t=INK.tool;
    if(t==="erase"||t==="cut"){ st={id:e.pointerId,type:e.pointerType,cut:t==="cut",op:{add:[],rm:[]}}; eraseAt(x,y); return; }
    const mk=t==="marker", P=INK_PREF, pc=INK.pages[INK.cur], w=INK.opt.unit? INK.opt.unit(pc) : pc.width/2480;
    const s={t:mk?"mk":"pen", c:inkPick(mk?INK_MCOLORS:INK_COLORS, mk?P.mcolor:P.color)[2], a:mk?1:inkPick(INK_ALPHAS,P.alpha)[2], p:[],
      base:w*inkPick(mk?INK_MSIZES:INK_SIZES, mk?P.msize:P.size)[2]};
    /* 書いている線は一番上の canvas に不透明で描き、透明度・マーカーの掛け合わせは canvas ごと付ける */
    Object.assign(INK.live.style,{opacity:s.a, mixBlendMode:mk?"multiply":"normal"}); INK.lg.fillStyle=s.c;
    st={id:e.pointerId,type:e.pointerType,s};
    const [sx,sy]=smooth(s,x,y); addPt(s,sx,sy,radius(e,s));
  });
  cv.addEventListener("pointermove", e=>{
    const q=pts.get(e.pointerId); if(!q) return; q.x=e.clientX; q.y=e.clientY;
    if(pinch && touches().length>=2){ const [a,b]=touches(), m=local({x:(a.x+b.x)/2, y:(a.y+b.y)/2});
      inkApply(pinch.z*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d); box.scrollLeft=pinch.cx*INK.z-m.x; box.scrollTop=pinch.cy*INK.z-m.y; return; }
    if(pan && pan.id===e.pointerId){ box.scrollLeft=pan.sl-(e.clientX-pan.x); box.scrollTop=pan.st-(e.clientY-pan.y); return; }
    if(!st || st.id!==e.pointerId) return;
    const evs=e.getCoalescedEvents? e.getCoalescedEvents() : [];
    for(const ev of (evs.length?evs:[e])){ const [x,y]=pos(ev);
      if(st.op){ eraseAt(x,y); continue; }
      const [sx,sy]=smooth(st.s,x,y); addPt(st.s,sx,sy,radius(ev,st.s)); }
  });
  const up=e=>{
    pts.delete(e.pointerId);
    if(st && st.id===e.pointerId){
      if(st.op) inkCommit(st.op);
      else if(e.type!=="pointercancel"){ const s=st.s, [x,y]=pos(e); addPt(s,x,y,radius(e,s));   /* 最後は指を離した所まで引く */
        delete s.sx; delete s.sy; delete s.pr; delete s.base;
        INK.strokes[INK.cur].push(s); inkCommit({add:[s],rm:[]}); s.t==="mk"? inkLine(INK.hg,s,1) : inkLine(INK.g,s); }
      st=null; liveClear(); }
    if(pan && pan.id===e.pointerId) pan=null;
    if(touches().length<2) pinch=null;
    if(!touches().length) hold=false;
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  /* iPhone の Safari は gesture イベントで画面全体を拡大するので止める。パソコンは Ctrl＋ホイールで拡大 */
  ["gesturestart","gesturechange","gestureend"].forEach(ev=>box.addEventListener(ev,e=>e.preventDefault(),{passive:false}));
  box.addEventListener("wheel",e=>{ if(!e.ctrlKey) return; e.preventDefault(); const r=box.getBoundingClientRect(); inkZoomAt(INK.z*Math.exp(-e.deltaY*0.01), e.clientX-r.left, e.clientY-r.top); },{passive:false});
}
function inkClose(){ if(INK){ inkPersist(true); inkFree(); } $("#overlay").innerHTML=""; INK=null; }
/* ページの絵の写しに書き込みを重ねる（マーカーは別の層にまとめてから掛け合わせる） */
/* ページの絵に書き込みを焼き込む（マーカーは別の層にまとめてから掛け合わせる）。
   iPhone は canvas の合計の大きさに上限があるので、写しは作らずそのページに直接描き、使い終えた層はすぐ空にする */
function inkCompose(c, list){
  if(!list.length || c.inkBaked) return c;
  const g=c.getContext("2d"), mk=list.filter(s=>s.t==="mk");
  if(mk.length){ const h=document.createElement("canvas"); h.width=c.width; h.height=c.height; const hg=h.getContext("2d"); mk.forEach(s=>inkLine(hg,s,1));
    g.save(); g.globalCompositeOperation="multiply"; g.drawImage(h,0,0); g.restore(); h.width=h.height=0; }
  list.filter(s=>s.t!=="mk").forEach(s=>inkLine(g,s));
  c.inkBaked=true;   /* 保存に失敗してもう一度押したときに二重に描かない */
  return c;
}
function inkFree(){ if(INK && INK.hl) for(const x of [INK.hl,INK.cv,INK.live]){ x.width=0; x.height=0; } }
document.addEventListener("click", async e=>{
  const el=e.target.closest("[data-ink]"); if(!el||!INK) return;
  const a=el.dataset.ink, k=INK.cur;
  if(a==="nav"){ const n=k+(+el.dataset.d); if(n<0||n>=INK.pages.length){ toast(n<0?"最初のページです":"最後のページです"); return; } inkShow(n); return; }
  if(a==="tool"){ INK.tool=el.dataset.t; inkTools(); return; }
  if(a==="pref"){ INK_PREF[el.dataset.k]=el.dataset.v; inkTools(); try{ localStorage.setItem("inkPref",JSON.stringify(INK_PREF)); }catch(err){} return; }
  if(a==="undo"||a==="redo"){
    const from=a==="undo"?INK.ops[k]:INK.redo[k], to=a==="undo"?INK.redo[k]:INK.ops[k], op=from.pop();
    if(!op){ toast(a==="undo"?"戻せる書き込みがありません":"進める書き込みがありません"); return; }
    if(a==="undo") inkSwap(op.add,op.rm); else inkSwap(op.rm,op.add);
    to.push(op); inkRedraw(); inkPersist(); return; }
  if(a==="all"){ inkApply(0); INK.box.scrollLeft=0; INK.box.scrollTop=0; return; }
  if(a==="cancel"){ const had=inkCount(), o=INK.opt;
    if(o.onDone){ if(had && !confirm("書き込みを捨てて戻りますか？")) return; inkClose(); if(o.onCancel) o.onCancel(); return; }
    inkClose(); if(had) toast("書き込みはこの端末に残しました"); return; }
  if(a==="save" && INK.opt.onDone){ const o=INK.opt, out=INK.pages.map((c,i)=>inkCompose(c, INK.strokes[i])); inkClose(); o.onDone(out); return; }
  if(a==="save"){
    if(!window.jspdf){ toast("PDF作成の部品を読み込み中です。電波のある場所で少し待ってから押してください"); return; }
    el.disabled=true; el.textContent="作成中…";
    try{
      const out=INK.pages.map((c,i)=>inkCompose(c, INK.strokes[i]));   /* 失敗しても手書きの画面はそのまま残す */
      const blob=pdfBlob(out), name=INK.name; inkClose(); out.forEach(c=>{ c.width=c.height=0; }); await offerFile(name, blob);
    }catch(err){ console.error(err); toast("PDFを作成できませんでした："+(err&&err.message||err)); el.disabled=false; el.textContent="PDF保存"; }
  }
});
async function exportXlsx(btn){
  if(!window.ExcelJS){ toast("Excel作成の部品を読み込み中です。電波のある場所で少し待ってから押してください"); return; }
  const old=btn.textContent; btn.disabled=true; btn.textContent="作成中…";
  try{
    const i=insp(), d=D(), h=d.head, ms=i.members, mark={ok:"✓",ng:"×",na:"－"};
    const wb=new ExcelJS.Workbook(); wb.creator="配筋検査アプリ";
    const thin={style:"thin",color:{argb:"FF8C96A0"}}, B={top:thin,left:thin,bottom:thin,right:thin};
    const hdrFill={type:"pattern",pattern:"solid",fgColor:{argb:"FFE3ECFB"}}, ngFill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFDE5E2"}};
    const font={name:"游ゴシック",size:10};
    /* 1. 検査帳票 */
    const ws=wb.addWorksheet("検査帳票",{pageSetup:{paperSize:8,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.4,right:.4,top:.5,bottom:.5,header:.2,footer:.2}}});
    ws.getColumn(1).width=12; ws.getColumn(2).width=16;
    ws.mergeCells("A1:J1"); ws.getCell("A1").value="監理者（構造）配筋検査帳票　"+i.title; ws.getCell("A1").font={name:"游ゴシック",size:14,bold:true};
    const info=[["工事名称",PROJECT.name],["検査箇所",i.place],["検査日",h.date],["検査方法",h.method],["監理担当者",h.kanri],["現場担当者",h.genba],["是正確認者",h.zesei]];
    info.forEach(([k,v],j)=>{const r=ws.getRow(3+j); r.getCell(1).value=k; r.getCell(1).fill=hdrFill; r.getCell(1).border=B; ws.mergeCells(3+j,2,3+j,8); r.getCell(2).value=v||""; r.getCell(2).border=B; r.font=font;});
    let row=3+info.length+1;
    const anyRec=ms.some((m,mi)=>itemKeys(m.t).some(k=>d.res[mi+"|"+k]));
    for(const t of typesHere()){
      let idx=ms.map((m,mi)=>m.t===t?mi:-1).filter(mi=>mi>=0);
      if(anyRec) idx=idx.filter(mi=>itemKeys(t).some(k=>d.res[mi+"|"+k]) || d.finds.some(f=>f.mi===mi));
      if(!idx.length) continue;
      const title=ws.getRow(row); title.getCell(1).value=SPEC[t].label+"（"+idx.length+"部材）"; title.getCell(1).font={name:"游ゴシック",size:11,bold:true}; row++;
      const r1=ws.getRow(row), r2=ws.getRow(row+1);
      ws.mergeCells(row,1,row,2); r1.getCell(1).value="符号"; ws.mergeCells(row+1,1,row+1,2); r2.getCell(1).value="位置";
      idx.forEach((mi,k)=>{ const c=3+k; ws.getColumn(c).width=Math.max(ws.getColumn(c).width||0,10);
        r1.getCell(c).value=ms[mi].sym; r1.getCell(c).font={name:"游ゴシック",size:10,bold:true}; r2.getCell(c).value=ms[mi].loc.replace("通り ","\n"); r2.getCell(c).alignment={wrapText:true,horizontal:"center",vertical:"middle"}; });
      r2.height=28;
      [r1,r2].forEach(r=>{ for(let c=1;c<=2+idx.length;c++){ const cell=r.getCell(c); cell.border=B; cell.fill=hdrFill; if(!cell.font||!cell.font.bold) cell.font=font; if(c>2&&r===r1) cell.alignment={horizontal:"center"}; } });
      row+=2;
      SPEC[t].groups.forEach(g=>{ const start=row;
        g.items.forEach(it=>{ const k=g.g+"/"+it, r=ws.getRow(row); r.getCell(2).value=it; r.getCell(2).border=B; r.getCell(2).font=font;
          idx.forEach((mi,j)=>{ const v=d.res[mi+"|"+k]; const cell=r.getCell(3+j); cell.value=mark[v]||""; cell.border=B; cell.alignment={horizontal:"center"};
            cell.font={name:"游ゴシック",size:11,bold:v==="ng",color:{argb:v==="ng"?"FFCF3527":v==="ok"?"FF17834A":"FF7B8692"}}; if(v==="ng") cell.fill=ngFill; });
          row++; });
        ws.mergeCells(start,1,row-1,1); const gc=ws.getCell(start,1); gc.value=g.g; gc.border=B; gc.font=font; gc.alignment={vertical:"middle",wrapText:true};
      });
      row++;
    }
    /* 2. 指摘事項 */
    const wf=wb.addWorksheet("指摘事項",{pageSetup:{paperSize:9,orientation:"portrait",fitToPage:true,fitToWidth:1,fitToHeight:0}});
    wf.columns=[{header:"No",width:5},{header:"符号",width:9},{header:"位置",width:16},{header:"項目",width:16},{header:"指摘事項・処理方法",width:48},{header:"判定",width:6},{header:"確認日",width:11},{header:"確認方法",width:14}];
    d.finds.forEach(f=>{const m=ms[f.mi]||{}; wf.addRow([f.no,m.sym||"",m.loc||"",(f.item||"").replace("/"," "),f.text,f.status==="done"?"OK":"",f.status==="done"?f.doneDate:"",f.status==="done"?f.method:""]);});
    wf.eachRow((r,n)=>{ r.eachCell({includeEmpty:true},c=>{c.border=B; c.font=n===1?{name:"游ゴシック",size:10,bold:true}:font; c.alignment={vertical:"top",wrapText:true}; if(n===1) c.fill=hdrFill;}); });
    /* 3. 写真 */
    const wp=wb.addWorksheet("写真",{pageSetup:{paperSize:9,orientation:"portrait",fitToPage:true,fitToWidth:1,fitToHeight:0}});
    wp.getColumn(1).width=6; wp.getColumn(2).width=50; wp.getColumn(3).width=40;
    let pr=1; wp.getRow(pr).values=["No","写真","部材・指摘内容"]; wp.getRow(pr).eachCell(c=>{c.font={name:"游ゴシック",size:10,bold:true};c.fill=hdrFill;c.border=B}); pr++;
    for(const f of d.finds){ const m=ms[f.mi]||{};
      for(const pid of f.photos){ const url=await photo(pid); if(!url) continue; const im=await loadImg(url);
        const w=340, hgt=Math.round(w*im.naturalHeight/im.naturalWidth);
        const id=wb.addImage({base64:url,extension:"jpeg"});
        const r=wp.getRow(pr); r.height=hgt*0.75+8; r.getCell(1).value=f.no; r.getCell(3).value=(m.sym||"")+" "+(m.loc||"")+"\n"+(f.item||"").replace("/"," ")+"\n"+f.text+(f.status==="done"?"\n是正確認 "+f.doneDate:"");
        [1,2,3].forEach(c=>{r.getCell(c).border=B; r.getCell(c).alignment={vertical:"top",wrapText:true}; r.getCell(c).font=font;});
        wp.addImage(id,{tl:{col:1.05,row:pr-1+0.05},ext:{width:w,height:hgt},editAs:"oneCell"}); pr++; } }
    if(pr===2) wp.getCell("B2").value="写真なし";
    /* 4. キープラン */
    const wk=wb.addWorksheet("キープラン",{pageSetup:{paperSize:8,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1}});
    wk.getCell("A1").value=i.title+"　キープラン（赤：未是正　緑：是正確認済み）"; wk.getCell("A1").font={name:"游ゴシック",size:12,bold:true};
    const pl=await planWithPins();
    if(pl){ const pid=wb.addImage({base64:pl.url,extension:"png"}); const pw=1100;
      wk.addImage(pid,{tl:{col:0,row:1.2},ext:{width:pw,height:Math.round(pw*pl.h/pl.w)}}); }
    const buf=await wb.xlsx.writeBuffer();
    await offerFile("配筋検査帳票_"+i.title.replace(/\s+/g,"")+"_"+(h.date||"").replace(/-/g,"")+".xlsx", new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  }catch(e){ console.error(e); toast("Excelを作成できませんでした："+(e&&e.message||e)); }
  finally{ btn.disabled=false; btn.textContent=old; }
}
function copyText(t){
  const fallback=()=>{const o=$("#overlay");o.innerHTML=`<div class="scrim" data-act="sheetbg"><div class="sheet"><h3>CSV</h3><p class="note">自動コピーできませんでした。全選択してコピーしてください。</p><textarea id="csvbox" style="min-height:220px">${esc(t)}</textarea><button class="btn primary" data-act="fclose">閉じる</button></div></div>`;const b=$("#csvbox");b.focus();b.select();};
  try{ navigator.clipboard.writeText(t).then(()=>toast("CSVをコピーしました"),fallback); }catch(e){ fallback(); }
}

/* 画面スリープ防止（対応端末のみ） */
async function wake(){ try{ if(navigator.wakeLock && document.visibilityState==="visible") await navigator.wakeLock.request("screen"); }catch(e){} }
document.addEventListener("visibilitychange", wake);
document.addEventListener("pointerdown", function once(){ wake(); document.removeEventListener("pointerdown", once); });

/* オフライン対応（GitHub Pages など自前のWebサーバーに置いたときだけ働く） */
if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost") && !/claude\.ai$/.test(location.hostname)){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}
try{ navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(()=>{}); }catch(e){}
(async()=>{
  $("#view").innerHTML=`<p class="note" style="text-align:center;padding:40px 0">読み込んでいます…</p>`;
  await openDB();
  const ds=await dbGet("kv","dataset");
  if(ds && ds.format==="haikin-data"){ try{ applyData(ds); await loadState(); await loadBackupInfo(); }catch(e){ console.error(e); DATA=null; } }
  render();
})();
