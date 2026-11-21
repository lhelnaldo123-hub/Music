/* =====================================================================
   LB Music add-on  ·  Music Videos + Song Lab
   Load AFTER lb-extra.js  →  <script src="lb-lab.js"></script>
   Nothing in index.html is removed. This file only ADDS things.
   ===================================================================== */
(()=>{
if(window.__lbLab)return;window.__lbLab=1;
const $=s=>document.querySelector(s),
E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
AC=window.AudioContext||window.webkitAudioContext,SR=44100,
/* Lite mode (old phones like itel): on by default for phones with 2 GB RAM or less until the user picks. */
isLite=()=>{const v=LS('lite',null);return v===null?(navigator.deviceMemory!=null&&navigator.deviceMemory<=2):!!v},
sleep=ms=>new Promise(r=>setTimeout(r,ms)),
fm=t=>{t=Math.round(t||0);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')},
kvPut=(id,blob)=>tx('kv','readwrite',k=>k.put({id,blob})),
kvGet=id=>tx('kv','readonly',k=>k.get(id)),
kvDel=id=>tx('kv','readwrite',k=>k.delete(id)),
dec=ab=>new OfflineAudioContext(2,1,SR).decodeAudioData(ab),
mtof=m=>440*Math.pow(2,(m-69)/12),
AUD='https://api.audius.co/v1';

/* ---------------- styles + DOM ---------------- */
const css=document.createElement('style');css.textContent=`
#lbMini{position:fixed;right:12px;bottom:calc(140px + env(safe-area-inset-bottom));z-index:110;display:none;align-items:center;gap:6px;background:#1b1f27;border:1px solid #ffffff33;border-radius:999px;padding:5px 6px 5px 14px;box-shadow:0 6px 22px #000a;font-size:13px;font-weight:700;color:#fff}#lbMini.on{display:flex}#lbMini button{width:36px;height:36px;border-radius:50%;background:#ffffff1a;color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center}#lbMini #lbMiniX{background:#e5384f}
.lbtn{background:var(--card);border:1px solid #ffffff22;border-radius:14px;padding:11px 14px;font-size:13px;font-weight:700;color:#fff}
.lbtn.pr{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#04201c;border:0}
.lbtn.rec{background:#e5384f;color:#fff;border:0}
.lc{background:var(--card);border-radius:18px;padding:14px;margin:12px 0}
.lh{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.lh b{flex:1;font-size:16px}
#lab select,.lc select,#sheet select{width:auto;padding:8px;margin:0;border-radius:10px;background:#1b1f27;color:#fff;border:1px solid #2a303b;font-size:13px}
.lrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}
.lc textarea{margin-top:10px;font-size:13px}
.sq{display:grid;grid-template-columns:repeat(16,1fr);gap:2px;margin:4px 0 10px}.sq i{height:24px;border-radius:4px;background:#ffffff18}.sq i.on{background:var(--ac)}.sq i:nth-child(4n+1){outline:1px solid #ffffff35}
.ok{color:var(--ac);font-size:12px;margin-top:8px}
#vid,#recov,#busy{position:fixed;inset:0;background:#0b0d11;display:none;flex-direction:column;padding:12px 14px calc(14px + env(safe-area-inset-bottom))}
#vid{z-index:120}#recov{z-index:130}#busy{z-index:140;align-items:center;justify-content:center;text-align:center;background:#0b0d11ee}
#vid.on,#recov.on{display:flex}#busy.on{display:flex}
.vh{display:flex;align-items:center;gap:10px;margin-bottom:8px}.vh b{flex:1;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vh a{color:var(--ac);font-size:12px}
#vF{width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;flex:none}#vF iframe{width:100%;height:100%;border:0}
#vErr{display:none;background:#3a1b1b;border-radius:12px;padding:10px;margin-top:8px;font-size:13px}#vErr a{color:var(--ac)}
.vb{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}
#vTabs{margin:2px 0 8px}#vRel{flex:1;min-height:0;overflow:auto;scrollbar-width:none}#vRel .row.done{opacity:.45}#vRel .row.now b{color:var(--ac)}
#vLy,#rLy{flex:1;overflow:auto;text-align:center;line-height:1.6;font-size:17px;font-weight:600;scrollbar-width:none;padding:8px}
#vLy p{color:#ffffff70;padding:4px 0;cursor:pointer}#vLy p.cu{color:#fff;font-size:20px}#vLy .pl{white-space:pre-wrap;font-weight:500;font-size:15px;color:#ddd}
#rLy{white-space:pre-wrap;font-size:19px}
#rBig{font-size:64px;text-align:center;margin:6px 0}
#rBar{height:5px;background:#ffffff22;border-radius:4px;overflow:hidden;margin:8px 0}#rBar i{display:block;height:100%;width:0;background:var(--ac)}
.rb{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;min-height:48px}
`;document.head.append(css);

/* lb-extra.js also made a #vid overlay and a 🎬 chip with the same ids -> the video was loading into a hidden copy. Remove the old ones. */
document.querySelectorAll('#vid,#smC').forEach(el=>el.remove());
document.body.insertAdjacentHTML('beforeend',`
<section id="lab" class="page"></section>
<div id="vid"><div class="vh"><button class="ib" id="vX">⌄</button><b id="vT"></b><a id="vYt" target="_blank" rel="noopener">YouTube ↗</a></div>
 <div id="vF"></div><div id="vErr">⚠️ This video does not allow playing inside apps. <a id="vYt2" target="_blank" rel="noopener">Open it on YouTube</a> or tap “Play song only”.</div>
 <div class="vb"><button class="lbtn" id="vShuf">🔀 Shuffle</button><button class="lbtn" id="vNext">⏭ Next</button><button class="lbtn" id="vAuto">⏭ Autoplay: On</button><button class="lbtn" id="vLb">🔎 Find lyrics</button><button class="lbtn pr" id="vAud">🎧 Play song only</button></div>
 <div class="chips" id="vTabs"><button class="chip on" data-t="rel">▶ Related songs</button><button class="chip" data-t="ly">🎤 Lyrics</button></div>
 <div id="vRel"></div><div id="vLy" style="display:none"></div></div>
<div id="recov"><div class="vh"><b id="rTitle"></b><button class="ib" id="rX">✕</button></div><div id="rLy"></div><div id="rBig">…</div><div id="rBar"><i></i></div><div class="rb" id="rBtns"></div><p class="mut" style="text-align:center;margin-top:8px">🎧 Use headphones so the beat is not picked up by the mic</p></div>
<style>.pbar{width:70%;max-width:320px;height:10px;background:#ffffff22;border-radius:8px;overflow:hidden;margin-top:14px}.pbar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#1de9c6,#ff8a3d);transition:width .2s}</style><div id="busy"><div class="spin"></div><h3 id="bMsg" style="margin-top:10px"></h3><div class="pbar"><i id="bBar"></i></div><p class="mut" style="margin-top:8px">Please keep the app open</p></div>`);
$('#nav').insertAdjacentHTML('beforeend','<button data-p="lab" onclick="show(\'lab\')"><span>🎙</span>Lab</button>');

/* =====================================================================
   PART 1 · MUSIC VIDEOS (music only, no API key needed)
   ===================================================================== */
const PIPED=['https://pipedapi.kavin.rocks','https://pipedapi.adminforge.de','https://api.piped.private.coffee','https://pipedapi.leptons.xyz','https://piped-api.garudalinux.org'],
INV=['https://yewtu.be','https://inv.nadeko.net','https://invidious.nerdvpn.de'];
let VID=false,VT,VCUR=null,VL,VLY=[],VLI=-1,VREL=[],VPLAYED=new Set(),VRT=0,VEND=0,VAUTO=LS('vauto',true);
async function ft(u,ms=7000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(u,{signal:c.signal})}finally{clearTimeout(t)}}
const un=s=>{const t=document.createElement('textarea');t.innerHTML=s;return t.value};
const thumb=id=>`https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
async function vsearch(q){
 const key=LS('ytkey','');
 if(key){try{const j=await(await ft(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=20&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`)).json();
  if(j.items&&j.items.length)return j.items.map(i=>({id:i.id.videoId,title:un(i.snippet.title),by:un(i.snippet.channelTitle),dur:0}))}catch(e){}}
 const okDur=d=>!d||d<=720;
 const tp=h=>ft(`${h}/search?q=${encodeURIComponent(q)}&filter=music_videos`).then(r=>r.ok?r.json():Promise.reject()).then(j=>{const it=(j.items||[]).filter(x=>x.url&&x.url.includes('watch?v=')&&okDur(x.duration)).map(x=>({id:x.url.split('v=')[1].split('&')[0],title:x.title,by:x.uploaderName||'',dur:x.duration}));return it.length?it:Promise.reject()});
 try{return await Promise.any(PIPED.map(tp))}catch(e){}
 const ti=h=>ft(`${h}/api/v1/search?type=video&q=${encodeURIComponent(q+' official music video')}`).then(r=>r.ok?r.json():Promise.reject()).then(j=>{const it=(Array.isArray(j)?j:[]).filter(x=>x.videoId&&okDur(x.lengthSeconds)).map(x=>({id:x.videoId,title:x.title,by:x.author||'',dur:x.lengthSeconds}));return it.length?it:Promise.reject()});
 try{return await Promise.any(INV.map(ti))}catch(e){}
 return null}
async function runVid(){const b=$('#sRes'),q=$('#q').value.trim(),my=++runVid.n;
 if(!navigator.onLine){b.innerHTML='<div class="empty">📡 You are offline.<br>Videos need internet.</div>';return}
 b.innerHTML='<div class="spin"></div>';
 const r=await vsearch(q||'new music official video');if(my!==runVid.n||!VID)return;
 const hd=`<div class="lh"><h3 style="flex:1">${q?'🎬 Music videos':'🔥 Popular music videos'}</h3><button class="more" id="vKey">🔑 Key</button><button class="more" id="vLnk">🔗 Link</button></div><p class="mut" style="margin:6px 0 10px">Music videos only. Tap one to watch inside LB Music — lyrics appear when found.</p>`;
 if(!r){b.innerHTML=hd+'<div class="empty">Could not reach the video search right now.<br>Try again, paste a YouTube link (🔗), or use <b>🌍 Online</b> to listen to the song alone.</div>'}
 else{b.innerHTML=hd+r.map((v,i)=>`<div class="row" data-i="${i}"><div class="cv" style="background-image:url(${thumb(v.id)});width:92px;height:52px"></div><div class="si"><b>${E(v.title)}</b><small>${E(v.by)}${v.dur?' · '+fm(v.dur):''}</small></div><button class="ib">▶</button></div>`).join('');
  b.querySelectorAll('.row').forEach(x=>x.onclick=()=>openVid(r[x.dataset.i]))}
 const k=b.querySelector('#vKey');if(k)k.onclick=keySheet;const l=b.querySelector('#vLnk');if(l)l.onclick=linkVid}
runVid.n=0;
function keySheet(){const w=document.createElement('div');w.innerHTML=`<p class="mut" style="margin:6px 0">Optional. Without a key the app uses free public video search. With your own YouTube Data API key, search uses YouTube’s official music category.</p><input id="ykk" placeholder="Paste YouTube API key" value="${E(LS('ytkey',''))}">`;
 sheet('YouTube key (optional)',[{ic:'💾',t:'Save key',fn:()=>{SV('ytkey',$('#ykk').value.trim());toast('Saved ✅');runVid()}}],w)}
function linkVid(){const w=document.createElement('div');w.innerHTML='<input id="ylk" placeholder="Paste a YouTube link">';
 sheet('Open a YouTube link',[{ic:'▶',t:'Watch',fn:()=>{const m=$('#ylk').value.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);if(!m)return toast('That is not a YouTube link');openVid({id:m[1],title:'YouTube video',by:''})}}],w)}
/* search chip + wrappers (nothing replaced, only wrapped) */
$('#smA').parentElement.insertAdjacentHTML('beforeend','<button class="chip" id="smC">🎬 Videos</button>');
const _setSM=window.setSM,_rs=window.renderSearch,_os=window.onSearch;
window.setSM=v=>{VID=false;$('#smC').classList.remove('on');_setSM(v)};
window.renderSearch=()=>{if(VID)return;_rs()};
window.onSearch=()=>{if(!VID)return _os();clearTimeout(VT);VT=setTimeout(runVid,650)};
$('#smC').onclick=()=>{VID=true;$('#smA').classList.remove('on');$('#smB').classList.remove('on');$('#smC').classList.add('on');$('#q').placeholder='🎬  Search music videos…';runVid()};
/* player */
function openVid(v,keep){try{au.pause()}catch(e){}VCUR=v;VLY=[];VLI=-1;
 $('#vid').classList.add('on');$('#vT').textContent=v.title;$('#vYt').href=$('#vYt2').href='https://www.youtube.com/watch?v='+v.id;$('#vErr').style.display='none';
 const org=location.protocol.startsWith('http')?'&origin='+encodeURIComponent(location.origin):'';
 $('#vF').innerHTML=`<iframe id="vIf" src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0&enablejsapi=1${org}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
 const f=$('#vIf');f.onload=()=>{let n=0;clearInterval(VL);VL=setInterval(()=>{try{f.contentWindow.postMessage(JSON.stringify({event:'listening',id:1,channel:'widget'}),'*')}catch(e){}if(++n>30)clearInterval(VL)},500)};
 vLyr(false);
 if(keep){VPLAYED.add(v.id);renderRel()}else{VPLAYED=new Set([v.id]);VREL=[];loadRel(v)}
 showTab('rel')}
function closeVid(){VRT++;$('#vid').classList.remove('on');$('#vF').innerHTML='';clearInterval(VL)}
$('#vX').onclick=closeVid;
/* ---- related / similar songs under the video ---- */
async function relatedOf(id){
 const ok=d=>!d||d<=720;
 const tp=h=>ft(`${h}/streams/${id}`,9000).then(r=>r.ok?r.json():Promise.reject()).then(j=>{const it=(j.relatedStreams||[]).filter(x=>x.url&&x.url.includes('watch?v=')&&ok(x.duration)).map(x=>({id:x.url.split('v=')[1].split('&')[0],title:x.title,by:x.uploaderName||'',dur:x.duration}));return it.length?it:Promise.reject()});
 try{return await Promise.any(PIPED.map(tp))}catch(e){}
 const ti=h=>ft(`${h}/api/v1/videos/${id}?fields=recommendedVideos`,9000).then(r=>r.ok?r.json():Promise.reject()).then(j=>{const it=(j.recommendedVideos||[]).filter(x=>x.videoId&&ok(x.lengthSeconds)).map(x=>({id:x.videoId,title:x.title,by:x.author||'',dur:x.lengthSeconds}));return it.length?it:Promise.reject()});
 try{return await Promise.any(INV.map(ti))}catch(e){}
 return[]}
async function loadRel(v){const my=++VRT,b=$('#vRel');b.innerHTML='<div class="spin"></div>';
 if(!navigator.onLine){b.innerHTML='<div class="empty">📡 You are offline.<br>Related songs need internet.</div>';return}
 const g=guess(v),q=(g.a&&g.a.length>1?g.a:g.t)||v.title;
 const [r1,r2]=await Promise.allSettled([relatedOf(v.id),vsearch(q)]);
 if(my!==VRT)return;
 const seen=new Set([v.id]),out=[];
 [r1,r2].forEach(r=>{if(r.status==='fulfilled'&&Array.isArray(r.value))r.value.forEach(x=>{if(x&&x.id&&!seen.has(x.id)){seen.add(x.id);out.push(x)}})});
 VREL=out.slice(0,30);renderRel()}
function renderRel(){const b=$('#vRel');
 if(!VREL.length){b.innerHTML='<div class="empty">No related songs found right now.<br>Try again in a moment.</div>';return}
 b.innerHTML='<p class="mut" style="margin:2px 0 6px">Similar songs · tap one to play</p>'+VREL.map((v,i)=>`<div class="row${VPLAYED.has(v.id)?' done':''}${VCUR&&VCUR.id===v.id?' now':''}" data-i="${i}"><div class="cv" style="background-image:url(${thumb(v.id)});width:92px;height:52px"></div><div class="si"><b>${E(v.title)}</b><small>${E(v.by)}${v.dur?' · '+fm(v.dur):''}</small></div><button class="ib">▶</button></div>`).join('');
 b.querySelectorAll('.row').forEach(x=>x.onclick=()=>openVid(VREL[x.dataset.i],true))}
function nextVid(){const n=VREL.find(x=>!VPLAYED.has(x.id));if(!n){toast('No more related songs');return}openVid(n,true)}
function showTab(t){$('#vRel').style.display=t==='rel'?'':'none';$('#vLy').style.display=t==='ly'?'':'none';
 document.querySelectorAll('#vTabs [data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
 if(t==='ly'){const c=$('#vLy').querySelector('p.cu');if(c)c.scrollIntoView({block:'center'})}}
document.querySelectorAll('#vTabs [data-t]').forEach(b=>b.onclick=()=>showTab(b.dataset.t));
$('#vShuf').onclick=()=>{const un=VREL.filter(x=>!VPLAYED.has(x.id)),pl=VREL.filter(x=>VPLAYED.has(x.id));
 for(let i=un.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[un[i],un[j]]=[un[j],un[i]]}
 VREL=[...un,...pl];renderRel();showTab('rel');toast('Shuffled 🔀')};
$('#vNext').onclick=nextVid;
const setAuto=()=>{$('#vAuto').textContent='⏭ Autoplay: '+(VAUTO?'On':'Off')};
$('#vAuto').onclick=()=>{VAUTO=!VAUTO;SV('vauto',VAUTO);setAuto()};setAuto();
addEventListener('message',e=>{if(!/youtube/.test(e.origin))return;let d;try{d=typeof e.data==='string'?JSON.parse(e.data):e.data}catch(x){return}if(!d)return;
 if(d.event==='infoDelivery'&&d.info&&typeof d.info.currentTime==='number')vTick(d.info.currentTime);
 if(d.event==='onError')$('#vErr').style.display='block';
 const ended=(d.event==='onStateChange'&&d.info===0)||(d.event==='infoDelivery'&&d.info&&d.info.playerState===0);
 if(ended&&VAUTO&&Date.now()-VEND>4000){VEND=Date.now();nextVid()}});
const clean=t=>t.replace(/\(.*?\)|\[.*?\]|official|music video|video|lyrics?|audio|\bhd\b|4k|m\/v/gi,'').replace(/\s+/g,' ').trim();
function guess(v){let t=v.title.replace(/\|.*$/,''),a=(v.by||'').replace(/ - Topic$|VEVO$/i,'').trim();const i=t.indexOf(' - ');if(i>0){a=clean(t.slice(0,i));t=clean(t.slice(i+3))}else t=clean(t);return{a,t:t.replace(/\s*(ft\.|feat\.).*$/i,'').trim()}}
const lrc=t=>{const o=[];(t||'').split('\n').forEach(l=>{const m=[...l.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)],x=l.replace(/\[[^\]]*\]/g,'').trim();m.forEach(a=>o.push({t:+a[1]*60+ +a[2],x}))});return o.sort((a,b)=>a.t-b.t)};
async function vLyr(force){const b=$('#vLy');if(!VCUR)return;const{a,t}=guess(VCUR);b.innerHTML='<div class="mut">Looking for lyrics…</div>';
 if(!navigator.onLine){b.innerHTML='<div class="mut">Lyrics need internet.</div>';return}
 try{let r=await fetch('https://lrclib.net/api/get?'+new URLSearchParams({track_name:t,artist_name:a})),j=r.ok?await r.json():null;
  if(!j){r=await fetch('https://lrclib.net/api/search?q='+encodeURIComponent((a+' '+t).trim()));const l=r.ok?await r.json():[];j=l[0]}
  const txt=j&&(j.syncedLyrics||j.plainLyrics);if(!txt){b.innerHTML='<div class="mut">No lyrics found for this video.</div>';return}
  const ln=lrc(txt);if(ln.length){VLY=ln;b.innerHTML=ln.map((l,i)=>`<p data-i="${i}">${E(l.x||'♪')}</p>`).join('')}else b.innerHTML=`<div class="pl">${E(txt)}</div>`}
 catch(e){b.innerHTML='<div class="mut">Could not reach the lyrics service.</div>'}}
function vTick(t){if(!VLY.length)return;let i=-1;for(let k=0;k<VLY.length;k++){if(VLY[k].t<=t+.25)i=k;else break}
 if(i!==VLI){VLI=i;const ps=$('#vLy').querySelectorAll('p');ps.forEach((p,k)=>p.classList.toggle('cu',k===i));if(ps[i])ps[i].scrollIntoView({block:'center',behavior:'smooth'})}}
$('#vLb').onclick=()=>vLyr(true);
$('#vAud').onclick=async()=>{if(!VCUR)return;const{a,t}=guess(VCUR);toast('Finding the song…');
 try{const j=await(await fetch(`${AUD}/tracks/search?query=${encodeURIComponent((a+' '+t).trim())}&app_name=LBMusic&limit=10`)).json();
  const l=(j.data||[]).map(x=>({id:'a'+x.id,title:x.title,artist:x.user?.name||'Unknown',album:'',dur:x.duration,artUrl:x.artwork?.['480x480']||'',url:`${AUD}/tracks/${x.id}/stream?app_name=LBMusic`,srcName:'Full',online:true,full:true,name:x.title,size:0}));
  if(!l.length)return toast('Full song not found online. Try 🌍 Online search or add it to your music.');
  closeVid();playOnline(l,0)}catch(e){toast('Could not reach the music server')}};
/* 🎬 button in the full player: watch the video of the song that is playing */
const _lyBtn=$('#bLy');if(_lyBtn)_lyBtn.insertAdjacentHTML('afterend','<button class="ib" id="bVid" title="Watch video">🎬</button>');
if($('#bVid'))$('#bVid').onclick=()=>{const s=cur();if(!s)return;closeFull();show('search');$('#q').value=((s.artist&&s.artist!=='Unknown artist')?s.artist+' ':'')+s.title;$('#smC').click()};

/* =====================================================================
   PART 2 · SONG LAB  (beats → verses/chorus/bridge → studio mix → export)
   ===================================================================== */
const ST={
 trap:{n:'Trap',bpm:140,k:'x.......x.x.....',s:'........x.......',h:'x.x.x.x.x.x.xxxx',c:'........x.......',b:'x.......x.x.....',L:4},
 drill:{n:'Drill',bpm:142,k:'x.....x...x.....',s:'........x.......',h:'x.x.x.xxx.x.x.xx',c:'........x.......',b:'x.....x.........',L:4},
 boombap:{n:'Boom Bap',bpm:90,k:'x.....x...x.....',s:'....x.......x...',h:'x.x.x.x.x.x.x.x.',c:'',b:'x.....x...x.....',L:2,sw:.3},
 lofi:{n:'Lo-fi chill',bpm:75,k:'x.....x...x.....',s:'....x.......x...',h:'x.x.x.x.x.x.x.x.',c:'',b:'x.......x.......',L:3,sw:.35,vin:1},
 afro:{n:'Afrobeat',bpm:105,k:'x..x..x...x..x..',s:'....x.......x...',h:'x.xxx.xxx.xxx.xx',c:'',b:'x..x..x...x..x..',L:2},
 piano:{n:'Amapiano',bpm:112,k:'x...x...x...x...',s:'....x.......x...',h:'..x...x...x...x.',c:'....x.......x...',b:'x..x..x...x..x..',L:2,log:1},
 pop:{n:'Pop',bpm:118,k:'x...x...x...x...',s:'',h:'..x...x...x...x.',c:'....x.......x...',b:'x...x...x...x...',L:2},
 rnb:{n:'R&B slow jam',bpm:78,k:'x.....x.....x...',s:'....x.......x...',h:'x.x.x.x.x.x.x.x.',c:'',b:'x.......x.......',L:4,sw:.2}
};
const styleOf=id=>ST[id]||LS('beats',{})[id]||ST.trap;
const FL={intro:{pad:1,keys:1,hat:1},verse:{kick:1,snare:1,hat:1,bass:1,pad:.5},chorus:{kick:1,snare:1,hat:1,bass:1,pad:1,keys:1,clap:1,open:1},bridge:{pad:1,bass:1,keys:1},outro:{pad:1,keys:1}};
const CH={m:[[0,0],[8,1],[3,1],[10,1]],M:[[0,1],[7,1],[9,0],[5,1]]};
const FX={'Clean Studio':{rev:.16,echo:.10,dbl:.28,pres:2,air:1,warm:0},'Warm Radio':{rev:.08,echo:.05,dbl:.18,pres:1.5,air:.5,warm:3},'Big Hall':{rev:.34,echo:.16,dbl:.35,pres:2,air:1.5,warm:0},'Trap Echo':{rev:.14,echo:.28,dbl:.30,pres:3,air:1.5,warm:0},'Club':{rev:.12,echo:.18,dbl:.40,pres:3,air:2,warm:-1},'Radio Loud':{rev:.05,echo:.03,dbl:.12,pres:3.5,air:1,warm:2},'Raw / Dry':{rev:0,echo:0,dbl:0,pres:0,air:0,warm:0}};
const KEYS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const TB={},EXT={},GUIDE=new Map();
let P=null,RES=null,BUSY=false,LC=null,LP=[],TUN={};
const fixP=p=>{if(p){p.vol=p.vol||{beat:80,voc:100};if(p.vol.bk==null)p.vol.bk=60;p.mute=p.mute||{};if(p.solo===undefined)p.solo=null;p.tune=p.tune||0;p.master=p.master||'off'}return p};
const gf=(p,k)=>p.solo?(p.solo===k?1:0):(p.mute&&p.mute[k]?0:1);
const VB=id=>TUN[id]||TB[id];
const lc=()=>{LC=LC||new AC();LC.resume&&LC.resume();return LC};
/* ---- floating preview pill: pause / stop a preview from any page ---- */
let MPK=0,MPP=0;const mpEl=document.createElement('div');mpEl.id='lbMini';mpEl.innerHTML='<span id="lbMiniT">🎧 Preview</span><button id="lbMiniP" aria-label="Pause">⏸</button><button id="lbMiniX" aria-label="Stop">✕</button>';document.body.appendChild(mpEl);
const mpShow=(k,t)=>{MPK=k;MPP=0;mpEl.querySelector('#lbMiniT').textContent=t;mpEl.querySelector('#lbMiniP').textContent='⏸';mpEl.classList.add('on')};
const mpHide=()=>{MPK=0;MPP=0;mpEl.classList.remove('on')};
const stopL=()=>{LP.forEach(x=>{try{x.stop()}catch(e){}});LP=[];if(MPK===1)mpHide()};
const OA=new Audio();OA.ontimeupdate=()=>{if(OA.currentTime>30)OA.pause()};
OA.addEventListener('play',()=>{stopL();mpShow(2,'🎧 Online beat')});OA.addEventListener('pause',()=>{if(MPK===2&&!MPP)mpHide()});OA.addEventListener('ended',()=>{if(MPK===2)mpHide()});
mpEl.querySelector('#lbMiniP').onclick=()=>{const b=mpEl.querySelector('#lbMiniP');
 if(MPK===1){if(!LC)return;if(MPP){LC.resume();MPP=0;b.textContent='⏸'}else{LC.suspend();MPP=1;b.textContent='▶'}}
 else if(MPK===2){if(MPP){MPP=0;b.textContent='⏸';OA.play().catch(()=>{})}else{MPP=1;b.textContent='▶';OA.pause()}}};
mpEl.querySelector('#lbMiniX').onclick=()=>{stopL();try{OA.pause()}catch(e){}if(LC&&LC.state==='suspended')try{LC.resume()}catch(e){}mpHide()};
const save=()=>{const l=LS('labp',[]).filter(x=>x.id!==P.id);l.unshift(P);SV('labp',l)};
const newSec=type=>({id:'s'+Date.now()+Math.random().toString(36).slice(2,5),type,bars:{verse:16,chorus:8,bridge:8,intro:4,outro:4}[type],lyrics:'',take:null,ref:null});
function autoLen(p){const T=p.target||240,bar=240/p.beat.bpm,tot=()=>p.sections.reduce((a,s)=>a+s.bars,0)*bar;let g=0;
 while(tot()<T&&g++<60){let ch=false;for(const s of p.sections){if(tot()>=T)break;const mx=s.type==='verse'?32:s.type==='chorus'?16:s.type==='bridge'?16:8;if(s.bars<mx){s.bars+=4;ch=true}}
  if(!ch){const i=p.sections.findIndex(s=>s.type==='outro');p.sections.splice(i<0?p.sections.length:i,0,newSec('verse'))}}}
function newProject(){const p={id:'p'+Date.now(),name:'My song',artist:'Me',beat:{kind:'gen',style:'boombap',bpm:90,key:0,mode:'m'},bg:{},vol:{beat:80,voc:100},fx:'Clean Studio',sync:100,target:240,
 sections:['intro','verse','chorus','verse','chorus','outro'].map(newSec)};autoLen(p);return p}
const tkOf=s=>s.ref?(P.sections.find(x=>x.id===s.ref)||{}).take:s.take;
const secName=i=>{const s=P.sections[i],n=P.sections.filter((x,k)=>x.type===s.type&&k<=i).length,c=P.sections.filter(x=>x.type===s.type).length,N={intro:'Intro',verse:'Verse',chorus:'Chorus',bridge:'Bridge',outro:'Outro'}[s.type];return c>1?N+' '+n:N};
const secStart=(p,i)=>p.sections.slice(0,i).reduce((a,s)=>a+s.bars*240/p.beat.bpm,0);

/* ---- beat engine (WebAudio synth, rendered offline) ---- */
const beatOffs=p=>{const B=p.beat,bar=240/B.bpm;let off=0,pos=0;return p.sections.map(s=>{const s0=pos;pos+=s.bars*bar;if(s.rs)off=-s0;if(s.at>=1)off=(s.at-1)*bar-s0;off+=(s.bp||0)*60/B.bpm;return off})};
function sched(oc,dest0,p,t0,t1){let dest=dest0;
 const B=p.beat,bar=240/B.bpm,st=bar/16,gen=B.kind==='gen',y=gen?(B.tmp||styleOf(B.style)):{},bg=p.bg||{};
 const N=oc.createBuffer(1,oc.sampleRate*2,oc.sampleRate),nd=N.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
 const g=(v,t)=>{const x=oc.createGain();x.gain.setValueAtTime(v,t);x.connect(dest);return x};
 const tone=(t,type,f,d,v,att=.005)=>{const o=oc.createOscillator();o.type=type;o.frequency.value=f;const x=oc.createGain();x.gain.setValueAtTime(.0001,t);x.gain.linearRampToValueAtTime(v,t+att);x.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(x);x.connect(dest);o.start(t);o.stop(t+d+.05)};
 const nz=(t,d,type,f,v)=>{const s=oc.createBufferSource();s.buffer=N;const fl=oc.createBiquadFilter();fl.type=type;fl.frequency.value=f;const x=g(v,t);x.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(fl);fl.connect(x);s.start(t,Math.random());s.stop(t+d+.02)};
 const kick=(t,v)=>{const o=oc.createOscillator(),x=g(v,t);o.frequency.setValueAtTime(160,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);x.gain.exponentialRampToValueAtTime(.001,t+.4);o.connect(x);o.start(t);o.stop(t+.45)};
 const snare=(t,v)=>{nz(t,.2,'bandpass',2000,v*.7);tone(t,'triangle',190,.12,v*.35)};
 const clap=(t,v)=>{for(let i=0;i<3;i++)nz(t+i*.011,.09,'bandpass',1500,v*.5)};
 const hat=(t,v,open)=>nz(t,open?.16:.04,'highpass',7500,v*.3);
 const bass=(t,m,len)=>{if(y.log){tone(t,'sine',mtof(m+12),.25,.9);nz(t,.02,'bandpass',900,.25)}else{tone(t,'sine',mtof(m),Math.max(.15,len),.95);tone(t,'triangle',mtof(m+12),len*.6,.12)}};
 const pad=(t,ns,d,v)=>{const f=oc.createBiquadFilter();f.type='lowpass';f.frequency.value=1300;const x=oc.createGain();x.gain.setValueAtTime(.0001,t);x.gain.linearRampToValueAtTime(v,t+.4);x.gain.setValueAtTime(v,t+d-.3);x.gain.linearRampToValueAtTime(.0001,t+d);f.connect(x);x.connect(dest);ns.forEach(m=>[-7,7].forEach(dt=>{const o=oc.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=dt;o.connect(f);o.start(t);o.stop(t+d+.05)}))};
 const bus=sec=>{const m=sec.mix||'full';if(m!=='quiet'&&!(m==='soft'&&!gen))return dest0;const x=oc.createGain();x.gain.value=m==='quiet'?.5:.85;if(m==='soft'){const lp=oc.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1800;x.connect(lp);lp.connect(dest0)}else x.connect(dest0);return x};
 if(!gen&&EXT[B.id]){const E=EXT[B.id],offs=beatOffs(p);let q=0;
  p.sections.forEach((sec,k)=>{const a=q,e=k===p.sections.length-1?Math.max(t1,a+sec.bars*bar):a+sec.bars*bar;q+=sec.bars*bar;const A=Math.max(a,t0),Z=Math.min(e,t1);if(Z<=A+1e-6)return;
   const bt=(((A+offs[k])%E.duration)+E.duration)%E.duration,src=oc.createBufferSource();src.buffer=E;src.loop=true;src.connect(bus(sec));src.start(A-t0,bt);src.stop(Z-t0)})}
 {let q=0;p.sections.forEach((sec,k)=>{const a=q,len=sec.bars*bar;q+=len;const X=sec.x&&EXT[sec.x.id];if(!X)return;
  const e=k===p.sections.length-1?Math.max(t1,a+len):a+len,A=Math.max(a,t0),Z=Math.min(e,t1);if(Z<=A+1e-6)return;
  const lp=sec.x.loop!==false,xs=((sec.x.at||1)-1)*bar+(A-a);if(!lp&&xs>=X.duration)return;
  const bt=lp?((xs%X.duration)+X.duration)%X.duration:xs,src=oc.createBufferSource(),gx=oc.createGain(),v=Math.max(0,(sec.x.vol==null?100:sec.x.vol)/100);
  src.buffer=X;src.loop=lp;gx.gain.setValueAtTime(v,0);gx.gain.setValueAtTime(v,Math.max(0,Z-t0-.05));gx.gain.linearRampToValueAtTime(0,Math.max(.01,Z-t0));
  src.connect(gx);gx.connect(dest0);src.start(A-t0,bt);src.stop(Z-t0)})}
 if(y.vin||bg.vinyl){const s=oc.createBufferSource();s.buffer=N;s.loop=true;const f=oc.createBiquadFilter();f.type='bandpass';f.frequency.value=4000;const x=g(.018,0);s.connect(f);f.connect(x);s.start(0);s.stop(t1-t0)}
 const prog=CH[B.mode==='M'?'M':'m'];let pos=0;
 p.sections.forEach(sec=>{const s0=pos;pos+=sec.bars*bar;if(s0+sec.bars*bar<=t0+1e-6||s0>=t1-1e-6)return;
  const f=Object.assign({},gen?FL[sec.type]:{});if(bg.pad)f.pad=1;if(bg.keys)f.keys=1;if(bg.shaker)f.shaker=1;
  const mx=sec.mix||'full';if(gen&&mx==='drums'){f.bass=f.pad=f.keys=f.shaker=0}else if(gen&&mx==='nodrums'){f.kick=f.snare=f.clap=f.hat=0}dest=bus(sec);
  for(let b=0;b<sec.bars;b++){const T0=s0-t0+b*bar;if(T0+bar<=1e-6||T0>=t1-t0-1e-6)continue;const ch=prog[b%4],root=(B.key+ch[0])%12,cn=[0,ch[1]?4:3,7].map(x=>48+root+x),bm=36+root;
   if(f.pad)pad(T0,cn.map(x=>x+12),bar,f.pad===.5?.025:.045);
   for(let i=0;i<16;i++){const t=T0+i*st+((i%2&&y.sw)?y.sw*st*.6:0),on=pt=>pt&&pt[i]==='x';
    if(f.kick&&on(y.k))kick(t,1);if(f.snare&&on(y.s))snare(t,.9);if(f.clap&&on(y.c))clap(t,.7);
    if(f.hat&&on(y.h))hat(t,i%4?.55:.9,f.open&&i%8===6);
    if(f.bass&&on(y.b))bass(t,bm+(i===14&&b%2?7:0),(y.L||2)*st);
    if(f.keys&&i%2===0)tone(t,'triangle',mtof(cn[(i>>1)%3]+12),.4,.09);
    if(f.shaker)nz(t,.05,'highpass',9000,i%4===2?.07:.04)}
   if(f.snare&&b===sec.bars-1&&sec.type!=='outro')for(let i=12;i<16;i++)snare(T0+i*st,.3+(i-12)*.2)}})}
function mst(oc,fadeEnd){const c=oc.createDynamicsCompressor();c.threshold.value=-14;c.knee.value=12;c.ratio.value=3;c.attack.value=.01;c.release.value=.2;
 const m=oc.createGain();m.gain.value=.9;if(fadeEnd){m.gain.setValueAtTime(.9,Math.max(0,fadeEnd-4));m.gain.linearRampToValueAtTime(0,fadeEnd-.1)}c.connect(m);m.connect(oc.destination);return c}
const renderWin=(p,t0,t1)=>{const lt=isLite(),rs=lt?32000:SR,oc=new OfflineAudioContext(lt?1:2,Math.max(1,Math.ceil((t1-t0)*rs)),rs);sched(oc,mst(oc),p,t0,t1);return oc.startRendering()};
async function loadExt(B,must){if(EXT[B.id])return;let blob;try{
 if(B.from==='lib'){const r=await tx('blobs','readonly',b=>b.get(B.sid));blob=r&&r.blob}else{const r=await kvGet('beat_'+B.id);blob=r&&r.blob}
 if(!blob)throw new Error('beat missing');EXT[B.id]=await dec(await blob.arrayBuffer())}catch(e){if(must)throw e}}
async function ensureBeat(p){const B=p.beat;if(B.kind==='ext')await loadExt(B,true);for(const sc of p.sections)if(sc.x)await loadExt(sc.x,false)}
async function takeBuf(id){if(TB[id])return TB[id];const r=await kvGet('take_'+id);if(!r)return null;return TB[id]=await dec(await r.blob.arrayBuffer())}
async function guideBuf(i){await ensureBeat(P);const sec=P.sections[i],s0=secStart(P,i),k=JSON.stringify([P.beat,P.bg,sec.type,sec.bars,P.beat.kind==='ext'?s0:0,sec.mix||'full',P.beat.kind==='ext'?beatOffs(P)[i]:0,sec.x||0,sec.at||0,P.vol.beat,isLite()]);
 if(GUIDE.has(k))return GUIDE.get(k);const b=await renderWin(P,s0,s0+sec.bars*240/P.beat.bpm);if(GUIDE.size>8)GUIDE.clear();GUIDE.set(k,b);return b}
function playBuf(buf){stopL();const c=lc(),s=c.createBufferSource();s.buffer=buf;s.connect(c.destination);s.start();LP=[s];s.onended=()=>{if(LP[0]===s){LP=[];mpHide()}};mpShow(1,'🎧 Beat preview')}
function listenTake(guide,vb,off){stopL();const c=lc(),b=c.createBufferSource();b.buffer=guide;b.connect(c.destination);const v=c.createBufferSource();v.buffer=vb;const g=c.createGain();g.gain.value=1.3;v.connect(g);g.connect(c.destination);const t=c.currentTime+.1;b.start(t);v.start(t,Math.min(off,vb.duration-.01));LP=[b,v];let n=2;[b,v].forEach(x=>x.onended=()=>{if(LP.includes(x)&&--n<=0){LP=[];mpHide()}});mpShow(1,'🎧 Part preview')}

/* ---- vocal studio chain + final mix ---- */
function ir(oc,sec){const n=Math.floor(oc.sampleRate*sec),b=oc.createBuffer(2,n,oc.sampleRate);for(let c=0;c<2;c++){const d=b.getChannelData(c);let lp=0;for(let i=0;i<n;i++){lp+=((Math.random()*2-1)-lp)*(.5-.42*i/n);d[i]=lp*1.9*Math.pow(1-i/n,2.8)}}return b}
/* ---- de-esser: tames harsh s / sh / ch sounds in each vocal take (set DEESS=false to turn off) ---- */
const DEESS=true,DSC=new WeakMap();
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
function DE(b){if(!DEESS||!b)return b;let r=DSC.get(b);if(r)return r;
 try{r=new OfflineAudioContext(b.numberOfChannels,b.length,b.sampleRate).createBuffer(b.numberOfChannels,b.length,b.sampleRate);for(let c=0;c<b.numberOfChannels;c++)r.copyToChannel(deEss(b.getChannelData(c),b.sampleRate),c)}catch(e){return b}
 DSC.set(b,r);return r}
function vchain(oc,M,p){const fx=FX[p.fx]||FX['Clean Studio'],inp=oc.createGain(),bq=(type,f,gain,q)=>{const x=oc.createBiquadFilter();x.type=type;x.frequency.value=f;if(gain!=null)x.gain.value=gain;if(q)x.Q.value=q;return x};
 const hp=bq('highpass',95),e1=bq('peaking',300,-2,1),e2=bq('peaking',3000,fx.pres,.9),e3=bq('highshelf',10000,fx.air),e4=bq('lowshelf',200,fx.warm);
 const cm=oc.createDynamicsCompressor();cm.threshold.value=-26;cm.ratio.value=4;cm.knee.value=10;cm.attack.value=.006;cm.release.value=.18;
 const out=oc.createGain();out.gain.value=p.vol.voc/100*1.2;
 inp.connect(hp);hp.connect(e1);e1.connect(e2);e2.connect(e3);e3.connect(e4);e4.connect(cm);cm.connect(out);out.connect(M);
 if(fx.rev){const cv=oc.createConvolver();cv.buffer=ir(oc,isLite()?1.1:1.9);const rw=oc.createGain();rw.gain.value=fx.rev;out.connect(cv);cv.connect(rw);rw.connect(M)}
 if(fx.echo){const dl=oc.createDelay(2);dl.delayTime.value=60/p.beat.bpm*.75;const fb=oc.createGain();fb.gain.value=.32;const lp=bq('lowpass',3200),ew=oc.createGain();ew.gain.value=fx.echo;out.connect(dl);dl.connect(lp);lp.connect(fb);fb.connect(dl);lp.connect(ew);ew.connect(M)}
 return{inp,fx}}
async function mixProject(p,onProg){await ensureBeat(p);const bar=240/p.beat.bpm,total=p.sections.reduce((a,s)=>a+s.bars*bar,0),tail=2.5;
 const lite=isLite(),RS=lite?32000:SR,oc=new OfflineAudioContext(lite?1:2,Math.ceil((total+tail)*RS),RS),M=mst(oc,total+tail),bb=oc.createGain();bb.gain.value=p.vol.beat/100*gf(p,'beat');bb.connect(M);
 sched(oc,bb,p,0,total+tail);const V=vchain(oc,M,p);let pos=0;const LG=oc.createGain();LG.gain.value=gf(p,'voc');LG.connect(V.inp);const BK=(p.vol.bk??60)/100*gf(p,'bk');
 p.sections.forEach(sec=>{const s0=pos;pos+=sec.bars*bar;const tk=tkOf(sec),buf=tk&&DE(VB(tk.id));if(!buf)return;
  const off=Math.min(tk.lead+(p.sync||0)/1000,buf.duration-.05),dur=Math.max(.1,Math.min(sec.bars*bar+1.2,buf.duration-off));
  const s=oc.createBufferSource();s.buffer=buf;const tgv=id=>(p.tg&&p.tg[id])||1,tn=oc.createGain();tn.gain.value=tgv(tk.id);s.connect(tn);tn.connect(LG);s.start(s0,off,dur);
  if(V.fx.dbl&&!lite)[-1,1].forEach(d=>{const s2=oc.createBufferSource();s2.buffer=buf;s2.detune.value=d*7;const pn=oc.createStereoPanner();pn.pan.value=d*.7;const gd=oc.createGain();gd.gain.value=V.fx.dbl*(sec.type==='chorus'?1:.4)*.6*tgv(tk.id);s2.connect(gd);gd.connect(pn);pn.connect(LG);s2.start(s0+.02,off,dur)});(sec.bk||[]).forEach((L2,k)=>{const b2=DE(VB(L2.id));if(!b2)return;const o2=Math.min(L2.lead+(p.sync||0)/1000,b2.duration-.05),d2=Math.max(.1,Math.min(sec.bars*bar+1.2,b2.duration-o2)),s3=oc.createBufferSource();s3.buffer=b2;const g3=oc.createGain();g3.gain.value=BK*tgv(L2.id);const pn3=oc.createStereoPanner();pn3.pan.value=[-.6,.6,0][k%3];s3.connect(g3);g3.connect(pn3);pn3.connect(V.inp);s3.start(s0,o2,d2)});});
 if(onProg&&oc.suspend){const T=total+tail,st=Math.max(2,T/(lite?8:25));for(let t=st;t<T-.5;t+=st){const q=Math.floor(t*RS/128)*128/RS;try{oc.suspend(q).then(()=>{onProg(q/T);oc.resume()}).catch(()=>{})}catch(e){}}}
 return oc.startRendering()}
function wav(buf){const ch=buf.numberOfChannels,n=buf.length,sr=buf.sampleRate,ab=new ArrayBuffer(44+n*ch*2),v=new DataView(ab),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 w(0,'RIFF');v.setUint32(4,36+n*ch*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,sr,true);v.setUint32(28,sr*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*ch*2,true);
 const d=[];for(let c=0;c<ch;c++)d.push(buf.getChannelData(c));let o=44;for(let i=0;i<n;i++)for(let c=0;c<ch;c++){const x=Math.max(-1,Math.min(1,d[c][i]));v.setInt16(o,x<0?x*32768:x*32767,true);o+=2}return new Blob([ab],{type:'audio/wav'})}

/* Smooth saver: writes the WAV in small chunks (UI never freezes), normalises loudness, shows % progress */
async function wavAsync(buf,onProg){const ch=buf.numberOfChannels,n=buf.length,sr=buf.sampleRate,d=[];for(let c=0;c<ch;c++)d.push(buf.getChannelData(c));
 const CH=48000;let pk=0;
 if(!buf.__m)for(let i=0;i<n;i+=CH){const e=Math.min(n,i+CH);for(let c=0;c<ch;c++){const a=d[c];for(let j=i;j<e;j++){const x=a[j]<0?-a[j]:a[j];if(x>pk)pk=x}}if(((i/CH)&15)===0)await new Promise(r=>setTimeout(r,0))}
 const g=buf.__m?1:pk>0.0001?Math.min(3,0.97/pk):1,h=new DataView(new ArrayBuffer(44)),w=(o,t)=>[...t].forEach((c,i)=>h.setUint8(o+i,c.charCodeAt(0)));
 w(0,'RIFF');h.setUint32(4,36+n*ch*2,true);w(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,ch,true);h.setUint32(24,sr,true);h.setUint32(28,sr*ch*2,true);h.setUint16(32,ch*2,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,n*ch*2,true);
 const parts=[h.buffer];
 for(let i=0;i<n;i+=CH){const e=Math.min(n,i+CH),o=new Int16Array((e-i)*ch);let k=0;
  for(let j=i;j<e;j++)for(let c=0;c<ch;c++){const x=Math.max(-1,Math.min(1,d[c][j]*g));o[k++]=x<0?x*32768:x*32767}
  parts.push(o.buffer);onProg&&onProg(i/n);await new Promise(r=>setTimeout(r,0))}
 return new Blob(parts,{type:'audio/wav'})}

/* waveform peaks + auto cover art for the gallery */
function peaksOf(buf,N=48){const d=buf.getChannelData(0),k=Math.floor(d.length/N)||1,o=[];let m=0;for(let b=0;b<N;b++){let p=0;for(let i=b*k,e=Math.min(d.length,i+k);i<e;i+=8){const x=d[i]<0?-d[i]:d[i];if(x>p)p=x}o.push(p);if(p>m)m=p}return o.map(x=>Math.round(m?x/m*100:0))}
function coverBlob(title,artist){return new Promise(res=>{try{const c=document.createElement('canvas');c.width=c.height=320;const x=c.getContext('2d');let h=0;for(const ch of title+artist)h=(h*31+ch.charCodeAt(0))%360;
 const g=x.createLinearGradient(0,0,320,320);g.addColorStop(0,`hsl(${h},60%,42%)`);g.addColorStop(1,`hsl(${(h+50)%360},65%,16%)`);x.fillStyle=g;x.fillRect(0,0,320,320);
 x.fillStyle='rgba(255,255,255,.08)';x.beginPath();x.arc(250,70,110,0,7);x.fill();x.beginPath();x.arc(40,300,90,0,7);x.fill();
 x.fillStyle='#fff';x.textAlign='left';x.textBaseline='alphabetic';x.font='bold 34px sans-serif';
 const words=title.split(' '),lines=[];let ln='';words.forEach(w=>{if(x.measureText(ln+' '+w).width>270&&ln){lines.push(ln);ln=w}else ln=(ln?ln+' ':'')+w});lines.push(ln);
 lines.slice(0,4).forEach((t,i)=>x.fillText(t,24,150+i*40));x.font='20px sans-serif';x.fillStyle='rgba(255,255,255,.85)';x.fillText(artist,24,290);x.font='bold 13px sans-serif';x.fillText('LB MUSIC',24,36);
 c.toBlob(b=>res(b),'image/jpeg',.85)}catch(e){res(null)}})}

/* MP3 saver (needs lame.min.js next to index.html; falls back to WAV if it is missing) */
function loadLame(){return window.lamejs?Promise.resolve(true):new Promise(r=>{const e=document.createElement('script');e.src='lame.min.js';e.onload=()=>r(!!window.lamejs);e.onerror=()=>r(false);document.head.appendChild(e)})}
async function mp3Async(buf,onProg,lite){const ch=lite?1:Math.min(2,buf.numberOfChannels),n=buf.length,sr=buf.sampleRate,d=[];
 if(lite&&buf.numberOfChannels>1){const L=buf.getChannelData(0),R=buf.getChannelData(1),m=new Float32Array(n);for(let i=0;i<n;i++)m[i]=(L[i]+R[i])/2;d.push(m)}else for(let c=0;c<ch;c++)d.push(buf.getChannelData(c));
 let pk=0;for(let c=0;c<ch;c++){const a=d[c];for(let i=0;i<n;i++){const x=a[i]<0?-a[i]:a[i];if(x>pk)pk=x}}
 const g=pk>0.0001?Math.min(3,0.97/pk):1,enc=new lamejs.Mp3Encoder(ch,sr,lite?96:192),B=1152*20,out=[];
 const cv=(a,i,e)=>{const o=new Int16Array(e-i);for(let j=i;j<e;j++){const x=Math.max(-1,Math.min(1,a[j]*g));o[j-i]=x<0?x*32768:x*32767}return o};
 for(let i=0;i<n;i+=B){const e=Math.min(n,i+B),m=ch===2?enc.encodeBuffer(cv(d[0],i,e),cv(d[1],i,e)):enc.encodeBuffer(cv(d[0],i,e));
  if(m.length)out.push(new Uint8Array(m));onProg&&onProg(i/n);await new Promise(r=>setTimeout(r,0))}
 const f=enc.flush();if(f.length)out.push(new Uint8Array(f));return new Blob(out,{type:'audio/mpeg'})}

/* ---- recording ---- */
/* ---- vocal recorder: raw uncompressed audio (no Opus / no lossy step). Falls back to the old recorder only if the phone cannot do this. ---- */
function pcmWav(a,sr){const n=a.length,ab=new ArrayBuffer(44+n*2),v=new DataView(ab),w=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){const x=Math.max(-1,Math.min(1,a[i]));v.setInt16(44+i*2,x<0?x*32768:x*32767,true)}return new Blob([ab],{type:'audio/wav'})}
async function mkRec(st,ctx){
 let node=null,ch=[],on=false,startT=null,t0=0;const sr=ctx.sampleRate,src=ctx.createMediaStreamSource(st);
 try{if(!ctx.audioWorklet||!window.AudioWorkletNode)throw 0;
  if(!ctx.__lbRaw){const code="class P extends AudioWorkletProcessor{constructor(){super();this.s=1e9;this.f=1;this.port.onmessage=e=>{this.s=e.data.s;this.f=1}}process(i){const c=i[0]&&i[0][0];if(c&&currentTime>=this.s){if(this.f){this.f=0;this.port.postMessage({t:currentTime,d:c.slice(0)})}else this.port.postMessage({d:c.slice(0)})}return true}}registerProcessor('lbraw',P)";
   await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code],{type:'application/javascript'})));ctx.__lbRaw=1}
  node=new AudioWorkletNode(ctx,'lbraw',{numberOfInputs:1,numberOfOutputs:1,channelCount:1,channelCountMode:'explicit'});
  node.port.onmessage=e=>{if(!on)return;const m=e.data;if(m.t!=null&&startT==null)startT=m.t;ch.push(m.d)}}catch(e){node=null}
 if(!node&&ctx.createScriptProcessor){node=ctx.createScriptProcessor(4096,1,1);node.onaudioprocess=e=>{if(!on||ctx.currentTime<t0)return;if(startT==null)startT=ctx.currentTime-4096/sr;ch.push(new Float32Array(e.inputBuffer.getChannelData(0)))}}
 if(node){const sil=ctx.createGain();sil.gain.value=0;src.connect(node);node.connect(sil);sil.connect(ctx.destination);
  return{lat:(ctx.outputLatency||0)+(ctx.baseLatency||0),
   begin(t){t0=t;ch=[];startT=null;on=true;if(node.port)node.port.postMessage({s:t})},
   async stop(){on=false;if(node.port)node.port.postMessage({s:1e9});let n=0;ch.forEach(x=>n+=x.length);if(!n||startT==null)return{blob:null};const a=new Float32Array(n);let o=0;ch.forEach(x=>{a.set(x,o);o+=x.length});ch=[];return{blob:pcmWav(a,sr),startT}},
   close(){try{src.disconnect()}catch(e){}try{node.disconnect()}catch(e){}}}}
 if(!window.MediaRecorder)throw new Error('norec');
 let mr,c=[];return{lat:0,begin(){startT=ctx.currentTime;c=[];mr=new MediaRecorder(st,{audioBitsPerSecond:256000});mr.ondataavailable=e=>e.data.size&&c.push(e.data);mr.start()},
  stop(){return new Promise(r=>{mr.onstop=()=>r({blob:new Blob(c,{type:mr.mimeType||'audio/webm'}),startT});if(mr.state!=='inactive')mr.stop()})},close(){}}}
let RC=null;
async function record(i,opt={}){const sec=P.sections[i],bpb=240/P.beat.bpm,win=opt.win,lay=opt.layer;
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return toast('Recording is not supported in this browser');
 let st;try{st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}})}catch(e){return toast('Please allow the microphone to record')}
 try{au.pause()}catch(e){}stopL();
 const o=$('#recov'),big=$('#rBig'),bar=$('#rBar i'),btn=$('#rBtns');o.classList.add('on');$('#rTitle').textContent=secName(i)+' · '+(win?'bars '+(win[0]+1)+'–'+win[1]:lay?'backing vocal':sec.bars+' bars');
 $('#rLy').textContent=sec.lyrics||'(No lyrics written — just sing!)';btn.innerHTML='';big.textContent='…';
 let cancel=false;const xh=()=>{cancel=true;RC&&RC.stop();stopL()};$('#rX').onclick=xh;
 let RW=null;const end=()=>{o.classList.remove('on');try{RW&&RW.close()}catch(e){}st.getTracks().forEach(t=>t.stop());stopL();renderLab()};
 let guide;try{guide=win?await renderWin(P,secStart(P,i)+win[0]*bpb,secStart(P,i)+win[1]*bpb):await guideBuf(i)}catch(e){end();return toast('Could not prepare the beat')}
 if(cancel){end();return}
 const ctx=lc();let mv=null,moff=0;if(lay){const tk0=tkOf(sec);if(tk0){try{mv=await takeBuf(tk0.id);moff=tk0.lead+(P.sync||0)/1000}catch(e){}}}
 const attempt=async()=>{for(let n=3;n>0&&!cancel;n--){big.textContent=n;await sleep(800)}
  if(cancel)return null;big.textContent='🎙';btn.innerHTML='<button class="lbtn rec" id="rStop">⏹ Stop</button>';
  if(!RW){try{RW=await mkRec(st,lc())}catch(e){big.textContent='⚠️';toast('Recording is not supported in this browser');return null}}
  const t0=ctx.currentTime+.12,bt=t0+.15;RW.begin(t0);
  const bs=ctx.createBufferSource();bs.buffer=guide;bs.connect(ctx.destination);bs.start(bt);let x2=null;if(mv){x2=ctx.createBufferSource();x2.buffer=mv;const g2=ctx.createGain();g2.gain.value=1.1;x2.connect(g2);g2.connect(ctx.destination);x2.start(bt,Math.min(moff,mv.duration-.01))}
  let over=false,fin;const done=new Promise(r=>fin=r);const stop=()=>{if(over)return;over=true;try{bs.stop()}catch(e){}try{x2&&x2.stop()}catch(e){}setTimeout(()=>RW.stop().then(fin),500)};
  bs.onended=stop;$('#rStop').onclick=stop;RC={stop};
  const tick=()=>{if(over)return;bar.style.width=Math.max(0,Math.min(100,(ctx.currentTime-bt)/guide.duration*100))+'%';requestAnimationFrame(tick)};tick();
  const rr=await done;RC=null;bar.style.width='0';
  if(!rr.blob){toast('Nothing was recorded — try again');return null}
  const blob=rr.blob,lead=Math.max(0,bt-rr.startT)+RW.lat;let vb;try{vb=await dec(await blob.arrayBuffer())}catch(e){toast('Could not read the recording');return null}
  return{blob,vb,lead}};
 btn.innerHTML='<button class="lbtn" id="rH">▶ Hear beat</button><button class="lbtn" id="rHs">■ Stop</button><button class="lbtn rec" id="rG">● Start</button>';big.textContent='🎧';
 const go=await new Promise(res=>{$('#rH').onclick=()=>{try{(lay&&mv)?listenTake(guide,mv,moff):playBuf(guide)}catch(e){}};$('#rHs').onclick=()=>stopL();$('#rG').onclick=()=>{stopL();res(true)};$('#rX').onclick=()=>{stopL();res(false)}});
 $('#rX').onclick=xh;if(!go||cancel){end();return}
 for(;;){const r=await attempt();if(!r||cancel){end();return}
  big.textContent='✅';btn.innerHTML='<button class="lbtn" id="rL">▶ Listen</button><button class="lbtn" id="rLs">■ Stop</button><button class="lbtn pr" id="rS">💾 Save take</button><button class="lbtn" id="rR">🔁 Retry</button>';
  const a=await new Promise(res=>{$('#rL').onclick=()=>listenTake(guide,r.vb,r.lead+(P.sync||0)/1000);$('#rLs').onclick=()=>stopL();$('#rS').onclick=()=>res('s');$('#rR').onclick=()=>res('r');$('#rX').onclick=()=>res('x')});stopL();
  if(a==='s'&&win){try{await savePunch(sec,r,win)}catch(e){console.error(e);toast('Could not save that bit');end();return}save();toast('Bit replaced ✅');end();return}
   if(a==='s'&&lay){const id='t'+Date.now();await kvPut('take_'+id,r.blob);TB[id]=r.vb;(sec.bk=sec.bk||[]).push({id,lead:r.lead,dur:r.vb.duration});save();toast('Backing vocal saved ✅');end();return}
   if(a==='s'){const id='t'+Date.now();if(sec.take)await kvDel('take_'+sec.take.id);await kvPut('take_'+id,r.blob);TB[id]=r.vb;sec.take={id,lead:r.lead,dur:r.vb.duration};sec.ref=null;save();toast('Take saved ✅');end();return}
  if(a==='x'){end();return}}}
async function listen(i){const sec=P.sections[i],tk=tkOf(sec);if(!tk)return;toast('Preparing…');try{const g=await guideBuf(i),vb=await takeBuf(tk.id);listenTake(g,vb,tk.lead+(P.sync||0)/1000)}catch(e){toast('Could not play this part')}}

/* ---- beat picker + beat maker ---- */
function beatSheet(tg){const w=document.createElement('div');const TBS=tg==null?[0,1,2,3,4]:[2,3,4];let tab=TBS[0];
 const useGen=id=>{const y=styleOf(id);P.beat={kind:'gen',style:id,bpm:y.bpm,key:P.beat.key||0,mode:P.beat.mode||'m'};save();closeSheet();renderLab()};
 const useExt=async(o,getBlob)=>{toast('Loading beat…');try{const blob=await getBlob();if(o.from!=='lib')await kvPut('beat_'+o.id,blob);EXT[o.id]=await dec(await blob.arrayBuffer());
  if(tg!=null){const sc=P.sections[tg];sc.x={id:o.id,from:o.from,sid:o.sid,name:o.name,vol:100,at:1,loop:true};save();closeSheet();renderLab();toast('Sound added to this part ✅');return}
   P.beat={kind:'ext',id:o.id,from:o.from,sid:o.sid,name:o.name,bpm:P.beat.bpm||90,key:P.beat.key||0,mode:P.beat.mode||'m'};save();closeSheet();renderLab();toast('Beat ready. Set the BPM to match it 🥁')}catch(e){toast('Could not load that beat')}};
 const prev=async b=>{toast('Playing a preview…');try{playBuf(await renderWin({beat:b,bg:{},vol:{beat:80,voc:100},sections:[{type:'chorus',bars:4}]},0,4*240/b.bpm))}catch(e){toast('Preview failed')}};
 const draw=()=>{OA.pause();w.innerHTML=`<div class="chips">${['Built-in','My beats','My music','Online','Upload'].map((t,i)=>!TBS.includes(i)?'':`<button class="chip${tab===i?' on':''}" data-t="${i}">${t}</button>`).join('')}</div><div id="bsb"></div>`;
  w.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=+b.dataset.t;draw()});const b=w.querySelector('#bsb');
  if(tab<2){const list=tab===0?Object.entries(ST):Object.entries(LS('beats',{}));
   b.innerHTML=(tab===1&&!list.length?'<div class="empty">No beats made yet.</div>':'')+list.map(([id,y])=>`<div class="row"><div class="si"><b>${E(y.n)}</b><small>${y.bpm} BPM</small></div><button class="ib" data-p="${id}">▶</button><button class="lbtn" data-u="${id}">Use</button></div>`).join('')+(tab===1?'<button class="lbtn pr" id="mk" style="width:100%;margin-top:8px">🎛 Make a new beat</button>':'');
   b.querySelectorAll('[data-p]').forEach(x=>x.onclick=()=>prev({kind:'gen',style:x.dataset.p,bpm:styleOf(x.dataset.p).bpm,key:P.beat.key||0,mode:P.beat.mode||'m'}));
   b.querySelectorAll('[data-u]').forEach(x=>x.onclick=()=>useGen(x.dataset.u));const mk=b.querySelector('#mk');if(mk)mk.onclick=()=>{closeSheet();setTimeout(makerSheet,60)}}
  else if(tab===2){b.innerHTML='<input id="bq" placeholder="Filter your songs…"><div id="bl"></div>';
   const fl=()=>{const q=b.querySelector('#bq').value.toLowerCase(),l=S.songs.filter(s=>(s.title+s.artist).toLowerCase().includes(q)).slice(0,40);
    b.querySelector('#bl').innerHTML=l.map(s=>`<div class="row"><div class="si"><b>${E(s.title)}</b><small>${E(s.artist)} · ${fm(s.dur)}</small></div><button class="lbtn" data-s="${s.id}">Use</button></div>`).join('')||'<div class="empty">No songs yet</div>';
    b.querySelectorAll('[data-s]').forEach(x=>x.onclick=()=>{const s=S.songs.find(z=>z.id===x.dataset.s);useExt({id:'lib_'+s.id,from:'lib',sid:s.id,name:s.title},async()=>(await tx('blobs','readonly',k=>k.get(s.id))).blob)})};
   b.querySelector('#bq').oninput=fl;fl()}
  else if(tab===3){b.innerHTML='<input id="oq" placeholder="e.g. afrobeat instrumental"><button class="lbtn pr" id="og" style="width:100%">🔎 Search beats online</button><div id="ol"></div>';
   const go=async()=>{const q=b.querySelector('#oq').value.trim()||'type beat',ol=b.querySelector('#ol');ol.innerHTML='<div class="spin"></div>';
    try{const j=await(await fetch(`${AUD}/tracks/search?query=${encodeURIComponent(/beat|instrumental/i.test(q)?q:q+' instrumental beat')}&app_name=LBMusic&limit=20`)).json(),l=j.data||[],su=t=>`${AUD}/tracks/${t.id}/stream?app_name=LBMusic`;
     ol.innerHTML=l.map((t,k)=>`<div class="row"><div class="si"><b>${E(t.title)}</b><small>${E(t.user?.name||'')} · ${fm(t.duration)}</small></div><button class="ib" data-p="${k}">▶</button><button class="lbtn" data-u="${k}">Use</button></div>`).join('')||'<div class="empty">No beats found</div>';
     ol.querySelectorAll('[data-p]').forEach(x=>x.onclick=()=>{stopL();OA.src=su(l[x.dataset.p]);OA.play().catch(()=>{})});
     ol.querySelectorAll('[data-u]').forEach(x=>x.onclick=()=>{const t=l[x.dataset.u];OA.pause();useExt({id:'a'+t.id,from:'online',name:t.title},async()=>{const r=await fetch(su(t));if(!r.ok)throw 0;return r.blob()})})}
    catch(e){ol.innerHTML='<div class="empty">Could not reach the beat store. Check your internet.</div>'}};
   b.querySelector('#og').onclick=go;go()}
  else{b.innerHTML='<p class="mut" style="margin:8px 0">Choose a beat or instrumental stored on your phone.</p><button class="lbtn pr" id="up" style="width:100%">📂 Choose audio file</button>';
   b.querySelector('#up').onclick=()=>{const f=document.createElement('input');f.type='file';f.accept='audio/*';f.onchange=()=>{const x=f.files[0];if(x)useExt({id:'u'+Date.now(),from:'file',name:x.name.replace(/\.[^.]+$/,'')},async()=>x)};f.click()}}};
 sheet(tg==null?'Choose your beat':'Add a sound or beat to '+secName(tg),[],w);draw()}
function makerSheet(){const w=document.createElement('div'),R5=[['k','Kick'],['s','Snare'],['h','Hi-hat'],['c','Clap'],['b','808 bass']],pat={},fromS=y=>R5.forEach(([k])=>pat[k]=[...(y[k]||'').padEnd(16,'.')].map(c=>c==='x'));fromS(ST.boombap);
 w.innerHTML=`<input id="mn" value="My beat" placeholder="Beat name"><label class="mut">BPM <input id="mb" type="number" value="90" min="50" max="200" style="width:90px;display:inline-block"></label><p class="mut" style="margin:8px 0">Start from a style, then tap the squares:</p><div class="chips">${Object.entries(ST).map(([id,y])=>`<button class="chip" data-s="${id}">${y.n}</button>`).join('')}</div>${R5.map(([k,l])=>`<div class="mut">${l}</div><div class="sq" data-r="${k}">${'<i></i>'.repeat(16)}</div>`).join('')}`;
 const paint=()=>R5.forEach(([k])=>w.querySelectorAll(`[data-r="${k}"] i`).forEach((el,i)=>el.classList.toggle('on',pat[k][i])));
 w.querySelectorAll('.sq i').forEach(el=>el.onclick=()=>{const r=el.parentElement.dataset.r,i=[...el.parentElement.children].indexOf(el);pat[r][i]=!pat[r][i];paint()});
 w.querySelectorAll('[data-s]').forEach(c=>c.onclick=()=>{const y=ST[c.dataset.s];fromS(y);w.querySelector('#mb').value=y.bpm;paint()});paint();
 const mk=()=>{const o={n:w.querySelector('#mn').value.trim()||'My beat',bpm:Math.max(50,Math.min(200,+w.querySelector('#mb').value||90)),L:3};R5.forEach(([k])=>o[k]=pat[k].map(x=>x?'x':'.').join(''));return o};
 sheet('🎛 Make your beat',[
  {ic:'▶',t:'Preview',keep:1,fn:async()=>{const o=mk();toast('Playing a preview…');try{playBuf(await renderWin({beat:{kind:'gen',style:'_tmp',tmp:o,bpm:o.bpm,key:P.beat.key||0,mode:P.beat.mode||'m'},bg:{},vol:{beat:80,voc:100},sections:[{type:'chorus',bars:4}]},0,4*240/o.bpm))}catch(e){toast('Preview failed')}}},
  {ic:'💾',t:'Save & use this beat',fn:()=>{const o=mk(),id='c'+Date.now(),bt=LS('beats',{});bt[id]=o;SV('beats',bt);P.beat={kind:'gen',style:id,bpm:o.bpm,key:P.beat.key||0,mode:P.beat.mode||'m'};save();renderLab();toast('Beat saved 🥁')}}],w)}

/* ---- Lab page ---- */
const sel=(f,opts,val,i)=>`<select data-f="${f}"${i!=null?` data-i="${i}"`:''}>${opts.map(([v,l])=>`<option value="${v}"${String(v)===String(val)?' selected':''}>${l}</option>`).join('')}</select>`;
function secHTML(s,i){const bar=240/P.beat.bpm,tk=tkOf(s),src=P.sections.slice(0,i).find(x=>x.type===s.type&&x.take&&x.id!==s.id),si=src?P.sections.indexOf(src):-1;
 return`<div class="lc"><div class="lh"><b>${secName(i)}</b>${sel('bars',[4,8,12,16,20,24,28,32].map(n=>[n,n+' bars']),s.bars,i)}<span class="mut">${fm(s.bars*bar)}</span><button class="ib" data-a="up" data-i="${i}">⬆</button><button class="ib" data-a="dn" data-i="${i}">⬇</button><button class="ib" data-a="rm" data-i="${i}">✕</button></div>
 <textarea data-f="lyr" data-i="${i}" rows="2" placeholder="Write your lyrics here (optional)…">${E(s.lyrics)}</textarea>
 <div class="ok">${s.ref?'🔁 Using '+secName(P.sections.findIndex(x=>x.id===s.ref)):tk?'✅ Recorded ('+fm(tk.dur)+')':'<span class="mut">No vocal yet</span>'}</div>
 <div class="lrow">${s.ref?`<button class="lbtn" data-a="own" data-i="${i}">🎤 Sing a new one</button>`:`<button class="lbtn rec" data-a="rec" data-i="${i}">🎙 ${tk?'Re-record':'Record'}</button>`}${tk?`<button class="lbtn" data-a="ls" data-i="${i}">▶ Listen</button>`:''}${tk&&!s.ref?`<button class="lbtn" data-a="del" data-i="${i}">🗑</button>`:''}${!s.ref&&si>=0&&!s.take?`<button class="lbtn" data-a="reuse" data-i="${i}" data-v="${src.id}">🔁 Reuse ${secName(si)}</button>`:''}</div>${tk&&!s.ref?`<div class="lrow"><button class="lbtn" data-a="punch" data-i="${i}">✂ Redo a bit</button><button class="lbtn" data-a="bk" data-i="${i}">➕ Backing vocal</button></div>`:tk?`<div class="lrow"><button class="lbtn" data-a="bk" data-i="${i}">➕ Backing vocal</button></div>`:''}${(s.bk||[]).length?`<div class="lrow"><span class="mut">🎶 Backing:</span>${s.bk.map((b,k)=>`<button class="lbtn" data-a="delbk" data-i="${i}" data-v="${k}">✕ Remove ${k+1}</button>`).join('')}</div>`:''}${beatCtl(s,i)}</div>`}
function curBar(i){const L=P.beat.kind==='ext'&&EXT[P.beat.id];if(!L)return 1;const bar=240/P.beat.bpm,t=(((secStart(P,i)+beatOffs(P)[i])%L.duration)+L.duration)%L.duration;return Math.floor(t/bar+1e-6)+1}
function beatCtl(s,i){const ext=P.beat.kind==='ext',bp=s.bp||0,ab=Math.abs(bp),nb=Math.floor(ab/4),rb=ab%4,
 txt=bp?(bp>0?'Pushed forward ':'Pulled back ')+(nb?nb+' bar'+(nb>1?'s ':' '):'')+(rb?rb+' beat'+(rb>1?'s':''):'')+' — from here on':(s.rs?'Starts from the beginning of the beat':'On time'),
 opts=ext?[['full','Full beat'],['quiet','Quiet'],['soft','Soft (muffled)']]:[['full','Full beat'],['drums','Drums only'],['nodrums','No drums'],['quiet','Quiet']],
 b=(a,l,v,c)=>`<button class="lbtn${c?' pr':''}" data-a="${a}" data-i="${i}"${v!=null?` data-v="${v}"`:''}>${l}</button>`,X=s.x;
 let h=`<div class="lrow"><span class="mut">Beat here</span>${sel('mix',opts,s.mix||'full',i)}${b('hb','▶ Hear beat')}${b('stp','■ Stop')}</div>`;
 if(ext)h+=`<div class="lrow"><span class="mut">Start this part from bar</span>${b('atp','−',-1)}<input type="number" data-f="at" data-i="${i}" min="1" step="1" value="${s.at||''}" placeholder="${s.at?'':'next'}" style="width:70px;display:inline-block;text-align:center;margin:0">${b('atp','+',1)}${s.at?b('atp','Continue','clr'):''}</div>
  <div class="mut" style="font-size:12px;margin-top:4px">${s.at?'Beat jumps to bar '+s.at+' when this part starts.':'Now the beat just continues from the last part (bar '+curBar(i)+'). Type or tap a bar to choose where it starts.'}</div>
  <div class="lrow"><span class="mut">Move beat</span>${b('bp','◀ bar',-4)}${b('bp','◀ beat',-1)}${b('bp','beat ▶',1)}${b('bp','bar ▶',4)}</div>
  <div class="lrow">${b('brs','⏮ Restart beat here',null,s.rs)}${bp||s.rs||s.at?b('bpr','↺ Reset'):''}<span class="mut">${txt}</span></div>`;
 h+=X?`<div class="lrow"><span class="mut">➕ Extra sound:</span><b style="font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${E(X.name||'sound')}</b>${b('xadd','Change')}${b('xdel','✕')}</div>
  <div class="lrow"><span class="mut" style="width:62px">Volume</span><input type="range" data-f="xvol" data-i="${i}" min="0" max="200" value="${X.vol==null?100:X.vol}" style="flex:1;min-width:0"><b style="width:44px;text-align:right;font-size:12px">${X.vol==null?100:X.vol}%</b></div>
  <div class="lrow"><span class="mut">Starts at bar</span><input type="number" data-f="xat" data-i="${i}" min="1" step="1" value="${X.at||1}" style="width:70px;display:inline-block;text-align:center;margin:0">${b('xloop',X.loop===false?'Play once':'🔁 Loop',null,X.loop!==false)}</div>`
 :`<div class="lrow">${b('xadd','➕ Add a sound / beat to this part')}</div>`;
 return h}
function mixRows(){const R=[['Beat & background','beat','vb',P.vol.beat,120],['Lead voice','voc','vv',P.vol.voc,160],['Backing voices','bk','vk',P.vol.bk,120]];
 return`<b style="display:block;margin-top:14px">🎚 Mixer</b>`+R.map(([l,k,f,v,mx])=>`<div style="display:flex;align-items:center;gap:6px;margin:8px 0"><span style="width:96px;font-size:13px;flex:none">${l}</span><input type="range" data-f="${f}" min="0" max="${mx}" value="${v}" style="flex:1;min-width:0"><b style="width:44px;text-align:right;font-size:12px;flex:none">${v}%</b><button class="ib" data-a="mute" data-v="${k}" style="font-size:14px;${P.mute[k]?'background:#ff5a5a;color:#fff':''}">M</button><button class="ib" data-a="solo" data-v="${k}" style="font-size:14px;${P.solo===k?'background:#1de9c6;color:#04201c':''}">S</button></div>`).join('')+`<p class="mut">M = mute · S = solo (hear only that one). Backing voices sit under your lead voice.</p>`}
function renderLab(){if(BUSY)return;fixP(P);const r=$('#lab');
 if(!P){const l=LS('labp',[]);r.innerHTML=`<div class="top"><h1>Song Lab</h1><button class="ic ac" data-a="new">+</button></div><p class="mut" style="line-height:1.6">Pick or make a beat, record each verse, chorus and bridge, then the Lab mixes a studio-style song you can listen to, add to your music and export.</p>${l.map((p,i)=>`<div class="row" data-a="open" data-i="${i}"><div class="cv" style="background:linear-gradient(135deg,#7a5cff,#1de9c6)">🎙</div><div class="si"><b>${E(p.name)}</b><small>${p.sections.filter(s=>s.take||s.ref).length}/${p.sections.length} parts recorded</small></div><button class="ib" data-a="delp" data-i="${i}">🗑</button></div>`).join('')}<button class="lbtn pr" data-a="new" style="width:100%;margin-top:14px">＋ Start a new song</button>`;return}
 const TG=P.target||240,B=P.beat,gen=B.kind==='gen',bar=240/B.bpm,tot=P.sections.reduce((a,s)=>a+s.bars*bar,0),bgs=[['pad','🎹 Warm pad'],['keys','🎼 Melody keys'],['shaker','🥁 Shaker'],['vinyl','📻 Vinyl']];
 r.innerHTML=`<div class="top"><button class="ic" data-a="home">‹</button><h3 style="flex:1;margin-left:10px">Song Lab</h3></div>
 <input data-f="name" value="${E(P.name)}" placeholder="Song title"><input data-f="artist" value="${E(P.artist)}" placeholder="Artist name">
 <div class="lc"><div class="lh"><b>🥁 ${E(gen?styleOf(B.style).n:B.name)}</b><button class="lbtn" data-a="beat">Change beat</button></div>
  <div class="lrow"><label class="mut">BPM <input type="number" data-f="bpm" value="${B.bpm}" min="50" max="200" style="width:80px;display:inline-block"></label>${sel('key',KEYS.map((k,i)=>[i,k]),B.key||0)}${sel('mode',[['m','Minor (emotional)'],['M','Major (happy)']],B.mode||'m')}</div>
  <div class="lrow"><button class="lbtn" data-a="maker">🎛 Make my own beat</button></div></div>
 ${P.sections.map(secHTML).join('')}
 <div class="lc"><b>➕ Add a part</b><div class="lrow">${['intro','verse','chorus','bridge','outro'].map(t=>`<button class="lbtn" data-a="add" data-v="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>
  <div class="ok" style="margin-top:10px">Song length: <b>${fm(tot)}</b>${tot<TG?' · under '+Math.round(TG/60)+' min':''}</div>
  <div class="lrow"><span class="mut">Target length</span>${sel('target',[[120,'2 min'],[180,'3 min'],[240,'4 min'],[300,'5 min'],[360,'6 min'],[480,'8 min'],[600,'10 min']],TG)}${tot<TG?'<button class="lbtn" data-a="long">⏱ Make it '+Math.round(TG/60)+'+ min</button>':''}</div></div>
 <div class="lc"><b>🎚 Background music</b><div class="chips" style="margin:10px 0 0">${bgs.map(([k,l])=>`<button class="chip${P.bg[k]?' on':''}" data-a="bg" data-v="${k}">${l}</button>`).join('')}</div></div>
 <div class="lc"><b>🎤 Studio voice effect</b><div class="chips" style="margin:10px 0 0">${Object.keys(FX).map(k=>`<button class="chip${P.fx===k?' on':''}" data-a="fx" data-v="${k}">${k}</button>`).join('')}</div>
  <b style="display:block;margin-top:14px">⚙ Mix</b><div class="chips" style="margin:8px 0 0"><button class="chip${P.auto!==false?' on':''}" data-a="auto" data-v="1">✨ Auto (recommended)</button><button class="chip${P.auto===false?' on':''}" data-a="auto" data-v="0">🎚 Custom</button></div>
  ${P.auto===false?mixRows():'<p class="mut">Auto levels your voice and sets the beat, lead and backing volumes so it sounds like a normal song. Pick Custom to set them yourself.</p>'}
  <div class="fx"><span>Mic sync</span><input type="range" data-f="sy" min="0" max="400" step="10" value="${P.sync}"><b>${P.sync}ms</b></div>
  <p class="mut">If your voice sounds late against the beat, raise Mic sync (Bluetooth needs more).</p></div>
 <div class="lc"><b>🎭 Voice pitch</b><p class="mut" style="margin:6px 0">Still your voice, just deeper (bass) or higher (girl, chipmunk). Pick one, or pull the slider.</p><div class="chips" style="margin:8px 0">${[[-6,'Deep bass'],[-3,'Deeper'],[0,'Normal'],[3,'Higher'],[5,'Girl'],[8,'Chipmunk']].map(([v,l])=>`<button class="chip${(P.vp||0)===v?' on':''}" data-a="vp" data-v="${v}">${l}</button>`).join('')}</div><div style="display:flex;align-items:center;gap:8px"><input type="range" data-f="vp" min="-12" max="12" step="1" value="${P.vp||0}" style="flex:1;min-width:0"><b style="width:56px;text-align:right;font-size:12px">${(P.vp||0)>0?'+':''}${P.vp||0} st</b></div><button class="lbtn" data-a="vpPrev" style="margin-top:10px">▶ Hear my voice (8s)</button></div>
 <div class="lc"><b>🎤 Voice tuning (auto-tune)</b><p class="mut" style="margin:6px 0">Pulls your voice into the song's key (${KEYS[B.key||0]} ${B.mode==='M'?'major':'minor'} — change it above). Robotic is the famous auto-tune sound.</p><div class="chips" style="margin:10px 0 0">${[[0,'Off'],[.5,'Light'],[.8,'Medium'],[1,'Robotic']].map(([v,l])=>`<button class="chip${(P.tune||0)===v?' on':''}" data-a="tune" data-v="${v}">${l}</button>`).join('')}</div></div>
  <div class="lc"><b>✨ Mastering</b><p class="mut" style="margin:6px 0">Makes the finished song louder, clearer and ready to share.</p><div class="chips" style="margin:10px 0 0">${[['off','Off'],['clean','Clean'],['warm','Warm'],['loud','Loud']].map(([v,l])=>`<button class="chip${(P.master||'off')===v?' on':''}" data-a="mas" data-v="${v}">${l}</button>`).join('')}</div></div>
  <label class="mut" style="display:flex;gap:8px;align-items:center;margin:10px 2px"><input type="checkbox" data-lite ${isLite()?'checked':''}> ⚡ Lite mode – much faster song making + smaller file (for old phones). Mastering uses a quick version.</label>
 <button class="lbtn" data-a="prev" style="width:100%;padding:14px;margin-bottom:10px">▶ Preview with my settings (short)</button>
 <button class="lbtn pr" data-a="create" style="width:100%;padding:16px;font-size:16px">🎶 Create my song</button>
 ${RES?`<div class="lc"><b>🎉 Your song is ready</b><div class="mut" id="mp3st" style="margin-top:6px">${RES.st||''}</div>${RES.cmp?`<div class="lrow"><button class="lbtn" data-a="cmpA">▶ Before mastering (20s)</button><button class="lbtn" data-a="cmpB">▶ After mastering (20s)</button></div>`:''}<audio controls src="${RES.url}" style="width:100%;margin-top:10px"></audio><div class="lrow"><button class="lbtn pr" data-a="resAdd">➕ Add to my music</button><button class="lbtn" data-a="resDl">⬇ Download</button><button class="lbtn" data-a="resSh">📤 Share</button></div><div class="lrow"><button class="lbtn" data-a="resX">✖ Close</button><button class="lbtn" data-a="new">🆕 New song</button></div></div>`:''}`}
function setField(t){const f=t.dataset.f,i=+t.dataset.i,v=t.value;if(!P)return;
 if(f==='name')P.name=v;else if(f==='artist')P.artist=v;else if(f==='bpm')P.beat.bpm=Math.max(50,Math.min(200,+v||90));
 else if(f==='key')P.beat.key=+v;else if(f==='mode')P.beat.mode=v;else if(f==='bars')P.sections[i].bars=+v;else if(f==='lyr')P.sections[i].lyrics=v;else if(f==='mix')P.sections[i].mix=v;
 else if(f==='target'){P.target=+v;autoLen(P)}else if(f==='vb')P.vol.beat=+v;else if(f==='vv')P.vol.voc=+v;else if(f==='vk')P.vol.bk=+v;else if(f==='sy')P.sync=+v;else if(f==='vp')P.vp=+v;
  else if(f==='at'){const n=Math.floor(+v);P.sections[i].at=n>=1?n:null}else if(f==='xat'){const x=P.sections[i].x;if(x)x.at=Math.max(1,Math.floor(+v)||1)}else if(f==='xvol'){const x=P.sections[i].x;if(x)x.vol=+v}else return;
 save();if(['vb','vv','vk','sy','xvol','vp'].includes(f)){const b=t.parentElement.querySelector('b');if(b)b.textContent=f==='vp'?((+v>0?'+':'')+v+' st'):v+(f==='sy'?'ms':'%')}
 if(f==='bpm'||f==='bars'||f==='target'||f==='at'||f==='xat')renderLab()}
async function act(a,i,v){i=+i;
 if(a==='new'){stopL();if(RES){try{URL.revokeObjectURL(RES.url)}catch(e){}}P=newProject();RES=null;save();renderLab();window.scrollTo(0,0)}
 else if(a==='resX'){stopL();if(RES){try{URL.revokeObjectURL(RES.url)}catch(e){}}RES=null;renderLab()}
 else if(a==='open'){P=LS('labp',[])[i];RES=null;renderLab()}
 else if(a==='delp'){if(!confirm('Delete this song project and its recordings?'))return;const l=LS('labp',[]),p=l[i];for(const s of p.sections){if(s.take)await kvDel('take_'+s.take.id);for(const b of s.bk||[])await kvDel('take_'+b.id)}l.splice(i,1);SV('labp',l);renderLab()}
 else if(a==='home'){stopL();if(RES){try{URL.revokeObjectURL(RES.url)}catch(e){}}RES=null;P=null;renderLab()}
 else if(a==='beat')beatSheet();else if(a==='maker')makerSheet();
 else if(a==='add'){P.sections.push(newSec(v));save();renderLab()}
 else if(a==='up'&&i>0){[P.sections[i-1],P.sections[i]]=[P.sections[i],P.sections[i-1]];save();renderLab()}
 else if(a==='dn'&&i<P.sections.length-1){[P.sections[i+1],P.sections[i]]=[P.sections[i],P.sections[i+1]];save();renderLab()}
 else if(a==='rm'){if(!confirm('Remove '+secName(i)+'?'))return;const s=P.sections[i];if(s.take)await kvDel('take_'+s.take.id);for(const b of s.bk||[])await kvDel('take_'+b.id);P.sections.forEach(x=>{if(x.ref===s.id)x.ref=null});P.sections.splice(i,1);save();renderLab()}
 else if(a==='rec')record(i);else if(a==='ls')listen(i);
 else if(a==='del'){const s=P.sections[i];if(s.take){await kvDel('take_'+s.take.id);s.take=null;save();renderLab()}}
 else if(a==='reuse'){P.sections[i].ref=v;save();renderLab()}else if(a==='own'){P.sections[i].ref=null;save();renderLab()}
 else if(a==='long'){autoLen(P);save();renderLab()}
 else if(a==='bg'){P.bg[v]=!P.bg[v];save();renderLab()}else if(a==='fx'){P.fx=v;save();renderLab()}
 else if(a==='mute'){P.mute[v]=!P.mute[v];save();renderLab()}
 else if(a==='solo'){P.solo=P.solo===v?null:v;save();renderLab()}
 else if(a==='tune'){P.tune=+v;save();renderLab()}
 else if(a==='prev')await previewMix();
 else if(a==='vp'){P.vp=+v;save();renderLab()}
 else if(a==='vpPrev'){const sec=P.sections.find(x=>tkOf(x));if(!sec)return toast('Record a part first 🎤');toast('Preparing preview…');
  try{const tk=tkOf(sec),b=await takeBuf(tk.id);if(!b)return toast('Could not load your recording');
   const sr=b.sampleRate,i0=Math.floor(Math.min(tk.lead||0,Math.max(0,b.duration-1))*sr),n=Math.min(Math.floor(8*sr),b.length-i0),c=lc().createBuffer(b.numberOfChannels,n,sr);
   for(let k=0;k<b.numberOfChannels;k++)c.copyToChannel(b.getChannelData(k).slice(i0,i0+n),k);
   const o=P.vp?await shiftBuf(c,P.vp):c,g=takeGain(o);for(let k=0;k<o.numberOfChannels;k++){const d=o.getChannelData(k);for(let i=0;i<d.length;i++)d[i]*=g}
   playBuf(o)}catch(e){console.error(e);toast('Preview failed')}}
 else if(a==='auto'){P.auto=v==='1';save();renderLab()}
 else if(a==='mas'){P.master=v;save();renderLab()}
 else if(a==='punch')punchSheet(i);
 else if(a==='bk'){if((P.sections[i].bk||[]).length>=3)toast('Up to 3 backing vocals per part');else record(i,{layer:1})}
 else if(a==='delbk'){const sc=P.sections[i],b=(sc.bk||[])[+v];if(b){await kvDel('take_'+b.id);delete TB[b.id];sc.bk.splice(+v,1);save();renderLab()}}
 else if(a==='cmpA'&&RES&&RES.cmp)playBuf(RES.cmp.a);else if(a==='cmpB'&&RES&&RES.cmp)playBuf(RES.cmp.b);
 else if(a==='bp'){const sc=P.sections[i];sc.bp=(sc.bp||0)+ +v;save();renderLab()}
 else if(a==='brs'){const sc=P.sections[i];sc.rs=!sc.rs;save();renderLab()}
 else if(a==='bpr'){const sc=P.sections[i];sc.bp=0;sc.rs=false;sc.at=null;save();renderLab()}
  else if(a==='atp'){const sc=P.sections[i];if(v==='clr')sc.at=null;else sc.at=Math.max(1,(sc.at||curBar(i))+ +v);save();renderLab()}
  else if(a==='stp')stopL();
  else if(a==='xadd')beatSheet(i);
  else if(a==='xdel'){P.sections[i].x=null;save();renderLab()}
  else if(a==='xloop'){const x=P.sections[i].x;if(x){x.loop=x.loop===false;save();renderLab()}}
 else if(a==='hb'){toast('Preparing the beat…');try{playBuf(await guideBuf(i))}catch(e){toast('Could not play the beat')}}
 else if(a==='create')create();
 else if(a==='resAdd'){const fl=new File([RES.blob],RES.name,{type:RES.blob.type});await addFiles([fl],'lab');
  try{const sg=S.songs.find(x=>x.name===fl.name&&x.size===fl.size);if(sg){sg.title=P.name||sg.title;sg.artist=P.artist||sg.artist;sg.wf=RES.wf;sg.bpm=P.beat.bpm;if(!sg.art)sg.art=await coverBlob(sg.title,sg.artist);await dbPut(sg);refresh()}}catch(e){console.error(e)}}
 else if(a==='resDl'){const l=document.createElement('a');l.href=RES.url;l.download=RES.name;l.click()}
 else if(a==='resSh'){try{const f=new File([RES.blob],RES.name,{type:RES.blob.type});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:P.name});else toast('Sharing not supported here — use Download')}catch(e){}}}
/* ---- auto-tune: finds the pitch of your voice and nudges it to the nearest note of the song's key ---- */
const SCALE={m:[0,2,3,5,7,8,10],M:[0,2,4,5,7,9,11]};
async function tuneBuf(buf,key,mode,amt,onProg){
 const n=buf.length,sr=buf.sampleRate,c0=buf.getChannelData(0),c1=buf.numberOfChannels>1?buf.getChannelData(1):c0,x=new Float32Array(n);
 for(let i=0;i<n;i++)x[i]=(c0[i]+c1[i])*.5;
 const m=n>>1,d=new Float32Array(m);for(let i=0;i<m;i++)d[i]=(x[2*i]+x[2*i+1])*.5;
 const dsr=sr/2,H=512,Wn=512,lo=Math.floor(dsr/500),hi=Math.ceil(dsr/80),hops=Math.max(1,Math.floor((m-Wn-hi)/H)),ratio=new Float32Array(hops).fill(1),
  pcs=SCALE[mode==='M'?'M':'m'].map(v=>(v+key)%12),spd=amt>=1?1:amt>=.8?.5:.25,lt=isLite(),ls=lt?4:2,hs=lt?2:1;let rs=1,ltg=1;
 for(let h=0;h<hops;h++){const st=h*H;let tg=1;
  if(h%hs!==0)tg=ltg;else{let e0=0;for(let i=0;i<Wn;i++)e0+=d[st+i]*d[st+i];
  if(e0/Wn>1e-4){const nsdf=lag=>{let r=0,e1=0;for(let i=0;i<Wn;i++){const b=d[st+i+lag];r+=d[st+i]*b;e1+=b*b}return 2*r/(e0+e1+1e-9)};
   let best=-1;const cv=[];for(let lag=lo;lag<=hi;lag+=ls){const v=nsdf(lag);cv.push(v);if(v>best)best=v}
   let bl=lo;for(let k=0;k<cv.length;k++){const pv=k>0?cv[k-1]:-1,nx=k<cv.length-1?cv[k+1]:-1;if(cv[k]>=best*.9&&cv[k]>=pv&&cv[k]>=nx){bl=lo+ls*k;break}}
   let b2=-1,l2=bl;for(let lag=Math.max(lo,bl-2);lag<=Math.min(hi,bl+2);lag++){const v=nsdf(lag);if(v>b2){b2=v;l2=lag}}
   if(b2>.6){const a=nsdf(Math.max(lo,l2-1)),c=nsdf(Math.min(hi,l2+1)),dn=a-2*b2+c,lg=l2+(dn?.5*(a-c)/dn:0),f0=dsr/lg,midi=69+12*Math.log2(f0/440);
    let note=Math.round(midi),bd=99;for(let k=-2;k<=2;k++){const q=Math.round(midi)+k;if(pcs.includes(((q%12)+12)%12)&&Math.abs(q-midi)<bd){bd=Math.abs(q-midi);note=q}}
    if(Math.abs(note-midi)>.1)tg=Math.pow(2,(note-midi)*amt/12)}}
  ltg=tg}
  rs+=(tg-rs)*spd;ratio[h]=rs;if((h&63)===63){onProg&&onProg(h/hops*.5);await sleep(0)}}
 const W=1024,half=W>>1,out=new Float32Array(n),HS=H*2;let d1=0,d2=half;
 const rd=p=>{const i=Math.floor(p),f=p-i;return(i>=0&&i+1<n?x[i]*(1-f)+x[i+1]*f:0)};
 for(let i=0;i<n;i++){const r=ratio[Math.min(hops-1,Math.floor(i/HS))],dd=1-r;d1+=dd;d2+=dd;
  if(d1<0)d1+=W;else if(d1>=W)d1-=W;if(d2<0)d2+=W;else if(d2>=W)d2-=W;
  const o=i-half;if(o>=0){const w1=Math.sin(Math.PI*d1/W),w2=Math.sin(Math.PI*d2/W),wet=rd(i-d1)*w1*w1+rd(i-d2)*w2*w2,k=Math.min(1,Math.abs(r-1)*400);out[o]=x[o]*(1-k)+wet*k}
  if((i&262143)===262143){onProg&&onProg(.5+i/n*.5);await sleep(0)}}
 const nb=new OfflineAudioContext(2,n,sr).createBuffer(2,n,sr);nb.copyToChannel(out,0);nb.copyToChannel(out,1);onProg&&onProg(1);return nb}

/* ---- mastering: tone shaping + glue compressor + limiter on the finished mix ---- */
const MAS={
 clean:{lo:1,mud:-1.5,pres:.8,hi:1,th:-22,ra:2.2,lufs:-15,drive:0},
 warm:{lo:3,mud:-1,pres:0,hi:-1.5,th:-22,ra:2.5,lufs:-14,drive:.15},
 loud:{lo:2,mud:-1.5,pres:1.5,hi:1.5,th:-26,ra:3.5,lufs:-10.5,drive:.35}};
const CEIL=.891; /* -1 dB peak ceiling: safe for MP3 and phone speakers */
/* loudness (approx. LUFS: K-weighting, 400 ms blocks, silence gated) */
const bqc=(t,f,sr,g,Q)=>{const w=2*Math.PI*f/sr,cs=Math.cos(w),sn=Math.sin(w);let b0,b1,b2,a0,a1,a2;
 if(t==='hs'){const A=Math.pow(10,g/40),al=sn/2*Math.SQRT2,q=2*Math.sqrt(A)*al;b0=A*((A+1)+(A-1)*cs+q);b1=-2*A*((A-1)+(A+1)*cs);b2=A*((A+1)+(A-1)*cs-q);a0=(A+1)-(A-1)*cs+q;a1=2*((A-1)-(A+1)*cs);a2=(A+1)-(A-1)*cs-q}
 else{const al=sn/(2*Q);b0=(1+cs)/2;b1=-(1+cs);b2=b0;a0=1+al;a1=-2*cs;a2=1-al}
 return[b0/a0,b1/a0,b2/a0,a1/a0,a2/a0]};
async function loudOf(chs,sr,onProg){
 const n=chs[0].length,S=Math.round(.1*sr),nb=Math.floor(n/S),e=new Float64Array(nb),f1=bqc('hs',1500,sr,4),f2=bqc('hp',38,sr,0,.5);
 for(const x of chs){let a1=0,a2=0,b1=0,b2=0,c1=0,c2=0,d1=0,d2=0;
  for(let k=0;k<nb;k++){let sum=0;for(let i=k*S,E=i+S;i<E;i++){const v=x[i],y=f1[0]*v+a1;a1=f1[1]*v-f1[3]*y+a2;a2=f1[2]*v-f1[4]*y;const z=f2[0]*y+b1;b1=f2[1]*y-f2[3]*z+b2;b2=f2[2]*y-f2[4]*z;sum+=z*z}e[k]+=sum/S;
   if((k&15)===15){onProg&&onProg(k/nb);await sleep(0)}}}
 const bl=[];for(let k=0;k+3<nb;k++){const m=(e[k]+e[k+1]+e[k+2]+e[k+3])/4;if(m>0&&-.691+10*Math.log10(m)>-70)bl.push(m)}
 if(!bl.length)return null;
 let mu=bl.reduce((a,b)=>a+b,0)/bl.length;const g=bl.filter(m=>-.691+10*Math.log10(m)>-.691+10*Math.log10(mu)-10);
 if(!g.length)return null;mu=g.reduce((a,b)=>a+b,0)/g.length;return -.691+10*Math.log10(mu)}
/* lookahead peak limiter: never lets a peak pass the ceiling, and never clicks */
async function limitBuf(chs,sr,C,onProg){
 const n=chs[0].length,L=Math.max(8,Math.round(.005*sr)),need=new Float32Array(n);
 for(let i=0;i<n;i++){let m=0;for(let c=0;c<chs.length;c++){const v=chs[c][i],a=v<0?-v:v;if(a>m)m=a}need[i]=m>C?C/m:1;if((i&262143)===262143){onProg&&onProg(i/n*.3);await sleep(0)}}
 const cap=L+2,dv=new Float32Array(cap),di=new Int32Array(cap);let h=0,t=0,cnt=0;
 const push=j=>{const v=need[j];while(cnt>0&&dv[(t-1+cap)%cap]>=v){t=(t-1+cap)%cap;cnt--}dv[t]=v;di[t]=j;t=(t+1)%cap;cnt++};
 for(let j=0;j<Math.min(n,L-1);j++)push(j);
 for(let i=0;i<n;i++){const j=i+L-1;if(j<n)push(j);while(cnt>0&&di[h]<i){h=(h+1)%cap;cnt--}need[i]=cnt?dv[h]:1;if((i&262143)===262143){onProg&&onProg(.3+i/n*.3);await sleep(0)}}
 let sum=0,rel=1;const rc=1-Math.exp(-1/(sr*.08));
 for(let i=0;i<n;i++){sum+=need[i];if(i>=L)sum-=need[i-L];const gs=sum/(i<L?i+1:L);rel=Math.min(gs,rel+(1-rel)*rc);for(let c=0;c<chs.length;c++)chs[c][i]*=rel;if((i&262143)===262143){onProg&&onProg(.6+i/n*.4);await sleep(0)}}}
async function eqComp(buf,M,onProg){
 const oc=new OfflineAudioContext(buf.numberOfChannels,buf.length,buf.sampleRate),src=oc.createBufferSource();src.buffer=buf;
 const bq=(t,f,g,q)=>{const x=oc.createBiquadFilter();x.type=t;x.frequency.value=f;if(g!=null)x.gain.value=g;if(q)x.Q.value=q;return x};
 const a=bq('highpass',30),b=bq('lowshelf',120,M.lo),m=bq('peaking',280,M.mud,1),p=bq('peaking',3500,M.pres,.8),e=bq('highshelf',9000,M.hi);
 const c=oc.createDynamicsCompressor();c.threshold.value=M.th;c.knee.value=6;c.ratio.value=M.ra;c.attack.value=.03;c.release.value=.25;
 src.connect(a);a.connect(b);b.connect(m);m.connect(p);p.connect(e);e.connect(c);c.connect(oc.destination);src.start();
 if(onProg&&oc.suspend){const T=buf.length/buf.sampleRate,st=Math.max(2,T/10);for(let t=st;t<T-.5;t+=st){const q=Math.floor(t*buf.sampleRate/128)*128/buf.sampleRate;try{oc.suspend(q).then(()=>{onProg(q/T);oc.resume()}).catch(()=>{})}catch(x){}}}
 return oc.startRendering()}
/* Mastering: tone + glue compression (skipped on Lite phones), then loudness match + safe limiter (always, it is fast) */
async function masterBuf(buf,mode,onProg){const M=MAS[mode];if(!M)return buf;const P_=f=>onProg&&onProg(f);
 let b=buf;if(!isLite())b=await eqComp(buf,M,f=>P_(f*.5));
 const chs=[];for(let c=0;c<b.numberOfChannels;c++)chs.push(b.getChannelData(c));const sr=b.sampleRate;
 const L=await loudOf(chs,sr,f=>P_(.5+f*.2));
 if(L!=null){const gain=Math.pow(10,Math.max(-12,Math.min(12,M.lufs-L))/20),d=M.drive;
  for(const x of chs)for(let i=0;i<x.length;i++){let v=x[i]*gain;if(d)v=(1-d)*v+d*Math.tanh(v*1.5)/1.5;x[i]=v}}
 await limitBuf(chs,sr,CEIL,f=>P_(.7+f*.3));
 b.__m=1;return b}
function cmpSlice(buf){const len=Math.min(buf.length,20*buf.sampleRate),st=Math.max(0,Math.floor((buf.length-len)/2)),o=lc().createBuffer(2,len,buf.sampleRate);let pk=0;
 for(let c=0;c<2;c++){const a=buf.getChannelData(Math.min(c,buf.numberOfChannels-1)).slice(st,st+len);for(let i=0;i<len;i++){const v=a[i]<0?-a[i]:a[i];if(v>pk)pk=v}o.copyToChannel(a,c)}
 const g=pk>.0001?.9/pk:1;for(let c=0;c<2;c++){const a=o.getChannelData(c);for(let i=0;i<len;i++)a[i]*=g}return o}

/* ---- redo a bit: record only some bars and blend them into the existing take ---- */
async function savePunch(sec,r,win){const tk=sec.take,old=await takeBuf(tk.id),bar=240/P.beat.bpm,sy=(P.sync||0)/1000,ch=old.numberOfChannels,F=Math.round(.015*SR);
 const i0=Math.round((win[0]*bar+tk.lead+sy)*SR),i1=Math.round((win[1]*bar+tk.lead+sy)*SR),len=Math.max(old.length,i1+Math.round(.3*SR)),sh=Math.round((r.lead+sy)*SR);
 const nb=new OfflineAudioContext(ch,len,SR).createBuffer(ch,len,SR);
 for(let c=0;c<ch;c++){const o=old.getChannelData(c),nw=r.vb.getChannelData(Math.min(c,r.vb.numberOfChannels-1)),dd=nb.getChannelData(c);dd.set(o.subarray(0,Math.min(o.length,len)));
  for(let i=i0;i<i1&&i<len;i++){const j=i-i0+sh;if(j<0||j>=nw.length)continue;const w=Math.min(1,(i-i0)/F,(i1-1-i)/F);dd[i]=(i<o.length?o[i]:0)*(1-w)+nw[j]*w}}
 const id='t'+Date.now();await kvPut('take_'+id,wav(nb));await kvDel('take_'+tk.id);delete TB[tk.id];TB[id]=nb;sec.take={id,lead:tk.lead,dur:nb.duration}}
function punchSheet(i){const s=P.sections[i];if(s.ref||!s.take)return toast('Record this part first');
 const w=document.createElement('div'),op=n=>Array.from({length:s.bars},(_,k)=>`<option value="${k+1}"${k+1===n?' selected':''}>Bar ${k+1}</option>`).join('');
 w.innerHTML=`<p class="mut" style="margin:6px 0">Pick the bars you want to sing again. Only that bit is replaced — the rest of your take stays.</p><div class="lrow"><span class="mut">From</span><select id="pa">${op(1)}</select><span class="mut">to the end of</span><select id="pz">${op(Math.min(4,s.bars))}</select></div>`;
 sheet('✂ Redo a bit of '+secName(i),[{ic:'🎙',t:'Record this bit',fn:()=>{const a=+w.querySelector('#pa').value,b=+w.querySelector('#pz').value;if(b<a)return toast('"To" must be after "From"');setTimeout(()=>record(i,{win:[a-1,b]}),80)}}],w)}

/* MP3 is made in a background worker so the song is ready (as WAV) straight after mixing */
const WK=`self.onmessage=e=>{const {src,ch,sr,kb,g,d}=e.data;try{importScripts(src)}catch(x){self.postMessage({err:1});return}
try{const enc=new lamejs.Mp3Encoder(ch,sr,kb),B=1152*20,out=[],n=d[0].length;
const cv=(a,i,e)=>{const o=new Int16Array(e-i);for(let j=i;j<e;j++){const x=Math.max(-1,Math.min(1,a[j]*g));o[j-i]=x<0?x*32768:x*32767}return o};
let last=-1;for(let i=0;i<n;i+=B){const e=Math.min(n,i+B),m=ch===2?enc.encodeBuffer(cv(d[0],i,e),cv(d[1],i,e)):enc.encodeBuffer(cv(d[0],i,e));if(m.length)out.push(new Uint8Array(m));const p=Math.floor(i/n*100);if(p!==last){last=p;self.postMessage({p:i/n})}}
const f=enc.flush();if(f.length)out.push(new Uint8Array(f));self.postMessage({done:1,blob:new Blob(out,{type:'audio/mpeg'})})}catch(x){self.postMessage({err:1})}}`;
function bgMp3(buf,me,base){
 if(!window.Worker||!window.Blob)return;
 try{const lite=isLite(),ch=lite?1:Math.min(2,buf.numberOfChannels),n=buf.length,d=[];
  if(lite&&buf.numberOfChannels>1){const L=buf.getChannelData(0),R=buf.getChannelData(1),m=new Float32Array(n);for(let i=0;i<n;i++)m[i]=(L[i]+R[i])/2;d.push(m)}
  else for(let c=0;c<ch;c++)d.push(new Float32Array(buf.getChannelData(c)));
  let pk=0;if(!buf.__m)for(const a of d)for(let i=0;i<n;i++){const x=a[i]<0?-a[i]:a[i];if(x>pk)pk=x}
  const w=new Worker(URL.createObjectURL(new Blob([WK],{type:'text/javascript'})));
  const upd=t=>{me.st=t;const e=$('#mp3st');if(e&&RES===me)e.textContent=t};
  upd('Making a smaller MP3 file… 0%  (you can already play it or add it to your music)');
  w.onmessage=e=>{const m=e.data;
   if(m.p!=null)upd('Making a smaller MP3 file… '+Math.round(m.p*100)+'%  (you can already play it or add it to your music)');
   else if(m.done){w.terminate();if(RES!==me)return;me.blob=m.blob;me.url=URL.createObjectURL(m.blob);me.name=base+'.mp3';upd('MP3 ready ✅ (smaller file) — Download and Add now use the MP3');
    const a=$('#lab audio');if(!BUSY&&(!a||a.paused))renderLab()}
   else if(m.err){w.terminate();upd('')}};
  w.onerror=()=>{w.terminate();upd('')};
  w.postMessage({src:new URL('lame.min.js',location.href).href,ch,sr:buf.sampleRate,kb:lite?96:192,g:buf.__m?1:pk>.0001?Math.min(3,.97/pk):1,d},d.map(a=>a.buffer))
 }catch(e){console.error(e)}}

/* ---- voice pitch: deeper bass voice or higher girl / chipmunk voice, same speed, still YOUR voice ---- */
async function shiftBuf(b,semi,onProg){
 const r=Math.pow(2,semi/12),n=b.length,sr=b.sampleRate,W=Math.round(sr*.04)&~1,half=W>>1,dd=1-r,o=lc().createBuffer(b.numberOfChannels,n,sr);
 for(let c=0;c<b.numberOfChannels;c++){const x=b.getChannelData(c),out=new Float32Array(n);let d1=0,d2=half;
  for(let i=0;i<n;i++){d1+=dd;d2+=dd;if(d1<0)d1+=W;else if(d1>=W)d1-=W;if(d2<0)d2+=W;else if(d2>=W)d2-=W;
   const q=i-half;if(q>=0){const w1=d1<half?d1/half:2-d1/half,w2=1-w1,p1=i-d1,p2=i-d2,i1=p1|0,i2=p2|0,f1=p1-i1,f2=p2-i2;
    const a=i1>=0&&i1+1<n?x[i1]*(1-f1)+x[i1+1]*f1:0,e=i2>=0&&i2+1<n?x[i2]*(1-f2)+x[i2+1]*f2:0;out[q]=a*w1+e*w2}
   if((i&262143)===262143){onProg&&onProg((c+i/n)/b.numberOfChannels);await sleep(0)}}
  o.copyToChannel(out,c)}
 onProg&&onProg(1);return o}
/* auto level: how much to lift / lower a recording so every voice sits at a normal level */
function takeGain(b){const d=b.getChannelData(0);let s=0,c=0;for(let i=0;i<d.length;i+=3){const v=d[i];if(v>.02||v<-.02){s+=v*v;c++}}
 if(c<2000)return 1;return Math.max(.4,Math.min(4,.13/Math.sqrt(s/c)))}
/* quick preview: the first recorded part (up to 4 bars) with beat, voice pitch, tuning, studio effect, auto mix and mastering */
async function previewMix(){const s0=P.sections.find(x=>tkOf(x));if(!s0)return toast('Record a part first 🎤');
 stopL();toast('Making a short preview…');
 try{await ensureBeat(P);const sec=Object.assign({},s0,{bars:Math.min(s0.bars,4)}),bar=240/P.beat.bpm,sy=(P.sync||0)/1000,tk=tkOf(sec),ts=[tk,...(sec.bk||[])].filter(Boolean);
  TUN={};
  for(const t of ts){if(!TB[t.id])await takeBuf(t.id);const b=TB[t.id];if(!b)continue;
   const sr=b.sampleRate,n=Math.min(b.length,Math.ceil((t.lead+sy+sec.bars*bar+2)*sr)),c=lc().createBuffer(b.numberOfChannels,n,sr);
   for(let k=0;k<b.numberOfChannels;k++)c.copyToChannel(b.getChannelData(k).slice(0,n),k);TUN[t.id]=c;
   if(P.tune>0)TUN[t.id]=await tuneBuf(TUN[t.id],P.beat.key||0,P.beat.mode||'m',P.tune);
   if(P.vp)TUN[t.id]=await shiftBuf(TUN[t.id],P.vp)}
  let p2=Object.assign({},P,{sections:[sec]});
  if(P.auto!==false){const tg={};for(const t of ts){const b=VB(t.id);if(b)tg[t.id]=takeGain(b)}p2=Object.assign(p2,{vol:{beat:72,voc:110,bk:55},tg})}
  let buf=await mixProject(p2);TUN={};
  if(P.master&&P.master!=='off')buf=await masterBuf(buf,P.master);
  playBuf(buf)}catch(e){console.error(e);TUN={};toast('Preview failed')}}
async function create(){fixP(P);if(!P.sections.some(s=>tkOf(s)))return toast('Record at least one part first 🎤');
 stopL();BUSY=true;$('#busy').classList.add('on');const msg=$('#bMsg'),bar=$('#bBar');
 const set=(t,f)=>{const v=Math.max(0,Math.min(100,Math.round(f*100)));msg.textContent=t+' '+v+'%';bar.style.width=v+'%'};
 const tu=P.tune>0,sh=(P.vp||0)!==0,ma=P.master&&P.master!=='off',a0=.08,a1=(tu||sh)?.28:.08,am=tu&&sh?(.08+.28)/2:a1,mixEnd=ma?.6:.65,saveSt=ma?.7:.65;
 set('Preparing your recordings',0);
 try{await ensureBeat(P);
  const all=[...new Set(P.sections.flatMap(s=>[tkOf(s),...(s.bk||[])]).filter(Boolean).map(t=>t.id))],need=all.filter(id=>!TB[id]);let dn=0;
  await Promise.all(need.map(id=>takeBuf(id).then(()=>set('Preparing your recordings',a0*(++dn/need.length)))));
  TUN={};
  if(tu){let k=0;for(const id of all){if(TB[id])TUN[id]=await tuneBuf(TB[id],P.beat.key||0,P.beat.mode||'m',P.tune,f=>set('Tuning your voice',a0+(am-a0)*((k+f)/all.length)));k++}}
  if(sh){let k=0;const s0=tu?am:a0;for(const id of all){const src=VB(id);if(src)TUN[id]=await shiftBuf(src,P.vp,f=>set('Changing your voice',s0+(a1-s0)*((k+f)/all.length)));k++}}
  let Pm=P;if(P.auto!==false){const tg={};for(const id of all){const b=VB(id);if(b)tg[id]=takeGain(b)}Pm=Object.assign({},P,{vol:{beat:72,voc:110,bk:55},tg})}
  set('Mixing your song',a1);await sleep(30);
  let buf=await mixProject(Pm,f=>set('Mixing your song',a1+(mixEnd-a1)*f)),cmp=null;TUN={};
  if(ma){set('Mastering',mixEnd);await sleep(20);const ca=cmpSlice(buf);buf=await masterBuf(buf,P.master,f=>set('Mastering',mixEnd+.1*f));cmp={a:ca,b:cmpSlice(buf)}}
  set('Saving',saveSt);await sleep(20);
  const wb=await wavAsync(buf,f=>set('Saving',saveSt+(1-saveSt)*f));
  if(RES)URL.revokeObjectURL(RES.url);
  const base=`${P.artist||'Me'} - ${P.name||'My song'}`.replace(/[\\/:*?"<>|]/g,''),me=RES={wf:peaksOf(buf),blob:wb,url:URL.createObjectURL(wb),name:base+'.wav',st:'',cmp};
  toast('Your song is ready 🎉');bgMp3(buf,me,base)}
 catch(e){console.error(e);TUN={};toast('Could not create the song. Try fewer parts or a shorter song.')}
 BUSY=false;$('#busy').classList.remove('on');renderLab();setTimeout(()=>window.scrollTo(0,document.body.scrollHeight),80)}
const lab=$('#lab');
lab.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b)act(b.dataset.a,b.dataset.i,b.dataset.v)});
lab.addEventListener('input',e=>{const f=e.target.dataset.f;if(['name','artist','lyr','vb','vv','vk','sy','xvol','vp'].includes(f))setField(e.target)});
lab.addEventListener('change',e=>{if(e.target.dataset.lite!==undefined){SV('lite',e.target.checked);return}
 const f=e.target.dataset.f;if(f&&!['name','artist','lyr','vb','vv','vk','sy','xvol','vp'].includes(f))setField(e.target)});
R.lab=renderLab;
})();