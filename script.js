"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTag = document.getElementById("overlayTag");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");
const jumpButton = document.getElementById("jumpButton");
const restartButton = document.getElementById("restartButton");
const soundButton = document.getElementById("soundButton");
const recordForm = document.getElementById("recordForm");
const nicknameInput = document.getElementById("nickname");
const recordMessage = document.getElementById("recordMessage");
const rankingBody = document.getElementById("rankingBody");
const RANKING_KEY = "jumpTimingRankingV1";
const RANKING_LIMIT = 10;
let rankings = [];
let roundStartedAt = 0;
let finalResult = null;
let recordSaved = false;

const W = canvas.width;
const H = canvas.height;
const GROUND_Y = 338;
const TARGET = 10;
const GRAVITY = 1800;
const JUMP_VELOCITY = -680;
const SPEED = 320;
const PLAYER = { x: 138, width: 43, height: 54 };

let state = "ready";
let playerY = GROUND_Y - PLAYER.height;
let verticalSpeed = 0;
let obstacles = [];
let score = 0;
let spawnTimer = 1.5;
let groundOffset = 0;
let lastTime = 0;
let best = 0;
// AudioContext is created only after a user gesture to meet browser autoplay policies.
let audioContext = null;
let soundEnabled = true;

function playJumpSound() {
  if (!soundEnabled) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return; // Game remains playable without Web Audio support.

  try {
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") {
      // Called from a click or keypress handler, so resume is permitted.
      audioContext.resume().catch(() => {});
    }

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(360, now);
    oscillator.frequency.exponentialRampToValueAtTime(720, now + 0.11);
    oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.2);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.23);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch (error) {
    // Audio is optional; an unavailable audio device must not stop gameplay.
    console.warn("점프 효과음을 재생할 수 없습니다.", error);
  }
}

// Play a short note using the same audio system as the jump sound.
// delay and duration are in seconds, so no timers or external audio files are needed.
function playEndNote(frequency, delay, duration, type = "sine", volume = 0.14) {
  if (!audioContext || audioContext.state !== "running") return;
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

function playEndingSound(won) {
  if (!soundEnabled) return;
  try {
    // The audio context has already been unlocked by the user's jump gesture.
    if (!audioContext || audioContext.state !== "running") return;
    if (won) {
      // Bright, ascending victory fanfare.
      playEndNote(523.25, 0.00, 0.18);
      playEndNote(659.25, 0.16, 0.18);
      playEndNote(783.99, 0.32, 0.18);
      playEndNote(1046.50, 0.49, 0.46, "triangle", 0.17);
    } else {
      // Lower, descending loss melody.
      playEndNote(392.00, 0.00, 0.23, "triangle", 0.13);
      playEndNote(311.13, 0.21, 0.24, "triangle", 0.13);
      playEndNote(196.00, 0.43, 0.48, "triangle", 0.14);
    }
  } catch (error) {
    console.warn("엔딩 효과음을 재생할 수 없습니다.", error);
  }
}

function updateSoundButton() {
  soundButton.textContent = soundEnabled ? "🔊 소리 켜짐" : "🔇 소리 꺼짐";
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
}

try { best = Number(localStorage.getItem("jumpTimingBest") || 0) || 0; }
catch { /* Local storage may be blocked: game still works. */ }
bestEl.textContent = String(best);

function showOverlay(tag, title, description, buttonLabel) {
  overlayTag.textContent = tag;
  overlayTitle.textContent = title;
  overlayText.textContent = description;
  startButton.textContent = buttonLabel;
  overlay.classList.remove("hidden");
}

function startGame() {
  finalResult = null;
  recordSaved = false;
  recordForm.classList.add("hidden");
  nicknameInput.value = "";
  nicknameInput.disabled = false;
  recordForm.querySelector('button[type="submit"]').disabled = false;
  roundStartedAt = performance.now();
  score = 0;
  scoreEl.textContent = "0";
  playerY = GROUND_Y - PLAYER.height;
  verticalSpeed = 0;
  obstacles = [];
  spawnTimer = 1.45;
  groundOffset = 0;
  state = "playing";
  jumpButton.disabled = false;
  overlay.classList.add("hidden");
  lastTime = performance.now();
}

function jump() {
  if (state !== "playing") return;
  if (playerY >= GROUND_Y - PLAYER.height - 0.5) {
    verticalSpeed = JUMP_VELOCITY;
    playJumpSound();
  }
}

function finish(won) {
  if (state !== "playing") return; // Prevent repeated ending sounds.
  state = won ? "won" : "lost";
  finalResult = {
    score,
    won,
    durationMs: Math.max(0, Math.round(performance.now() - roundStartedAt)),
  };
  recordSaved = false;
  recordForm.classList.remove("hidden");
  recordMessage.textContent = "닉네임을 입력하면 이번 기록이 랭킹에 등록됩니다.";
  jumpButton.disabled = true;
  playEndingSound(won);
  if (score > best) {
    best = score;
    bestEl.textContent = String(best);
    try { localStorage.setItem("jumpTimingBest", String(best)); }
    catch { /* Storage is optional. */ }
  }
  showOverlay(
    won ? "MISSION CLEAR!" : "GAME OVER",
    won ? "완벽한 점프! 🎉" : "아깝게 부딪혔어요!",
    won ? `장애물 ${TARGET}개를 모두 통과했습니다!` : `${score}개 통과했어요. 한 번 더 도전해 보세요!`,
    "다시 도전하기 →"
  );
}

function spawnObstacle() {
  obstacles.push({ x: W + 28, width: 34, height: 43, passed: false });
}

function update(dt) {
  if (state !== "playing") return;
  verticalSpeed += GRAVITY * dt;
  playerY += verticalSpeed * dt;
  const floor = GROUND_Y - PLAYER.height;
  if (playerY > floor) { playerY = floor; verticalSpeed = 0; }

  groundOffset = (groundOffset + SPEED * dt) % 55;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnObstacle();
    // Obstacles arrive at regular, learnable intervals with a little variety.
    spawnTimer = 1.55 + Math.random() * 0.45;
  }

  for (const obs of obstacles) {
    obs.x -= SPEED * dt;
    // Slightly inset hitboxes avoid unfair collisions at visual edges.
    const hit = PLAYER.x + 7 < obs.x + obs.width - 5 &&
      PLAYER.x + PLAYER.width - 7 > obs.x + 5 &&
      playerY + PLAYER.height - 4 > GROUND_Y - obs.height + 6 &&
      playerY + 9 < GROUND_Y - 4;
    if (hit) { finish(false); return; }
    if (!obs.passed && obs.x + obs.width < PLAYER.x) {
      obs.passed = true;
      score += 1;
      scoreEl.textContent = String(score);
      if (score >= TARGET) { finish(true); return; }
    }
  }
  obstacles = obstacles.filter(obs => obs.x + obs.width > -20);
}

function roundRect(x, y, width, height, radius, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#1b345c");
  sky.addColorStop(1, "#29496c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffffff33";
  for (let i = 0; i < 26; i++) {
    const x = (i * 143 + 39) % W;
    const y = (i * 71 + 37) % 220;
    ctx.fillRect(x, y, i % 3 === 0 ? 3 : 2, 2);
  }
  ctx.fillStyle = "#355679";
  for (let x = -40; x < W + 70; x += 150) {
    ctx.beginPath();
    ctx.arc(x + 65, 345, 105, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillStyle = "#223c57";
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = "#71f4d2";
  ctx.fillRect(0, GROUND_Y, W, 5);
  ctx.fillStyle = "#486481";
  for (let x = -groundOffset; x < W; x += 55) ctx.fillRect(x, GROUND_Y + 48, 28, 4);

  // Player shadow and rounded body.
  ctx.fillStyle = "#09152670";
  ctx.beginPath();
  ctx.ellipse(PLAYER.x + PLAYER.width / 2, GROUND_Y + 8, 28, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  roundRect(PLAYER.x, playerY, PLAYER.width, PLAYER.height, 12, "#73f5d5");
  roundRect(PLAYER.x + 6, playerY + 6, PLAYER.width - 12, 8, 4, "#c8fff1");
  ctx.fillStyle = "#142b42";
  ctx.fillRect(PLAYER.x + 29, playerY + 23, 5, 7);
  ctx.fillRect(PLAYER.x + 19, playerY + 23, 5, 7);
  ctx.fillRect(PLAYER.x + 23, playerY + 39, 8, 3);

  for (const obs of obstacles) {
    const y = GROUND_Y - obs.height;
    roundRect(obs.x, y, obs.width, obs.height, 5, "#ff779c");
    roundRect(obs.x + 6, y + 6, obs.width - 12, 6, 3, "#ffc5d6");
    ctx.fillStyle = "#bd3e69";
    ctx.fillRect(obs.x + 5, y + obs.height - 9, obs.width - 10, 4);
  }

  ctx.font = "700 16px system-ui";
  ctx.fillStyle = "#c4d4ea";
  ctx.fillText(state === "playing" ? "장애물이 다가오면 점프!" : "SPACE = JUMP", 30, 36);
  roundRect(W - 235, 24, 205, 13, 7, "#11223f");
  if (score > 0) roundRect(W - 235, 24, 205 * score / TARGET, 13, 7, "#71f4d2");
}

function frame(timestamp) {
  // Cap elapsed time to prevent giant simulation jumps when a tab regains focus.
  const dt = Math.min((timestamp - (lastTime || timestamp)) / 1000, 0.035);
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}


// Up to ten local records. No personal data is sent to any server.
function loadRankings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RANKING_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(row => row && typeof row.nickname === "string" &&
      Number.isInteger(row.score) && row.score >= 0 && row.score <= TARGET &&
      typeof row.won === "boolean" && Number.isFinite(row.durationMs) &&
      row.durationMs >= 0 && typeof row.savedAt === "string")
      .slice(0, 100).sort(compareRecords).slice(0, RANKING_LIMIT);
  } catch { return []; }
}

function compareRecords(a, b) {
  return b.score - a.score || a.durationMs - b.durationMs ||
    a.savedAt.localeCompare(b.savedAt);
}

function formatDuration(ms) {
  return (ms / 1000).toFixed(1) + "초";
}

function renderRankings() {
  rankingBody.replaceChildren();
  if (!rankings.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "ranking-empty";
    td.textContent = "아직 등록된 기록이 없습니다. 게임을 끝내고 닉네임을 남겨보세요!";
    tr.append(td);
    rankingBody.append(tr);
    return;
  }
  rankings.forEach((entry, index) => {
    const row = document.createElement("tr");
    const values = [String(index + 1), entry.nickname,
      `${entry.score}/${TARGET} · ${formatDuration(entry.durationMs)}`,
      entry.won ? "승리" : "패배", entry.savedAt.slice(0, 10)];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value; // textContent prevents injected markup.
      row.append(cell);
    }
    rankingBody.append(row);
  });
}

rankings = loadRankings();
renderRankings();
recordForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!finalResult || recordSaved || (state !== "won" && state !== "lost")) return;
  const nickname = nicknameInput.value.trim().replace(/\s+/g, " ");
  if (nickname.length < 1 || nickname.length > 12) {
    recordMessage.textContent = "닉네임은 1~12자로 입력해 주세요.";
    nicknameInput.focus();
    return;
  }
  const entry = { ...finalResult, nickname, savedAt: new Date().toISOString() };
  const next = [...rankings, entry].sort(compareRecords).slice(0, RANKING_LIMIT);
  try {
    localStorage.setItem(RANKING_KEY, JSON.stringify(next));
  } catch {
    recordMessage.textContent = "저장 공간에 접근할 수 없습니다. 브라우저의 저장 설정을 확인해 주세요.";
    return;
  }
  rankings = next;
  recordSaved = true;
  renderRankings();
  recordMessage.textContent = rankings.includes(entry) ?
    "기록이 TOP 10에 저장되었습니다!" : "이번 기록은 TOP 10 밖입니다. 다음에 다시 도전해 보세요!";
  nicknameInput.disabled = true;
  recordForm.querySelector('button[type="submit"]').disabled = true;
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  updateSoundButton();
});
updateSoundButton();
jumpButton.addEventListener("click", jump);
window.addEventListener("keydown", event => {
  if (event.code !== "Space") return;
  if (event.repeat) return;
  if (document.activeElement?.matches("input, textarea, select")) return;
  if (document.activeElement?.tagName === "BUTTON") document.activeElement.blur();
  event.preventDefault();
  if (state === "playing") jump();
  else if (state === "ready") startGame();
});
requestAnimationFrame(frame);
