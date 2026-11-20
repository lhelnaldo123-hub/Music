/* =====================================================================
   LB Music · BETTER RECORDER  (add-on)
   Load AFTER lb-lab.js / lb-studio.js:  <script src="lb-record.js"></script>
   Adds a "Recorder" page with: choose your microphone, live level meter
   with clipping warning, input gain, count-in, metronome, sing over any
   song in your library, timing (latency) fix, lossless recording,
   waveform preview, normalize, save to My Music and share.
   Nothing is removed from the app.
   ===================================================================== */
(()=>{
if(window.__lbRec||typeof R==='undefined')return;window.__lbRec=1;
const $=s=>document.querySelector(s),AC=window.AudioContext||window.webkitAudioContext,
fm=t=>{t=Math.max(0,t);const m=Math.floor(t/60),s=Math.floor(t%60);return m+':'+String(s).padStart(2,'0')+'.'+Math.floor((t%1)*10)};
const MAXSEC=600;                       // 10 minute limit per take (keeps phones safe)
let C=Object.assign({dev:'',bpm:100,click:true,cnt:2,gain:100,mon:false,clean:false,sync:0,song:'',bvol:80,norm:true},LS('rc',null)||{});
const sv=()=>SV('rc',C);

/* ---------------- state ---------------- */
let AX=null,ST=null,SRC=null,GN=null,AN=null,NODE=null,SIL=null,MG=null,WL=false,
 REC=false,CH=[],T0=0,TM=null,SCH=null,wake=null,bs=null,BK={id:'',buf:null},
 TAKE=null,built=false,meterOn=false,nextBeat=0,beatN=0,peakHold=0,holdT=0,clipT=0;

/* ---------------- styles + page ---------------- */
const css=document.createElement('style');css.textContent=`
#rec .rc{background:var(--card);border-radius:18px;padding:14px;margin:12px 0}
#rec .rc h4{font-size:12px;color:var(--mut);letter-spacing:.4px;margin-bottom:10px}
.rcBig{display:flex;align-items:center;gap:16px}
.rcBtn{width:76px;height:76px;border-radius:50%;background:#e5384f;color:#fff;font-size:30px;flex:none;box-shadow:0 0 0 5px #e5384f33}
.rcBtn.on{background:#fff;color:#e5384f;animation:rcp 1s infinite}
@keyframes rcp{50%{box-shadow:0 0 0 12px #e5384f22}}
.rcT{font-size:36px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}.rcS{font-size:12px;color:var(--mut);margin-top:6px}
.rcM{height:14px;border-radius:8px;background:#ffffff14;overflow:hidden;position:relative;margin:12px 0 6px}
.rcM i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,var(--ac),#ffd54a 75%,#e5384f);border-radius:8px}
.rcM u{position:absolute;top:0;bottom:0;width:3px;background:#fff;left:0}
.rcH{font-size:12px;color:var(--mut);min-height:16px}.rcH.bad{color:#ff6b7d;font-weight:700}
#rec select{width:100%;padding:11px;margin:0 0 8px;border-radius:12px;background:#1b1f27;color:#fff;border:1px solid #2a303b;font-size:14px}
#rec .rl{display:flex;align-items:center;gap:10px;font-size:13px;margin:8px 0}#rec .rl span{width:92px;flex:none;color:var(--mut)}#rec .rl input[type=range]{margin:0;padding:0}
#rec .rl b{width:46px;text-align:right;flex:none;font-size:12px}
.rcCh{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.rcCh button{padding:8px 13px;border-radius:18px;background:#ffffff14;color:#fff;font-size:13px}
.rcCh button.on{background:var(--ac);color:#04201c;font-weight:700}
.rcBp{display:flex;align-items:center;gap:10px;margin:6px 0}.rcBp button{width:40px;height:40px;border-radius:50%;background:#ffffff14;color:#fff;font-size:20px}
.rcBp b{font-size:22px;min-width:52px;text-align:center}
.rcAct{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.rcAct button{flex:1;min-width:110px;padding:13px;border-radius:14px;background:#ffffff14;color:#fff;font-size:13px;font-weight:700}
.rcAct button.pr{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#04201c}
#rcW{width:100%;height:80px;display:block;background:#00000040;border-radius:12px}#rec audio{width:100%;margin-top:10px}
.rcTip{font-size:12px;color:var(--mut);margin-top:8px;line-height:1.5}
`;document.head.append(css);
document.body.insertAdjacentHTML('beforeend',`<section id="rec" class="page"><div class="top"><button class="ic" onclick="back()">‹</button><h3>🎙 Recorder</h3><span></span></div><div id="rcBody"></div></section>`);
const act=document.querySelector('.action');
if(act)act.insertAdjacentHTML('beforeend','<button onclick="show(\'rec\')">🎙<br>Recorder</button>');

/* hooks so other add-ons (lb-vocal.js) can work on the current take */
window.LBREC={hooks:[],take:()=>TAKE,set:d=>{if(TAKE){TAKE={d,sr:TAKE.sr};showTake()}}};

/* ---------------- audio engine ---------------- */
async function mkNode(){
 if(AX.audioWorklet&&window.AudioWorkletNode){
  try{
   if(!WL){const code=`class P extends AudioWorkletProcessor{constructor(){super();this.s=0;this.on=false;this.port.onmessage=e=>{if(e.data.start!==undefined){this.s=e.data.start;this.on=true}else this.on=false}}process(i){const c=i[0]&&i[0][0];if(this.on&&c&&currentTime>=this.s)this.port.postMessage(c.slice(0));return true}}registerProcessor('lbrec',P)`;
    await AX.audioWorklet.addModule(URL.createObjectURL(new Blob([code],{type:'application/javascript'})));WL=true}
   const n=new AudioWorkletNode(AX,'lbrec',{numberOfInputs:1,numberOfOutputs:1,channelCount:1,channelCountMode:'explicit'});
   n.port.onmessage=e=>{if(REC)CH.push(e.data)};n.isW=true;return n
  }catch(e){}
 }
 const n=AX.createScriptProcessor(4096,1,1);   // older phones
 n.onaudioprocess=e=>{if(REC&&AX.currentTime>=T0)CH.push(new Float32Array(e.inputBuffer.getChannelData(0)))};return n}

function closeMic(){
 try{NODE&&NODE.disconnect()}catch(e){}try{SRC&&SRC.disconnect()}catch(e){}
 if(ST)ST.getTracks().forEach(t=>t.stop());ST=SRC=GN=AN=NODE=null}

async function openMic(){
 closeMic();
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('unsupported');
 const a=C.clean?{echoCancellation:true,noiseSuppression:true,autoGainControl:true}:{echoCancellation:false,noiseSuppression:false,autoGainControl:false};
 if(C.dev)a.deviceId={exact:C.dev};
 try{ST=await navigator.mediaDevices.getUserMedia({audio:a})}
 catch(e){
  if(C.dev&&(e.name==='OverconstrainedError'||e.name==='NotFoundError')){C.dev='';sv();delete a.deviceId;ST=await navigator.mediaDevices.getUserMedia({audio:a})}
  else throw e}
 if(!AX||AX.state==='closed')AX=new AC({latencyHint:'interactive'});
 if(AX.state==='suspended')await AX.resume();
 SRC=AX.createMediaStreamSource(ST);GN=AX.createGain();GN.gain.value=C.gain/100;
 AN=AX.createAnalyser();AN.fftSize=1024;SRC.connect(GN);GN.connect(AN);
 NODE=await mkNode();GN.connect(NODE);
 if(!SIL){SIL=AX.createGain();SIL.gain.value=0;SIL.connect(AX.destination)}
 NODE.connect(SIL);
 if(!MG){MG=AX.createGain();MG.gain.value=1;MG.connect(AX.destination)}
 applyMon();listDevices();startMeter()}

function applyMon(){try{GN.disconnect(MG)}catch(e){}if(C.mon&&GN)GN.connect(MG)}

async function listDevices(){
 const s=$('#rcDev');if(!s||!navigator.mediaDevices.enumerateDevices)return;
 const d=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='audioinput');
 s.innerHTML='';const o0=document.createElement('option');o0.value='';o0.textContent='Phone default microphone';s.append(o0);
 d.forEach((x,i)=>{if(!x.deviceId||x.deviceId==='default')return;const o=document.createElement('option');o.value=x.deviceId;o.textContent=x.label||('Microphone '+(i+1));s.append(o)});
 s.value=C.dev;if(s.value!==C.dev)s.value=''}
if(navigator.mediaDevices&&navigator.mediaDevices.addEventListener)navigator.mediaDevices.addEventListener('devicechange',()=>{if(built)listDevices()});

/* ---------------- level meter ---------------- */
function startMeter(){
 if(meterOn)return;meterOn=true;const buf=new Float32Array(1024);
 (function loop(){
  if(!AN||PAGE!=='rec'){ if(PAGE!=='rec'){if(REC)stop();closeMic();setUi()} meterOn=false;return}
  AN.getFloatTimeDomainData(buf);let p=0;for(let i=0;i<buf.length;i++){const v=Math.abs(buf[i]);if(v>p)p=v}
  const now=performance.now();if(p>=peakHold||now>holdT){peakHold=p;holdT=now+900}
  if(p>=.97)clipT=now+1800;
  const bar=$('#rcMi'),pk=$('#rcMu'),h=$('#rcH');
  if(bar){bar.style.width=Math.min(100,Math.sqrt(p)*100)+'%';pk.style.left=Math.min(99,Math.sqrt(peakHold)*100)+'%'}
  if(h){if(now<clipT){h.className='rcH bad';h.textContent='⚠️ Too loud — it will crackle. Lower the input level or move back.'}
   else if(REC&&AX.currentTime>T0&&p<.01&&peakHold<.02){h.className='rcH';h.textContent='Very quiet — move closer or raise the input level.'}
   else{h.className='rcH';h.textContent=p<.02?'Sing or speak to test your level.':p<.7?'👍 Good level.':'Getting loud — a little lower is safer.'}}
  requestAnimationFrame(loop)})()}

/* ---------------- metronome + backing ---------------- */
function tick(t,accent){const o=AX.createOscillator(),g=AX.createGain();o.frequency.value=accent?1500:1000;o.type='square';
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(accent?.5:.3,t+.002);g.gain.exponentialRampToValueAtTime(.0001,t+.05);
 o.connect(g);g.connect(AX.destination);o.start(t);o.stop(t+.06)}
const dec=ab=>new Promise((res,rej)=>{const p=AX.decodeAudioData(ab,res,rej);p&&p.then&&p.then(res,rej)});
async function getBack(){
 if(!C.song)return null;if(BK.id===C.song&&BK.buf)return BK.buf;
 const r=await tx('blobs','readonly',b=>b.get(C.song));if(!r||!r.blob)throw new Error('noblob');
 const buf=await dec(await r.blob.arrayBuffer());BK={id:C.song,buf};return buf}

/* ---------------- record / stop ---------------- */
async function start(){
 if(REC)return;
 try{if(!ST)await openMic()}catch(e){return toast(e.name==='NotAllowedError'?'Microphone is blocked. Allow it in your browser settings.':'Could not open the microphone on this phone')}
 let back=null;if(C.song){try{back=await getBack()}catch(e){toast('Could not use that song. Recording without it.');C.song='';sv();setUi()}}
 if(AX.state==='suspended')await AX.resume();
 TAKE=null;showTake();
 const spb=60/C.bpm,t0=AX.currentTime+.25;T0=t0+C.cnt*spb;CH=[];REC=true;
 if(NODE.isW)NODE.port.postMessage({start:T0});
 beatN=0;nextBeat=t0;
 if(C.cnt>0||C.click){
  SCH=setInterval(()=>{while(nextBeat<AX.currentTime+.3){const inCount=nextBeat<T0-.001;if(inCount||C.click)tick(nextBeat,beatN%4===0);nextBeat+=spb;beatN++}},40)}
 if(back){bs=AX.createBufferSource();bs.buffer=back;const g=AX.createGain();g.gain.value=C.bvol/100;bs.connect(g);g.connect(AX.destination);bs.start(T0)}
 try{if(navigator.wakeLock)wake=await navigator.wakeLock.request('screen')}catch(e){}
 TM=setInterval(()=>{const now=AX.currentTime;
  if(now<T0){const n=Math.ceil((T0-now)/spb);setClock(String(n),'Get ready…')}
  else{const el=now-T0;setClock(fm(el),'Recording');if(el>=MAXSEC)stop()}},80);
 setUi()}

function stop(){
 if(!REC)return;REC=false;
 if(NODE&&NODE.isW)NODE.port.postMessage({stop:1});
 clearInterval(TM);clearInterval(SCH);try{bs&&bs.stop()}catch(e){}bs=null;
 try{wake&&wake.release()}catch(e){}wake=null;
 const sr=AX.sampleRate;let n=0;CH.forEach(c=>n+=c.length);
 const hasRef=C.click||C.song;
 const trim=hasRef?Math.round(((AX.baseLatency||0)+(AX.outputLatency||0))*sr+C.sync/1000*sr):0;
 const all=new Float32Array(n);let o=0;CH.forEach(c=>{all.set(c,o);o+=c.length});CH=[];
 const d=all.subarray(Math.min(trim,all.length));
 if(d.length<sr*.3){setUi();setClock('0:00.0','Ready');return toast('Too short — nothing saved')}
 TAKE={d:Float32Array.from(d),sr};showTake();setUi();setClock(fm(d.length/sr),'Take ready')}

/* ---------------- WAV encoding ---------------- */
function wavBlob(d,sr,norm){
 let g=1;if(norm){let p=0;for(let i=0;i<d.length;i++){const v=Math.abs(d[i]);if(v>p)p=v}if(p>.001)g=Math.min(8,.89/p)}
 const n=d.length,fd=Math.min(n>>1,Math.round(sr*.005)),buf=new ArrayBuffer(44+n*2),h=new DataView(buf),w=(p,s)=>[...s].forEach((c,i)=>h.setUint8(p+i,c.charCodeAt(0)));
 w(0,'RIFF');h.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,1,true);
 h.setUint32(24,sr,true);h.setUint32(28,sr*2,true);h.setUint16(32,2,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){let v=d[i]*g;if(i<fd)v*=i/fd;else if(i>=n-fd)v*=(n-1-i)/fd;v=Math.max(-1,Math.min(1,v));h.setInt16(44+i*2,v<0?v*32768:v*32767,true)}
 return new Blob([buf],{type:'audio/wav'})}

/* ---------------- take review ---------------- */
function drawWave(){
 const cv=$('#rcW');if(!cv||!TAKE)return;const dp=window.devicePixelRatio||1,w=cv.clientWidth*dp,h=cv.clientHeight*dp;cv.width=w;cv.height=h;
 const x=cv.getContext('2d'),d=TAKE.d,bins=Math.floor(w/(2*dp)),per=Math.max(1,Math.floor(d.length/bins));
 let mx=0;const pk=[];for(let b=0;b<bins;b++){let m=0;for(let i=b*per,e=Math.min(d.length,i+per);i<e;i+=Math.max(1,per>>5)){const v=Math.abs(d[i]);if(v>m)m=v}pk.push(m);if(m>mx)mx=m}
 x.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--ac')||'#1de9c6';const k=mx>0?(C.norm?.9/mx:1):1;
 pk.forEach((m,b)=>{const bh=Math.max(2*dp,Math.min(h,m*k*h));x.fillRect(b*2*dp,(h-bh)/2,1.4*dp,bh)})}
let URLB='';
function showTake(){_show();(window.LBREC.hooks||[]).forEach(f=>{try{f()}catch(e){}})}
function _show(){
 const box=$('#rcTake');if(!box)return;
 if(!TAKE){box.style.display='none';box.innerHTML='';if(URLB){URL.revokeObjectURL(URLB);URLB=''}return}
 const dur=TAKE.d.length/TAKE.sr;
 box.style.display='block';
 box.innerHTML=`<h4>YOUR TAKE · ${fm(dur)}</h4><canvas id="rcW"></canvas><audio id="rcA" controls></audio>
  <div class="rcCh"><button id="rcN" class="${C.norm?'on':''}">🔊 Make louder (normalize)</button></div>
  <div class="rcAct"><button class="pr" id="rcSave">💾 Save to my music</button><button id="rcShare">📤 Share</button><button id="rcAgain">🔁 Record again</button></div>
  <div class="rcTip">Saved as a lossless WAV file. Use headphones when you sing over a beat so the beat does not leak into the mic.</div>`;
 const upd=()=>{if(URLB)URL.revokeObjectURL(URLB);const a=$('#rcA');URLB=URL.createObjectURL(wavBlob(TAKE.d,TAKE.sr,C.norm));if(a)a.src=URLB;drawWave()};
 upd();
 $('#rcN').onclick=e=>{C.norm=!C.norm;sv();e.currentTarget.classList.toggle('on',C.norm);upd()};
 $('#rcAgain').onclick=()=>{TAKE=null;showTake();setClock('0:00.0','Ready')};
 $('#rcSave').onclick=saveTake;$('#rcShare').onclick=shareTake}
async function saveTake(){
 if(!TAKE)return;const t=prompt('Name your recording','My Recording '+new Date().toLocaleDateString());if(!t)return;
 try{const nm=(t.replace(/[\\/:*?"<>|]/g,'').trim()||'My Recording'),f=new File([wavBlob(TAKE.d,TAKE.sr,C.norm)],nm+'.wav',{type:'audio/wav'});
  await addFiles([f],'file');const s=S.songs.find(x=>x.name===f.name&&x.size===f.size);
  if(s){s.title=t;s.artist='Me (LB Recorder)';s.album='My Recordings';await dbPut(s)}
  toast('Saved! Find it in Music → My Recordings');refresh()}
 catch(e){toast('Could not save. Phone storage may be full.')}}
async function shareTake(){
 if(!TAKE)return;const f=new File([wavBlob(TAKE.d,TAKE.sr,C.norm)],'recording.wav',{type:'audio/wav'});
 try{if(navigator.canShare&&navigator.canShare({files:[f]}))await navigator.share({files:[f],title:'My recording'});else toast('Sharing is not supported here. Use Save instead.')}catch(e){}}

/* ---------------- UI ---------------- */
function setClock(t,s){const a=$('#rcT'),b=$('#rcS');if(a)a.textContent=t;if(b)b.textContent=s}
function setUi(){
 const b=$('#rcGo');if(b){b.classList.toggle('on',REC);b.textContent=REC?'⏹':'⏺'}
 ['rcDev','rcSong','rcCnt','rcCl','rcBpm','rcMode'].forEach(id=>{const e=$('#'+id);if(e)e.style.pointerEvents=REC?'none':'';if(e)e.style.opacity=REC?.5:1})}
function chips(sel,items,cur,fn){const e=$(sel);if(!e)return;e.innerHTML='';items.forEach(([k,l])=>{const b=document.createElement('button');b.textContent=l;if(k===cur)b.className='on';b.onclick=()=>fn(k);e.append(b)})}
function setBpm(v){C.bpm=Math.max(40,Math.min(240,Math.round(v)));sv();const e=$('#rcB');if(e)e.textContent=C.bpm}
function songOpts(){const s=$('#rcSong');if(!s)return;s.innerHTML='';const o=document.createElement('option');o.value='';o.textContent='None (just my voice)';s.append(o);
 (S.songs||[]).filter(x=>x.src!=='online').slice().sort((a,b)=>(a.title||'').localeCompare(b.title||'')).forEach(x=>{const p=document.createElement('option');p.value=x.id;p.textContent=(x.title||x.name)+(x.artist?' — '+x.artist:'');s.append(p)});
 s.value=C.song;if(s.value!==C.song){C.song='';sv()}}
function build(){
 const b=$('#rcBody');if(!b)return;built=true;
 const mk=LS('mk',null),mkb=mk&&mk.bpm?mk.bpm:0;
 b.innerHTML=`
 <div class="rc"><div class="rcBig"><button class="rcBtn" id="rcGo">⏺</button><div><div class="rcT" id="rcT">0:00.0</div><div class="rcS" id="rcS">Ready</div></div></div>
  <div class="rcM"><i id="rcMi"></i><u id="rcMu"></u></div><div class="rcH" id="rcH">Tap the red button to start. Use headphones for best sound.</div></div>
 <div class="rc" id="rcTake" style="display:none"></div>
 <div class="rc"><h4>MICROPHONE</h4><select id="rcDev"></select>
  <div class="rl"><span>Input level</span><input type="range" id="rcG" min="0" max="200" value="${C.gain}"><b id="rcGv">${C.gain}%</b></div>
  <div class="rcCh" id="rcMode"></div>
  <div class="rcCh" id="rcMon"></div></div>
 <div class="rc"><h4>TIMING</h4>
  <div class="rcBp" id="rcBpm"><button id="rcBm">−</button><b id="rcB">${C.bpm}</b><button id="rcBp">+</button><span class="mut">BPM</span>${mkb?`<button style="width:auto;border-radius:18px;padding:0 12px;font-size:12px" id="rcMk">Match my beat (${mkb})</button>`:''}</div>
  <div class="rcCh" id="rcCl"></div>
  <div class="mut" style="font-size:12px;margin-top:8px">Count-in before recording</div><div class="rcCh" id="rcCnt"></div></div>
 <div class="rc"><h4>SING OVER A SONG</h4><select id="rcSong"></select>
  <div class="rl"><span>Song volume</span><input type="range" id="rcBv" min="0" max="100" value="${C.bvol}"><b id="rcBvv">${C.bvol}%</b></div>
  <div class="rl"><span>Sync fix</span><input type="range" id="rcSy" min="0" max="200" value="${C.sync}"><b id="rcSyv">${C.sync}ms</b></div>
  <div class="rcTip">Your voice is saved on its own, without the song. If your voice sounds late against the beat, raise Sync fix a little and record again.</div></div>`;
 const modes=()=>chips('#rcMode',[[0,'🎚 Raw (best for music)'],[1,'🧼 Clean voice (noise & echo off)']],C.clean?1:0,k=>{C.clean=!!k;sv();modes();if(ST&&!REC)openMic().catch(()=>{})}),
  mon=()=>chips('#rcMon',[[0,'🔇 Hear myself: off'],[1,'🎧 Hear myself: on']],C.mon?1:0,k=>{C.mon=!!k;sv();mon();applyMon();if(k)toast('Use headphones, or you will get a loud squeal')}),
  cl=()=>chips('#rcCl',[[1,'🥁 Metronome on'],[0,'Metronome off']],C.click?1:0,k=>{C.click=!!k;sv();cl()}),
  cn=()=>chips('#rcCnt',[[0,'None'],[1,'1 beat'],[2,'2 beats'],[4,'4 beats']],C.cnt,k=>{C.cnt=k;sv();cn()});
 modes();mon();cl();cn();songOpts();listDevices();setUi();
 $('#rcGo').onclick=()=>REC?stop():start();
 $('#rcDev').onchange=e=>{C.dev=e.target.value;sv();if(ST&&!REC)openMic().catch(()=>toast('Could not open that microphone'))};
 $('#rcG').oninput=e=>{C.gain=+e.target.value;sv();$('#rcGv').textContent=C.gain+'%';if(GN)GN.gain.value=C.gain/100};
 $('#rcBm').onclick=()=>setBpm(C.bpm-1);$('#rcBp').onclick=()=>setBpm(C.bpm+1);
 const mkBtn=$('#rcMk');if(mkBtn)mkBtn.onclick=()=>setBpm(mkb);
 $('#rcSong').onchange=e=>{C.song=e.target.value;sv()};
 $('#rcBv').oninput=e=>{C.bvol=+e.target.value;sv();$('#rcBvv').textContent=C.bvol+'%'};
 $('#rcSy').oninput=e=>{C.sync=+e.target.value;sv();$('#rcSyv').textContent=C.sync+'ms'}}

document.addEventListener('visibilitychange',()=>{if(document.hidden&&REC)stop()});

R.rec=()=>{if(!built)build();else if(!REC){songOpts();if(TAKE&&!$('#rcW'))showTake()}
 if(ST&&!meterOn)startMeter()};
})();
