const socket = io();

// ── SCREENS ──────────────────────────────────────────────
const screens = {
  menu:        document.getElementById('screen-menu'),
  waiting:     document.getElementById('screen-waiting'),
  game:        document.getElementById('screen-game'),
  leaderboard: document.getElementById('screen-leaderboard')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  if (name === 'game')   { initCanvas(); Audio.startAmbience(); }
  if (name === 'menu')   { Audio.stopAmbience(); startMenuCanvas(); }
}

// ── STATE ────────────────────────────────────────────────
let state = {
  roomId: null, myIndex: null,
  players: [], wind: 0,
  isMyTurn: false, round: 1
};

const WEAPONS = [
  { name:'Coconut',    emoji:'🥥', radius:22, color:'#8B4513', glow:'rgba(139,69,19,0.6)'  },
  { name:'Watermelon', emoji:'🍉', radius:32, color:'#2ECC40', glow:'rgba(46,204,64,0.6)'  },
  { name:'Meteor',     emoji:'☄️',  radius:44, color:'#FF4136', glow:'rgba(255,65,54,0.6)'  },
  { name:'Blackhole',  emoji:'🕳️',  radius:58, color:'#6C3483', glow:'rgba(108,52,131,0.6)' }
];

// ── CANVAS ───────────────────────────────────────────────
let canvas, ctx, W, H;
let buildings    = [];
let craters      = [];
let caps         = [null, null];
let animFrame    = null;
let sunShocked   = false;
let particles    = [];
let frameCount   = 0;
let projectileActive = false;
let proj = null;
let explosion = null;

const BCOLORS = ['#0d1b2a','#1a1a2e','#16213e','#0f3460','#1b1b2f','#2c003e','#12232e','#203647'];
const NEONS   = ['#ff0055','#00ffff','#ff9900','#00ff88','#ff00ff','#ffff00','#00aaff','#ff4444'];

function initCanvas() {
  canvas = document.getElementById('gameCanvas');
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  ctx = canvas.getContext('2d');
  if (animFrame) cancelAnimationFrame(animFrame);
  gameLoop();
}

window.addEventListener('resize', function() {
  if (!canvas || !screens.game.classList.contains('active')) return;
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
});

function setBuildings(serverBuildings, sW, sH) {
  var TOP = 58, BOT = 120;
  var sx  = W / sW;
  var sy  = (H - TOP - BOT) / sH;
  craters = [];
  buildings = serverBuildings.map(function(b, i) {
    return {
      x: b.x * sx,
      y: TOP + b.y * sy,
      w: b.w * sx,
      h: b.h * sy,
      color: BCOLORS[i % BCOLORS.length],
      neon:  NEONS[i  % NEONS.length]
    };
  });
  var b1 = buildings[1], b2 = buildings[8];
  caps[0] = { x: b1.x + b1.w / 2, y: b1.y, alive: true };
  caps[1] = { x: b2.x + b2.w / 2, y: b2.y, alive: true };
  console.log('CAP0:', caps[0].x, caps[0].y, 'CAP1:', caps[1].x, caps[1].y);
}

// ── GAME LOOP ────────────────────────────────────────────
function gameLoop() {
  frameCount++;
  renderScene();
  animFrame = requestAnimationFrame(gameLoop);
}

function renderScene() {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawStars();
  drawBuildings();
  drawParticles();
  drawSun();
  if (proj) stepProjectile();
  if (explosion) stepExplosion();
  drawCapybaras();
}

function drawSky() {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0,   '#050510');
  g.addColorStop(0.6, '#0a0a20');
  g.addColorStop(1,   '#0d0820');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawStars() {
  for (var i = 0; i < 80; i++) {
    var sx = (i * 137.5 + 50) % W;
    var sy = (i * 97.3  + 20) % (H * 0.5);
    var tw = 0.3 + 0.5 * Math.abs(Math.sin(frameCount * 0.02 + i));
    ctx.globalAlpha = tw * (i % 4 === 0 ? 0.9 : 0.4);
    ctx.fillStyle = i % 7 === 0 ? '#00cfff' : i % 5 === 0 ? '#bf5fff' : 'white';
    ctx.beginPath();
    ctx.arc(sx, sy, i % 3 === 0 ? 1.5 : 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBuildings() {
  buildings.forEach(function(b, idx) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    var wCols = Math.floor(b.w / 14);
    var wRows = Math.floor(b.h / 18);
    for (var r = 1; r < wRows - 1; r++) {
      for (var c = 0; c < wCols; c++) {
        var seed = (r * 7 + c * 13 + idx * 3) % 7;
        if (seed > 1) {
          var wx = b.x + c * 14 + 4;
          var wy = b.y + r * 18 + 4;
          ctx.fillStyle = seed % 3 === 0 ? 'rgba(0,207,255,0.7)' :
                          seed % 3 === 1 ? 'rgba(255,230,80,0.75)' :
                                           'rgba(191,95,255,0.6)';
          ctx.fillRect(wx, wy, 7, 9);
        }
      }
    }

    var neonPulse = 0.7 + 0.3 * Math.sin(frameCount * 0.05 + idx);
    ctx.globalAlpha = neonPulse;
    ctx.shadowColor = b.neon;
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = b.neon;
    ctx.fillRect(b.x + 6, b.y + 12, b.w - 12, 3);
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    ctx.strokeStyle = 'rgba(180,180,220,0.3)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y);
    ctx.lineTo(b.x + b.w / 2, b.y - 16);
    ctx.stroke();

    var blink = Math.sin(frameCount * 0.08 + idx * 1.3) > 0.6;
    ctx.fillStyle   = blink ? '#ff3333' : 'rgba(255,50,50,0.15)';
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur  = blink ? 8 : 0;
    ctx.beginPath();
    ctx.arc(b.x + b.w / 2, b.y - 18, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  craters.forEach(function(cr) {
    // Gaura neagra
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cr.x, cr.y, cr.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    // Gradient fade
    var grad = ctx.createRadialGradient(cr.x, cr.y, cr.r * 0.4, cr.x, cr.y, cr.r * 1.2);
    grad.addColorStop(0,   'rgba(0,0,0,0.95)');
    grad.addColorStop(0.6, 'rgba(40,15,0,0.7)');
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cr.x, cr.y, cr.r * 1.2, 0, Math.PI * 2);
    ctx.fill();
    // Ring portocaliu
    ctx.strokeStyle = 'rgba(255,100,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cr.x, cr.y, cr.r * 0.75, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawSun() {
  var pulse = 1 + 0.05 * Math.sin(frameCount * 0.04);
  ctx.save();
  ctx.translate(W / 2, 52);
  ctx.scale(pulse, pulse);
  ctx.shadowColor = sunShocked ? '#ff6600' : '#ffe600';
  ctx.shadowBlur  = 16;
  ctx.font        = '34px serif';
  ctx.textAlign   = 'center';
  ctx.fillText(sunShocked ? '😱' : '☀️', 0, 0);
  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawCapybara(cx, cy, playerIdx) {
  var dir  = playerIdx === 0 ? 1 : -1;
  var isMe = playerIdx === state.myIndex;
  var col  = isMe ? '#00ff88' : '#00cfff';
  var bounce = Math.sin(frameCount * 0.08 + playerIdx) * 2;
  cy = cy + bounce;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;

  // Umbra
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy + 5, 28, 0, Math.PI * 2);
  ctx.fill();

  // Picioare
  ctx.fillStyle = '#5a4008';
  ctx.fillRect(cx - 22, cy - 3, 11, 20);
  ctx.fillRect(cx - 8,  cy - 3, 11, 20);
  ctx.fillRect(cx + 5,  cy - 3, 11, 20);

  // Corp
  ctx.fillStyle = '#8B6914';
  ctx.beginPath();
  ctx.arc(cx, cy - 16, 28, 0, Math.PI * 2);
  ctx.fill();

  // Burta
  ctx.fillStyle = '#c8a040';
  ctx.beginPath();
  ctx.arc(cx, cy - 12, 18, 0, Math.PI * 2);
  ctx.fill();

  // Cap
  ctx.fillStyle = '#9B7A1A';
  ctx.beginPath();
  ctx.arc(cx + dir * 26, cy - 22, 18, 0, Math.PI * 2);
  ctx.fill();

  // Nas
  ctx.fillStyle = '#c8a040';
  ctx.beginPath();
  ctx.arc(cx + dir * 26, cy - 16, 13, 0, Math.PI * 2);
  ctx.fill();

  // Narile
  ctx.fillStyle = '#3d2800';
  ctx.beginPath();
  ctx.arc(cx + dir * 20, cy - 16, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + dir * 32, cy - 16, 3, 0, Math.PI * 2);
  ctx.fill();

  // Ureche
  ctx.fillStyle = '#b8860b';
  ctx.beginPath();
  ctx.arc(cx + dir * 16, cy - 38, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b030';
  ctx.beginPath();
  ctx.arc(cx + dir * 16, cy - 38, 5, 0, Math.PI * 2);
  ctx.fill();

  // Ochi cyber
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.arc(cx + dir * 22, cy - 26, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Ochelari
  ctx.strokeStyle = col;
  ctx.lineWidth   = 2;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 6;
  ctx.strokeRect(cx + dir * 14, cy - 31, 12, 10);
  ctx.shadowBlur = 0;

  // Coada
  ctx.fillStyle = '#7a5c10';
  ctx.beginPath();
  ctx.arc(cx - dir * 30, cy - 18, 9, 0, Math.PI * 2);
  ctx.fill();

  // Glow daca e tura mea
  if (isMe && state.isMyTurn) {
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth   = 3;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur  = 20;
    ctx.beginPath();
    ctx.arc(cx, cy - 16, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Nume
  var pname = (state.players[playerIdx] && state.players[playerIdx].name) || ('P' + (playerIdx + 1));
  ctx.font      = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 8;
  ctx.fillText(pname, cx, cy - 58);
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawCapybaras() {
  caps.forEach(function(cap, i) {
    if (cap && cap.alive) drawCapybara(cap.x, cap.y, i);
  });
}

// ── PARTICLES ────────────────────────────────────────────
function spawnParticles(x, y, color, count) {
  for (var i = 0; i < count; i++) {
    var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    var speed = 2 + Math.random() * 5;
    particles.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      decay: 0.025 + Math.random() * 0.02,
      r: 2 + Math.random() * 4,
      color: color
    });
  }
}

function drawParticles() {
  particles = particles.filter(function(p) { return p.life > 0; });
  particles.forEach(function(p) {
    p.x    += p.vx;
    p.y    += p.vy;
    p.vy   += 0.15;
    p.life -= p.decay;
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.1, p.r * p.life), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

// ── PROJECTILE ───────────────────────────────────────────
function fireProjectile(data) {
  if (projectileActive) return;
  projectileActive = true;

  var shooter = caps[data.playerIndex];
  var target  = caps[1 - data.playerIndex];
  if (!shooter || !target) { projectileActive = false; return; }

  var weapon = WEAPONS[0];
  for (var wi = 0; wi < WEAPONS.length; wi++) {
    if (WEAPONS[wi].name === data.weapon.name) { weapon = WEAPONS[wi]; break; }
  }

  var angle = data.angle * Math.PI / 180;
  if (data.playerIndex === 1) angle = Math.PI - angle;
  var speed = data.velocity * 0.22;

  Audio.shoot();

  proj = {
    px: shooter.x, py: shooter.y - 20,
    vx: Math.cos(angle) * speed,
    vy: -Math.sin(angle) * speed,
    weapon: weapon,
    trail: [],
    iAmShooter: data.shooterId === socket.id,
    target: target,
    t: 0
  };
}

function stepProjectile() {
  if (!proj) return;

  proj.vx += state.wind * 0.003;
  proj.vy += 0.2;
  proj.px += proj.vx;
  proj.py += proj.vy;
  proj.t++;

  proj.trail.push({ x: proj.px, y: proj.py });
  if (proj.trail.length > 10) proj.trail.shift();

  proj.trail.forEach(function(pt, idx) {
    ctx.globalAlpha = (idx / proj.trail.length) * 0.5;
    ctx.fillStyle   = proj.weapon.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, (idx / proj.trail.length) * 3 + 1, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.shadowColor = proj.weapon.glow;
  ctx.shadowBlur  = 12;
  ctx.font        = proj.weapon.radius + 'px serif';
  ctx.textAlign   = 'center';
  ctx.fillText(proj.weapon.emoji, proj.px, proj.py);
  ctx.restore();

  sunShocked = Math.abs(proj.px - W / 2) < 45 && proj.py < 85;
  if (proj.t % 6 === 0) spawnParticles(proj.px, proj.py, proj.weapon.color, 3);

  var px = proj.px, py = proj.py;
  var weapon = proj.weapon;
  var iAmShooter = proj.iAmShooter;
  var target = proj.target;

  var dist = Math.hypot(px - target.x, py - (target.y - 14));
  if (dist < 42) {
    proj = null; projectileActive = false;
    Audio.explodeHit();
    spawnParticles(px, py, weapon.color, 35);
    spawnParticles(px, py, '#ffffff', 15);
    doExplosion(px, py, weapon, false);
    if (iAmShooter) socket.emit('shotResult', { roomId: state.roomId, hit: true });
    return;
  }

  var hitB = null;
  for (var bi = 0; bi < buildings.length; bi++) {
    var b = buildings[bi];
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { hitB = b; break; }
  }
  if (hitB) {
    proj = null; projectileActive = false;
    Audio.explodeBuild();
    craters.push({ x: px, y: py, r: weapon.radius * 2.5 });
    spawnParticles(px, py, hitB.neon, 20);
    doExplosion(px, py, weapon, true);
    if (iAmShooter) socket.emit('shotResult', { roomId: state.roomId, hit: false });
    return;
  }

  if (py > H - 5) {
    proj = null; projectileActive = false;
    Audio.explodeBuild();
    craters.push({ x: px, y: py, r: weapon.radius * 2 });
    spawnParticles(px, py, '#888', 12);
    doExplosion(px, py, weapon, true);
    if (iAmShooter) socket.emit('shotResult', { roomId: state.roomId, hit: false });
    return;
  }

  if (px < -60 || px > W + 60 || py > H + 60 || proj.t > 700) {
    proj = null; projectileActive = false;
    if (iAmShooter) socket.emit('shotResult', { roomId: state.roomId, hit: false });
  }
}


function doExplosion(x, y, weapon, isBuilding) {
  explosion = {
    x: x, y: y,
    r: 0,
    maxR: weapon.radius * (isBuilding ? 1.4 : 2.2),
    color: isBuilding ? '#ff5500' : weapon.color,
    glow:  weapon.glow
  };
}

function stepExplosion() {
  if (!explosion) return;
  var e = explosion;
  var alpha = 1 - e.r / e.maxR;

  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  ctx.fillStyle   = e.color;
  ctx.shadowColor = e.glow;
  ctx.shadowBlur  = 18;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  e.r += 6;
  if (e.r >= e.maxR) explosion = null;
}

// ── MENU CANVAS ──────────────────────────────────────────
function startMenuCanvas() {
  var mc = document.getElementById('menu-canvas');
  if (!mc) return;
  mc.width  = window.innerWidth;
  mc.height = window.innerHeight;
  var mctx = mc.getContext('2d');
  var mf = 0;
  var dots = [];
  for (var i = 0; i < 60; i++) {
    dots.push({
      x:  Math.random() * mc.width,
      y:  Math.random() * mc.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r:  Math.random() * 2 + 0.5,
      c:  NEONS[Math.floor(Math.random() * NEONS.length)]
    });
  }
  function menuFrame() {
    if (!screens.menu.classList.contains('active')) return;
    mf++;
    mctx.clearRect(0, 0, mc.width, mc.height);
    mctx.strokeStyle = 'rgba(0,207,255,0.04)';
    mctx.lineWidth   = 1;
    for (var x = 0; x < mc.width; x += 60) {
      mctx.beginPath(); mctx.moveTo(x, 0); mctx.lineTo(x, mc.height); mctx.stroke();
    }
    for (var y = 0; y < mc.height; y += 60) {
      mctx.beginPath(); mctx.moveTo(0, y); mctx.lineTo(mc.width, y); mctx.stroke();
    }
    dots.forEach(function(d) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0) d.x = mc.width;
      if (d.x > mc.width) d.x = 0;
      if (d.y < 0) d.y = mc.height;
      if (d.y > mc.height) d.y = 0;
      mctx.fillStyle   = d.c;
      mctx.shadowColor = d.c;
      mctx.shadowBlur  = 8;
      mctx.globalAlpha = 0.6 + 0.3 * Math.sin(mf * 0.05 + d.x);
      mctx.beginPath();
      mctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      mctx.fill();
    });
    mctx.globalAlpha = 1;
    mctx.shadowBlur  = 0;
    requestAnimationFrame(menuFrame);
  }
  menuFrame();
}

// ── CONTROLS ─────────────────────────────────────────────
var angleSlider    = document.getElementById('angle');
var velocitySlider = document.getElementById('velocity');
var btnShoot       = document.getElementById('btn-shoot');

angleSlider.addEventListener('input', function() {
  document.getElementById('angle-val').textContent = angleSlider.value;
});
velocitySlider.addEventListener('input', function() {
  document.getElementById('velocity-val').textContent = velocitySlider.value;
});

btnShoot.addEventListener('click', function() {
  if (!state.isMyTurn || projectileActive) return;
  setMyTurn(false);
  Audio.init();
  socket.emit('shoot', {
    roomId:   state.roomId,
    angle:    parseInt(angleSlider.value),
    velocity: parseInt(velocitySlider.value)
  });
});

function setMyTurn(val) {
  state.isMyTurn    = val;
  btnShoot.disabled = !val;
  document.getElementById('turn-indicator').textContent =
    val ? '🎯 TURA TA — LANSEAZĂ!' : '⏳ AȘTEPȚI TURA ADVERSARULUI...';
}

function updateHUD() {
  var w = state.wind;
  document.getElementById('hud-wind').textContent =
    w > 0 ? ('💨 →' + w) : w < 0 ? ('💨 ←' + Math.abs(w)) : '💨 CALM';
  document.getElementById('hud-round').textContent = 'ROUND ' + state.round;
}

function showOverlay(title, msg, extra, isWin) {
  document.getElementById('overlay-icon').textContent   = isWin ? '🏆' : '💀';
  document.getElementById('overlay-title').textContent  = title;
  document.getElementById('overlay-msg').textContent    = msg;
  document.getElementById('overlay-weapon').textContent = extra;
  document.getElementById('overlay-round').classList.remove('hidden');
}
function hideOverlay() {
  document.getElementById('overlay-round').classList.add('hidden');
}

// ── DIFFICULTY ───────────────────────────────────────────
var selectedDiff = 'easy';
document.querySelectorAll('.btn-diff').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.btn-diff').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    selectedDiff = btn.dataset.diff;
  });
});

// ── MENU EVENTS ──────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click', function() {
  var name = document.getElementById('player-name').value.trim();
  if (!name) { alert('Introdu CALLSIGN-ul tau!'); return; }
  socket.emit('findMatch', name);
  showScreen('waiting');
});

document.getElementById('btn-ai').addEventListener('click', function() {
  var name = document.getElementById('player-name').value.trim();
  if (!name) { alert('Introdu CALLSIGN-ul tau!'); return; }
  socket.emit('findAI', { playerName: name, difficulty: selectedDiff });
  showScreen('game');
});

document.getElementById('btn-cancel').addEventListener('click', function() {
  socket.emit('cancelMatch');
  showScreen('menu');
});

document.getElementById('btn-leaderboard').addEventListener('click', loadLeaderboard);
document.getElementById('btn-back').addEventListener('click', function() { showScreen('menu'); });

// ── SOCKET EVENTS ────────────────────────────────────────
socket.on('waiting', function() {
  document.getElementById('waiting-msg').textContent = 'Cautare adversar in matrice...';
});

socket.on('matchFound', function(data) {
  state.roomId  = data.roomId;
  state.players = data.players;
  state.wind    = data.wind;
  state.myIndex = -1;
  for (var i = 0; i < data.players.length; i++) {
    if (data.players[i].id === socket.id) { state.myIndex = i; break; }
  }
  state.round = 1;
  projectileActive = false;
  particles = [];

  document.getElementById('name-p1').textContent   = data.players[0].name;
  document.getElementById('name-p2').textContent   = data.players[1].name;
  document.getElementById('wins-p1').textContent   = '⭐ 0';
  document.getElementById('wins-p2').textContent   = '⭐ 0';
  document.getElementById('weapon-p1').textContent = '🥥 Coconut';
  document.getElementById('weapon-p2').textContent = '🥥 Coconut';

  updateHUD();
  showScreen('game');
  setBuildings(data.buildings, data.W, data.H);

  var isMyTurn = data.yourTurn === socket.id;
  setTimeout(function() { setMyTurn(isMyTurn); }, 1000);
});

socket.on('shotFired', function(data) {
  fireProjectile(data);
});

socket.on('turnChange', function(data) {
  state.wind = data.wind;
  sunShocked = false;
  updateHUD();
  var isMyTurn = data.yourTurn === socket.id;
  setTimeout(function() { setMyTurn(isMyTurn); }, 300);
});

socket.on('roundOver', function(data) {
  var isWin = data.winnerId === socket.id;
  if (isWin) Audio.victory(); else Audio.defeat();
  if (data.weapon && data.weapon.name !== 'Coconut') Audio.upgrade();

  data.scores.forEach(function(s, i) {
    document.getElementById('wins-p' + (i + 1)).textContent = '⭐ ' + s.wins;
  });

  var wi = -1;
  for (var i = 0; i < state.players.length; i++) {
    if (state.players[i].name === data.winner) { wi = i; break; }
  }
  if (wi !== -1 && data.weapon) {
    document.getElementById('weapon-p' + (wi + 1)).textContent =
      data.weapon.emoji + ' ' + data.weapon.name;
  }

  showOverlay(
    isWin ? '🏆 VICTORIE!' : '💀 INFRANGERE!',
    data.winner + ' a lovit tinta!',
    (data.weapon && data.weapon.name !== 'Coconut') ? ('⚡ UPGRADE: ' + data.weapon.emoji + ' ' + data.weapon.name + '!') : '',
    isWin
  );
});

socket.on('newRound', function(data) {
  state.wind       = data.wind;
  state.round      = data.round;
  sunShocked       = false;
  projectileActive = false;
  particles        = [];
  proj             = null;
  explosion        = null;
  hideOverlay();
  updateHUD();
  setBuildings(data.buildings, 1280, 720);
  var isMyTurn = data.yourTurn === socket.id;
  setTimeout(function() { setMyTurn(isMyTurn); }, 600);
});

socket.on('playerLeft', function() {
  Audio.defeat();
  showOverlay('ADVERSARUL A PLECAT!', 'Conexiune pierduta.', '', false);
  setTimeout(function() { showScreen('menu'); }, 3000);
});

// ── LEADERBOARD ──────────────────────────────────────────
function loadLeaderboard() {
  showScreen('leaderboard');
  fetch('/api/leaderboard')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var list = document.getElementById('leaderboard-list');
      if (!data.length) {
        list.innerHTML = '<p style="text-align:center;color:#6677aa;padding:30px;letter-spacing:2px">// NO DATA //</p>';
        return;
      }
      list.innerHTML = data.map(function(r, i) {
        var rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
        return '<div class="lb-row"><span class="lb-rank">' + rank + '</span>' +
               '<span class="lb-name">' + r.player_name + '</span>' +
               '<span class="lb-wins">' + r.wins + 'W</span></div>';
      }).join('');
    })
    .catch(function() {
      document.getElementById('leaderboard-list').innerHTML =
        '<p style="text-align:center;color:#ff3366;padding:20px">// ERROR //</p>';
    });
}

// ── INIT ─────────────────────────────────────────────────
startMenuCanvas();
