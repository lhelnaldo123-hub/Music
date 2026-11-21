/* =====================================================================
   LB Music · CREATE & TOOLS HUB + TUTORIALS  (add-on)
   Load LAST:  <script src="lb-hub.js"></script>
   · Replaces the long row of tool buttons on the Music page with ONE
     "Create & tools" button that opens a clean page (cards, plain words)
   · Adds a "How to use this page" tutorial at the top of every tool page
     (opens by itself the first time you visit a page)
   Nothing is removed from the app.
   ===================================================================== */
(()=>{
if(window.__lbHub||typeof R==='undefined')return;window.__lbHub=1;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];

/* ---------------- the words (edit here) ---------------- */
const H={
 lab:{p:'lab',ic:'🎤',t:'Song Lab',kind:'Creates a full song',what:'You pick a beat, sing each part (verse, chorus…) into your phone, and the Lab mixes it all into one finished song with studio effects.',when:'You want to make a complete song with your own voice. Start here if you are new.',
  steps:['Tap <b>+ Start a new song</b>.','Choose a beat: <b>Change beat</b> to pick one, or <b>Make my own beat</b>. Set the BPM (speed) and key.','For each part (Intro, Verse, Chorus…): type your lyrics if you like, then tap <b>🎙 Record</b>. Sing along to the beat. Use <b>headphones</b>.','Happy with it? Tap <b>Save take</b>. Not happy? Tap <b>Retry</b>.','Need more parts? Use <b>Add a part</b>. Same chorus again? Tap <b>🔁 Reuse</b>.','Pick <b>Background music</b>, a <b>Studio voice effect</b>, <b>Voice tuning</b> (auto-tune) and <b>Mastering</b>.','Tap <b>🎶 Create my song</b> and wait. Then listen, <b>Add to my music</b>, download or share.'],
  tip:'Voice sounds late? Raise <b>Mic sync</b> (Bluetooth needs more). For the best quality, switch <b>Lite mode</b> off.'},
 maker:{p:'maker',ic:'🥁',t:'Make a song (beat maker)',kind:'Creates a beat',what:'Tap squares to build a loop of drums, bass and melody, then save it as a song. No recording needed.',when:'You want a beat or instrumental to rap or sing over.',
  steps:['Tap a <b>Quick start</b> (Hip-hop, Pop, Afro, House) to fill the pattern for you, or tap the squares yourself.','Each row is an instrument (Kick, Snare, Hi-hat, Bass…). Each square is one beat in time. Bright = it plays. Scroll sideways to see all of them.','Tap <b>▶</b> to listen. Change <b>BPM</b> (speed), <b>Key &amp; scale</b> (the notes the bass and lead use) and <b>Sound</b> (the drum style).','Tap a row name to mute that instrument. <b>🎲 Random</b> gives a new idea. <b>🗑 Clear</b> starts empty.','Set the <b>Song length</b>, then tap <b>💾 Save to my music</b>.'],
  tip:'Use your saved beat in Song Lab (Change beat) or in Multitrack to sing over it.'},
 inst:{p:'inst',ic:'🎹',t:'Instruments',kind:'Makes music parts',what:'Play a keyboard, draw notes on a piano roll, or tap drum pads. What you make can be sent to the Multitrack timeline.',when:'You want to add piano, bass, melody or drums you play yourself to a song.',
  steps:['<h5>🎹 Keyboard</h5>Pick a sound (Piano, Pad, Bass…) and play the keys. <b>− / +</b> changes the octave. Tap <b>⏺ Rec</b>: you hear a click, and what you play is written into the Piano roll.','<h5>🎼 Piano roll</h5>Up = higher note, across = time. Choose a <b>Note length</b>, then tap a square to add a note. Tap a note again to remove it. <b>▶ Play</b> loops it. <b>Bars</b> sets the loop length.','<h5>🥁 Drum pads</h5>Tap the pads to play. Tap the small squares to build a beat, or press <b>⏺ Rec</b> and tap the pads live. <b>Pitch − / +</b> changes a pad. <b>Load sound</b> or <b>Record sound</b> puts your own sound on a pad.','<h5>Put it in your song</h5>Choose <b>Repeat</b> (1×–8×) and tap <b>🎚 Send to timeline</b>. It appears as a clip in Multitrack, where you can add your voice.'],
  tip:'Use <b>BPM −/+</b> to match your beat. The tempo is shared with Multitrack.'},
 rec:{p:'rec',ic:'🎙',t:'Recorder',kind:'Records your voice',what:'Records your voice or an instrument with good quality, then lets you clean it up and save it.',when:'You just want to record something: a song idea, a rap, a voice note. Or to sing over a song already in your library.',
  steps:['Pick your <b>Microphone</b> and use headphones. Watch the level meter: if it goes red, you are too loud.','Under <b>Timing</b> choose a BPM, a metronome and a count-in if you want a beat to follow.','Optional: <b>Sing over a song</b> lets you pick a song from your library to hear while you record.','Tap the big red button to start, tap again to stop.','Listen to your take. Use <b>Vocal tools</b> (voice presets, auto-tune, doubling, reverb). <b>Undo</b> always brings your original back.','Tap <b>Save</b> to put it in My Music, or share it.'],
  tip:'Recorder only records. To turn recordings into a full song, use Song Lab or Multitrack.'},
 mt:{p:'mt',ic:'🎚',t:'Multitrack',kind:'Combines tracks',what:'A timeline like a real studio. Put a beat on one track, your voice on another, instruments on another, then mix and save.',when:'You want to combine several things: a beat + vocals + instruments, or record over other tracks, trim, move and mix.',
  steps:['Tap <b>＋ Add audio</b> to place a song from your library (like a beat) on a track.','Tap <b>R</b> on a track (it turns red), then press <b>⏺</b> to record your voice onto it. Use <b>headphones</b>.','Tap a clip to select it. Drag it to move it. Drag the white edges to trim it. The bar under the timeline shows more things you can do with it.','Tap a track name to change its volume, pan, EQ, compression, reverb and voice presets. <b>M</b> = mute, <b>S</b> = solo.','<b>▶</b> plays, <b>🔁</b> loops, <b>🧲</b> snaps to the beat, <b>🔍</b> zooms. <b>↶ ↷</b> undo and redo.','Happy? Tap <b>💾 Save mix to my music</b>.'],
  tip:'Instruments you play can be sent straight here with “Send to timeline”.'},
 ms:{p:'ms',ic:'🎛',t:'Mastering',kind:'Improves a finished song',what:'Checks how loud and balanced a song is, then polishes it so it sounds louder, clearer and ready for Spotify, YouTube and more.',when:'Your song is finished and mixed, and you want it to sound professional. Do this last.',
  steps:['Under <b>1 · Choose a song</b>, pick a song from your library.','Read the report: loudness, peaks and tonal balance (is it too bassy or too dull?).','Under <b>2 · Master it</b>, pick a preset (Clean, Loud, Warm, Bright, Vocal) and a target (Spotify / YouTube, Apple Music, Club, Podcast).','Tap <b>A · Before</b> and <b>B · After</b> to compare at the same volume.','Happy? Save the result.'],
  tip:'Master only the final mix, not single tracks.'},
 exp:{p:'exp',ic:'📦',t:'Import & Export',kind:'Saves & shares',what:'Turns songs into MP3 or WAV files to share or download, and backs up your work.',when:'You want to send a song to someone, upload it somewhere, or keep a backup.',
  steps:['<b>Export a song</b>: choose the song and a format. WAV is the best quality. MP3 is smaller. Then Download or Share.','<b>Backup my work</b> saves your beats, settings and playlists (and optionally your own songs) in one file.','<b>Restore &amp; import</b> brings a backup or audio files back into the app.'],
  tip:'Back up before clearing your browser data or changing phones.'}
};
const ORDER=['lab','maker','inst','rec','mt','ms','exp'];
const steps=h=>`<ol>${h.steps.map(s=>`<li>${s}</li>`).join('')}</ol><p class="hTip">💡 ${h.tip}</p>`;

/* ---------------- 1. clean top row ---------------- */
const act=$('.action');
if(act){$$('.action button').forEach(b=>{if(/show\('(maker|rec|exp|mt|ms|inst)'\)/.test(b.getAttribute('onclick')||''))b.remove()});
 act.insertAdjacentHTML('beforeend','<button class="hubBtn" onclick="show(\'hub\')">🎛<br>Create &amp; tools</button>')}

/* ---------------- 2. the hub page ---------------- */
const css=document.createElement('style');css.textContent=`
.hubBtn{background:linear-gradient(135deg,var(--ac),var(--ac2))!important;color:#04201c!important;border:1px solid transparent!important;font-weight:800}
#hub .hFlow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:var(--card);border-radius:16px;padding:12px;margin:6px 0 4px;font-size:12px;color:var(--mut)}
#hub .hFlow b{color:#fff;background:#ffffff14;border-radius:12px;padding:6px 10px;font-size:12px}
#hub h4{font-size:12px;letter-spacing:.5px;color:var(--mut);margin:18px 2px 8px}
#hub .hC{background:var(--card);border-radius:18px;padding:14px;margin:10px 0}
#hub .hh{display:flex;gap:12px;align-items:center}#hub .hi{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,var(--ac2),var(--ac));display:flex;align-items:center;justify-content:center;font-size:24px;flex:none}
#hub .hh b{font-size:16px;display:block}#hub .hh small{display:inline-block;margin-top:3px;background:#ffffff14;border-radius:10px;padding:2px 8px;font-size:11px;color:var(--ac)}
#hub .hC p{font-size:13px;line-height:1.55;margin:10px 0 0;color:#cfd6e0}#hub .hC p.wh{color:var(--mut)}#hub .hC p.wh b{color:#fff}
#hub .hb{display:flex;gap:8px;margin-top:12px}#hub .hb button{flex:1;padding:12px;border-radius:14px;background:#ffffff14;color:#fff;font-size:14px;font-weight:700}#hub .hb .go{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#04201c}
#hub .hS{display:none;margin-top:6px}#hub .hS.on{display:block}
.hlp{background:var(--card);border-radius:16px;margin:10px 0;border:1px solid #ffffff12}
.hlp summary{padding:13px 14px;font-weight:700;font-size:14px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;color:var(--ac)}.hlp summary::-webkit-details-marker{display:none}
.hlp summary::after{content:'▾';margin-left:auto;transition:transform .2s}.hlp[open] summary::after{transform:rotate(180deg)}
.hlp .hBody{padding:0 14px 14px}
.hlp ol,#hub ol{margin:4px 0 0;padding-left:20px;font-size:13px;line-height:1.6;color:#d6dce5}.hlp li,#hub li{margin:6px 0}.hlp li b,#hub li b{color:#fff}
.hlp h5,#hub h5{font-size:13px;margin:2px 0 3px;color:#fff}
.hTip{font-size:12.5px;line-height:1.5;background:#ffffff0d;border-radius:12px;padding:10px;margin:10px 0 0;color:#cfd6e0}
`;document.head.append(css);
document.body.insertAdjacentHTML('beforeend',`<section id="hub" class="page"><div class="top"><button class="ic" onclick="back()">‹</button><h3>🎛 Create &amp; tools</h3><span></span></div><div id="hubBody"></div></section>`);
function hubCard(k){const h=H[k];return `<div class="hC"><div class="hh"><div class="hi">${h.ic}</div><div><b>${h.t}</b><small>${h.kind}</small></div></div>
 <p>${h.what}</p><p class="wh"><b>Use it when:</b> ${h.when}</p>
 <div class="hb"><button class="go" data-go="${h.p}">Open</button><button data-how="${k}">How to use ▾</button></div><div class="hS" id="hs_${k}">${steps(h)}</div></div>`}
function renderHub(){const b=$('#hubBody');if(!b)return;
 b.innerHTML=`<p style="color:var(--mut);font-size:14px;line-height:1.6;margin:0 2px 8px">Everything you need to make music is here. Not sure where to start? Open <b style="color:#fff">Song Lab</b>. Tap <b style="color:#fff">How to use</b> on any card for simple steps.</p>
 <div class="hFlow"><b>1 Beat</b>›<b>2 Record</b>›<b>3 Mix</b>›<b>4 Master</b>›<b>5 Export</b></div>
 <h4>MAKE MUSIC</h4>${['lab','maker','inst'].map(hubCard).join('')}
 <h4>RECORD &amp; MIX</h4>${['rec','mt'].map(hubCard).join('')}
 <h4>FINISH &amp; SHARE</h4>${['ms','exp'].map(hubCard).join('')}`}
R.hub=renderHub;renderHub();
document.addEventListener('click',e=>{const g=e.target.closest('#hub [data-go]');if(g){show(g.dataset.go);return}
 const w=e.target.closest('#hub [data-how]');if(w){const s=$('#hs_'+w.dataset.how),on=!s.classList.contains('on');s.classList.toggle('on',on);w.textContent=on?'Hide steps ▴':'How to use ▾'}});

/* ---------------- 3. tutorial bar on each tool page ---------------- */
let SEEN={};try{SEEN=LS('hlpSeen',{})||{}}catch(e){}
function putHelp(id,k){const sec=$('#'+id);if(!sec||sec.querySelector(':scope>.hlp'))return;const top=sec.querySelector(':scope>.top'),h=H[k],
 html=`<details class="hlp" data-k="${k}"><summary>❓ How to use ${h.t}</summary><div class="hBody"><p style="font-size:13px;color:var(--mut);line-height:1.5;margin:0 0 6px">${h.what}</p>${steps(h)}</div></details>`;
 top?top.insertAdjacentHTML('afterend',html):sec.insertAdjacentHTML('afterbegin',html)}
Object.keys(H).forEach(k=>{const id=H[k].p,sec=$('#'+id);if(!sec)return;putHelp(id,k);new MutationObserver(()=>putHelp(id,k)).observe(sec,{childList:true})});
const _show=window.show;
window.show=function(id){const r=_show.apply(this,arguments);const k=Object.keys(H).find(x=>H[x].p===id);
 if(k&&!SEEN[id]){SEEN[id]=1;SV('hlpSeen',SEEN);putHelp(id,k);const d=$('#'+id+' .hlp');if(d)d.open=true}return r};
})();

/* ---------------- 4. loads the small add-on files listed in lb-addons.json ---------------- */
fetch('lb-addons.json',{cache:'no-cache'}).then(r=>r.json()).then(l=>{(l||[]).forEach(f=>{const s=document.createElement('script');s.src=f;s.async=false;document.body.append(s)})}).catch(()=>{});