
(()=>{
const $=id=>document.getElementById(id);
const KEY="articulationLabSessionsV3";

let sessions=[]; try{sessions=JSON.parse(localStorage.getItem(KEY)||"[]")}catch{}
let stream=null,recorder=null,chunks=[],blobUrl=null,seconds=0,timerId=null;
let recognition=null,recognizing=false,transcriptText="";
let audioCtx=null,analyser=null,source=null,monitorId=null;
let silenceStart=null,hasSpoken=false,pauseDurations=[],speechSamples=0,quietSamples=0;
let attemptNumber=1,lastAnalysis=null;

const promptBanks={
conversation:["Tell me about something you recently learned and why it mattered to you.","Describe a conversation that changed your perspective.","What is something you wish people asked you about more often?"],
storytelling:["Tell a story about a small decision that had a bigger effect than expected.","Describe a moment when your first impression changed.","Tell a story about a mistake that taught you something useful."],
professional:["Explain a project you are proud of to someone outside your field.","Give a concise update on a project that is behind schedule.","Describe a difficult decision and how you approached it."],
impromptu:["What is something people often overcomplicate?","Is consistency more important than motivation?","What makes a day feel productive?"],
persuasion:["Make the case for scheduling recovery time deliberately.","Argue for one change that would make meetings more useful.","Convince someone to try a habit that has helped you."],
explain:["Explain correlation versus causation with a real-world example.","Explain a recommendation system to someone nontechnical.","Explain a process using three main points and one example."]
};
const followups=["What makes you say that?","Can you give a specific example?","What happened next?","Why does that matter?","What would you do differently now?"];
const fillers=["um","uh","erm","like","you know","basically","actually","literally","kind of","sort of","i mean"];
const words=t=>(String(t).toLowerCase().match(/\b[\w’'-]+\b/g)||[]);
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const persist=()=>localStorage.setItem(KEY,JSON.stringify(sessions));
const avg=s=>(Object.values(s).reduce((a,b)=>a+b,0)/4).toFixed(1);

$("newPrompt").onclick=()=>{let a=promptBanks[$("goal").value];$("promptText").textContent=a[Math.floor(Math.random()*a.length)]};
$("followup").onclick=()=>{$("promptText").textContent="Follow-up: "+followups[Math.floor(Math.random()*followups.length)]};

function chooseMime(){
 const candidates=[
  "video/mp4;codecs=h264,aac","video/mp4","video/webm;codecs=vp8,opus","video/webm"
 ];
 if(!window.MediaRecorder)return null;
 for(const c of candidates){try{if(MediaRecorder.isTypeSupported(c))return c}catch{}}
 return "";
}

async function enableCamera(force=false){
 try{
   if(force&&stream){stream.getTracks().forEach(t=>t.stop());stream=null}
   if(!stream||stream.getTracks().some(t=>t.readyState==="ended")){
     stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:true});
   }
   await showLivePreview();
   $("cameraBtn").disabled=true;$("cameraBtn").textContent="Camera ready";
   $("recordBtn").disabled=false;$("recordingState").textContent="Ready";
   $("status").textContent="Live camera is ready.";
 }catch(e){
   $("status").textContent="Camera/microphone permission was not granted.";
   $("previewState").textContent="Camera unavailable";
 }
}
$("cameraBtn").onclick=()=>enableCamera(true);

async function showLivePreview(){
 const v=$("preview");
 try{v.pause()}catch{}
 v.srcObject=null;
 v.removeAttribute("src");
 v.load();
 if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}
 v.controls=false;v.muted=true;
 v.srcObject=stream;
 $("previewState").textContent="LIVE";
 try{await v.play()}catch{}
 $("downloadBtn").disabled=true;
}

function setupRecognition(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR)return;
 recognition=new SR();recognition.continuous=true;recognition.interimResults=true;recognition.lang="en-US";
 recognition.onresult=e=>{
   let finalChunk="",interim="";
   for(let i=e.resultIndex;i<e.results.length;i++){
     const t=e.results[i][0].transcript;
     if(e.results[i].isFinal)finalChunk+=t+" "; else interim+=t;
   }
   if(finalChunk)transcriptText+=finalChunk;
   const all=(transcriptText+interim).trim();
   $("transcript").textContent=all||"Listening…";
   $("manualTranscript").value=all;
 };
 recognition.onend=()=>{if(recognizing){try{recognition.start()}catch{}}};
}
setupRecognition();

function startPauseMonitor(){
 pauseDurations=[];silenceStart=null;hasSpoken=false;speechSamples=0;quietSamples=0;
 try{
   audioCtx=new (window.AudioContext||window.webkitAudioContext)();
   source=audioCtx.createMediaStreamSource(stream);
   analyser=audioCtx.createAnalyser();analyser.fftSize=1024;source.connect(analyser);
   const data=new Uint8Array(analyser.fftSize);
   monitorId=setInterval(()=>{
     analyser.getByteTimeDomainData(data);
     let sum=0;
     for(const x of data){const n=(x-128)/128;sum+=n*n}
     const rms=Math.sqrt(sum/data.length);
     const now=performance.now(),speaking=rms>.024;
     if(speaking){
       speechSamples++;hasSpoken=true;
       if(silenceStart!==null){
         const d=(now-silenceStart)/1000;
         if(d>=.45&&d<=4.5)pauseDurations.push(d);
         silenceStart=null;
       }
     }else{
       quietSamples++;
       if(hasSpoken&&silenceStart===null)silenceStart=now;
     }
   },100);
 }catch{}
}
function stopPauseMonitor(){
 clearInterval(monitorId);monitorId=null;
 try{source&&source.disconnect()}catch{}
 try{audioCtx&&audioCtx.close()}catch{}
 source=analyser=audioCtx=null;silenceStart=null;
}
const fmt=s=>`${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;

async function startRecording(){
 if(!stream){await enableCamera();if(!stream)return}
 // Always force the visible element back to LIVE before the recorder begins.
 await showLivePreview();

 chunks=[];transcriptText="";lastAnalysis=null;
 $("manualTranscript").value="";$("transcript").textContent="Listening…";
 $("recordingState").textContent="Recording";$("previewState").textContent="LIVE · RECORDING";
 $("newRecordingBtn").hidden=true;

 const mime=chooseMime();
 try{recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream)}catch(e){
   $("status").textContent="This browser could not start a recorder.";return;
 }
 recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
 recorder.onstop=()=>{
   stopPauseMonitor();
   const type=recorder.mimeType||"video/webm";
   const blob=new Blob(chunks,{type});
   blobUrl=URL.createObjectURL(blob);
   const v=$("preview");
   v.pause();v.srcObject=null;v.src=blobUrl;v.muted=false;v.controls=true;
   $("previewState").textContent="PLAYBACK";
   $("recordingState").textContent="Recorded";
   $("downloadBtn").disabled=false;$("stopBtn").disabled=true;
   $("recordBtn").disabled=true;$("newRecordingBtn").hidden=false;
   $("newRecordingBtn").textContent="New recording";
   $("status").textContent="Recording complete. Use New recording for a fresh live camera feed, or analyze this attempt.";
   analyze();
 };
 recorder.start();startPauseMonitor();
 seconds=0;$("timer").textContent="00:00";
 timerId=setInterval(()=>{$("timer").textContent=fmt(++seconds)},1000);
 recognizing=!!recognition;if(recognition)try{recognition.start()}catch{}
 $("recordBtn").disabled=true;$("stopBtn").disabled=false;
}
$("recordBtn").onclick=startRecording;
$("stopBtn").onclick=()=>{
 if(recorder&&recorder.state!=="inactive")recorder.stop();
 clearInterval(timerId);
 recognizing=false;if(recognition)try{recognition.stop()}catch{}
};
$("downloadBtn").onclick=()=>{
 if(!blobUrl)return;
 const a=document.createElement("a");
 const ext=(recorder?.mimeType||"").includes("mp4")?"mp4":"webm";
 a.href=blobUrl;a.download=`articulation-${new Date().toISOString().slice(0,10)}.${ext}`;a.click();
};

async function prepareNewRecording(mode="new"){
 clearInterval(timerId);stopPauseMonitor();
 recognizing=false;if(recognition)try{recognition.stop()}catch{}
 if(recorder&&recorder.state!=="inactive")try{recorder.stop()}catch{}
 attemptNumber++;
 $("attemptLabel").textContent=`Recording ${attemptNumber}`;
 $("recordingState").textContent=mode==="retry"?"Retry ready":"New recording ready";
 seconds=0;$("timer").textContent="00:00";chunks=[];transcriptText="";
 $("manualTranscript").value="";$("transcript").textContent="Fresh recording ready. Previous saved sessions are unchanged.";
 resetAnalysisDisplay();
 if(!stream||stream.getTracks().some(t=>t.readyState==="ended"))await enableCamera(true);
 else await showLivePreview();
 $("recordBtn").disabled=false;$("stopBtn").disabled=true;$("newRecordingBtn").hidden=true;
 $("status").textContent="Live camera restored. Start recording when ready.";
}
$("newRecordingBtn").onclick=()=>prepareNewRecording("new");
$("retryBtn").onclick=()=>prepareNewRecording("retry");
$("repeatBtn").onclick=()=>prepareNewRecording("retry");

function resetAnalysisDisplay(){
 ["mainIdeaCount","thoughtUnitCount","wordCount","wpm","fillerCount"].forEach(id=>$(id).textContent="0");
 $("structureScore").textContent="—";$("clauseLoad").textContent="—";$("pauseState").textContent="—";$("pauseSub").textContent="Not analyzed";
 $("suggestedBreaks").textContent="Analyze a transcript to see the hierarchy.";
 $("meaningLabel").textContent="Meaning";$("meaningNote").textContent="Analyze a transcript to evaluate organization.";
 $("deliveryLabel").textContent="Delivery";$("deliveryNote").textContent="Delivery feedback only uses audio signals when capture is reliable.";
 $("clarityLabel").textContent="Clarity";$("clarityNote").textContent="The analyzer distinguishes complete thoughts from grammatical fragments.";
 $("confidenceLabel").textContent="Analysis confidence";$("confidenceNote").textContent="Confidence will reflect the evidence available for this attempt.";
 $("retryBtn").disabled=true;
}

function countFillers(text){
 let low=" "+text.toLowerCase()+" ",n=0;
 for(const f of fillers){
   const e=f.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
   const m=low.match(new RegExp("\\b"+e+"\\b","g"));
   if(m)n+=m.length;
 }
 return n;
}

const continuationStart=/^(and|but|because|so|which|that|when|while|even though|even when|who|where|to|for|with|as|than)\b/i;
const weakEnding=/\b(a|an|the|to|for|with|of|and|but|because|that|which|who|when|while|even|my|your|their|his|her|our|being|feel|felt|may|can|could|would|should)$/i;

function rawUnits(text){
 let clean=text.replace(/\s+/g," ").trim();
 if(!clean)return[];
 // Strong punctuation first.
 let chunks=clean.split(/(?<=[.!?])\s+/).filter(Boolean);
 // Semantic markers as soft separators if punctuation is weak.
 let expanded=[];
 for(const c of chunks){
   let x=c.replace(/\s+(however|therefore|overall|ultimately|for example|for instance|the takeaway|what i learned|another reason|on the other hand)\s+/gi," || $1 ");
   expanded.push(...x.split(/\s*\|\|\s*/).filter(Boolean));
 }
 // Very long units can split on high-value conjunctions, but only if both sides have substance.
 let out=[];
 for(const c of expanded){
   const ws=words(c);
   if(ws.length<=24){out.push(c.trim());continue}
   const candidates=c.split(/\s+(?=(?:but|because|so|while|even though|even when)\b)/i).filter(Boolean);
   if(candidates.length>1 && candidates.every(x=>words(x).length>=6))out.push(...candidates.map(x=>x.trim()));
   else{
     for(let i=0;i<ws.length;i+=20)out.push(ws.slice(i,i+20).join(" "));
   }
 }
 return out;
}

function mergeFragments(units){
 let out=[];
 for(let u of units){
   u=u.trim(); if(!u)continue;
   const wc=words(u).length;
   if(!out.length){out.push(u);continue}
   const prev=out[out.length-1];
   const prevWords=words(prev).length;
   // Merge obvious grammatical continuations or tiny fragments.
   if(wc<7 || continuationStart.test(u) || weakEnding.test(prev) || prevWords<6){
     out[out.length-1]=prev+" "+u;
   }else out.push(u);
 }
 // second pass: if a remaining unit is suspiciously short, attach it to the nearer neighbor
 let final=[];
 for(let i=0;i<out.length;i++){
   const u=out[i],wc=words(u).length;
   if(wc<8 && final.length){final[final.length-1]+=" "+u}
   else final.push(u)
 }
 return final;
}

function thematicGroup(units){
 if(!units.length)return[];
 // Main ideas are larger groups. Heuristic target: ~18-35 words per group,
 // preserve explicit transition signals and avoid fragment-only groups.
 let groups=[],current=[];
 let currentWords=0;
 for(let i=0;i<units.length;i++){
   const u=units[i],uw=words(u).length;
   const explicit=/^(however|therefore|overall|ultimately|for example|for instance|another reason|what i learned|the takeaway)\b/i.test(u);
   if(current.length && (explicit || currentWords>=28)){
     groups.push(current);current=[];currentWords=0;
   }
   current.push(u);currentWords+=uw;
   if(currentWords>=38){groups.push(current);current=[];currentWords=0}
 }
 if(current.length)groups.push(current);
 // For short responses, avoid claiming too many "main ideas".
 if(groups.length>4 && words(units.join(" ")).length<120){
   const merged=[];
   for(let i=0;i<groups.length;i+=2)merged.push((groups[i]||[]).concat(groups[i+1]||[]));
   return merged;
 }
 return groups;
}

function structureSignals(groups,text){
 const low=text.toLowerCase();
 const direct=groups.length>=1;
 const support=groups.length>=2 || /\b(because|for example|for instance|reason|made me|taught me|result|can create)\b/.test(low);
 const takeaway=groups.length>=3 || /\b(ultimately|overall|what i learned|taught me|the takeaway|in the end|now i|made me realize)\b/.test(low);
 return {direct,support,takeaway,score:[direct,support,takeaway].filter(Boolean).length};
}

function pauseReliability(){
 const total=speechSamples+quietSamples;
 if(!audioCtx || total<40 || speechSamples<8)return {reliable:false,reason:"Unavailable",detail:"Insufficient audio timing data"};
 const speechRatio=speechSamples/total;
 if(speechRatio<.08 || speechRatio>.97)return {reliable:false,reason:"Unavailable",detail:"Audio boundary signal was not reliable"};
 // Zero pauses can be valid only when there is a reasonable amount of speech/quiet evidence.
 return {reliable:true,reason:String(pauseDurations.length),detail:pauseDurations.length?`Avg ${(pauseDurations.reduce((a,b)=>a+b,0)/pauseDurations.length).toFixed(1)}s`:"No ≥450ms pauses detected"};
}

function analyze(){
 const text=$("manualTranscript").value.trim();
 if(!text){$("status").textContent="Add a transcript first.";return null}
 const wc=words(text).length;
 const pace=Math.round(wc/(seconds?seconds/60:Math.max(wc/130,.5)));
 const fc=countFillers(text);
 const units=mergeFragments(rawUnits(text));
 const groups=thematicGroup(units);
 const signals=structureSignals(groups,text);
 const avgUnit=units.length?Math.round(units.reduce((a,u)=>a+words(u).length,0)/units.length):wc;
 const pr=pauseReliability();
 const avgPause=pr.reliable&&pauseDurations.length?pauseDurations.reduce((a,b)=>a+b,0)/pauseDurations.length:null;

 $("mainIdeaCount").textContent=groups.length;
 $("thoughtUnitCount").textContent=units.length;
 $("structureScore").textContent=`${signals.score}/3`;
 $("clauseLoad").textContent=avgUnit||"—";
 $("wordCount").textContent=wc;$("wpm").textContent=pace;$("fillerCount").textContent=fc;
 $("pauseState").textContent=pr.reason;$("pauseSub").textContent=pr.detail;

 if(signals.score===3){
   $("meaningLabel").textContent="Meaning: organized";
   $("meaningNote").textContent=`${groups.length} main idea${groups.length===1?"":"s"} supported by ${units.length} thought unit${units.length===1?"":"s"}. Organization signals are present.`;
 }else if(signals.score===2){
   $("meaningLabel").textContent="Meaning: mostly organized";
   $("meaningNote").textContent="The response has a point and support, but the takeaway could be made more explicit.";
 }else{
   $("meaningLabel").textContent="Meaning: weak progression";
   $("meaningNote").textContent="State the point first, then add one reason/example and a takeaway.";
 }

 if(!pr.reliable){
   $("deliveryLabel").textContent=`Delivery: ${pace} WPM`;
   $("deliveryNote").textContent="Pause timing was unavailable, so the app will not infer long gaps or hesitation from WPM alone.";
 }else if(pauseDurations.length && avgPause>1.5){
   $("deliveryLabel").textContent="Delivery: long transitions";
   $("deliveryNote").textContent=`${pace} WPM overall; reliable pause data found ${pauseDurations.length} pauses averaging ${avgPause.toFixed(1)}s.`;
 }else{
   $("deliveryLabel").textContent="Delivery: measured";
   $("deliveryNote").textContent=`${pace} WPM overall. Pause data was captured reliably; use it as one delivery signal, not a structure score.`;
 }

 if(avgUnit>22){
   $("clarityLabel").textContent="Clarity: clause-heavy";
   $("clarityNote").textContent=`Supporting thought units average about ${avgUnit} words. Finish one thought before adding another clause.`;
 }else if(units.length>1){
   $("clarityLabel").textContent="Clarity: segmented";
   $("clarityNote").textContent="The analyzer found complete supporting thoughts rather than treating every short fragment as a separate idea.";
 }else{
   $("clarityLabel").textContent="Clarity: continuous";
   $("clarityNote").textContent="The response reads as one extended unit. Add one deliberate conceptual boundary.";
 }

 const semanticConfidence=text.length>25 && units.length>=1 ? "High" : "Moderate";
 const deliveryConfidence=pr.reliable?"High":"Low";
 $("confidenceLabel").textContent=`Analysis confidence: meaning ${semanticConfidence.toLowerCase()}, delivery ${deliveryConfidence.toLowerCase()}`;
 $("confidenceNote").textContent=pr.reliable
   ?"Meaning and audio-boundary evidence were both available."
   :"Semantic organization is available, but delivery coaching is intentionally limited because pause capture was unreliable.";

 $("suggestedBreaks").innerHTML=groups.map((g,i)=>`
   <div class="main-idea">
     <strong>Main idea ${i+1}</strong>
     ${g.map((u,j)=>`<div class="unit"><small>Supporting thought ${j+1}</small>${esc(u)}</div>`).join("")}
   </div>`).join("");

 let title,target;
 if(signals.score<3){
   title="Make the takeaway explicit.";
   target="Keep the point and support, then finish with one sentence stating what changed, mattered, or was learned.";
 }else if(avgUnit>22){
   title="Reduce clause stacking.";
   target="Keep the same main ideas, but complete one supporting thought before starting the next.";
 }else if(pr.reliable && pauseDurations.length && avgPause>1.5){
   title="Keep the structure; shorten transition pauses.";
   target=`Preserve the ${groups.length}-idea organization while making transitions quicker.`;
 }else{
   title="Preserve the organization and increase natural flow.";
   target=`Keep the same ${groups.length} main idea${groups.length===1?"":"s"} while making the delivery feel conversational.`;
 }
 $("targetTitle").textContent=title;$("targetText").textContent=target;$("nextFocus").value=title;
 $("retryBtn").disabled=false;

 lastAnalysis={wc,pace,fc,units,groups,signals,avgUnit,pauseReliable:pr.reliable,pauseCount:pr.reliable?pauseDurations.length:null,avgPause,target};
 return lastAnalysis;
}
$("analyzeBtn").onclick=analyze;
$("manualTranscript").oninput=()=>{$("transcript").textContent=$("manualTranscript").value||"Transcript will appear here."};

["clarity","pacing","confidence","structure"].forEach(id=>$(id).oninput=()=>$(id+"Val").textContent=$(id).value);
function scores(){return{clarity:+$("clarity").value,pacing:+$("pacing").value,confidence:+$("confidence").value,structure:+$("structure").value}}

$("saveSessionBtn").onclick=()=>{
 const a=analyze()||{wc:0,pace:0,fc:0,units:[],groups:[],signals:{score:0},avgUnit:0,pauseReliable:false,pauseCount:null,avgPause:null,target:""};
 sessions.push({
   id:Date.now(),created:new Date().toISOString(),goal:$("goal").options[$("goal").selectedIndex].text,
   prompt:$("promptText").textContent,scores:scores(),notes:$("notes").value.trim(),next:$("nextFocus").value.trim(),
   duration:seconds,wordCount:a.wc,wpm:a.pace,fillers:a.fc,
   ideaCount:a.groups.length,mainIdeaCount:a.groups.length,thoughtUnitCount:a.units.length,
   autoStructure:a.signals.score,avgUnit:a.avgUnit,pauseReliable:a.pauseReliable,pauseCount:a.pauseCount,avgPause:a.avgPause,
   coachTarget:a.target,transcript:$("manualTranscript").value.trim(),stage:"2.2"
 });
 persist();render();$("status").textContent="Session saved locally on this device.";
};

function render(){
 $("sessionCount").textContent=`${sessions.length} saved session${sessions.length===1?"":"s"}`;
 const list=$("sessionList");list.innerHTML="";
 [...sessions].reverse().forEach((s,r)=>{
   const i=sessions.length-r,d=document.createElement("div");d.className="session";
   const ideas=s.mainIdeaCount??s.ideaCount;
   const units=s.thoughtUnitCount;
   d.innerHTML=`<b>Session ${i} · ${esc(s.goal)}</b><br>
   <small>${new Date(s.created).toLocaleDateString()} · Avg ${avg(s.scores)}/10 · ${s.wpm||0} WPM · ${s.fillers||0} fillers${ideas!=null?` · ${ideas} main ideas`:""}${units!=null?` · ${units} thought units`:""}</small>
   ${s.coachTarget?`<p><small><b>Coach target:</b> ${esc(s.coachTarget)}</small></p>`:""}`;
   list.appendChild(d);
 });
 const av=sessions.map(s=>+avg(s.scores));
 $("bestAvg").textContent=av.length?Math.max(...av).toFixed(1):"—";
 const wp=sessions.map(s=>s.wpm||0).filter(Boolean);
 $("avgWpm").textContent=wp.length?Math.round(wp.reduce((a,b)=>a+b,0)/wp.length):"—";
 $("avgFillers").textContent=sessions.length?(sessions.reduce((a,s)=>a+(s.fillers||0),0)/sessions.length).toFixed(1):"—";
 $("practiceTime").textContent=sessions.length?(sessions.reduce((a,s)=>a+(s.duration||0),0)/60).toFixed(1):"—";
 ["compareA","compareB"].forEach(id=>{
   const sel=$(id),cur=sel.value;sel.innerHTML='<option value="">Choose session</option>';
   sessions.forEach((s,i)=>{const o=document.createElement("option");o.value=s.id;o.textContent=`Session ${i+1}`;sel.appendChild(o)});
   sel.value=cur;
 });
 compare();
}
function compare(){
 const a=sessions.find(s=>String(s.id)===$("compareA").value),b=sessions.find(s=>String(s.id)===$("compareB").value),box=$("compareBox");
 if(!a||!b){box.innerHTML="";return}
 let rows=["clarity","pacing","confidence","structure"].map(k=>{
   const d=b.scores[k]-a.scores[k];
   return `<div class="r"><span>${k}: ${a.scores[k]}</span><span>${d>=0?"+":""}${d}</span><span>${b.scores[k]}</span></div>`;
 }).join("");
 const ai=a.mainIdeaCount??a.ideaCount??0,bi=b.mainIdeaCount??b.ideaCount??0;
 const iu=(b.thoughtUnitCount??0)-(a.thoughtUnitCount??0);
 rows+=`<div class="r"><span>WPM: ${a.wpm||0}</span><span>${(b.wpm||0)-(a.wpm||0)>=0?"+":""}${(b.wpm||0)-(a.wpm||0)}</span><span>${b.wpm||0}</span></div>`;
 rows+=`<div class="r"><span>Main ideas: ${ai}</span><span>${bi-ai>=0?"+":""}${bi-ai}</span><span>${bi}</span></div>`;
 if(a.thoughtUnitCount!=null||b.thoughtUnitCount!=null)rows+=`<div class="r"><span>Thought units: ${a.thoughtUnitCount??"—"}</span><span>${iu>=0?"+":""}${iu}</span><span>${b.thoughtUnitCount??"—"}</span></div>`;
 box.innerHTML=rows;
}
$("compareA").onchange=compare;$("compareB").onchange=compare;

document.querySelectorAll(".mobile-nav button").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.jump)?.scrollIntoView({behavior:"smooth",block:"start"}));

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
window.addEventListener("beforeunload",()=>{stopPauseMonitor();if(stream)stream.getTracks().forEach(t=>t.stop());if(blobUrl)URL.revokeObjectURL(blobUrl)});
render();
})();
