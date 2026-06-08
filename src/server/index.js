const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, '../../public')));
app.use('/gorillas', express.static(path.join(__dirname, '../../public/gorillas')));
app.use('/nibbles',  express.static(path.join(__dirname, '../../public/nibbles')));

// Routes
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, '../../public/index.html')));
app.get('/gorillas',  (req, res) => res.sendFile(path.join(__dirname, '../../public/gorillas/index.html')));
app.get('/nibbles',   (req, res) => res.sendFile(path.join(__dirname, '../../public/nibbles/index.html')));

// Database
const db = new Database(path.join(__dirname, '../../data/capybara.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game TEXT DEFAULT 'gorillas',
    player_name TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    total_damage INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS nibbles_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const rooms = {};
const waiting = { id: null, name: null };

const WEAPONS = [
  { name:'Coconut',    emoji:'🥥', minDamage:0,  radius:22, color:'#8B4513', glow:'rgba(139,69,19,0.6)'  },
  { name:'Watermelon', emoji:'🍉', minDamage:3,  radius:32, color:'#2ECC40', glow:'rgba(46,204,64,0.6)'  },
  { name:'Meteor',     emoji:'☄️',  minDamage:7,  radius:44, color:'#FF4136', glow:'rgba(255,65,54,0.6)'  },
  { name:'Blackhole',  emoji:'🕳️',  minDamage:12, radius:58, color:'#6C3483', glow:'rgba(108,52,131,0.6)' }
];

function getWeapon(damage) {
  let w = WEAPONS[0];
  for (const wp of WEAPONS) { if (damage >= wp.minDamage) w = wp; }
  return w;
}

const GW = 1280, GH = 720;

function generateBuildings() {
  const n = 10, bw = GW / n;
  const buildings = [];
  for (let i = 0; i < n; i++) {
    const seed = (i * 1337 + Date.now()) % 100;
    const bh = GH * (0.25 + (seed / 100) * 0.38);
    buildings.push({ x: i * bw, y: GH - bh, w: bw - 2, h: bh });
  }
  return buildings;
}

function calcAIShot(shooterX, shooterY, targetX, targetY, wind, difficulty) {
  const G = 0.2, WIND_F = 0.003;
  const errorMap = { easy: 22, medium: 10, hard: 3 };
  const error = errorMap[difficulty] || 10;
  let bestAngle = 45, bestVel = 150;
  let found = false;

  for (let a = 10; a <= 85 && !found; a += 2) {
    for (let v = 60; v <= 280; v += 8) {
      const rad = a * Math.PI / 180;
      let vx = Math.cos(rad) * v * 0.22;
      let vy = -Math.sin(rad) * v * 0.22;
      let px = shooterX, py = shooterY;
      for (let t = 0; t < 600; t++) {
        vx += wind * WIND_F; vy += G;
        px += vx; py += vy;
        if (py > GH + 50 || px < -50 || px > GW + 50) break;
        if (Math.hypot(px - targetX, py - targetY) < 40) {
          bestAngle = a; bestVel = v; found = true; break;
        }
      }
      if (found) break;
    }
  }

  bestAngle += (Math.random() - 0.5) * error;
  bestVel   += (Math.random() - 0.5) * error * 2;
  bestAngle  = Math.max(5, Math.min(89, bestAngle));
  bestVel    = Math.max(30, Math.min(290, bestVel));
  return { angle: Math.round(bestAngle), velocity: Math.round(bestVel) };
}

function scheduleAIShot(room) {
  const delay = 1500 + Math.random() * 1500;
  setTimeout(() => {
    if (!rooms[room.id]) return;
    const aiIdx = room.players.findIndex(p => p.isAI);
    if (aiIdx === -1 || room.currentTurn !== aiIdx) return;
    const ai = room.players[aiIdx];
    const b1 = room.buildings[1], b2 = room.buildings[8];
    const capX = [b1.x + b1.w/2, b2.x + b2.w/2];
    const capY = [b1.y + 20, b2.y + 20];
    const shot = calcAIShot(capX[aiIdx], capY[aiIdx], capX[1-aiIdx], capY[1-aiIdx], room.wind, room.difficulty);
    const weapon = getWeapon(ai.damage);
    io.to(room.id).emit('shotFired', {
      angle: shot.angle, velocity: shot.velocity,
      playerIndex: aiIdx, shooterId: 'AI', weapon
    });
    setTimeout(() => {
      if (!rooms[room.id]) return;
      processShot(room.id, 'AI', { hit: simulateShot(shot, aiIdx, room.wind, room.buildings) });
    }, 3500);
  }, delay);
}

function simulateShot(shot, playerIndex, wind, buildings) {
  const b1 = buildings[1], b2 = buildings[8];
  const capX = [b1.x + b1.w/2, b2.x + b2.w/2];
  const capY = [b1.y + 20, b2.y + 20];
  let angle = shot.angle * Math.PI / 180;
  if (playerIndex === 1) angle = Math.PI - angle;
  const speed = shot.velocity * 0.22;
  let vx = Math.cos(angle) * speed, vy = -Math.sin(angle) * speed;
  let px = capX[playerIndex], py = capY[playerIndex];
  for (let t = 0; t < 600; t++) {
    vx += wind * 0.003; vy += 0.2;
    px += vx; py += vy;
    if (py > GH+50 || px < -50 || px > GW+50) return false;
    if (Math.hypot(px - capX[1-playerIndex], py - capY[1-playerIndex]) < 38) return true;
  }
  return false;
}

function processShot(roomId, socketId, data) {
  const room = rooms[roomId];
  if (!room) return;
  const cp = room.players[room.currentTurn];
  const isAI    = cp.isAI && socketId === 'AI';
  const isHuman = !cp.isAI && cp.id === socketId;
  if (!isAI && !isHuman) return;

  if (data.hit) {
    const si = room.currentTurn;
    room.players[si].wins++;
    room.players[si].damage++;
    const winner = room.players[si];

    if (!winner.isAI) {
      const ex = db.prepare('SELECT id FROM scores WHERE player_name=? AND game=?').get(winner.name, 'gorillas');
      if (ex) db.prepare('UPDATE scores SET wins=wins+1,total_damage=total_damage+1,games_played=games_played+1 WHERE player_name=? AND game=?').run(winner.name,'gorillas');
      else     db.prepare('INSERT INTO scores(game,player_name,wins,total_damage,games_played) VALUES(?,?,1,1,1)').run('gorillas',winner.name);
    }

    io.to(roomId).emit('roundOver', {
      winner: winner.name, winnerId: winner.isAI ? 'AI' : winner.id,
      isAI: winner.isAI,
      scores: room.players.map(p => ({ name:p.name, wins:p.wins })),
      weapon: getWeapon(winner.damage)
    });

    setTimeout(() => {
      if (!rooms[roomId]) return;
      room.wind = Math.floor(Math.random()*21)-10;
      room.currentTurn = 1 - si;
      room.round++;
      const nb = generateBuildings();
      room.buildings = nb;
      io.to(roomId).emit('newRound', {
        wind: room.wind,
        yourTurn: room.players[room.currentTurn].isAI ? 'AI' : room.players[room.currentTurn].id,
        round: room.round, buildings: nb
      });
      if (room.players[room.currentTurn].isAI) scheduleAIShot(room);
    }, 3500);
  } else {
    room.currentTurn = 1 - room.currentTurn;
    io.to(roomId).emit('turnChange', {
      yourTurn: room.players[room.currentTurn].isAI ? 'AI' : room.players[room.currentTurn].id,
      wind: room.wind
    });
    if (room.players[room.currentTurn].isAI) scheduleAIShot(room);
  }
}

// ── NIBBLES multiplayer rooms ──────────────────────────
const nibblesRooms   = {};
const nibblesWaiting = { id: null, name: null };

// ── SOCKET ────────────────────────────────────────────
io.on('connection', (socket) => {
  // ── GORILLAS ──
  socket.on('findMatch', (playerName) => {
    if (waiting.id && waiting.id !== socket.id) {
      const roomId = 'r_' + Date.now();
      const buildings = generateBuildings();
      const room = {
        id: roomId,
        players: [
          { id: waiting.id, name: waiting.name, wins:0, damage:0, isAI:false },
          { id: socket.id,  name: playerName,   wins:0, damage:0, isAI:false }
        ],
        currentTurn:0, wind: Math.floor(Math.random()*21)-10,
        round:1, buildings, isAI:false
      };
      rooms[roomId] = room;
      socket.join(roomId);
      io.sockets.sockets.get(waiting.id)?.join(roomId);
      io.to(roomId).emit('matchFound', {
        roomId, players: room.players.map(p=>({id:p.id,name:p.name,isAI:false})),
        wind: room.wind, yourTurn: room.players[0].id,
        buildings, W:GW, H:GH
      });
      waiting.id = null; waiting.name = null;
    } else {
      waiting.id = socket.id; waiting.name = playerName;
      socket.emit('waiting', {});
    }
  });

  socket.on('findAI', ({ playerName, difficulty }) => {
    const roomId = 'ai_' + Date.now();
    const buildings = generateBuildings();
    const humanFirst = Math.random() > 0.5;
    const hi = humanFirst ? 0 : 1, ai = 1 - hi;
    const players = [null, null];
    players[hi] = { id: socket.id, name: playerName, wins:0, damage:0, isAI:false };
    players[ai] = { id:'AI', name:`🤖 Capybot (${difficulty})`, wins:0, damage:0, isAI:true };
    const room = { id:roomId, players, currentTurn:0, wind:Math.floor(Math.random()*21)-10, round:1, buildings, isAI:true, difficulty };
    rooms[roomId] = room;
    socket.join(roomId);
    socket.emit('matchFound', {
      roomId, players: players.map(p=>({id:p.id,name:p.name,isAI:p.isAI})),
      wind: room.wind, yourTurn: room.players[0].isAI ? 'AI' : room.players[0].id,
      buildings, W:GW, H:GH
    });
    if (room.players[0].isAI) scheduleAIShot(room);
  });

  socket.on('cancelMatch', () => {
    if (waiting.id === socket.id) { waiting.id = null; waiting.name = null; }
  });

  socket.on('shoot', (data) => {
    const room = rooms[data.roomId];
    if (!room) return;
    const cp = room.players[room.currentTurn];
    if (cp.id !== socket.id) return;
    io.to(data.roomId).emit('shotFired', {
      angle:data.angle, velocity:data.velocity,
      playerIndex:room.currentTurn, shooterId:socket.id,
      weapon:getWeapon(cp.damage)
    });
  });

  socket.on('shotResult', (data) => processShot(data.roomId, socket.id, data));

  // ── NIBBLES ──
  socket.on('nibbles_findMatch', (playerName) => {
    if (nibblesWaiting.id && nibblesWaiting.id !== socket.id) {
      const roomId = 'nib_' + Date.now();
      const room = {
        id: roomId,
        players: [
          { id: nibblesWaiting.id, name: nibblesWaiting.name, score:0, lives:3, isAI:false },
          { id: socket.id, name: playerName, score:0, lives:3, isAI:false }
        ],
        level:1, active:true
      };
      nibblesRooms[roomId] = room;
      socket.join(roomId);
      io.sockets.sockets.get(nibblesWaiting.id)?.join(roomId);
      io.to(roomId).emit('nibbles_start', {
        roomId, players: room.players.map(p=>({id:p.id,name:p.name})),
        level:1, numPlayers:2
      });
      nibblesWaiting.id = null; nibblesWaiting.name = null;
    } else {
      nibblesWaiting.id = socket.id; nibblesWaiting.name = playerName;
      socket.emit('nibbles_waiting', {});
    }
  });

  socket.on('nibbles_findAI', ({ playerName, difficulty }) => {
    const roomId = 'nib_ai_' + Date.now();
    const room = {
      id: roomId,
      players: [
        { id: socket.id, name: playerName, score:0, lives:3, isAI:false },
        { id:'AI', name:`🤖 Capybot`, score:0, lives:3, isAI:true }
      ],
      level:1, active:true, difficulty
    };
    nibblesRooms[roomId] = room;
    socket.join(roomId);
    socket.emit('nibbles_start', {
      roomId, players: room.players.map(p=>({id:p.id,name:p.name})),
      level:1, numPlayers:2, vsAI:true, difficulty
    });
  });

  socket.on('nibbles_score', (data) => {
    const room = nibblesRooms[data.roomId];
    if (!room) return;
    const p = room.players.find(pl => pl.id === socket.id);
    if (p) p.score = data.score;
    io.to(data.roomId).emit('nibbles_scores', room.players.map(pl=>({name:pl.name,score:pl.score})));
  });

  socket.on('nibbles_saveScore', (data) => {
    const ex = db.prepare('SELECT id FROM nibbles_scores WHERE player_name=?').get(data.name);
    if (!ex || ex.score < data.score) {
      if (ex) db.prepare('UPDATE nibbles_scores SET score=?,level=? WHERE player_name=?').run(data.score, data.level, data.name);
      else     db.prepare('INSERT INTO nibbles_scores(player_name,score,level) VALUES(?,?,?)').run(data.name, data.score, data.level);
    }
  });

  socket.on('disconnect', () => {
    if (waiting.id === socket.id) { waiting.id = null; waiting.name = null; }
    if (nibblesWaiting.id === socket.id) { nibblesWaiting.id = null; nibblesWaiting.name = null; }
    for (const rid in rooms) {
      if (rooms[rid].players.find(p=>p.id===socket.id)) {
        io.to(rid).emit('playerLeft', {});
        delete rooms[rid];
      }
    }
    for (const rid in nibblesRooms) {
      if (nibblesRooms[rid].players.find(p=>p.id===socket.id)) {
        io.to(rid).emit('nibbles_playerLeft', {});
        delete nibblesRooms[rid];
      }
    }
  });
});

// API
app.get('/api/leaderboard',        (req,res) => res.json(db.prepare('SELECT player_name,wins,total_damage,games_played FROM scores WHERE game=? ORDER BY wins DESC LIMIT 20').all('gorillas')));
app.get('/api/nibbles/leaderboard',(req,res) => res.json(db.prepare('SELECT player_name,score,level FROM nibbles_scores ORDER BY score DESC LIMIT 20').all()));

server.listen(3000, () => console.log('🐾 Capybara Games Server on :3000'));
