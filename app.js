/* TypeForge typing engine. States: READY -> RUNNING -> COMPLETED -> RESULTS */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const cfg = {mode:'timed',duration:60,pages:1,ncat:'numbers',cat:'words',diff:'medium',caps:true,punct:false,nums:false,gram:false,lines:2,timer:'digital'};
let st='READY', text='', pos=0, cur=0, typed=[], spans=[], cor=0, inc=0, keys=0, mistakes=0;
let t0=0, el=0, tick=null, samples=[], lastS=0, busy=false, loadId=0;
const timed = () => cfg.mode==='timed' || cfg.mode==='numeric';
const fmt = s => String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const msg = s => $('#msg').textContent = s;

/* ---- theme (MOD-01) ---- */
function theme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('theme',t)}catch(e){}$('#themeBtn').textContent=t==='dark'?'\u{1F319}':'\u2600\uFE0F'}
let saved='light'; try{saved=localStorage.getItem('theme')||'light'}catch(e){}
theme(saved);
$('#themeBtn').onclick=()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark');

/* ---- configuration (MOD-02) ---- */
function sync(){
  if(cfg.mode==='numeric'&&cfg.duration===600)cfg.duration=300;
  $$('[data-modes]').forEach(r=>r.hidden=!r.dataset.modes.split(' ').includes(cfg.mode));
  $$('.seg').forEach(s=>$$('button',s).forEach(b=>b.classList.toggle('on',String(cfg[s.dataset.k])===b.dataset.v)));
  $$('select[data-k]').forEach(s=>s.value=cfg[s.dataset.k]);
  $$('input[data-k]').forEach(i=>i.checked=cfg[i.dataset.k]);
  const g=$('#gram'); if(cfg.cat==='words'){cfg.gram=false;g.checked=false;g.disabled=true}else g.disabled=false;
  $('#cfg').classList.toggle('locked',st==='RUNNING');
  const dig=cfg.timer==='digital'||!timed();
  $('#digital').hidden=!dig; $('#bar').hidden=!(timed()&&cfg.timer==='bar');
  $('#view').style.setProperty('--lines',cfg.lines); $('#view').classList.toggle('one',cfg.lines===1);
  $('#endBtn').hidden=st!=='RUNNING';
}
function changed(k){
  if(k==='timer'){sync();drawTimer();return}
  if(k==='lines'){sync();scroll();return}
  /* ---- font size (24-48 px) ---- */
let fs=28; try{fs=Math.min(48,Math.max(24,+localStorage.getItem('fsize')||28))}catch(e){}
function setFs(v){
  fs=v;$('#fsize').value=v;$('#fsval').textContent=v+' px';
  const el2=$('#view');el2.style.setProperty('--fs',v+'px');el2.style.setProperty('--lh',Math.round(v*1.7)+'px');
  try{localStorage.setItem('fsize',v)}catch(err){}
  scroll();
}
$('#fsize').oninput=e=>setFs(+e.target.value);
$('#fsize').onpointerup=e=>e.target.blur(); // return keyboard focus to the typing area
setFs(fs); sync(); load();
}
$('#cfg').addEventListener('click',e=>{
  const b=e.target.closest('.seg button'); if(!b||st==='RUNNING'&&b.parentNode.dataset.k!=='timer')return;
  const k=b.parentNode.dataset.k; cfg[k]=isNaN(b.dataset.v)?b.dataset.v:+b.dataset.v; b.blur(); changed(k);
});
$('#cfg').addEventListener('change',e=>{
  const i=e.target,k=i.dataset.k; if(!k)return;
  cfg[k]=i.type==='checkbox'?i.checked:i.value; i.blur(); changed(k);
});
$('#useCustom').onclick=load;

/* ---- text generator client (MOD-03) ---- */
async function get(n){
  const p=new URLSearchParams({mode:cfg.mode,cat:cfg.cat,diff:cfg.diff,ncat:cfg.ncat,n,caps:+cfg.caps,punct:+cfg.punct,nums:+cfg.nums,gram:+cfg.gram});
  try{const r=await fetch('/api/content?'+p),j=await r.json(); if(!r.ok){msg(j.error);return null} msg('');return j.text}
  catch(e){msg('Could not reach the server. Check that Flask is running.');return null}
}
async function load(){
  const id=++loadId; reset();
  let t=null;
  if(cfg.mode==='custom'){
    try{const r=await fetch('/api/custom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:$('#custom').value})}),j=await r.json();
      if(!r.ok){msg(j.error);return} msg('');t=j.text}catch(e){msg('Could not reach the server.');return}
  } else t=await get(cfg.mode==='full'?cfg.pages*250:cfg.mode==='numeric'?120:250);
  if(id!==loadId||t===null)return;
  text=t; $('#inner').textContent=''; spans=[]; addSpans(0); mark();
}
function addSpans(from){
  const f=document.createDocumentFragment();
  for(let i=from;i<text.length;i++){const s=document.createElement('span');s.textContent=text[i];spans.push(s);f.appendChild(s)}
  $('#inner').appendChild(f);
}
async function more(){ // viewport over a continuous sequence: append, never reset
  if(busy)return; busy=true;
  const t=await get(cfg.mode==='numeric'?100:200);
  if(t&&st==='RUNNING'){const from=text.length;text+=' '+t;addSpans(from)}
  busy=false;
}

/* ---- state + timer (MOD-05) ---- */
function reset(){
  clearInterval(tick); window.onbeforeunload=null;
  st='READY';text='';pos=cur=cor=inc=keys=mistakes=0;typed=[];spans=[];samples=[];el=0;
  $('#inner').textContent='';$('#inner').style.transform='';
  $('#hint').hidden=false; sync(); drawTimer(); stats(calc(0));
}
function drawTimer(){
  const ms=st==='RUNNING'?performance.now()-t0:el; // elapsed-time based, immune to interval drift
  if(timed()){
    const tot=cfg.duration*1000,rem=Math.max(0,tot-ms),p=rem/tot*100;
    $('#digital').textContent=fmt(Math.ceil(rem/1000));
    $('#fill').style.width=p+'%'; $('#fill').style.background=`hsl(${Math.round(p*1.2)},75%,45%)`;
    return rem;
  }
  $('#digital').textContent=fmt(Math.floor(ms/1000)); return 1;
}
function start(){
  st='RUNNING'; t0=performance.now(); lastS=0; $('#hint').hidden=true; sync();
  tick=setInterval(loop,100); window.onbeforeunload=()=>'Your test is still running.';
}
function loop(){
  const rem=drawTimer(), ms=performance.now()-t0;
  if(ms-lastS>=10000){lastS+=10000;samples.push([Math.round(ms/1000),calc(ms).net])}
  stats(calc(ms));
  if(timed()&&rem<=0)return finish('Timer reached zero');
  if(timed()&&text.length-pos<400)more();
}

/* ---- results calculator (MOD-07) ---- */
function calc(ms){
  const m=Math.max(ms,500)/60000, gross=pos/5/m, net=Math.max(0,gross-inc/5/m);
  let cw=0,iw=0,ok=1,l=0;
  for(let i=0;i<=pos;i++){
    if(i===pos||text[i]===' '){if(l){ok?cw++:iw++}ok=1;l=0}else{l++;if(typed[i]!==1)ok=0}
  }
  return{gross,net,acc:pos?cor/pos*100:100,kpm:keys/m,cw,iw,chars:pos,cor,inc};
}
const r1=n=>(Math.round(n*10)/10).toFixed(1);
function stats(r){
  const items=[['Net WPM',Math.round(r.net)],['Gross WPM',Math.round(r.gross)],['Accuracy',r1(r.acc)+'%'],['Correct',r.cor],['Incorrect',r.inc],['Characters',r.chars],['Words right/wrong',r.cw+'/'+r.iw]];
  if(cfg.mode==='numeric')items.push(['KPM',Math.round(r.kpm)]);
  $('#stats').innerHTML=items.map(([a,b])=>`<span>${a} <b>${b}</b></span>`).join('');
}

/* ---- typing engine (MOD-04) ---- */
function mark(){
  if(spans[cur])spans[cur].classList.remove('cur');
  cur=pos; if(spans[pos])spans[pos].classList.add('cur'); scroll();
}
function scroll(){ // MOD-06: keep the current line first; consumed lines slide away
  const c=spans[Math.min(pos,spans.length-1)]; if(!c)return;
  $('#inner').style.transform=cfg.lines===1?`translateX(${-Math.max(0,c.offsetLeft-40)}px)`:`translateY(${-c.offsetTop}px)`;
}
document.addEventListener('keydown',e=>{
  if(st!=='READY'&&st!=='RUNNING')return;
  if(!$('#test').offsetParent||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.target.tagName==='BUTTON'&&(e.key===' '||e.key==='Enter'))return;
  if(e.metaKey||(e.ctrlKey&&!e.altKey))return;
  if(e.key==='Backspace'){e.preventDefault();
    if(st==='RUNNING'&&pos>0){pos--;typed[pos]===1?cor--:inc--;typed[pos]=0;spans[pos].className='';mark()}return}
  if(e.key.length!==1||!text)return;
  e.preventDefault(); if(st==='READY')start();
  const ok=e.key===text[pos]; keys++; if(!ok){inc++;mistakes++}else cor++;
  typed[pos]=ok?1:2; spans[pos].className=ok?'ok':'bad'; pos++; mark();
  if(pos>=text.length&&!timed())finish(cfg.mode==='custom'?'Text completed':'Passage completed');
});
$('#restart').onclick=()=>{$('#restart').blur();load()};
$('#endBtn').onclick=()=>finish('Ended manually');

function finish(reason){
  if(st!=='RUNNING')return;
  clearInterval(tick); window.onbeforeunload=null;
  el=performance.now()-t0; if(reason==='Timer reached zero')el=cfg.duration*1000;
  st='COMPLETED'; drawTimer();
  const r=calc(el); samples.push([Math.round(el/1000),r.net]);
  save(r,reason); showResults(r,reason); st='RESULTS';
}

/* ---- results dashboard (MOD-08) ---- */
const catName=()=>cfg.mode==='numeric'?$('#ncat').selectedOptions[0].text:cfg.mode==='custom'?'Custom text':$('#cat').selectedOptions[0].text;
function showResults(r,reason){
  view('results');
  const kpm=cfg.mode==='numeric';
  $('#rsub').textContent=`${catName()}${cfg.mode==='full'?' - '+cfg.pages+' page(s)':timed()?' - '+fmt(cfg.duration):''} - ${reason}`;
  const m=[['Net WPM',Math.round(r.net),1],['Gross WPM',Math.round(r.gross)],['Accuracy',r1(r.acc)+'%']];
  if(kpm)m.push(['KPM',Math.round(r.kpm),1]);
  m.push(['Total characters',r.chars],['Correct characters',r.cor],['Incorrect characters',r.inc],['Mistakes made (incl. fixed)',mistakes],
    ['Correct words',r.cw],['Incorrect words',r.iw],['Time taken',fmt(Math.round(el/1000))],['Difficulty',cfg.mode==='timed'||cfg.mode==='full'?cfg.diff:'n/a']);
  $('#rgrid').innerHTML=m.map(([a,b,h])=>`<div class="m${h?' hl':''}"><span>${a}</span><b>${b}</b></div>`).join('');
  graph();
}
function graph(){ // bar chart of the last 5 saved tests, oldest to newest
  const c=$('#graph'),x=c.getContext('2d'),W=c.width,H=c.height,css=getComputedStyle(document.documentElement);
  x.clearRect(0,0,W,H);
  let h=[]; try{h=JSON.parse(localStorage.getItem('history')||'[]').slice(0,5).reverse()}catch(e){}
  if(!h.length){$('#gnote').textContent='No test data yet.';return}
  const col=n=>css.getPropertyValue(n).trim(),mx=Math.max(...h.map(t=>t.gross),10),base=H-56,top=26,gw=(W-60)/h.length;
  x.font='14px Manrope,sans-serif';x.textAlign='center';
  x.strokeStyle=col('--bd');x.beginPath();x.moveTo(40,base);x.lineTo(W-10,base);x.stroke();
  h.forEach((t,i)=>{
    const cx=45+gw*i+gw/2,bw=Math.min(46,gw/3);
    [[t.net,'--acc'],[t.gross,'--mut']].forEach(([v,k],n)=>{
      const bh=v/mx*(base-top),bx=n?cx+2:cx-bw-2;
      x.fillStyle=col(k);x.fillRect(bx,base-bh,bw,bh);
      x.fillStyle=col('--fg');x.fillText(Math.round(v),bx+bw/2,base-bh-6);
    });
    x.fillStyle=col('--fg');x.fillText(r1(t.accuracy)+'% accuracy',cx,base+20);
    x.fillStyle=col('--mut');x.fillText(new Date(t.created).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),cx,base+40);
  });
  $('#gnote').textContent=`Last ${h.length} test${h.length>1?'s':''}, oldest to newest. Teal bars are net WPM, grey bars are gross WPM.`;
}

/* ---- history + personal bests (MOD-09) ---- */
function save(r,reason){
  const d={mode:cfg.mode,category:catName(),difficulty:cfg.diff,duration:timed()?cfg.duration:Math.round(el/1000),lines:cfg.lines,timer:cfg.timer,
    gross:r.gross,net:r.net,accuracy:r.acc,kpm:r.kpm,correct:r.cor,incorrect:r.inc,taken:el/1000,reason};
  try{const h=JSON.parse(localStorage.getItem('history')||'[]');h.unshift({...d,created:new Date().toISOString()});localStorage.setItem('history',JSON.stringify(h.slice(0,50)))}catch(e){}
  fetch('/api/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(()=>{});
}
async function history(){
  let rows; try{const r=await fetch('/api/history');rows=await r.json()}catch(e){try{rows=JSON.parse(localStorage.getItem('history')||'[]')}catch(_){rows=[]}}
  const best={}; rows.forEach(r=>{const k=`${r.mode} / ${r.category} / ${r.duration}s`;if(!best[k]||r.net>best[k].net)best[k]=r});
  $('#bests').innerHTML=Object.entries(best).map(([k,r])=>`<div>${esc(k)}: best net ${Math.round(r.net)} WPM, ${r1(r.accuracy)}% accuracy</div>`).join('')||'No attempts yet. Finish a test to see it here.';
  $('#htable').innerHTML='<tr><th>Date</th><th>Test</th><th>Category</th><th>Net WPM</th><th>Gross</th><th>Accuracy</th><th>Errors</th></tr>'+
    rows.map(r=>`<tr><td>${esc(String(r.created).slice(0,16).replace('T',' '))}</td><td>${esc(r.mode)}</td><td>${esc(r.category)}</td><td>${Math.round(r.net)}</td><td>${Math.round(r.gross)}</td><td>${r1(r.accuracy)}%</td><td>${r.incorrect}</td></tr>`).join('');
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---- navigation ---- */
function view(v){
  if(st==='RUNNING'&&v!=='test')return;
  ['test','results','history'].forEach(s=>$('#'+s).hidden=s!==v);
  if(v==='history')history();
}
$$('[data-view]').forEach(b=>b.onclick=()=>{if(st==='RESULTS'||st==='COMPLETED'){if(b.dataset.view==='test'){view('test');load();return}}view(b.dataset.view)});
$('#again').onclick=$('#change').onclick=()=>{view('test');load()};
/* ---- font size (24-48 px) ---- */
let fs=28; try{fs=Math.min(48,Math.max(24,+localStorage.getItem('fsize')||28))}catch(e){}
function setFs(v){
  fs=v;$('#fsize').value=v;$('#fsval').textContent=v+' px';
  const el2=$('#view');el2.style.setProperty('--fs',v+'px');el2.style.setProperty('--lh',Math.round(v*1.7)+'px');
  try{localStorage.setItem('fsize',v)}catch(err){}
  scroll();
}
$('#fsize').oninput=e=>setFs(+e.target.value);
$('#fsize').onpointerup=e=>e.target.blur(); // return keyboard focus to the typing area
setFs(fs); sync(); load();
