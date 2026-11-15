import { ARENA, INPUT } from "../config";
import { state } from "../state";
import { startCamera, video, listCameras, applyMirror } from "./camera";
import { onInput, SYMBOLS, type Pt, type InputEvent } from "./events";
import { cancelHandStroke, initHandTracker, pinchEngine, observationListeners, inferenceMs, processObservation, setReplaying, replaying } from "./handTracker";
import { calibrationRatio, calibratePinch, experiment, type Observation } from "./pinchExperiment";
import { recognizer } from "./castPipeline";
import { measureLine, type LineMetrics } from "./recognizer";
import "./pinchLab.css";

export function initPinchLab() {
  document.body.classList.add("pinch-lab");
  state.spellRunesEnabled=true;
  state.spellGesturesEnabled=true;
  state.spellCastingActive=false;
  experiment.variant = experiment.variant === "E" || experiment.variant === "F" ? "E" : "C";
  state.drawBox = {x0:.14,y0:.125,x1:.86,y1:.665};
  document.getElementById("gate")!.classList.add("hidden");
  const host = document.createElement("section");
  host.id = "lab";
  host.innerHTML = `<header><strong>SPELLCAM / Input lab</strong><a href="/">Back to game</a></header>
    <table class="lab-symbols" aria-label="Castable symbols and spell starter"><thead><tr><th>Draw</th><th>Horizontal</th><th>Vertical</th><th>Vee</th><th>Caret</th><th>Circle</th><th>Zigzag</th><th>Infinity (legacy)</th><th>Spell starter</th></tr></thead><tbody><tr><th>Shape</th><td>&#8212;</td><td>|</td><td>V</td><td>&#8743;</td><td>O</td><td>W / M</td><td>∞</td><td>👍</td></tr><tr><th>Log name</th>${SYMBOLS.map(s=>`<td>${s}</td>`).join("")}<td>infinity</td><td>thumbs_up</td></tr></tbody></table>
    <div class="lab-layout"><aside>
      <h2>Pinch experiments</h2><p>Pinch, draw, then open your fingers to commit. No monsters or timers.</p>
      <button id="lab-save">Save settings as local defaults</button><p id="lab-save-status" role="status">Saves to config/pinch.local.json on this dev server.</p>
      <h3>Thumbs-up spell starter</h3>
      <label>Thumbs-up confidence threshold<input id="lab-thumb-threshold" type="number" min="0.01" max="1" step="0.01"></label>
      <label>Thumbs-up hold time (ms)<input id="lab-thumb-hold" type="number" min="0" max="3000" step="1"></label>
      <progress id="lab-thumb-progress" max="1" value="0" style="width:100%"></progress>
      <p id="lab-thumb-status" role="status">Waiting for thumbs up.</p>
      <p>Triggers when the hold completes; no release needed. Confidence dips up to 120 ms pause progress. The original thumbs-up hold stays reserved until you release it, so it cannot count as an ASL letter. After release, later gesture classifications cannot interrupt the active spell.</p>
      <label><input id="lab-min-length" type="checkbox"> Require minimum stroke length (40 game pixels)</label>
      <label><input id="lab-min-points" type="checkbox"> Require minimum point count (8 captured points)</label>
      <p>With both checks off, recognition still requires at least 2 points.</p>
      <label>Symbol acceptance threshold<input id="lab-recognition-threshold" type="number" min="0" max="1" step="0.01"></label>
      <label>Wanted-symbol threshold (gameplay)<input id="lab-wanted-threshold" type="number" min="0" max="1" step="0.01"></label>
      <h3>Line recognition</h3>
      <label>Minimum straightness<input id="lab-lineStraightness" type="number" min="0" max="1" step="0.01"></label>
      <label>Maximum thinness<input id="lab-lineThinness" type="number" min="0" max="1" step="0.01"></label>
      <label>Angle tolerance (degrees)<input id="lab-lineAngleTolerance" type="number" min="0" max="45" step="1"></label>
      <label>Wanted-line angle tolerance (degrees)<input id="lab-lineAngleToleranceWanted" type="number" min="0" max="90" step="1"></label>
      <p>Lower straightness or higher thinness allows more hooked lines, but can make bent symbols look like lines. Wanted angle applies when only horizontal or vertical is needed; both wanted uses 45°.</p>
      <p>Template similarity, not probability. Higher is stricter. Wanted symbols must also be within 0.08 of the best match. Straight lines use geometric rules. Point count and path-length checks are optional; the debug thumbnail resamples to 64 points.</p>
      <label>Start ratio (close below)<input id="lab-start-ratio" type="number" min="0.05" max="0.40" step="0.001"></label>
      <label>End ratio (open above)<input id="lab-end-ratio" type="number" min="0.15" max="0.85" step="0.001"></label>
      <label>Minimum hysteresis gap<input id="lab-hysteresis-gap" type="number" min="0.01" max="0.30" step="0.001"></label>
      <p>The actual hysteresis band is End minus Start. This minimum gap limits how low End can go, including speed assistance. A smaller gap allows easier release but may make pinch state less stable.</p>
      <label><input id="lab-use3d" type="checkbox"> Use 3D distances</label>
      <p>Uses 3D tip distance divided by 3D hand size as the primary pinch signal. Timing, buffering, and speed assistance stay the same. Re-sample poses after changing distance mode.</p>
      <label><input id="lab-depth-veto" type="checkbox"> Use 3D depth veto</label>
      <p>When on, a 3D tip-distance ratio above 0.5 can override an apparent 2D pinch. When off, pinch detection uses only the 2D ratio; 3D measurements remain visible.</p>
      <label><input id="lab-speed-assist" type="checkbox"> Low-speed release assistance</label>
      <label>Speed assistance range (+/- ratio)<input id="lab-speed-range" type="number" min="0" max="0.30" step="0.01"></label>
      <p>Range 0.08 means up to -0.08 at rest and +0.08 at 2 hand lengths/second or faster. Start/End safety limits still apply. Zero disables the adjustment; opening evidence and End confirmation remain required.</p>
      <label>Timing units<select id="lab-timing"><option value="time">Milliseconds</option><option value="frames">Processed camera frames</option></select></label>
      <label>Begin confirmation<input id="lab-begin" type="number" min="0" max="1000" step="1"></label>
      <label>End confirmation<input id="lab-end" type="number" min="0" max="1000" step="1"></label>
      <label><input id="lab-buffered" type="checkbox"> Buffered segmentation</label>
      <details><summary>How buffering works</summary><p>Keep 750 ms of timestamped positions and pinch ratios. After a close is confirmed, recover up to 80 ms before the closing evidence, using samples below the open threshold. A rising ratio above close + 0.10, with a rise over 0.06 in one observation, can propose an opening before the normal open threshold. It must still satisfy End confirmation. Cut the stroke back to the first opening sample, then recognize it once. Tracking loss has its own 300 ms grace; gaps over 200 ms terminate the segment. Consumed samples cannot cast again. Previews never commit.</p><p>Buffering off uses the same confirmation controls without prefix recovery or the opening-trend rule. Legacy F additionally compares up to nine slightly trimmed endpoints against templates after release; it is not enabled by this toggle.</p></details>
      <label>Cursor anchor<select id="lab-anchor"><option value="knuckle">Index knuckle</option><option value="tip">Index fingertip</option><option value="thumb">Thumb tip</option><option value="pinch">Thumb/index midpoint</option></select></label>
      <p><a id="lab-game" href="/">Test these settings in the game</a></p>
      <label>Camera<select id="lab-camera"></select></label><button id="lab-retry-camera" hidden>Retry camera</button>
      <label><input id="lab-mirror" type="checkbox" checked> Mirror camera</label>
      <h3>Personal pinch calibration</h3><p>Sampling starts immediately when clicked and collects 2 seconds of tracked thumb/index distance relative to hand size. Hold the requested pose steady. Each button replaces the previous samples for that pose. Apply calibration uses both sets for the current setup, with buffering either on or off.</p>
      <button id="lab-closed">Sample closed pinch</button><button id="lab-open">Sample open hand</button><button id="lab-calibrate">Apply calibration</button><button id="lab-default">Reset thresholds</button>
      <div id="lab-sampling" role="status" class="lab-sampling"><strong id="lab-sample-state">No pose sampling yet</strong><progress id="lab-sample-progress" max="2000" value="0"></progress><p id="lab-sample-live"></p></div>
      <pre id="lab-pose-results">Closed: not sampled
Open: not sampled</pre><p id="lab-calibration-result" role="status">Using default distance thresholds.</p>
      <h3>Landmark recording</h3><p>Local only; no video is recorded. Select a label before each intended stroke.</p>
      <label>Intended symbol<select id="lab-label"><option value="neutral">Neutral / no drawing</option>${SYMBOLS.map(s=>`<option>${s}</option>`).join("")}<option value="thumbs_up">Thumbs up (spell starter)</option><option value="infinity">∞ (legacy rune)</option></select></label>
      <button id="lab-marker">Mark intended start / end</button><button id="lab-record">Start recording</button><button id="lab-export">Download session</button>
      <label>Import session<input id="lab-import" type="file" accept="application/json"></label><button id="lab-replay">Replay with current settings</button><button id="lab-cancel">Stop replay</button>
      <button id="lab-clear">Clear results</button>
      <p id="lab-message" role="status">Starting camera automatically. Allow camera access when prompted.</p>
    </aside><main>
      <h2>Camera &amp; drawing surface</h2>
      <canvas id="lab-camera-view" width="640" height="480" aria-label="Live camera with hand skeleton and drawing area"></canvas>
      <p id="lab-preview-status">Starting camera and hand tracking...</p>
      <p>Draw directly over the video inside the enlarged yellow box. Pink: current stroke. Gray: previous stroke. Outside positions clamp to the box edges.</p>
      <p id="lab-rune-status" role="status">Hold 👍 to test the current spell starter. The legacy ∞ detector is also available here.</p>
      <p>Rune detection requires a clear horizontal two-loop shape and at least 20 captured samples, independently of normal-symbol minimums and acceptance thresholds.</p>
    </main><aside class="lab-detections">
      <h2>Detections</h2><p id="lab-gate-reason" role="status"></p><div id="lab-gesture" aria-live="polite">Waiting for hand</div>
      <h3>Detected gestures &amp; commits</h3><ol id="lab-results" aria-live="polite" aria-relevant="additions"></ol>
      <h3>Last stroke: line checks</h3><pre id="lab-line-metrics">Draw a stroke to measure its straightness, thinness, and angle.</pre>
      <h3>Pinch distance &amp; active thresholds</h3><pre id="lab-thresholds"></pre>
      <details><summary>Tracking &amp; recognition diagnostics</summary><pre id="lab-stats"></pre></details>

    </aside></div>`;
  document.body.append(host);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(`lab-${id}`) as T;
  const message = (s: string) => {el("message").textContent=s;};
  const canvas = document.createElement("canvas");
  canvas.width=ARENA.width;canvas.height=ARENA.height;
  const ctx = canvas.getContext("2d")!;
  const cameraCanvas = el<HTMLCanvasElement>("camera-view"), cameraCtx = cameraCanvas.getContext("2d")!;
  let lastLine: LineMetrics | null = null;
  let current: Pt[] = [], completed: Pt[] = [], cursor: Pt | null = null;
  let recording = false, replay = false, replayToken = 0, base = 0;
  let samples: Observation[] = [], events: {t:number;event:InputEvent}[] = [];
  let labels: {t:number;symbol:string;boundary:string}[] = [], marking = false;
  let source: {observations:Observation[];labels?:typeof labels} | null = null;
  let recordingConfig: unknown = null;
  let calibration: {kind:"closed"|"open";until:number;values:number[]} | null = null;
  const poses = {closed:[] as number[],open:[] as number[]};
  el<HTMLSelectElement>("timing").value=experiment.timing;
  el<HTMLInputElement>("buffered").checked=experiment.variant==="E";
  const syncTiming = () => {
    const frames=experiment.timing==="frames";
    for(const id of ["begin","end"]){const input=el<HTMLInputElement>(id);input.min=frames?"1":"0";input.max=frames?"30":"1000";}
    el<HTMLInputElement>("begin").value=String(frames?experiment.startFrames:experiment.startMs);
    el<HTMLInputElement>("end").value=String(frames?experiment.endFrames:experiment.releaseMs);
  };
  syncTiming();
  const syncRatios=()=>{
    el<HTMLInputElement>("start-ratio").max=Math.min(.7,experiment.off-experiment.hysteresisGap).toFixed(3);
    el<HTMLInputElement>("start-ratio").value=experiment.on.toFixed(3);
    el<HTMLInputElement>("end-ratio").min=(experiment.on+experiment.hysteresisGap).toFixed(3);
    el<HTMLInputElement>("end-ratio").value=experiment.off.toFixed(3);
  };
  el<HTMLInputElement>("hysteresis-gap").value=String(experiment.hysteresisGap);
  syncRatios();el<HTMLInputElement>("speed-assist").checked=experiment.speedAssist;
  el<HTMLInputElement>("speed-range").value=String(experiment.speedAssistRange);
  el<HTMLInputElement>("depth-veto").checked=experiment.depthVeto;
  el<HTMLInputElement>("use3d").checked=experiment.use3d;
  el<HTMLSelectElement>("anchor").value=experiment.anchor;

  el<HTMLInputElement>("min-points").checked=experiment.minStrokePointsEnabled;
  el<HTMLInputElement>("min-length").checked=experiment.minStrokeLengthEnabled;
  el<HTMLInputElement>("recognition-threshold").value=String(experiment.recognitionThreshold);
  el<HTMLInputElement>("wanted-threshold").value=String(experiment.wantedRecognitionThreshold);
  el<HTMLInputElement>("thumb-threshold").value=String(experiment.thumbUpThreshold);
  el<HTMLInputElement>("thumb-hold").value=String(experiment.thumbUpHoldMs);
  let casts = 0, fizzles = 0, strokes = 0, runes = 0, thumbs = 0;
  const log = (text:string) => { const li=document.createElement("li");li.textContent=text;el("results").prepend(li);while(el("results").children.length>3)el("results").lastChild!.remove();};
  const reset = () => { cancelHandStroke(); current=[];completed=[];cursor=null;lastLine=null;casts=0;fizzles=0;strokes=0;runes=0;thumbs=0;el("results").replaceChildren();state.lastRecog=null;el("rune-status").textContent="Hold thumbs up to test the current spell starter. Infinity remains available as a legacy rune."; };
  const stopReplay = () => {replayToken++;replay=false;setReplaying(false);reset();};
  const change = () => { if(replay) stopReplay(); else reset(); };
  for(const key of ["lineStraightness","lineThinness","lineAngleTolerance","lineAngleToleranceWanted"] as const){
    const input=el<HTMLInputElement>(key);input.value=String(experiment[key]);
    input.onchange=()=>{
      const value=Number(input.value);
      if(!input.checkValidity()||!Number.isFinite(value)){input.value=String(experiment[key]);return;}
      const measured=lastLine;
      change();experiment[key]=value;lastLine=measured;
    };
  }
  for(const id of ["thumb-threshold","thumb-hold"])el<HTMLInputElement>(id).onchange=()=>{
    const input=el<HTMLInputElement>(id),key=id==="thumb-threshold"?"thumbUpThreshold":"thumbUpHoldMs",value=Number(input.value);
    if(!input.checkValidity()||!Number.isFinite(value)){input.value=String(experiment[key]);return;}
    change();experiment[key]=value;
  };
  el<HTMLButtonElement>("save").onclick=async()=>{
    const button=el<HTMLButtonElement>("save");button.disabled=true;el("save-status").textContent="Saving...";
    try {
      const {variant,anchor,timing,on,off,startFrames,endFrames,startMs,releaseMs,speedAssist,speedAssistRange,depthVeto,use3d,minStrokeLengthEnabled,minStrokePointsEnabled,recognitionThreshold,wantedRecognitionThreshold,thumbUpThreshold,thumbUpHoldMs,hysteresisGap,lineStraightness,lineThinness,lineAngleTolerance,lineAngleToleranceWanted}=experiment;
      const response=await fetch("/__pinch-config",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({variant,anchor,timing,on,off,startFrames,endFrames,startMs,releaseMs,speedAssist,speedAssistRange,depthVeto,use3d,minStrokeLengthEnabled,minStrokePointsEnabled,recognitionThreshold,wantedRecognitionThreshold,thumbUpThreshold,thumbUpHoldMs,hysteresisGap,lineStraightness,lineThinness,lineAngleTolerance,lineAngleToleranceWanted})});
      const result=await response.json();if(!response.ok)throw Error(result.error??"Save failed");
      el("save-status").textContent="Saved to config/pinch.local.json. Reloads and new gameplay sessions use these defaults. No server restart needed.";
    } catch(err){el("save-status").textContent=`Could not save: ${String(err)}`;}
    finally{button.disabled=false;}
  };
  el<HTMLInputElement>("min-points").onchange=()=>{change();experiment.minStrokePointsEnabled=el<HTMLInputElement>("min-points").checked;};
  el<HTMLInputElement>("min-length").onchange=()=>{change();experiment.minStrokeLengthEnabled=el<HTMLInputElement>("min-length").checked;};
  for(const id of ["recognition-threshold","wanted-threshold"])el<HTMLInputElement>(id).onchange=()=>{
    const input=el<HTMLInputElement>(id),key=id==="recognition-threshold"?"recognitionThreshold":"wantedRecognitionThreshold",value=Number(input.value);
    if(!input.checkValidity()||!Number.isFinite(value)){input.value=String(experiment[key]);return;}
    change();experiment[key]=value;
  };
  el<HTMLSelectElement>("timing").onchange = () => {change();experiment.timing=el<HTMLSelectElement>("timing").value as typeof experiment.timing;syncTiming();};
  for(const id of ["begin","end"]) el<HTMLInputElement>(id).onchange=()=>{
    const input=el<HTMLInputElement>(id),value=Number(input.value);
    if(!input.checkValidity()||!Number.isInteger(value)){syncTiming();return;}
    change();if(experiment.timing==="frames"){if(id==="begin")experiment.startFrames=value;else experiment.endFrames=value;}
    else {if(id==="begin")experiment.startMs=value;else experiment.releaseMs=value;}
  };
  el<HTMLInputElement>("hysteresis-gap").onchange=()=>{
    const input=el<HTMLInputElement>("hysteresis-gap"),value=Number(input.value);
    if(!input.checkValidity()||!Number.isFinite(value)){input.value=String(experiment.hysteresisGap);return;}
    change();experiment.hysteresisGap=value;
    experiment.on=Math.min(experiment.on,.85-value);
    experiment.off=Math.min(.85,Math.max(experiment.off,experiment.on+value));
    experiment.calibrated=false;syncRatios();
    el("calibration-result").textContent=`Minimum gap ${value.toFixed(3)}. Active band ${(experiment.off-experiment.on).toFixed(3)}. Start ${experiment.on.toFixed(3)}, End ${experiment.off.toFixed(3)}.`;
  };
  for(const id of ["start-ratio","end-ratio"]) el<HTMLInputElement>(id).onchange=()=>{
    const input=el<HTMLInputElement>(id),value=Number(input.value);
    if(!input.checkValidity()||!Number.isFinite(value)){syncRatios();message(`End ratio must be at least ${experiment.hysteresisGap.toFixed(3)} above Start; End cannot exceed 0.85.`);return;}
    change();if(id==="start-ratio")experiment.on=value;else experiment.off=value;
    experiment.calibrated=false;syncRatios();
    el("calibration-result").textContent=`Manual thresholds: start below ${experiment.on.toFixed(3)}, base end above ${experiment.off.toFixed(3)}.`;
  };
  el<HTMLInputElement>("use3d").onchange=()=>{
    change();experiment.use3d=el<HTMLInputElement>("use3d").checked;
    calibration=null;poses.closed=[];poses.open=[];poseSummary();
    if(experiment.calibrated){experiment.on=INPUT.pinchOn;experiment.off=Math.max(INPUT.pinchOff,INPUT.pinchOn+experiment.hysteresisGap);}
    experiment.calibrated=false;syncRatios();
    el("sampling").classList.remove("is-sampling");el<HTMLProgressElement>("sample-progress").value=0;
    el("sample-state").textContent="Distance mode changed: pose samples cleared.";el("sample-live").textContent="";
    el("calibration-result").textContent=`Using ${experiment.use3d?"3D":"2D"} ratios. Previous calibration cleared; manually chosen thresholds are retained. Re-sample and apply for this mode.`;
  };
  el<HTMLInputElement>("depth-veto").onchange=()=>{change();experiment.depthVeto=el<HTMLInputElement>("depth-veto").checked;};
  el<HTMLInputElement>("speed-range").onchange=()=>{
    const input=el<HTMLInputElement>("speed-range"),value=Number(input.value);
    if(!input.checkValidity()||!Number.isFinite(value)){input.value=String(experiment.speedAssistRange);return;}
    change();experiment.speedAssistRange=value;
  };
  el<HTMLInputElement>("speed-assist").onchange=()=>{change();experiment.speedAssist=el<HTMLInputElement>("speed-assist").checked;};
  el<HTMLInputElement>("buffered").onchange = () => {change();experiment.variant=el<HTMLInputElement>("buffered").checked?"E":"C";};
  el<HTMLSelectElement>("anchor").onchange = e => {change();experiment.anchor=(e.target as HTMLSelectElement).value as typeof experiment.anchor;};

  el<HTMLInputElement>("mirror").onchange = e => {change();state.mirror=(e.target as HTMLInputElement).checked;applyMirror();};
  async function cameras() {
    const cams=await listCameras(), select=el<HTMLSelectElement>("camera");
    const active=(video().srcObject as MediaStream|null)?.getVideoTracks()[0]?.getSettings().deviceId??select.value;
    select.replaceChildren(...cams.map((c,i)=>{const o=document.createElement("option");o.value=c.deviceId;o.textContent=c.label||`Camera ${i+1}`;return o;}));
    if(cams.some(c=>c.deviceId===active))select.value=active;
  }
  let cameraStarting=false;
  async function startLiveCamera(){
    if(cameraStarting)return;cameraStarting=true;el("retry-camera").hidden=true;
    el<HTMLSelectElement>("camera").disabled=true;message("Starting camera and hand tracking...");
    try{stopReplay();await startCamera(el<HTMLSelectElement>("camera").value||undefined);state.mode="hand";await initHandTracker();await cameras();message("Camera and hand tracking ready.");}
    catch(e){message(String(e));el("retry-camera").hidden=false;}
    finally{cameraStarting=false;el<HTMLSelectElement>("camera").disabled=false;}
  }
  el("retry-camera").onclick=()=>void startLiveCamera();
  el<HTMLSelectElement>("camera").onchange=()=>void startLiveCamera();
  const poseSummary = () => {
    const stats=(v:number[])=>{if(!v.length)return "not sampled";const sorted=[...v].sort((a,b)=>a-b);return `${v.length} samples; ratio p10 ${sorted[Math.floor((v.length-1)*.1)].toFixed(3)}, median ${sorted[Math.floor((v.length-1)*.5)].toFixed(3)}, p90 ${sorted[Math.floor((v.length-1)*.9)].toFixed(3)}`;};
    el("pose-results").textContent=`Closed: ${stats(poses.closed)}\nOpen: ${stats(poses.open)}`;
  };
  const finishSampling=()=>{if(!calibration)return;const {kind,values}=calibration;poses[kind]=values;calibration=null;poseSummary();el("sample-state").textContent=`${kind} sample complete: ${values.length} measurements${values.length<20?" (need at least 20; retry)":""}`;el<HTMLProgressElement>("sample-progress").value=2000;el("sampling").classList.remove("is-sampling");};
  for(const kind of ["closed","open"] as const) el(kind).onclick=()=>{
    if(!state.cameraOn || replaying || !state.trackerReady){el("sample-state").textContent="Enable live camera and hand tracking before sampling.";return;}
    calibration={kind,until:performance.now()+2000,values:[]};
    el("sample-state").textContent=`Sampling ${kind} pinch...`;
    el<HTMLProgressElement>("sample-progress").value=0;el("sampling").classList.add("is-sampling");
    el("calibration-result").textContent="New samples do not change thresholds until Apply calibration is pressed.";
  };
  el("calibrate").onclick=()=>{
    if(calibration){el("calibration-result").textContent="Wait for sampling to finish.";return;}
    change();const ok=calibratePinch(poses.closed,poses.open);experiment.calibrated=ok;
    if(!ok){experiment.on=INPUT.pinchOn;experiment.off=Math.max(INPUT.pinchOff,INPUT.pinchOn+experiment.hysteresisGap);}
    syncRatios();
    el("calibration-result").textContent=ok?`Applied: close below ${experiment.on.toFixed(3)}, open above ${experiment.off.toFixed(3)}. Active with buffering on or off.`:"Rejected: need at least 20 samples per pose, separated distributions, and thresholds within safe bounds. Defaults restored.";
  };
  el("default").onclick=()=>{change();experiment.calibrated=false;experiment.on=INPUT.pinchOn;experiment.off=Math.max(INPUT.pinchOff,INPUT.pinchOn+experiment.hysteresisGap);syncRatios();el("calibration-result").textContent=`Default thresholds restored: close ${experiment.on.toFixed(3)}, open ${experiment.off.toFixed(3)} (respecting minimum gap).`;};
  observationListeners.add(o=>{
    if(recording){if(samples.length>=18000){recording=false;el("record").textContent="Start recording";message("Recording stopped at 18,000 observations. Download to keep it.");}else samples.push(structuredClone({...o,t:o.t-base}));}
    if(calibration){
      const ratio=calibrationRatio(o);if(ratio!==null)calibration.values.push(ratio);

    }
  });
  onInput(e=>{
    if(recording)events.push({t:performance.now()-base,event:structuredClone(e)});
    if(e.type==="cursor")cursor=e.p;
    if(e.type==="strokeStart")current=[e.p];
    if(e.type==="strokePoint")current.push(e.p);
    if(e.type==="strokeCancel")current=[];
    if(e.type==="strokeEnd"){lastLine=measureLine(e.points);completed=e.points;current=[];strokes++;if(!e.rune&&e.points.length<(experiment.minStrokePointsEnabled?INPUT.minStrokePoints:2))log("Ignored: too few points");}
    if(e.type==="spellRune"){
      runes++;completed=e.points;
      log(`RUNE ∞ · legacy rune · ${e.points.length} captured samples`);
      el("rune-status").textContent=`∞ detected — ${runes} legacy rune${runes===1?"":"s"} this trial. Classic now starts with thumbs up.`;
    }
    if(e.type==="spellGesture"){
      thumbs++;
      log(`GESTURE 👍 · ${(e.score*100).toFixed(0)}% · hand ${e.hand+1}`);
    }
    if(e.type==="symbol"){casts++;log(`CAST ${e.name} · similarity ${e.score.toFixed(3)}`);}
    if(e.type==="fizzle"){fizzles++;log(`REJECTED · best ${e.best?.name??"none"} ${e.best?.score.toFixed(3)??""}`);}
  });
  el("record").onclick=()=>{
    if(replay)return message("Stop replay before recording.");
    if(!recording){reset();samples=[];events=[];labels=[];marking=false;base=performance.now();recordingConfig={...experiment};}
    recording=!recording;el("record").textContent=recording?"Stop recording":"Start recording";message(recording?"Recording landmarks locally. Mark intended boundaries for evaluation.":`Recorded ${samples.length} observations.`);
  };
  el("marker").onclick=()=>{if(!recording)return message("Start recording before adding labels.");labels.push({t:performance.now()-base,symbol:el<HTMLSelectElement>("label").value,boundary:marking?"end":"start"});marking=!marking;message(`Marked intended ${marking?"start":"end"}. Timing is a manual estimate.`);};
  el("export").onclick=()=>{
    const settings=(video().srcObject as MediaStream|null)?.getVideoTracks()[0]?.getSettings();
    const payload={version:experiment.version,config:recordingConfig,mirror:state.mirror,drawBox:state.drawBox,camera:settings,delegate:state.delegate,observations:samples,events,labels,templates:SYMBOLS.map(s=>({name:s,count:recognizer.count(s)}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="pinch-session.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  el<HTMLInputElement>("import").onchange=async e=>{try{
    const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>50_000_000)throw Error("Session exceeds 50 MB.");
    const data=JSON.parse(await file.text());
    const validLandmarks=(v:unknown)=>v===null||(Array.isArray(v)&&v.length===21&&v.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite)));
    if(data.version!==experiment.version||!Array.isArray(data.observations)||data.observations.length>18000||!data.observations.every((o:Observation,i:number,a:Observation[])=>Number.isFinite(o.t)&&o.t>=0&&(i===0||o.t>a[i-1].t)&&o.width>0&&o.height>0&&validLandmarks(o.landmarks)&&validLandmarks(o.world)&&(o.thumbUpScore===undefined||(Number.isFinite(o.thumbUpScore)&&o.thumbUpScore>=0&&o.thumbUpScore<=1))))throw Error("Invalid landmark session.");
    stopReplay();source=data;message(`Imported ${data.observations.length} observations. Current variant and anchor will be used.`);
  }catch(e){message(String(e));}};
  el("replay").onclick=()=>{
    if(recording)return message("Stop recording first.");
    const observations=source?.observations??samples;if(!observations.length)return message("Record or import observations first.");
    stopReplay();setReplaying(true);replay=true;state.mode="hand";
    const token=++replayToken,start=performance.now(),origin=observations[0].t;let i=0;
    const tick=()=>{if(token!==replayToken)return;while(i<observations.length&&observations[i].t-origin<=performance.now()-start){processObservation(observations[i++]);}
      if(i<observations.length)requestAnimationFrame(tick);else{
        // Explicit missing-hand tail completes a held final stroke without inventing an opening.
        const last=observations.at(-1)!;for(let dt=33;dt<=experiment.lostHandMs+100;dt+=33)processObservation({...last,t:last.t+dt,landmarks:null,world:null});
        replay=false;message("Replay complete. Results remain visible; stop replay to resume live input.");
      }};requestAnimationFrame(tick);
  };
  el("cancel").onclick=()=>{stopReplay();message("Replay stopped. Live input resumed if camera is enabled.");};
  el("clear").onclick=reset;
  const line=(pts:Pt[],color:string)=>{if(!pts.length)return;ctx.strokeStyle=color;ctx.lineWidth=5;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();};
  function draw(){requestAnimationFrame(draw);ctx.clearRect(0,0,1280,720);line(completed,"#a7b9b3");line(current,"#cf3976");
    el<HTMLAnchorElement>("game").href=`/?pinch=${experiment.variant}&anchor=${experiment.anchor}&release=${experiment.releaseMs}&on=${experiment.on}&off=${experiment.off}&drawbox=wide&timing=${experiment.timing}&begin=${experiment.timing==="frames"?experiment.startFrames:experiment.startMs}&end=${experiment.timing==="frames"?experiment.endFrames:experiment.releaseMs}&calibrated=${experiment.calibrated}&speedAssist=${experiment.speedAssist}&speedRange=${experiment.speedAssistRange}&depthVeto=${experiment.depthVeto}&use3d=${experiment.use3d}&recognitionThreshold=${experiment.recognitionThreshold}&wantedRecognitionThreshold=${experiment.wantedRecognitionThreshold}&minStrokeLengthEnabled=${experiment.minStrokeLengthEnabled}&minStrokePointsEnabled=${experiment.minStrokePointsEnabled}&thumbUpThreshold=${experiment.thumbUpThreshold}&thumbUpHoldMs=${experiment.thumbUpHoldMs}&hysteresisGap=${experiment.hysteresisGap}&lineStraightness=${experiment.lineStraightness}&lineThinness=${experiment.lineThinness}&lineAngleTolerance=${experiment.lineAngleTolerance}&lineAngleToleranceWanted=${experiment.lineAngleToleranceWanted}`;
    if(cursor){ctx.fillStyle=state.inking?"#cf3976":"#257c81";ctx.beginPath();ctx.arc(cursor.x,cursor.y,9,0,Math.PI*2);ctx.fill();}
    const v=video(), liveVideo=state.cameraOn && v.readyState>=2 && !replaying;
    const width=liveVideo?v.videoWidth:640,height=liveVideo?v.videoHeight:480;
    if(cameraCanvas.width!==width||cameraCanvas.height!==height){cameraCanvas.width=width;cameraCanvas.height=height;}
    cameraCtx.fillStyle="#203630";cameraCtx.fillRect(0,0,width,height);
    if(liveVideo){
      cameraCtx.save();
      if(state.mirror){cameraCtx.translate(width,0);cameraCtx.scale(-1,1);}
      cameraCtx.drawImage(v,0,0,width,height);cameraCtx.restore();
    }
    // Wash out the camera while keeping the skeleton and ink crisp above it.
    cameraCtx.fillStyle="rgba(255,255,255,.45)";cameraCtx.fillRect(0,0,width,height);
    const b=state.drawBox;
    cameraCtx.fillStyle="rgba(255,255,255,.22)";
    cameraCtx.fillRect(b.x0*width,b.y0*height,(b.x1-b.x0)*width,(b.y1-b.y0)*height);
    cameraCtx.strokeStyle="#ffe04b";cameraCtx.lineWidth=2;cameraCtx.setLineDash([7,5]);
    cameraCtx.strokeRect(b.x0*width,b.y0*height,(b.x1-b.x0)*width,(b.y1-b.y0)*height);cameraCtx.setLineDash([]);
    const lm=state.landmarks;
    if(lm){
      const x=(j:number)=>(state.mirror?1-lm[j].x:lm[j].x)*width,y=(j:number)=>lm[j].y*height;
      const bones=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
      cameraCtx.strokeStyle=state.inking?"#ff72bc":"#57f5df";cameraCtx.lineWidth=3;
      for(const chain of bones){cameraCtx.beginPath();chain.forEach((j,i)=>i?cameraCtx.lineTo(x(j),y(j)):cameraCtx.moveTo(x(j),y(j)));cameraCtx.stroke();}
      cameraCtx.strokeStyle="#9d245d";cameraCtx.lineWidth=2;cameraCtx.setLineDash([4,3]);
      cameraCtx.beginPath();cameraCtx.moveTo(x(4),y(4));cameraCtx.lineTo(x(8),y(8));cameraCtx.stroke();cameraCtx.setLineDash([]);
      const distanceLabel=`${pinchEngine.distancePx?.toFixed(1)??"-"} px`;
      const labelX=Math.max(4,Math.min(width-90,(x(4)+x(8))/2+8));
      const labelY=Math.max(20,Math.min(height-8,(y(4)+y(8))/2-10));
      cameraCtx.font="bold 15px system-ui";cameraCtx.fillStyle="rgba(255,255,255,.9)";cameraCtx.fillRect(labelX-3,labelY-17,85,23);
      cameraCtx.fillStyle="#762249";cameraCtx.fillText(distanceLabel,labelX,labelY);
      lm.forEach((_,j)=>{cameraCtx.fillStyle=j===4||j===8?"#ffe04b":"white";cameraCtx.beginPath();cameraCtx.arc(x(j),y(j),j===4||j===8?6:3,0,Math.PI*2);cameraCtx.fill();});
    }
    // Invert the game-coordinate mapping so filtered ink stays aligned with the camera drawing box.
    cameraCtx.drawImage(canvas,b.x0*width,b.y0*height,(b.x1-b.x0)*width,(b.y1-b.y0)*height);
    if(calibration){cameraCtx.fillStyle="#762249";cameraCtx.fillRect(0,0,width,42);cameraCtx.fillStyle="white";cameraCtx.font="bold 18px system-ui";cameraCtx.fillText(`SAMPLING ${calibration.kind.toUpperCase()} | ${Math.max(0,(calibration.until-performance.now())/1000).toFixed(1)}s | ${calibration.values.length} samples`,12,28);}
    const variant=experiment.variant, fixed=variant==="A"||variant==="B", buffered=variant==="E"||variant==="F";
    const on=experiment.on,off=pinchEngine.effectiveOff;
    const px=(ratio:number)=>pinchEngine.handSizePx===null?"-":(ratio*pinchEngine.handSizePx).toFixed(1);
    el("thresholds").textContent=[
      `Thumbs up: ${state.thumbUpScore.toFixed(3)} / ${experiment.thumbUpThreshold.toFixed(2)} confidence`,
      `Gesture hold: ${Math.round(state.thumbUpProgress*experiment.thumbUpHoldMs)} / ${experiment.thumbUpHoldMs} ms; ${thumbs} activations`,
      `Stroke minimum: ${experiment.minStrokePointsEnabled?"8 points":"2 points (8-point check OFF)"}; path length ${experiment.minStrokeLengthEnabled?"40px":"OFF"}`,
      `Symbol thresholds: ${experiment.recognitionThreshold.toFixed(2)} normal / ${experiment.wantedRecognitionThreshold.toFixed(2)} wanted`,
      `Thumb-index distance: ${pinchEngine.distancePx?.toFixed(1)??"-"} camera px`,
      `Hand size (wrist to middle knuckle): ${pinchEngine.handSizePx?.toFixed(1)??"-"} px`,
      `Raw 2D normalized distance: ${pinchEngine.rawRatio?.toFixed(4)??"-"}`,
      `ACTIVE ${experiment.use3d?"3D":"2D"} ratio (veto ${!experiment.use3d&&experiment.depthVeto?"ON":"OFF"}): ${pinchEngine.ratio?.toFixed(4)??"-"}`,
      `START: ratio < ${on.toFixed(3)} ${experiment.use3d?"(3D hand-size ratio)":`(2D equivalent < ${px(on)} px)`}`,
      `Hysteresis: minimum ${experiment.hysteresisGap.toFixed(3)}; actual band ${(experiment.off-experiment.on).toFixed(3)}`,
      `Base open ratio: ${experiment.off.toFixed(3)} | assistance ${experiment.speedAssist?"ON":"OFF"}`,
      `Assistance range: +/-${experiment.speedAssistRange.toFixed(3)} ratio`,
      `Speed: ${pinchEngine.normalizedSpeed?.toFixed(2)??"-"} hand lengths/s (selected anchor)`,
      `STOP: ratio > ${off.toFixed(3)} ${experiment.use3d?"(3D hand-size ratio)":`(2D equivalent > ${px(off)} px)`}`,
      `3D ratio: ${pinchEngine.ratio3?.toFixed(3)??"-"} | veto ${experiment.use3d?"not used (3D is primary)":experiment.depthVeto?`ON above ${INPUT.pinch3dMax.toFixed(3)}`:"OFF (measurement only)"}`,
      `Start evidence: ${experiment.timing==="frames"?`${experiment.startFrames} detections`:`${experiment.startMs} ms`}`,
      `Release evidence: ${experiment.timing==="frames"?`${experiment.endFrames} detections`:`${experiment.releaseMs} ms`}`,
      `Hand-loss grace: ${fixed?INPUT.lostHandMs:experiment.lostHandMs} ms${fixed?` AND ${INPUT.framesToStop} detections`:""}`,
      ...(!fixed?["Frame gap > 200 ms: finish stroke / reset evidence"]:[]),
      ...(buffered?[`Trend release: ratio > ${pinchEngine.effectiveTrend.toFixed(3)} and rise > 0.060 / observation; sustained opening uses same release delay`,`History: ${experiment.historyMs} ms; prefix recovery: ${experiment.prefixMs} ms`]:[]),
      "All variants use thumb/index tips for pinch detection. Cursor anchor only changes position."
    ].join("\n");
    el("preview-status").textContent=replaying?"Landmark replay / live video hidden (video is not recorded).":liveVideo?"Live camera / skeleton overlaid. Yellow dots: thumb and index tips. Yellow box: drawing area.":"Camera unavailable. Use Retry camera if access was denied or startup failed.";
    if(calibration){
      const remaining=Math.max(0,calibration.until-performance.now());
      el("sample-state").textContent=`Sampling ${calibration.kind}: ${(remaining/1000).toFixed(1)}s left`;
      el<HTMLProgressElement>("sample-progress").value=2000-remaining;
      el("sample-live").textContent=`${calibration.values.length} measurements | ${state.handVisible?"Hand tracked":"No hand - move into view"} | latest ratio ${calibration.values.at(-1)?.toFixed(3)??"-"} (${experiment.use3d?"3D":"2D"})`;
      if(remaining===0)finishSampling();
    }
    el<HTMLInputElement>("depth-veto").disabled=experiment.use3d;
    for(const kind of ["closed","open"])el<HTMLButtonElement>(kind).disabled=!!calibration;
    el<HTMLButtonElement>("calibrate").disabled=!!calibration;
    el("gate-reason").textContent=pinchEngine.gateReason;
    el("line-metrics").textContent=lastLine?[
      `Straightness ${lastLine.straightness.toFixed(3)} >= ${experiment.lineStraightness.toFixed(2)}: ${lastLine.straightness>=experiment.lineStraightness?"PASS":"FAIL"}`,
      `Thinness ${lastLine.thinness.toFixed(3)} <= ${experiment.lineThinness.toFixed(2)}: ${lastLine.thinness<=experiment.lineThinness?"PASS":"FAIL"}`,
      `Angle ${lastLine.angle.toFixed(1)}° from horizontal`,
      `Allowed tilt: ${experiment.lineAngleTolerance}° normal / ${experiment.lineAngleToleranceWanted}° wanted`,
      lastLine.straightness<experiment.lineStraightness||lastLine.thinness>experiment.lineThinness?"Line gate rejected: template fallback":"Line gate passed: angle chooses horizontal / vertical / diagonal"
    ].join("\n"):"Draw a stroke to measure its straightness, thinness, and angle.";
    el<HTMLProgressElement>("thumb-progress").value=state.thumbUpProgress;
    el("thumb-status").textContent=`Score ${state.thumbUpScore.toFixed(3)} / threshold ${experiment.thumbUpThreshold.toFixed(2)} · hold ${Math.round(state.thumbUpProgress*experiment.thumbUpHoldMs)} / ${experiment.thumbUpHoldMs} ms · ${thumbs} activations`;
    const r=state.lastRecog,p=pinchEngine.preview;
    el("gesture").textContent=`${state.handVisible?pinchEngine.phase:"No hand detected"} ${p?.name?`· provisional ${p.name} ${p.score.toFixed(2)} (release to commit)`:""}`;
    const settings=(video().srcObject as MediaStream|null)?.getVideoTracks()[0]?.getSettings();
    el("stats").textContent=`${experiment.version} · ${experiment.variant} · ${experiment.anchor} · ${replaying?"REPLAY":recording?"RECORDING":"LIVE"}\n2D raw ${pinchEngine.rawRatio?.toFixed(3)??"—"} · gated ${pinchEngine.ratio?.toFixed(3)??"—"} · 3D ${pinchEngine.ratio3?.toFixed(3)??"—"}\n${state.delegate||"—"} · ${state.trackerFps.toFixed(1)} observations/s · inference ${inferenceMs.toFixed(1)} ms · camera ${settings?.width??"—"}×${settings?.height??"—"} @ ${settings?.frameRate??"—"}\n${strokes} strokes · ${runes} infinity runes · ${casts} casts · ${fizzles} rejected · ${samples.length} recorded observations\nLast: ${r?.name??r?.method??"—"} · similarity ${r?.score.toFixed(3)??"—"}\n${pinchEngine.decision}`;

  }requestAnimationFrame(draw);
  void startLiveCamera();
}
