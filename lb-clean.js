/* =====================================================================
   LB Music · CLEAN SOUND  (no more "chichi" hiss in finished songs)
   Works only while Song Lab builds a song or a beat. Nothing else changes.
   1. Hi-hats and shakers: harsh white-noise hiss becomes a soft band of
      noise (about 6 to 11 kHz), so it ticks instead of sizzling.
   2. Reverb: the reverb tail is made darker, so it no longer sounds like "sssh".
   3. Master clean-up: removes rumble below 30 Hz, takes the sharp edge off
      above 10 kHz and cuts everything above 17 kHz.
   ===================================================================== */
(()=>{
if(window.__lbClean)return;
const Base=window.OfflineAudioContext||window.webkitOfflineAudioContext;
if(!Base||typeof Base!=='function')return;
try{
 window.__lbClean=1;
 const FIRST=['createBufferSource','createGain','createDynamicsCompressor','createBiquadFilter','createOscillator','createConvolver','createDelay','createStereoPanner'];
 const cvBuf=window.ConvolverNode&&Object.getOwnPropertyDescriptor(ConvolverNode.prototype,'buffer');
 class CleanOAC extends Base{
  constructor(...a){super(...a);this.__first='';this.__dst=null}
  /* Song Lab's mixer creates its compressor first. Other jobs (like Mastering) do not, so they are left alone. */
  get destination(){
   const real=super.destination;
   if(this.__dst)return this.__dst;
   if(this.__first!=='createDynamicsCompressor')return real;
   const mk=t=>super.createBiquadFilter(),
    hp=mk(),sh=mk(),lp=mk(),inp=super.createGain();
   hp.type='highpass';hp.frequency.value=30;hp.Q.value=.7;
   sh.type='highshelf';sh.frequency.value=10000;sh.gain.value=-2.5;
   lp.type='lowpass';lp.frequency.value=17000;lp.Q.value=.6;
   inp.connect(hp);hp.connect(sh);sh.connect(lp);lp.connect(real);
   return this.__dst=inp}
  createBiquadFilter(){
   if(!this.__first)this.__first='createBiquadFilter';
   const f=super.createBiquadFilter(),c=f.connect;
   f.connect=function(...r){
    if(!this.__hs&&this.type==='highpass'&&this.frequency.value>=7000){   // hi-hat or shaker noise
     this.__hs=1;const fr=this.frequency.value;this.type='bandpass';this.frequency.value=fr*1.15;this.Q.value=1.5}
    return c.apply(this,r)};
   return f}
  createConvolver(){
   if(!this.__first)this.__first='createConvolver';
   const cv=super.createConvolver();
   if(cvBuf&&cvBuf.get&&cvBuf.set)Object.defineProperty(cv,'buffer',{configurable:true,
    get(){return cvBuf.get.call(cv)},
    set(b){
     if(b&&!b.__dk){b.__dk=1;for(let k=0;k<b.numberOfChannels;k++){const d=b.getChannelData(k);let l=0;for(let i=0;i<d.length;i++){l+=(d[i]-l)*.55;d[i]=l}}}   // darker reverb tail
     cvBuf.set.call(cv,b)}});
   return cv}
 }
 FIRST.forEach(n=>{
  if(n==='createBiquadFilter'||n==='createConvolver')return;
  const o=Base.prototype[n];if(!o)return;
  CleanOAC.prototype[n]=function(...a){if(!this.__first)this.__first=n;return o.apply(this,a)}});
 window.OfflineAudioContext=CleanOAC;
}catch(e){console.warn('lb-clean off',e)}
})();