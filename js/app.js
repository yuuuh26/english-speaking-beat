import { Store, persistenceStatus } from "./storage.js";
import { SpeechController } from "./speech.js";
import { AudioController } from "./audio.js";
import { levelInfo } from "./scoring.js";
import { buildMarkdown, downloadMarkdown } from "./backup.js";
import { MODE_META, createSession, applyAnswer, reviewOrder, memoryMarkup, updateAutoLevel } from "./game.js";

const $ = id => document.getElementById(id);
const screens = ["home", "game", "result", "settings"];
const store = new Store(); const speech = new SpeechController(); const audio = new AudioController();
let phrases = []; let tracks = []; let config; let settings; let session; let currentPhrase; let promptReadyAt = 0; let currentMemoryLevel = 1; let paused = false; let sessionStartLevel = 1;

async function init() {
  try {
    [phrases, tracks, config] = await Promise.all([
      fetch("./data/phrases-core.json").then(r => r.json()),
      fetch("./data/tracks.json").then(r => r.json()).then(x => x.tracks),
      fetch("./data/game-config.json").then(r => r.json())
    ]);
    phrases = phrases.filter(p => p.enabled !== false);
    await store.open(); settings = await store.settings();
    const availableTracks = tracks.filter(track => track.enabled && track.src);
    if (!availableTracks.some(track => track.id === settings.track)) {
      settings.track = availableTracks[0]?.id || "none";
      await store.saveSettings(settings);
    }
    bindEvents(); fillSettings(); await updateHome();
    $("storageStatus").textContent = "保存状態：IndexedDB 利用可能";
    const persistent = await persistenceStatus(true);
    $("persistStatus").textContent = `永続ストレージ：${({ enabled:"有効", "not-applied":"未適用", unknown:"確認できません" })[persistent]}`;
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  } catch (error) {
    console.error(error); showToast("初期化に失敗しました。再読み込みしてね。", 5000);
    $("storageStatus").textContent = "保存状態：初期化エラー";
  }
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => startGame(button.dataset.mode)));
  $("settingsButton").addEventListener("click", () => showScreen("settings"));
  $("brandButton").addEventListener("click", goHome); $("backButton").addEventListener("click", goHome);
  $("homeButton").addEventListener("click", goHome); $("replayButton").addEventListener("click", () => startGame(session.mode));
  $("micButton").addEventListener("click", listen); $("nextButton").addEventListener("click", nextQuestion);
  $("replayTtsButton").addEventListener("click", () => speakModel(currentPhrase.primaryAnswer));
  $("pauseButton").addEventListener("click", pauseGame); $("resumeButton").addEventListener("click", resumeGame); $("quitButton").addEventListener("click", endGame);
  $("settingsForm").addEventListener("input", saveFormSettings);
  $("backupButton").addEventListener("click", backup);
  document.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", async () => { await navigator.clipboard.writeText(button.dataset.copy); showToast("コピーしました"); }));
}

function showScreen(name) {
  screens.forEach(screen => $(`${screen}Screen`).classList.toggle("active", screen === name));
  $("backButton").classList.toggle("hidden", name === "home");
  $("pauseButton").classList.toggle("hidden", name !== "game");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "settings") refreshInfo();
}

async function updateHome() {
  const [profile, today] = await Promise.all([store.profile(), store.todayStats()]); const level = levelInfo(profile.xp);
  $("homeLevel").textContent = level.level; $("xpProgress").style.width = `${level.progress * 100}%`;
  $("xpLabel").textContent = `${profile.xp - level.floor} / ${level.next - level.floor} XP`;
  $("streakCount").textContent = `${profile.currentStreak} DAYS`;
  $("todaySummary").textContent = `${today.spoken} sentences · ${Math.floor(today.durationMs / 60000)}m`;
}

async function startGame(mode) {
  const source = mode === "review" ? reviewOrder(phrases, await store.getAll("progress")) : phrases;
  session = createSession(mode, source, Number(settings.rounds)); sessionStartLevel = levelInfo((await store.profile()).xp).level;
  const selected = tracks.find(t => t.id === settings.track) || tracks[0]; audio.apply(settings); audio.setTrack(selected?.src || null); await audio.play();
  showScreen("game"); nextQuestion();
}

async function nextQuestion() {
  if (!session || session.index >= session.queue.length) return endGame();
  currentPhrase = session.queue[session.index]; currentMemoryLevel = settings.memoryLevel === "auto" ? settings.autoLevel || 1 : Number(settings.memoryLevel);
  const meta = MODE_META[session.mode];
  $("modeLabel").textContent = meta.label; $("instructionText").textContent = meta.instruction;
  $("roundLabel").textContent = `${session.index + 1} / ${session.queue.length}`;
  $("scoreValue").textContent = session.score.toLocaleString(); $("comboValue").textContent = session.combo;
  $("memoryLevelLabel").textContent = session.mode === "memory" ? `LV ${currentMemoryLevel}` : "";
  $("feverBanner").classList.toggle("hidden", session.combo < config.fever.startsAtCombo);
  $("feedbackPanel").classList.add("hidden"); $("speechPanel").classList.remove("hidden");
  $("transcriptText").textContent = ""; $("micPulse").className = "mic-pulse"; $("micButton").disabled = false;
  $("memoryText").classList.add("hidden"); $("replayTtsButton").classList.add("hidden");
  if (session.mode === "listen") {
    $("questionText").textContent = "Listen…"; $("replayTtsButton").classList.remove("hidden"); $("micButton").disabled = true;
    await speakModel(currentPhrase.primaryAnswer); $("questionText").textContent = "聞こえた英語を言おう"; $("micButton").disabled = false;
  } else if (session.mode === "memory") {
    $("questionText").textContent = currentPhrase.primaryAnswer; $("micButton").disabled = true;
    await speakModel(currentPhrase.primaryAnswer); await wait(900);
    $("questionText").textContent = "思い出して言おう"; $("memoryText").innerHTML = memoryMarkup(currentPhrase, currentMemoryLevel); $("memoryText").classList.remove("hidden"); $("replayTtsButton").classList.remove("hidden"); $("micButton").disabled = false;
  } else {
    $("questionText").textContent = currentPhrase.ja;
  }
  if (!speech.supported) {
    $("speechStatus").textContent = "このブラウザは音声認識に未対応です";
    return;
  }
  $("speechStatus").textContent = "発話の準備中…";
  if (!paused) void listen();
}

async function speakModel(text) {
  $("speechStatus").textContent = "お手本を再生中…"; audio.duck(true);
  await speech.speak(text, { lang: settings.speechLang, rate: settings.ttsRate, volume: settings.ttsVolume, onEnd: () => audio.duck(false) });
  audio.duck(false); $("speechStatus").textContent = "発話の準備中…";
}

async function listen() {
  if (!speech.supported || paused) return showToast("Android Chromeで音声認識を利用してね。");
  $("micButton").disabled = true; $("transcriptText").textContent = "";
  $("speechStatus").textContent = "Get ready…";

  const cue = $("speakCue"); const cueText = $("speakCueText");
  cue.classList.remove("hidden", "go"); cue.classList.add("ready");
  cueText.textContent = "READY…";

  await wait(300);
  if (paused || !session) { cue.classList.add("hidden"); cue.classList.remove("ready", "go"); $("micButton").disabled = false; return; }

  await audio.fadeOutAndPause(280);
  await wait(180);
  if (paused || !session) { cue.classList.add("hidden"); cue.classList.remove("ready", "go"); $("micButton").disabled = false; return; }

  cue.classList.remove("ready"); cue.classList.add("go");
  cueText.textContent = "GO!";
  promptReadyAt = performance.now();

  try {
    let detectedSpeechAt = null;
    const resultPromise = speech.listen({ lang: settings.speechLang,
      onStart: () => {
        $("micPulse").classList.add("listening"); $("speechStatus").textContent = "Listening…";
        setTimeout(() => { cue.classList.add("hidden"); cue.classList.remove("go"); }, 300);
      },
      onInterim: text => { if (text && detectedSpeechAt === null) detectedSpeechAt = performance.now(); $("transcriptText").textContent = text; }
    });
    const result = await resultPromise;
    const responseMs = Math.max(0, (detectedSpeechAt ?? performance.now()) - promptReadyAt);
    cue.classList.add("hidden"); cue.classList.remove("ready", "go");
    if (!paused && session) await audio.resume(180);
    $("micPulse").classList.remove("listening"); await processAnswer(result.alternatives, responseMs);
  } catch (error) {
    cue.classList.add("hidden"); cue.classList.remove("ready", "go");
    if (!paused && session) await audio.resume(180);
    $("micPulse").className = "mic-pulse error"; $("speechStatus").textContent = error.message; $("micButton").disabled = false;
    showToast("減点・Combo解除なしで再試行できます", 3200);
  }
}

async function processAnswer(alternatives, responseMs) {
  const { judgement, points } = applyAnswer({ session, phrase: currentPhrase, alternatives, responseMs, memoryLevel: currentMemoryLevel, config });
  if (session.mode === "memory" && settings.memoryLevel === "auto") {
    updateAutoLevel(settings, judgement.rating, config); await store.saveSettings(settings);
  }
  await store.recordAttempt({ phrase: currentPhrase, mode: session.mode, rating: judgement.rating, responseMs });
  $("speechPanel").classList.add("hidden"); $("feedbackPanel").classList.remove("hidden");
  $("ratingBadge").textContent = judgement.rating; $("ratingBadge").style.setProperty("--rating", ({ PERFECT:"#ffe86b", GREAT:"#ff7fcc", GOOD:"#54dda2", RETRY:"#ff7188" })[judgement.rating]);
  $("scoreGain").textContent = `+${points.total}${points.speed.label ? ` · ${points.speed.label} +${points.speed.points}` : ""}`;
  $("modelAnswer").textContent = currentPhrase.primaryAnswer; $("modelTranslation").textContent = currentPhrase.ja; $("recognizedAnswer").textContent = judgement.transcript || "—";
  $("matchDetail").textContent = judgement.missing.length ? `抜けた可能性：${judgement.missing.join(", ")}` : `音声認識一致度 ${Math.round(judgement.score * 100)}%`;
  $("scoreValue").textContent = session.score.toLocaleString(); $("comboValue").textContent = session.combo;
  $("feverBanner").classList.toggle("hidden", session.combo < config.fever.startsAtCombo);
  audio.sfx(judgement.rating); effect(judgement.rating);
  if (judgement.rating === "PERFECT" && settings.vibration && navigator.vibrate) navigator.vibrate([25,35,45]);
  session.index += 1; $("nextButton").textContent = session.index >= session.queue.length ? "RESULT →" : "NEXT →";
}

async function endGame() {
  if (!session) return goHome(); speech.stop(); speechSynthesis.cancel(); audio.pause();
  const durationMs = Date.now() - session.startedAt;
  const saved = await store.saveSession({ mode: session.mode, score: session.score, xp: session.xp, spoken: session.spoken, ratings: session.ratings, maxCombo: session.maxCombo, durationMs, memoryMax: session.memoryMax });
  $("resultScore").textContent = session.score.toLocaleString(); $("resultXp").textContent = `+${session.xp}`; $("resultSpoken").textContent = session.spoken;
  ["Perfect","Great","Good","Retry"].forEach(key => { $(`result${key}`).textContent = session.ratings[key.toUpperCase()]; });
  $("resultCombo").textContent = session.maxCombo; const avg = session.responseTimes.length ? session.responseTimes.reduce((a,b) => a+b,0) / session.responseTimes.length : null;
  $("resultResponse").textContent = avg ? `${(avg / 1000).toFixed(1)}s` : "—";
  $("levelUpMessage").classList.toggle("hidden", levelInfo(saved.xp).level <= sessionStartLevel);
  $("pauseOverlay").classList.add("hidden"); paused = false; showScreen("result"); await updateHome();
}

function pauseGame() { paused = true; speech.stop(); speechSynthesis.cancel(); audio.pause(); $("speakCue").classList.add("hidden"); $("pauseOverlay").classList.remove("hidden"); }
function resumeGame() { paused = false; audio.resume(); $("pauseOverlay").classList.add("hidden"); promptReadyAt = performance.now(); }
function goHome() { if (session && $("gameScreen").classList.contains("active")) { speech.stop(); speechSynthesis.cancel(); audio.pause(); } $("speakCue").classList.add("hidden"); session = null; showScreen("home"); updateHome(); }

function fillSettings() {
  const form = $("settingsForm"); const percentFields = new Set(["bgmVolume","sfxVolume","ttsVolume","ducking"]);
  Object.entries(settings).forEach(([key,value]) => {
    const input = form.elements[key]; if (!input) return;
    if (input.type === "checkbox") input.checked = value;
    else input.value = percentFields.has(key) ? Math.round(Number(value) * 100) : value;
  });
  $("trackSelect").innerHTML = tracks.filter(t => t.enabled).map(t => `<option value="${t.id}">${t.title}</option>`).join(""); $("trackSelect").value = settings.track;
  updateOutputs(); $("speechSupport").textContent = speech.supported ? "✓ 音声認識を利用できます" : "⚠ このブラウザでは音声認識を利用できません";
}

async function saveFormSettings() {
  const form = $("settingsForm"); settings = {
    ...settings, bgmVolume:Number(form.bgmVolume.value)/100, sfxVolume:Number(form.sfxVolume.value)/100,
    ttsVolume:Number(form.ttsVolume.value)/100, ttsRate:Number(form.ttsRate.value), ducking:Number(form.ducking.value)/100,
    track:form.track.value, speechLang:form.speechLang.value, effects:form.effects.value, vibration:form.vibration.checked,
    rounds:Number(form.rounds.value), memoryLevel:form.memoryLevel.value
  }; audio.apply(settings); await store.saveSettings(settings); updateOutputs();
}

function updateOutputs() {
  $("bgmVolumeOut").textContent = `${Math.round(settings.bgmVolume*100)}%`; $("sfxVolumeOut").textContent = `${Math.round(settings.sfxVolume*100)}%`;
  $("ttsVolumeOut").textContent = `${Math.round(settings.ttsVolume*100)}%`; $("ttsRateOut").textContent = `${settings.ttsRate.toFixed(1)}×`; $("duckingOut").textContent = `${Math.round(settings.ducking*100)}%`;
}

async function refreshInfo() {
  try { await store.profile(); $("storageStatus").textContent = "保存状態：IndexedDB 正常"; } catch { $("storageStatus").textContent = "保存状態：エラー"; }
}

async function backup() {
  try { const markdown = buildMarkdown(await store.profile(), await store.getAll("progress")); downloadMarkdown(markdown); $("backupStatus").textContent = "バックアップを書き出しました。"; }
  catch { $("backupStatus").textContent = "書き出しに失敗しました。"; }
}

function effect(rating) {
  const canvas = $("fxCanvas"); const ctx = canvas.getContext("2d"); const dpr = devicePixelRatio || 1;
  canvas.width = innerWidth*dpr; canvas.height = innerHeight*dpr; ctx.scale(dpr,dpr);
  if (rating === "RETRY" || settings.effects === "reduced") return;
  const count = ({ GOOD:35, GREAT:70, PERFECT:120 })[rating]; const colors = ["#39e5ff","#a86bff","#ff6985","#ffe86b","#54dda2"];
  const particles = Array.from({length: settings.effects === "normal" ? Math.round(count*.6) : count}, () => ({ x:innerWidth/2,y:innerHeight*.42,vx:(Math.random()-.5)*12,vy:-Math.random()*10-2,g:.18+Math.random()*.12,size:2+Math.random()*6,color:colors[Math.floor(Math.random()*colors.length)] }));
  let frame=0; const draw=()=>{ ctx.clearRect(0,0,innerWidth,innerHeight); particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=p.g;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)}); if(++frame<55)requestAnimationFrame(draw);else ctx.clearRect(0,0,innerWidth,innerHeight);}; draw();
  document.body.animate([{filter:"brightness(1)"},{filter:rating==="PERFECT"?"brightness(1.8)":"brightness(1.35)"},{filter:"brightness(1)"}],{duration:rating==="PERFECT"?650:420});
}

function showToast(message, duration=1800) { const toast=$("toast"); toast.textContent=message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove("show"),duration); }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
init();
