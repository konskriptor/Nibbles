# 🐾 Capybara Games 2026

Două jocuri clasice MS-DOS modernizate cu grafică cyberpunk, multiplayer online și AI opponent.

[![PayPal](https://img.shields.io/badge/Donează-PayPal-blue?style=for-the-badge&logo=paypal)](https://www.paypal.com/donate/?hosted_button_id=FYC8H7CDMZZFJ)

## 🎮 Jocuri

### 🥥 Capybara Gorillas
Inspirat din **Gorillas.bas** (QBasic 1990). Două capybara cyberpunk aruncă coconuturi peste un skyline neon.
- ✅ Multiplayer online (2 jucători)
- ✅ VS AI (Easy / Medium / Hard)
- ✅ Weapons upgrade system
- ✅ Global leaderboard
- ✅ Mobile friendly

### 🐍 Capybara Nibbles
Inspirat din **Nibbles.bas** (QBasic 1990). Ghidează capybara să mănânce numerele 1→9.
- ✅ Single player (9 niveluri cu obstacole)
- ✅ Multiplayer online
- ✅ VS AI
- ✅ Swipe + D-pad pe mobil
- ✅ Global leaderboard

## 🚀 Instalare rapidă

### Cerințe
- Ubuntu 22.04+
- Node.js 20+

### Instalare

\`\`\`bash
git clone https://github.com/USERNAME/capybara-games.git
cd capybara-games
npm install
npm start
\`\`\`

Accesează: \`http://localhost:3000\`

### Cu Cloudflare Tunnel (opțional)

\`\`\`bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared tunnel login
cloudflared tunnel create capybara-games
\`\`\`

Config \`~/.cloudflared/config.yml\`:
\`\`\`yaml
tunnel: YOUR_UUID
credentials-file: /home/USER/.cloudflared/YOUR_UUID.json
ingress:
  - hostname: yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
\`\`\`

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | HTML5 Canvas (vanilla JS) |
| Backend | Node.js + Express |
| Realtime | Socket.io |
| Database | SQLite (better-sqlite3) |
| Tunnel | Cloudflare |

## 📁 Structură

\`\`\`
capybara-games/
├── src/server/index.js      # Server principal
├── public/
│   ├── index.html           # Hub page
│   ├── gorillas/            # Capybara Gorillas
│   │   ├── index.html
│   │   ├── js/game.js
│   │   ├── js/audio.js
│   │   └── css/style.css
│   └── nibbles/             # Capybara Nibbles
│       ├── index.html
│       └── js/nibbles.js
├── data/                    # SQLite DB (auto-generat)
└── package.json
\`\`\`

## ☕ Susține proiectul

Dacă ți-a plăcut și vrei să cumperi o cafea:

[![Donează PayPal](https://img.shields.io/badge/Donează-PayPal-blue?style=for-the-badge&logo=paypal)](https://www.paypal.com/donate/?hosted_button_id=FYC8H7CDMZZFJ)

Orice contribuție e binevenită! 🐾

## 📄 Licență

MIT - Poți folosi, modifica și distribui liber.

---
*Inspirat din jocurile clasice QBasic Microsoft 1990. Modernizat cu ❤️ în 2026.*
