/* =====================================================================
   LB Music · MASTERING & ANALYSIS  (add-on)
   Load AFTER lb-multi.js:  <script src="lb-master.js"></script>
   Pick any song from your library and get a studio-style report:
   · Loudness in LUFS (ITU BS.1770 K-weighting + gating), loudest moment,
     peak and true-peak, dynamic range, stereo correlation, clipping
   · Spectrum (tonal balance) and loudness-over-time graphs
   · Check against targets: Spotify / YouTube, Apple Music, Club, Podcast
   Then master it: tone (low / mid / high), glue compressor, stereo width,
   then loudness-match to your target with a brick-wall true-peak limiter.
   Compare Before / After with matched volume, and save the result.
   ===================================================================== */
(()=>{
if(window.__lbMs||typeof R==='undefined')return;window.__lbMs=1;
const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms)),
AC=window.AudioContext||window.webkitAudioContext,OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext,
E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
db=v=>v>1e-9?20*Math.log10(v):-120,lin=d=>Math.pow(10,d/20);
const TARGETS={spotify:['Spotify / YouTube',-14,-1],apple:['Apple Music',-16,-1],club:['Loud / Club',-9,-1],pod:['Podcast',-16,-1.5]};
const PRESETS={Clean:{lo:0,mid:0,hi:0,glue:25,width:100},Loud:{lo:2,mid:1,hi:1.5,glue:55,width:110},Warm:{lo:3,mid:-1,hi:-2,glue:35,width:100},Bright:{lo:-1,mid:1.5,hi:4,glue:30,width:115},'Vocal':{lo:-2,mid:3,hi:1.5,glue:45,width:90}};
let M=Object.assign({pre:'Clean',tgt:'spotify',lo:0,mid:0,hi:0,glue:25,width:100,song:'',match:true},LS('ms',null)||{});const sv=()=>SV('ms',M);
let A=null,OUT=null,busy=false,ax=null,srcN=null,pb={t0:0,off:0,on:false,ab:'b'},RAF=0,built=false;

/* =============== analysis maths =============== */
function kCoef(fs){
 const f1=1681.974450955533,G=3.999843853973347,Q1=.7071752369554196,K1=Math.tan(Math.PI*f1/fs),Vh=Math.pow(10,G/20),Vb=Math.pow(Vh,.4996667741545416),a0=1+K1/Q1+K1*K1;
 const s1={b:[(Vh+Vb*K1/Q1+K1*K1)/a0,2*(K1*K1-Vh)/a0,(Vh-Vb*K1/Q1+K1*K1)/a0],a:[2*(K1*K1-1)/a0,(1-K1/Q1+K1*K1)/a0]};
 const f2=38.13547087602444,Q2=.5003270373238773,K2=Math.tan(Math.PI*f2/fs),d=1+K2/Q2+K2*K2,s2={b:[1,-2,1],a:[2*(K2*K2-1)/d,(1-K2/Q2+K2*K2)/d]};return[s1,s2]}
/* returns mean-square energy per 100 ms (summed over channels) */
function energies(ch,sr){
 const [s1,s2]=kCoef(sr),n=ch[0].length,step=Math.round(sr/10),cnt=Math.floor(n/step),out=new Float64Array(cnt);
 for(const x of ch){let x1=0,x2=0,y1=0,y2=0,z1=0,z2=0,w1=0,w2=0,acc=0,k=0,bi=0;
  for(let i=0;i<cnt*step;i++){const v=x[i];
   const y=s1.b[0]*v+s1.b[1]*x1+s1.b[2]*x2-s1.a[0]*y1-s1.a[1]*y2;x2=x1;x1=v;y2=y1;y1=y;
   const z=s2.b[0]*y+s2.b[1]*z1+s2.b[2]*z2-s2.a[0]*w1-s2.a[1]*w2;z2=z1;z1=y;w2=w1;w1=z;
   acc+=z*z;if(++k===step){out[bi++]+=acc/step;acc=0;k=0}}}
 return out}
function loudness(en){
 const nb=en.length-3;if(nb<1){const m=en.reduce((a,b)=>a+b,0)/Math.max(1,en.length);return{I:-0.691+10*Math.log10(m||1e-12),max:-70,blocks:[],short:[]}}
 const bl=new Float64Array(nb);for(let i=0;i<nb;i++)bl[i]=(en[i]+en[i+1]+en[i+2]+en[i+3])/4;
 const L=z=>-0.691+10*Math.log10(z||1e-12);let s=0,c=0;for(const z of bl)if(L(z)>-70){s+=z;c++}
 if(!c)return{I:-70,max:-70,blocks:bl,short:[]};
 const thr=L(s/c)-10;let s2=0,c2=0;for(const z of bl)if(L(z)>-70&&L(z)>thr){s2+=z;c2++}
 const I=L(c2?s2/c2:s/c);
 const sh=[];let mx=-70;for(let i=0;i+30<=en.length;i+=10){let a=0;for(let k=0;k<30;k++)a+=en[i+k];const v=L(a/30);sh.push(v);if(v>mx)mx=v}
 if(!sh.length)mx=I;return{I,max:mx,blocks:bl,short:sh}}
function peaks(ch){
 let pk=0,tp=0,clip=0;
 for(const x of ch){const n=x.length;for(let i=0;i<n;i++){const v=Math.abs(x[i]);if(v>pk)pk=v;if(v>=.999)clip++;
  if(v>.45&&i>0&&i<n-2){const p0=x[i-1],p1=x[i],p2=x[i+1],p3=x[i+2];                       // 4× oversampling estimate (cubic)
   for(let t=.25;t<1;t+=.25){const t2=t*t,t3=t2*t,y=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3),a=Math.abs(y);if(a>tp)tp=a}}}}
 return{pk,tp:Math.max(tp,pk),clip}}
function stereo(ch){if(ch.length<2)return{corr:1,width:0};let ll=0,rr=0,lr=0,mm=0,ss=0;const a=ch[0],b=ch[1],n=a.length,st=Math.max(1,n/2000000|0);
 for(let i=0;i<n;i+=st){const l=a[i],r=b[i];ll+=l*l;rr+=r*r;lr+=l*r;const m=(l+r)/2,s=(l-r)/2;mm+=m*m;ss+=s*s}
 return{corr:ll&&rr?lr/Math.sqrt(ll*rr):1,width:mm+ss?Math.sqrt(ss/(mm+ss)):0}}
/* FFT (radix-2) */
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
 for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const a=i+j,b=a+len/2,tr=re[b]*cr-im[b]*ci,ti=re[b]*ci+im[b]*cr;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr}}}}
const BANDS=(()=>{const f=[];for(let i=0;i<31;i++)f.push(20*Math.pow(2,i/3));return f})();
function spectrum(ch,sr){
 const N=4096,n=ch[0].length,frames=Math.min(160,Math.max(1,Math.floor(n/N))),acc=new Float64Array(N/2),re=new Float64Array(N),im=new Float64Array(N),w=new Float64Array(N);
 for(let i=0;i<N;i++)w[i]=.5-.5*Math.cos(2*Math.PI*i/(N-1));
 for(let f=0;f<frames;f++){const o=Math.floor(f*(n-N)/Math.max(1,frames-1));for(let i=0;i<N;i++){re[i]=((ch[0][o+i]||0)+(ch.length>1?(ch[1][o+i]||0):(ch[0][o+i]||0)))*.5*w[i];im[i]=0}fft(re,im);for(let k=0;k<N/2;k++)acc[k]+=re[k]*re[k]+im[k]*im[k]}
 const out=new Float64Array(BANDS.length),hz=sr/N;
 for(let b=0;b<BANDS.length;b++){const lo=BANDS[b]/Math.pow(2,1/6),hi=BANDS[b]*Math.pow(2,1/6);let s=0,c=0;for(let k=Math.max(1,Math.floor(lo/hz));k<=Math.min(N/2-1,Math.ceil(hi/hz));k++){s+=acc[k];c++}out[b]=c?10*Math.log10(s/c/frames/(N*N)+1e-20):-120}
 return out}
async function analyze(ch,sr,prog){
 prog&&prog('Measuring loudness…');await sleep(10);const L=loudness(energies(ch,sr));
 prog&&prog('Checking peaks…');await sleep(10);const pk=peaks(ch),st=stereo(ch);
 prog&&prog('Reading the spectrum…');await sleep(10);const sp=spectrum(ch,sr);
 const low=sp.slice(0,11).reduce((a,b)=>a+Math.pow(10,b/10),0),mid=sp.slice(11,22).reduce((a,b)=>a+Math.pow(10,b/10),0),hi=sp.slice(22).reduce((a,b)=>a+Math.pow(10,b/10),0),tot=low+mid+hi||1;
 return{I:L.I,max:L.max,short:L.short,peak:db(pk.pk),tp:db(pk.tp),clip:pk.clip,plr:db(pk.tp)-L.I,corr:st.corr,width:st.width,sp,bal:[low/tot,mid/tot,hi/tot],dur:ch[0].length/sr}}

/* =============== mastering processing =============== */
async function eqComp(ch,sr,p){
 const n=ch[0].length,oc=new OAC(2,n,sr),b=oc.createBuffer(2,n,sr);b.copyToChannel(ch[0],0);b.copyToChannel(ch[1],1);
 const s=oc.createBufferSource();s.buffer=b;let node=s;const f=(t,fr,g,q)=>{const x=oc.createBiquadFilter();x.type=t;x.frequency.value=fr;x.gain.value=g;x.Q.value=q||.8;node.connect(x);node=x};
 f('highpass',25,0,.7);f('lowshelf',110,p.lo);f('peaking',2800,p.mid,.7);f('highshelf',9500,p.hi);
 if(p.glue>0){const c=oc.createDynamicsCompressor();c.threshold.value=-12-p.glue*.18;c.knee.value=8;c.ratio.value=1.5+p.glue/100*3;c.attack.value=.025;c.release.value=.22;node.connect(c);node=c}
 node.connect(oc.destination);s.start();const r=await oc.startRendering();return[Float32Array.from(r.getChannelData(0)),Float32Array.from(r.getChannelData(1))]}
function widen(ch,w){if(Math.abs(w-100)<1)return ch;const k=w/100,a=ch[0],b=ch[1];for(let i=0;i<a.length;i++){const m=(a[i]+b[i])*.5,s=(a[i]-b[i])*.5*k;a[i]=m+s;b[i]=m-s}return ch}
/* brick-wall lookahead limiter: result never goes above ceiling (linear) */
function limit(ch,sr,gain,ceil){
 const n=ch[0].length,a=ch[0],b=ch[1],look=Math.max(8,Math.round(sr*.005)),gr=new Float32Array(n);
 for(let i=0;i<n;i++){const pk=Math.max(Math.abs(a[i]),Math.abs(b[i]))*gain;gr[i]=pk>ceil?ceil/pk:1}
 /* running minimum over the next `look` samples */
 const mn=new Float32Array(n),dq=new Int32Array(n+1);let h=0,t=0;
 for(let i=n-1;i>=-look;i--){if(i>=0){while(t>h&&gr[dq[t-1]]>=gr[i])t--;dq[t++]=i}while(t>h&&dq[h]>=i+look)h++;if(i>=0)mn[i]=gr[dq[h]]}
 const oa=new Float32Array(n),ob=new Float32Array(n),rel=1-Math.exp(-1/(sr*.09)),q=new Float32Array(look).fill(1);let sum=look,fl=1;
 for(let i=0;i<n;i++){const v=mn[i];sum+=v-q[i%look];q[i%look]=v;const avg=sum/look;fl=Math.min(avg,fl+(1-fl)*rel);const g=Math.min(avg,fl)*gain;oa[i]=a[i]*g;ob[i]=b[i]*g}
 /* safety clamp */
 for(let i=0;i<n;i++){if(oa[i]>ceil)oa[i]=ceil;else if(oa[i]<-ceil)oa[i]=-ceil;if(ob[i]>ceil)ob[i]=ceil;else if(ob[i]<-ceil)ob[i]=-ceil}
 return[oa,ob]}
async function master(src,sr,p,tgt,prog){
 prog('Shaping the tone…');await sleep(20);let x=await eqComp(src,sr,p);x=widen(x,p.width);
 const [,T,ceilDb]=TARGETS[tgt],ceil=lin(ceilDb-.5);                                   // margin so inter-sample (true) peaks stay under the target
 prog('Measuring…');await sleep(10);const l0=loudness(energies(x,sr)).I;let g=lin(T-l0),y=null,ly=l0;
 for(let it=0;it<5;it++){prog('Setting loudness… '+(it+1)+'/5');await sleep(10);g=Math.min(g,lin(30));y=limit(x,sr,g,ceil);ly=loudness(energies(y,sr)).I;if(Math.abs(T-ly)<.15)break;g*=lin(T-ly)}
 return{ch:y,lufs:ly}}

/* =============== decode / playback / wav =============== */
const dec=ab=>{ax=ax||new AC();return new Promise((res,rej)=>{const p=ax.decodeAudioData(ab,res,rej);p&&p.then&&p.then(res,rej)})};
async function loadSong(id){const r=await tx('blobs','readonly',b=>b.get(id));if(!r||!r.blob)throw new Error('noblob');return dec(await r.blob.arrayBuffer())}
function chans(buf){const c=[Float32Array.from(buf.getChannelData(0))];c.push(buf.numberOfChannels>1?Float32Array.from(buf.getChannelData(1)):Float32Array.from(c[0]));return c}
function toBuf(ch,sr){const b=ax.createBuffer(2,ch[0].length,sr);b.copyToChannel(ch[0],0);b.copyToChannel(ch[1],1);return b}
function wav(ch,sr){const n=ch[0].length,parts=[],h=new DataView(new ArrayBuffer(44)),w=(p,s)=>[...s].forEach((c,i)=>h.setUint8(p+i,c.charCodeAt(0))),by=n*4;
 w(0,'RIFF');h.setUint32(4,36+by,true);w(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,2,true);h.setUint32(24,sr,true);h.setUint32(28,sr*4,true);h.setUint16(32,4,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,by,true);parts.push(h.buffer);
 for(let o=0;o<n;o+=65536){const m=Math.min(65536,n-o),a=new Int16Array(m*2);for(let i=0;i<m;i++)for(let c=0;c<2;c++){let v=ch[c][o+i]+(Math.random()-Math.random())/32768;v=Math.max(-1,Math.min(1,v));a[i*2+c]=v<0?v*32768:v*32767}parts.push(a.buffer)}
 return new Blob(parts,{type:'audio/wav'})}
function stopPlay(){try{srcN&&srcN.stop()}catch(e){}srcN=null;if(pb.on){pb.off=Math.min(pb.off+(ax.currentTime-pb.t0),(OUT?OUT.buf.duration:0));pb.on=false}cancelAnimationFrame(RAF);setPb()}
function startPlay(){
 if(!A||!OUT)return;ax=ax||new AC();if(ax.state==='suspended')ax.resume();stopPlay();
 const useA=pb.ab==='a',buf=useA?A.buf:OUT.buf,m=M.match?Math.min(A.m.I,OUT.m.I):null;
 const g=ax.createGain();g.gain.value=m==null?1:lin(m-(useA?A.m.I:OUT.m.I));
 const s=ax.createBufferSource();s.buffer=buf;s.connect(g);g.connect(ax.destination);if(pb.off>=buf.duration-.05)pb.off=0;s.start(0,pb.off);pb.t0=ax.currentTime;pb.on=true;srcN=s;
 s.onended=()=>{if(srcN===s&&pb.on&&ax.currentTime-pb.t0+pb.off>=buf.duration-.1){pb.on=false;pb.off=0;srcN=null;setPb()}};
 const tick=()=>{RAF=requestAnimationFrame(tick);if(PAGE!=='ms'){stopPlay();return}const sk=$('#msSk');if(sk&&pb.on)sk.value=Math.min(1000,1000*(pb.off+ax.currentTime-pb.t0)/buf.duration)};tick();setPb()}
function setPb(){const b=$('#msPl');if(b)b.textContent=pb.on?'⏸ Pause':'▶ Play';['a','b'].forEach(k=>{const e=$('#msAB'+k);if(e)e.classList.toggle('on',pb.ab===k)})}

/* =============== UI =============== */
const css=document.createElement('style');css.textContent=`
#ms .mc{background:var(--card);border-radius:18px;padding:14px;margin:12px 0}#ms .mc h4{font-size:12px;color:var(--mut);letter-spacing:.4px;margin-bottom:10px}
#ms select{width:100%;padding:11px;margin:0 0 8px;border-radius:12px;background:#1b1f27;color:#fff;border:1px solid #2a303b;font-size:14px}
.mCh{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.mCh button{padding:8px 13px;border-radius:18px;background:#ffffff14;color:#fff;font-size:13px}.mCh button.on{background:var(--ac);color:#04201c;font-weight:700}
.mAct{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.mAct button{flex:1;min-width:120px;padding:13px;border-radius:14px;background:#ffffff14;color:#fff;font-size:13px;font-weight:700}.mAct .pr{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#04201c}.mAct button:disabled{opacity:.55}
.mG{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mG div{background:#ffffff0d;border-radius:12px;padding:10px 6px;text-align:center}.mG b{display:block;font-size:19px}.mG small{font-size:10px;color:var(--mut)}
.mG .ok b{color:#6ee7a0}.mG .warn b{color:#ffd54a}.mG .bad b{color:#ff6b7d}
#ms canvas{width:100%;height:110px;display:block;background:#00000040;border-radius:12px;margin-top:10px}
.mV{font-size:13px;line-height:1.5;margin-top:10px;padding:10px 12px;border-radius:12px;background:#ffffff0d}.mV.ok{border-left:3px solid #6ee7a0}.mV.warn{border-left:3px solid #ffd54a}.mV.bad{border-left:3px solid #ff6b7d}
#ms .rl{display:flex;align-items:center;gap:10px;font-size:13px;margin:8px 0}#ms .rl span{width:82px;flex:none;color:var(--mut)}#ms .rl input{margin:0;padding:0}#ms .rl b{width:50px;text-align:right;flex:none;font-size:12px}
.mBar{height:6px;background:#ffffff18;border-radius:4px;margin-top:10px;overflow:hidden;display:none}.mBar.on{display:block}.mBar i{display:block;height:100%;width:0;background:var(--ac)}.mSt{font-size:12px;color:var(--mut);margin-top:8px}
#msSk{width:100%;margin:10px 0 0;padding:0}
`;document.head.append(css);
document.body.insertAdjacentHTML('beforeend',`<section id="ms" class="page"><div class="top"><button class="ic" onclick="back()">‹</button><h3>🎛 Mastering &amp; Analysis</h3><span></span></div><div id="msBody"></div></section>`);
const act=document.querySelector('.action');if(act)act.insertAdjacentHTML('beforeend','<button onclick="show(\'ms\')">🎛<br>Mastering</button>');

function chips(sel,items,cur,fn){const e=$(sel);if(!e)return;e.innerHTML='';items.forEach(([k,l])=>{const b=document.createElement('button');b.textContent=l;if(k===cur)b.className='on';b.onclick=()=>fn(k);e.append(b)})}
const status=(p,t)=>{const b=$('#msBar');if(b){b.classList.add('on');b.firstChild.style.width=Math.round((p||0)*100)+'%'}const s=$('#msSt');if(s&&t)s.textContent=t};
const idle=()=>{const b=$('#msBar');if(b){b.classList.remove('on');b.firstChild.style.width='0'}const s=$('#msSt');if(s)s.textContent=''};
function songOpts(){const s=$('#msSong');if(!s)return;s.innerHTML='';const o=document.createElement('option');o.value='';o.textContent='Choose a song…';s.append(o);
 (S.songs||[]).filter(x=>x.src!=='online').slice().sort((a,b)=>(a.title||'').localeCompare(b.title||'')).forEach(x=>{const p=document.createElement('option');p.value=x.id;p.textContent=(x.title||x.name)+(x.artist?' — '+x.artist:'');s.append(p)});
 s.value=M.song;if(s.value!==M.song){M.song='';sv()}}
const cls=(v,okF,warnF)=>okF(v)?'ok':warnF(v)?'warn':'bad';
const n1=v=>(v>-99?v.toFixed(1):'−∞');
function grid(m,tg){
 const [,T,C]=TARGETS[tg],dif=m.I-T;
 return`<div class="${Math.abs(dif)<1?'ok':Math.abs(dif)<3?'warn':'bad'}"><b>${n1(m.I)}</b><small>LUFS loudness</small></div>
 <div><b>${n1(m.max)}</b><small>Loudest part (LUFS)</small></div>
 <div class="${m.tp<=C+.1?'ok':m.tp<0?'warn':'bad'}"><b>${n1(m.tp)}</b><small>True peak (dB)</small></div>
 <div class="${m.plr>=7?'ok':m.plr>=5?'warn':'bad'}"><b>${m.plr.toFixed(1)}</b><small>Punch (PLR dB)</small></div>
 <div class="${m.corr>.3?'ok':m.corr>0?'warn':'bad'}"><b>${m.corr.toFixed(2)}</b><small>Stereo match</small></div>
 <div class="${m.clip===0?'ok':m.clip<20?'warn':'bad'}"><b>${m.clip}</b><small>Clipped samples</small></div>`}
function advice(m,tg){
 const [nm,T,C]=TARGETS[tg],dif=m.I-T,t=[];let lvl='ok';
 if(dif>1.5){t.push(`This is ${dif.toFixed(1)} LU louder than ${nm} wants (${T} LUFS). Streaming apps will turn it down, so extra loudness only costs punch.`);lvl='warn'}
 else if(dif<-1.5){t.push(`This is ${(-dif).toFixed(1)} LU quieter than ${nm} (${T} LUFS). Mastering will bring it up so it does not sound weak next to other songs.`);lvl='warn'}
 else t.push(`Loudness is right for ${nm}.`);
 if(m.clip>20){t.push(`It has ${m.clip} clipped samples — you may hear harsh crackle. Turn the gain down before mastering.`);lvl='bad'}
 if(m.tp>C+.1)t.push(`True peak is above ${C} dB, which can distort when converted to MP3.`);
 if(m.plr<5)t.push('It is very squashed (low punch). Avoid pushing it louder.');
 if(m.corr<0)t.push('Left and right cancel each other. This will sound thin on a phone speaker (mono).');
 const [lo,mi,hi]=m.bal;if(lo>.7)t.push('Heavy on bass. Try Low −2 dB.');else if(lo<.25)t.push('Light on bass. Try Low +2 dB.');if(hi<.02)t.push('Very little treble — it may sound dull. Try High +3 dB.');else if(hi>.2)t.push('Lots of treble — it may sound harsh. Try High −2 dB.');
 return{lvl,html:t.join('<br>')}}
function drawSpec(cv,sp,sp2){
 const dp=window.devicePixelRatio||1,w=cv.clientWidth*dp,h=cv.clientHeight*dp;cv.width=w;cv.height=h;const x=cv.getContext('2d'),mx=Math.max(...sp),lo=mx-70,bw=w/sp.length;
 x.fillStyle='#ffffff10';for(let i=1;i<4;i++){x.fillRect(0,h*i/4,w,1)}
 const y=v=>h-Math.max(0,Math.min(1,(v-lo)/70))*h;
 x.fillStyle='#1de9c655';sp.forEach((v,i)=>{x.fillRect(i*bw+1,y(v),bw-2,h-y(v))});
 if(sp2){x.strokeStyle='#ffd54a';x.lineWidth=2*dp;x.beginPath();sp2.forEach((v,i)=>{const px=i*bw+bw/2,py=y(v+(mx-Math.max(...sp2)));i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke()}
 x.fillStyle='#8b929c';x.font=(10*dp)+'px sans-serif';[['50',BANDS.findIndex(f=>f>=50)],['500',BANDS.findIndex(f=>f>=500)],['5k',BANDS.findIndex(f=>f>=5000)],['16k',BANDS.findIndex(f=>f>=16000)]].forEach(([l,i])=>{if(i>=0)x.fillText(l,i*bw,h-3*dp)})}
function drawLoud(cv,sh,T){
 const dp=window.devicePixelRatio||1,w=cv.clientWidth*dp,h=cv.clientHeight*dp;cv.width=w;cv.height=h;const x=cv.getContext('2d');if(!sh.length)return;
 const lo=-40,hi=0,y=v=>h-Math.max(0,Math.min(1,(v-lo)/(hi-lo)))*h;x.strokeStyle='#ffffff40';x.setLineDash([6*dp,6*dp]);x.beginPath();x.moveTo(0,y(T));x.lineTo(w,y(T));x.stroke();x.setLineDash([]);
 x.strokeStyle='#1de9c6';x.lineWidth=2*dp;x.beginPath();sh.forEach((v,i)=>{const px=i/(sh.length-1||1)*w;i?x.lineTo(px,y(v)):x.moveTo(px,y(v))});x.stroke();
 x.fillStyle='#8b929c';x.font=(10*dp)+'px sans-serif';x.fillText('target '+T+' LUFS',4*dp,y(T)-4*dp)}

function showAnalysis(){
 const el=$('#msAn');if(!el||!A)return;
 const m=A.m,ad=advice(m,M.tgt);el.style.display='block';
 el.innerHTML=`<h4>REPORT · ${A.title}</h4><div class="mG">${grid(m,M.tgt)}</div><div class="mV ${ad.lvl}">${ad.html}</div>
  <div class="mSt" style="margin-top:12px">Tonal balance (bass → treble)</div><canvas id="msSp"></canvas><div class="mSt" style="margin-top:12px">Loudness over time</div><canvas id="msLd"></canvas>`;
 drawSpec($('#msSp'),m.sp,OUT&&OUT.m.sp);drawLoud($('#msLd'),m.short,TARGETS[M.tgt][1])}
function showResult(){
 const el=$('#msOut');if(!el)return;if(!OUT){el.style.display='none';return}
 const a=A.m,b=OUT.m,T=TARGETS[M.tgt];el.style.display='block';
 el.innerHTML=`<h4>RESULT</h4><div class="mG">
  <div><b>${n1(a.I)} → ${n1(b.I)}</b><small>LUFS before → after</small></div><div class="${b.tp<=T[2]+.05?'ok':'warn'}"><b>${n1(a.tp)} → ${n1(b.tp)}</b><small>True peak (dB)</small></div><div><b>${a.plr.toFixed(1)} → ${b.plr.toFixed(1)}</b><small>Punch (PLR)</small></div></div>
  <div class="mV ok">Mastered to ${n1(b.I)} LUFS for ${E(T[0])}. The yellow line in the spectrum above shows the new tonal balance.</div>
  <div class="mCh" style="margin-top:12px"><button id="msABa">A · Before</button><button id="msABb" class="on">B · After</button><button id="msMt" class="${M.match?'on':''}">🔉 Volume matched</button></div>
  <input type="range" id="msSk" min="0" max="1000" value="0">
  <div class="mAct"><button class="pr" id="msPl">▶ Play</button><button id="msSave">💾 Save to my music</button></div>
  <div class="mSt">Volume matched means Before and After play at the same loudness, so you hear quality — not just “louder”.</div>`;
 $('#msABa').onclick=()=>{pb.ab='a';const w=pb.on;stopPlay();setPb();if(w)startPlay()};$('#msABb').onclick=()=>{pb.ab='b';const w=pb.on;stopPlay();setPb();if(w)startPlay()};
 $('#msMt').onclick=e=>{M.match=!M.match;sv();e.currentTarget.classList.toggle('on',M.match);const w=pb.on;stopPlay();if(w)startPlay()};
 $('#msPl').onclick=()=>pb.on?stopPlay():startPlay();
 $('#msSk').oninput=e=>{const d=(pb.ab==='a'?A.buf:OUT.buf).duration,w=pb.on;stopPlay();pb.off=d*e.target.value/1000;if(w)startPlay()};
 $('#msSave').onclick=saveOut;setPb();showAnalysis()}

async function doAnalyze(){
 if(busy)return;const so=S.songs.find(x=>x.id===M.song);if(!so)return toast('Choose a song first');
 busy=true;stopPlay();OUT=null;pb={t0:0,off:0,on:false,ab:'b'};lock(true);
 try{status(.05,'Reading the song…');await sleep(20);const buf=await loadSong(so.id),ch=chans(buf);
  const m=await analyze(ch,buf.sampleRate,t=>status(.4,t));A={id:so.id,title:E(so.title||so.name),name:so.title||so.name,buf,ch,sr:buf.sampleRate,m};
  showAnalysis();showResult();$('#msSet').style.display='block'}
 catch(e){toast('Could not read this song. Try a WAV or MP3 saved in your library.')}
 busy=false;lock(false);idle()}
async function doMaster(){
 if(busy||!A)return;busy=true;stopPlay();lock(true);
 try{const p={lo:M.lo,mid:M.mid,hi:M.hi,glue:M.glue,width:M.width};
  const r=await master(A.ch,A.sr,p,M.tgt,t=>status(.5,t));status(.9,'Checking the result…');await sleep(10);
  const m=await analyze(r.ch,A.sr);OUT={ch:r.ch,buf:toBuf(r.ch,A.sr),m};pb={t0:0,off:0,on:false,ab:'b'};showResult();toast('Mastered ✅ Press play and flip between Before and After')}
 catch(e){toast('Could not master this song. Try a shorter one.')}
 busy=false;lock(false);idle()}
async function saveOut(){
 if(!OUT)return;const t=prompt('Name your mastered song',(A.name||'Song')+' (Mastered)');if(!t)return;
 try{const nm=(t.replace(/[\\/:*?"<>|]/g,'').trim()||'Mastered'),f=new File([wav(OUT.ch,A.sr)],nm+'.wav',{type:'audio/wav'});await addFiles([f],'file');
  const s=S.songs.find(x=>x.name===f.name&&x.size===f.size);if(s){s.title=t;s.artist='Me (LB Mastering)';s.album='My Songs';await dbPut(s)}toast('Saved! Find it in Music → My Songs. Use 📦 Export for MP3.');refresh()}
 catch(e){toast('Could not save. Phone storage may be full.')}}
function lock(b){['msGo','msMa'].forEach(i=>{const e=$('#'+i);if(e)e.disabled=b})}

function build(){
 const b=$('#msBody');if(!b)return;built=true;
 b.innerHTML=`<div class="mc"><h4>1 · CHOOSE A SONG</h4><select id="msSong"></select><div class="mAct"><button class="pr" id="msGo">🔍 Analyze</button></div>
  <div class="mBar" id="msBar"><i></i></div><div class="mSt" id="msSt"></div></div>
  <div class="mc" id="msAn" style="display:none"></div>
  <div class="mc" id="msSet" style="display:none"><h4>2 · MASTER IT</h4>
   <div class="mSt" style="margin:0 0 4px">Style</div><div class="mCh" id="msPre"></div>
   <div class="mSt" style="margin:8px 0 4px">Aim for</div><div class="mCh" id="msTg"></div>
   <div class="rl"><span>Bass</span><input type="range" id="msLo" min="-6" max="6" step=".5" value="${M.lo}"><b id="msLov">${M.lo} dB</b></div>
   <div class="rl"><span>Mids / vocal</span><input type="range" id="msMi" min="-6" max="6" step=".5" value="${M.mid}"><b id="msMiv">${M.mid} dB</b></div>
   <div class="rl"><span>Treble</span><input type="range" id="msHi" min="-6" max="6" step=".5" value="${M.hi}"><b id="msHiv">${M.hi} dB</b></div>
   <div class="rl"><span>Glue</span><input type="range" id="msGl" min="0" max="100" value="${M.glue}"><b id="msGlv">${M.glue}%</b></div>
   <div class="rl"><span>Stereo width</span><input type="range" id="msWi" min="50" max="150" value="${M.width}"><b id="msWiv">${M.width}%</b></div>
   <div class="mAct"><button class="pr" id="msMa">✨ Master it</button></div></div>
  <div class="mc" id="msOut" style="display:none"></div>`;
 songOpts();
 const pr=()=>chips('#msPre',Object.keys(PRESETS).map(k=>[k,k]),M.pre,k=>{Object.assign(M,PRESETS[k],{pre:k});sv();build2()}),tg=()=>chips('#msTg',Object.keys(TARGETS).map(k=>[k,TARGETS[k][0]+' ('+TARGETS[k][1]+')']),M.tgt,k=>{M.tgt=k;sv();tg();if(A){showAnalysis()}});
 function build2(){[['Lo','lo',' dB'],['Mi','mid',' dB'],['Hi','hi',' dB'],['Gl','glue','%'],['Wi','width','%']].forEach(([i,k,u])=>{$('#ms'+i).value=M[k];$('#ms'+i+'v').textContent=M[k]+u});pr()}
 pr();tg();
 [['Lo','lo',' dB'],['Mi','mid',' dB'],['Hi','hi',' dB'],['Gl','glue','%'],['Wi','width','%']].forEach(([i,k,u])=>$('#ms'+i).oninput=e=>{M[k]=+e.target.value;M.pre='Custom';$('#ms'+i+'v').textContent=M[k]+u;sv()});
 $('#msSong').onchange=e=>{M.song=e.target.value;sv()};$('#msGo').onclick=doAnalyze;$('#msMa').onclick=doMaster}

window.LBMS={analyze,master,energies,loudness,limit,peaks};   // exposed for testing
R.ms=()=>{if(!built)build();else if(!busy)songOpts()};
})();
