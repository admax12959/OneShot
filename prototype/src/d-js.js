/* ===================== five modules ===================== */
const ENTER={}, LEAVE={};
const MINI=`<svg class="mini-mark" viewBox="0 0 512 512"><rect x="16" y="16" width="480" height="480" rx="120" fill="#CDEB18"/><path d="M256 132 A124 124 0 1 0 380 256" fill="none" stroke="#22231F" stroke-width="60" stroke-linecap="round"/><circle cx="343.68" cy="168.32" r="30" fill="#22231F"/></svg>`;
const mbR=()=>`<div class="r"><span class="mb-i mk tip-b" data-mb="os" data-pal data-tip="OneShot">${MINI}</span><span class="mb-i tip-b" data-mb="shot" data-tip="Screenshot">${ic('shot')}</span><span class="mb-i tip-b" data-mb="disp" data-tip="Displays">${ic('disp')}</span><span class="mb-i tip-b" data-mb="bat" data-tip="Battery">${ic('batt')}</span>${ic('wifi')}<span>Mon Oct 5 00:55</span></div>`;
$$('.menubar').forEach(m=>{
  if(m.dataset.app) m.innerHTML=`<b>${m.dataset.app}</b>${m.dataset.menus.split(',').map(x=>`<span>${x}</span>`).join('')}`+mbR();
  else { const r=$('.r',m); if(r) r.outerHTML=mbR(); }
});
function popPlace(pop,desk,key){
  const d=desk.getBoundingClientRect(), i=$(`.mb-i[data-mb="${key}"]`,desk).getBoundingClientRect();
  const w=pop.offsetWidth, cx=i.left+i.width/2-d.left;
  const left=Math.max(8,Math.min(cx-w/2,d.width-w-8));
  pop.style.left=left+'px'; pop.style.transformOrigin=`${cx-left}px -6px`;
}
function popOpen(pop,desk,key){popPlace(pop,desk,key);$(`.mb-i[data-mb="${key}"]`,desk).classList.add('on');pop.classList.remove('open');pop.offsetWidth;pop.classList.add('open')}
function popClose(pop,desk,key){pop.classList.remove('open');$(`.mb-i[data-mb="${key}"]`,desk).classList.remove('on')}
function slider(el,onv){
  el._sl=1;
  const set=e=>{const r=el.getBoundingClientRect();const v=Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*100);el.style.setProperty('--v',v);onv&&onv(v)};
  el.addEventListener('pointerdown',e=>{el.classList.remove('anim');el.setPointerCapture(e.pointerId);set(e);
    const mv=ev=>set(ev),up=()=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up)};
    el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up)});
}
function slTo(el,v){el.classList.add('anim');el.style.setProperty('--v',v)}
function countUp(el,to,ms=260){if(RM){el.textContent=to;return}const t0=performance.now();const f=t=>{const k=Math.min(1,(t-t0)/ms),e=1-Math.pow(1-k,3);el.textContent=Math.round(to*e);if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)}
document.addEventListener('click',e=>{const t=e.target.closest('.tog');if(t&&!t.dataset.own)t.classList.toggle('on')});

/* ---------- Battery ---------- */
const bat={v:64,l:80,on:true};
const batMins=t=>{const m=Math.round((t-bat.v)*2.4);return m>=60?`${Math.floor(m/60)} h ${m%60} min`:`${m} min`};
function batPaint(fillToo=true){
  ['#bpBar','#bmBar'].forEach(s=>{const b=$(s);if(fillToo)b.style.setProperty('--v',bat.v);b.style.setProperty('--l',bat.on?bat.l:100);b.classList.toggle('off',!bat.on)});
  $('#bpBar .lm span').textContent=bat.l;$('#bmLimLab').textContent=bat.l;$('#bmLimV').textContent=bat.l+'%';
  $('#bpSt span').textContent=bat.on?`${batMins(bat.l)} to ${bat.l}%`:`${batMins(100)} to full`;
  $('#bmSt').textContent=bat.on?`Charging · ${batMins(bat.l)} to ${bat.l}%, then hold`:`Charging · ${batMins(100)} to full`;
  $('#bpTog').classList.toggle('on',bat.on);$('#bmTog').classList.toggle('on',bat.on);
  const y=v=>(100-v)/80*100, lim=$('#bmChart .lim'), band=$('#bmChart .band');
  if(lim){lim.setAttribute('y1',y(bat.l));lim.setAttribute('y2',y(bat.l));band.setAttribute('y',y(bat.l));lim.style.opacity=band.style.opacity=bat.on?1:0;$('#bmChart .ylim').style.top=`calc((100% - 22px) * ${y(bat.l)/100})`;$('#bmChart .ylim').textContent=bat.l;$('#bmChart .ylim').style.opacity=bat.on?1:0}
}
['#bpTog','#bmTog'].forEach(s=>{$(s).dataset.own=1;$(s).addEventListener('click',()=>{bat.on=!bat.on;batPaint(false)})});
slider($('#bmLim'),v=>{bat.l=Math.round(50+v/2);batPaint(false)});
(function(){const bar=$('#bmBar'),g=$('#bmBar .grip');g.addEventListener('pointerdown',e=>{if(!bat.on)return;g.setPointerCapture(e.pointerId);bar.classList.add('drag');
  const mv=ev=>{const r=bar.getBoundingClientRect();bat.l=Math.round(Math.max(50,Math.min(100,(ev.clientX-r.left)/r.width*100)));$('#bmLim').style.setProperty('--v',(bat.l-50)*2);batPaint(false)};
  const up=()=>{g.removeEventListener('pointermove',mv);g.removeEventListener('pointerup',up);bar.classList.remove('drag')};g.addEventListener('pointermove',mv);g.addEventListener('pointerup',up)})})();
function batChart(){
  const D=[80,80,79,78,78,77,76,75,79,80,79,78,77,76,71,64,58,53,49,47,46,52,58,64];
  const X=i=>i/23*100, Y=v=>(100-v)/80*100;
  const pts=D.map((v,i)=>`${X(i).toFixed(2)} ${Y(v).toFixed(2)}`);
  const plugs=[[0,13.5],[20.6,23]];
  $('#bmChart').innerHTML=`<svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="gBat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18181B" stop-opacity=".035"/><stop offset="1" stop-color="#18181B" stop-opacity="0"/></linearGradient></defs>
  ${[100,50,20].map(v=>`<line class="grid" x1="0" x2="100" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}
  <path class="ar" d="M${pts.join(' L')} V100 H0Z"/>
  <rect class="band" x="0" width="100" y="${Y(80)}" height="${5/80*100}"/>
  ${plugs.map(([a,b])=>`<rect class="plug" x="${X(a)}" width="${X(b)-X(a)}" y="99" height="1" rx=".3"/>`).join('')}
  <line class="lim" x1="0" x2="100" y1="${Y(80)}" y2="${Y(80)}"/>
  <path class="ln" d="M${pts.join(' L')}"/></svg>
  ${[100,50,20].map(v=>`<span class="yl" style="top:calc((100% - 22px) * ${Y(v)/100})">${v}</span>`).join('')}<span class="yl ylim" style="top:calc((100% - 22px) * ${Y(80)/100});color:var(--ink-2)">80</span>
  ${[[0,'00:00'],[6,'06:00'],[12,'12:00'],[18,'18:00'],[23,'Now']].map(([h,t])=>`<span class="xl ${h===23?'end':''}" style="left:calc(30px + (100% - 30px) * ${X(h)/100})">${t}</span>`).join('')}
  <i class="nowdot" style="left:calc(30px + (100% - 30px) * 1);top:calc((100% - 22px) * ${Y(64)/100})"></i>`;
}
batChart();
seg($('#bmSeg'));seg($('#bmInt'));
async function batOpen(desk=$('#batDesk'),delay=220){
  bat.v=64;const pop=$('#batPop');
  if(pop.parentNode!==desk){pop.classList.remove('open');desk.appendChild(pop)}
  $('#bpBar').style.setProperty('--v',0);$('#bpNum').textContent='0';popClose(pop,desk,'bat');
  await wait(delay);popOpen(pop,desk,'bat');batPaint(false);
  await wait(120);$('#bpBar').style.setProperty('--v',bat.v);countUp($('#bpNum'),bat.v);
}
ENTER['battery-run']=()=>batOpen($('#batDesk'),220);
LEAVE['battery-run']=()=>popClose($('#batPop'),$('#batDesk'),'bat');
$('#batDesk').addEventListener('mousedown',e=>{const pop=$('#batPop');if(pop.contains(e.target))return;
  if(e.target.closest('.mb-i[data-mb="bat"]')||!pop.classList.contains('open')){pop.classList.contains('open')?popClose(pop,$('#batDesk'),'bat'):batOpen($('#batDesk'),0)}else popClose(pop,$('#batDesk'),'bat')});
ENTER['battery-mgmt']=async()=>{$('#bmBar').style.setProperty('--v',0);$('#bmNum').textContent='0';batPaint(false);await wait(140);$('#bmBar').style.setProperty('--v',bat.v);countUp($('#bmNum'),bat.v)};

/* ---------- Displays ---------- */
const DISP=[{id:'mbp',ic:'laptop',nm:'Built-in Display',sh:'Built-in',rs:'1512 × 982',spec:'3024 × 1964 · ProMotion',b:72,x:46,y:156,w:150,h:97,on:1},
  {id:'sd',ic:'disp',nm:'Studio Display',sh:'Studio Display',rs:'2560 × 1440',spec:'5120 × 2880 · 60 Hz',b:55,x:0,y:21,w:236,h:133,main:1,on:1},
  {id:'dell',ic:'portrait',nm:'U2723QE',sh:'U2723QE',rs:'1440 × 2560',spec:'3840 × 2160 · Portrait',b:40,x:238,y:0,w:96,h:170,on:0}];
const PRESETS=[['sun','Day','Brightness 70 · True Tone',[72,70,60]],['moonstar','Night','Brightness 30 · Warm',[30,28,22]],['film','Cinema','Brightness 45 · Gamma 2.4',[40,45,20]],['cast','Mirror','Mirrored · 1080p',[80,80,0]]];
const MIC='style="--c:#2F6FDB;--cf:#fff"';
let dispLink=true, dispNight=false, dsSel=1;
$('#dpList').innerHTML=DISP.map((d,k)=>`<div class="dp-d stg ${d.on?'':'off'}" style="--i:${k+1}" data-k="${k}"><div class="dp-h"><button class="mic ${d.on?'on':''}" data-k="${k}" ${MIC} aria-label="${d.nm}">${ic(d.ic)}</button><span class="nm">${d.nm}</span></div><div class="slr">${ic('sundim','ic s')}<div class="sl" data-k="${k}" style="--v:${d.b}"><i class="tr"></i><i class="fl"></i><i class="kn"></i></div><span class="val">${d.b}</span></div></div>`).join('');
$('#dpPre').innerHTML=PRESETS.map(([i,n],k)=>`<button class="pchip tip-t ${k==0?'on':''}" data-k="${k}" data-tip="${n}" aria-label="${n}">${ic(i,'ic l')}</button>`).join('');
$('#dispPhoto').innerHTML=thumb('photo').replace('<svg ','<svg style="width:100%;height:100%;display:block;transition:filter 260ms" id="dispImg" ');
function dispFilter(){const img=$('#dispImg');if(!img)return;const b=(.82+DISP[1].b*.0034).toFixed(3),f=`brightness(${b})`+(dispNight?' sepia(.28) saturate(1.15) hue-rotate(-10deg)':'');img.style.filter=f;
  const host=$('#dispPop').parentNode;$$('.desk').forEach(d=>$$(':scope>.docwin,:scope>.vwin,:scope>.bwin',d).forEach(w=>{w.style.transition='filter 260ms';w.style.filter=(d===host&&d.id!=='dispDesk')?f:''}))}
function dispSet(k,v,anim){DISP[k].b=Math.max(0,Math.min(100,v));const el=$(`#dpList .sl[data-k="${k}"]`);anim?slTo(el,DISP[k].b):el.style.setProperty('--v',DISP[k].b);el.parentNode.querySelector('.val').textContent=DISP[k].b;
  if(k===1)dispFilter()}
$$('#dpList .sl').forEach(el=>{const k=+el.dataset.k;slider(el,v=>{const d=v-DISP[k].b;dispSet(k,v);if(dispLink)DISP.forEach((x,j)=>{if(j!==k&&x.on)dispSet(j,x.b+d)});$$('#dpPre .pchip').forEach(c=>c.classList.remove('on'))})});
$('#dpList').addEventListener('click',e=>{const m=e.target.closest('.mic');if(!m)return;const k=+m.dataset.k,d=DISP[k];d.on=d.on?0:1;m.classList.toggle('on',!!d.on);m.closest('.dp-d').classList.toggle('off',!d.on)});
$('#dpLink').addEventListener('click',()=>{dispLink=!dispLink;$('#dpLink').classList.toggle('on',dispLink)});
$('#dpNight').addEventListener('click',()=>{dispNight=!dispNight;$('#dpNight').classList.toggle('on',dispNight);dispFilter()});
$('#dpPre').addEventListener('click',e=>{const c=e.target.closest('.pchip');if(!c)return;$$('#dpPre .pchip').forEach(x=>x.classList.toggle('on',x===c));PRESETS[+c.dataset.k][3].forEach((v,k)=>dispSet(k,v,true))});
dispSet(1,DISP[1].b);
async function dispOpen(desk=$('#dispDesk'),delay=220){const pop=$('#dispPop');if(pop.parentNode!==desk){pop.classList.remove('open');desk.appendChild(pop);dispFilter()}popClose(pop,desk,'disp');const keep=DISP.map(d=>d.b);$$('#dpList .sl').forEach(el=>{el.classList.remove('anim');el.style.setProperty('--v',0)});
  await wait(delay);popOpen(pop,desk,'disp');await wait(140);keep.forEach((v,k)=>dispSet(k,v,true))}
ENTER['display-run']=()=>dispOpen($('#dispDesk'),220);
LEAVE['display-run']=()=>popClose($('#dispPop'),$('#dispDesk'),'disp');
$('#dispDesk').addEventListener('mousedown',e=>{const pop=$('#dispPop');if(pop.contains(e.target))return;pop.classList.contains('open')?popClose(pop,$('#dispDesk'),'disp'):dispOpen($('#dispDesk'),0)});
/* Settings */
const arr=$('#arr'), AS=1.32; let arrO={x:0,y:0};
arr.insertAdjacentHTML('beforeend',DISP.map((d,k)=>`<div class="mon ${k===dsSel?'sel':''}" data-k="${k}" style="--i:${k}">${d.main?'<i class="mbar"></i>':''}${ic(d.ic,'ic s')}<b>${d.sh}</b><span>${d.rs}</span></div>`).join(''));
function arrLay(){const W=arr.clientWidth,H=arr.clientHeight;if(!W)return;const gw=Math.max(...DISP.map(d=>d.x+d.w))*AS,gh=Math.max(...DISP.map(d=>d.y+d.h))*AS;
  arrO={x:Math.round((W-gw)/2),y:Math.round((H-gh)/2)-10};
  $$('#arr .mon').forEach(m=>{const d=DISP[+m.dataset.k];Object.assign(m.style,{left:arrO.x+d.x*AS+'px',top:arrO.y+d.y*AS+'px',width:d.w*AS+'px',height:d.h*AS+'px'})})}
$('#pres').innerHTML=PRESETS.map(([i,n,s],k)=>`<button class="pr stg auto tip-t ${k==0?'on':''}" style="--i:${k+2}" data-k="${k}" data-tip="${s}"><span class="mic">${ic(i)}</span>${n}</button>`).join('')+`<button class="pr add stg auto tip-t" style="--i:6" data-tip="Save Preset">${ic('plus')}</button>`;
$('#pres').addEventListener('click',e=>{const p=e.target.closest('.pr[data-k]');if(!p)return;$$('#pres .pr').forEach(x=>x.classList.toggle('on',x===p));const v=PRESETS[+p.dataset.k][3][dsSel];slTo($('#dsBri'),v);$('#dsBriV').textContent=v;DISP[dsSel].b=v});
function dsShow(k){dsSel=k;const d=DISP[k];$$('#arr .mon').forEach(m=>m.classList.toggle('sel',+m.dataset.k===k));
  const side=$('#dsSide');side.animate?.([{opacity:.4,transform:'translateY(3px)'},{opacity:1,transform:'none'}],{duration:200,easing:'cubic-bezier(.16,1,.3,1)'});
  $('#dsName').textContent=d.nm;$('#dsSpec').textContent=d.spec;$('#dsIc use').setAttribute('href','#i-'+d.ic);$('#dsMain').classList.toggle('no',!d.main);slTo($('#dsBri'),d.b);$('#dsBriV').textContent=d.b}
let drag=null;
arr.addEventListener('pointerdown',e=>{const m=e.target.closest('.mon');if(!m)return;const k=+m.dataset.k;if(k!==dsSel)dsShow(k);
  drag={m,k,sx:e.clientX,sy:e.clientY,x:m.offsetLeft,y:m.offsetTop};m.setPointerCapture(e.pointerId);m.classList.add('dragging')});
arr.addEventListener('pointermove',e=>{if(!drag)return;drag.m.style.left=(drag.x+e.clientX-drag.sx)+'px';drag.m.style.top=(drag.y+e.clientY-drag.sy)+'px'});
arr.addEventListener('pointerup',()=>{if(!drag)return;const d=DISP[drag.k];d.x=(drag.m.offsetLeft-arrO.x)/AS;d.y=(drag.m.offsetTop-arrO.y)/AS;drag.m.classList.remove('dragging');drag=null});
addEventListener('resize',()=>{if(cur==='display-mgmt')arrLay()});
const SCALES=['1920 × 1080','2048 × 1152','2304 × 1296','2560 × 1440','2880 × 1620','3200 × 1800','3840 × 2160'];
slider($('#dsScale'),v=>{$('#dsScaleV').textContent=SCALES[Math.round(v/100*6)]});
slider($('#dsBri'),v=>{$('#dsBriV').textContent=v;DISP[dsSel].b=v});
$$('#dsPic .sl').forEach(el=>slider(el,()=>{$('#dsPicV').textContent='Custom'}));
$('#dsDisc').addEventListener('click',()=>{const b=$('#dsDisc'),g=$('#dsPic'),open=b.classList.toggle('open'),h=g.scrollHeight;
  if(open){g.style.height=h+'px';setTimeout(()=>{if(b.classList.contains('open'))g.style.height='auto'},260)}else{g.style.height=h+'px';g.offsetHeight;g.style.height='0px'}});
ENTER['display-mgmt']=()=>{arrLay()};

/* ---------- JSON ---------- */
function jsonLines(v,opt={}){
  const lines=[],paths={},sp=n=>'  '.repeat(n);
  const val=x=>x===null?'<span class="b">null</span>':typeof x==='boolean'?`<span class="b">${x}</span>`:typeof x==='number'?`<span class="n">${x}</span>`:`<span class="s">"${esc(x)}"</span>`;
  (function walk(x,ind,pre,path,last){
    const cm=last?'':'<span class="p">,</span>';
    if(x&&typeof x==='object'){const A=Array.isArray(x);let es=A?x.map((y,i)=>[i,y]):Object.entries(x);if(opt.sort&&!A)es=[...es].sort((a,b)=>a[0]<b[0]?-1:1);
      const s=lines.length;lines.push(sp(ind)+pre+`<span class="p">${A?'[':'{'}</span>`);
      es.forEach(([k,y],i)=>walk(y,ind+1,A?'':`<span class="k">"${k}"</span><span class="p">:</span> `,path.concat(k),i===es.length-1));
      lines.push(sp(ind)+`<span class="p">${A?']':'}'}</span>`+cm);paths[path.join('.')]=[s,lines.length-1];
    }else{paths[path.join('.')]=[lines.length,lines.length];lines.push(sp(ind)+pre+val(x)+cm)}
  })(v,0,'',[],true);
  return {lines,paths};
}
const hlMin=s=>esc(s).replace(/(&quot;|")((?:[^"\\]|\\.)*?)\1(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b|([{}\[\],:])/g,(m,q,str,col,num,lit,pun)=>str!==undefined?(col?`<span class="k">"${str}"</span><span class="p">:</span>`:`<span class="s">"${str}"</span>`):num!==undefined?`<span class="n">${num}</span>`:lit?`<span class="b">${lit}</span>`:`<span class="p">${pun}</span>`);
const JRUN={event:'refund.succeeded',id:'evt_8KQ2M1',created:'2026-10-04T23:12:04+08:00',order:{orderId:'A-1042',currency:'CNY',total:2480,paid:true},refund:{amount:0,reason:null,operator:'yu.weijie'}};
const jStats=o=>{let k=0,d=0;(function w(x,l){if(x&&typeof x==='object'){d=Math.max(d,l);for(const [kk,v] of Object.entries(x)){if(!Array.isArray(x))k++;w(v,l+1)}}})(o,1);return `${d} levels · ${k} keys`};
let jMode='pretty';
function jRender(mode,pop,grow){
  const cb=$('#jcb'),h0=cb.offsetHeight,one=mode==='min'||mode==='raw';
  let ls;if(mode==='raw')ls=[`<span class="selt">${hlMin(JSON.stringify(JRUN))}</span>`];else if(mode==='min')ls=[hlMin(JSON.stringify(JRUN))];else ls=jsonLines(JRUN,{sort:mode==='sort'}).lines;
  cb.classList.toggle('one',one);
  cb.innerHTML=ls.map((l,i)=>`<div class="l ${pop?'fresh rise':''}" style="--i:${i}">${l}${i===ls.length-1?'<span class="caret" id="jCaret"></span>':''}</div>`).join('');
  if(grow&&!RM){cb.style.height='';const h1=cb.offsetHeight;cb.style.height=h0+'px';cb.offsetHeight;cb.style.height=h1+'px';clearTimeout(cb._t);cb._t=setTimeout(()=>cb.style.height='',320)}
  if(pop)setTimeout(()=>$$('#jcb .l').forEach(x=>x.classList.remove('fresh')),420);
}
function jPlace(){const d=$('#jsonDesk').getBoundingClientRect(),cb=$('#jcb'),c=$('#jCaret').getBoundingClientRect(),jp=$('#jp');
  if(cb.classList.contains('one')){const b=cb.getBoundingClientRect();jp.style.left=(b.left-d.left-9)+'px';jp.style.top=(c.bottom-d.top+10)+'px'}
  else{jp.style.left=(c.right-d.left+14)+'px';jp.style.top=(c.top+c.height/2-d.top-19)+'px'}}
let jTimer;
function jPill(){const jp=$('#jp');jp.classList.remove('on');jp.offsetWidth;jPlace();jp.classList.add('on');clearTimeout(jTimer);jTimer=setTimeout(()=>jp.classList.remove('on'),6000)}
$('#jpM').textContent=jStats(JRUN);
seg($('#jpSeg'),b=>{jMode=b.dataset.m;$('#jpT').textContent={pretty:'Formatted',min:'Minified',sort:'Sorted'}[jMode];jRender(jMode,true,true);jPlace();const jp=$('#jp');jp.classList.remove('on');jp.offsetWidth;jp.classList.add('on');clearTimeout(jTimer);jTimer=setTimeout(()=>jp.classList.remove('on'),6000)});
$('#jpUndo').addEventListener('click',()=>{$('#jp').classList.remove('on');clearTimeout(jTimer);jRender('raw',false,true)});
let jRun=0;
ENTER['json-run']=async(first)=>{const my=++jRun;$('#jp').classList.remove('on');clearTimeout(jTimer);jRender('raw',false,false);
  jMode='pretty';$('#jpT').textContent='Formatted';const s=$('#jpSeg');$$('button',s).forEach((b,i)=>b.classList.toggle('on',i===0));s._place();
  await wait(first?760:560);if(my!==jRun||cur!=='json-run')return;jRender('pretty',true,true);await wait(260);if(my!==jRun||cur!=='json-run')return;jPill()};
LEAVE['json-run']=()=>{jRun++;$('#jp').classList.remove('on');clearTimeout(jTimer)};
$('#jsonDesk').addEventListener('mousedown',e=>{if(e.target.closest('.jp'))return;ENTER['json-run']()});
/* Studio */
const JDOC={event:'refund.succeeded',id:'evt_8KQ2M1',order:{orderId:'A-1042',currency:'CNY',total:2480,paid:true},items:[{sku:'OS-PRO-1Y',qty:1,price:1980},{sku:'OS-SEAT',qty:2,price:250}],refund:{amount:0,reason:null,operator:'yu.weijie'}};
let JL=jsonLines(JDOC), stuMode='pretty';
let jSel='refund.amount';
$('#stuMark').innerHTML=MARK.replace('class="brand"','style="width:20px;height:20px;display:block"');
const stuSize=()=>{const t=stuMode==='min'?JSON.stringify(JDOC):JSON.stringify(JDOC,null,2);$('#stuSize').textContent=t.length+' B';$('#stuInd').textContent=stuMode==='min'?'Minified':'Spaces 2'};
stuSize();
function tyOf(x){return x===null?['null','z']:Array.isArray(x)?['brackets','a']:typeof x==='object'?['braces','o']:typeof x==='number'?['hash','n']:typeof x==='boolean'?['toggle','b']:['quote','s']}
function treeHTML(x,key,path,depth){
  const [t,c]=tyOf(x),isC=x&&typeof x==='object',p=path.join('.');
  const guides=Array.from({length:depth},(_,i)=>`<i class="gd" style="left:${15+i*18}px"></i>`).join('');
  const valH=isC?`<span class="cnt">${Array.isArray(x)?x.length:Object.keys(x).length}</span>`:`<span class="jx vv">${x===null?'<span class="b">null</span>':typeof x==='string'?`<span class="s">"${esc(x)}"</span>`:typeof x==='boolean'?`<span class="b">${x}</span>`:`<span class="n">${x}</span>`}</span>`;
  const keyH=key===null?'<span style="color:var(--ink-4)">$</span>':typeof key==='number'?`<span style="color:var(--ink-4)">${key}</span>`:`<span class="kk">${key}</span>`;
  const tipT={o:'Object',a:'Array',s:'String',n:'Number',b:'Boolean',z:'Null'}[c];
  let h=`<div class="tn ${p===jSel?'sel':''}" data-p="${p}" style="padding-left:${6+depth*18}px">${guides}<span class="tw">${isC?ic('chevd'):''}</span><span class="ty ${c}" title="${tipT}">${ic(t)}</span>${keyH}${valH}</div>`;
  if(isC)h+=`<div class="tgroup">${(Array.isArray(x)?x.map((y,i)=>[i,y]):Object.entries(x)).map(([k,y])=>treeHTML(y,Array.isArray(x)?+k:k,path.concat(k),depth+1)).join('')}</div>`;
  return h;
}
$('#tree').innerHTML=treeHTML(JDOC,null,[],0);
function txtRender(flash){const t=$('#txt');
  if(stuMode==='min'){t.innerHTML=`<div class="cl wrap"><span class="ln">1</span><span>${hlMin(JSON.stringify(JDOC))}<span class="caret"></span></span></div>`}
  else{const [a,b]=JL.paths[jSel]||[-1,-1];t.innerHTML=JL.lines.map((l,i)=>`<div class="cl ${i>=a&&i<=b?'hl':''}" style="--i:${i}"><span class="ln">${i+1}</span><span>${l}${i===b?'<span class="caret"></span>':''}</span></div>`).join('')}
  if(flash&&!RM){t.classList.remove('flash');t.offsetWidth;t.classList.add('flash')}
  $('#stuPath').innerHTML=['$',...jSel.split('.').filter(Boolean)].map((s,i)=>(i?ic('chevr'):'')+`<span>${s}</span>`).join('')}
txtRender();
$('#tree').addEventListener('click',e=>{const n=e.target.closest('.tn');if(!n)return;
  if(e.target.closest('.tw')&&n.nextElementSibling?.classList.contains('tgroup')){const g=n.nextElementSibling,closed=n.classList.toggle('closed');const h=g.scrollHeight;
    if(closed){g.style.height=h+'px';g.offsetHeight;g.style.height='0px'}else{g.style.height='0px';g.offsetHeight;g.style.height=h+'px';setTimeout(()=>g.style.height='',220)}return}
  jSel=n.dataset.p;$$('#tree .tn').forEach(x=>x.classList.toggle('sel',x===n));txtRender()});
seg($('#stuView'),b=>{$('#stuSplit').className='split'+(b.dataset.v==='split'?'':' v-'+b.dataset.v)});
$('#stuActs').addEventListener('click',e=>{const b=e.target.closest('button[data-a]');if(!b)return;$$('#stuActs button').forEach(x=>x.classList.toggle('on',x===b));
  stuMode=b.dataset.a;JL=jsonLines(JDOC,{sort:stuMode==='sort'});stuSize();txtRender(true)});
$('#stuMore').addEventListener('click',e=>{e.stopPropagation();$('#stuMoreW').classList.toggle('open')});
$('#stuMenu').addEventListener('click',()=>$('#stuMoreW').classList.remove('open'));
document.addEventListener('mousedown',e=>{if(!e.target.closest('#stuMoreW'))$('#stuMoreW').classList.remove('open')});
ENTER['json-mgmt']=()=>{$('#stuMoreW').classList.remove('open');const rows=$$('#tree .tn');if(RM)return;rows.forEach((r,i)=>r.animate([{opacity:0,transform:'translateY(-3px)'},{opacity:1,transform:'none'}],{duration:220,delay:40+i*12,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));
  $$('#txt .cl').forEach((r,i)=>r.animate([{opacity:0},{opacity:1}],{duration:200,delay:80+i*8,easing:'ease',fill:'backwards'}))};

/* ---------- Password ---------- */
const VRUN=[{t:'Yike Cloud · Console',u:'yu.weijie@yike.app',c:'#2F6FDB',l:'Y'},{t:'Yike Cloud · Ops',u:'ops-admin',c:'#3C4A5C',l:'O'},{t:'Yike Cloud · Read-only',u:'readonly@yike.app',c:'#8A94A6',l:'R'}];
$('#apList').insertAdjacentHTML('beforeend',VRUN.map((e,i)=>`<div class="er" data-i="${i}" style="--i:${i}"><span class="fav" style="background:${e.c}">${e.l}</span><span><b>${e.t}</b><small>${e.u}</small></span><span class="end">${ic('enter','ic s')}</span></div>`).join(''));
let apSel=0,apBusy=false;
function apPaint(){$$('#apList .er').forEach((r,i)=>r.classList.toggle('sel',i===apSel));$('#apHl').style.transform=`translateY(${apSel*52}px)`}
function apPlace(){const d=$('#vaultDesk').getBoundingClientRect(),f=$('#vU').getBoundingClientRect(),ap=$('#ap');ap.style.left=(f.left-d.left-4)+'px';ap.style.top=(f.bottom-d.top+8)+'px'}
async function apOpen(){const ap=$('#ap');ap.className='ap';$('#vUt').textContent='';$('#vPt').textContent='';$('#vU').classList.add('focus');$('#vP').classList.remove('focus');$('#vU').appendChild($('#vCaret'));apSel=0;apPaint();apPlace();
  ap.offsetWidth;ap.classList.add('open');await wait(120);ap.classList.add('reading');await wait(600);ap.classList.add('ready')}
async function apFill(){if(apBusy)return;apBusy=true;const e=VRUN[apSel],ap=$('#ap');$('#apHl').classList.add('flash');await wait(90);$('#apHl').classList.remove('flash');ap.classList.remove('open');await wait(160);
  for(const ch of e.u){$('#vUt').textContent+=ch;await wait(18)}
  $('#vU').classList.remove('focus');$('#vP').classList.add('focus');$('#vP').appendChild($('#vCaret'));
  for(let i=0;i<14;i++){$('#vPt').textContent+='•';await wait(22)}
  await wait(120);$('#vGo').classList.add('press');await wait(140);$('#vGo').classList.remove('press');$('#vP').classList.remove('focus');
  $('#vToast').classList.add('on');await wait(2600);$('#vToast').classList.remove('on');apBusy=false}
$('#apList').addEventListener('mousemove',e=>{const r=e.target.closest('.er');if(r&&+r.dataset.i!==apSel){apSel=+r.dataset.i;apPaint()}});
$('#apList').addEventListener('click',e=>{if(e.target.closest('.er'))apFill()});
$('#vaultDesk').addEventListener('mousedown',e=>{if(e.target.closest('.ap')||apBusy)return;const ap=$('#ap');ap.classList.contains('open')?ap.classList.remove('open'):apOpen()});
ENTER['vault-run']=async()=>{$('#ap').className='ap';await wait(260);apOpen()};
LEAVE['vault-run']=()=>{$('#ap').className='ap'};
/* Vault */
const GROUPS=[['layers','All',128],['star','Favorites',9],['brief','Work',46,1],[null,'Yike Cloud',12,0,'#2F6FDB'],[null,'GitHub',5,0,'#2B2B2F'],['user','Personal',31],['server','Servers',18],['card','Cards',6],['trash','Trash',3]];
$('#groups').innerHTML=GROUPS.map(([i,n,c,on,dc])=>i?`<div class="gr ${on?'on':''}">${ic(i)}<span>${n}</span><span class="c">${c}</span></div>`:`<div class="gr sub"><i class="dotc" style="background:${dc}"></i><span>${n}</span><span class="c">${c}</span></div>`).join('');
$('#groups').addEventListener('click',e=>{const g=e.target.closest('.gr');if(g)$$('#groups .gr').forEach(x=>x.classList.toggle('on',x===g))});
const VENT=[
  {t:'Yike Cloud · Console',url:'console.yike.cloud',u:'yu.weijie@yike.app',c:'#2F6FDB',l:'Y',m:'Today',otp:1,tags:['Work','Prod'],note:'East China 2 primary. Sub-accounts via RAM — not stored here.',str:5},
  {t:'GitHub',url:'github.com',u:'weijie-yu',c:'#24292F',l:'G',m:'Yesterday',otp:1,tags:['Work','Code'],note:'Personal access tokens live in the Servers group.',str:5},
  {t:'Figma',url:'figma.com',u:'yu.weijie@yike.app',c:'#F24E1E',l:'F',m:'Sep 28',tags:['Design'],note:'Team seat, billed yearly.',str:4},
  {t:'Linear',url:'linear.app',u:'yu.weijie@yike.app',c:'#5E6AD2',l:'L',m:'Sep 26',tags:['Work'],note:'Not needed when signing in with Google.',str:4},
  {t:'Feishu',url:'feishu.cn',u:'138 •••• 2046',c:'#3370FF',l:'F',m:'Sep 20',otp:1,tags:['Work'],note:'',str:3},
  {t:'Apple Developer',url:'developer.apple.com',u:'dev@yike.app',c:'#1D1D1F',l:'A',m:'Sep 12',otp:1,tags:['Release'],note:'Used for notarization and App Store release.',str:5},
  {t:'Aliyun RAM',url:'signin.aliyun.com',u:'deploy-bot',c:'#FF6A00',l:'A',m:'Aug 30',tags:['Servers','Prod'],note:'Pipeline only; rotate every 90 days.',str:5},
  {t:'Sentry',url:'sentry.io',u:'yu.weijie@yike.app',c:'#362D59',l:'S',m:'Aug 2',tags:['Work'],note:'',str:3},
];
let vSel=0;
$('#ents').innerHTML=VENT.map((e,i)=>`<div class="en ${i===vSel?'sel':''}" data-i="${i}"><span class="fav" style="background:${e.c}">${e.l}</span><span class="t"><b>${e.t}</b><small>${e.url}</small></span><span class="u">${e.u}</span><span class="m">${e.otp?`<span class="tip-t" data-tip="One-time password">${ic('clock')}</span>`:''}${e.m}</span></div>`).join('');
function vDetail(){const e=VENT[vSel];
  $('#vd2').innerHTML=`<div class="top"><span class="fav l" style="background:${e.c}">${e.l}</span><div><b>${e.t}</b><small>${e.url}</small></div><span class="sp"><button class="ibtn tip-b" data-tip="Favorites">${ic('star')}</button><button class="ibtn tip-b" data-tip="Edit">${ic('pen')}</button></span></div>
  <div class="fl2">${ic('user')}<div class="v"><small>Username</small><span>${e.u}</span></div><div class="acts"><button class="ibtn tip-t" data-tip="Concealed paste · not in history">${ic('copy','ic s')}</button></div></div>
  <div class="fl2">${ic('key')}<div class="v"><small>Password</small><span class="dots">••••••••••••</span><div class="strength">${[1,2,3,4,5].map(n=>`<i class="${n>e.str?'off':''}"></i>`).join('')}</div></div><div class="acts"><button class="ibtn tip-t" data-tip="Concealed paste · not in history">${ic('copy','ic s')}</button></div></div>
  ${e.otp?`<div class="fl2">${ic('clock')}<div class="v"><small>One-time password</small><span class="dots">••• •••</span></div><div class="acts" style="align-items:center;gap:6px"><span class="totp"><svg viewBox="0 0 22 22"><circle class="bg" cx="11" cy="11" r="9"/><circle class="fg" cx="11" cy="11" r="9"/></svg></span><button class="ibtn tip-t" data-tip="Concealed paste · not in history">${ic('copy','ic s')}</button></div></div>`:''}
  <div class="fl2">${ic('globe')}<div class="v"><small>URL</small><span>https://${e.url}</span></div><div class="acts"><button class="ibtn tip-t" data-tip="Open">${ic('expand','ic s')}</button></div></div>
  <div class="fl2" style="box-shadow:none">${ic('hash')}<div class="v"><div class="tags">${e.tags.map(t=>`<span>${t}</span>`).join('')}</div></div><span></span></div>
  ${e.note?`<div class="note">${e.note}</div>`:''}
  <div class="act"><button class="btn pri wide">${ic('kbd')}Autofill<kbd>⌘⇧V</kbd></button></div>`}
vDetail();
$('#ents').addEventListener('click',async e=>{const r=e.target.closest('.en');if(!r||+r.dataset.i===vSel)return;vSel=+r.dataset.i;$$('#ents .en').forEach(x=>x.classList.toggle('sel',x===r));const d=$('#vd2');d.classList.add('swap');await wait(130);vDetail();d.classList.remove('swap')});
ENTER['vault-mgmt']=()=>{if(RM)return;$$('#ents .en').forEach((r,i)=>r.animate([{opacity:0,transform:'translateY(-3px)'},{opacity:1,transform:'none'}],{duration:240,delay:40+i*20,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}))};

/* ---------- Canvas ---------- */
$('#cvMark').innerHTML=MARK.replace('class="brand"','class="brand" style="display:block"');
const TOOLS=[['cursor','Select'],['hand','Hand'],null,['pen','Pen'],['eraser','Eraser'],['arrow','Arrow'],['type','Text'],['sticky','Sticky'],null,['rect','Rect'],['ellipse','Ellipse'],['diamond','Diamond'],['image','Image']];
(function(){let h='<div class="tools"><span class="knob"></span>',idx=0;TOOLS.forEach(t=>{if(!t){h+='</div><span class="vbar"></span><div class="tools">';return}h+=`<button class="tb-i tip-t ${idx===0?'on':''}" data-tip="${t[1]}" data-n="${idx++}">${ic(t[0],'ic l')}</button>`});
  $('#shelf').innerHTML=h+'</div><span class="vbar"></span><button class="tb-i tip-t" data-tip="More">'+ic('more','ic l')+'</button>';
  $('#shelf').addEventListener('click',e=>{const b=e.target.closest('.tools .tb-i');if(!b)return;$$('#shelf .tools .tb-i').forEach(x=>x.classList.toggle('on',x===b));
    const knob=$('#shelf .knob'),grp=b.parentNode;if(knob.parentNode!==grp){grp.prepend(knob);knob.style.transition='none';knob.style.transform=`translateX(${b.offsetLeft}px)`;knob.offsetWidth;knob.style.transition=''}knob.style.transform=`translateX(${b.offsetLeft}px)`});
})();
const COLORS=['#18181B','#8E8E93','#F0453A','#F08C2B','#E8C21C','#2E9D62','#2F6FDB','#7B5BE0','#D25FA8','#3BB0C9','#A3B814','#C9C9CF'];
$('#stylep').innerHTML=`<div class="colors">${COLORS.map((c,i)=>`<button class="${i==0?'on':''}"><i style="background:${c}"></i></button>`).join('')}</div>
<div class="prow"><button class="on tip-t" data-tip="None">${ic('fillno')}</button><button class="tip-t" data-tip="Semi">${ic('fillsemi')}</button><button class="tip-t" data-tip="Solid">${ic('fillsolid')}</button></div>
<div class="prow"><button class="on tip-t" data-tip="Solid">${ic('solid')}</button><button class="tip-t" data-tip="Dashed">${ic('dash')}</button><button class="tip-t" data-tip="Dotted">${ic('dot3')}</button></div>
<div class="prow"><button class="tip-t" data-tip="Thin"><i class="ln1"></i></button><button class="on tip-t" data-tip="Medium"><i class="ln2"></i></button><button class="tip-t" data-tip="Thick"><i class="ln3"></i></button></div>`;
$('#stylep').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('button',b.parentNode).forEach(x=>x.classList.toggle('on',x===b))});
const board=$('#board');
board.innerHTML=`<svg class="wires" id="wires"></svg>
<div class="shp cv-title" style="left:84px;top:96px;--d:0ms">Release Flow<small>OneShot 2.4 · Oct</small></div>
<div class="shp node" id="n1" style="left:96px;top:282px;--d:60ms">${ic('diff')}Open PR</div>
<div class="shp node" id="n2" style="left:312px;top:282px;--d:100ms">${ic('okc')}CI green</div>
<div class="shp node dia" id="n3" style="left:540px;top:252px;--d:140ms"><span>Metrics OK</span></div>
<div class="shp node" id="n4" style="left:770px;top:282px;--d:180ms">${ic('share')}Full rollout</div>
<div class="shp node soft" id="n5" style="left:556px;top:470px;--d:200ms">${ic('undo')}Rollback</div>
<div class="shp cv-note" id="cvNote" style="left:660px;top:196px;--d:700ms">Watch refund rate</div>
<div class="shp sticky" style="left:118px;top:446px;--d:220ms">Thu 3:00 PM<br>Walk release checklist<br><span style="opacity:.6">@Product @QA</span></div>
<div class="shp" style="left:860px;top:430px;--d:260ms"><div class="cv-img">${thumb('dash').replace('preserveAspectRatio="xMidYMid slice"','')}</div><div class="cv-cap">${ic('shot','ic s')}Sept revenue · shot</div></div>
<div class="selbox" id="cvSel"><i></i><i></i><i></i><i></i></div>`;
function cvWires(animate){
  const B=id=>{const e=$('#'+id);return {x:e.offsetLeft,y:e.offsetTop,w:e.offsetWidth,h:e.offsetHeight}};
  const n1=B('n1'),n2=B('n2'),n3=B('n3'),n4=B('n4'),n5=B('n5');
  const cy=o=>o.y+o.h/2, cx=o=>o.x+o.w/2;
  const head=(x,y,a)=>{const l=9;return `M${x-l*Math.cos(a-.5)} ${y-l*Math.sin(a-.5)} L${x} ${y} L${x-l*Math.cos(a+.5)} ${y-l*Math.sin(a+.5)}`};
  const segs=[[n1.x+n1.w+8,cy(n1),n2.x-10,cy(n2)],[n2.x+n2.w+8,cy(n2),n3.x+12,cy(n3)],[n3.x+n3.w-12,cy(n3),n4.x-10,cy(n4)],[cx(n3),n3.y+n3.h-12,cx(n3),n5.y-10]];
  let h='';segs.forEach(([x1,y1,x2,y2],i)=>{const a=Math.atan2(y2-y1,x2-x1),len=Math.hypot(x2-x1,y2-y1),d=animate?400+i*90:0;
    h+=`<path class="w ${animate?'draw':''}" d="M${x1} ${y1} L${x2} ${y2}" style="--len:${len};--d:${d}ms"/><path class="w ${animate?'draw':''}" d="${head(x2,y2,a)}" style="--len:20;--d:${d+200}ms"/>`});
  h+=`<text x="${(n3.x+n3.w-12+n4.x)/2-6}" y="${cy(n3)-10}" font-size="12" fill="#A8A8AE" font-family="inherit">Yes</text><text x="${cx(n3)+10}" y="${(n3.y+n3.h+n5.y)/2+4}" font-size="12" fill="#A8A8AE" font-family="inherit">No</text>`;
  const ex=cx(n3),ey=cy(n3),rx=n3.w/2+14,ry=n3.h/2+8;
  const circ=`M${ex+rx} ${ey-6} C${ex+rx+4} ${ey+ry*.8} ${ex-rx*.4} ${ey+ry+6} ${ex-rx} ${ey+8} C${ex-rx-6} ${ey-ry*.7} ${ex+rx*.2} ${ey-ry-8} ${ex+rx+2} ${ey-ry*.35}`;
  h+=`<path class="w hand ${animate?'draw':''}" id="cvCirc" d="${circ}" style="--len:600;--d:620ms"/>`;
  $('#wires').innerHTML=h;
  const L=$('#cvCirc').getTotalLength();$('#cvCirc').style.setProperty('--len',L);
  $('#cvNote').style.left=(ex+rx-4)+'px';$('#cvNote').style.top=(ey-ry-26)+'px';
  Object.assign($('#cvSel').style,{left:(n4.x-6)+'px',top:(n4.y-6)+'px',width:(n4.w+12)+'px',height:(n4.h+12)+'px'});
}
ENTER['canvas']=()=>{cvWires(true)};
let cvDrag=null;
board.addEventListener('pointerdown',e=>{const s=e.target.closest('.shp');if(!s)return;cvDrag={s,sx:e.clientX,sy:e.clientY,x:s.offsetLeft,y:s.offsetTop};s.setPointerCapture(e.pointerId);s.style.transitionDelay='0ms'});
board.addEventListener('pointermove',e=>{if(!cvDrag)return;cvDrag.s.style.left=(cvDrag.x+e.clientX-cvDrag.sx)+'px';cvDrag.s.style.top=(cvDrag.y+e.clientY-cvDrag.sy)+'px';cvWires(false)});
board.addEventListener('pointerup',()=>{cvDrag=null});

/* ===================== wired product: one desktop, four layers ===================== */
const POPS={bat:$('#batPop'),disp:$('#dispPop')}, NATIVE={batPop:'batDesk',dispPop:'dispDesk'};
const toastEl=$('#toast'), pal=$('#pal');
const curDesk=()=>{const v=document.getElementById(cur);return v?$('.desk',v):null};
function popShut(k){const p=POPS[k];if(p.classList.contains('open'))popClose(p,p.parentNode,k)}
function popToggle(k,desk){const p=POPS[k];
  if(p.parentNode===desk&&p.classList.contains('open')){popClose(p,desk,k);return}
  popShut(k==='bat'?'disp':'bat'); if(desk.id==='clipDesk') cpHide();
  if(cap.parentNode===desk&&cap.classList.contains('live')) capClose(false);
  (k==='bat'?batOpen:dispOpen)(desk,0)}

/* rail: product map */
const RAIL=[['clip','Clipboard','#clip-mgmt'],['shot','Screenshot History','#shot-mgmt'],0,['canvas','Canvas','#canvas'],['braces','JSON Studio','#json-mgmt'],['key','Vault','#vault-mgmt'],0,['bat','Battery','#battery-mgmt'],['disp','Displays','#display-mgmt']];
$$('.rail').forEach(r=>{const c=r.dataset.rail;
  r.innerHTML=`<button class="brandb" data-tip="Desktop" data-href="#home">${MARK}</button>`+RAIL.map(x=>x?`<button class="${x[0]===c?'on':''}" data-tip="${x[1]}" data-href="${x[2]}">${ic(x[0],'ic l')}</button>`:'<span class="div"></span>').join('')+`<span class="gap"></span><button data-tip="Preferences">${ic('gear','ic l')}</button>`});
['#stuMark','#cvMark'].forEach(s=>{const m=$(s);m.dataset.pal='';m.dataset.tip='OneShot';m.classList.add('tip-b','palm')});

/* OneShot palette */
let palAnchor=null;
function palOpen(a){palAnchor=a;const r=a.getBoundingClientRect(),w=272;
  pal.style.left=Math.max(8,Math.min(r.left+r.width/2-36,innerWidth-w-8))+'px';pal.style.top=(r.bottom+7)+'px';
  pal.style.transformOrigin=`${r.left+r.width/2-parseFloat(pal.style.left)}px -6px`;
  $$('.pal-win [data-go]').forEach(b=>{b.classList.toggle('here',b.dataset.go==='#'+cur);b.hidden=(b.dataset.go==='#home'&&cur==='home')});
  $$('.mb-i[data-mb="os"]').forEach(x=>x.classList.remove('on'));if(a.classList.contains('mb-i'))a.classList.add('on');
  pal.classList.remove('open');pal.offsetWidth;pal.classList.add('open')}
function palClose(){if(!pal.classList.contains('open'))return;pal.classList.remove('open');$$('.mb-i[data-mb="os"]').forEach(x=>x.classList.remove('on'))}
function palToggle(a){pal.classList.contains('open')&&palAnchor===a?palClose():palOpen(a)}
pal.addEventListener('click',async e=>{const g=e.target.closest('[data-go]'),r=e.target.closest('[data-run]');if(!g&&!r)return;palClose();
  if(g){location.hash=g.dataset.go;return}
  const k=r.dataset.run,desk=curDesk();await wait(120);
  if(k==='clip'){ if(desk&&desk.id==='clipDesk'){popShut('bat');popShut('disp');cpShow()} else location.hash='#clip-run'; }
  else if(k==='shot'){ desk?shotIn(desk):(location.hash='#shot-run'); }
  else if(k==='json') location.hash='#json-run';
  else if(k==='vault') location.hash='#vault-run';});

/* menubar: same entries on every desk */
document.addEventListener('mousedown',e=>{const t=e.target;
  if(t.closest('.menubar .mb-i')||t.closest('[data-pal]')){e.stopPropagation();return}
  if(pal.classList.contains('open')&&!pal.contains(t)){palClose();if(t.closest('.desk'))e.stopPropagation();return}
  const desk=t.closest('.desk');if(!desk)return;
  if(cap.parentNode===desk&&desk.id!=='shotDesk'&&cap.classList.contains('live')){e.stopPropagation();return}
  const fp=Object.entries(POPS).filter(([k,p])=>p.parentNode===desk&&p.classList.contains('open')&&NATIVE[p.id]!==desk.id);
  if(fp.length){e.stopPropagation();if(!fp.some(([k,p])=>p.contains(t)))fp.forEach(([k])=>popShut(k));return}
  if(desk.id==='clipDesk'&&cur==='home'&&!cpOpen&&!t.closest('.docwin'))e.stopPropagation();
},true);
document.addEventListener('click',e=>{
  const p=e.target.closest('[data-pal]');if(p){palToggle(p);return}
  const m=e.target.closest('.menubar .mb-i');if(!m)return;const k=m.dataset.mb,desk=m.closest('.desk');palClose();
  if(k==='bat'||k==='disp')popToggle(k,desk);
  else if(k==='shot'){ if(cap.parentNode===desk&&cap.classList.contains('live'))capClose(false); else shotIn(desk); }});

/* screenshot: frame on current desk */
const SEL0={...SEL}; let capMode='shot', capKind='image';
const docP=$('#doc p'); docP.innerHTML='Three receipts photographed, total <span id="hAmt">¥2,480</span>, due to Finance <span id="hDue">by Wed</span>.';
$$('#doc .row .v')[0].id='hName';
function selFor(desk,mode){const d=desk.getBoundingClientRect();
  if(mode==='home'){const w=$('.docwin',desk).getBoundingClientRect(),h1=$('#doc h1').getBoundingClientRect(),last=$$('#doc .row')[3].getBoundingClientRect();
    return {x:Math.round(w.left-d.left+64),y:Math.round(h1.top-d.top-26),w:Math.round(w.width-128),h:Math.round(last.bottom-h1.top+56)}}
  const w=$(':scope>.docwin,:scope>.vwin,:scope>.bwin',desk).getBoundingClientRect();return {x:Math.round(w.left-d.left),y:Math.round(w.top-d.top),w:Math.round(w.width),h:Math.round(w.height)}}
const _layoutAnno=layoutAnno;
layoutAnno=function(){
  if(capMode==='shot')return _layoutAnno();
  if(capMode==='plain'){$('#anno').innerHTML='';return}
  const s=capSel.getBoundingClientRect(),rel=q=>{const r=$(q).getBoundingClientRect();return {x:r.left-s.left,y:r.top-s.top,w:r.width,h:r.height}};
  const a=rel('#hAmt'),du=rel('#hDue'),nm=rel('#hName');
  const rx=a.x-7,ry=a.y-3,rw=a.w+14,rh=a.h+6, ax2=du.x+du.w/2+4,ay2=du.y+du.h+5, ax1=ax2+104,ay1=ay2+62;
  const ang=Math.atan2(ay2-ay1,ax2-ax1),hl=13,h1=[ax2-hl*Math.cos(ang-.5),ay2-hl*Math.sin(ang-.5)],h2=[ax2-hl*Math.cos(ang+.5),ay2-hl*Math.sin(ang+.5)];
  $('#anno').innerHTML=`<rect class="ln draw" x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="6" style="--len:${2*(rw+rh)}"/><path class="ln draw d2" d="M${ax1} ${ay1} L${ax2} ${ay2}" style="--len:${Math.hypot(ax2-ax1,ay2-ay1)}"/><path class="ln draw d3" d="M${h1[0]} ${h1[1]} L${ax2} ${ay2} L${h2[0]} ${h2[1]}" style="--len:40"/>`;
  Object.assign($('#annoT').style,{left:(ax1+8)+'px',top:(ay1-8)+'px'});
  Object.assign($('#mosaic').style,{left:(nm.x-4)+'px',top:(nm.y-3)+'px',width:(nm.w+8)+'px',height:(nm.h+6)+'px'})};
const _capture=capture;
capture=async function(){$$('.mb-i[data-mb="shot"]').forEach(x=>x.classList.remove('on'));$('.mb-i[data-mb="shot"]',cap.parentNode)?.classList.add('on');return _capture()};
function shotIn(desk){
  if(desk.id==='clipDesk')cpHide(); popShut('bat');popShut('disp');palClose();
  if(cap.parentNode!==desk){capSel.getAnimations().forEach(a=>a.cancel());cap.className='cap';desk.appendChild(cap);desk.appendChild(toastEl)}
  capMode=desk.id==='shotDesk'?'shot':desk.id==='clipDesk'?'home':'plain';cap.dataset.mode=capMode;
  Object.assign(SEL,capMode==='shot'?SEL0:selFor(desk,capMode));$('#annoT').textContent=capMode==='home'?'Due':'Peak';
  capKind='image';capture()}
function capRestore(){$$('.mb-i[data-mb="shot"]').forEach(x=>x.classList.remove('on'));const sd=$('#shotDesk');if(cap.parentNode===sd)return;
  capSel.getAnimations().forEach(a=>a.cancel());cap.className='cap';toastEl.classList.remove('on');sd.appendChild(cap);sd.appendChild(toastEl);
  capMode='shot';cap.dataset.mode='shot';Object.assign(SEL,SEL0);$('#annoT').textContent='Peak'}
const SHOTTHUMB={shotDesk:'dash',clipDesk:'doc',batDesk:'doc',dispDesk:'photo',jsonDesk:'code',vaultDesk:'settings'};
const OCRTXT={shotDesk:'September Revenue ¥248,300 +18.2%',clipDesk:'Three receipts photographed, total ¥2,480, due to Finance by Wed.',batDesk:'October: lock in Clipboard and Screenshot capture UX',dispDesk:'Moganshan-0921.heic',jsonDesk:'POST /hooks/refund · 200',vaultDesk:'Sign in to Yike Cloud · Console · East China 2'};
toastEl.classList.add('two');
function shotLand(kind){
  const desk=cap.parentNode,id=desk.id,w=SEL.w*2,h=SEL.h*2,k=SHOTTHUMB[id]||'doc',app=$('.menubar b',desk)?.textContent||'OneShot';
  const item=kind==='text'?{t:'text',v:OCRTXT[id]||app,app:'OneShot',c:'#CDEB18',tm:'Just now',fresh:1}:{t:'image',v:`${w} × ${h}`,thumb:k,app:'OneShot',c:'#CDEB18',tm:'Just now',fresh:1};
  toastEl.innerHTML=(kind==='text'?`<span class="chk">${ic('check')}</span>`:`<span class="th">${thumb(k)}</span>`)+`<span class="tt"><b>${kind==='text'?'Text copied':'Copied'}</b><small>${ic('clip')}Clipboard #1 · ⌘⇧V</small></span>`;
  clipPush(item); if(kind!=='text')histPush(k,w,h,app)}
const _capClose=capClose;
capClose=async function(copied){if(!cap.classList.contains('live'))return;$$('.mb-i[data-mb="shot"]').forEach(x=>x.classList.remove('on'));
  if(copied)shotLand(capKind);capKind='image';return _capClose(copied)};
$('#tbarRun').addEventListener('click',e=>{if(e.target.closest('[data-tip="OCR"]')){capKind='text';capClose(true)}});
let histN=136;
function histPush(k,w,h,app){const g=$('#smGrid .grid');if(!g)return;
  g.insertAdjacentHTML('afterbegin',`<div class="tile fresh" data-k="${k}" data-n="${app} · Just now"><div class="im">${thumb(k)}<div class="ov"><button class="tip-b" data-tip="Copy">${ic('copy','ic s')}</button><button class="tip-b" data-tip="Edit" data-open>${ic('expand','ic s')}</button></div></div><div class="mt"><span><b>Just now</b><span style="margin-left:8px">${app}</span></span><span class="mono">${w} × ${h}</span></div></div>`);
  $('#shot-mgmt .foot>span').textContent=`${++histN} shots · 4 recordings`}

/* clipboard: shared data; shots land here; JSON formats; passwords never enter */
CLIPS[5].v=JSON.stringify(JRUN); CLIPS[5].fmt=1;
jsonHTML=s=>jsonLines(JSON.parse(s)).lines.join('\n');
function cpRowHTML(it,i){const fmt=it.fmt;
  return `<div class="cp-row${fmt?' fmt':''}${it.fresh?' new':''}" role="option" data-i="${i}" style="--i:${i}"><span class="ty">${ic(TYPEIC[it.t])}</span><span class="tx">${contentHTML(it)}${it.fresh?'<span class="nw">Just now</span>':''}</span><span class="end">${fmt?`<button class="cp-act tip-t" data-tip="Format">${ic('format','ic s')}</button>`:(it.pin?ic('pin','ic s pin'):'')+ic('enter','ic s enter')}</span></div>`}
function cpRebuild(){cpRows.forEach(r=>r.remove());cpRows.length=0;cpList.insertAdjacentHTML('beforeend',CLIPS.map(cpRowHTML).join(''));cpRows.push(...$$('.cp-row',cpList));if(cpOpen)cpPaint()}
let clipN=248;
function clipPush(it){MG.forEach(x=>delete x.fresh);CLIPS.unshift(it);if(CLIPS.length>8)CLIPS.pop();MG.unshift(it);cmSel=0;clipN++;
  $('#clip-mgmt .foot>span').textContent=clipN+' items';cmRender();cmDetail();cpRebuild()}
cpList.addEventListener('click',async e=>{const a=e.target.closest('.cp-act');if(!a)return;e.stopImmediatePropagation();
  cpHl.classList.add('flash');await wait(90);cpHl.classList.remove('flash');cpHide();await wait(140);location.hash='#json-run'},true);
const _cmDetail=cmDetail;
cmDetail=function(){_cmDetail();const it=MG[cmSel];
  if(it.tm==='Just now'){const f=$$('#cmDetail .facts div')[1];if(f)f.lastChild.textContent='Just now'}
  if(it.fmt)$('#cmDetail .dt-act').insertAdjacentHTML('afterbegin',`<a class="btn sec tip-t" data-tip="Open in Studio" href="#json-mgmt" style="text-decoration:none">${ic('braces')}Studio</a>`)};
$('#clip-mgmt .foot .r').insertAdjacentHTML('afterbegin',`${ic('lock','ic s')}Passwords excluded<span class="fsep"></span>`);
cpRebuild(); cmRender(); cmDetail();

/* home desk = Notes; clipboard paste is ⌘⇧V on top */
function deskReset(){popShut('bat');popShut('disp');capRestore();palClose()}
Object.keys({home:1,'clip-run':1,'clip-mgmt':1,'shot-run':1,'shot-mgmt':1,'battery-run':1,'battery-mgmt':1,'display-run':1,'display-mgmt':1,'json-run':1,'json-mgmt':1,'vault-run':1,'vault-mgmt':1,canvas:1}).forEach(id=>{const o=LEAVE[id];LEAVE[id]=()=>{o&&o();deskReset()}});
let homeCued=false;
ENTER['home']=()=>{const d=$('#clipDesk');if(d.parentNode.id!=='home'){cpHide();$('#home').appendChild(d)}
  if(!homeCued&&!RM){homeCued=true;const mk=$('.mb-i[data-mb="os"]',d);setTimeout(()=>{mk.classList.add('cue');setTimeout(()=>mk.classList.remove('cue'),1600)},500)}};
{const o=LEAVE['home'];LEAVE['home']=()=>{o&&o();cpHide();setTimeout(()=>{if(cur!=='home'){const d=$('#clipDesk');if(d.parentNode.id!=='clip-run')$('#clip-run').appendChild(d)}},RM?0:160)}}

/* hotkeys */
addEventListener('keydown',e=>{const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
  if(mod&&e.shiftKey&&k==='j'){e.preventDefault();location.hash='#json-run';return}
  if(mod&&e.shiftKey&&k==='a'){e.preventDefault();location.hash='#vault-run';return}
  if(e.key==='Escape'&&pal.classList.contains('open')){palClose();return}
  if(cur!=='shot-run'&&cap.classList.contains('live')){if(e.key==='Escape')capClose(false);else if(e.key==='Enter'||(mod&&k==='c')){e.preventDefault();capClose(true)}return}
  if(cur!=='shot-run'&&mod&&e.shiftKey&&(e.key==='2'||e.key==='@')){const d=curDesk();if(d){e.preventDefault();shotIn(d)}return}
  if(cur!=='home')return;
  if(e.key==='Escape'){popShut('bat');popShut('disp')}
  if(!cpOpen){if(mod&&e.shiftKey&&k==='v'){e.preventDefault();popShut('bat');popShut('disp');cpShow()}return}
  const n=visRows().length;
  if(e.key==='ArrowDown'){e.preventDefault();cpSel=(cpSel+1)%n;cpPaint()}
  else if(e.key==='ArrowUp'){e.preventDefault();cpSel=(cpSel-1+n)%n;cpPaint()}
  else if(e.key==='Enter'){e.preventDefault();cpPaste()}
  else if(e.key==='Escape')cpHide();
});
