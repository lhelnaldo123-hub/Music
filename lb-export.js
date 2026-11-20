/* =====================================================================
   LB Music · IMPORT & EXPORT  (add-on)
   Load AFTER lb-vocal.js:  <script src="lb-export.js"></script>
   Adds an "Export" page (button on the Music page) with:
   · Export any song from your library as WAV (lossless) or MP3 (128/192/320)
     — optional louder (normalize) and fade-out — then Download or Share
   · Backup my work: one file with your beats, settings, playlists and
     (optionally) your own songs & recordings
   · Restore from a backup file, and import audio files
   Nothing is removed from the app.
   ===================================================================== */
(()=>{
if(window.__lbExp||typeof R==='undefined')return;window.__lbExp=1;
const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms)),AC=window.AudioContext||window.webkitAudioContext;
const SKIP=['lb_pro','lb_rew','lb_pend','lb_plan'];                  // licence / payment data is never put in a backup file
let X=Object.assign({fmt:'wav',kb:192,norm:true,fade:false,song:'',mine:true},LS('ex',null)||{});
const sv=()=>SV('ex',X);let busy=false,OUT=null,OUT2=null;

/* ---------------- styles + page ---------------- */
const css=document.createElement('style');css.textContent=`
#exp .xc{background:var(--card);border-radius:18px;padding:14px;margin:12px 0}
#exp .xc h4{font-size:12px;color:var(--mut);letter-spacing:.4px;margin-bottom:10px}
#exp select{width:100%;padding:11px;margin:0 0 8px;border-radius:12px;background:#1b1f27;color:#fff;border:1px solid #2a303b;font-size:14px}
.xCh{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.xCh button{padding:8px 13px;border-radius:18px;background:#ffffff14;color:#fff;font-size:13px}.xCh button.on{background:var(--ac);color:#04201c;font-weight:700}
.xAct{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.xAct button{flex:1;min-width:120px;padding:13px;border-radius:14px;background:#ffffff14;color:#fff;font-size:13px;font-weight:700}
.xAct button.pr{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#04201c}.xAct button:disabled{opacity:.55}
.xBar{height:6px;background:#ffffff18;border-radius:4px;margin-top:10px;overflow:hidden;display:none}.xBar.on{display:block}.xBar i{display:block;height:100%;width:0;background:var(--ac)}
.xTip{font-size:12px;color:var(--mut);margin-top:8px;line-height:1.5}.xRes{font-size:13px;color:var(--ac);margin-top:10px;display:none}
`;document.head.append(css);
document.body.insertAdjacentHTML('beforeend',`<section id="exp" class="page"><div class="top"><button class="ic" onclick="back()">‹</button><h3>📦 Import &amp; Export</h3><span></span></div><div id="xBody"></div></section>`);
const act=document.querySelector('.action');
if(act)act.insertAdjacentHTML('beforeend','<button onclick="show(\'exp\')">📦<br>Export</button>');

/* ---------------- helpers ---------------- */
const safe=t=>(String(t||'song').replace(/[\\/:*?"<>|]/g,'').trim()||'song');
const mb=n=>(n/1048576).toFixed(1)+' MB';
function loadLame(){return window.lamejs?Promise.resolve(true):new Promise(r=>{const e=document.createElement('script');e.src='lame.min.js';e.onload=()=>r(!!window.lamejs);e.onerror=()=>r(false);document.head.appendChild(e)})}
function prog(p,t){const b=$('#xBar'),bar=b&&b.firstChild;if(b){b.classList.add('on');bar.style.width=Math.round(p*100)+'%'}const s=$('#xSt');if(s&&t)s.textContent=t}
function done(){const b=$('#xBar');if(b){b.classList.remove('on');b.firstChild.style.width='0'}}
function give(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),60000)}
async function share(blob,name){const f=new File([blob],name,{type:blob.type});
 try{if(navigator.canShare&&navigator.canShare({files:[f]}))await navigator.share({files:[f],title:name});else toast('Sharing is not supported here. Use Download.')}catch(e){}}

/* ---------------- export a song ---------------- */
async function decodeSong(s){
 const r=await tx('blobs','readonly',b=>b.get(s.id));if(!r||!r.blob)throw new Error('noblob');
 const ac=new AC(),ab=await r.blob.arrayBuffer();
 try{return{buf:await new Promise((res,rej)=>{const p=ac.decodeAudioData(ab,res,rej);p&&p.then&&p.then(res,rej)}),blob:r.blob}}finally{ac.close&&ac.close()}}

async function exportSong(){
 if(busy)return;const s=S.songs.find(x=>x.id===X.song);if(!s)return toast('Pick a song first');
 busy=true;OUT=null;setBusy(true);$('#xRes').style.display='none';
 try{
  prog(.02,'Reading the song…');await sleep(20);
  const {buf,blob:orig}=await decodeSong(s),sr=buf.sampleRate,ch=Math.min(2,buf.numberOfChannels),n=buf.length,d=[];
  for(let c=0;c<ch;c++)d.push(buf.getChannelData(c));
  let g=1;if(X.norm){let pk=0;for(let c=0;c<ch;c++){const a=d[c];for(let i=0;i<n;i+=1)if(Math.abs(a[i])>pk)pk=Math.abs(a[i])}if(pk>.001)g=Math.min(4,.97/pk)}
  const fo=X.fade?Math.min(n,Math.round(sr*3)):0,gain=(i)=>fo&&i>=n-fo?g*((n-1-i)/fo):g;
  const base=safe(s.title||s.name.replace(/\.[^.]+$/,''));let blob,name;
  if(X.fmt==='wav'){
   const parts=[],h=new DataView(new ArrayBuffer(44)),w=(p,t)=>[...t].forEach((c,i)=>h.setUint8(p+i,c.charCodeAt(0))),bytes=n*ch*2;
   w(0,'RIFF');h.setUint32(4,36+bytes,true);w(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,ch,true);h.setUint32(24,sr,true);h.setUint32(28,sr*ch*2,true);h.setUint16(32,ch*2,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,bytes,true);parts.push(h.buffer);
   const B=65536;
   for(let o=0;o<n;o+=B){const m=Math.min(B,n-o),o16=new Int16Array(m*ch);
    for(let i=0;i<m;i++)for(let c=0;c<ch;c++){const v=Math.max(-1,Math.min(1,d[c][o+i]*gain(o+i)));o16[i*ch+c]=v<0?v*32768:v*32767}
    parts.push(o16.buffer);if((o/B)%8===0){prog(.1+.88*o/n,'Making WAV…');await sleep(0)}}
   blob=new Blob(parts,{type:'audio/wav'});name=base+'.wav'}
  else{
   if(!await loadLame())throw new Error('nolame');
   const enc=new lamejs.Mp3Encoder(ch,sr,X.kb),B=1152*20,out=[];
   for(let o=0;o<n;o+=B){const m=Math.min(B,n-o),L=new Int16Array(m),Rr=ch>1?new Int16Array(m):null;
    for(let i=0;i<m;i++){const gi=gain(o+i);let v=Math.max(-1,Math.min(1,d[0][o+i]*gi));L[i]=v<0?v*32768:v*32767;
     if(Rr){v=Math.max(-1,Math.min(1,d[1][o+i]*gi));Rr[i]=v<0?v*32768:v*32767}}
    const e=Rr?enc.encodeBuffer(L,Rr):enc.encodeBuffer(L);if(e.length)out.push(new Uint8Array(e));
    if((o/B)%6===0){prog(.1+.88*o/n,'Making MP3… '+Math.round(100*o/n)+'%');await sleep(0)}}
   const e=enc.flush();if(e.length)out.push(new Uint8Array(e));
   blob=new Blob(out,{type:'audio/mpeg'});name=base+'.mp3'}
  OUT={blob,name};prog(1,'');
  const r=$('#xRes');r.style.display='block';r.textContent='✅ '+name+' · '+mb(blob.size)+' — ready';
  $('#xDl').disabled=false;$('#xSh').disabled=false
 }catch(e){toast(e.message==='nolame'?'MP3 maker could not load. Check lame.min.js is in your folder.':'Could not export this song. Try WAV, or a shorter song.')}
 busy=false;setBusy(false);done()}

/* ---------------- backup + restore ---------------- */
const mine=s=>s.album==='My Songs'||s.album==='My Recordings'||/^Me\b/.test(s.artist||'');
const toB64=b=>new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(String(f.result).split(',')[1]||'');f.onerror=rej;f.readAsDataURL(b)});
async function backup(){
 if(busy)return;busy=true;setBusy(true);
 try{
  prog(.05,'Collecting your settings…');await sleep(20);
  const data={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('lb_')&&!SKIP.includes(k))data[k]=localStorage.getItem(k)}
  const parts=['{"app":"LB Music","v":1,"date":'+Date.now()+',"data":'+JSON.stringify(data)+',"songs":['];let first=true,cnt=0;
  if(X.mine){const list=S.songs.filter(mine);
   for(let i=0;i<list.length;i++){const s=list[i];prog(.1+.85*i/Math.max(1,list.length),'Packing '+(i+1)+' of '+list.length+'…');
    const r=await tx('blobs','readonly',b=>b.get(s.id));if(!r||!r.blob)continue;
    const meta={name:s.name,title:s.title,artist:s.artist,album:s.album,type:r.blob.type||'audio/wav'};
    parts.push((first?'':',')+JSON.stringify({m:meta,b:await toB64(r.blob)}));first=false;cnt++;await sleep(0)}}
  parts.push(']}');const blob=new Blob(parts,{type:'application/json'}),nm='LB-Music-backup-'+new Date().toISOString().slice(0,10)+'.lbbackup';
  OUT2={blob,name:nm};prog(1,'');const r=$('#xRes2');r.style.display='block';r.textContent='✅ '+nm+' · '+mb(blob.size)+' · '+cnt+' song(s) inside';
  $('#xDl2').disabled=false;$('#xSh2').disabled=false
 }catch(e){toast('Could not make the backup. Try without songs.')}
 busy=false;setBusy(false);done()}

async function restore(file){
 if(!file||busy)return;busy=true;setBusy(true);
 try{
  prog(.05,'Reading the backup…');const j=JSON.parse(await file.text());
  if(j.app!=='LB Music'||!j.data)throw new Error('bad');
  if(!confirm('Restore this backup? Your current beats, settings and playlists will be replaced with the ones in the file. Songs are added, nothing is deleted.')){busy=false;setBusy(false);done();return}
  Object.entries(j.data).forEach(([k,v])=>{if(k.startsWith('lb_')&&!SKIP.includes(k))try{localStorage.setItem(k,v)}catch(e){}});
  const L=j.songs||[];let n=0;
  for(let i=0;i<L.length;i++){prog(.1+.85*i/Math.max(1,L.length),'Adding song '+(i+1)+' of '+L.length+'…');
   const it=L[i],bin=atob(it.b),u=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);
   const f=new File([u],it.m.name,{type:it.m.type});await addFiles([f],'file');
   const s=S.songs.find(x=>x.name===f.name&&x.size===f.size);if(s){s.title=it.m.title;s.artist=it.m.artist;s.album=it.m.album;await dbPut(s)}n++;await sleep(0)}
  prog(1,'');toast('Restored ✅ '+n+' song(s). The app will reload.');setTimeout(()=>location.reload(),1600)
 }catch(e){toast('That file is not a valid LB Music backup')}
 busy=false;setBusy(false);done()}

/* ---------------- UI ---------------- */
function setBusy(b){['xGo','xBk','xRs','xImp'].forEach(id=>{const e=$('#'+id);if(e)e.disabled=b})}
function chips(sel,items,cur,fn){const e=$(sel);if(!e)return;e.innerHTML='';items.forEach(([k,l])=>{const b=document.createElement('button');b.textContent=l;if(k===cur)b.className='on';b.onclick=()=>fn(k);e.append(b)})}
function songOpts(){const s=$('#xSong');if(!s)return;s.innerHTML='';const o=document.createElement('option');o.value='';o.textContent='Choose a song…';s.append(o);
 (S.songs||[]).filter(x=>x.src!=='online').slice().sort((a,b)=>(a.title||'').localeCompare(b.title||'')).forEach(x=>{const p=document.createElement('option');p.value=x.id;p.textContent=(x.title||x.name)+(x.artist?' — '+x.artist:'');s.append(p)});
 s.value=X.song;if(s.value!==X.song){X.song='';sv()}}
let built=false;
function build(){
 const b=$('#xBody');if(!b)return;built=true;
 b.innerHTML=`
 <div class="xc"><h4>EXPORT A SONG</h4><select id="xSong"></select>
  <div class="xCh" id="xFmt"></div><div class="xCh" id="xKb"></div>
  <div class="xCh" id="xNorm"></div><div class="xCh" id="xFade"></div>
  <div class="xAct"><button class="pr" id="xGo">⚙️ Make the file</button></div>
  <div class="xBar" id="xBar"><i></i></div><div class="xTip" id="xSt"></div><div class="xRes" id="xRes"></div>
  <div class="xAct"><button id="xDl" disabled>⬇️ Download</button><button id="xSh" disabled>📤 Share</button></div>
  <div class="xTip">WAV keeps full quality. MP3 is smaller and plays everywhere. Your original song stays untouched.</div></div>
 <div class="xc"><h4>BACKUP MY WORK</h4>
  <div class="xTip" style="margin:0 0 8px">One file with your beats, settings, playlists and favourites. Your Pro licence is never put in the file.</div>
  <div class="xCh" id="xMine"></div>
  <div class="xAct"><button class="pr" id="xBk">💾 Make a backup</button></div>
  <div class="xRes" id="xRes2"></div><div class="xAct"><button id="xDl2" disabled>⬇️ Download</button><button id="xSh2" disabled>📤 Share</button></div></div>
 <div class="xc"><h4>RESTORE &amp; IMPORT</h4>
  <div class="xAct"><button id="xRs">♻️ Restore a backup</button><button id="xImp">📂 Import audio files</button></div>
  <input type="file" id="xRsF" accept=".lbbackup,application/json" style="display:none"><input type="file" id="xImpF" accept="audio/*" multiple style="display:none">
  <div class="xTip">Import adds songs from your phone to My Music. Restore brings back a backup made here.</div></div>`;
 songOpts();
 const fm=()=>{chips('#xFmt',[['wav','WAV · lossless'],['mp3','MP3 · smaller']],X.fmt,k=>{X.fmt=k;sv();fm()});
  chips('#xKb',[[128,'128 kbps'],[192,'192 kbps'],[320,'320 kbps']],X.kb,k=>{X.kb=k;sv();fm()});$('#xKb').style.display=X.fmt==='mp3'?'':'none'},
  nm=()=>chips('#xNorm',[[1,'🔊 Make louder'],[0,'Keep volume']],X.norm?1:0,k=>{X.norm=!!k;sv();nm()}),
  fd=()=>chips('#xFade',[[0,'No fade'],[1,'Fade out the end']],X.fade?1:0,k=>{X.fade=!!k;sv();fd()}),
  mn=()=>chips('#xMine',[[1,'Include my songs & recordings'],[0,'Settings only (small)']],X.mine?1:0,k=>{X.mine=!!k;sv();mn()});
 fm();nm();fd();mn();
 $('#xSong').onchange=e=>{X.song=e.target.value;sv();OUT=null;$('#xDl').disabled=$('#xSh').disabled=true;$('#xRes').style.display='none'};
 $('#xGo').onclick=exportSong;
 $('#xDl').onclick=()=>OUT&&give(OUT.blob,OUT.name);$('#xSh').onclick=()=>OUT&&share(OUT.blob,OUT.name);
 $('#xBk').onclick=backup;$('#xDl2').onclick=()=>OUT2&&give(OUT2.blob,OUT2.name);$('#xSh2').onclick=()=>OUT2&&share(OUT2.blob,OUT2.name);
 $('#xRs').onclick=()=>$('#xRsF').click();$('#xRsF').onchange=e=>{restore(e.target.files[0]);e.target.value=''};
 $('#xImp').onclick=()=>$('#xImpF').click();$('#xImpF').onchange=async e=>{const f=[...e.target.files];e.target.value='';if(!f.length)return;await addFiles(f,'file');toast('Imported '+f.length+' file(s) to My Music');songOpts();refresh()}}

R.exp=()=>{if(!built)build();else if(!busy)songOpts()};
})();
