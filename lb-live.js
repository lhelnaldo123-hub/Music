/* =====================================================================
   LB Music · LIVE SINGING HELPER  (add-on for Song Lab recording)
   Adds a small panel to the Song Lab recording screen:
   · 🔔 Click: a soft metronome click on every beat while you record
     (on/off + volume). Use headphones so the click is not picked up.
   · 🎯 Pitch: shows the note you are singing and a 5-second trail of how
     HIGH or LOW your voice is, against the notes of your song's key.
       green = in tune, yellow = a little off, red = outside the key.
   Nothing is changed in the recording itself.
   ===================================================================== */
(()=>{
const rec=document.getElementById('recov');
if(window.__lbLive||!rec)return;window.__lbLive=1;
const $=s=>document.querySelector(s),
AC=window.AudioContext||window.webkitAudioContext,
NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
SCL={m:[0,2,3,5,7,8,10],M:[0,2,4,5,7,9,11]},
pc=q=>((q%12)+12)%12,nm=q=>NN[pc(q)]+(Math.floor(q/12)-1);
let L=Object.assign({click:true,vol:60,pit:true},(typeof LS==='function'&&LS('live',null))||{});
const sv=()=>{try{SV('live',L)}catch(e){}};

/* ---- remember the microphone the Lab just opened ---- */
let LAST=null;
try{const md=navigator.mediaDevices,og=md.getUserMedia.bind(md);
 md.getUserMedia=function(c){return og(c).then(s=>{LAST={s,t:Date.now()};return s})}}catch(e){}

/* ---- song settings read from the Lab page ---- */
const getBpm=()=>{const e=$('input[data-f="bpm"]'),v=e?+e.value:0;return v>=40&&v<=240?v:90},
 getKey=()=>{const e=$('select[data-f="key"]');return e?(+e.value||0):0},
 getMode=()=>{const e=$('select[data-f="mode"]');return e&&e.value==='M'?'M':'m'};

/* ================= metronome ================= */
const CK={on:false,id:0};
function blip(ctx,t,acc){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=acc?2000:1400;
 g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(L.vol/100*.6,t+.002);g.gain.exponentialRampToValueAtTime(.0001,t+.05);
 o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+.06)}
function flash(acc){const d=$('#lvDot');if(!d)return;d.className=acc?'on a':'on';setTimeout(()=>{d.className=''},90)}
function stopClick(){CK.on=false;clearInterval(CK.id)}
function beginClick(ctx,t0,dur){stopClick();CK.on=true;const spb=60/getBpm();let n=0;
 const b=$('#lvBpm');if(b)b.textContent=Math.round(60/spb)+' BPM';
 CK.id=setInterval(()=>{
  if(!$('#rStop')||ctx.currentTime>t0+dur+.5){stopClick();return}
  while(t0+n*spb<ctx.currentTime+.3){const t=t0+n*spb,acc=n%4===0;
   if(L.click&&t>ctx.currentTime)blip(ctx,t,acc);
   setTimeout(()=>flash(acc),Math.max(0,(t-ctx.currentTime)*1000));n++}},40)}
/* the Lab starts the beat with a buffer source; we start our click grid at the same moment */
try{const os=AudioBufferSourceNode.prototype.start;
 AudioBufferSourceNode.prototype.start=function(when,...r){
  try{if(active&&!CK.on&&this.buffer&&this.buffer.duration>1.5&&$('#rStop'))beginClick(this.context,when||this.context.currentTime,this.buffer.duration)}catch(e){}
  return os.call(this,when,...r)}}catch(e){}

/* ================= pitch ================= */
function pitch(d,sr){
 const ds=Math.max(1,Math.round(sr/11025)),rate=sr/ds,n2=Math.floor(d.length/ds),x=new Float32Array(n2);
 for(let i=0;i<n2;i++){let a=0;for(let k=0;k<ds;k++)a+=d[i*ds+k];x[i]=a/ds}
 const win=480,minL=Math.floor(rate/800),maxL=Math.min(Math.floor(rate/70),n2-win-2);
 if(maxL<=minL+2)return NaN;
 const o=n2-win-maxL-1;let e=0;for(let j=0;j<win;j++)e+=x[o+j]*x[o+j];
 if(Math.sqrt(e/win)<.012)return NaN;                       // too quiet
 const ns=new Float32Array(maxL+2);
 for(let t=minL;t<=maxL;t++){let a=0,mm=0;for(let j=0;j<win;j++){const p=x[o+j],q=x[o+j+t];a+=p*q;mm+=p*p+q*q}ns[t]=mm?2*a/mm:0}
 let t=minL;while(t<maxL&&ns[t]>0)t++;
 let pk=-1,pv=0;
 for(let u=Math.max(t,minL+1);u<maxL;u++)if(ns[u]>ns[u-1]&&ns[u]>=ns[u+1]&&ns[u]>.3&&ns[u]>pv)pv=ns[u];
 for(let u=Math.max(t,minL+1);u<maxL;u++)if(ns[u]>ns[u-1]&&ns[u]>=ns[u+1]&&ns[u]>=pv*.88){pk=u;break}
 if(pk<0||pv<.6)return NaN;
 const a=ns[pk-1],b=ns[pk],c=ns[pk+1],dn=a-2*b+c,lag=pk+(dn?.5*(a-c)/dn:0);
 return 69+12*Math.log2((rate/lag)/440)}
function target(m,key,mode){const pcs=SCL[mode].map(i=>(i+key)%12);let best=Math.round(m),bd=99;
 for(let k=-3;k<=3;k++){const q=Math.round(m)+k;if(pcs.includes(pc(q))&&Math.abs(q-m)<bd){bd=Math.abs(q-m);best=q}}return best}

let MC=null,AN=null,buf=null,MT=0,PT=[],hist=[],cen=57,lastOk=0,active=false;
function startMeter(force){
 if(!L.pit||!LAST||!AC||(!force&&Date.now()-LAST.t>15000))return;
 if(!LAST.s.getTracks().some(t=>t.readyState==='live'))return;
 try{MC=new AC();MC.resume&&MC.resume();const src=MC.createMediaStreamSource(LAST.s);AN=MC.createAnalyser();AN.fftSize=4096;
  buf=new Float32Array(AN.fftSize);src.connect(AN);MT=setInterval(tickM,60)}catch(e){stopMeter()}}
function stopMeter(){clearInterval(MT);MT=0;try{MC&&MC.close()}catch(e){}MC=AN=null;PT=[];hist=[]}
function tickM(){
 if(!AN)return;try{AN.getFloatTimeDomainData(buf)}catch(e){return}
 const now=performance.now(),m=pitch(buf,MC.sampleRate);
 hist.push(m);if(hist.length>3)hist.shift();
 const v=hist.filter(x=>!isNaN(x)).sort((a,b)=>a-b),med=v.length>=2?v[v.length>>1]:NaN;
 PT.push({t:now,m:med});while(PT.length&&now-PT[0].t>5000)PT.shift();
 const nt=$('#lvNote'),ms=$('#lvMsg');
 if(!isNaN(med)){lastOk=now;const key=getKey(),mode=getMode(),tg=target(med,key,mode),c=Math.round((med-tg)*100);
  if(nt)nt.textContent=nm(Math.round(med));
  if(ms){const ok=Math.abs(c)<=30;ms.textContent=ok?'✓ In tune with '+nm(tg):(c>0?'⬆ a bit high (aim '+nm(tg)+')':'⬇ a bit low (aim '+nm(tg)+')');ms.style.color=ok?'#3ddc97':'#ffd166'}}
 else if(now-lastOk>500){if(nt)nt.textContent='–';if(ms){ms.textContent='Sing to see your note';ms.style.color=''}}
 draw(now)}
function draw(now){
 const cv=$('#lvCv');if(!cv||!cv.clientWidth)return;
 const w=cv.clientWidth,h=cv.clientHeight,dp=Math.min(2,window.devicePixelRatio||1);
 if(cv.width!==Math.round(w*dp)){cv.width=Math.round(w*dp);cv.height=Math.round(h*dp)}
 const g=cv.getContext('2d');g.setTransform(dp,0,0,dp,0,0);g.clearRect(0,0,w,h);
 const vals=PT.filter(p=>!isNaN(p.m)).map(p=>p.m),key=getKey(),mode=getMode(),pcs=SCL[mode].map(i=>(i+key)%12);
 if(vals.length){const mean=vals.reduce((a,b)=>a+b)/vals.length;cen+=(mean-cen)*.12}
 const span=Math.max(14,vals.length?Math.max(...vals)-Math.min(...vals)+5:14),lo=cen-span/2,hi=cen+span/2,y=m=>h-(m-lo)/(hi-lo)*h;
 g.font='10px sans-serif';
 for(let q=Math.ceil(lo);q<=hi;q++)if(pcs.includes(pc(q))){const yy=y(q);
  g.strokeStyle=pc(q)===key?'rgba(80,220,200,.5)':'rgba(255,255,255,.13)';g.beginPath();g.moveTo(24,yy);g.lineTo(w,yy);g.stroke();
  g.fillStyle='rgba(255,255,255,.6)';g.fillText(nm(q),2,yy+3)}
 PT.forEach(p=>{if(isNaN(p.m))return;const off=Math.abs(p.m-target(p.m,key,mode));
  g.fillStyle=off<.3?'#3ddc97':off<.6?'#ffd166':'#ff6b6b';g.beginPath();g.arc(24+(w-24)*(1-(now-p.t)/5000),y(p.m),3,0,6.3);g.fill()})}

/* ================= the panel ================= */
const st=document.createElement('style');st.textContent=`
#lbLive{margin:8px 0 2px;background:#ffffff0d;border-radius:14px;padding:8px 10px}
#lbLive .lvr{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#lbLive .lvb{background:#ffffff14;border:1px solid #ffffff22;border-radius:12px;padding:7px 10px;font-size:12px;font-weight:700;color:#fff}
#lbLive .lvb.off{opacity:.5}
#lbLive input[type=range]{width:90px;padding:0;height:24px}
#lvDot{width:12px;height:12px;border-radius:50%;background:#ffffff30;display:inline-block}
#lvDot.on{background:#3ddc97}#lvDot.on.a{background:#ffd166}
#lvBpm{font-size:12px;color:#aab}
#lvNote{font-size:26px;font-weight:800;min-width:48px;text-align:center}
#lvMsg{font-size:12px;font-weight:700;flex:1}
#lvCv{width:100%;height:96px;display:block;margin-top:6px;border-radius:10px;background:#0006}
`;document.head.append(st);
function panel(){
 let p=$('#lbLive');if(!p){p=document.createElement('div');p.id='lbLive';
  p.innerHTML=`<div class="lvr"><button class="lvb" id="lvClk"></button><input type="range" id="lvVol" min="10" max="100"><span id="lvDot"></span><span id="lvBpm"></span><button class="lvb" id="lvPit"></button></div>
  <div class="lvr" id="lvInfo"><span id="lvNote">–</span><span id="lvMsg">Sing to see your note</span></div><canvas id="lvCv"></canvas>`;
  const bar=$('#rBar');bar?bar.insertAdjacentElement('afterend',p):rec.append(p);
  $('#lvClk').onclick=()=>{L.click=!L.click;sv();upd()};
  $('#lvVol').oninput=e=>{L.vol=+e.target.value;sv()};
  $('#lvPit').onclick=()=>{L.pit=!L.pit;sv();if(L.pit)startMeter(true);else stopMeter();upd()}}
 upd()}
function upd(){const c=$('#lvClk'),p=$('#lvPit');if(!c)return;
 c.textContent='🔔 Click: '+(L.click?'ON':'OFF');c.classList.toggle('off',!L.click);
 p.textContent='🎯 Pitch: '+(L.pit?'ON':'OFF');p.classList.toggle('off',!L.pit);
 $('#lvVol').value=L.vol;$('#lvBpm').textContent=getBpm()+' BPM';
 $('#lvInfo').style.display=$('#lvCv').style.display=L.pit?'':'none'}

/* open / close of the Song Lab recording screen */
new MutationObserver(()=>{const on=rec.classList.contains('on');
 if(on&&!active){active=true;panel();stopMeter();startMeter()}
 else if(!on&&active){active=false;stopClick();stopMeter()}
}).observe(rec,{attributes:true,attributeFilter:['class']});
})();