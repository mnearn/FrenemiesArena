const $ = (s) => document.querySelector(s),
  socket = io({ autoConnect: true }),
  colors = ["#b9df8c", "#d5a3ed", "#6bc6e1", "#efa576"],
  ec = {
    fire: "#ff975e",
    water: "#67c8ff",
    earth: "#b8cf78",
    air: "#b6f1dc",
    electricity: "#d1a3ff",
  };
const names = {
  sword: "Sword & Shield",
  daggers: "Daggers",
  spear: "Spear",
  scythe: "Scythe",
  bow: "Bow & Arrow",
  staff: "Magic Staff",
  fire: "Fire",
  water: "Water",
  earth: "Earth",
  air: "Air",
  electricity: "Electricity",
  vampirism: "Vampirism",
  berserker: "Berserker",
  laststand: "Last Stand",
  adrenaline: "Adrenaline",
};
const details = {
  sword:
    "12 damage / 1.5 attacks per second. Every third hit +6. Space switches to defensive stance; Shift guards.",
  daggers:
    "7 damage / 2.2 attacks per second. Every fourth hit speeds you up. Q: four-hit Shadow Flurry.",
  spear:
    "11 damage / 1.4 attacks per second. Outer tip deals 17 and knocks back. Q: Piercing Thrust.",
  scythe:
    "16 damage / 1 attack per second. 2% execute chance below half HP; bosses take +50 instead. Q: Reaping Sweep (24).",
  bow: "Quick 10 / charged 20 / perfect 30. Release at 85–95% charge. Consecutive hits build Eagle Eye.",
  staff:
    "Elemental projectiles. +10% elemental damage and 15% shorter element cooldowns. Q also casts your element.",
  fire: "Hits apply stacking Burn. E: Flame Burst (12 damage +2 Burn).",
  water: "Hits slow targets 15% for 5 seconds. E: Tidal Wave.",
  earth:
    "Hits grant Overshield, capped at 10. E: shield and a projectile barrier.",
  air: "10% direct-hit dodge; hits build movement speed. E: invulnerable dash.",
  electricity:
    "Five hits build attack speed; the sixth chains lightning. E: Thunderstrike 220 units ahead.",
  vampirism: "Heal 7% of direct HP damage with melee (5% Daggers/Bow/Staff).",
  berserker: "+25% direct damage below 25% HP.",
  laststand:
    "Survive a fatal hit at 1 HP once per round; 1.5 seconds invulnerable.",
  adrenaline: "+20% attack speed for 5 seconds after an elimination.",
};
let state = null,
  me = null,
  id = null,
  token = sessionStorage.getItem("fa-token"),
  keys = {},
  attackHeld = false,
  aim = 0,
  muted = true,
  audioCtx = null,
  seen = new Set(),
  effects = [],
  positions = {},
  bannerUntil = 0,
  lastUi = 0,
  feed = [],
  lastPhase = "",
  entered = false;
for (const [field, opts] of Object.entries({
  weapon: ["sword", "daggers", "spear", "scythe", "bow", "staff"],
  element: ["fire", "water", "earth", "air", "electricity"],
  trait: ["vampirism", "berserker", "laststand", "adrenaline"],
})) {
  for (const v of opts) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = names[v];
    $("#" + field).append(o);
  }
  $("#" + field).onchange = () => {
    updateInfo();
    socket.emit("loadout", loadout());
  };
}
function loadout() {
  return {
    weapon: $("#weapon").value,
    element: $("#element").value,
    trait: $("#trait").value,
  };
}
function updateInfo() {
  const l = loadout();
  $("#loadout-info").replaceChildren();
  for (const v of Object.values(l)) {
    const div = document.createElement("div"),
      b = document.createElement("b");
    b.textContent = names[v] + ": ";
    div.append(b, details[v]);
    $("#loadout-info").append(div);
  }
}
updateInfo();
$("#name").value = localStorage.getItem("fa-name") || "";
$("#code").value = new URLSearchParams(location.search).get("room") || "";
function enter(create = false, reconnect = false) {
  $("#error").textContent = "";
  socket
    .timeout(5000)
    .emit(
      "enter",
      {
        create,
        name: $("#name").value,
        code: $("#code").value,
        token: reconnect ? token : null,
      },
      (err, r) => {
        if (err || !r?.ok) {
          $("#error").textContent = err
            ? "Server did not respond. Please try again."
            : r.error;
          if (reconnect) {
            sessionStorage.removeItem("fa-token");
            token = null;
            entered = false;
            $("#landing").hidden = false;
            $("#game").hidden = true;
          }
          return;
        }
        id = r.id;
        token = r.token;
        sessionStorage.setItem("fa-token", token);
        localStorage.setItem("fa-name", $("#name").value);
        $("#landing").hidden = true;
        $("#game").hidden = false;
        entered = true;
        $("#arena").focus();
      },
    );
}
$("#create").onclick = () => enter(true);
$("#join").onclick = () => enter(false);
$("#code").onkeydown = (e) => {
  if (e.key === "Enter") enter(false);
};
$("#ready").onclick = () => socket.emit("ready");
$("#again").onclick = () => {
  sessionStorage.removeItem("fa-token");
  location.href = "/";
};
$("#copy").onclick = async () => {
  if (!state) return;
  try {
    await navigator.clipboard.writeText(
      `${location.origin}/?room=${state.code}`,
    );
    $("#copy").title = "Room link copied";
    notify("Room link copied");
  } catch {
    notify(`Room code: ${state.code}`);
  }
};
$("#help").onclick = () => {
  release();
  $("#help-dialog").showModal();
};
$("#close-help").onclick = () => $("#help-dialog").close();
$("#sound").onclick = () => {
  muted = !muted;
  $("#sound").textContent = muted ? "SOUND OFF" : "SOUND ON";
  if (!muted) {
    audioCtx ||= new AudioContext();
    audioCtx.resume();
    beep(440, 0.08);
  }
};
function beep(freq = 220, length = 0.04) {
  if (muted || !audioCtx) return;
  const o = audioCtx.createOscillator(),
    g = audioCtx.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.035, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + length);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + length);
}
function notify(text) {
  $("#banner").textContent = text;
  bannerUntil = performance.now() + 2300;
}
socket.on("connect", () => {
  $("#connection").innerHTML = "<i></i> SERVER CONNECTED";
  $("#create").disabled = false;
  $("#join").disabled = false;
  if (token) enter(false, true);
});
socket.on("disconnect", () => {
  $("#connection").textContent = "RECONNECTING…";
  release();
  if (entered) notify("Connection lost — reconnecting");
});
socket.on("connect_error", () => {
  $("#connection").textContent = "SERVER UNAVAILABLE";
  $("#error").textContent =
    "Unable to reach the game server. Check your connection and try again.";
});
socket.on("state", (s) => {
  state = s;
  me = s.players.find((p) => p.id === id);
  if (!me) return;
  for (const e of s.events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (s.now - e.t > 2) continue;
    if (["hit", "swing", "burst", "float", "beam"].includes(e.type)) {
      effects.push({ ...e, born: performance.now() });
      if (e.type === "hit") beep(120 + e.amount * 8);
    } else if (e.type === "stage") {
      notify(e.text);
      beep(500, 0.15);
    } else if (e.type === "notice") {
      feed.unshift(e.text);
      feed = feed.slice(0, 5);
    }
  }
  if (seen.size > 2000) seen = new Set(s.events.map((e) => e.id));
  if (lastPhase !== s.phase) {
    lastPhase = s.phase;
    release();
    Object.keys(me.loadout).forEach((k) => ($("#" + k).value = me.loadout[k]));
    updateInfo();
  }
  if (performance.now() - lastUi > 100) {
    ui();
    lastUi = performance.now();
  }
});
const sum = (p) => p.score.reduce((a, b) => a + b, 0);
function ranking() {
  return [...state.players].sort(
    (a, b) =>
      sum(b) - sum(a) ||
      b.stageWins - a.stageWins ||
      b.eliminations - a.eliminations ||
      b.damage - a.damage,
  );
}
function ui() {
  const s = state;
  $("#room").textContent = s.code;
  $("#count").textContent = `${s.players.length}/4`;
  $("#phase").textContent =
    s.phase === "select"
      ? "LOADOUT SELECTION"
      : s.phase === "lobby"
        ? "THE LOBBY"
        : s.phase === "results"
          ? "MATCH COMPLETE"
          : s.phase === "ffa"
            ? "STAGE 01 / FREE-FOR-ALL"
            : s.phase === "duel"
              ? "STAGE 02 / TWO VERSUS TWO"
              : "STAGE 03 / THE FINAL RAID";
  $("#stage-title").textContent =
    s.phase === "lobby"
      ? "Gather your rivals."
      : s.phase === "select"
        ? s.message
        : s.phase === "ffa"
          ? "Everyone for themselves."
          : s.phase === "duel"
            ? `Round ${s.round} · First to three`
            : s.phase === "raid"
              ? `${s.boss.name} · Attempt ${s.attempt}`
              : "The crown has a name.";
  $("#timer").textContent = ["lobby", "results"].includes(s.phase)
    ? "—"
    : s.sudden && s.phase === "ffa"
      ? "SD"
      : `${Math.floor(s.time / 60)}:${String(Math.ceil(s.time % 60)).padStart(2, "0")}`;
  const selecting = ["lobby", "select"].includes(s.phase);
  $("#loadout-panel").hidden = !selecting;
  $("#selection-title").textContent =
    s.phase === "lobby"
      ? "Make it personal."
      : s.next === "raid"
        ? "Stand together."
        : "Choose your edge.";
  $("#selection-note").textContent =
    s.attempt === 2 && s.next === "raid"
      ? "Retry: change at least one choice. Unchanged loadouts get the next element."
      : "Choose one weapon, element, and trait. Duplicates are welcome.";
  $("#ready").textContent = me.ready
    ? "READY ✓ · CLICK TO UNREADY"
    : "READY UP →";
  $("#ready-note").textContent =
    s.phase === "lobby"
      ? `${s.players.filter((p) => p.ready).length}/4 ready · Share the room link with your friends.`
      : `Starting in ${Math.ceil(s.time)}s · All four ready starts sooner.`;
  $("#roster").replaceChildren();
  for (const [i, p] of s.players.entries()) {
    const card = document.createElement("div");
    card.className = "player-card" + (p.id === id ? " mine" : "");
    const score = document.createElement("span");
    score.className = "score";
    score.textContent = sum(p);
    const title = document.createElement("strong");
    title.textContent = p.name + (p.id === id ? " · YOU" : "");
    title.style.color = colors[i];
    const detail = document.createElement("div");
    detail.className = "details";
    detail.textContent = `${names[p.loadout.weapon]} / ${names[p.loadout.element]}`;
    const hp = document.createElement("progress");
    hp.max = p.maxHP;
    hp.value = p.hp;
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = !p.connected
      ? "DISCONNECTED"
      : selecting
        ? p.ready
          ? "READY"
          : "CHOOSING"
        : p.down
          ? `DOWNED · ${Math.ceil(p.bleed)}s`
          : p.dead
            ? p.respawn > 0
              ? `RESPAWN · ${Math.ceil(p.respawn)}s`
              : "SPECTATING"
            : s.phase === "duel"
              ? p.team === 0
                ? "TEAM JADE"
                : "TEAM VIOLET"
              : `${Math.ceil(p.hp)} HP${p.shield ? ` + ${Math.ceil(p.shield)} SHIELD` : ""}`;
    card.append(score, title, detail, hp, status);
    $("#roster").append(card);
  }
  $("#round-info").textContent =
    s.phase === "duel" || (s.phase === "select" && s.next === "duel")
      ? `JADE ${s.wins[0]} — ${s.wins[1]} VIOLET · No respawns`
      : s.phase === "raid"
        ? `YOUR CONTRIBUTION: ${Math.round(me.damage)} damage · ${me.revives} revives · ${Math.floor(me.aliveTime)}s alive`
        : "Points carry through all three stages.";
  $("#feed").replaceChildren(
    ...feed.map((t) => {
      const p = document.createElement("p");
      p.textContent = t;
      return p;
    }),
  );
  $("#your-health b").textContent = me.down
    ? `DOWNED · ${Math.ceil(me.bleed)}s`
    : me.dead
      ? "SPECTATING"
      : `${Math.ceil(me.hp)} / ${me.maxHP}${me.shield ? ` +${Math.ceil(me.shield)}` : ""}`;
  $("#your-health progress").value = me.hp;
  $("#attack-label span").textContent =
    me.loadout.weapon === "bow" ? "Hold / release" : names[me.loadout.weapon];
  $("#special-label b").textContent =
    me.specialCD > 0
      ? `${me.specialCD.toFixed(1)}s`
      : me.loadout.weapon === "sword"
        ? me.stance
        : "";
  $("#element-label span").textContent = names[me.loadout.element];
  $("#element-label b").textContent =
    me.elementCD > 0 ? `${me.elementCD.toFixed(1)}s` : "READY";
  $("#bossbar").hidden = s.phase !== "raid";
  if (s.boss) {
    $("#bossname").textContent = s.boss.name.toUpperCase();
    $("#bosshp").textContent = `${Math.ceil(s.boss.hp)} / ${s.boss.maxHP}`;
    $("#bossprogress").value = s.boss.hp / s.boss.maxHP;
  }
  $("#result-panel").hidden = s.phase !== "results";
  if (s.phase === "results") {
    const list = ranking(),
      top = list[0],
      tied = list.filter(
        (p) =>
          sum(p) === sum(top) &&
          p.stageWins === top.stageWins &&
          p.eliminations === top.eliminations &&
          Math.abs(p.damage - top.damage) < 1e-7,
      );
    $("#champion").textContent =
      tied.length > 1
        ? `${tied.map((p) => p.name).join(" & ")} · Co-champions`
        : `${top.name} takes the crown.`;
    $("#result-message").textContent = s.message;
    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr><th>PLAYER</th><th>FFA</th><th>2V2</th><th>RAID</th><th>TOTAL</th></tr></thead>";
    const body = document.createElement("tbody");
    for (const p of list) {
      const row = document.createElement("tr");
      for (const v of [p.name, ...p.score, sum(p)]) {
        const td = document.createElement("td");
        td.textContent = v;
        row.append(td);
      }
      body.append(row);
    }
    table.append(body);
    $("#results-table").replaceChildren(table);
  }
}
function release() {
  keys = {};
  attackHeld = false;
}
window.addEventListener("blur", release);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) release();
});
window.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT"].includes(e.target.tagName) || $("#help-dialog").open)
    return;
  const k = e.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k))
    e.preventDefault();
  keys[k] = true;
});
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));
const canvas = $("#arena"),
  ctx = canvas.getContext("2d");
canvas.addEventListener("pointermove", (e) => {
  if (!me) return;
  const r = canvas.getBoundingClientRect(),
    scale = Math.min(r.width / 1200, r.height / 760),
    ox = (r.width - 1200 * scale) / 2,
    oy = (r.height - 760 * scale) / 2;
  const x = (e.clientX - r.left - ox) / scale,
    y = (e.clientY - r.top - oy) / scale;
  aim = Math.atan2(y - me.y, x - me.x);
});
canvas.addEventListener("pointerdown", (e) => {
  if (e.button === 0) {
    attackHeld = true;
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener("pointerup", () => (attackHeld = false));
canvas.addEventListener("pointercancel", () => (attackHeld = false));
canvas.oncontextmenu = (e) => e.preventDefault();
for (const btn of document.querySelectorAll("#touch-controls button")) {
  btn.onpointerdown = (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    if (btn.dataset.action) attackHeld = true;
    else keys[btn.dataset.key] = true;
  };
  btn.onpointerup = btn.onpointercancel = () => {
    if (btn.dataset.action) attackHeld = false;
    else keys[btn.dataset.key] = false;
  };
}
setInterval(() => {
  if (!me || !socket.connected || !entered) return;
  socket.emit("input", {
    x:
      Number(!!(keys.d || keys.arrowright)) -
      Number(!!(keys.a || keys.arrowleft)),
    y:
      Number(!!(keys.s || keys.arrowdown)) - Number(!!(keys.w || keys.arrowup)),
    aim,
    attack: attackHeld,
    special: !!keys.q,
    element: !!keys.e,
    stance: !!keys[" "],
    guard: !!keys.shift,
    interact: !!keys.r,
  });
}, 1000 / 30);
function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}
// Deterministic, cached scenery: decoration never changes collision geometry.
const terrainCache = new Map();
function background(c, w = 1200, h = 760) {
  const key = `${w}:${h}`;
  if (!terrainCache.has(key)) {
    const tile = document.createElement('canvas');
    tile.width = w; tile.height = h;
    const t = tile.getContext('2d');
    let seed = 1729;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    rect(t, 0, 0, w, h, '#497842');
    for (let i = 0; i < w * h / 100; i++) {
      const x = Math.floor(rand() * w / 4) * 4, y = Math.floor(rand() * h / 4) * 4;
      rect(t, x, y, 4 + Math.floor(rand() * 3) * 4, 4,
        ['#588b46', '#63994c', '#739e50', '#3e6c3d'][i % 4]);
    }
    // The playable area remains flat and unobstructed, with a narrow earthen rim.
    rect(t, 24, 24, w - 48, h - 48, '#493e32');
    rect(t, 28, 28, w - 56, h - 56, '#70513b');
    rect(t, 36, 40, w - 72, h - 76, '#916c4b');
    rect(t, 40, 48, w - 80, h - 88, '#ad8c60');
    for (let i = 0; i < w * h / 480; i++) {
      const x = 44 + Math.floor(rand() * (w - 92) / 4) * 4;
      const y = 52 + Math.floor(rand() * (h - 100) / 4) * 4;
      const col = ['#a3845b', '#b49468', '#b8986c', '#a88960'][i % 4];
      rect(t, x, y, 8, 4, col); rect(t, x - 4, y + 4, 16, 4, col);
      rect(t, x, y + 8, 8, 4, col);
      if (i % 9 === 0) rect(t, x, y, 4, 3, '#c3a477');
    }
    for (let x = 28; x < w - 28; x += 12) {
      rect(t, x, 28, 8, 4, '#9b7852');
      rect(t, x + 4, 36, 4, 8, '#5e4935');
      rect(t, x, h - 36, 8, 4, '#c09c67');
      rect(t, x, 20 + (x % 3) * 2, 8, 8, '#739e50');
      rect(t, x + 4, h - 28, 8, 8, '#63994c');
    }
    for (let y = 32; y < h - 32; y += 12) {
      rect(t, 28, y, 4, 8, '#9b7852');
      rect(t, w - 36, y, 4, 8, '#604b36');
      rect(t, 20, y, 8, 6, '#63994c');
      rect(t, w - 28, y + 4, 8, 8, '#739e50');
    }
    for (let i = 0; i < 34; i++) {
      const x = 8 + Math.floor(rand() * (w - 16) / 4) * 4;
      const y = i % 2 ? 8 : h - 16;
      rect(t, x, y, 2, 8, '#284e38');
      rect(t, x - 3, y, 8, 3, i % 3 ? '#b6c96a' : '#f5dc89');
      if (i % 3 === 0) rect(t, x, y - 2, 2, 7, '#fff0bd');
    }
    terrainCache.set(key, tile);
  }
  c.imageSmoothingEnabled = false;
  c.drawImage(terrainCache.get(key), 0, 0);
}
function pixelSprite(c, rows, palette, x, y, size = 2) {
  for (let j = 0; j < rows.length; j++)
    for (let i = 0; i < rows[j].length; i++) {
      const color = palette[rows[j][i]];
      if (color) rect(c, x + i * size, y + j * size, size, size, color);
    }
}
const heroSprite = [
 '.......oooo.......', '.....ooaaaaoo.....', '....oahhhhaaao....',
 '...oahhaaaaaaao...', '...ohaaaoooooao...', '...oaaooksskoo....',
 '...oaaokseskso....', '....oaoksskoo.....', '....oooogggooo....',
 '..ooaaaoggoaaaoo..', '.oahhaaoggoaahhao.', '.oahaaaoggoaaahao.',
 '.oaaoaaohhoaaaoao.', '.ossoaaoggoaaosso.', '..oooaaoooaaooo..',
 '....oaaggggaao....', '....ooggbbggoo....', '....oaaaaoaaao....',
 '....oaahaohaao....', '....oaaaooaaao....', '....odddoodddo....',
 '...oddddooddddo...', '...ooooo.oooooo...',
];
function playerArt(c, p, color, scale = 1) {
  c.save(); c.translate(Math.round(p.x), Math.round(p.y)); c.scale(scale, scale);
  c.fillStyle = '#342e3055'; c.beginPath(); c.ellipse(0, 17, 21, 7, 0, 0, 7); c.fill();
  if (p.dead) {
    pixelSprite(c, ['..oooo..', '.osssso.', 'osssssso', '.osssso.', '..oooo..'],
      {o:'#4a4842',s:'#9b9580'}, -12, 2, 3);
    c.restore(); return;
  }
  if (p.down) c.rotate(-Math.PI / 2);
  const stride = p.moving && !p.down ? Math.round(Math.sin(performance.now() / 95) * 2) : 0;
  const palette = {o:'#202b30', a:color, h:'#e3e1b4', g:'#b38d48', b:'#f3d578',
    k:'#59443c', s:'#dba97b', e:'#fff0c4', d:'#3b4243'};
  pixelSprite(c, heroSprite, palette, -18, -29 + stride);
  const w = p.loadout?.weapon || 'sword';
  // Distinct silhouettes and equipment for all six weapon classes.
  if (w === 'daggers' || w === 'staff' || w === 'bow') {
    pixelSprite(c, ['...ooooooo...', '..oaaaaaaao..', '.oahhaaaaaao.', 'oahaaaaooooao', 'oaaaooksskkoo',
      'oaaookseeskko', '.oaookssskko.', '..ooooggooo..'], palette, -13, -33 + stride, 2);
  } else {
    rect(c, -12, -27 + stride, 24, 4, '#d9d9b5');
    rect(c, -3, -30 + stride, 5, 11, '#b38d48');
    rect(c, -10, -19 + stride, 21, 3, '#3c4342');
  }
  c.save(); c.rotate(p.aim || 0);
  const metal = '#dfe8db', edge = '#6e929b', gold = '#d1a654';
  if (w === 'bow') {
    pixelSprite(c, ['.gg.....','..gg....','...gg...','....gg..','.....g..','.....g..','....gg..','...gg...','..gg....','.gg.....'],
      {g:gold}, 17, -20, 4);
    rect(c, 22, -16, 1, 33, '#f5e1ab'); rect(c, 18, -1, 29, 2, metal);
    rect(c, 43, -3, 5, 6, edge);
  } else if (w === 'staff') {
    rect(c, 12, -3, 41, 6, '#493d36'); rect(c, 12, -2, 42, 2, '#b69561');
    pixelSprite(c, ['..gg..','.geeg.','geeeeg','.geeg.','..gg..'], {g:gold,e:ec[p.loadout.element] || '#b9d6ee'}, 47,-10,4);
    rect(c, 55, -5, 4, 4, '#fff2d9');
  } else if (w === 'spear' || w === 'scythe') {
    rect(c, 10, -3, 57, 6, '#413d35'); rect(c, 10, -2, 57, 2, '#b99560');
    if (w === 'spear') {
      pixelSprite(c, ['ss....','hsss..','hhhhss','hsss..','ss....'],{s:edge,h:metal},64,-7,3);
      rect(c, 59, -5, 5, 10, gold);
    } else {
      pixelSprite(c, ['...ssssss','..shhhhhh','.shhsssss','shhs.....','shs......','ss.......'],
        {s:edge,h:metal}, 35,-27,4);
    }
  } else {
    const blade = w === 'daggers' ? 24 : 38;
    rect(c, 12, -3, blade, 7, '#27373d'); rect(c, 20, -2, blade - 6, 4, edge);
    rect(c, 20, -2, blade - 9, 2, metal); rect(c, 17, -8, 4, 17, gold);
    if (w === 'daggers') {
      rect(c, -16, -19, 22, 5, edge); rect(c, -15, -19, 20, 2, metal); rect(c, -17, -22, 4, 11, gold);
    } else {
      pixelSprite(c, ['.gggggg.', 'gaaaaaag','gahhhaag','gaagaaag','gggggggg','.aagaag.','..agaa..','...gg...'],
        {g:gold,a:color,h:'#e4e6bf'},-31,-16,4);
    }
  }
  c.restore(); c.restore();
}
function bossArt(c, b) {
  c.save(); c.translate(Math.round(b.x), Math.round(b.y));
  const col = b.azul ? '#359be7' : '#ef6a27', hot = b.azul ? '#91e7ff' : '#ffcc58';
  c.fillStyle = '#47382d77'; c.beginPath(); c.ellipse(0, 39, 62, 17, 0, 0, 7); c.fill();
  const frame = Math.floor(performance.now()/130);
  for (let i=0; i<9; i++) {
    const x = (i - 4) * 10, rise = (i * 13 + frame * 7) % 24;
    pixelSprite(c, ['..f..','..ff.','.fhf.','ffhhf','fhhhf','.fff.'],
      {f:col,h:hot}, x - 10, -53 - rise, 4);
  }
  pixelSprite(c, [
    '.........oooo.........','.......oorrroo.......','......orrrhrrro......',
    '.....orrrrhhrrro.....','..oo.orrrrhhrrro.oo..','.orrrorrohhhorrorrro.',
    'orrrhrrohhhhhorrhrro','orrhhrrohhhhorrrhhro','orhhrrorrrrrrrorhhro',
    '.orrroorrhhrroorrro.','..ooooorhhhroooooo..','..orrrorrhrrorrrro..',
    '.orrrrorrhrorrrrro..','orrrrrohhhhhorrrrro.','orrrrohhrrrhhorrro..',
    'orrrroorrhrroorrro..','.orrr..orhro..rrro..','..ooo..ohhho..ooo...',
    '.......ohhho........','......ohhhhho.......','.....ohhhhhho.......',
    '....ohhhhhhhho......','.....ooooooo........'
  ], {o:'#302e31',r:'#514846',h:col}, -42,-39,4);
  // Faceted obsidian plates, bright eyes and molten seams.
  pixelSprite(c, ['...oooooo...', '..orrhrrro..', '.orrrhrrrro.', 'orrrrhhrrrro',
    'orhrrhrrhrro', '.orhhhhhroo.', '..orhhhroo..', '...orrroo...'],
    {o:'#252a30',r:'#60514b',h:hot},-24,-49,4);
  rect(c,-17,-29,12,4,hot); rect(c,7,-29,12,4,hot);
  rect(c,-26,-2,9,5,'#837063'); rect(c,18,-2,9,5,'#837063');
  for(let i=0;i<5;i++) {
    const x = ((i*37+frame*3)%110)-55, y = 20-((i*17+frame*4)%90);
    rect(c,x,y,3,5,hot);
  }
  c.restore();
}
function draw() {
  const now = performance.now();
  if (!state || !me) {
    requestAnimationFrame(draw);
    return;
  }
  background(ctx);
  for (const z of state.zones) {
    ctx.strokeStyle = state.boss?.azul ? "#124d92" : "#9c2c1c";
    ctx.fillStyle = state.boss?.azul ? "#238eff55" : "#f1492255";
    ctx.lineWidth = 3;
    if (z.kind === "charge") {
      ctx.lineWidth = z.r * 2;
      ctx.strokeStyle = state.boss?.azul ? "#68bfff44" : "#ff9a5c44";
      ctx.beginPath();
      ctx.moveTo(z.x, z.y);
      ctx.lineTo(z.tx, z.ty);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#ffe7b9";
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      z.kind === "charge"
        ? "CHARGE"
        : z.kind === "burst"
          ? "FIRE BURST"
          : "FLAME POKE",
      z.x,
      z.y - 10,
    );
  }
  for (const b of state.barriers) {
    rect(ctx, b.x - 10, b.y - 43, 20, 86, "#a7ba78");
    rect(ctx, b.x - 4, b.y - 38, 8, 76, "#d3dda3");
  }
  if (state.sudden) {
    const r = Math.max(0, 620 - state.suddenAge * 12);
    ctx.strokeStyle = "#ffad70";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(600, 380, r, 0, 7);
    ctx.stroke();
  }
  if (state.boss) bossArt(ctx, state.boss);
  for (const [i, p] of state.players.entries()) {
    let pos = positions[p.id] || { x: p.x, y: p.y };
    if (Math.hypot(pos.x - p.x, pos.y - p.y) > 150) pos = { x: p.x, y: p.y };
    pos.x += (p.x - pos.x) * 0.3;
    pos.y += (p.y - pos.y) * 0.3;
    positions[p.id] = pos;
    const pp = { ...p, ...pos, moving: Math.hypot(pos.x - p.x, pos.y - p.y) > 1 };
    ctx.globalAlpha = p.dead ? 0.4 : 1;
    playerArt(ctx, pp, colors[i]);
    ctx.globalAlpha = 1;
    if (p.id === id) {
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 21, 27, 12, 0, 0, 7);
      ctx.stroke();
    }
    if (p.protection > 0 && !p.dead) {
      ctx.strokeStyle = "#d4e9bd99";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 4, 36, 0, 7);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = p.id === id ? "#f1f4d1" : colors[i];
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#352e29";
    ctx.strokeText(p.name, pos.x, pos.y - 55);
    ctx.fillText(p.name, pos.x, pos.y - 55);
    rect(ctx, pos.x - 25, pos.y - 48, 50, 5, "#142724");
    rect(
      ctx,
      pos.x - 25,
      pos.y - 48,
      (50 * p.hp) / p.maxHP,
      5,
      p.down ? "#ef986a" : colors[i],
    );
    if (p.shield) rect(ctx, pos.x - 25, pos.y - 40, p.shield * 5, 3, "#8ad5e3");
    if (p.burn > 0) {
      ctx.fillStyle = "#ffae73";
      ctx.fillText(`BURN ×${p.burn}`, pos.x, pos.y + 42);
    }
    if (p.down) {
      ctx.fillStyle = "#ffd09a";
      ctx.fillText(`REVIVE · ${Math.ceil(p.bleed)}s`, pos.x, pos.y + 42);
    }
    if (p.reviveProgress > 0) {
      ctx.fillStyle = "#ddf4ad";
      ctx.fillText(
        `REVIVING ${p.reviveProgress.toFixed(1)} / 3`,
        pos.x,
        pos.y - 72,
      );
    }
    if (p.charging) {
      rect(ctx, pos.x - 30, pos.y + 32, 60, 5, "#172728");
      rect(
        ctx,
        pos.x - 30,
        pos.y + 32,
        Math.min(1, p.charge) * 60,
        5,
        "#d2d6aa",
      );
      rect(ctx, pos.x + 21, pos.y + 31, 6, 7, "#ffcc64");
    }
  }
  for (const p of state.projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.vy, p.vx));
    rect(ctx, -8, -3, 20, 6, p.color);
    rect(ctx, 7, -5, 7, 10, p.perfect ? "#fff3a0" : p.color);
    ctx.restore();
  }
  effects = effects.filter((e) => now - e.born < 650);
  for (const e of effects) {
    const age = (now - e.born) / 650;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = e.color;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 4;
    if (e.type === "hit" || e.type === "float") {
      ctx.textAlign = "center";
      ctx.font =
        e.type === "float" ? "bold 15px monospace" : "bold 21px monospace";
      ctx.fillText(e.text || e.amount, e.x, e.y - 28 - age * 45);
    }
    if (e.type === "swing") {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.range * 0.8, e.aim - 0.8, e.aim + 0.8);
      ctx.stroke();
    }
    if (e.type === "burst") {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.5 + age), 0, 7);
      ctx.stroke();
    }
    if (e.type === "beam") {
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.tx, e.ty);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (me.dead && !["lobby", "select", "results"].includes(state.phase)) {
    ctx.fillStyle = "#0e1b2277";
    ctx.fillRect(0, 0, 1200, 760);
    ctx.fillStyle = "#eeebd8";
    ctx.textAlign = "center";
    ctx.font = "bold 30px monospace";
    ctx.fillText(
      me.respawn > 0 ? `RESPAWNING IN ${Math.ceil(me.respawn)}` : "SPECTATING",
      600,
      400,
    );
  }
  if (now > bannerUntil) $("#banner").textContent = "";
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
const cover = $("#cover"),
  cc = cover.getContext("2d");
function drawCover() {
  background(cc, 720, 740);
  cc.save();
  cc.translate(0, -25);
  bossArt(cc, { x: 360, y: 320, azul: false });
  playerArt(
    cc,
    { x: 245, y: 490, aim: -0.8, loadout: { weapon: "sword" } },
    colors[0],
    1.5,
  );
  playerArt(
    cc,
    {
      x: 470,
      y: 490,
      aim: -2.2,
      loadout: { weapon: "staff", element: "electricity" },
    },
    colors[1],
    1.5,
  );
  playerArt(
    cc,
    { x: 155, y: 370, aim: -0.2, loadout: { weapon: "bow" } },
    colors[2],
    1.3,
  );
  playerArt(
    cc,
    { x: 560, y: 365, aim: 3.1, loadout: { weapon: "spear" } },
    colors[3],
    1.3,
  );
  cc.restore();
  cc.fillStyle = "#f3bd7855";
  for (let i = 0; i < 25; i++) {
    const x = (i * 109) % 720,
      y = (i * 97 - performance.now() / 40) % 740;
    cc.fillRect(x, (y + 740) % 740, 3, 3);
  }
  requestAnimationFrame(drawCover);
}
drawCover();
