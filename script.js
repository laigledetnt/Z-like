// ==== Canvas setup ====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });


function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ==== Textures obligatoires (dossier img/) ====
const textureFiles = {
  player: 'img/player.png',
  zombie: 'img/zombie.png',
  wall: 'img/wall.png',
  generator: 'img/generator.png',
  turret_arrow: 'img/turret_arrow.png',
  turret_laser: 'img/turret_laser.png',

iceTurret: 'img/turret_ice.png',
};


const textures = {};
let texturesLoaded = 0;
const textureCount = Object.keys(textureFiles).length;
let lastBuildTime = 0;


function loadTextures() {
  return new Promise((resolve, reject) => {
    for (const [key, src] of Object.entries(textureFiles)) {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        textures[key] = img;
        texturesLoaded++;
        if (texturesLoaded === textureCount) resolve();
      };
      img.onerror = () => reject(new Error(`Erreur chargement texture : ${src}`));
    }
  });
}

// ==== Game params ====
const tileSize = 50;
const mapW = 60, mapH = 60;
const worldPixelW = mapW * tileSize;
const worldPixelH = mapH * tileSize;

let wave = 1;
let waveTimer = 0;
let waveInterval = 15 * 60;
let enemiesPerWave = 10;
let waveInProgress = false;
const maxWaveTime = 60 * 60;
let waveElapsed = 0;


const player = {
  x: worldPixelW / 2,
  y: worldPixelH / 2,
  r: 16,
  speed: 3.5,
  dx: 0, dy: 0,
  resources: 0,
  money: 10000,
  hp: 100, maxHp: 100
};

const zombies = [];
const resources = [];
const walls = [];
const generators = [];
const turrets = [];
const projectiles = [];

for (let i = 0; i < 90; i++) {
  resources.push({
    x: Math.random() * worldPixelW,
    y: Math.random() * worldPixelH,
    r: 18,
    type: Math.random() < 0.6 ? 'tree' : 'rock',
    taken: false
  });
}

// ====Camera follow player====
function cameraOffset() {
  return { ox: player.x - canvas.width / 2, oy: player.y - canvas.height / 2 };
}

// ==== Input: keyboard ====
const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// ==== Mobile joystick ====
const joystick = document.getElementById('joystick');
const stick = document.getElementById('stick');
let joyActive = false;
let joyStart = { x: 0, y: 0 };

if (joystick && stick) {
  joystick.addEventListener('touchstart', e => {
    joyActive = true;
    const t = e.touches[0];
    joyStart = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  });
  joystick.addEventListener('touchmove', e => {
    if (!joyActive) return;
    const t = e.touches[0];
    const dx = t.clientX - joyStart.x;
    const dy = t.clientY - joyStart.y;
    const max = 40;
    const dist = Math.min(max, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    stick.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`;
    const power = dist / max;
    player.dx = Math.cos(ang) * player.speed * power;
    player.dy = Math.sin(ang) * player.speed * power;
    e.preventDefault();
  });
  joystick.addEventListener('touchend', e => {
    joyActive = false;
    stick.style.transform = 'translate(0,0)';
    player.dx = 0; player.dy = 0;
    e.preventDefault();
  });
}

// ==== Shop & UI ====
let currentSelection = null;
const shopButton = document.getElementById('shopButton');
const shopModal = document.getElementById('shopModal');
const closeShop = document.getElementById('closeShop');
const resCountEl = document.getElementById('resCount');
const moneyCountEl = document.getElementById('moneyCount');


const cancelPlaceBtn = document.getElementById('cancelPlace');
const shopButtons = shopModal ? Array.from(shopModal.querySelectorAll('.shopItem')) : [];

if (shopButton) shopButton.addEventListener('click', () => shopModal.classList.remove('hidden'));
if (closeShop) closeShop.addEventListener('click', () => shopModal.classList.add('hidden'));
if (cancelPlaceBtn) cancelPlaceBtn.addEventListener('click', () => {
  currentSelection = null;
  shopButtons.forEach(bb => bb.classList.remove('selected'));
});
shopButtons.forEach(b => {
  b.addEventListener('click', () => {
    shopButtons.forEach(bb => bb.classList.remove('selected'));
    if (currentSelection === b.dataset.type) currentSelection = null;
    else { currentSelection = b.dataset.type; b.classList.add('selected'); }
  });
});

const COSTS = {
  wall: { money: 10 },
  generator: { res: 5, production: 0.5 },

  arrowTurret: { money: 35, range: 240, dmg: 40, fireRate: 60 },

iceTurret: { money: 100, range: 200, slow: 0.5, duration: 120, fireRate: 60 }, 

  laserTurret: { money: 45, range: 100, dmg: 8, fireRate: 5 }
};

let lastPointer = null;
canvas.addEventListener('pointermove', e => {
  const rect = canvas.getBoundingClientRect();
  lastPointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});



const UPGRADE_DATA = {
  arrow: [
    { 
      choices: [
        { name: "Mitrailleuse", cost: 150, dmg: 20, fireRate: 10, range: 180, texture: 'img/mitrailleur.png' },
        { name: "Canon", cost: 200, dmg: 80, fireRate: 70, range: 300, texture: 'img/canon.png' } ] }
        
  ],
  laser: [
     {
       choices: [
{ name: "Long laser ", cost: 250, dmg: 10, fireRate: 5, range: 250, texture: 'img/turret_long_laser.png' },
   {name:"rayon de magma",cost:300, dmg: 45,fireRate: 5, range: 100, texture:'img/turret_rayon_magma.png'} ] }
  ],
  ice: [
    { choices: [ { name: "freeze turret", cost: 340, slow: 0.0, range: 220,
fireRate:400, duration: 120, texture: 'img/turret_freeze.png' },
{ name: "slow turret", cost: 250, slow: 0.3, range: 220, duration: 120, texture: 'img/turret_slow.png' }] }
  ]
};






canvas.addEventListener('pointerdown', e => {
  if (!currentSelection) return;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const { ox, oy } = cameraOffset();
  const wx = cx + ox;
  const wy = cy + oy;
  const gx = Math.floor(wx / tileSize) * tileSize;
  const gy = Math.floor(wy / tileSize) * tileSize;
  const occupied = [...walls, ...generators, ...turrets].some(s => s.x === gx && s.y === gy);
  if (occupied) return;

  if (currentSelection === 'wall' && player.money >= COSTS.wall.money) {
    walls.push({ x: gx, y: gy, hp: 100 });
    player.money -= COSTS.wall.money;
  } else if (currentSelection === 'generator') {
  // Vérifie la limite avant placement
  if (generators.length >= 4) {
    console.log("⚠️ Limite atteinte : 4 générateurs/mine maximum !");
    return;
  }

  // Vérifie les ressources
  if (player.resources >= COSTS.generator.res) {
    generators.push({
      x: gx,
      y: gy,
      production: COSTS.generator.production,
      tick: 0,
      hp: 100
    });
    player.resources -= COSTS.generator.res;
  }

} else if (currentSelection === 'iceTurret' && player.money >= COSTS.iceTurret.money) {
    turrets.push({
        x: gx,
        y: gy,
        type: 'ice',
        range: COSTS.iceTurret.range,
        slow: COSTS.iceTurret.slow,
        duration: COSTS.iceTurret.duration,
        fireRate: COSTS.iceTurret.fireRate,
        cd: 0,
        hp: 100
    });
    player.money -= COSTS.iceTurret.money;
lastBuildTime = performance.now();




  } else if (currentSelection === 'arrowTurret' && player.money >= COSTS.arrowTurret.money) {
    turrets.push({ x: gx, y: gy, type: 'arrow', range: COSTS.arrowTurret.range, dmg: COSTS.arrowTurret.dmg, fireRate: COSTS.arrowTurret.fireRate, cd: 0, hp: 100 });
    player.money -= COSTS.arrowTurret.money;
lastBuildTime = performance.now();

  } else if (currentSelection === 'laserTurret' && player.money >= COSTS.laserTurret.money) {
    turrets.push({ x: gx, y: gy, type: 'laser', range: COSTS.laserTurret.range, dmg: COSTS.laserTurret.dmg, fireRate: COSTS.laserTurret.fireRate, cd: 0, hp: 100 });
    player.money -= COSTS.laserTurret.money;
lastBuildTime = performance.now();

  }
});



const upgradeModal = document.getElementById('upgradeModal');
const upgradeButton = document.getElementById('upgradeButton');
const closeUpgrade = document.getElementById('closeUpgrade');
const upgradeInfo = document.getElementById('upgradeInfo');
let selectedTurret = null;

canvas.addEventListener('click', e => {
// empêcher l'ouverture du menu d'upgrade juste après un placement
if (performance.now() - lastBuildTime < 300) return;

  // Si on ouvre le menu d'upgrade, on annule la sélection du shop
  if (currentSelection) {
    currentSelection = null;
    shopButtons.forEach(bb => bb.classList.remove('selected'));
  }

  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const { ox, oy } = cameraOffset();
  const wx = cx + ox, wy = cy + oy;

  for (let t of turrets) {
    if (wx > t.x && wx < t.x + tileSize && wy > t.y && wy < t.y + tileSize) {
      selectedTurret = t;
      openUpgradeMenu(t);
      break;
    }
  }
});



function openUpgradeMenu(t) {
  upgradeModal.innerHTML = ''; // vider l’ancien contenu
  const upgrades = UPGRADE_DATA[t.type];
  if (!upgrades) return;

  const lvl = t.level || 0;
  if (lvl >= upgrades.length) {
    upgradeModal.textContent = "Tourelle déjà au niveau maximum.";
    return;
  }

  const levelChoices = upgrades[lvl].choices;
  levelChoices.forEach((choice, idx) => {
    const btn = document.createElement('button');
    btn.textContent = `${choice.name} (${choice.cost}$)`;
    btn.style.margin = '5px';
    btn.addEventListener('click', () => {
      if (player.money < choice.cost) {
        alert("Pas assez d'argent 💸");
        return;
      }

      player.money -= choice.cost;
      t.level = lvl + 1;
      for (const [k, v] of Object.entries(choice)) {
        if (k !== 'cost' && k !== 'name') t[k] = v;
      }
      const newImg = new Image();
      newImg.src = choice.texture;
      t.customTexture = newImg;

      upgradeModal.classList.add('hidden');
    });
    upgradeModal.appendChild(btn);
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = "Annuler";
  closeBtn.style.margin = '5px';
  closeBtn.addEventListener('click', () => upgradeModal.classList.add('hidden'));
  upgradeModal.appendChild(closeBtn);

  upgradeModal.classList.remove('hidden');
}


if (closeUpgrade) closeUpgrade.addEventListener('click', () => upgradeModal.classList.add('hidden'));

if (upgradeButton) upgradeButton.addEventListener('click', () => {
  if (!selectedTurret) return;
  const lvl = selectedTurret.level || 0;
  const upgrades = UPGRADE_DATA[selectedTurret.type];
  if (!upgrades || lvl >= upgrades.length) return;

  const u = upgrades[lvl];
  if (player.money < u.cost) {
    upgradeInfo.textContent = "Pas assez d'argent 💸";
    return;
  }

  player.money -= u.cost;
  selectedTurret.level = lvl + 1;

  // Appliquer les nouvelles stats
  for (const [k, v] of Object.entries(u)) {
    if (k !== 'cost' && k !== 'texture') selectedTurret[k] = v;
  }

  // Changer l'image (on garde la texture en cache)
 // Charger une nouvelle image uniquement pour CETTE tourelle
const newImg = new Image();
newImg.src = u.texture;
selectedTurret.customTexture = newImg;


 // ✅ Message + fermeture automatique
  upgradeInfo.textContent = "Amélioration réussie ✅";
  setTimeout(() => upgradeModal.classList.add('hidden'), 600);
});








// ==== Helpers ====
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function distXY(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// ==== Update loop ====
let frame = 0;
function update() {
  frame++;

  // player movement
  if (keys['w'] || keys['arrowup']) player.y -= player.speed;
  if (keys['s'] || keys['arrowdown']) player.y += player.speed;
  if (keys['a'] || keys['arrowleft']) player.x -= player.speed;
  if (keys['d'] || keys['arrowright']) player.x += player.speed;
  player.x += player.dx; player.y += player.dy;
player.x = Math.max(player.r, Math.min(worldPixelW - player.r, player.x));
player.y = Math.max(player.r, Math.min(worldPixelH - player.r, player.y));


  // collect resources
  for (let r of resources) {
    if (!r.taken && Math.abs(player.x - r.x) < player.r + r.r && Math.abs(player.y - r.y) < player.r + r.r) {
      r.taken = true;
      player.resources += 1;
    }
  }

  // generators produce money
  for (let g of generators) player.money += g.production / 60;
// ==== Tourelles (tir automatique) ====
for (let t of turrets) {
  if (t.cd > 0) {
    t.cd--;
    continue;
  }

  // Chercher la cible la plus proche
  let target = null;
  let bestDist = t.range;

  for (let z of zombies) {
    const d = Math.hypot(z.x - (t.x + tileSize / 2), z.y - (t.y + tileSize / 2));
    if (d < bestDist) {
      bestDist = d;
      target = z;
    }
  }

  // Si une cible est trouvée
  if (target) {
    t.cd = t.fireRate;

    if (t.type === 'arrow') {
      // Flèche → projectile classique
      projectiles.push({
        x: t.x + tileSize / 2,
        y: t.y + tileSize / 2,
        tx: target.x,
        ty: target.y,
        dmg: t.dmg,
        speed: 10,
        type: 'arrow'
      });

    } else if (t.type === 'laser') {
      // Laser → frappe instantanée + rayon visible court
      target.hp -= t.dmg;
      t.laserEffect = {
        tx: target.x,
        ty: target.y,
        timer: 15 // durée visible du rayon (~0.25 s)
      };
    }
else if (t.type === 'ice') {
    // AOE autour de la tourelle
    for (let z of zombies) {
        const d = Math.hypot(z.x - (t.x + tileSize/2), z.y - (t.y + tileSize/2));
        if (d <= t.range) {
            z.slow = t.slow;           // facteur de ralentissement
            z.slowTimer = t.duration;   // durée en frames
        }
    }
    t.iceEffect = { timer: 15 }; // effet visuel temporaire
}

  }
}

// ==== Projectiles ====
for (let i = projectiles.length - 1; i >= 0; i--) {
  const p = projectiles[i];
  const dx = p.tx - p.x;
  const dy = p.ty - p.y;
  const dist = Math.hypot(dx, dy);

  // avancer le projectile
  if (dist > p.speed) {
    p.x += (dx / dist) * p.speed;
    p.y += (dy / dist) * p.speed;
  } else {
    projectiles.splice(i, 1);
    continue;
  }

  // collision avec un zombie
  for (let z of zombies) {
    if (Math.hypot(z.x - p.x, z.y - p.y) < z.r) {
      z.hp -= p.dmg;
      projectiles.splice(i, 1);
      break;
    }
  }
}

// ==== Effet visuel laser court ====
for (let t of turrets) {
  if (t.laserEffect) {
    t.laserEffect.timer--;
    if (t.laserEffect.timer <= 0) {
      delete t.laserEffect;
    }
  }
}

// ==== Zombies IA 
for (let z of zombies) {
  if (z.hp <= 0) continue;
  if (z.attackCooldown > 0) z.attackCooldown--;

  // direction vers le joueur
  let dx = player.x - z.x;
  let dy = player.y - z.y;
  let distToPlayer = Math.hypot(dx, dy);

  // 🧊 appliquer ralentissement s'il est actif
  let speedFactor = 1;
  if (z.slowTimer > 0) {
    speedFactor = z.slow;
    z.slowTimer--;
  } else {
    z.slow = 1;
    z.slowTimer = 0;
  }

  // vitesse ralentie
  let vx = (dx / distToPlayer) * z.speed * speedFactor;
  let vy = (dy / distToPlayer) * z.speed * speedFactor;

  // collisions + attaque des structures
  const allStructures = [...walls, ...generators, ...turrets];
  for (let s of allStructures) {
    const half = tileSize / 2;
    const cx = s.x + half;
    const cy = s.y + half;
    const diffX = z.x - cx;
    const diffY = z.y - cy;

    if (Math.abs(diffX) < half + z.r && Math.abs(diffY) < half + z.r) {
      // push-back simple pour bloquer le zombie
      if (Math.abs(diffX) > Math.abs(diffY))
        z.x += diffX > 0 ? z.speed : -z.speed;
      else
        z.y += diffY > 0 ? z.speed : -z.speed;

      // attaque structure
      if (z.attackCooldown <= 0) {
        s.hp = s.hp || 100;
        s.hp -= 15;
        z.attackCooldown = 45;
        if (s.hp <= 0) {
          if (walls.includes(s)) walls.splice(walls.indexOf(s), 1);
          else if (generators.includes(s)) generators.splice(generators.indexOf(s), 1);
          else if (turrets.includes(s)) turrets.splice(turrets.indexOf(s), 1);
        }
      }
    }
  }

  // appliquer mouvement vers le joueur
  z.x += vx;
  z.y += vy;

  // attaque joueur
  const distToPlayerNow = Math.hypot(player.x - z.x, player.y - z.y);
  if (distToPlayerNow < z.r + player.r && z.attackCooldown <= 0) {
    player.hp -= 10;
    z.attackCooldown = 45;
    if (player.hp <= 0) {
      player.hp = player.maxHp;
      player.money = 0;
      player.resources = 0;
      player.x = worldPixelW / 2;
      player.y = worldPixelH / 2;
      console.log('💀 Le joueur est mort. Argent et ressources perdus.');
    }
  }
}






  // cleanup dead zombies
  for (let i = zombies.length-1; i >= 0; i--) if (zombies[i].hp <= 0) zombies.splice(i,1);

  // ==== Gestion des vagues ====
// ==== Gestion des vagues ====
if (frame < 60) return; // délai 1s avant première vague

if (!waveInProgress) {
  waveTimer++;
  if (waveTimer >= waveInterval) {
    waveInProgress = true;
    waveTimer = 0;
    waveElapsed = 0; // reset timer de la vague
    const enemyCount = enemiesPerWave + (wave-1)*5;
    const difficulty = 1 + wave*0.25;
    for (let i=0;i<enemyCount;i++) zombies.push({
      x: Math.random()*worldPixelW,
      y: Math.random()*worldPixelH,
      r: 14,
      speed: 0.8 + Math.random()*0.4*difficulty,
      hp: Math.floor(100*difficulty),
      attackCooldown: 0
    });
    console.log(`🌊 Vague ${wave} commencée (${enemyCount} ennemis)`);
  }
} else {
  waveElapsed++; // compteur du temps écoulé de la vague

  // Fin de vague si temps max atteint, peu importe s'il reste des zombies
  if (waveElapsed >= maxWaveTime) {
    waveInProgress = false;
    wave++;
    waveTimer = 0;
    console.log(`⏱️ Vague ${wave-1} terminée automatiquement (temps écoulé).`);
  }
}



  // update HUD
  if (resCountEl) resCountEl.textContent = Math.floor(player.resources);
  if (moneyCountEl) moneyCountEl.textContent = Math.floor(player.money);

const healthbarInner = document.getElementById('healthbar-inner');
if (healthbarInner) {
  const ratio = Math.max(0, player.hp / player.maxHp);
  healthbarInner.style.width = (ratio * 100) + '%';

  // couleur dynamique (vert → jaune → rouge)
  if (ratio > 0.6) healthbarInner.style.background = 'linear-gradient(to right, #2ecc71, #27ae60)';
  else if (ratio > 0.3) healthbarInner.style.background = 'linear-gradient(to right, #f1c40f, #f39c12)';
  else healthbarInner.style.background = 'linear-gradient(to right, #e74c3c, #c0392b)';
}

}


// ==== Draw loop ====
function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const { ox, oy } = cameraOffset();

  // background
  ctx.fillStyle = '#18391E';
  ctx.fillRect(0,0,canvas.width,canvas.height);
// === Grille de placement ===
ctx.strokeStyle = 'rgba(255,255,255,0.06)'; // blanc très léger
ctx.lineWidth = 1;

const startX = Math.floor(ox / tileSize) * tileSize - ox;
const startY = Math.floor(oy / tileSize) * tileSize - oy;
const endX = canvas.width;
const endY = canvas.height;

for (let x = startX; x < endX; x += tileSize) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, endY);
  ctx.stroke();
}

for (let y = startY; y < endY; y += tileSize) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(endX, y);
  ctx.stroke();
}

// Limites de la carte
ctx.strokeStyle = '#4a752c'; // Vert foncé pour s'accorder au sol
ctx.lineWidth = 6;
ctx.strokeRect(-ox, -oy, worldPixelW, worldPixelH);

  // resources
  for (let r of resources) {
    if (r.taken) continue;
    ctx.fillStyle = r.type==='tree'?'#2ecc71':'#95a5a6';
    ctx.beginPath();
    ctx.arc(r.x-ox, r.y-oy, r.r/2,0,Math.PI*2);
    ctx.fill();
  }

  // structures
  // ==== Structures ====
for (let w of walls)
  ctx.drawImage(textures.wall, w.x - ox, w.y - oy, tileSize, tileSize);

for (let g of generators)
  ctx.drawImage(textures.generator, g.x - ox, g.y - oy, tileSize, tileSize);

for (let t of turrets) {
  let img;
if (t.customTexture) {
  img = t.customTexture;
} else {
  switch (t.type) {
    case 'arrow':
      img = textures.turret_arrow;
      break;
    case 'laser':
      img = textures.turret_laser;
      break;
    case 'ice':
      img = textures.iceTurret;
      break;
    default:
      img = textures.turret_arrow;
  }
}
ctx.drawImage(img, t.x - ox, t.y - oy, tileSize, tileSize);

  // ==== Effet visuel tourelle de glace ====
  if (t.type === 'ice' && t.iceEffect) {
    const cx = t.x + tileSize / 2 - ox;
    const cy = t.y + tileSize / 2 - oy;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, t.range);
    grad.addColorStop(0, 'rgba(120,200,255,0.25)');
    grad.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, t.range, 0, Math.PI * 2);
    ctx.fill();

    t.iceEffect.timer--;
    if (t.iceEffect.timer <= 0) delete t.iceEffect;
  }
}



  // projectiles
  ctx.fillStyle='#f39c12';
  for (let p of projectiles) {
    ctx.beginPath();
    ctx.arc(p.x-ox, p.y-oy,4,0,Math.PI*2);
    ctx.fill();
  }






// effets laser temporaires
for (let t of turrets) {
  if (t.laserEffect) {
    ctx.strokeStyle = 'rgba(255, 50, 0, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(t.x + tileSize / 2 - ox, t.y + tileSize / 2 - oy);
    ctx.lineTo(t.laserEffect.tx - ox, t.laserEffect.ty - oy);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

  // zombies
  for (let z of zombies) ctx.drawImage(textures.zombie, z.x-z.r-ox, z.y-z.r-oy, z.r*2, z.r*2);

  // player
  ctx.drawImage(textures.player, canvas.width/2-player.r, canvas.height/2-player.r, player.r*2, player.r*2);

  ctx.font='16px Arial'; 
ctx.fillStyle='white'; 
ctx.textAlign='center';

if (waveInProgress) {
  const timeLeft = Math.max(0, Math.ceil((maxWaveTime - waveElapsed)/60));
  ctx.fillText(`Vague ${wave} | ${timeLeft}s restants`, canvas.width/2, 30);
} else {
  const timeLeft = Math.max(0, Math.ceil((waveInterval-waveTimer)/60));
  ctx.fillText(` vague ${wave} dans ${timeLeft}s`, canvas.width/2,30);
}



  // placement preview
  if (currentSelection && lastPointer) {
    const wx = lastPointer.x + ox, wy = lastPointer.y + oy;
    const gx = Math.floor(wx/tileSize)*tileSize, gy = Math.floor(wy/tileSize)*tileSize;
    const pxv = gx - ox, pyv = gy - oy;
    ctx.globalAlpha=0.7;
    if (currentSelection==='wall') ctx.drawImage(textures.wall, pxv, pyv, tileSize, tileSize);
    else if (currentSelection==='generator') ctx.drawImage(textures.generator, pxv, pyv, tileSize, tileSize);
    else if (currentSelection==='arrowTurret') ctx.drawImage(textures.turret_arrow, pxv, pyv, tileSize, tileSize);
    else if (currentSelection==='laserTurret') ctx.drawImage(textures.turret_laser, pxv, pyv, tileSize, tileSize);
    ctx.globalAlpha=1;


  }
}

// ==== Main loop ====
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

async function start() {
  try {
    await loadTextures();
    loop();
  } catch (err) {
  console.error(err);
  alert('Erreur chargement textures dans img/. Le jeu ne peut pas démarrer.');
}

}

start();
