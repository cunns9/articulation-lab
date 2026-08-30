(() => {
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "articulationLabSessionsV3";
  let deferredInstallPrompt = null;

  const banks = {
    conversation:{
      easy:["What is something small that made your week better?","What is one thing you enjoy doing when you have free time?","Describe a meal you enjoy making and why."],
      medium:["Tell me about something you recently learned and why it mattered to you.","Describe a conversation that made you think differently.","What is one routine that makes your life easier, and how did you develop it?"],
      hard:["Someone you just met says, “Tell me something interesting about yourself.” Respond naturally without listing your résumé.","Keep a conversation going after someone tells you they had a difficult week. Show curiosity without interrogating them.","Explain a personal preference in a way that invites the other person to share theirs."]
    },
    storytelling:{
      easy:["Tell a short story about a time something unexpectedly worked out.","Describe a memorable moment from your week using a beginning, middle, and end.","Tell a story about learning something for the first time."],
      medium:["Tell a story about a mistake that taught you something useful. Make the turning point obvious.","Describe a moment when your first impression changed.","Tell a two-minute story in which one small decision had a larger effect."],
      hard:["Tell a story about a conflict without making yourself or the other person the villain.","Describe a setback in a way that is engaging, specific, and ends with a meaningful takeaway.","Tell a story using one vivid detail, one moment of tension, and one concise reflection."]
    },
    professional:{
      easy:["Introduce yourself professionally in under one minute.","Explain what you are studying or working on to someone outside your field.","Describe one strength you bring to a team and support it with an example."],
      medium:["Answer: “Tell me about a project you are proud of.” Use situation, action, and result.","Explain a difficult decision you made at work or school and how you approached it.","Give a concise update on a project that is behind schedule without sounding defensive."],
      hard:["A manager challenges your recommendation in a meeting. Defend your reasoning calmly while remaining open to new evidence.","Pitch an idea in 90 seconds to someone who is skeptical and short on time.","Explain a technical insight to an executive who cares about business impact, not methodology."]
    },
    impromptu:{
      easy:["Would you rather have more time or more money? Explain your answer.","What makes a day feel productive to you?","What is one skill everyone should learn?"],
      medium:["What is something people often overcomplicate?","Is consistency more important than motivation? Defend your answer.","What is one belief you have changed your mind about?"],
      hard:["Should convenience ever be sacrificed for quality? Build a balanced argument.","What is the difference between being busy and being effective?","If you could redesign one everyday system, what would you change and why?"]
    },
    persuasion:{
      easy:["Convince someone to try a habit that has helped you.","Persuade a friend to visit a place you enjoy.","Argue for or against keeping notifications turned off."],
      medium:["Make the case for why recovery time should be scheduled deliberately.","Persuade a skeptical audience that clear communication is a practical career skill.","Argue for one change that would make meetings more useful."],
      hard:["Take a position, acknowledge the strongest opposing argument, then defend your view.","Persuade someone to change a routine they are emotionally attached to.","Make a recommendation where every available option has a meaningful tradeoff."]
    },
    explain:{
      easy:["Explain a concept you know well as if you were talking to a curious teenager.","Explain how to complete a task you do often without skipping steps.","Define a term from your field without using jargon."],
      medium:["Explain correlation versus causation using a real-world example.","Explain how a recommendation system works to someone with no technical background.","Explain a process using only three main points and one example."],
      hard:["Explain a technical concept first to a beginner, then restate it for an expert audience.","Explain a complicated idea without using filler phrases or more than one analogy.","Explain why a metric can be technically correct but still misleading for a business decision."]
    }
  };

  const hints = {
    natural:"Speak as if one person asked you the question. Do not perform.",
    concise:"Lead with the answer → add 1–2 supporting points → finish cleanly.",
    confident:"Reduce qualifiers. State your point before explaining it.",
    warm:"Use one specific detail and leave the listener a natural opening to respond."
  };

  const followups = [
    "What makes you say that?","Can you give a specific example?","What happened next?",
    "What did you learn from that?","What would someone who disagrees with you say?",
    "Why does that matter?","What would you do differently now?","Can you make that answer more concise?"
  ];

  const fillers = ["um","uh","erm","like","you know","basically","actually","literally","kind of","sort of","i mean"];

  let stream=null, recorder=null, chunks=[], blobUrl=null, seconds=0, timerId=null;
  let recognition=null, recognizing=false, transcriptText="";
  let sessions = loadSessions();

  function loadSessions(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  }
  function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); }
  function rand(a){ return a[Math.floor(Math.random()*a.length)] }
  function currentPrompt(){ return $("promptText").textContent.replace(/^Follow-up:\s*/,""); }

  function generatePrompt(){
    const g=$("goal").value,d=$("difficulty").value;
    $("promptText").textContent=rand(banks[g][d]);
    $("promptHint").textContent=hints[$("tone").value];
  }

  $("generateBtn").addEventListener("click", generatePrompt);
  $("followupBtn").addEventListener("click",()=>{
    const lead = $("manualTranscript").value.trim();
    let f = rand(followups);
    if(lead && lead.split(/\s+/).length < 25) f = "Expand that answer with one concrete example. What happened, specifically?";
    $("promptText").textContent="Follow-up: "+f;
    $("promptHint").textContent="Respond directly. Avoid repeating your previous answer.";
  });
  $("harderBtn").addEventListener("click",()=>{
    const d=$("difficulty");
    d.value=d.value==="easy"?"medium":"hard";
    generatePrompt();
  });
  $("tone").addEventListener("change",()=> $("promptHint").textContent=hints[$("tone").value]);

  $("cameraBtn").addEventListener("click",async()=>{
    if(!navigator.mediaDevices?.getUserMedia){
      $("status").textContent="Camera recording is not supported in this browser context.";
      return;
    }
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
      $("preview").srcObject=stream;$("preview").controls=false;$("preview").muted=true;
      await $("preview").play();
      $("recordBtn").disabled=false;$("cameraBtn").disabled=true;$("cameraBtn").textContent="Camera ready";
      $("status").textContent="Camera and microphone are ready.";
    }catch(e){$("status").textContent="Camera/microphone permission was not granted."}
  });

  function setupRecognition(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR) return false;
    recognition=new SR();
    recognition.continuous=true; recognition.interimResults=true; recognition.lang="en-US";
    recognition.onresult=e=>{
      let finalChunk="", interim="";
      for(let i=e.resultIndex;i<e.results.length;i++){
        const text=e.results[i][0].transcript;
        if(e.results[i].isFinal) finalChunk+=text+" ";
        else interim+=text;
      }
      if(finalChunk) transcriptText += finalChunk;
      $("transcript").textContent=(transcriptText+interim).trim() || "Listening…";
      $("manualTranscript").value=(transcriptText+interim).trim();
    };
    recognition.onend=()=>{ if(recognizing){ try{recognition.start()}catch{} } };
    return true;
  }
  const recognitionAvailable=setupRecognition();

  function formatTime(s){
    const m=Math.floor(s/60).toString().padStart(2,"0");
    const sec=(s%60).toString().padStart(2,"0");
    return `${m}:${sec}`;
  }

  $("recordBtn").addEventListener("click",()=>{
    if(!stream) return;
    chunks=[]; transcriptText="";
    const opts=window.MediaRecorder?.isTypeSupported?.("video/webm;codecs=vp9,opus")?{mimeType:"video/webm;codecs=vp9,opus"}:undefined;
    try{recorder=new MediaRecorder(stream,opts)}catch{recorder=new MediaRecorder(stream)}
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    recorder.onstop=()=>{
      const blob=new Blob(chunks,{type:recorder.mimeType||"video/webm"});
      if(blobUrl)URL.revokeObjectURL(blobUrl);
      blobUrl=URL.createObjectURL(blob);
      $("preview").srcObject=null;$("preview").src=blobUrl;$("preview").muted=false;$("preview").controls=true;
      $("downloadBtn").disabled=false;$("recordBtn").disabled=false;$("stopBtn").disabled=true;
      $("status").textContent="Recording complete. Analyze the transcript, then review yourself.";
      analyzeTranscript();
    };
    recorder.start(); seconds=0;$("timer").textContent="00:00";$("timer").classList.add("recording");
    timerId=setInterval(()=>{
      seconds++;$("timer").textContent=formatTime(seconds);
      if(seconds===Number($("duration").value))$("status").textContent="Target time reached. Finish your thought cleanly.";
    },1000);

    if(recognitionAvailable){
      recognizing=true; try{recognition.start()}catch{}
    }else{
      $("transcript").textContent="Live speech recognition is unavailable in this browser. Record normally, then type or paste a transcript for analysis.";
    }
    $("recordBtn").disabled=true;$("stopBtn").disabled=false;$("downloadBtn").disabled=true;
    $("status").textContent="Recording… focus on your listener, not the camera.";
  });

  $("stopBtn").addEventListener("click",()=>{
    if(recorder&&recorder.state!=="inactive")recorder.stop();
    clearInterval(timerId);$("timer").classList.remove("recording");
    recognizing=false; if(recognition){try{recognition.stop()}catch{}}
  });

  $("downloadBtn").addEventListener("click",()=>{
    if(!blobUrl)return;
    const a=document.createElement("a");a.href=blobUrl;a.download=`articulation-${new Date().toISOString().slice(0,10)}.webm`;
    document.body.appendChild(a);a.click();a.remove();
  });

  function words(text){return (text.toLowerCase().match(/\b[\w’'-]+\b/g)||[])}

  function countFillers(text){
    let total=0; const low=" "+text.toLowerCase()+" ";
    fillers.forEach(f=>{
      const escaped=f.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const matches=low.match(new RegExp("\\b"+escaped+"\\b","g"));
      if(matches) total+=matches.length;
    });
    return total;
  }

  function repeatedPhrases(text){
    const w=words(text), counts={};
    for(let i=0;i<w.length-2;i++){
      const p=w.slice(i,i+3).join(" ");
      counts[p]=(counts[p]||0)+1;
    }
    return Object.entries(counts).filter(([,v])=>v>=3).sort((a,b)=>b[1]-a[1]).slice(0,3);
  }

  function analyzeTranscript(){
    const text=$("manualTranscript").value.trim();
    if(!text){
      $("status").textContent="Add a transcript first, then analyze it.";
      return;
    }
    const wc=words(text).length;
    const mins=seconds>0?seconds/60:Math.max(wc/130,0.5);
    const pace=Math.round(wc/mins);
    const fc=countFillers(text);
    const sentences=text.split(/[.!?]+/).map(s=>s.trim()).filter(Boolean);
    const avg=sentences.length?Math.round(wc/sentences.length):wc;

    $("wordCount").textContent=wc;$("wpm").textContent=pace;$("fillerCount").textContent=fc;$("sentenceLen").textContent=avg;

    if(pace<105){$("paceLabel").textContent="Pacing: slow";$("paceNote").textContent="You may be leaving long gaps. Aim for roughly 110–160 WPM for conversational delivery."}
    else if(pace>175){$("paceLabel").textContent="Pacing: fast";$("paceNote").textContent="You may be rushing. Add deliberate pauses after key points."}
    else{$("paceLabel").textContent="Pacing: controlled";$("paceNote").textContent="Your estimated pace is within a generally comfortable conversational range."}

    const fillerRate=wc?Math.round((fc/wc)*100):0;
    if(fc===0){$("fillerLabel").textContent="Filler words: clean";$("fillerNote").textContent="No common filler words detected."}
    else if(fillerRate<=2){$("fillerLabel").textContent="Filler words: light";$("fillerNote").textContent=`${fc} detected, about ${fillerRate}% of your words.`}
    else{$("fillerLabel").textContent="Filler words: noticeable";$("fillerNote").textContent=`${fc} detected. Replace fillers with a short silent pause.`}

    const lower=text.toLowerCase();
    const opening=/^(i think|i believe|my answer|the main|one thing|yes|no|for me|in my view|the reason)/.test(lower);
    const support=/\b(for example|for instance|because|specifically|one reason|another reason|this happened|such as)\b/.test(lower);
    const conclusion=/\b(so|overall|ultimately|that is why|because of that|in the end|the takeaway|what i learned)\b/.test(lower);
    const structureScore=[opening,support,conclusion].filter(Boolean).length;
    $("structureLabel").textContent=`Structure: ${structureScore}/3 signals`;
    $("structureNote").textContent=structureScore===3?"Clear answer, support, and ending signals detected.":structureScore===2?"Mostly structured. Strengthen either the opening or conclusion.":"Try a simple frame: answer → example/reason → takeaway.";

    const reps=repeatedPhrases(text);
    if(avg>28){$("clarityLabel").textContent="Clarity: dense";$("clarityNote").textContent="Your average sentence is long. Break complex thoughts into shorter units."}
    else if(reps.length){$("clarityLabel").textContent="Clarity: repetitive";$("clarityNote").textContent=`Repeated phrase detected: “${reps[0][0]}”. Tighten repeated ideas.`}
    else{$("clarityLabel").textContent="Clarity: readable";$("clarityNote").textContent="Sentence length and repetition look reasonably controlled."}

    return {wc,pace,fc,avg,structureScore};
  }

  $("analyzeBtn").addEventListener("click",analyzeTranscript);
  $("manualTranscript").addEventListener("input",()=>{$("transcript").textContent=$("manualTranscript").value||"Transcript will appear here.";});

  ["clarity","pacing","confidence","structure"].forEach(id=>{
    $(id).addEventListener("input",()=>$(id+"Val").textContent=$(id).value);
  });

  $("resetScoresBtn").addEventListener("click",()=>{
    ["clarity","pacing","confidence","structure"].forEach(id=>{$(id).value=5;$(id+"Val").textContent="5"});
    $("notes").value="";$("nextFocus").value="";
  });

  $("repeatBtn").addEventListener("click",()=>{
    $("notes").value="";$("nextFocus").value="";$("manualTranscript").value="";
    $("transcript").textContent="Transcript cleared. Repeat the same prompt and deliberately correct one thing.";
    $("status").textContent="Repeat round ready. Keep the same prompt.";
    $("wordCount").textContent="0";$("wpm").textContent="0";$("fillerCount").textContent="0";$("sentenceLen").textContent="0";
  });

  function scoreObj(){
    return {clarity:+$("clarity").value,pacing:+$("pacing").value,confidence:+$("confidence").value,structure:+$("structure").value};
  }
  function average(s){return (Object.values(s).reduce((a,b)=>a+b,0)/4).toFixed(1)}

  $("saveSessionBtn").addEventListener("click",()=>{
    const auto=analyzeTranscript()||{wc:0,pace:0,fc:0,avg:0,structureScore:0};
    sessions.push({
      id:Date.now(),created:new Date().toISOString(),goal:$("goal").options[$("goal").selectedIndex].text,
      prompt:currentPrompt(),scores:scoreObj(),notes:$("notes").value.trim(),next:$("nextFocus").value.trim(),
      duration:seconds,wordCount:auto.wc,wpm:auto.pace,fillers:auto.fc,autoStructure:auto.structureScore,
      transcript:$("manualTranscript").value.trim()
    });
    persist();renderAll();$("status").textContent="Session saved locally on this device.";
  });

  function esc(str){return String(str||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

  function renderSessions(){
    $("sessionCount").textContent=`${sessions.length} saved session${sessions.length===1?"":"s"}`;
    const list=$("sessionList");list.innerHTML="";
    if(!sessions.length) list.innerHTML='<div class="micro">No saved sessions yet.</div>';
    [...sessions].reverse().forEach((s,ri)=>{
      const index=sessions.length-ri, div=document.createElement("div");div.className="session";
      div.innerHTML=`<div class="session-top"><div><div class="session-title">Session ${index} · ${esc(s.goal)}</div>
      <div class="session-meta">${new Date(s.created).toLocaleDateString()} · Avg ${average(s.scores)}/10 · ${s.wpm||0} WPM · ${s.fillers||0} fillers</div></div></div>
      <div class="scores"><span class="pill">Clarity ${s.scores.clarity}</span><span class="pill">Pacing ${s.scores.pacing}</span><span class="pill">Confidence ${s.scores.confidence}</span><span class="pill">Structure ${s.scores.structure}</span></div>
      ${s.next?`<div class="session-meta"><strong>Next focus:</strong> ${esc(s.next)}</div>`:""}`;
      list.appendChild(div);
    });
    ["compareA","compareB"].forEach(id=>{
      const sel=$(id),cur=sel.value;sel.innerHTML='<option value="">Choose session</option>';
      sessions.forEach((s,i)=>{const o=document.createElement("option");o.value=s.id;o.textContent=`Session ${i+1} — ${s.goal}`;sel.appendChild(o)});
      sel.value=cur;
    });
  }

  function renderDashboard(){
    const avgs=sessions.map(s=>+average(s.scores));
    $("bestAvg").textContent=avgs.length?Math.max(...avgs).toFixed(1):"—";
    const wpms=sessions.map(s=>s.wpm||0).filter(Boolean);
    $("avgWpm").textContent=wpms.length?Math.round(wpms.reduce((a,b)=>a+b,0)/wpms.length):"—";
    $("avgFillers").textContent=sessions.length?(sessions.reduce((a,s)=>a+(s.fillers||0),0)/sessions.length).toFixed(1):"—";
    $("practiceTime").textContent=sessions.length?(sessions.reduce((a,s)=>a+(s.duration||0),0)/60).toFixed(1):"—";
    drawChart(avgs);
  }

  function drawChart(vals){
    const svg=$("trendChart");svg.innerHTML="";
    const W=640,H=240,p=34,ns="http://www.w3.org/2000/svg";
    const line=(x1,y1,x2,y2,stroke="#d5d0c7",width=1)=>{
      const e=document.createElementNS(ns,"line");
      Object.entries({x1,y1,x2,y2,stroke,"stroke-width":width}).forEach(([k,v])=>e.setAttribute(k,v));
      svg.appendChild(e);
    };
    [0,2.5,5,7.5,10].forEach(v=>{
      const y=H-p-(v/10)*(H-2*p);line(p,y,W-p,y);
      const t=document.createElementNS(ns,"text");t.setAttribute("x",5);t.setAttribute("y",y+4);t.setAttribute("font-size","11");t.setAttribute("fill","#706d66");t.textContent=v;svg.appendChild(t);
    });
    if(vals.length===0){
      const t=document.createElementNS(ns,"text");t.setAttribute("x",W/2);t.setAttribute("y",H/2);t.setAttribute("text-anchor","middle");t.setAttribute("fill","#706d66");t.textContent="Save sessions to build your trend.";svg.appendChild(t);return;
    }
    const step=vals.length===1?0:(W-2*p)/(vals.length-1);
    const pts=vals.map((v,i)=>[p+i*step,H-p-(v/10)*(H-2*p)]);
    if(vals.length>1){
      const path=document.createElementNS(ns,"path");path.setAttribute("d","M "+pts.map(pt=>pt.join(" ")).join(" L "));
      path.setAttribute("fill","none");path.setAttribute("stroke","#1f5f50");path.setAttribute("stroke-width","4");path.setAttribute("stroke-linecap","round");path.setAttribute("stroke-linejoin","round");svg.appendChild(path);
    }
    pts.forEach(([x,y],i)=>{
      const c=document.createElementNS(ns,"circle");c.setAttribute("cx",x);c.setAttribute("cy",y);c.setAttribute("r","6");c.setAttribute("fill","#1f5f50");svg.appendChild(c);
      const t=document.createElementNS(ns,"text");t.setAttribute("x",x);t.setAttribute("y",H-10);t.setAttribute("text-anchor","middle");t.setAttribute("font-size","10");t.setAttribute("fill","#706d66");t.textContent=i+1;svg.appendChild(t);
    });
  }

  function renderComparison(){
    const a=sessions.find(s=>String(s.id)===$("compareA").value);
    const b=sessions.find(s=>String(s.id)===$("compareB").value);
    const box=$("compareBox");
    if(!a||!b||a.id===b.id){box.classList.remove("show");box.innerHTML="";return}
    const rows=["clarity","pacing","confidence","structure"].map(m=>{
      const d=b.scores[m]-a.scores[m],sign=d>0?"+":"";
      return `<div class="compare-row"><span>${m[0].toUpperCase()+m.slice(1)}: ${a.scores[m]}</span><span class="delta">${sign}${d}</span><span style="text-align:right">${b.scores[m]}</span></div>`;
    }).join("");
    box.innerHTML=`<strong>Self-review change</strong>${rows}
      <div class="compare-row"><span>WPM: ${a.wpm||0}</span><span class="delta">${(b.wpm||0)-(a.wpm||0)>=0?"+":""}${(b.wpm||0)-(a.wpm||0)}</span><span style="text-align:right">${b.wpm||0}</span></div>
      <div class="compare-row"><span>Fillers: ${a.fillers||0}</span><span class="delta">${(b.fillers||0)-(a.fillers||0)>=0?"+":""}${(b.fillers||0)-(a.fillers||0)}</span><span style="text-align:right">${b.fillers||0}</span></div>`;
    box.classList.add("show");
  }

  function renderAll(){renderSessions();renderDashboard();renderComparison()}
  $("compareA").addEventListener("change",renderComparison);
  $("compareB").addEventListener("change",renderComparison);

  $("clearHistoryBtn").addEventListener("click",()=>{
    if(confirm("Clear all saved articulation sessions from this browser?")){
      sessions=[];persist();renderAll();
    }
  });

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("installBtn").hidden = false;
  });

  $("installBtn").addEventListener("click", async () => {
    if(!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installBtn").hidden = true;
  });

  window.addEventListener("appinstalled",()=>{
    $("pwaNote").innerHTML="<strong>Installed.</strong><span>Articulation Lab is now available from your device like an app.</span>";
  });

  if("serviceWorker" in navigator){
    window.addEventListener("load",()=> navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }

  window.addEventListener("beforeunload",()=>{
    if(stream)stream.getTracks().forEach(t=>t.stop());
    if(blobUrl)URL.revokeObjectURL(blobUrl);
  });

  renderAll();
})();
