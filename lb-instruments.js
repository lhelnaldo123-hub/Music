/* =====================================================================
   LB Music · INSTRUMENTS  (add-on)
   Load AFTER lb-multi.js:  <script src="lb-instruments.js"></script>
   · On-screen keyboard (2 rows, 7 sounds, octave shift, record what you play)
   · Piano roll (draw notes on a grid, 1-4 bars, loop, pick note length)
   · Sampler: 8 drum pads + 16-step beat maker, load your own sound or
     record one with the mic, change pitch per pad, record pads live
   · "Send to Multitrack": renders your music to a clip on the timeline
   Nothing is removed from the app.
   ===================================================================== */
(()=>{
if(window.__lbIn||typeof R==='undefined')return;window.__lbIn=1;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],
AC=window.AudioContext||window.webkitAudioContext,OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext,
NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],nm=m=>NN[m%12]+(Math.floor(m/12)-1),blk=m=>[1,3,6,8,10].includes(m%12),
PADS=['Kick','Snare','Hat','Open hat','Clap','Tom','Rim','Chime'],
kvPut=(id,blob)=>tx('kv','readwrite',k=>k.put({id,blob})),kvGet=id=>tx('kv','readonly',k=>k.get(id)),kvDel=id=>tx('kv','readwrite',k=>k.delete(id));
const RH=22,CW=30,ROWS=36;
let S=Object.assign({tab:'kb',pre:'Piano',oct:4,bars:2,len:2,vol:85,loops:4,notes:[],seq:{},pitch:{},sel:0,met:true,rbase:48,bpm:100},LS('inst',null)||{});
const sv=()=>SV('inst',S);
let built=false,REC=false,MR=null,sentOnce=false;
const bpmv=()=>window.LBMT?window.LBMT.bpm():S.bpm;

/* ---------------- audio engine ---------------- */
let C=null,BUS=null;
const ac=()=>{if(!C||C.state==='closed'){C=new AC({latencyHint:'interactive'});BUS=null}if(C.state==='suspended')C.resume();return C};
function mkBus(c){const g=c.createGain(),cm=c.createDynamicsCompressor();cm.threshold.value=-16;cm.knee.value=12;cm.ratio.value=4;cm.attack.value=.005;cm.release.value=.2;g.gain.value=S.vol/100;g.connect(cm);cm.connect(c.destination);return g}
const bus=()=>{const c=ac();if(!BUS)BUS=mkBus(c);return BUS};

/* sounds: osc = [type, frequency multiplier, level, detune cents] */
const PRE={
 Piano:{osc:[['triangle',1,1,0],['sine',2,.35,0],['sine',3,.12,0]],a:.005,d:.9,s:.18,r:.35,cut:2400,env:2.4,fd:.4,g:.9},
 'E-Piano':{osc:[['sine',1,1,0],['sine',2,.3,3],['sine',14,.04,0]],a:.005,d:1.2,s:.35,r:.4,cut:3500,env:1,fd:.2,g:.9},
 Pad:{osc:[['sawtooth',1,.5,-8],['sawtooth',1,.5,8],['triangle',.5,.5,0]],a:.5,d:.5,s:.8,r:1.2,cut:1100,env:1,fd:.5,g:.6},
 Pluck:{osc:[['sawtooth',1,.7,-5],['square',1,.3,5]],a:.002,d:.35,s:0,r:.15,cut:700,env:7,fd:.18,g:.7},
 Bass:{osc:[['sine',1,1,0],['square',.5,.5,0]],a:.01,d:.3,s:.7,r:.15,cut:500,env:2,fd:.2,g:.9},
 Lead:{osc:[['sawtooth',1,.6,-6],['square',1,.4,6]],a:.02,d:.2,s:.7,r:.25,cut:3000,env:1.5,fd:.3,g:.55,vib:5.5},
 Bell:{osc:[['sine',1,1,0],['sine',2.76,.4,0],['sine',5.4,.2,0]],a:.002,d:2.2,s:0,r:.6,cut:9000,env:1,fd:1,g:.7}
};
/* plays one note on any context (live or offline); returns off(time) */
function voice(c,dest,midi,t,vel,pn){
 const p=PRE[pn]||PRE.Piano,f=440*Math.pow(2,(midi-69)/12),out=c.createGain(),fl=c.createBiquadFilter(),pk=p.g*(.35+.65*vel)*.5,gs=p.osc.reduce((a,o)=>a+o[2],0);
 fl.type='lowpass';fl.Q.value=.7;const base=Math.min(14000,p.cut+f*1.5);
 fl.frequency.setValueAtTime(Math.min(16000,base*p.env),t);fl.frequency.setTargetAtTime(base,t,p.fd/3+.01);
 out.gain.setValueAtTime(0,t);out.gain.linearRampToValueAtTime(pk,t+p.a);out.gain.setTargetAtTime(pk*p.s,t+p.a,p.d/3);
 let lfo=null,lg=null;if(p.vib){lfo=c.createOscillator();lg=c.createGain();lfo.frequency.value=p.vib;lg.gain.value=10;lfo.connect(lg);lfo.start(t)}
 const os=p.osc.map(([ty,m,g,dt])=>{const o=c.createOscillator(),og=c.createGain();o.type=ty;o.frequency.value=f*m;o.detune.value=dt;og.gain.value=g/gs;o.connect(og);og.connect(fl);if(lg)lg.connect(o.detune);o.start(t);return o});
 fl.connect(out);out.connect(dest);
 return to=>{to=Math.max(to,t+p.a+.01);out.gain.setTargetAtTime(0,to,p.r/3);const end=to+p.r*1.6+.05;os.forEach(o=>{try{o.stop(end)}catch(e){}});if(lfo)try{lfo.stop(end)}catch(e){}}}
function click(c,t,strong){const o=c.createOscillator(),g=c.createGain();o.frequency.value=strong?1500:1000;g.gain.setValueAtTime(.25,t);g.gain.exponentialRampToValueAtTime(.001,t+.05);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.06)}

/* ---------------- built-in drum sounds (made with code, no files) ---------------- */
function noise(oc,dur){const b=oc.createBuffer(1,Math.ceil(oc.sampleRate*dur),oc.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const s=oc.createBufferSource();s.buffer=b;return s}
const filt=(oc,type,f,q)=>{const x=oc.createBiquadFilter();x.type=type;x.frequency.value=f;x.Q.value=q||1;return x};
const dec=(oc,g0,t)=>{const g=oc.createGain();g.gain.setValueAtTime(g0,0);g.gain.exponentialRampToValueAtTime(.001,t);return g};
const DR=[
 [.6,oc=>{const o=oc.createOscillator(),g=dec(oc,1,.5);o.frequency.setValueAtTime(160,0);o.frequency.exponentialRampToValueAtTime(42,.14);o.connect(g);g.connect(oc.destination);o.start(0);o.stop(.6)}],
 [.4,oc=>{const n=noise(oc,.4),f=filt(oc,'bandpass',1900,.8),g=dec(oc,.9,.22),o=oc.createOscillator(),g2=dec(oc,.6,.12);n.connect(f);f.connect(g);g.connect(oc.destination);o.type='triangle';o.frequency.value=190;o.connect(g2);g2.connect(oc.destination);n.start(0);o.start(0);o.stop(.2)}],
 [.15,oc=>{const n=noise(oc,.15),f=filt(oc,'highpass',7500),g=dec(oc,.7,.06);n.connect(f);f.connect(g);g.connect(oc.destination);n.start(0)}],
 [.5,oc=>{const n=noise(oc,.5),f=filt(oc,'highpass',7000),g=dec(oc,.6,.4);n.connect(f);f.connect(g);g.connect(oc.destination);n.start(0)}],
 [.35,oc=>{const n=noise(oc,.35),f=filt(oc,'bandpass',1300,1),g=oc.createGain();g.gain.setValueAtTime(1,0);g.gain.exponentialRampToValueAtTime(.25,.01);g.gain.setValueAtTime(1,.012);g.gain.exponentialRampToValueAtTime(.25,.022);g.gain.setValueAtTime(1,.024);g.gain.exponentialRampToValueAtTime(.001,.25);n.connect(f);f.connect(g);g.connect(oc.destination);n.start(0)}],
 [.55,oc=>{const o=oc.createOscillator(),g=dec(oc,.9,.4);o.frequency.setValueAtTime(220,0);o.frequency.exponentialRampToValueAtTime(110,.25);o.connect(g);g.connect(oc.destination);o.start(0);o.stop(.55)}],
 [.12,oc=>{const o=oc.createOscillator(),g=dec(oc,.6,.05);o.type='square';o.frequency.value=820;o.connect(g);g.connect(oc.destination);o.start(0);o.stop(.1)}],
 [1.3,oc=>{const g=dec(oc,.5,1.1),g2=dec(oc,.2,.5);[[1318,g],[3520,g2]].forEach(([f,gg])=>{const o=oc.createOscillator();o.frequency.value=f;o.connect(gg);gg.connect(oc.destination);o.start(0);o.stop(1.3)})}]
];
const BUFS=[],DEF=[];let ready=null;
function ensureDrums(){return ready||(ready=(async()=>{
 for(let i=0;i<8;i++){const oc=new OAC(1,Math.ceil(44100*DR[i][0]),44100);DR[i][1](oc);DEF[i]=await oc.startRendering();BUFS[i]=DEF[i]}
 for(let i=0;i<8;i++){try{const r=await kvGet('smp_'+i);if(r&&r.blob){const b=await ac().decodeAudioData(await r.blob.arrayBuffer());BUFS[i]=b}}catch(e){}}
 const t=$('#inTools');if(t)tools()})())}
function hit(c,dest,i,t,v){const b=BUFS[i];if(!b)return;const s=c.createBufferSource(),g=c.createGain();s.buffer=b;s.playbackRate.value=Math.pow(2,(S.pitch[i]||0)/12);g.gain.value=v==null?1:v;s.connect(g);g.connect(dest);s.start(t)}
function wavMono(d,sr){const n=d.length,b=new ArrayBuffer(44+n*2),h=new DataView(b),w=(p,s)=>[...s].forEach((c,i)=>h.setUint8(p+i,c.charCodeAt(0)));
 w(0,'RIFF');h.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,1,true);h.setUint32(24,sr,true);h.setUint32(28,sr*2,true);h.setUint16(32,2,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){const v=Math.max(-1,Math.min(1,d[i]));h.setInt16(44+i*2,v<0?v*32768:v*32767,true)}return new Blob([b],{type:'audio/wav'})}
/* trim silence at the start, keep max 6 s, make it loud enough */
function prep(b){const d=b.getChannelData(0),sr=b.sampleRate;let s=0;while(s<d.length&&Math.abs(d[s])<.02)s++;s=Math.max(0,s-200);const n=Math.max(1,Math.min(d.length-s,sr*6)),o=new Float32Array(n);let pk=0;
 for(let i=0;i<n;i++){o[i]=d[s+i];const a=Math.abs(o[i]);if(a>pk)pk=a}const g=pk>.001?.9/pk:1;for(let i=0;i<n;i++)o[i]*=g;
 const nb=ac().createBuffer(1,n,sr);nb.copyToChannel(o,0);return{buf:nb,data:o,sr}}
async function setSample(i,ab){const b=await new Promise((res,rej)=>{const p=ac().decodeAudioData(ab,res,rej);p&&p.catch&&p.catch(rej)}),r=prep(b);BUFS[i]=r.buf;await kvPut('smp_'+i,wavMono(r.data,r.sr))}

/* ---------------- transport (steady timing with look-ahead) ---------------- */
const T={on:false,mode:'',steps:16,t0:0,nxt:0,step:0,id:0,bpm:100,cb:null,
 start(mode,steps,cb){this.stop();const c=ac();this.mode=mode;this.steps=steps;this.cb=cb;this.bpm=bpmv();this.step=0;this.t0=this.nxt=c.currentTime+.1;this.on=true;this.id=setInterval(()=>this.tick(),25);this.tick()},
 stop(){clearInterval(this.id);this.on=false;this.mode=''},
 tick(){const sd=60/this.bpm/4;while(this.on&&this.nxt<C.currentTime+.12){this.cb(this.step,this.nxt);this.nxt+=sd;this.step=(this.step+1)%this.steps}},
 pos(){if(!this.on)return 0;const p=(C.currentTime-this.t0)/(60/this.bpm/4);return p<0?0:p%this.steps}};
const sd=()=>60/T.bpm/4;
function rollCb(step,t){const c=C;if(S.met&&REC&&step%4===0)click(c,t,step%16===0);
 for(const n of S.notes)if(n.s===step)voice(c,bus(),n.m,t,n.v,S.pre)(t+n.l*sd()*.97)}
function drCb(step,t){if(S.met&&REC&&step%4===0)click(C,t,step===0);
 for(let i=0;i<8;i++)if(S.seq[i]&&S.seq[i][step])hit(C,bus(),i,t,1)}
function stopT(){T.stop();REC=false;cancelAnimationFrame(raf);ui();const h=$('#inPh');if(h)h.style.transform='translateX(0)';$$('#inSq .cur').forEach(e=>e.classList.remove('cur'))}
function startT(rec){ac();if(S.tab==='dr'){ensureDrums().then(()=>{REC=!!rec;T.start('dr',16,drCb);ui();loopUI()})}else{REC=!!rec;T.start('roll',S.bars*16,rollCb);ui();loopUI()}}

/* ---------------- live keyboard (and recording into the roll) ---------------- */
const held=new Map();
function kbDown(m,vel,id){const c=ac(),off=voice(c,bus(),m,c.currentTime+.002,vel,S.pre);
 held.set(id,{m,off,vel,t:c.currentTime,p:(REC&&T.on&&T.mode==='roll')?T.pos():-1});const el=$(`[data-k="${m}"]`);el&&el.classList.add('dn')}
function kbUp(id){const h=held.get(id);if(!h)return;held.delete(id);h.off(C.currentTime);const el=$(`[data-k="${h.m}"]`);el&&el.classList.remove('dn');
 if(h.p>=0){const lim=S.bars*16,s=Math.round(h.p)%lim,l=Math.max(1,Math.round((C.currentTime-h.t)/sd()));
  S.notes=S.notes.filter(n=>!(n.m===h.m&&n.s===s));S.notes.push({m:h.m,s,l:Math.max(1,Math.min(l,lim-s)),v:h.vel});sv();if(S.tab==='roll')drawRoll()}}
function padDown(i){const c=ac();ensureDrums().then(()=>{S.sel=i;hit(c,bus(),i,c.currentTime+.001,1);
 if(REC&&T.on&&T.mode==='dr'){const st=Math.round(T.pos())%16;(S.seq[i]=S.seq[i]||Array(16).fill(0))[st]=1;sv();const b=$(`#inSq [data-p="${i}"][data-s="${st}"]`);b&&b.classList.add('on')}
 $$('.inPad').forEach(e=>e.classList.toggle('sel',+e.dataset.p===i));tools()})}

/* ---------------- render to audio (for the timeline) ---------------- */
function offBus(oc){const g=oc.createGain(),cm=oc.createDynamicsCompressor();cm.threshold.value=-16;cm.knee.value=12;cm.ratio.value=4;g.gain.value=S.vol/100;g.connect(cm);cm.connect(oc.destination);return g}
function peakNorm(d){let pk=0;for(let i=0;i<d.length;i+=2){const a=Math.abs(d[i]);if(a>pk)pk=a}if(pk>.95){const g=.95/pk;for(let i=0;i<d.length;i++)d[i]*=g}return d}
async function renderRoll(){const b=bpmv(),s=60/b/4,steps=S.bars*16,loops=S.loops,sr=44100,len=steps*s*loops,oc=new OAC(1,Math.ceil((len+2.5)*sr),sr),o=offBus(oc);
 for(let l=0;l<loops;l++)for(const n of S.notes)if(n.s<steps){const t=(l*steps+n.s)*s;voice(oc,o,n.m,t,n.v,S.pre)(t+n.l*s*.97)}
 return peakNorm((await oc.startRendering()).getChannelData(0))}
async function renderDrums(){await ensureDrums();const b=bpmv(),s=60/b/4,loops=S.loops,sr=44100,oc=new OAC(1,Math.ceil((16*s*loops+1.6)*sr),sr),o=offBus(oc);
 for(let l=0;l<loops;l++)for(let st=0;st<16;st++)for(let i=0;i<8;i++)if(S.seq[i]&&S.seq[i][st])hit(oc,o,i,(l*16+st)*s,1);
 return peakNorm((await oc.startRendering()).getChannelData(0))}
let sending=false;
async function send(){if(sending)return;if(!window.LBMT)return toast('Multitrack is not loaded');const dr=S.tab==='dr';
 if(dr?!Object.values(S.seq).some(r=>r&&r.some(x=>x)):!S.notes.length)return toast(dr?'Make a drum pattern first':'Play or draw some notes first');
 sending=true;const btn=$('#inSend');btn&&(btn.textContent='Rendering…');
 try{const d=dr?await renderDrums():await renderRoll(),st=await window.LBMT.addClip(d,44100,dr?'Drums':S.pre+' (instruments)',dr?'Drums':S.pre);
  sentOnce=true;toast('Added to Multitrack at '+Math.floor(st/60)+':'+String(Math.floor(st%60)).padStart(2,'0')+' ✅','Open',()=>show('mt'))}
 catch(e){console.error(e);toast('Could not send it. Try fewer loops.')}
 sending=false;ui()}

/* ---------------- UI ---------------- */
const css=document.createElement('style');css.textContent=`
#inst .inC{background:var(--card);border-radius:18px;padding:14px;margin:12px 0}
#inst .inR{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0}#inst .inR .m{color:var(--mut);font-size:12px}
#inst .inB{padding:10px 14px;border-radius:14px;background:#ffffff14;color:#fff;font-size:14px;font-weight:700}
#inst .inB.on{background:var(--ac);color:#04201c}#inst .inB.rc.on{background:#ff4d63;color:#fff}#inst .inB.pr{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#04201c}
#inst .chips{margin:6px 0}#inst .chip{flex:none}
.inKb{position:relative;height:130px;margin:8px 0;touch-action:none;user-select:none;-webkit-user-select:none}
.ik{position:absolute;top:0;border-radius:0 0 8px 8px;touch-action:none}
.ik.w{background:#f3f5f8;height:100%;border:1px solid #9aa3b0;color:#556;font-size:10px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;box-sizing:border-box;width:12.5%}
.ik.b{background:#1b1f27;height:60%;z-index:2;border:1px solid #000;width:7.5%}
.ik.dn.w{background:var(--ac)}.ik.dn.b{background:var(--ac2)}
.inRw{display:flex;max-height:54vh;overflow-y:auto;border-radius:12px;background:#0e1116}
.inLb{flex:none;width:44px;position:sticky;left:0;z-index:3;background:#0e1116}
.inLb div{height:${RH}px;font-size:10px;color:#9aa4b2;padding:5px 0 0 6px;box-sizing:border-box;border-bottom:1px solid #ffffff0d;background:#1a1e26}.inLb div.bk{background:#12151b}
.inSc{overflow-x:auto;flex:1}.inSc>div{position:relative}.inSc canvas{display:block}
#inPh{position:absolute;top:0;bottom:0;left:0;width:2px;background:#fff;pointer-events:none;z-index:2}
.inPads{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}
.inPad{height:76px;border-radius:16px;background:#232a35;color:#fff;font-weight:700;font-size:13px;touch-action:none;user-select:none;-webkit-user-select:none;border:2px solid transparent}
.inPad.sel{border-color:var(--ac)}.inPad.hit{background:var(--ac);color:#04201c}
.inSq{overflow-x:auto;margin-top:10px;padding-bottom:4px}.inSq .rw{display:flex;align-items:center;gap:3px;margin:3px 0;width:max-content}
.inSq .rw span{width:54px;flex:none;font-size:10px;color:var(--mut);position:sticky;left:0;background:var(--card)}
.inSq button{width:24px;height:26px;flex:none;border-radius:5px;background:#ffffff12}.inSq button.g{margin-left:5px}.inSq button.on{background:var(--ac)}.inSq button.cur{outline:2px solid #fff}
#inst input[type=range]{margin:0;padding:0}
`;document.head.append(css);
document.body.insertAdjacentHTML('beforeend',`<section id="inst" class="page"><div class="top"><button class="ic" onclick="back()">‹</button><h3>🎹 Instruments</h3><span></span></div><div id="inBody"></div></section>`);
const act=document.querySelector('.action');if(act)act.insertAdjacentHTML('beforeend','<button onclick="show(\'inst\')">🎹<br>Instruments</button>');

const chip=(on,a,v,l)=>`<button class="chip${on?' on':''}" data-a="${a}" data-v="${v}">${l}</button>`;
function kbRow(base){let h='<div class="inKb">';const W=[0,2,4,5,7,9,11,12];
 W.forEach((s,i)=>{h+=`<div class="ik w" data-k="${base+s}" style="left:${i*12.5}%">${s%12===0?nm(base+s):''}</div>`});
 [[1,0],[3,1],[6,3],[8,4],[10,5]].forEach(([s,w])=>{h+=`<div class="ik b" data-k="${base+s}" style="left:${(w+1)*12.5-3.75}%"></div>`});return h+'</div>'}
function preChips(){return `<div class="chips">${Object.keys(PRE).map(k=>chip(S.pre===k,'pre',k,k)).join('')}</div>`}
function kbHTML(){const b=12*(S.oct+1);return `<div class="inC"><div class="inR"><b>🎹 Keyboard</b><span class="m">Octave</span><button class="inB" data-a="oct" data-v="-1">−</button><b>C${S.oct}</b><button class="inB" data-a="oct" data-v="1">+</button></div>${preChips()}${kbRow(b+12)}${kbRow(b)}
 <p class="m" style="color:var(--mut);font-size:12px;line-height:1.5">Press ⏺ to record: a click counts the beat and what you play is written into the Piano roll. Touch lower on a key to play it louder.</p></div>`}
function rollHTML(){const lb=[];for(let r=0;r<ROWS;r++){const m=S.rbase+ROWS-1-r;lb.push(`<div class="${blk(m)?'bk':''}">${m%12===0?nm(m):''}</div>`)}
 return `<div class="inC"><div class="inR"><b>🎼 Piano roll</b><span class="m">Bars</span>${[1,2,4].map(n=>chip(S.bars===n,'bars',n,n)).join('')}<span class="m">Range</span><button class="inB" data-a="rb" data-v="-12">▼</button><button class="inB" data-a="rb" data-v="12">▲</button></div>
 ${preChips()}<div class="inR"><span class="m">Note length</span>${[[1,'1/16'],[2,'1/8'],[4,'1/4'],[8,'1/2'],[16,'1 bar']].map(([v,l])=>chip(S.len===v,'len',v,l)).join('')}</div>
 <div class="inRw" id="inRw"><div class="inLb">${lb.join('')}</div><div class="inSc"><div id="inSz"><canvas id="inCv"></canvas><div id="inPh"></div></div></div></div>
 <div class="inR"><button class="inB" data-a="clr">🗑 Clear notes</button><span class="m">Tap a square to add a note, tap a note to remove it.</span></div></div>`}
function drHTML(){return `<div class="inC"><div class="inR"><b>🥁 Drum pads</b></div><div class="inPads">${PADS.map((n,i)=>`<button class="inPad${S.sel===i?' sel':''}" data-p="${i}">${n}</button>`).join('')}</div>
 <div id="inTools"></div>
 <div class="inSq" id="inSq">${PADS.map((n,i)=>`<div class="rw"><span>${n}</span>${Array.from({length:16},(_,s)=>`<button class="${s%4===0&&s?'g ':''}${S.seq[i]&&S.seq[i][s]?'on':''}" data-a="cell" data-p="${i}" data-s="${s}"></button>`).join('')}</div>`).join('')}</div>
 <div class="inR"><button class="inB" data-a="clr">🗑 Clear beat</button><span class="m">Press ⏺ then tap the pads to record a beat live.</span></div></div>`}
function tools(){const t=$('#inTools');if(!t)return;const i=S.sel,p=S.pitch[i]||0;
 t.innerHTML=`<div class="inR"><b>${PADS[i]}</b><span class="m">Pitch</span><button class="inB" data-a="pit" data-v="-1">−</button><b>${p>0?'+':''}${p}</b><button class="inB" data-a="pit" data-v="1">+</button></div>
 <div class="inR"><button class="inB" data-a="load">📂 Load sound</button><button class="inB${MR?' rc on':''}" data-a="mrec">${MR?'⏹ Stop':'🎤 Record sound'}</button><button class="inB" data-a="reset">↺ Original</button></div>`}
function render(){const b=$('#inBody');if(!b)return;built=true;
 b.innerHTML=`<div class="chips">${[['kb','🎹 Keyboard'],['roll','🎼 Piano roll'],['dr','🥁 Drum pads']].map(([v,l])=>chip(S.tab===v,'tab',v,l)).join('')}</div>
 <div class="inC"><div class="inR"><button class="inB" id="inPl" data-a="pl">▶ Play</button><button class="inB rc" id="inRc" data-a="rc">⏺ Rec</button><button class="inB" id="inMt" data-a="met">🎵 Click</button>
 <span class="m">BPM</span><button class="inB" data-a="bm" data-v="-1">−</button><b id="inBpm" style="min-width:30px;text-align:center">${bpmv()}</b><button class="inB" data-a="bm" data-v="1">+</button><b id="inBt" style="margin-left:auto;color:var(--ac)"></b></div>
 <div class="inR"><span class="m">Volume</span><input type="range" min="10" max="130" value="${S.vol}" id="inVol" style="flex:1"></div></div>
 ${S.tab==='kb'?kbHTML():S.tab==='roll'?rollHTML():drHTML()}
 <div class="inC"><b>🎚 Send to Multitrack</b><p class="m" style="color:var(--mut);font-size:12px;margin:6px 0">Turns your ${S.tab==='dr'?'drum beat':'notes'} into a clip on the timeline (at the playhead), so you can add vocals, effects and mix it.</p>
 <div class="inR"><span class="m">Repeat</span>${[1,2,4,8].map(n=>chip(S.loops===n,'loops',n,n+'×')).join('')}</div>
 <button class="inB pr" id="inSend" data-a="send" style="width:100%;padding:14px;margin-top:6px">🎚 Send to timeline</button>
 <button class="inB" data-a="open" style="width:100%;margin-top:8px">Open Multitrack ›</button></div>`;
 if(S.tab==='roll'){drawRoll();const w=$('#inRw');if(w)w.scrollTop=Math.max(0,(ROWS-1-(72-S.rbase))*RH-60)}if(S.tab==='dr'){ensureDrums();tools()}ui()}
function ui(){const pl=$('#inPl'),rc=$('#inRc'),mt=$('#inMt'),sb=$('#inSend');if(pl)pl.textContent=T.on?'⏹ Stop':'▶ Play';if(pl)pl.classList.toggle('on',T.on);if(rc)rc.classList.toggle('on',REC);if(mt)mt.classList.toggle('on',!!S.met);if(sb)sb.textContent=sending?'Rendering…':'🎚 Send to timeline';
 const bv=$('#inBpm');if(bv)bv.textContent=bpmv();if(!T.on){const b=$('#inBt');if(b)b.textContent=''}}
function drawRoll(){const cv=$('#inCv');if(!cv)return;const steps=S.bars*16,W=steps*CW,H=ROWS*RH,x=cv.getContext('2d');cv.width=W;cv.height=H;$('#inSz').style.cssText=`width:${W}px;height:${H}px;position:relative`;
 for(let r=0;r<ROWS;r++){const m=S.rbase+ROWS-1-r;x.fillStyle=blk(m)?'#12151b':'#1a1e26';x.fillRect(0,r*RH,W,RH);x.fillStyle=m%12===0?'#ffffff22':'#ffffff0a';x.fillRect(0,r*RH+RH-1,W,1)}
 for(let s=0;s<=steps;s++){x.fillStyle=s%16===0?'#ffffff55':s%4===0?'#ffffff26':'#ffffff0d';x.fillRect(s*CW,0,1,H)}
 x.fillStyle='#1de9c6';for(const n of S.notes){if(n.s>=steps||n.m<S.rbase||n.m>=S.rbase+ROWS)continue;const r=S.rbase+ROWS-1-n.m;x.fillRect(n.s*CW+1,r*RH+2,Math.max(6,Math.min(n.l,steps-n.s)*CW-2),RH-4)}}
let raf=0,lastCur=-1;
function loopUI(){cancelAnimationFrame(raf);const f=()=>{if(!T.on)return;const p=T.pos(),bt=$('#inBt');
 if(bt)bt.textContent=(Math.floor(p/16)+1)+'.'+(Math.floor(p%16/4)+1);
 if(T.mode==='roll'){const h=$('#inPh');if(h)h.style.transform=`translateX(${p*CW}px)`;const sc=$('.inSc');if(sc&&S.tab==='roll'){const x=p*CW;if(x<sc.scrollLeft||x>sc.scrollLeft+sc.clientWidth-30)sc.scrollLeft=Math.max(0,x-20)}}
 else{const cur=Math.floor(p);if(cur!==lastCur){$$('#inSq .cur').forEach(e=>e.classList.remove('cur'));$$(`#inSq [data-s="${cur}"]`).forEach(e=>e.classList.add('cur'));lastCur=cur}}
 raf=requestAnimationFrame(f)};f()}

/* ---------------- events ---------------- */
async function recSample(){const i=S.sel;
 if(MR){MR.stop();return}
 if(!navigator.mediaDevices||!window.MediaRecorder)return toast('Recording is not supported in this browser');
 let st;try{st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})}catch(e){return toast('Allow the microphone first')}
 const ch=[],mr=new MediaRecorder(st);MR=mr;mr.ondataavailable=e=>e.data.size&&ch.push(e.data);
 mr.onstop=async()=>{clearTimeout(tm);st.getTracks().forEach(t=>t.stop());MR=null;tools();
  try{await setSample(i,await new Blob(ch,{type:mr.mimeType||'audio/webm'}).arrayBuffer());toast('Sound saved on pad '+PADS[i]+' ✅');padDown(i)}catch(e){toast('Could not read the recording')}};
 mr.start();tools();toast('Recording… tap Stop when done (max 4 seconds)');const tm=setTimeout(()=>{if(mr.state!=='inactive')mr.stop()},4000)}
document.addEventListener('click',async e=>{const el=e.target.closest('#inst [data-a]');if(!el)return;const a=el.dataset.a,v=el.dataset.v;
 if(a==='tab'){stopT();S.tab=v;sv();render()}
 else if(a==='pre'){S.pre=v;sv();$$('#inst [data-a=pre]').forEach(b=>b.classList.toggle('on',b.dataset.v===v));const c=ac();voice(c,bus(),60,c.currentTime+.01,.8,v)(c.currentTime+.4)}
 else if(a==='oct'){S.oct=Math.max(1,Math.min(6,S.oct+ +v));sv();render()}
 else if(a==='bars'){const was=T.on;stopT();S.bars=+v;sv();render();if(was)startT(false)}
 else if(a==='len'){S.len=+v;sv();$$('#inst [data-a=len]').forEach(b=>b.classList.toggle('on',+b.dataset.v===S.len))}
 else if(a==='rb'){S.rbase=Math.max(24,Math.min(72,S.rbase+ +v));sv();render()}
 else if(a==='loops'){S.loops=+v;sv();$$('#inst [data-a=loops]').forEach(b=>b.classList.toggle('on',+b.dataset.v===S.loops))}
 else if(a==='clr'){if(S.tab==='dr')S.seq={};else S.notes=[];sv();render()}
 else if(a==='pl'){if(T.on)stopT();else startT(false)}
 else if(a==='rc'){if(REC){stopT()}else if(T.on){REC=true;ui()}else startT(true)}
 else if(a==='met'){S.met=!S.met;sv();ui()}
 else if(a==='bm'){const b=window.LBMT?window.LBMT.bpm(bpmv()+ +v):(S.bpm=Math.max(40,Math.min(240,S.bpm+ +v)));sv();const was=T.on,rec=REC;if(was){stopT();startT(rec)}ui()}
 else if(a==='cell'){const i=+el.dataset.p,s=+el.dataset.s,r=S.seq[i]=S.seq[i]||Array(16).fill(0);r[s]=r[s]?0:1;el.classList.toggle('on',!!r[s]);sv();if(r[s]){await ensureDrums();const c=ac();hit(c,bus(),i,c.currentTime+.001,1)}}
 else if(a==='pit'){const i=S.sel;S.pitch[i]=Math.max(-12,Math.min(12,(S.pitch[i]||0)+ +v));sv();tools();padDown(i)}
 else if(a==='load'){const f=document.createElement('input');f.type='file';f.accept='audio/*';f.onchange=async()=>{const file=f.files[0];if(!file)return;try{await setSample(S.sel,await file.arrayBuffer());toast('Sound loaded on '+PADS[S.sel]+' ✅');padDown(S.sel)}catch(err){toast('Could not read that sound file')}};f.click()}
 else if(a==='mrec')recSample()
 else if(a==='reset'){await ensureDrums();BUFS[S.sel]=DEF[S.sel];try{await kvDel('smp_'+S.sel)}catch(err){}S.pitch[S.sel]=0;sv();tools();toast('Back to the original sound')}
 else if(a==='send')send()
 else if(a==='open')show('mt')});
document.addEventListener('click',e=>{const cv=e.target.closest('#inCv');if(!cv)return;const r=cv.getBoundingClientRect(),s=Math.floor((e.clientX-r.left)/CW),row=Math.floor((e.clientY-r.top)/RH),m=S.rbase+ROWS-1-row,steps=S.bars*16;
 if(s<0||s>=steps||m<S.rbase)return;const i=S.notes.findIndex(n=>n.m===m&&s>=n.s&&s<n.s+n.l);
 if(i>=0)S.notes.splice(i,1);else{S.notes.push({m,s,l:Math.max(1,Math.min(S.len,steps-s)),v:.85});const c=ac();voice(c,bus(),m,c.currentTime+.01,.85,S.pre)(c.currentTime+.3)}
 sv();drawRoll()});
document.addEventListener('pointerdown',e=>{const k=e.target.closest('#inst .ik');if(k){e.preventDefault();k.setPointerCapture&&k.setPointerCapture(e.pointerId);const r=k.getBoundingClientRect();kbDown(+k.dataset.k,Math.max(.35,Math.min(1,.4+(e.clientY-r.top)/r.height*.7)),e.pointerId);return}
 const p=e.target.closest('#inst .inPad');if(p){e.preventDefault();p.classList.add('hit');padDown(+p.dataset.p)}});
const up=e=>{kbUp(e.pointerId);$$('#inst .inPad.hit').forEach(p=>p.classList.remove('hit'))};
document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
document.addEventListener('input',e=>{if(e.target.id==='inVol'){S.vol=+e.target.value;sv();if(BUS)BUS.gain.value=S.vol/100}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&T.on)stopT()});
const _show=window.show;window.show=function(id){if(id!=='inst'&&(T.on||held.size)){stopT();held.forEach((h,k)=>kbUp(k))}return _show.apply(this,arguments)};
window.LBINST={state:()=>S,render};
R.inst=()=>{if(!built||(!T.on&&!held.size&&!MR))render()};
})();
