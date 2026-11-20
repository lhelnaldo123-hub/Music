/* =====================================================================
   LB Music · MULTITRACK STUDIO  (add-on)
   Load AFTER lb-export.js:  <script src="lb-multi.js"></script>
   A real timeline with:
   · Many tracks, drag clips, trim edges, split, duplicate, delete, move between tracks
   · Record straight into a track while listening to the others (overdub)
   · Add any song from your library or your Recorder take
   · Mixer: volume, pan, mute, solo, live level meters, master volume
   · Per-track effects: EQ (low/mid/high), compressor, reverb, voice presets
   · Loop region, snap-to-beat, zoom, undo / redo, auto-save
   · Export the final mix to My Music (WAV)
   Nothing is removed from the app.
   ===================================================================== */
(()=>{
if(window.__lbMt||typeof R==='undefined')return;window.__lbMt=1;
const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms)),
AC=window.AudioContext||window.webkitAudioContext,OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext,
E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6),
fm=t=>{t=Math.max(0,t);return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')+'.'+Math.floor((t%1)*10)},
kvPut=(id,blob)=>tx('kv','readwrite',k=>k.put({id,blob})),kvGet=id=>tx('kv','readonly',k=>k.get(id));
const FREE_TRACKS=4,PRO_TRACKS=16,HW=96,LH=84;                    // free track limit, pro track limit, header width, lane height
const COL=['#1de9c6','#0aa5ff','#ffb74d','#ff6b7d','#b388ff','#a5d66f','#ff8a65','#4dd0e1'];
const PRE={Flat:[30,0,0,0,0,0],Vocal:[90,-1,3,2,45,12],Bright:[60,-1,2,5,20,0],Warm:[60,4,-1,-3,20,8],Radio:[400,-4,4,-4,60,0],Bass:[30,6,-1,-2,40,0]};

/* ---------------- project ---------------- */
const newTrack=(n,i)=>({id:uid(),name:n||'Track '+(i+1),color:COL[i%COL.length],vol:100,pan:0,mute:0,solo:0,arm:0,fx:{pre:'Flat',hp:30,lo:0,mid:0,hi:0,comp:0,rev:0},clips:[]});
let P=Object.assign({bpm:100,snap:1,pps:40,master:100,loop:{on:false,a:0,b:8},tracks:[]},LS('mtp',null)||{});
if(!P.tracks.length){P.tracks=[newTrack('Beat',0),newTrack('Vocal',1)];P.tracks[1].arm=1}
const save=()=>SV('mtp',P);
let H=[],RE=[];const snap=()=>{H.push(JSON.stringify(P));if(H.length>60)H.shift();RE.length=0};
const pro=()=>typeof isPro==='function'&&isPro();
const spb=()=>60/P.bpm,sn=t=>P.snap?Math.round(t/spb())*spb():t;
const endOf=()=>P.tracks.reduce((m,t)=>t.clips.reduce((a,c)=>Math.max(a,c.start+c.dur),m),0);
const lenSec=()=>Math.max(30,Math.ceil(endOf()+20));
const findClip=id=>{for(const t of P.tracks){const c=t.clips.find(x=>x.id===id);if(c)return[t,c]}return[null,null]};

/* ---------------- audio + buffer cache ---------------- */
let AX=null;const ax=()=>{if(!AX||AX.state==='closed')AX=new AC({latencyHint:'interactive'});return AX};
const BUF={},LOADING={};
const dec=ab=>new Promise((res,rej)=>{const p=ax().decodeAudioData(ab,res,rej);p&&p.then&&p.then(res,rej)});
function peaks(b){const n=Math.ceil(b.duration*100),pk=new Float32Array(n),st=b.sampleRate/100|0;
 for(let c=0;c<Math.min(2,b.numberOfChannels);c++){const d=b.getChannelData(c);for(let i=0;i<n;i++){let m=0;for(let j=i*st,e=Math.min(d.length,j+st);j<e;j+=4){const v=Math.abs(d[j]);if(v>m)m=v}if(m>pk[i])pk[i]=m}}return pk}
async function load(src){
 if(BUF[src])return BUF[src];if(LOADING[src])return LOADING[src];
 return LOADING[src]=(async()=>{try{
  const id=src.slice(2),r=src[0]==='s'?await tx('blobs','readonly',b=>b.get(id)):await kvGet(id);
  if(!r||!r.blob)throw 0;const buf=await dec(await r.blob.arrayBuffer());BUF[src]={buf,pk:peaks(buf)};return BUF[src]}catch(e){BUF[src]={bad:1};return BUF[src]}
  finally{delete LOADING[src]}})()}
function needLoad(){let any=false;P.tracks.forEach(t=>t.clips.forEach(c=>{if(!BUF[c.src]&&!LOADING[c.src]){any=true;load(c.src).then(()=>{if(PAGE==='mt'&&!drag)render()})}}));return any}
function wavMono(d,sr){const n=d.length,b=new ArrayBuffer(44+n*2),h=new DataView(b),w=(p,s)=>[...s].forEach((c,i)=>h.setUint8(p+i,c.charCodeAt(0)));
 w(0,'RIFF');h.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,1,true);h.setUint32(24,sr,true);h.setUint32(28,sr*2,true);h.setUint16(32,2,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){const v=Math.max(-1,Math.min(1,d[i]));h.setInt16(44+i*2,v<0?v*32768:v*32767,true)}return new Blob([b],{type:'audio/wav'})}

/* ---------------- mixer graph (used live and for export) ---------------- */
function anySolo(){return P.tracks.some(t=>t.solo)}
const eff=t=>(t.mute||(anySolo()&&!t.solo))?0:t.vol/100;
function applyFx(n,t,ctx){const f=t.fx,at=ctx.currentTime;
 n.hp.frequency.setTargetAtTime(Math.max(20,f.hp),at,.01);n.lo.gain.setTargetAtTime(f.lo,at,.01);n.mid.gain.setTargetAtTime(f.mid,at,.01);n.hi.gain.setTargetAtTime(f.hi,at,.01);
 n.cm.threshold.value=f.comp?-10-f.comp*.3:0;n.cm.ratio.value=f.comp?2+f.comp/100*6:1;n.mk.gain.setTargetAtTime(1+f.comp/100*.5,at,.01);n.send.gain.setTargetAtTime(f.rev/100*.8,at,.01);
 n.vol.gain.setTargetAtTime(eff(t),at,.01);n.pan.pan.setTargetAtTime(t.pan/100,at,.01)}
function buildGraph(ctx,dest,live){
 const G={ctx,tr:{},src:[]},mg=ctx.createGain();mg.gain.value=P.master/100;
 const lim=ctx.createDynamicsCompressor();lim.threshold.value=-3;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.002;lim.release.value=.1;mg.connect(lim);lim.connect(dest);G.master=mg;
 const len=Math.round(ctx.sampleRate*1.8),ir=ctx.createBuffer(2,len,ctx.sampleRate);for(let c=0;c<2;c++){const d=ir.getChannelData(c);let lp=0;for(let i=0;i<len;i++){lp+=((Math.random()*2-1)-lp)*(.5-.42*i/len);d[i]=lp*1.9*Math.pow(1-i/len,3)}}
 const cv=ctx.createConvolver();cv.buffer=ir;const rg=ctx.createGain();rg.gain.value=.7;cv.connect(rg);rg.connect(mg);
 if(live){G.an=ctx.createAnalyser();G.an.fftSize=512;lim.connect(G.an)}
 P.tracks.forEach(t=>{const bq=(ty,fr,q)=>{const x=ctx.createBiquadFilter();x.type=ty;x.frequency.value=fr;x.Q.value=q||.7;return x},
  n={in:ctx.createGain(),hp:bq('highpass',30),lo:bq('lowshelf',200),mid:bq('peaking',2500,.8),hi:bq('highshelf',8000),cm:ctx.createDynamicsCompressor(),mk:ctx.createGain(),vol:ctx.createGain(),pan:ctx.createStereoPanner?ctx.createStereoPanner():null,send:ctx.createGain()};
  if(!n.pan){n.pan={pan:{value:0,setTargetAtTime(){}},connect(x){n.vol.connect(x)}};}
  n.cm.knee.value=10;n.cm.attack.value=.008;n.cm.release.value=.18;
  n.in.connect(n.hp);n.hp.connect(n.lo);n.lo.connect(n.mid);n.mid.connect(n.hi);n.hi.connect(n.cm);n.cm.connect(n.mk);n.mk.connect(n.vol);
  if(ctx.createStereoPanner){n.vol.connect(n.pan);n.pan.connect(mg)}else n.vol.connect(mg);
  n.mk.connect(n.send);n.send.connect(cv);
  if(live){n.an=ctx.createAnalyser();n.an.fftSize=512;n.vol.connect(n.an)}
  applyFx(n,t,ctx);G.tr[t.id]=n});
 return G}
function schedule(G,pos0,t0,until){
 P.tracks.forEach(t=>{const n=G.tr[t.id];t.clips.forEach(c=>{const b=BUF[c.src];if(!b||!b.buf)return;
  const ce=c.start+c.dur;if(ce<=pos0||c.start>=(until||1e9))return;
  const skip=Math.max(0,pos0-c.start),when=t0+Math.max(0,c.start-pos0),off=c.off+skip,d=c.dur-skip;if(d<=0.001)return;
  const s=G.ctx.createBufferSource();s.buffer=b.buf;const g=G.ctx.createGain(),v=c.gain/100;
  g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(v,when+.006);g.gain.setValueAtTime(v,when+Math.max(.007,d-.008));g.gain.linearRampToValueAtTime(0,when+d);
  s.connect(g);g.connect(n.in);s.start(when,off,d);G.src.push(s)})})}

/* ---------------- transport ---------------- */
let G=null,playing=false,POS=0,POS0=0,T0P=0,RAF=0,REC=false,drag=null,sel='',selT='',built=false,CAP=null;
const curPos=()=>playing?Math.max(POS0,POS0+(AX.currentTime-T0P)):POS;
async function play(from,t0){
 if(playing)halt(true);const ac=ax();if(ac.state==='suspended')await ac.resume();
 if(needLoad()){toast('Loading your audio…');await Promise.all(Object.values(LOADING));}
 POS=POS0=from;T0P=t0||ac.currentTime+.08;G=buildGraph(ac,ac.destination,true);
 schedule(G,POS0,T0P,P.loop.on&&from<P.loop.b?P.loop.b:0);playing=true;setPlayBtn();loop()}
function halt(keep){
 if(G){G.src.forEach(s=>{try{s.stop()}catch(e){}});try{G.master.disconnect()}catch(e){}G=null}
 if(playing&&!keep)POS=Math.min(curPos(),lenSec());playing=false;cancelAnimationFrame(RAF);setPlayBtn();placeHead()}
function stopAll(){if(REC)recStop();halt();}
function loop(){
 RAF=requestAnimationFrame(loop);
 if(PAGE!=='mt'){stopAll();closeMic();return}
 const p=curPos();POS=p;
 if(P.loop.on&&P.loop.b>P.loop.a&&p>=P.loop.b&&!REC){const a=P.loop.a;halt(true);play(a);return}
 if(p>=lenSec()&&!REC){halt();return}
 placeHead();meters();
 const sc=$('#mtSc');if(sc&&!drag){const x=HW+p*P.pps;if(x>sc.scrollLeft+sc.clientWidth-30||x<sc.scrollLeft+HW)sc.scrollLeft=Math.max(0,x-HW-40)}}

/* ---------------- recording into the armed track ---------------- */
let ST=null,SRC=null,NODE=null,SIL=null,WL=false;
function closeMic(){try{NODE&&NODE.disconnect()}catch(e){}try{SRC&&SRC.disconnect()}catch(e){}if(ST)ST.getTracks().forEach(t=>t.stop());ST=SRC=NODE=null}
async function openMic(){
 if(ST)return;const ac=ax();if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('unsupported');
 const rc=LS('rc',null)||{},a={echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1};if(rc.dev)a.deviceId={ideal:rc.dev};
 ST=await navigator.mediaDevices.getUserMedia({audio:a});if(ac.state==='suspended')await ac.resume();
 SRC=ac.createMediaStreamSource(ST);let n=null;
 if(ac.audioWorklet&&window.AudioWorkletNode){try{
  if(!WL){const code=`class P extends AudioWorkletProcessor{constructor(){super();this.s=0;this.on=false;this.port.onmessage=e=>{if(e.data.start!==undefined){this.s=e.data.start;this.on=true}else this.on=false}}process(i){const c=i[0]&&i[0][0];if(this.on&&c&&currentTime>=this.s)this.port.postMessage(c.slice(0));return true}}registerProcessor('lbmt',P)`;
   await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([code],{type:'application/javascript'})));WL=true}
  n=new AudioWorkletNode(ac,'lbmt',{numberOfInputs:1,numberOfOutputs:1,channelCount:1,channelCountMode:'explicit'});n.isW=1;n.port.onmessage=e=>{if(REC&&CAP)CAP.ch.push(e.data)}}catch(e){n=null}}
 if(!n){n=ac.createScriptProcessor(4096,1,1);n.onaudioprocess=e=>{if(REC&&CAP&&ac.currentTime>=CAP.t0)CAP.ch.push(new Float32Array(e.inputBuffer.getChannelData(0)))}}
 NODE=n;SRC.connect(n);if(!SIL){SIL=ac.createGain();SIL.gain.value=0;SIL.connect(ac.destination)}n.connect(SIL)}
async function recStart(){
 const t=P.tracks.find(x=>x.arm);if(!t)return toast('Tap R on a track to choose where to record');
 if(REC)return;
 try{await openMic()}catch(e){return toast(e.name==='NotAllowedError'?'Microphone is blocked. Allow it in your browser settings.':'Could not open the microphone')}
 const ac=ax(),t0=ac.currentTime+.3,from=POS;CAP={ch:[],t0,from,tid:t.id};REC=true;
 if(NODE.isW)NODE.port.postMessage({start:t0});
 await play(from,t0);setPlayBtn();toast('Recording… use headphones')}
async function recStop(){
 if(!REC)return;REC=false;const c=CAP;CAP=null;if(NODE&&NODE.isW)NODE.port.postMessage({stop:1});halt();
 const ac=ax(),sr=ac.sampleRate;let n=0;c.ch.forEach(x=>n+=x.length);
 const rc=LS('rc',null)||{},trim=Math.round(((ac.baseLatency||0)+(ac.outputLatency||0))*sr+(rc.sync||0)/1000*sr),all=new Float32Array(n);let o=0;c.ch.forEach(x=>{all.set(x,o);o+=x.length});
 const d=all.subarray(Math.min(trim,all.length));if(d.length<sr*.3){render();return toast('Too short — nothing added')}
 const id='mt_'+uid(),blob=wavMono(d,sr),b=ac.createBuffer(1,d.length,sr);b.copyToChannel(Float32Array.from(d),0);
 try{await kvPut(id,blob)}catch(e){toast('Could not store the recording on this phone')}
 BUF['k:'+id]={buf:b,pk:peaks(b)};const t=P.tracks.find(x=>x.id===c.tid);if(!t)return;
 snap();t.clips.push({id:uid(),src:'k:'+id,start:c.from,off:0,dur:b.duration,gain:100,name:'Take '+(t.clips.length+1)});save();sel=t.clips[t.clips.length-1].id;POS=c.from;render();toast('Recorded ✅')}

/* ---------------- UI: styles + page ---------------- */
const css=document.createElement('style');css.textContent=`
#mt{max-width:none;padding:12px 10px 170px}
#mt .mtT{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
#mt .mtT button,.mtB button{height:40px;min-width:40px;padding:0 12px;border-radius:12px;background:var(--card);color:#fff;font-size:15px;font-weight:700}
#mt .mtT button.on{background:var(--ac);color:#04201c}#mt .mtT button.rc{background:#e5384f}#mt .mtT button.rc.on{background:#fff;color:#e5384f}
#mt .mtTm{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;min-width:86px}
#mtSc{overflow:auto;background:#00000033;border-radius:14px;position:relative;-webkit-overflow-scrolling:touch}
#mtIn{position:relative;min-width:max-content}
.mtR{display:flex;height:${LH}px;border-bottom:1px solid #ffffff10}.mtR.ru{height:28px;position:sticky;top:0;z-index:6;background:#12151b}
.mtH{position:sticky;left:0;z-index:5;width:${HW}px;flex:none;background:#171b22;border-right:1px solid #ffffff18;padding:6px 6px 6px 8px;display:flex;flex-direction:column;justify-content:space-between}
.mtR.ru .mtH{height:28px;padding:0;background:#12151b}
.mtH .nm{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:3px solid var(--tc);padding-left:6px}
.mtH .bt{display:flex;gap:4px}.mtH .bt button{width:24px;height:24px;border-radius:7px;background:#ffffff14;color:#fff;font-size:11px;font-weight:800}
.mtH .bt button.m.on{background:#ff6b7d;color:#fff}.mtH .bt button.s.on{background:#ffd54a;color:#222}.mtH .bt button.r.on{background:#e5384f;color:#fff}
.mtH .mt{height:4px;border-radius:3px;background:#ffffff18;overflow:hidden}.mtH .mt i{display:block;height:100%;width:0;background:var(--tc)}
.mtL{position:relative;flex:none;height:100%}
.mtCl{position:absolute;top:6px;bottom:6px;border-radius:9px;overflow:hidden;background:color-mix(in srgb,var(--tc) 22%,#10131a);border:1.5px solid color-mix(in srgb,var(--tc) 70%,#000);cursor:pointer}
.mtCl.sel{border-color:#fff;touch-action:none;z-index:3}.mtCl canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.mtCl span{position:absolute;left:6px;top:2px;font-size:10px;font-weight:700;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none;white-space:nowrap}
.mtCl .hd{position:absolute;top:0;bottom:0;width:22px;background:#ffffffaa;z-index:4;touch-action:none}.mtCl .hd.l{left:0;border-radius:8px 0 0 8px}.mtCl .hd.r{right:0;border-radius:0 8px 8px 0}
.mtRu{position:relative;height:28px;flex:none;touch-action:none}.mtRu b{position:absolute;top:6px;font-size:10px;color:var(--mut);font-weight:600;padding-left:3px;border-left:1px solid #ffffff25;height:16px}
.mtLp{position:absolute;top:0;bottom:0;background:#1de9c622;border-left:2px solid var(--ac);border-right:2px solid var(--ac);pointer-events:none}
#mtPh{position:absolute;top:0;bottom:0;width:2px;background:#fff;z-index:7;pointer-events:none;box-shadow:0 0 6px #fff8}
.mtB{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}.mtB .mut{font-size:12px}
.mtB input[type=range]{width:110px;margin:0;padding:0}
#mtSheet,#mtAdd{position:fixed;inset:0;background:#000a;z-index:150;display:none;align-items:flex-end}#mtSheet.on,#mtAdd.on{display:flex}
.mtSh{background:#161a21;border-radius:22px 22px 0 0;width:100%;max-width:760px;margin:auto;padding:16px 16px calc(18px + env(safe-area-inset-bottom));max-height:86vh;overflow:auto}
.mtSh h3{margin-bottom:10px}.mtSh .rl{display:flex;align-items:center;gap:10px;font-size:13px;margin:9px 0}.mtSh .rl span{width:78px;flex:none;color:var(--mut)}.mtSh .rl input{margin:0;padding:0}.mtSh .rl b{width:44px;text-align:right;flex:none;font-size:12px}
.mtSh .ch{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.mtSh .ch button{padding:8px 13px;border-radius:18px;background:#ffffff14;color:#fff;font-size:13px}.mtSh .ch button.on{background:var(--ac);color:#04201c;font-weight:700}
.mtSh select,.mtSh input[type=text]{width:100%;padding:11px;border-radius:12px;background:#1b1f27;color:#fff;border:1px solid #2a303b;font-size:14px;margin:0 0 8px}
.mtSh .act{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.mtSh .act button{flex:1;min-width:110px;padding:13px;border-radius:14px;background:#ffffff14;color:#fff;font-size:13px;font-weight:700}.mtSh .act .pr{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#04201c}.mtSh .act .dn{background:#e5384f33;color:#ff8a98}
`;document.head.append(css);
document.body.insertAdjacentHTML('beforeend',`<section id="mt" class="page"><div class="top"><button class="ic" onclick="back()">‹</button><h3>🎚 Multitrack</h3><span class="r"><button class="ic" id="mtUn">↶</button><button class="ic" id="mtRe">↷</button></span></div><div id="mtBody"></div></section><div id="mtSheet"><div class="mtSh" id="mtShB"></div></div><div id="mtAdd"><div class="mtSh" id="mtAddB"></div></div>`);
const act=document.querySelector('.action');if(act)act.insertAdjacentHTML('beforeend','<button onclick="show(\'mt\')">🎚<br>Multitrack</button>');

/* ---------------- UI: render ---------------- */
const px=t=>t*P.pps;
function drawWave(cv,c,col){
 const b=BUF[c.src];if(!b||!b.pk)return;const w=Math.min(8192,Math.max(8,Math.ceil(px(c.dur)))),h=LH-12;cv.width=w;cv.height=h;const x=cv.getContext('2d');x.fillStyle=col;
 const bw=Math.max(1,w/Math.max(1,c.dur*100));
 for(let i=0;i<w;i+=2){const t=c.off+(i/w)*c.dur,k=Math.min(b.pk.length-1,Math.floor(t*100)),v=Math.min(1,b.pk[k]*1.1),bh=Math.max(1,v*h*.9);x.fillRect(i,(h-bh)/2,1.4,bh)}}
function render(){
 const body=$('#mtBody');if(!body)return;built=true;const L=lenSec(),W=px(L),sc=$('#mtSc'),sl=sc?sc.scrollLeft:0,st=sc?sc.scrollTop:0;
 let html=`<div class="mtT"><button id="mtRw">⏮</button><button id="mtPl" class="on">▶</button><button id="mtRc" class="rc">⏺</button><button id="mtLp" class="${P.loop.on?'on':''}">🔁</button><span class="mtTm" id="mtTm">0:00.0</span>
  <button id="mtBm">−</button><span style="font-weight:800;min-width:34px;text-align:center" id="mtBv">${P.bpm}</span><button id="mtBp">+</button><span class="mut" style="font-size:11px">BPM</span>
  <button id="mtSn" class="${P.snap?'on':''}">🧲</button><button id="mtZm">🔍−</button><button id="mtZp">🔍+</button></div>
  <div id="mtSc"><div id="mtIn" style="width:${HW+W}px"><div id="mtPh"></div>
  <div class="mtR ru"><div class="mtH"></div><div class="mtRu" id="mtRu" style="width:${W}px">`;
 const step=P.pps>=80?1:P.pps>=40?2:P.pps>=20?5:10;for(let s=0;s<=L;s+=step)html+=`<b style="left:${px(s)}px">${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}</b>`;
 html+=`${P.loop.on?`<div class="mtLp" style="left:${px(P.loop.a)}px;width:${px(P.loop.b-P.loop.a)}px"></div>`:''}</div></div>`;
 P.tracks.forEach((t,ti)=>{html+=`<div class="mtR" style="--tc:${t.color}"><div class="mtH" data-t="${t.id}"><div class="nm" data-a="sh" data-t="${t.id}">${E(t.name)}</div><div class="bt"><button class="m ${t.mute?'on':''}" data-a="m" data-t="${t.id}">M</button><button class="s ${t.solo?'on':''}" data-a="s" data-t="${t.id}">S</button><button class="r ${t.arm?'on':''}" data-a="r" data-t="${t.id}">R</button></div><div class="mt"><i id="mm_${t.id}"></i></div></div>
   <div class="mtL" data-lane="${t.id}" style="width:${W}px;background-image:linear-gradient(90deg,#ffffff12 1px,transparent 1px);background-size:${px(spb())}px 100%">`;
  t.clips.forEach(c=>{const b=BUF[c.src];html+=`<div class="mtCl ${c.id===sel?'sel':''}" data-c="${c.id}" style="left:${px(c.start)}px;width:${Math.max(6,px(c.dur))}px"><canvas></canvas><span>${E(c.name||'')}${b&&b.bad?' ⚠️ missing':!b?' …':''}</span>${c.id===sel?'<div class="hd l" data-h="l"></div><div class="hd r" data-h="r"></div>':''}</div>`});
  html+=`</div></div>`});
 html+=`</div></div>
  <div class="mtB" id="mtSelB"></div>
  <div class="mtB"><button id="mtAT">＋ Track</button><button id="mtAA">＋ Add audio</button><span class="mut">Master</span><input type="range" id="mtMs" min="0" max="150" value="${P.master}"><button id="mtEx">💾 Save mix to my music</button></div>
  <div class="mut" style="margin-top:10px;font-size:12px;line-height:1.5">Tap a clip to select it, then drag to move it. Drag the white edges to trim. Tap a track name for volume, pan and effects. Tap <b>R</b> to choose where to record, then press ⏺ (use headphones).</div>`;
 body.innerHTML=html;
 const sc2=$('#mtSc');sc2.scrollLeft=sl;sc2.scrollTop=st;
 P.tracks.forEach(t=>t.clips.forEach(c=>{const el=body.querySelector(`[data-c="${c.id}"] canvas`);if(el)drawWave(el,c,t.color)}));
 setPlayBtn();placeHead();selBar();bind();needLoad()}
function setPlayBtn(){const p=$('#mtPl'),r=$('#mtRc');if(p)p.textContent=playing&&!REC?'⏸':'▶';if(r)r.classList.toggle('on',REC)}
function placeHead(){const h=$('#mtPh'),t=$('#mtTm'),p=playing?curPos():POS;if(h)h.style.left=(HW+px(p))+'px';if(t)t.textContent=fm(p)}
function meters(){if(!G)return;const b=new Float32Array(256);P.tracks.forEach(t=>{const n=G.tr[t.id],e=$('#mm_'+t.id);if(!n||!n.an||!e)return;n.an.getFloatTimeDomainData(b);let p=0;for(let i=0;i<b.length;i++){const v=Math.abs(b[i]);if(v>p)p=v}e.style.width=Math.min(100,Math.sqrt(p)*100)+'%'})}
function selBar(){
 const el=$('#mtSelB');if(!el)return;const [t,c]=findClip(sel);
 if(!c){el.innerHTML='<span class="mut">No clip selected</span>';return}
 el.innerHTML=`<button id="cSp">✂️ Split</button><button id="cDp">⧉ Copy</button><button id="cDl">🗑</button><span class="mut">Clip volume</span><input type="range" id="cG" min="0" max="200" value="${c.gain}">`;
 $('#cSp').onclick=()=>{const p=POS;if(p<=c.start+.05||p>=c.start+c.dur-.05)return toast('Move the playhead inside the clip first, then split');snap();const d=p-c.start,n2={...c,id:uid(),start:p,off:c.off+d,dur:c.dur-d};c.dur=d;t.clips.push(n2);sel=n2.id;save();render()};
 $('#cDp').onclick=()=>{snap();const n2={...c,id:uid(),start:c.start+c.dur,name:c.name};t.clips.push(n2);sel=n2.id;save();render()};
 $('#cDl').onclick=()=>{snap();t.clips=t.clips.filter(x=>x!==c);sel='';save();render()};
 $('#cG').oninput=e=>{c.gain=+e.target.value;save()};$('#cG').onchange=()=>{}}

/* ---------------- UI: events ---------------- */
function laneAt(y){const ls=[...document.querySelectorAll('.mtL')];for(const l of ls){const r=l.getBoundingClientRect();if(y>=r.top&&y<=r.bottom)return l.dataset.lane}return null}
function bind(){
 const body=$('#mtBody');
 $('#mtPl').onclick=()=>{if(REC)return recStop();playing?halt():play(POS)};
 $('#mtRc').onclick=()=>REC?recStop():recStart();
 $('#mtRw').onclick=()=>{if(playing){halt(true);POS=0;play(0)}else{POS=0;placeHead();const s=$('#mtSc');if(s)s.scrollLeft=0}};
 $('#mtLp').onclick=()=>{if(!P.loop.on){P.loop.a=sn(POS);P.loop.b=Math.max(P.loop.a+spb()*4,sn(POS+spb()*8))}P.loop.on=!P.loop.on;save();render();if(P.loop.on)toast('Loop on. Drag the ruler to move the start, long-press the ruler to move the end')};
 $('#mtBm').onclick=()=>{P.bpm=Math.max(40,P.bpm-1);save();render()};$('#mtBp').onclick=()=>{P.bpm=Math.min(240,P.bpm+1);save();render()};
 $('#mtSn').onclick=()=>{P.snap=P.snap?0:1;save();render()};
 $('#mtZm').onclick=()=>{P.pps=Math.max(10,Math.round(P.pps/1.5));save();render()};$('#mtZp').onclick=()=>{P.pps=Math.min(200,Math.round(P.pps*1.5));save();render()};
 $('#mtMs').oninput=e=>{P.master=+e.target.value;save();if(G)G.master.gain.value=P.master/100};
 $('#mtAT').onclick=()=>{if(P.tracks.length>=(pro()?PRO_TRACKS:FREE_TRACKS))return proGate('More than '+FREE_TRACKS+' tracks');snap();P.tracks.push(newTrack('',P.tracks.length));save();render()};
 $('#mtAA').onclick=openAdd;$('#mtEx').onclick=exportMix;
 /* ruler: tap = move playhead; long-press = loop end */
 const ru=$('#mtRu');let lp=0,moved=false;
 ru.onpointerdown=e=>{moved=false;const r=ru.getBoundingClientRect(),t=Math.max(0,(e.clientX-r.left)/P.pps);lp=setTimeout(()=>{if(P.loop.on){P.loop.b=Math.max(P.loop.a+spb(),sn(t));save();render()}lp=0},550);ru.setPointerCapture(e.pointerId);ru._t=t};
 ru.onpointermove=e=>{const r=ru.getBoundingClientRect(),t=Math.max(0,(e.clientX-r.left)/P.pps);if(Math.abs(t-ru._t)>.15){moved=true;clearTimeout(lp);lp=0}
  if(moved&&ru.hasPointerCapture(e.pointerId)){if(playing)halt(true);POS=sn(t);placeHead()}};
 ru.onpointerup=e=>{if(lp){clearTimeout(lp);lp=0;if(!moved){const r=ru.getBoundingClientRect(),t=Math.max(0,(e.clientX-r.left)/P.pps);const was=playing;if(was)halt(true);POS=sn(t);placeHead();if(was)play(POS)}}};
 /* headers */
 body.querySelectorAll('.mtH [data-a]').forEach(b=>b.onclick=e=>{e.stopPropagation();const t=P.tracks.find(x=>x.id===b.dataset.t);if(!t)return;
  if(b.dataset.a==='sh')return sheet(t);
  if(b.dataset.a==='r'){P.tracks.forEach(x=>x.arm=0);t.arm=1}else t[b.dataset.a==='m'?'mute':'solo']=t[b.dataset.a==='m'?'mute':'solo']?0:1;
  save();if(G)P.tracks.forEach(x=>applyFx(G.tr[x.id],x,G.ctx));render()});
 /* lanes: tap empty = playhead; clips: select / drag / trim */
 body.querySelectorAll('.mtL').forEach(l=>l.onclick=e=>{if(e.target!==l)return;const r=l.getBoundingClientRect(),t=sn(Math.max(0,(e.clientX-r.left)/P.pps)),was=playing;if(was)halt(true);POS=t;sel='';placeHead();if(was)play(POS);else render()});
 body.querySelectorAll('.mtCl').forEach(el=>{
  const id=el.dataset.c;
  el.onpointerdown=e=>{
   const [t,c]=findClip(id);if(!c)return;const h=e.target.dataset&&e.target.dataset.h;
   if(sel!==id){drag={tap:id,x:e.clientX,y:e.clientY};el.onpointerup=ev=>{if(drag&&drag.tap===id&&Math.abs(ev.clientX-drag.x)<8&&Math.abs(ev.clientY-drag.y)<8){sel=id;drag=null;render()}else drag=null};return}
   e.preventDefault();el.setPointerCapture(e.pointerId);snap();drag={id,h:h||'m',x:e.clientX,y:e.clientY,s:c.start,o:c.off,d:c.dur,tid:t.id,moved:false}};
  el.onpointermove=e=>{if(!drag||drag.id!==id)return;const [t,c]=findClip(id),dx=(e.clientX-drag.x)/P.pps;if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>3)drag.moved=true;
   const b=BUF[c.src],max=b&&b.buf?b.buf.duration:1e9;
   if(drag.h==='m'){c.start=Math.max(0,sn(drag.s+dx));el.style.left=px(c.start)+'px';const ln=laneAt(e.clientY);if(ln)drag.over=ln}
   else if(drag.h==='l'){let ns=Math.max(0,sn(drag.s+dx)),dd=ns-drag.s;if(drag.o+dd<0){dd=-drag.o;ns=drag.s+dd}if(drag.d-dd<.1){dd=drag.d-.1;ns=drag.s+dd}c.start=ns;c.off=drag.o+dd;c.dur=drag.d-dd;el.style.left=px(c.start)+'px';el.style.width=px(c.dur)+'px'}
   else{c.dur=Math.max(.1,Math.min(max-c.off,sn(drag.s+drag.d+dx)-c.start));el.style.width=px(c.dur)+'px'}
   placeHead()};
  el.onpointerup=e=>{if(!drag||drag.id!==id)return;const d=drag;drag=null;const [t,c]=findClip(id);
   if(!d.moved){H.pop();return}
   if(d.h==='m'&&d.over&&d.over!==t.id){const nt=P.tracks.find(x=>x.id===d.over);if(nt){t.clips=t.clips.filter(x=>x!==c);nt.clips.push(c)}}
   save();render()};
  el.onpointercancel=()=>{if(drag&&drag.id===id){drag=null;H.pop();render()}}})}

/* ---------------- sheets: track settings + add audio ---------------- */
function sheet(t){
 const s=$('#mtSheet'),b=$('#mtShB');s.classList.add('on');
 const row=(l,k,min,max,u)=>`<div class="rl"><span>${l}</span><input type="range" data-k="${k}" min="${min}" max="${max}" value="${k.startsWith('fx.')?t.fx[k.slice(3)]:t[k]}"><b>${k.startsWith('fx.')?t.fx[k.slice(3)]:t[k]}${u||''}</b></div>`;
 b.innerHTML=`<h3>${E(t.name)}</h3><input type="text" id="tN" value="${E(t.name)}" maxlength="20">
  ${row('Volume','vol',0,150,'%')}${row('Pan (L / R)','pan',-100,100,'')}
  <div class="mut" style="font-size:12px;margin:10px 0 2px">Effects</div><div class="ch" id="tPre"></div>
  ${row('Low','fx.lo',-12,12,' dB')}${row('Mid','fx.mid',-12,12,' dB')}${row('High','fx.hi',-12,12,' dB')}${row('Compressor','fx.comp',0,100,'%')}${row('Reverb','fx.rev',0,100,'%')}
  <div class="act"><button class="pr" id="tOk">Done</button><button class="dn" id="tDel">🗑 Delete track</button></div>`;
 const chips=()=>{const e=$('#tPre');e.innerHTML='';Object.keys(PRE).forEach(k=>{const x=document.createElement('button');x.textContent=k;if(t.fx.pre===k)x.className='on';x.onclick=()=>{const v=PRE[k];Object.assign(t.fx,{pre:k,hp:v[0],lo:v[1],mid:v[2],hi:v[3],comp:v[4],rev:v[5]});save();apply();sheet(t)};e.append(x)})},
  apply=()=>{if(G&&G.tr[t.id])applyFx(G.tr[t.id],t,G.ctx);else if(G)P.tracks.forEach(x=>applyFx(G.tr[x.id],x,G.ctx))};
 chips();
 b.querySelectorAll('input[type=range]').forEach(r=>r.oninput=()=>{const k=r.dataset.k,v=+r.value;if(k.startsWith('fx.')){t.fx[k.slice(3)]=v;t.fx.pre='Custom'}else t[k]=v;r.nextElementSibling.textContent=v+(k==='vol'||k==='fx.comp'||k==='fx.rev'?'%':k.startsWith('fx.')?' dB':'');save();apply()});
 $('#tN').onchange=e=>{t.name=e.target.value.trim()||t.name;save()};
 $('#tOk').onclick=()=>{s.classList.remove('on');render()};
 $('#tDel').onclick=()=>{if(P.tracks.length<=1)return toast('Keep at least one track');if(!confirm('Delete "'+t.name+'" and its clips?'))return;snap();P.tracks=P.tracks.filter(x=>x!==t);if(!P.tracks.some(x=>x.arm))P.tracks[0].arm=1;save();s.classList.remove('on');render()};
 s.onclick=e=>{if(e.target===s){s.classList.remove('on');render()}}}

function openAdd(){
 const s=$('#mtAdd'),b=$('#mtAddB');s.classList.add('on');const tk=window.LBREC?window.LBREC.take():null;
 const songs=(S.songs||[]).filter(x=>x.src!=='online').slice().sort((a,b)=>(a.title||'').localeCompare(b.title||''));
 b.innerHTML=`<h3>Add audio</h3><div class="mut" style="font-size:12px;margin-bottom:4px">From my music</div><select id="aS"><option value="">Choose a song…</option>${songs.map(x=>`<option value="${E(x.id)}">${E(x.title||x.name)}${x.artist?' — '+E(x.artist):''}</option>`).join('')}</select>
  <div class="mut" style="font-size:12px;margin:6px 0 4px">Add to</div><select id="aT">${P.tracks.map(t=>`<option value="${t.id}" ${t.arm?'selected':''}>${E(t.name)}</option>`).join('')}</select>
  <div class="act"><button class="pr" id="aGo">Add song at playhead</button>${tk?'<button id="aTk">🎙 Add my Recorder take</button>':''}<button id="aX">Cancel</button></div>`;
 const close=()=>s.classList.remove('on');
 $('#aX').onclick=close;s.onclick=e=>{if(e.target===s)close()};
 $('#aGo').onclick=async()=>{const id=$('#aS').value,t=P.tracks.find(x=>x.id===$('#aT').value);if(!id||!t)return toast('Choose a song');close();toast('Loading…');
  const r=await load('s:'+id);if(r.bad)return toast('Could not read that song');const so=S.songs.find(x=>x.id===id);snap();
  t.clips.push({id:uid(),src:'s:'+id,start:sn(POS),off:0,dur:r.buf.duration,gain:100,name:(so&&(so.title||so.name))||'Song'});save();render()};
 if(tk)$('#aTk').onclick=async()=>{const t=P.tracks.find(x=>x.id===$('#aT').value);if(!t)return;close();const ac=ax(),d=tk.d,id='mt_'+uid(),b2=ac.createBuffer(1,d.length,tk.sr);b2.copyToChannel(Float32Array.from(d),0);
  try{await kvPut(id,wavMono(d,tk.sr))}catch(e){return toast('Could not store it on this phone')}
  BUF['k:'+id]={buf:b2,pk:peaks(b2)};snap();t.clips.push({id:uid(),src:'k:'+id,start:sn(POS),off:0,dur:b2.duration,gain:100,name:'Recorder take'});save();render()}}

/* ---------------- export the mix ---------------- */
let exporting=false;
async function exportMix(){
 if(exporting)return;if(!endOf())return toast('Add some audio first');if(!OAC)return toast('This phone cannot save mixes in the browser');
 const name=prompt('Name your song','My Mix');if(!name)return;exporting=true;stopAll();const btn=$('#mtEx');
 try{
  btn.textContent='Loading audio…';await Promise.all(P.tracks.flatMap(t=>t.clips.map(c=>load(c.src))));
  const sr=44100,total=Math.ceil((endOf()+2)*sr);btn.textContent='Mixing…';await sleep(30);
  const oc=new OAC(2,total,sr),g=buildGraph(oc,oc.destination,false);schedule(g,0,0.01,0);
  const out=await oc.startRendering(),n=out.length,ch=[out.getChannelData(0),out.getChannelData(1)];
  let pk=0;for(let c=0;c<2;c++)for(let i=0;i<n;i+=3)if(Math.abs(ch[c][i])>pk)pk=Math.abs(ch[c][i]);const gn=pk>.001?Math.min(2,.97/pk):1;
  const parts=[],h=new DataView(new ArrayBuffer(44)),w=(p,s)=>[...s].forEach((c,i)=>h.setUint8(p+i,c.charCodeAt(0))),by=n*4;
  w(0,'RIFF');h.setUint32(4,36+by,true);w(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,2,true);h.setUint32(24,sr,true);h.setUint32(28,sr*4,true);h.setUint16(32,4,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,by,true);parts.push(h.buffer);
  for(let o=0;o<n;o+=65536){const m=Math.min(65536,n-o),a=new Int16Array(m*2);for(let i=0;i<m;i++)for(let c=0;c<2;c++){const v=Math.max(-1,Math.min(1,ch[c][o+i]*gn));a[i*2+c]=v<0?v*32768:v*32767}parts.push(a.buffer);if((o/65536)%6===0)await sleep(0)}
  const nm=(name.replace(/[\\/:*?"<>|]/g,'').trim()||'My Mix'),f=new File(parts,nm+'.wav',{type:'audio/wav'});
  await addFiles([f],'file');const s=S.songs.find(x=>x.name===f.name&&x.size===f.size);if(s){s.title=name;s.artist='Me (LB Multitrack)';s.album='My Songs';await dbPut(s)}
  toast('Saved! Find it in Music → My Songs. Use 📦 Export for MP3.');refresh()
 }catch(e){toast('Could not mix this project. Try fewer or shorter tracks.')}
 exporting=false;const b2=$('#mtEx');if(b2)b2.textContent='💾 Save mix to my music'}

/* ---------------- undo / redo, lifecycle ---------------- */
$('#mtUn').onclick=()=>{if(!H.length||REC)return toast('Nothing to undo');if(playing)halt();RE.push(JSON.stringify(P));P=JSON.parse(H.pop());save();render()};
$('#mtRe').onclick=()=>{if(!RE.length||REC)return toast('Nothing to redo');if(playing)halt();H.push(JSON.stringify(P));P=JSON.parse(RE.pop());save();render()};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(playing||REC))stopAll()});
window.LBMT={get:()=>P,pos:v=>{POS=v},render,
 bpm:v=>{if(v){P.bpm=Math.max(40,Math.min(240,Math.round(v)));save();if(PAGE==='mt')render()}return P.bpm},
 /* used by lb-instruments.js: put a rendered mono clip on a track (made if needed) at the playhead */
 async addClip(d,sr,name,tname){const lim=pro()?PRO_TRACKS:FREE_TRACKS;let t=P.tracks.find(x=>x.name===tname);
  if(!t){if(P.tracks.length>=lim)t=P.tracks.find(x=>!x.clips.length)||P.tracks[P.tracks.length-1];else{t=newTrack(tname,P.tracks.length);P.tracks.push(t)}}
  const id='mt_'+uid(),b=ax().createBuffer(1,d.length,sr);b.copyToChannel(d,0);await kvPut(id,wavMono(d,sr));BUF['k:'+id]={buf:b,pk:peaks(b)};
  let st=sn(POS);if(t.clips.some(c=>c.start<st+b.duration&&c.start+c.dur>st))st=sn(t.clips.reduce((m,c)=>Math.max(m,c.start+c.dur),0));
  snap();t.clips.push({id:uid(),src:'k:'+id,start:st,off:0,dur:b.duration,gain:100,name:name||'Instrument'});save();if(PAGE==='mt')render();return st}};   // small hook (handy for testing)
R.mt=()=>{if(!built||!$('#mtSc'))render();else if(!playing&&!drag&&!REC)render()};
})();
