/* =====================================================================
   LB Music · QUIET MIC  (removes mic hiss from your voice in finished songs)
   Works only on the vocal takes while Song Lab creates your song.
   Your saved recordings are NOT changed. Listening to a take before you
   create the song still plays the original.
   1. Between words and phrases the hiss is turned down by about 15 dB
      (not switched off, so it still sounds natural).
   2. Under your voice, the high "sss" hiss is turned down when it is only
      noise. Real "s", "t" and breaths are left alone.
   3. Words are never cut: the cleaner looks ahead and opens before you sing.
   If your recording is already clean or you sing without a pause, it does almost nothing.
   There is an On / Off switch on the Song Lab page (above "Lite mode").
   ===================================================================== */
(()=>{
if(window.__lbMic)return;window.__lbMic=1;

/* in-place: x = one channel (Float32Array). Works in small blocks so it is fast on cheap phones. */
function denoise(x,sr){
 const n=x.length;if(n<sr*.5)return;
 const B=64,nb=Math.ceil(n/B),a5=1-Math.exp(-2*Math.PI*5000/sr),
  eX=new Float32Array(nb),eH=new Float32Array(nb);
 /* pass 1: loudness of every block, for the whole voice and for the high band (above ~5 kHz) */
 let lp=0;
 for(let b=0;b<nb;b++){let sx=0,sh=0;const o=b*B,e=Math.min(n,o+B);
  for(let i=o;i<e;i++){const v=x[i];lp+=a5*(v-lp);const h=v-lp;sx+=v*v;sh+=h*h}
  const c=e-o;eX[b]=sx/c;eH[b]=sh/c}
 /* noise level = quietest 10% of 20 ms stretches */
 const G=14,m=Math.floor(nb/G);if(m<8)return;
 const fx=new Float32Array(m),fh=new Float32Array(m);
 for(let f=0;f<m;f++){let a=0,h=0;for(let j=0;j<G;j++){a+=eX[f*G+j];h+=eH[f*G+j]}fx[f]=Math.sqrt(a/G);fh[f]=Math.sqrt(h/G)}
 fx.sort();fh.sort();
 const nf=fx[Math.floor(m*.1)],nfH=fh[Math.floor(m*.1)];
 if(nf>.012||nf<.00005)return;                                  // too noisy to tell voice from noise, or already clean
 const thr=Math.min(nf*2.4,.015),thrH=Math.min(nfH*3,.006),GMIN=.18,GMINH=.3,
  kb=ms=>Math.exp(-B/(sr*ms/1000)),dHold=kb(80),dHoldH=kb(40),aG=1-kb(3),rG=1-kb(40),aH=1-kb(2),rH=1-kb(30),
  look=Math.max(1,Math.round(sr*.01/B)),
  gA=new Float32Array(nb+1),gH=new Float32Array(nb+1),env=new Float32Array(nb),envH=new Float32Array(nb);
 /* envelopes: instant rise, about 80 ms hold */
 let e1=0,e2=0;
 for(let b=0;b<nb;b++){const r1=Math.sqrt(eX[b]),r2=Math.sqrt(eH[b]);e1=r1>e1?r1:e1*dHold;e2=r2>e2?r2:e2*dHoldH;env[b]=e1;envH[b]=e2}
 /* gains, looking 10 ms ahead so words are never clipped */
 let g=1,gh=1;
 for(let b=0;b<nb;b++){const j=b+look<nb?b+look:nb-1,ev=env[j]/thr,eh=envH[j]/thrH,
  tg=ev>=1?1:Math.max(GMIN,ev*Math.sqrt(ev)),th=eh>=1?1:Math.max(GMINH,eh);
  g+=(tg-g)*(tg>g?aG:rG);gh+=(th-gh)*(th>gh?aH:rH);gA[b]=g;gH[b]=gh}
 gA[nb]=g;gH[nb]=gh;
 /* pass 2: apply (low band keeps the full-band gain, high band also gets its own) */
 lp=0;
 for(let b=0;b<nb;b++){const o=b*B,e=Math.min(n,o+B),g0=gA[b],g1=gA[b+1],h0=gH[b],h1=gH[b+1],dg=(g1-g0)/B,dh=(h1-h0)/B;
  for(let i=o,k=0;i<e;i++,k++){const v=x[i];lp+=a5*(v-lp);const h=v-lp;x[i]=(lp+h*(h0+dh*k))*(g0+dg*k)}}}

window.LBDN=denoise;

/* hook: the Lab de-esses each vocal take on a fresh offline context; we clean the copy it makes */
try{
 const Prev=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(Prev&&typeof Prev==='function'){
  class MicOAC extends Prev{
   createBuffer(ch,len,sr){
    const b=super.createBuffer(ch,len,sr);
    if(this.__first===''&&len>sr&&(typeof LS!=='function'||(LS('clean',null)||{}).mic!==false)){   // a fresh context = a vocal copy, not a beat
     const cp=b.copyToChannel.bind(b);
     b.copyToChannel=function(src,c,off){cp(src,c,off);if(!off){try{denoise(b.getChannelData(c),b.sampleRate)}catch(e){}}}}
    return b}}
  window.OfflineAudioContext=MicOAC}
}catch(e){console.warn('lb-mic off',e)}

/* ---- On / Off switch, shown on the Song Lab page above "Lite mode" ---- */
const isOn=()=>{try{return(LS('clean',null)||{}).mic!==false}catch(e){return true}};
function card(){
 const lab=document.getElementById('lab');if(!lab||document.getElementById('lbMicCard'))return;
 const lite=lab.querySelector('[data-lite]');if(!lite)return;
 const on=isOn(),d=document.createElement('div');d.className='lc';d.id='lbMicCard';
 d.innerHTML='<b>🔇 Quiet mic</b><p class="mut" style="margin:6px 0">Turns down the mic hiss in your voice when the song is created. Your recordings are not changed. Switching restarts the app once.</p><div class="chips" style="margin:10px 0 0"><button class="chip'+(on?' on':'')+'" data-m="1">On</button><button class="chip'+(on?'':' on')+'" data-m="0">Off</button></div>';
 (lite.closest('label')||lite).insertAdjacentElement('beforebegin',d)}
document.addEventListener('click',e=>{
 const b=e.target.closest('#lbMicCard [data-m]');if(!b)return;
 const v=b.dataset.m==='1';if(v===isOn())return;
 try{SV('clean',Object.assign({},LS('clean',null)||{},{mic:v}))}catch(x){}
 b.parentNode.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));
 if(typeof toast==='function')toast(v?'Quiet mic ON — restarting…':'Quiet mic OFF — restarting…');
 setTimeout(()=>location.reload(),1100)});     // restart so the change applies to every part, not only new ones
try{const lab=document.getElementById('lab');if(lab){new MutationObserver(card).observe(lab,{childList:true,subtree:true});card()}}catch(e){}
})();