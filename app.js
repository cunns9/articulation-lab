
(()=>{const $=id=>document.getElementById(id),KEY="articulationLabSessionsV3";
let sessions;try{sessions=JSON.parse(localStorage.getItem(KEY)||"[]")}catch{sessions=[]}
let stream,recorder,chunks=[],blobUrl,seconds=0,timerId,recognition,recognizing=false,transcriptText="";
let audioCtx,analyser,source,monitorId,silenceStart=null,hasSpoken=false,pauseDurations=[],lastAnalysis=null;

const prompts=["Tell me about something you recently learned and why it mattered to you.","Describe a conversation that changed your perspective.","What is something people often overcomplicate?","Explain one idea from your field to someone outside it.","Tell me about a decision you made and what you learned from it."];
const followups=["What makes you say that?","Can you give a specific example?","What happened next?","Why does that matter?","Can you answer that more concisely?"];
const fillers=["um","uh","erm","like","you know","basically","actually","literally","kind of","sort of","i mean"];
const words=t=>(t.toLowerCase().match(/\b[\w’'-]+\b/g)||[]);
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const persist=()=>localStorage.setItem(KEY,JSON.stringify(sessions));
const avg=s=>(Object.values(s).reduce((a,b)=>a+b,0)/4).toFixed(1);

$("newPrompt").onclick=()=>{$("promptText").textContent=prompts[Math.floor(Math.random()*prompts.length)]};
$("followup").onclick=()=>{$("promptText").textContent="Follow-up: "+followups[Math.floor(Math.random()*followups.length)]};

async function enableCamera(){
 try{
  if(stream)stream.getTracks().forEach(t=>t.stop());
  stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
  restorePreview();$("cameraBtn").disabled=true;$("cameraBtn").textContent="Camera ready";$("recordBtn").disabled=false;$("status").textContent="Camera and microphone are ready.";
 }catch(e){$("status").textContent="Camera/microphone permission was not granted."}
}
$("cameraBtn").onclick=enableCamera;

function restorePreview(){
 const v=$("preview");if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}v.pause();v.removeAttribute("src");v.load();v.srcObject=stream;v.muted=true;v.controls=false;v.play().catch(()=>{});$("downloadBtn").disabled=true;
}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR){recognition=new SR();recognition.continuous=true;recognition.interimResults=true;recognition.lang="en-US";recognition.onresult=e=>{let f="",i="";for(let x=e.resultIndex;x<e.results.length;x++){let t=e.results[x][0].transcript;if(e.results[x].isFinal)f+=t+" ";else i+=t}if(f)transcriptText+=f;let all=(transcriptText+i).trim();$("transcript").textContent=all||"Listening…";$("manualTranscript").value=all};recognition.onend=()=>{if(recognizing)try{recognition.start()}catch{}}}

function startPauseMonitor(){
 pauseDurations=[];silenceStart=null;hasSpoken=false;
 try{
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();source=audioCtx.createMediaStreamSource(stream);analyser=audioCtx.createAnalyser();analyser.fftSize=1024;source.connect(analyser);let data=new Uint8Array(analyser.fftSize);
  monitorId=setInterval(()=>{analyser.getByteTimeDomainData(data);let sum=0;for(let x of data){let n=(x-128)/128;sum+=n*n}let rms=Math.sqrt(sum/data.length),now=performance.now(),speaking=rms>.028;
   if(speaking){hasSpoken=true;if(silenceStart!==null){let d=(now-silenceStart)/1000;if(d>=.45&&d<=5)pauseDurations.push(d);silenceStart=null}}
   else if(hasSpoken&&silenceStart===null)silenceStart=now;
  },100);
 }catch{}
}
function stopPauseMonitor(){clearInterval(monitorId);monitorId=null;try{source&&source.disconnect()}catch{};try{audioCtx&&audioCtx.close()}catch{};source=analyser=audioCtx=null;silenceStart=null}
const fmt=s=>`${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;

$("recordBtn").onclick=()=>{
 if(!stream)return;restorePreview();chunks=[];transcriptText="";lastAnalysis=null;$("attemptStatus").textContent="Recording";
 try{recorder=new MediaRecorder(stream)}catch(e){$("status").textContent="Recording is not supported.";return}
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
 recorder.onstop=()=>{stopPauseMonitor();let blob=new Blob(chunks,{type:recorder.mimeType||"video/webm"});blobUrl=URL.createObjectURL(blob);let v=$("preview");v.srcObject=null;v.src=blobUrl;v.muted=false;v.controls=true;$("downloadBtn").disabled=false;$("recordBtn").disabled=false;$("stopBtn").disabled=true;$("attemptStatus").textContent="Recorded";$("status").textContent="Recording complete. Analyze, diagnose, then retry if useful.";analyze()};
 recorder.start();startPauseMonitor();seconds=0;$("timer").textContent="00:00";timerId=setInterval(()=>{$("timer").textContent=fmt(++seconds)},1000);recognizing=!!recognition;if(recognition)try{recognition.start()}catch{};$("recordBtn").disabled=true;$("stopBtn").disabled=false;
};
$("stopBtn").onclick=()=>{if(recorder&&recorder.state!=="inactive")recorder.stop();clearInterval(timerId);recognizing=false;if(recognition)try{recognition.stop()}catch{}};
$("downloadBtn").onclick=()=>{if(!blobUrl)return;let a=document.createElement("a");a.href=blobUrl;a.download=`articulation-${new Date().toISOString().slice(0,10)}.webm`;a.click()};

function countFillers(text){let low=" "+text.toLowerCase()+" ",n=0;for(let f of fillers){let e=f.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");let m=low.match(new RegExp("\\b"+e+"\\b","g"));if(m)n+=m.length}return n}
function segment(text){
 let clean=text.replace(/\s+/g," ").trim();if(!clean)return[];
 let chunks=clean.split(/(?<=[.!?])\s+/).filter(Boolean);
 if(chunks.length===1){clean=clean.replace(/\s+(even when|because|but|however|so|therefore|for example|for instance|sharing|someone else|another reason|the reason|what i learned|ultimately|overall)\s+/gi," || $1 ");chunks=clean.split(/\s*\|\|\s*/).filter(Boolean)}
 let out=[];for(let c of chunks){let parts=c.split(/\s+(?=(?:and|but|because|so|while|when|even though|which|that)\b)/i).filter(Boolean);for(let p of parts){let w=p.trim().split(/\s+/);if(w.length<=18)out.push(p.trim());else for(let i=0;i<w.length;i+=16)out.push(w.slice(i,i+16).join(" "))}}
 let merged=[];for(let u of out){if(merged.length&&words(u).length<4)merged[merged.length-1]+=" "+u;else merged.push(u)}return merged.filter(u=>words(u).length>=3)
}
function structure(units,text){let low=text.toLowerCase(),point=units.length>=1,reason=/\b(because|reason|can create|leads to|means|sharing)\b/.test(low)||units.length>=2,insight=/\b(someone|for example|ultimately|overall|learned|interpret|result)\b/.test(low)||units.length>=3;return[point,reason,insight].filter(Boolean).length}
function analyze(){
 let text=$("manualTranscript").value.trim();if(!text){$("status").textContent="Add a transcript first.";return null}
 let wc=words(text).length,pace=Math.round(wc/(seconds?seconds/60:Math.max(wc/130,.5))),fc=countFillers(text),units=segment(text),score=structure(units,text),avgUnit=units.length?Math.round(units.reduce((a,u)=>a+words(u).length,0)/units.length):wc,pc=pauseDurations.length,avgp=pc?pauseDurations.reduce((a,b)=>a+b,0)/pc:0;
 $("wordCount").textContent=wc;$("wpm").textContent=pace;$("fillerCount").textContent=fc;$("ideaCount").textContent=units.length;$("pauseCount").textContent=pc;$("avgPause").textContent=pc?avgp.toFixed(1):"—";
 if(pc&&avgp>1.5){$("paceLabel").textContent="Pacing: long transitions";$("paceNote").textContent=`${pace} WPM overall; estimated pauses averaged ${avgp.toFixed(1)}s. Keep the boundaries, shorten the transitions.`}
 else if(pc){$("paceLabel").textContent="Pacing: segmented";$("paceNote").textContent=`${pace} WPM overall with ${pc} estimated pauses. WPM alone is not being treated as proof of long gaps.`}
 else{$("paceLabel").textContent=`Pacing: ${pace} WPM`;$("paceNote").textContent="No reliable pause events were captured. Treat WPM only as an overall rate."}
 $("fillerLabel").textContent=fc?"Filler words: detected":"Filler words: clean";$("fillerNote").textContent=fc?`${fc} filler${fc===1?"":"s"} detected.`:"No common filler words detected.";
 $("structureLabel").textContent=`Structure: ${score}/3 signals`;$("structureNote").textContent=`${units.length} thought unit${units.length===1?"":"s"} detected. ${score===3?"Point → Reason → Insight progression is present.":score===2?"Meaningful progression is present; strengthen the final takeaway.":"Create clearer conceptual separation."}`;
 if(avgUnit>18){$("clarityLabel").textContent="Clarity: clause stacking";$("clarityNote").textContent=`Thought units average about ${avgUnit} words. Finish one idea before adding the next.`}
 else if(units.length>=2){$("clarityLabel").textContent="Clarity: segmented";$("clarityNote").textContent=`The transcript contains ${units.length} conceptual units even without reliable punctuation.`}
 else{$("clarityLabel").textContent="Clarity: continuous";$("clarityNote").textContent="The response reads as one extended thought. Add a deliberate thought boundary."}
 $("suggestedBreaks").innerHTML=units.map((u,i)=>`<div class="idea"><b>Idea ${i+1}</b><div>${esc(u)}</div>${i<units.length-1?'<span class="break">[ BREAK ]</span>':""}</div>`).join("");
 let title,target;if(units.length<2){title="Create one clear thought boundary.";target="State the point, pause briefly, then give the reason or example."}else if(pc&&avgp>1.5){title="Keep the structure; shorten the pauses.";target=`Preserve the ${units.length}-part structure while making transitions quicker.`}else if(avgUnit>18){title="Reduce clause stacking.";target="Finish one complete thought before adding the next clause."}else{title="Preserve the structure and increase natural flow.";target=`Repeat the response with the same ${units.length} thought units and conversational transitions.`}
 $("targetTitle").textContent=title;$("targetText").textContent=target;$("nextFocus").value=title;$("retryBtn").disabled=false;
 return lastAnalysis={wc,pace,fc,units,score,pc,avgp,target};
}
$("analyzeBtn").onclick=analyze;$("manualTranscript").oninput=()=>{$("transcript").textContent=$("manualTranscript").value||"Transcript will appear here."};

async function resetRecorder(){
 clearInterval(timerId);stopPauseMonitor();recognizing=false;if(recognition)try{recognition.stop()}catch{};seconds=0;$("timer").textContent="00:00";chunks=[];transcriptText="";$("manualTranscript").value="";$("transcript").textContent="New attempt ready. Saved history is preserved.";["wordCount","wpm","fillerCount","ideaCount","pauseCount"].forEach(id=>$(id).textContent="0");$("avgPause").textContent="—";$("suggestedBreaks").textContent="Record the new attempt, then analyze it.";$("attemptStatus").textContent="Retry ready";$("stopBtn").disabled=true;if(!stream||stream.getTracks().some(t=>t.readyState==="ended"))await enableCamera();else restorePreview();$("recordBtn").disabled=false;$("status").textContent="Recorder reset. Start the next attempt without refreshing.";
}
$("retryBtn").onclick=resetRecorder;$("repeatBtn").onclick=resetRecorder;

["clarity","pacing","confidence","structure"].forEach(id=>$(id).oninput=()=>$(id+"Val").textContent=$(id).value);
function scores(){return{clarity:+$("clarity").value,pacing:+$("pacing").value,confidence:+$("confidence").value,structure:+$("structure").value}}
$("saveSessionBtn").onclick=()=>{let a=analyze()||{wc:0,pace:0,fc:0,units:[],score:0,pc:0,avgp:0,target:""};sessions.push({id:Date.now(),created:new Date().toISOString(),goal:$("goal").value,prompt:$("promptText").textContent,scores:scores(),notes:$("notes").value,next:$("nextFocus").value,duration:seconds,wordCount:a.wc,wpm:a.pace,fillers:a.fc,ideaCount:a.units.length,pauseCount:a.pc,avgPause:a.avgp,autoStructure:a.score,coachTarget:a.target,transcript:$("manualTranscript").value});persist();render();$("status").textContent="Session saved locally on this device."};

function render(){
 $("sessionCount").textContent=`${sessions.length} saved session${sessions.length===1?"":"s"}`;
 let list=$("sessionList");list.innerHTML="";[...sessions].reverse().forEach((s,r)=>{let i=sessions.length-r,d=document.createElement("div");d.className="session";d.innerHTML=`<b>Session ${i} · ${esc(s.goal)}</b><br><small>${new Date(s.created).toLocaleDateString()} · Avg ${avg(s.scores)}/10 · ${s.wpm||0} WPM · ${s.fillers||0} fillers · ${s.ideaCount??"—"} ideas</small>${s.coachTarget?`<p><small><b>Coach target:</b> ${esc(s.coachTarget)}</small></p>`:""}`;list.appendChild(d)});
 let av=sessions.map(s=>+avg(s.scores));$("bestAvg").textContent=av.length?Math.max(...av).toFixed(1):"—";let wp=sessions.map(s=>s.wpm||0).filter(Boolean);$("avgWpm").textContent=wp.length?Math.round(wp.reduce((a,b)=>a+b,0)/wp.length):"—";$("avgFillers").textContent=sessions.length?(sessions.reduce((a,s)=>a+(s.fillers||0),0)/sessions.length).toFixed(1):"—";$("practiceTime").textContent=sessions.length?(sessions.reduce((a,s)=>a+(s.duration||0),0)/60).toFixed(1):"—";
 ["compareA","compareB"].forEach(id=>{let sel=$(id),cur=sel.value;sel.innerHTML='<option value="">Choose session</option>';sessions.forEach((s,i)=>{let o=document.createElement("option");o.value=s.id;o.textContent=`Session ${i+1}`;sel.appendChild(o)});sel.value=cur});
 compare()
}
function compare(){let a=sessions.find(s=>String(s.id)===$("compareA").value),b=sessions.find(s=>String(s.id)===$("compareB").value),box=$("compareBox");if(!a||!b){box.innerHTML="";return}let rows=["clarity","pacing","confidence","structure"].map(k=>{let d=b.scores[k]-a.scores[k];return`<div class="r"><span>${k}: ${a.scores[k]}</span><span>${d>=0?"+":""}${d}</span><span>${b.scores[k]}</span></div>`}).join("");let id=(b.ideaCount||0)-(a.ideaCount||0),pd=(b.pauseCount||0)-(a.pauseCount||0);box.innerHTML=rows+`<div class="r"><span>WPM: ${a.wpm||0}</span><span>${(b.wpm||0)-(a.wpm||0)>=0?"+":""}${(b.wpm||0)-(a.wpm||0)}</span><span>${b.wpm||0}</span></div><div class="r"><span>Ideas: ${a.ideaCount||0}</span><span>${id>=0?"+":""}${id}</span><span>${b.ideaCount||0}</span></div><div class="r"><span>Pauses: ${a.pauseCount||0}</span><span>${pd>=0?"+":""}${pd}</span><span>${b.pauseCount||0}</span></div>`}
$("compareA").onchange=compare;$("compareB").onchange=compare;
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
window.addEventListener("beforeunload",()=>{stopPauseMonitor();if(stream)stream.getTracks().forEach(t=>t.stop());if(blobUrl)URL.revokeObjectURL(blobUrl)});
render();
})();