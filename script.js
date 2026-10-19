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
  }
}

function finish(won) {
  state = won ? "won" : "lost";
  jumpButton.disabled = true;
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

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
jumpButton.addEventListener("click", jump);
window.addEventListener("keydown", event => {
  if (event.code !== "Space") return;
  if (event.repeat) return;
  if (document.activeElement?.tagName === "BUTTON") document.activeElement.blur();
  event.preventDefault();
  if (state === "playing") jump();
  else startGame();
});
requestAnimationFrame(frame);
