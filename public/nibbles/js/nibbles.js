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
  if (name === 'game') initGame();
  if (name === 'menu') startMenuBg();
}

// ── STATE ────────────────────────────────────────────────
let state = {
  roomId: null, myIndex: 0,
  players: [], level: 1,
  numPlayers: 1, vsAI: false,
  difficulty: 'easy', running: false
};

// ── CANVAS ───────────────────────────────────────────────
let canvas, ctx, W, H;
let COLS, ROWS, CELL;
const HEADER = 52;

function initGame() {
  canvas = document.getElementById('gameCanvas');
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  ctx = canvas.getContext('2d');
  CELL = Math.floor(Math.min(W, H - HEADER) / 40);
  COLS = Math.floor(W / CELL);
  ROWS = Math.floor((H - HEADER) / CELL);
}

window.addEventListener('resize', () => {
  if (!canvas || !screens.game.classList.contains('active')) return;
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  CELL = Math.floor(Math.min(W, H - HEADER) / 40);
  COLS = Math.floor(W / CELL);
  ROWS = Math.floor((H - HEADER) / CELL);
});

// ── SNAKE GAME ───────────────────────────────────────────
const DIRS = { UP:[0,-1], DOWN:[0,1], LEFT:[-1,0], RIGHT:[1,0] };
const NEONS = ['#00ff88','#00cfff','#bf5fff','#ff3366','#ffe600','#ff9900'];

let snakes    = [];
let food      = null;
let level     = 1;
let gameLoop  = null;
let frameRate = 150;
let particles = [];
let frameCount = 0;
let currentFoodNum = 1;
let obstacles = [];
let serverMode = false;

const SPEED_BY_LEVEL = [150, 130, 110, 95, 80, 68, 58, 50, 42, 36];

function getSpeed(lvl) {
  return SPEED_BY_LEVEL[Math.min(lvl - 1, SPEED_BY_LEVEL.length - 1)];
}

// Snake factory
function makeSafeStart(preferX, preferY, dir) {
  // Daca pozitia preferata e libera, o folosim
  if (!isObstacle(preferX, preferY)) return { x: preferX, y: preferY };

  // Altfel cautam cea mai apropiata pozitie libera
  for (var r = 1; r < Math.max(COLS, ROWS); r++) {
    for (var dx = -r; dx <= r; dx++) {
      for (var dy = -r; dy <= r; dy++) {
        var nx = preferX + dx;
        var ny = preferY + dy;
        if (nx > 1 && nx < COLS - 2 && ny > 1 && ny < ROWS - 2 && !isObstacle(nx, ny)) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return { x: preferX, y: preferY };
}

function makeSnake(idx, numPlayers) {
  var colors   = ['#00ff88', '#ff3366'];
  var prefX    = idx === 0 ? Math.floor(COLS * 0.15) : Math.floor(COLS * 0.82);
  var prefY    = Math.floor(ROWS / 2);
  var dir      = idx === 0 ? 'RIGHT' : 'LEFT';
  var safePos  = makeSafeStart(prefX, prefY, dir);

  return {
    idx:         idx,
    body:        [{ x: safePos.x, y: safePos.y }],
    dir:         dir,
    nextDir:     dir,
    color:       colors[idx],
    score:       0,
    lives:       3,
    alive:       true,
    isAI:        false,
    growPending: 0
  };
}

function startNibblesGame(numPlayers, vsAI, difficulty, lvl) {
  if (gameLoop) clearInterval(gameLoop);
  level          = lvl || 1;
  currentFoodNum = 1;
  frameCount     = 0;
  particles      = [];
  snakes         = [];

  for (let i = 0; i < numPlayers; i++) {
    const s = makeSnake(i, numPlayers);
    if (i === 1 && vsAI) s.isAI = true;
    snakes.push(s);
  }

  generateObstacles(level);
  spawnFood();
  updateHUD();

  frameRate = getSpeed(level);
  gameLoop  = setInterval(gameTick, frameRate);
}

// ── FOOD ─────────────────────────────────────────────────
// Patterns obstacole per nivel (coordonate relative 0-1, scalate la COLS/ROWS)
function generateObstacles(lvl) {
  obstacles = [];
  if (lvl <= 1) return; // Nivel 1 fara obstacole

  // NOTA: x intre 0.22-0.78 pentru a lasa libere zonele de spawn
  // P1 spawn: col ~15%, P2 spawn: col ~82%, ambii la row ~50%
  var patterns = {
    2: [ // Cruce centrala
      {x:0.49, y:0.22, w:0.02, h:0.56},
      {x:0.22, y:0.49, w:0.56, h:0.02}
    ],
    3: [ // 4 blocuri interior
      {x:0.35, y:0.25, w:0.1, h:0.1},
      {x:0.55, y:0.25, w:0.1, h:0.1},
      {x:0.35, y:0.65, w:0.1, h:0.1},
      {x:0.55, y:0.65, w:0.1, h:0.1}
    ],
    4: [ // Zid vertical centru cu deschideri
      {x:0.49, y:0.1,  w:0.02, h:0.35},
      {x:0.49, y:0.55, w:0.02, h:0.35}
    ],
    5: [ // H shape
      {x:0.35, y:0.2,  w:0.02, h:0.6},
      {x:0.63, y:0.2,  w:0.02, h:0.6},
      {x:0.35, y:0.49, w:0.3,  h:0.02}
    ],
    6: [ // Patru ziduri scurte
      {x:0.49, y:0.1,  w:0.02, h:0.25},
      {x:0.49, y:0.65, w:0.02, h:0.25},
      {x:0.25, y:0.49, w:0.2,  h:0.02},
      {x:0.55, y:0.49, w:0.2,  h:0.02}
    ],
    7: [ // U shape
      {x:0.35, y:0.2,  w:0.3,  h:0.02},
      {x:0.35, y:0.2,  w:0.02, h:0.45},
      {x:0.63, y:0.2,  w:0.02, h:0.45}
    ],
    8: [ // Doua L-uri
      {x:0.35, y:0.25, w:0.02, h:0.3},
      {x:0.35, y:0.55, w:0.15, h:0.02},
      {x:0.63, y:0.45, w:0.02, h:0.3},
      {x:0.5,  y:0.45, w:0.15, h:0.02}
    ],
    9: [ // Labirint complex
      {x:0.49, y:0.15, w:0.02, h:0.28},
      {x:0.49, y:0.57, w:0.02, h:0.28},
      {x:0.25, y:0.35, w:0.22, h:0.02},
      {x:0.53, y:0.63, w:0.22, h:0.02},
      {x:0.35, y:0.22, w:0.02, h:0.15},
      {x:0.63, y:0.63, w:0.02, h:0.15}
    ]
  };

  const pattern = patterns[Math.min(lvl, 9)] || [];
  pattern.forEach(function(p) {
    var x1 = Math.floor(p.x * COLS);
    var y1 = Math.floor(p.y * ROWS);
    var x2 = Math.max(1, Math.floor(p.w * COLS));
    var y2 = Math.max(1, Math.floor(p.h * ROWS));
    for (var cx = x1; cx < x1 + x2; cx++) {
      for (var cy = y1; cy < y1 + y2; cy++) {
        if (cx > 0 && cx < COLS-1 && cy > 0 && cy < ROWS-1) {
          obstacles.push({x: cx, y: cy});
        }
      }
    }
  });
}

function isObstacle(x, y) {
  return obstacles.some(function(o) { return o.x === x && o.y === y; });
}

function spawnFood() {
  let x, y, tries = 0;
  do {
    x = Math.floor(Math.random() * (COLS - 2)) + 1;
    y = Math.floor(Math.random() * (ROWS - 2)) + 1;
    tries++;
  } while (tries < 100 && (
    snakes.some(function(s) { return s.body.some(function(b) { return b.x === x && b.y === y; }); }) ||
    isObstacle(x, y)
  ));
  food = { x, y, num: currentFoodNum, pulse: 0 };
  document.getElementById('hud-num').textContent = '🎯 ' + currentFoodNum + ' / 9';
}

// ── AI LOGIC ─────────────────────────────────────────────
function aiMove(snake) {
  if (!food) return;
  const head   = snake.body[0];
  const target = food;
  const dirs   = Object.entries(DIRS);

  // Prioritize direction toward food
  let bestDir  = snake.dir;
  let bestDist = Infinity;

  dirs.forEach(([name, [dx, dy]]) => {
    // Avoid reverse
    const rev = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT' };
    if (rev[snake.dir] === name) return;

    const nx = head.x + dx;
    const ny = head.y + dy;

    // Avoid walls
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;

    // Avoid self
    if (snake.body.some(b => b.x === nx && b.y === ny)) return;

    // Avoid other snakes
    const blocked = snakes.some(s => s !== snake && s.body.some(b => b.x === nx && b.y === ny));
    if (blocked) return;

    const dist = Math.abs(nx - target.x) + Math.abs(ny - target.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestDir  = name;
    }
  });

  // Add error based on difficulty
  const errorChance = { easy: 0.35, medium: 0.15, hard: 0.04 };
  if (Math.random() < (errorChance[state.difficulty] || 0.15)) {
    const validDirs = dirs.filter(([name, [dx, dy]]) => {
      const rev = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT' };
      if (rev[snake.dir] === name) return false;
      const nx = head.x + dx, ny = head.y + dy;
      return nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS;
    });
    if (validDirs.length) bestDir = validDirs[Math.floor(Math.random() * validDirs.length)][0];
  }

  snake.nextDir = bestDir;
}

// ── GAME TICK ─────────────────────────────────────────────
function gameTick() {
  frameCount++;

  snakes.forEach(snake => {
    if (!snake.alive) return;

    // AI move
    if (snake.isAI) aiMove(snake);

    // Apply direction
    snake.dir = snake.nextDir;
    const [dx, dy] = DIRS[snake.dir];
    const head = snake.body[0];
    const nx = head.x + dx;
    const ny = head.y + dy;

    // Wall collision
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      killSnake(snake);
      return;
    }

    // Obstacol collision
    if (isObstacle(nx, ny)) {
      killSnake(snake);
      return;
    }

    // Self collision
    if (snake.body.some(b => b.x === nx && b.y === ny)) {
      killSnake(snake);
      return;
    }

    // Other snake collision
    const otherHit = snakes.find(s => s !== snake && s.body.some(b => b.x === nx && b.y === ny));
    if (otherHit) {
      killSnake(snake);
      return;
    }

    // Move
    snake.body.unshift({ x: nx, y: ny });

    // Eat food
    if (food && nx === food.x && ny === food.y) {
      const pts = food.num * level * 10;
      snake.score += pts;
      snake.growPending += food.num;
      spawnFoodParticles(food.x, food.y, food.num);
      updateHUD();

      if (state.roomId) {
        socket.emit('nibbles_score', { roomId: state.roomId, score: snake.score });
      }

      if (currentFoodNum >= 9) {
        // Nivel complet!
        currentFoodNum = 1;
        food = null;
        levelComplete();
      } else {
        currentFoodNum++;
        spawnFood();
      }
    } else {
      if (snake.growPending > 0) {
        snake.growPending--;
      } else {
        snake.body.pop();
      }
    }
  });

  render();
}

function killSnake(snake) {
  snake.alive = false;
  snake.lives--;
  spawnDeathParticles(snake.body[0].x, snake.body[0].y, snake.color);

  if (snake.lives <= 0) {
    // Game over for this snake
    checkGameOver();
  } else {
    // Respawn after delay
    setTimeout(() => {
      if (!state.running) return;
      var fresh = makeSnake(snake.idx, snakes.length);
      fresh.color     = snake.color;
      fresh.score     = snake.score;
      fresh.lives     = snake.lives;
      fresh.isAI      = snake.isAI;
      snakes[snake.idx] = fresh;
      updateHUD();
    }, 1500);
  }
  updateHUD();
}

function checkGameOver() {
  const deadCount = snakes.filter(s => s.lives <= 0).length;
  if (deadCount === 0) return;

  const allDead = snakes.every(s => s.lives <= 0);
  const onePlayer = snakes.length === 1;

  if (allDead || onePlayer) {
    endGame();
    return;
  }

  // Multiplayer: one dead
  if (snakes.filter(s => s.lives > 0).length <= 1) {
    endGame();
  }
}

function levelComplete() {
  if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }

  const mySnake = snakes[state.myIndex];
  const score   = mySnake ? mySnake.score : 0;

  if (level < 9) {
    showOverlay(
      '🎉 LEVEL ' + level + ' COMPLET!',
      'Scor: ' + score,
      'Pregătește-te pentru Level ' + (level + 1) + '!',
      true,
      () => {
        level++;
        currentFoodNum = 1;
        // Pastram scorurile si vietile
        const savedScores = snakes.map(s => ({ score: s.score, lives: s.lives }));
        startNibblesGame(state.numPlayers, state.vsAI, state.difficulty, level);
        snakes.forEach((s, i) => {
          if (savedScores[i]) {
            s.score = savedScores[i].score;
            s.lives = savedScores[i].lives;
          }
        });
        updateHUD();
      }
    );
  } else {
    // Joc complet - ai terminat toate nivelele!
    showOverlay(
      '🏆 AI CÂȘTIGAT!',
      'Scor final: ' + score,
      'Ai terminat toate cele 9 niveluri!',
      true,
      () => showScreen('menu')
    );
  }
}

function endGame() {
  if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
  state.running = false;

  const mySnake = snakes[state.myIndex];
  const winner  = snakes.reduce((a, b) => a.score > b.score ? a : b);
  const isWin   = mySnake && mySnake.score >= winner.score && !mySnake.isAI;

  // Save score
  const pname = state.players[state.myIndex]?.name || 'Player';
  if (mySnake && mySnake.score > 0) {
    socket.emit('nibbles_saveScore', { name: pname, score: mySnake.score, level });
  }

  // Next level?
  if (isWin && snakes.length === 1 && level < 10) {
    level++;
    showOverlay('🎉 LEVEL UP!', `Scor: ${mySnake.score}`, `Urmează Level ${level}!`, true, () => {
      startNibblesGame(1, false, state.difficulty, level);
    });
  } else {
    showOverlay(
      isWin ? '🏆 VICTORIE!' : '💀 GAME OVER',
      `Scor final: ${mySnake ? mySnake.score : 0}`,
      winner.score > (mySnake?.score || 0) ? `${winner.isAI ? 'Capybot' : winner.idx === state.myIndex ? 'Tu' : state.players[1]?.name} câștigă!` : '',
      isWin,
      () => showScreen('menu')
    );
  }
}

// ── RENDER ────────────────────────────────────────────────
function render() {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, HEADER, W, H - HEADER);

  // Grid
  ctx.strokeStyle = 'rgba(0,207,255,0.04)';
  ctx.lineWidth   = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, HEADER);
    ctx.lineTo(c * CELL, H);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, HEADER + r * CELL);
    ctx.lineTo(W, HEADER + r * CELL);
    ctx.stroke();
  }

  // Border neon
  ctx.strokeStyle = 'rgba(191,95,255,0.4)';
  ctx.lineWidth   = 2;
  ctx.shadowColor = '#bf5fff';
  ctx.shadowBlur  = 8;
  ctx.strokeRect(1, HEADER + 1, COLS * CELL - 2, ROWS * CELL - 2);
  ctx.shadowBlur  = 0;

  // Obstacole
  obstacles.forEach(function(o) {
    var ox = o.x * CELL;
    var oy = HEADER + o.y * CELL;

    // Corp obstacol
    ctx.fillStyle = '#1a0a2e';
    ctx.fillRect(ox, oy, CELL, CELL);

    // Border neon
    ctx.strokeStyle = 'rgba(255,51,102,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = '#ff3366';
    ctx.shadowBlur  = 6;
    ctx.strokeRect(ox + 1, oy + 1, CELL - 2, CELL - 2);
    ctx.shadowBlur  = 0;

    // Inner glow
    ctx.fillStyle = 'rgba(255,51,102,0.12)';
    ctx.fillRect(ox + 2, oy + 2, CELL - 4, CELL - 4);
  });

  // Food
  if (food) {
    food.pulse = (food.pulse + 0.08) % (Math.PI * 2);
    const scale = 1 + 0.15 * Math.sin(food.pulse);
    const fx    = food.x * CELL + CELL / 2;
    const fy    = HEADER + food.y * CELL + CELL / 2;

    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(scale, scale);

    // Glow
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = '#ffe600';
    ctx.beginPath();
    ctx.arc(0, 0, CELL * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Number
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#000';
    ctx.font        = `bold ${Math.floor(CELL * 0.7)}px Courier New`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(food.num, 0, 1);
    ctx.restore();
  }

  // Snakes
  snakes.forEach(snake => {
    if (!snake.alive) return;
    snake.body.forEach((seg, i) => {
      const sx = seg.x * CELL;
      const sy = HEADER + seg.y * CELL;

      const alpha = i === 0 ? 1 : Math.max(0.3, 1 - i / snake.body.length * 0.7);
      ctx.globalAlpha = alpha;

      if (i === 0) {
        // Head - capybara emoji
        ctx.shadowColor = snake.color;
        ctx.shadowBlur  = 12;
        ctx.fillStyle   = snake.color;
        ctx.beginPath();
        ctx.roundRect(sx + 1, sy + 1, CELL - 2, CELL - 2, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font         = `${Math.floor(CELL * 0.85)}px serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha  = 1;
        ctx.fillText('🐾', sx + CELL/2, sy + CELL/2);
      } else {
        // Body
        ctx.fillStyle = snake.color;
        ctx.shadowColor = snake.color;
        ctx.shadowBlur  = 4;
        ctx.beginPath();
        ctx.roundRect(sx + 2, sy + 2, CELL - 4, CELL - 4, 3);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Stripe every 3 segments
        if (i % 3 === 0) {
          ctx.globalAlpha *= 0.4;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(sx + CELL*0.3, sy + CELL*0.3, CELL*0.4, CELL*0.4);
        }
      }
    });
    ctx.globalAlpha = 1;

    // Name above head
    const head = snake.body[0];
    const hx = head.x * CELL + CELL / 2;
    const hy = HEADER + head.y * CELL - 4;
    ctx.font      = `bold 10px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillStyle = snake.color;
    ctx.shadowColor = snake.color;
    ctx.shadowBlur  = 6;
    ctx.fillText(snake.isAI ? '🤖' : (state.players[snake.idx]?.name || `P${snake.idx+1}`), hx, hy);
    ctx.shadowBlur = 0;
  });

  // Particles
  drawParticles();
}

// ── PARTICLES ─────────────────────────────────────────────
function spawnFoodParticles(gx, gy, num) {
  const x = gx * CELL + CELL/2;
  const y = HEADER + gy * CELL + CELL/2;
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI*2*i/12) + Math.random()*0.5;
    const speed = 2 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      life:1, decay:0.04, r:3, color:'#ffe600', text: null
    });
  }
  // Score popup
  particles.push({ x, y, vx:0, vy:-1.5, life:1, decay:0.02, r:0, color:'#ffe600', text:`+${num*level*10}` });
}

function spawnDeathParticles(gx, gy, color) {
  const x = gx * CELL + CELL/2;
  const y = HEADER + gy * CELL + CELL/2;
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      life:1, decay:0.03, r:2+Math.random()*3, color, text:null
    });
  }
}

function drawParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.1;
    p.life -= p.decay;

    if (p.text) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 8;
      ctx.font        = 'bold 14px Courier New';
      ctx.textAlign   = 'center';
      ctx.fillText(p.text, p.x, p.y);
      ctx.shadowBlur  = 0;
    } else {
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.r * p.life), 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  });
  ctx.globalAlpha = 1;
}

// ── HUD ───────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('hud-level').textContent = 'LEVEL ' + level;
  snakes.forEach((s, i) => {
    const n = i + 1;
    const nameEl  = document.getElementById('name-p'  + n);
    const scoreEl = document.getElementById('score-p' + n);
    const livesEl = document.getElementById('lives-p' + n);
    if (!nameEl) return;
    nameEl.textContent  = state.players[i]?.name || (s.isAI ? '🤖 Capybot' : `P${n}`);
    scoreEl.textContent = '⭐ ' + s.score;
    livesEl.textContent = '❤️'.repeat(Math.max(0, s.lives));
  });
}

// ── OVERLAY ───────────────────────────────────────────────
function showOverlay(title, score, msg, isWin, cb) {
  document.getElementById('ov-icon').textContent  = isWin ? '🏆' : '💀';
  document.getElementById('ov-title').textContent = title;
  document.getElementById('ov-score').textContent = score;
  document.getElementById('ov-msg').textContent   = msg;
  document.getElementById('overlay').classList.remove('hidden');

  const bar = document.getElementById('ov-bar');
  bar.style.transition = 'none';
  bar.style.width = '100%';
  setTimeout(() => {
    bar.style.transition = 'width 3s linear';
    bar.style.width = '0%';
  }, 50);

  setTimeout(() => {
    document.getElementById('overlay').classList.add('hidden');
    if (cb) cb();
  }, 3000);
}

// ── CONTROLS ─────────────────────────────────────────────

// Swipe detection pentru mobil
(function() {
  var sx = 0, sy = 0;
  document.addEventListener('touchstart', function(e) {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - sx;
    var dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    var dir;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? 'RIGHT' : 'LEFT';
    } else {
      dir = dy > 0 ? 'DOWN' : 'UP';
    }
    if (serverMode && state.roomId) {
      socket.emit('nibbles_dir', { roomId: state.roomId, dir: dir });
    } else {
      var mySnake = snakes[state.myIndex];
      var rev = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT' };
      if (!mySnake || !mySnake.alive) return;
      if (rev[mySnake.dir] !== dir) mySnake.nextDir = dir;
    }
  }, { passive: true });
})();

document.addEventListener('keydown', function(e) {
  var mySnake = snakes[state.myIndex];
  var rev = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT' };
  var map = {
    ArrowUp:'UP', ArrowDown:'DOWN', ArrowLeft:'LEFT', ArrowRight:'RIGHT',
    w:'UP', s:'DOWN', a:'LEFT', d:'RIGHT',
    W:'UP', S:'DOWN', A:'LEFT', D:'RIGHT'
  };
  var dir = map[e.key];
  if (!dir) return;
  e.preventDefault();

  if (serverMode && state.roomId) {
    // Trimite directia la server
    socket.emit('nibbles_dir', { roomId: state.roomId, dir: dir });
  } else {
    // Local
    if (!mySnake || !mySnake.alive) return;
    if (rev[mySnake.dir] !== dir) mySnake.nextDir = dir;
  }
});

// Mobile D-pad
['up','down','left','right'].forEach(function(d) {
  var btn = document.getElementById('btn-' + d);
  if (!btn) return;
  btn.addEventListener('click', function() {
    var dir = d.toUpperCase();
    if (serverMode && state.roomId) {
      socket.emit('nibbles_dir', { roomId: state.roomId, dir: dir });
    } else {
      var mySnake = snakes[state.myIndex];
      var rev = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT' };
      if (!mySnake || !mySnake.alive) return;
      if (rev[mySnake.dir] !== dir) mySnake.nextDir = dir;
    }
  });
});

// ── MENU EVENTS ──────────────────────────────────────────
let selectedDiff = 'easy';
document.querySelectorAll('.btn-diff').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDiff = btn.dataset.diff;
    state.difficulty = selectedDiff;
  });
});

document.getElementById('btn-play').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { alert('Introdu CALLSIGN-ul!'); return; }
  state.players = [{ name }, { name: '?' }];
  state.myIndex = 0;
  socket.emit('nibbles_findMatch', name);
  showScreen('waiting');
});

document.getElementById('btn-ai').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { alert('Introdu CALLSIGN-ul!'); return; }
  state.players    = [{ name }, { name: '🤖 Capybot' }];
  state.myIndex    = 0;
  state.numPlayers = 2;
  state.vsAI       = true;
  state.difficulty = selectedDiff;
  state.running    = true;
  socket.emit('nibbles_findAI', { playerName: name, difficulty: selectedDiff });
  showScreen('game');
  startNibblesGame(2, true, selectedDiff, 1);
});

document.getElementById('btn-solo').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim() || 'Player';
  state.players    = [{ name }];
  state.myIndex    = 0;
  state.numPlayers = 1;
  state.vsAI       = false;
  state.running    = true;
  showScreen('game');
  startNibblesGame(1, false, 'easy', 1);
});

document.getElementById('btn-cancel').addEventListener('click', () => {
  socket.emit('nibbles_cancelMatch');
  showScreen('menu');
});

document.getElementById('btn-lb').addEventListener('click', loadLeaderboard);
document.getElementById('btn-back').addEventListener('click', () => showScreen('menu'));

// ── SOCKET ───────────────────────────────────────────────
socket.on('nibbles_waiting', () => {});

socket.on('nibbles_start', (data) => {
  state.roomId     = data.roomId;
  state.numPlayers = data.numPlayers;
  state.vsAI       = data.vsAI || false;
  state.difficulty = data.difficulty || 'easy';
  state.running    = true;
  state.players    = data.players;
  state.myIndex    = data.players.findIndex(function(p) { return p.id === socket.id; });
  if (state.myIndex < 0) state.myIndex = 0;
  serverMode = data.serverMode || false;

  if (serverMode) {
    // Server trimite tot - doar initializam canvas si primim state
    if (data.cols) { COLS = data.cols; ROWS = data.rows; }
    if (data.obstacles) obstacles = data.obstacles;
    if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
    showScreen('game');
    level = 1;
    currentFoodNum = 1;
    snakes = [];
    food   = null;
    particles = [];
    updateHUD();
  } else {
    showScreen('game');
    startNibblesGame(data.numPlayers, data.vsAI, state.difficulty, 1);
  }
});

// State complet de la server
socket.on('nibbles_state', function(data) {
  if (!serverMode) return;
  // Update snakes din server
  data.snakes.forEach(function(ss) {
    if (!snakes[ss.idx]) {
      snakes[ss.idx] = { idx:ss.idx, body:ss.body, dir:ss.dir, score:ss.score, lives:ss.lives, alive:ss.alive, isAI:ss.isAI, color:['#00ff88','#ff3366'][ss.idx], growPending:0 };
    } else {
      snakes[ss.idx].body  = ss.body;
      snakes[ss.idx].dir   = ss.dir;
      snakes[ss.idx].score = ss.score;
      snakes[ss.idx].lives = ss.lives;
      snakes[ss.idx].alive = ss.alive;
    }
  });
  food           = data.food;
  level          = data.level;
  currentFoodNum = data.currentFoodNum;
  if (food) document.getElementById('hud-num').textContent = '🎯 ' + currentFoodNum + ' / 9';
  updateHUD();
  render();
});

socket.on('nibbles_death', function(data) {
  if (!serverMode) return;
  spawnDeathParticles(
    snakes[data.idx] ? snakes[data.idx].body[0].x : 0,
    snakes[data.idx] ? snakes[data.idx].body[0].y : 0,
    ['#00ff88','#ff3366'][data.idx]
  );
});

socket.on('nibbles_levelComplete', function(data) {
  if (!serverMode) return;
  state.running = false;
  var mySnake = snakes[state.myIndex];
  showOverlay(
    '🎉 LEVEL ' + data.level + ' COMPLET!',
    'Scor: ' + (mySnake ? mySnake.score : 0),
    'Pregătește-te pentru Level ' + (data.level+1) + '!',
    true,
    function() {
      socket.emit('nibbles_nextLevel', { roomId: state.roomId });
    }
  );
});

socket.on('nibbles_levelStart', function(data) {
  if (!serverMode) return;
  level     = data.level;
  obstacles = data.obstacles;
  snakes    = [];
  food      = null;
  particles = [];
  document.getElementById('hud-level').textContent = 'LEVEL ' + level;
});

socket.on('nibbles_gameover', function(data) {
  if (!serverMode) return;
  state.running = false;
  var mySnake  = snakes[state.myIndex];
  var myScore  = mySnake ? mySnake.score : 0;
  var isWin    = data.winner === state.players[state.myIndex]?.name;
  socket.emit('nibbles_saveScore', { name: state.players[state.myIndex]?.name, score: myScore, level: level });
  showOverlay(
    isWin ? '🏆 VICTORIE!' : '💀 GAME OVER',
    'Scor: ' + myScore,
    'Câștigător: ' + data.winner,
    isWin,
    function() { showScreen('menu'); }
  );
});

socket.on('nibbles_scores', (scores) => {
  scores.forEach((s, i) => {
    const el = document.getElementById('score-p' + (i+1));
    if (el) el.textContent = '⭐ ' + s.score;
  });
});

socket.on('nibbles_playerLeft', () => {
  if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
  showOverlay('😢 ADVERSARUL A PLECAT!', '', '', false, () => showScreen('menu'));
});

// ── LEADERBOARD ──────────────────────────────────────────
function loadLeaderboard() {
  showScreen('leaderboard');
  fetch('/api/nibbles/leaderboard')
    .then(r => r.json())
    .then(data => {
      const list = document.getElementById('lb-list');
      if (!data.length) { list.innerHTML = '<p style="text-align:center;color:#6677aa;padding:30px">// NO DATA //</p>'; return; }
      list.innerHTML = data.map((r, i) => {
        const rank = i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1);
        return `<div class="lb-row">
          <span class="lb-rank">${rank}</span>
          <span class="lb-name">${r.player_name}</span>
          <span class="lb-score">${r.score} pts</span>
        </div>`;
      }).join('');
    });
}

// ── MENU BACKGROUND ──────────────────────────────────────
function startMenuBg() {
  const mc  = document.getElementById('menu-bg');
  if (!mc) return;
  mc.width  = window.innerWidth;
  mc.height = window.innerHeight;
  const mctx = mc.getContext('2d');
  let mf = 0;
  const NEONS2 = ['#ff0055','#00ffff','#ff9900','#00ff88','#ff00ff','#ffff00'];
  const mdots  = Array.from({length:50}, () => ({
    x:  Math.random()*mc.width,  y:  Math.random()*mc.height,
    vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4,
    r:  Math.random()*2+0.5,     c:  NEONS2[Math.floor(Math.random()*NEONS2.length)]
  }));
  function frame() {
    if (!screens.menu.classList.contains('active')) return;
    mf++;
    mctx.clearRect(0,0,mc.width,mc.height);
    mctx.strokeStyle='rgba(191,95,255,0.04)'; mctx.lineWidth=1;
    for(let x=0;x<mc.width;x+=60){mctx.beginPath();mctx.moveTo(x,0);mctx.lineTo(x,mc.height);mctx.stroke();}
    for(let y=0;y<mc.height;y+=60){mctx.beginPath();mctx.moveTo(0,y);mctx.lineTo(mc.width,y);mctx.stroke();}
    mdots.forEach(d => {
      d.x+=d.vx; d.y+=d.vy;
      if(d.x<0)d.x=mc.width; if(d.x>mc.width)d.x=0;
      if(d.y<0)d.y=mc.height; if(d.y>mc.height)d.y=0;
      mctx.fillStyle=d.c; mctx.shadowColor=d.c; mctx.shadowBlur=8;
      mctx.globalAlpha=0.5+0.3*Math.sin(mf*0.04+d.x);
      mctx.beginPath(); mctx.arc(d.x,d.y,d.r,0,Math.PI*2); mctx.fill();
    });
    mctx.globalAlpha=1; mctx.shadowBlur=0;
    requestAnimationFrame(frame);
  }
  frame();
}

// ── INIT ─────────────────────────────────────────────────
startMenuBg();
