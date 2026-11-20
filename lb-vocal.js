/* =====================================================================
   LB Music · VOCAL TOOLS  (add-on)
   Load AFTER lb-record.js:  <script src="lb-vocal.js"></script>
   After you record in the Recorder, a "Vocal tools" card appears with:
   · Voice presets (Natural, Clean, Pop, Rap, Radio, Warm) = EQ + compressor + effects
   · Pitch correction (Auto-tune) that snaps your voice to a key, gentle → robot
   · Doubling (thicker voice), Harmony (octave, third, fifth), Reverb, Echo
   It is non-destructive: Undo always brings back your original take.
   ===================================================================== */
(()=>{
if(window.__lbVoc||!window.LBREC)return;window.__lbVoc=1;
const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms)),
OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext,
NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
SCL={Major:[0,2,4,5,7,9,11],Minor:[0,2,3,5,7,8,10],Chromatic:[0,1,2,3,4,5,6,7,8,9,10,11]};

/* voice presets: hp = low cut, eq = [type,Hz,dB,Q], th/ra = compressor, mk = makeup gain, rev/echo/dbl = defaults */
const PRE={
 Natural:{hp:70,eq:[],th:-20,ra:2,mk:1.1,rev:0,echo:0,dbl:0},
 Clean:{hp:90,eq:[['peaking',3000,2,1],['highshelf',10000,1,0.7]],th:-24,ra:3,mk:1.3,rev:0,echo:0,dbl:0},
 Pop:{hp:100,eq:[['peaking',250,-2,1],['peaking',4000,2,1],['highshelf',11000,1.5,0.7]],th:-26,ra:4,mk:1.5,rev:18,echo:0,dbl:1},
 Rap:{hp:110,eq:[['peaking',200,-2,1],['peaking',3500,3,1.2]],th:-30,ra:6,mk:1.8,rev:5,echo:14,dbl:0,ed:.09},
 Radio:{hp:420,lp:3400,eq:[['peaking',1800,3,1]],th:-26,ra:5,mk:1.8,rev:0,echo:0,dbl:0},
 Warm:{hp:80,lp:9000,eq:[['peaking',200,3,0.9],['highshelf',8000,-3,0.7]],th:-24,ra:3,mk:1.3,rev:12,echo:0,dbl:0}
};
const HAR={o_up:['Octave up',12],o_dn:['Octave down',-12],third:['Third',0],fifth:['Fifth',7]};
const TUNE=[['Off',0,0],['Gentle',.6,.25],['Medium',.85,.55],['Robot',1,1]];   // name, strength, speed

let V=Object.assign({pre:'Pop',tune:0,root:0,scale:'Major',dbl:1,har:'',harv:40,rev:18,echo:0},LS('vc',null)||{});
const sv=()=>SV('vc',V);
let orig=null,cur=null,busy=false;

/* ================= pitch detection + correction ================= */
function detect(d,sr){
 const ds=Math.max(1,Math.round(sr/11025)),rate=sr/ds,n2=Math.floor(d.length/ds),x=new Float32Array(n2);
 for(let i=0;i<n2;i++){let a=0;for(let k=0;k<ds;k++)a+=d[i*ds+k];x[i]=a/ds}
 const hop=Math.round(rate*.02),win=384,minL=Math.floor(rate/800),maxL=Math.min(Math.floor(rate/70),win-1),fr=Math.max(1,Math.floor((n2-win-maxL)/hop)),m=new Float32Array(fr).fill(NaN);
 for(let f=0;f<fr;f++){
  const o=f*hop;let e=0;for(let j=0;j<win;j++)e+=x[o+j]*x[o+j];if(Math.sqrt(e/win)<.008)continue;     // silence
  const ns=new Float32Array(maxL+2);let best=0;
  for(let t=minL;t<=maxL;t++){let a=0,mm=0;for(let j=0;j<win;j++){const p=x[o+j],q=x[o+j+t];a+=p*q;mm+=p*p+q*q}ns[t]=mm?2*a/mm:0}
  /* pick the first strong peak after the curve has dipped below zero */
  let t=minL;while(t<maxL&&ns[t]>0)t++;let pk=-1,pv=0;
  for(let u=t;u<maxL;u++){if(ns[u]>ns[u-1]&&ns[u]>=ns[u+1]&&ns[u]>.3){if(ns[u]>pv){pv=ns[u]}}}
  for(let u=t;u<maxL;u++){if(ns[u]>ns[u-1]&&ns[u]>=ns[u+1]&&ns[u]>=pv*.88){pk=u;break}}
  if(pk<0||pv<.6)continue;
  const a=ns[pk-1],b=ns[pk],c=ns[pk+1],dn=a-2*b+c,lag=pk+(dn?.5*(a-c)/dn:0);
  m[f]=69+12*Math.log2((rate/lag)/440)}
 /* median of 5 to remove jumps */
 const out=new Float32Array(fr).fill(NaN);
 for(let f=0;f<fr;f++){const w=[];for(let k=-2;k<=2;k++){const v=m[f+k];if(f+k>=0&&f+k<fr&&!isNaN(v))w.push(v)}if(w.length>=3&&!isNaN(m[f])){w.sort((a,b)=>a-b);out[f]=w[w.length>>1]}}
 return{midi:out,hopS:hop*ds}}

function targets(det,root,scale,strength,speed){
 const pcs=new Set(SCL[scale].map(i=>(i+root)%12)),n=det.midi.length,semi=new Float32Array(n);let cur=0;
 for(let f=0;f<n;f++){
  const v=det.midi[f];let want=0;
  if(!isNaN(v)){let note=Math.round(v),bd=99;for(let k=-2;k<=2;k++){const q=Math.round(v)+k;if(pcs.has(((q%12)+12)%12)&&Math.abs(q-v)<bd){bd=Math.abs(q-v);note=q}}
   want=Math.max(-1.5,Math.min(1.5,(note-v)*strength))}
  cur+=(want-cur)*(isNaN(v)?.3:speed);semi[f]=cur}
 return semi}

/* ================= pitch shifter (changes pitch, keeps speed) ================= */
async function shift(d,sr,semi,hopS,bypass,onP){
 const n=d.length,W=Math.round(sr*.04),half=W>>1,out=new Float32Array(n),isN=typeof semi==='number',tot=n+half;
 let ph=0,m=bypass?0:1;
 const rd=x=>{if(x<0||x>=n-1)return 0;const i=x|0,f=x-i;return d[i]*(1-f)+d[i+1]*f};
 for(let i=0;i<tot;i++){
  let s=semi;if(!isN){const f=i/hopS,k=Math.min(semi.length-1,f|0),k2=Math.min(semi.length-1,k+1);s=semi[k]+(semi[k2]-semi[k])*(f-k)}
  ph+=(1-Math.pow(2,s/12))/W;ph-=Math.floor(ph);
  let p2=ph+.5;if(p2>=1)p2-=1;
  const w=Math.sin(Math.PI*ph),w2=w*w;
  let v=rd(i-ph*W)*w2+rd(i-p2*W)*(1-w2);
  if(bypass){const tg=Math.min(1,Math.abs(s)/.15);m+=(tg-m)*.003;v=v*m+rd(i-half)*(1-m)}   // tiny corrections: keep the clean original
  const o=i-half;if(o>=0&&o<n)out[o]=v;
  if((i&262143)===0){onP&&onP(i/tot);await sleep(0)}}
 return out}

/* ================= effects chain (EQ, compressor, doubling, reverb, echo) ================= */
/* de-esser: tames harsh s / sh / ch sounds */
/* De-esser: listens to the 5.5 kHz+ band; when it dominates the sound (s, sh, ch, t) it turns the highs down by up to about 8 dB, smoothly. */
function deEss(x,sr){
 const n=x.length,out=new Float32Array(n);
 const w0=2*Math.PI*5500/sr,cs=Math.cos(w0),al=Math.sin(w0)/(2*.7071),a0=1+al,
  b0=(1+cs)/2/a0,b1=-(1+cs)/a0,b2=b0,a1=-2*cs/a0,a2=(1-al)/a0,
  lpA=1-Math.exp(-2*Math.PI*6500/sr);
 let x1=0,x2=0,y1=0,y2=0,u1=0,u2=0,v1=0,v2=0,lp=0;
 const k=ms=>Math.exp(-1/(sr*ms/1000)),eA=k(1),eR=k(30),gA=k(1.5),gR=k(45),TH=.28,MIN=.4;
 let eh=0,ex=0,g=1;
 for(let i=0;i<n;i++){
  const s=x[i];
  const t=b0*s+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=s;y2=y1;y1=t;
  const h=b0*t+b1*u1+b2*u2-a1*v1-a2*v2;u2=u1;u1=t;v2=v1;v1=h;           // detector band (not heard)
  const ah=h<0?-h:h,as=s<0?-s:s;
  eh=ah>eh?ah+(eh-ah)*eA:ah+(eh-ah)*eR;ex=as>ex?as+(ex-as)*eA:as+(ex-as)*eR;
  const r=ex>.004?eh/ex:0,tg=r>TH?Math.max(MIN,TH/r):1;
  g=tg<g?tg+(g-tg)*gA:tg+(g-tg)*gR;
  lp+=lpA*(s-lp);out[i]=lp+g*(s-lp)}                                  // smooth high-shelf cut
 return out}
async function fx(d,sr,P,opt){
 d=deEss(d,sr);
 const tail=Math.round(sr*1.4),oc=new OAC(1,d.length+tail,sr),b=oc.createBuffer(1,d.length,sr);b.copyToChannel(d,0);
 const s=oc.createBufferSource();s.buffer=b;let node=s;const chain=x=>{node.connect(x);node=x;return x};
 const f=(t,fr,g,q)=>{const x=oc.createBiquadFilter();x.type=t;x.frequency.value=fr;if(g!=null)x.gain.value=g;x.Q.value=q||.7;return chain(x)};
 f('highpass',P.hp,null,.7);P.eq.forEach(e=>f(e[0],e[1],e[2],e[3]));if(P.lp)f('lowpass',P.lp,null,.7);
 const c=oc.createDynamicsCompressor();c.threshold.value=P.th;c.knee.value=10;c.ratio.value=P.ra;c.attack.value=.005;c.release.value=.15;chain(c);
 const mk=oc.createGain();mk.gain.value=P.mk;chain(mk);
 const out=oc.createGain();mk.connect(out);
 if(opt.dbl){[[.018,.31],[.027,.43]].forEach(([dt,fq])=>{                       // two slightly moving delayed copies = a "doubled" voice
  const dl=oc.createDelay(.1);dl.delayTime.value=dt;const lf=oc.createOscillator(),ld=oc.createGain();lf.frequency.value=fq;ld.gain.value=.003;lf.connect(ld);ld.connect(dl.delayTime);lf.start();
  const g=oc.createGain();g.gain.value=.38;mk.connect(dl);dl.connect(g);g.connect(out)})}
 if(opt.rev>0){const len=Math.round(sr*1.5),ir=oc.createBuffer(1,len,sr),ch=ir.getChannelData(0);let lp=0;for(let i=0;i<len;i++){lp+=((Math.random()*2-1)-lp)*(.5-.42*i/len);ch[i]=lp*1.9*Math.pow(1-i/len,3)}
  const cv=oc.createConvolver();cv.buffer=ir;const g=oc.createGain();g.gain.value=opt.rev/100*.55;mk.connect(cv);cv.connect(g);g.connect(out)}
 if(opt.echo>0){const dl=oc.createDelay(1);dl.delayTime.value=P.ed||.18;const lp=oc.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3000;
  const fb=oc.createGain();fb.gain.value=.3;const g=oc.createGain();g.gain.value=opt.echo/100*.5;mk.connect(dl);dl.connect(lp);lp.connect(g);g.connect(out);lp.connect(fb);fb.connect(dl)}
 const L=oc.createDynamicsCompressor();L.threshold.value=-2;L.knee.value=0;L.ratio.value=20;L.attack.value=.002;L.release.value=.08;out.connect(L);L.connect(oc.destination);
 s.start();const r=Float32Array.from((await oc.startRendering()).getChannelData(0));return(opt.rev>0||opt.echo>0)?r:r.slice(0,d.length)}

/* ================= apply ================= */
async function apply(){
 if(busy)return;const T=LBREC.take();if(!T)return;if(!OAC)return toast('This phone cannot process audio in the browser');
 if(V.har&&typeof isPro==='function'&&!isPro())return proGate('Harmony');
 if(!orig||T.d!==cur){orig=T.d;cur=null}
 busy=true;const btn=$('#vcGo'),set=t=>{if(btn)btn.textContent=t};
 try{
  const sr=T.sr;let main=orig;
  if(V.tune>0){set('Finding your notes…');await sleep(30);
   const det=detect(orig,sr),[,st,sp]=TUNE[V.tune];
   if(det.midi.every(isNaN))toast('Could not find clear singing. Try singing louder and closer.');
   else{const semi=targets(det,V.root,V.scale,st,sp);main=await shift(orig,sr,semi,det.hopS,true,p=>set('Tuning… '+Math.round(p*100)+'%'))}}
  if(V.har){set('Making harmony…');const iv=V.har==='third'?(V.scale==='Minor'?3:4):HAR[V.har][1],h=await shift(main,sr,iv,1,false,p=>set('Harmony… '+Math.round(p*100)+'%')),g=V.harv/100,mix=new Float32Array(main.length);
   let pk=0;for(let i=0;i<mix.length;i++){const v=main[i]+h[i]*g;mix[i]=v;if(Math.abs(v)>pk)pk=Math.abs(v)}if(pk>.95)for(let i=0;i<mix.length;i++)mix[i]/=pk/.95;main=mix}
  set('Adding effects…');await sleep(30);
  const P=PRE[V.pre]||PRE.Natural;cur=await fx(main,sr,P,{dbl:V.dbl,rev:V.rev,echo:V.echo});
  LBREC.set(cur);cur=LBREC.take().d;toast('Done! Press play to listen. Undo goes back to your original.')
 }catch(e){toast('Could not process this take. Try a shorter recording.')}
 busy=false;draw()}

function undo(){if(!orig||busy)return;cur=null;LBREC.set(orig);toast('Back to your original recording')}

/* ================= card ================= */
function chips(sel,items,curv,fn){const e=$(sel);if(!e)return;e.innerHTML='';items.forEach(([k,l])=>{const b=document.createElement('button');b.textContent=l;if(k===curv)b.className='on';b.onclick=()=>fn(k);e.append(b)})}
function draw(){
 let box=$('#rcVoc');const T=LBREC.take();
 if(!T){if(box)box.style.display='none';orig=cur=null;return}
 if(T.d!==cur&&T.d!==orig){orig=T.d;cur=null}               // a brand-new recording
 if(!box){box=document.createElement('div');box.id='rcVoc';box.className='rc';const t=$('#rcTake');if(!t)return;t.insertAdjacentElement('afterend',box)}
 box.style.display='block';const pro=typeof isPro==='function'&&isPro();
 box.innerHTML=`<h4>🎛 VOCAL TOOLS</h4>
  <div class="mut" style="font-size:12px;margin-bottom:6px">Voice style</div><div class="rcCh" id="vcPre"></div>
  <div class="mut" style="font-size:12px;margin:10px 0 4px">Pitch correction (Auto-tune)</div><div class="rcCh" id="vcTune"></div>
  <div id="vcKey" style="${V.tune?'':'display:none'}"><div class="rcCh" id="vcRoot"></div><div class="rcCh" id="vcSc"></div></div>
  <div class="mut" style="font-size:12px;margin:10px 0 4px">Extras</div><div class="rcCh" id="vcDbl"></div><div class="rcCh" id="vcHar"></div>
  <div class="rl" id="vcHv" style="${V.har?'':'display:none'}"><span>Harmony vol</span><input type="range" id="vcHvR" min="10" max="80" value="${V.harv}"><b id="vcHvV">${V.harv}%</b></div>
  <div class="rl"><span>Reverb</span><input type="range" id="vcRev" min="0" max="100" value="${V.rev}"><b id="vcRevV">${V.rev}%</b></div>
  <div class="rl"><span>Echo</span><input type="range" id="vcEch" min="0" max="100" value="${V.echo}"><b id="vcEchV">${V.echo}%</b></div>
  <div class="rcAct"><button class="pr" id="vcGo">✨ Apply to my take</button><button id="vcUn" ${orig&&cur?'':'disabled style="opacity:.5"'}>↩ Undo</button></div>
  <div class="rcTip">Tip: pick the key of your beat for Auto-tune. If you are not sure, use “Chromatic” — it only fixes small off-notes. Auto-tune works best on a single clear voice recorded without the beat in the mic.</div>`;
 const pre=()=>chips('#vcPre',Object.keys(PRE).map(k=>[k,k]),V.pre,k=>{V.pre=k;V.rev=PRE[k].rev;V.echo=PRE[k].echo;V.dbl=PRE[k].dbl;sv();draw()}),
  tu=()=>chips('#vcTune',TUNE.map((t,i)=>[i,t[0]]),V.tune,k=>{V.tune=k;sv();draw()}),
  ro=()=>chips('#vcRoot',NN.map((n,i)=>[i,n]),V.root,k=>{V.root=k;sv();ro()}),
  sc=()=>chips('#vcSc',Object.keys(SCL).map(k=>[k,k]),V.scale,k=>{V.scale=k;sv();sc()}),
  db=()=>chips('#vcDbl',[[1,'👥 Doubling: on'],[0,'Doubling: off']],V.dbl,k=>{V.dbl=k;sv();db()}),
  ha=()=>chips('#vcHar',[['','No harmony'],...Object.keys(HAR).map(k=>[k,HAR[k][0]+(pro?'':' 👑')])],V.har,k=>{V.har=k;sv();ha();$('#vcHv').style.display=k?'':'none'});
 pre();tu();ro();sc();db();ha();
 $('#vcHvR').oninput=e=>{V.harv=+e.target.value;$('#vcHvV').textContent=V.harv+'%';sv()};
 $('#vcRev').oninput=e=>{V.rev=+e.target.value;$('#vcRevV').textContent=V.rev+'%';sv()};
 $('#vcEch').oninput=e=>{V.echo=+e.target.value;$('#vcEchV').textContent=V.echo+'%';sv()};
 $('#vcGo').onclick=apply;$('#vcUn').onclick=undo}

LBREC.hooks.push(draw);
})();
