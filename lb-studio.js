/* =====================================================================
   LB Music · STUDIO MAKER  (new "Make a song" screen)
   Load AFTER lb-extra.js and lb-lab.js.  Nothing else is removed.
   ===================================================================== */
(()=>{
if(window.__lbStudio||typeof R==='undefined')return;window.__lbStudio=1;
const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms)),
OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;

const ROWS=[['kick','Kick',0,0],['snare','Snare',0,0],['hat','Hi-hat',0,0],['bass','Bass',1,0],['clap','Clap',0,1],['tom','Tom',0,1],['lead','Lead',1,1],['pluck','Pluck',1,1]];
const SC={Minor:[0,3,7,10],Major:[0,4,7,11],Pentatonic:[0,2,4,7],Blues:[0,3,5,6]},FREE_SC=['Minor','Major'];
const BASE={bass:36,lead:60,pluck:72};
const KITS={Classic:{p:1,d:1,f:1},Trap:{p:.7,d:1.8,f:1.3,pro:1},Afro:{p:1.2,d:.7,f:.8,pro:1},'Lo-fi':{p:.9,d:1.2,f:.5,pro:1}};
const NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const LENS=[1,2,3,4,5,6,8,10];
const QUAL={l:['Lite',32000],n:['Normal',44100],h:['HD',48000]};
const PRE={
 'Hip-hop':{bpm:90,kick:'1000001000100000',snare:'0000100000001000',hat:'1010101010101010',bass:'1000001000300000'},
 'Pop':{bpm:110,kick:'1000100010001000',snare:'0000100000001000',hat:'1010101010101010',bass:'1000100010002000'},
 'Afro':{bpm:104,kick:'1000010010100000',snare:'0000100000001000',hat:'1011101110111011',bass:'1001001000100100'},
 'House':{bpm:124,kick:'1000100010001000',snare:'0000100000001000',hat:'0010001000100010',bass:'0100010001000100'}
};

let MK=Object.assign({bpm:100,root:0,scale:'Minor',kit:'Classic',grid:{},len:2,swing:0,q:'n',mute:{}},LS('mk',null)||{});
if(!MK.grid)MK.grid={};if(!MK.mute)MK.mute={};
const sv=()=>SV('mk',MK),kit=()=>{const k=KITS[MK.kit]||KITS.Classic;return k.pro&&!isPro()?KITS.Classic:k};
const sw=(s,spb)=>s%2?spb*(MK.swing||0)/100*.33:0;

/* ---------------- sound engine ---------------- */
const noiseBuf=ac=>{const b=ac.createBuffer(1,ac.sampleRate,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b};
function chain(ac){const c=ac.createDynamicsCompressor();c.threshold.value=-14;c.knee.value=12;c.ratio.value=3;c.attack.value=.005;c.release.value=.2;
 const g=ac.createGain();g.gain.value=.9;c.connect(g);g.connect(ac.destination);return c}
function hit(ac,dst,nb,id,t,deg,K){
 let g=ac.createGain();g.connect(dst);
 const env=(a,d,pk)=>{g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(pk,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d)};
 const osc=(type,f1,f2,dur)=>{const o=ac.createOscillator();o.type=type;o.frequency.setValueAtTime(f1,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);o.connect(g);o.start(t);o.stop(t+dur+.4)};
 const noise=(type,f,dur)=>{const s=ac.createBufferSource();s.buffer=nb;const fl=ac.createBiquadFilter();fl.type=type;fl.frequency.value=f*K.f;s.connect(fl);fl.connect(g);s.start(t,Math.random()*.5);s.stop(t+dur+.1)};
 if(id==='kick'){env(.003,.4*K.d,1);osc('sine',160*K.p,42,.14)}
 else if(id==='snare'){env(.002,.2*K.d,.7);noise('highpass',1500,.2*K.d);osc('triangle',200*K.p,120,.08)}
 else if(id==='clap'){env(.002,.16*K.d,.7);noise('bandpass',1300,.16*K.d)}
 else if(id==='hat'){env(.001,.05*K.d,.4);noise('highpass',7500,.06*K.d)}
 else if(id==='tom'){env(.003,.3*K.d,.8);osc('sine',140*K.p,70,.2)}
 else{const m=BASE[id]+MK.root+SC[MK.scale][(deg-1)%4],f=440*Math.pow(2,(m-69)/12),
  fl=ac.createBiquadFilter();fl.type='lowpass';fl.frequency.value=(id==='bass'?700:id==='lead'?3000:2200)*K.f;g.disconnect();g.connect(fl);fl.connect(dst);
  const dur=id==='bass'?.28:id==='lead'?.22:.15;env(.005,dur,id==='bass'?.7:.35);osc(id==='bass'?'sawtooth':id==='lead'?'square':'triangle',f,0,dur)}}
function sched(ac,dst,nb,step,t,K){const pro=isPro();
 ROWS.forEach(([id,,,pr])=>{if(pr&&!pro)return;if(MK.mute[id])return;const v=(MK.grid[id]||[])[step];if(v)hit(ac,dst,nb,id,t,v,K)})}

/* ---------------- live playback ---------------- */
const L={ac:null,m:null,nb:null,on:false,step:0,next:0,t:0};
function ens(){if(!L.ac){const A=window.AudioContext||window.webkitAudioContext;L.ac=new A();L.m=chain(L.ac);L.nb=noiseBuf(L.ac)}try{L.ac.resume()}catch(e){}return L.ac}
let cols=[],prev=-1;
function mark(s){if(prev>=0&&cols[prev])cols[prev].forEach(c=>c.classList.remove('hl'));if(s>=0&&cols[s])cols[s].forEach(c=>c.classList.add('hl'));prev=s}
function playBtn(){const b=$('#stPlay');if(b)b.textContent=L.on?'⏹':'▶'}
function start(){if(L.on||busy)return;try{au.pause()}catch(e){}const ac=ens();L.on=true;L.step=0;L.next=ac.currentTime+.06;
 L.t=setInterval(()=>{
  if(typeof PAGE!=='undefined'&&PAGE!=='maker'){stop();return}
  const spb=60/MK.bpm/4;
  while(L.next<ac.currentTime+.15){const s=L.step,tt=L.next;sched(ac,L.m,L.nb,s,tt+sw(s,spb),kit());
   setTimeout(()=>mark(s),Math.max(0,(tt+sw(s,spb)-ac.currentTime)*1000));L.next+=spb;L.step=(L.step+1)%16}
 },25);playBtn()}
function stop(){clearInterval(L.t);L.on=false;mark(-1);playBtn()}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&L.on)stop()});

/* ---------------- saving (small pieces, no freezing) ---------------- */
let busy=false;
async function render(min,onP){
 const sr=(QUAL[MK.q]||QUAL.n)[1],spb=60/MK.bpm/4,loopLen=16*spb,oc=new OAC(1,Math.ceil((loopLen+1.5)*sr),sr),nb=noiseBuf(oc),dst=chain(oc),K=kit();
 for(let s=0;s<16;s++)sched(oc,dst,nb,s,s*spb+sw(s,spb),K);
 const loop=(await oc.startRendering()).getChannelData(0),loopN=Math.round(loopLen*sr),tailN=Math.max(0,loop.length-loopN),
  loops=Math.max(1,Math.round(min*60/loopLen)),total=loops*loopN,per=Math.max(1,Math.floor(5*sr/loopN)),parts=[];
 let carry=new Float32Array(tailN);
 for(let l0=0;l0<loops;l0+=per){
  const k=Math.min(per,loops-l0),n=k*loopN,buf=new Float32Array(n+tailN);buf.set(carry);
  for(let j=0;j<k;j++){const off=j*loopN;for(let i=0;i<loop.length;i++)buf[off+i]+=loop[i]}
  carry=buf.slice(n);
  const o=new Int16Array(n);for(let i=0;i<n;i++){const v=buf[i];o[i]=v>=1?32767:v<=-1?-32768:v<0?v*32768:v*32767}
  parts.push(o);onP&&onP((l0+k)/loops);await sleep(0)}
 /* gentle fade-out on the last 4 seconds */
 const fadeN=Math.min(total,sr*4);let left=fadeN,idx=parts.length-1;
 while(left>0&&idx>=0){const p=parts[idx],m=Math.min(left,p.length),done=fadeN-left;
  for(let k=0;k<m;k++)p[p.length-1-k]=p[p.length-1-k]*((done+k)/fadeN);left-=m;idx--}
 const h=new DataView(new ArrayBuffer(44)),w=(p,s)=>[...s].forEach((c,i)=>h.setUint8(p+i,c.charCodeAt(0)));
 w(0,'RIFF');h.setUint32(4,36+total*2,true);w(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,1,true);
 h.setUint32(24,sr,true);h.setUint32(28,sr*2,true);h.setUint16(32,2,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,total*2,true);
 return new Blob([h.buffer,...parts],{type:'audio/wav'})}

async function save(){
 if(busy)return;if(!OAC)return toast('This phone cannot save songs in the browser');
 const t=prompt('Name your song','My Beat');if(!t)return;
 if(L.on)stop();busy=true;const bt=$('#stSave'),pg=$('#stProg'),bar=pg&&pg.firstChild;
 if(bt){bt.disabled=true;bt.textContent='Making your song… 0%'}if(pg)pg.classList.add('on');
 try{
  const blob=await render(MK.len,p=>{if(bt)bt.textContent='Making your song… '+Math.round(p*100)+'%';if(bar)bar.style.width=Math.round(p*100)+'%'}),
   nm=(t.replace(/[\\/:*?"<>|]/g,'').trim()||'My Beat'),f=new File([blob],nm+'.wav',{type:'audio/wav'});
  await addFiles([f],'file');
  const s=S.songs.find(x=>x.name===f.name&&x.size===f.size);
  if(s){s.title=t;s.artist='Me (LB Maker)';s.album='My Songs';await dbPut(s)}
  busy=false;refresh();toast('Saved! Find it in Music → My Songs')
 }catch(e){busy=false;toast('Could not make the song on this phone. Try Lite quality or a shorter song')}
 if(bt){bt.disabled=false;bt.textContent='💾 Save to my music'}if(pg)pg.classList.remove('on')}

/* ---------------- screen ---------------- */
const css=document.createElement('style');css.textContent=`
.stH{display:flex;align-items:center;gap:14px;margin:4px 0 8px}
.stPlay{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--ac),var(--ac2));color:#04201c;font-size:26px;font-weight:900;flex:none}
.stBpm{flex:1;display:flex;align-items:center;justify-content:space-between;background:var(--card);border-radius:18px;padding:6px 8px}
.stBpm button{width:42px;height:42px;border-radius:50%;background:#ffffff14;color:#fff;font-size:22px}
.stBpm div{text-align:center}.stBpm b{font-size:28px;display:block;line-height:1}.stBpm small{font-size:11px;color:var(--mut)}
#stR,#stW{width:100%;margin:6px 0}
.stL{font-size:12px;color:var(--mut);margin:14px 0 6px;font-weight:700;letter-spacing:.4px}.stL small{font-weight:400;margin-left:6px}
.stCh{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:6px}
.stCh button{flex:none;padding:8px 13px;border-radius:18px;background:var(--card);color:#fff;font-size:13px}
.stCh button.on{background:var(--ac);color:#04201c;font-weight:700}
.stGrid{overflow-x:auto;background:#00000030;border-radius:16px;padding:6px 0}
.stR{display:flex;align-items:center;gap:3px;margin:4px 0;min-width:max-content}
.stN{position:sticky;left:0;z-index:2;width:74px;flex:none;text-align:left;padding:9px 6px 9px 10px;font-size:12px;font-weight:700;color:#fff;background:var(--bg);border-radius:0 10px 10px 0}
.stR.mu .stN{color:#ffffff55;text-decoration:line-through}.stR.mu .stC{opacity:.35}.stR.lk .stN{color:var(--mut)}
.stC{display:flex;gap:3px;padding-right:8px}
.stp{width:28px;height:36px;border-radius:7px;background:#ffffff14;font-size:10px;font-weight:800;color:#04201c;padding:0;flex:none}
.stp.q{background:#ffffff26;margin-left:5px}.stp.q:first-child{margin-left:0}.stp.on{background:var(--ac)}.stp.hl{outline:2px solid #fff;outline-offset:-2px}
.stRow{display:flex;gap:8px;margin-top:10px}.stRow button{flex:1;padding:12px;border-radius:14px;background:var(--card);color:#fff;font-size:13px;font-weight:700}
.stInfo{font-size:12px;color:var(--mut);margin:12px 0 8px}
.stSave{width:100%;padding:15px;border-radius:16px;background:linear-gradient(135deg,var(--ac),var(--ac2));color:#04201c;font-size:15px;font-weight:800}.stSave:disabled{opacity:.65}
.stProg{height:6px;background:#ffffff18;border-radius:4px;margin-top:10px;overflow:hidden;display:none}.stProg.on{display:block}.stProg i{display:block;height:100%;width:0;background:var(--ac)}
`;document.head.append(css);

function chips(box,items,cur,fn){const e=$(box);if(!e)return;e.innerHTML='';
 items.forEach(([key,label])=>{const b=document.createElement('button');b.textContent=label;if(key===cur)b.className='on';b.onclick=()=>fn(key);e.append(b)})}
const maxBpm=()=>isPro()?200:140;
function info(){const e=$('#stInfo');if(!e)return;const sr=(QUAL[MK.q]||QUAL.n)[1],mb=MK.len*60*sr*2/1048576;
 e.textContent='Song size about '+mb.toFixed(1)+' MB · '+MK.len+' min · '+(QUAL[MK.q]||QUAL.n)[0]+' quality'+(isPro()?'':' · 👑 Pro unlocks all kits, tracks and scales')}
function setBpm(v){MK.bpm=Math.max(60,Math.min(maxBpm(),Math.round(v)));if(v>maxBpm())proGate('Speeds above 140');sv();$('#stB').textContent=MK.bpm;$('#stR').value=MK.bpm}
function paint(c,v,pt){c.classList.toggle('on',!!v);c.textContent=pt&&v?NN[(MK.root+SC[MK.scale][(v-1)%4])%12]:''}
function buildGrid(){const g=$('#stGrid');if(!g)return;const x=g.scrollLeft,pro=isPro();g.innerHTML='';cols=Array.from({length:16},()=>[]);prev=-1;
 ROWS.forEach(([id,lab,pt,pr])=>{const locked=pr&&!pro,r=document.createElement('div');r.className='stR'+(MK.mute[id]?' mu':'')+(locked?' lk':'');
  const l=document.createElement('button');l.className='stN';l.textContent=lab+(locked?' 👑':'');
  l.onclick=()=>{if(locked)return proGate('The '+lab+' track');MK.mute[id]=!MK.mute[id];sv();r.classList.toggle('mu',!!MK.mute[id])};
  const w=document.createElement('div');w.className='stC';
  for(let s=0;s<16;s++){const c=document.createElement('button');c.className='stp'+(s%4===0?' q':'');paint(c,(MK.grid[id]||[])[s]||0,pt);
   c.onclick=()=>{if(locked)return proGate('The '+lab+' track');const a=MK.grid[id]=MK.grid[id]||Array(16).fill(0);
    a[s]=pt?(a[s]+1)%5:(a[s]?0:1);paint(c,a[s],pt);sv();
    if(a[s]&&!L.on){const ac=ens();hit(ac,L.m,L.nb,id,ac.currentTime+.01,a[s],kit())}};
   cols[s].push(c);w.append(c)}
  r.append(l,w);g.append(r)});g.scrollLeft=x}

function build(){
 const b=$('#mkBody');if(!b)return;const pro=isPro();
 MK.bpm=Math.min(MK.bpm,maxBpm());if(!pro&&!FREE_SC.includes(MK.scale))MK.scale='Minor';
 b.innerHTML=`<div class="stH"><button class="stPlay" id="stPlay">${L.on?'⏹':'▶'}</button>
  <div class="stBpm"><button id="stM">−</button><div><b id="stB">${MK.bpm}</b><small>BPM · speed</small></div><button id="stP">+</button></div></div>
  <input type="range" id="stR" min="60" max="${maxBpm()}" value="${MK.bpm}">
  <div class="stL">QUICK START</div><div class="stCh" id="stPre"></div>
  <div class="stL">SOUND</div><div class="stCh" id="stKit"></div>
  <div class="stL">KEY &amp; SCALE</div><div class="stCh" id="stRoot"></div><div class="stCh" id="stSc"></div>
  <div class="stL">PATTERN <small>tap a name to mute it · scroll sideways</small></div><div class="stGrid" id="stGrid"></div>
  <div class="stRow"><button id="stRnd">🎲 Random</button><button id="stClr">🗑 Clear</button></div>
  <div class="stL">GROOVE <small>swing</small></div><input type="range" id="stW" min="0" max="60" value="${MK.swing||0}">
  <div class="stL">SONG LENGTH</div><div class="stCh" id="stLen"></div>
  <div class="stL">QUALITY <small>Lite = smaller file, best for old phones</small></div><div class="stCh" id="stQ"></div>
  <div class="stInfo" id="stInfo"></div><button class="stSave" id="stSave">💾 Save to my music</button><div class="stProg" id="stProg"><i></i></div>`;
 const kl=()=>chips('#stKit',Object.keys(KITS).map(k=>[k,k+(KITS[k].pro&&!pro?' 👑':'')]),MK.kit,k=>{if(KITS[k].pro&&!pro)return proGate(k+' kit');MK.kit=k;sv();kl()}),
  rl=()=>chips('#stRoot',NN.map((n,i)=>[i,n]),MK.root,i=>{MK.root=i;sv();rl();buildGrid()}),
  sl=()=>chips('#stSc',Object.keys(SC).map(k=>[k,k+(FREE_SC.includes(k)||pro?'':' 👑')]),MK.scale,k=>{if(!FREE_SC.includes(k)&&!pro)return proGate(k+' scale');MK.scale=k;sv();sl();buildGrid()}),
  ll=()=>{chips('#stLen',LENS.map(m=>[m,m+' min']),MK.len,m=>{MK.len=m;sv();ll()});info()},
  ql=()=>{chips('#stQ',Object.keys(QUAL).map(k=>[k,QUAL[k][0]]),MK.q,k=>{MK.q=k;sv();ql()});info()};
 kl();rl();sl();ll();ql();buildGrid();
 chips('#stPre',Object.keys(PRE).map(k=>[k,k]),'',k=>{const p=PRE[k];MK.grid=MK.grid||{};
  ['kick','snare','hat','bass'].forEach(id=>MK.grid[id]=Array.from(p[id],Number));
  ['clap','tom','lead','pluck'].forEach(id=>{if(MK.grid[id]&&!pro)MK.grid[id]=Array(16).fill(0)});
  setBpm(p.bpm);sv();buildGrid();toast(k+' beat loaded. Press play!')});
 $('#stPlay').onclick=()=>L.on?stop():start();
 $('#stM').onclick=()=>setBpm(MK.bpm-1);$('#stP').onclick=()=>setBpm(MK.bpm+1);
 $('#stR').oninput=e=>setBpm(+e.target.value);
 $('#stW').oninput=e=>{MK.swing=+e.target.value;sv()};
 $('#stClr').onclick=()=>{MK.grid={};sv();buildGrid()};
 $('#stRnd').onclick=()=>{const gr={};ROWS.forEach(([id,,pt,pr])=>{if(pr&&!pro)return;gr[id]=Array.from({length:16},(_,s)=>{const r=Math.random();
   if(id==='kick')return(s%8===0||r<.12)?1:0;if(id==='snare'||id==='clap')return(s%8===4||r<.06)?1:0;if(id==='hat')return(s%2===0||r<.25)?1:0;
   if(id==='tom')return r<.1?1:0;return r<.3?1+Math.floor(Math.random()*4):0})});MK.grid=gr;sv();buildGrid()};
 $('#stSave').onclick=save}

R.maker=build;
})();