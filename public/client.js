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
function background(c, w = 1200, h = 760) {
  rect(c, 0, 0, w, h, "#19332f");
  for (let y = 0; y < h; y += 40)
    for (let x = 0; x < w; x += 40) {
      const n = (x * 17 + y * 31) % 97;
      rect(c, x, y, 39, 39, n % 3 === 0 ? "#1d3832" : "#203b35");
      if (n < 45) rect(c, x + 10, y + 16, 3, 5, "#304b3b");
    }
  rect(c, 34, 34, w - 68, h - 68, "#29453c");
  for (let y = 42; y < h - 42; y += 38)
    for (let x = 42; x < w - 42; x += 42) {
      rect(c, x, y, 40, 36, (x + y) % 5 ? "#2c473d" : "#304b41");
      rect(c, x + 2, y + 2, 36, 2, "#365045");
    }
  rect(c, w / 2 - 65, 45, 130, h - 90, "#3b5145");
  rect(c, 45, h / 2 - 60, w - 90, 120, "#3b5145");
  c.strokeStyle = "#6b7654";
  c.lineWidth = 3;
  c.strokeRect(55, 55, w - 110, h - 110);
  c.strokeStyle = "#68734b55";
  c.beginPath();
  c.arc(w / 2, h / 2, 180, 0, Math.PI * 2);
  c.stroke();
  for (const [x, y] of [
    [35, 35],
    [w - 55, 35],
    [35, h - 90],
    [w - 55, h - 90],
  ]) {
    rect(c, x - 12, y + 16, 44, 60, "#112722");
    rect(c, x - 10, y, 40, 58, "#54624c");
    rect(c, x - 14, y - 4, 48, 15, "#788162");
    rect(c, x - 5, y + 12, 8, 34, "#657257");
  }
  for (let i = 0; i < 22; i++) {
    const x = (i * 173 + 50) % w,
      y = i % 2 === 0 ? 8 : h - 20;
    rect(c, x, y, 16, 16, "#4c6447");
    rect(c, x + 4, y - 5, 8, 10, "#718754");
  }
}
function playerArt(c, p, color, scale = 1) {
  c.save();
  c.translate(Math.round(p.x), Math.round(p.y));
  c.scale(scale, scale);
  c.fillStyle = "#071a2166";
  c.beginPath();
  c.ellipse(0, 19, 23, 9, 0, 0, 7);
  c.fill();
  if (p.dead) {
    rect(c, -15, 5, 30, 9, "#77877a");
    c.restore();
    return;
  }
  const wob = p.down ? 0 : Math.sin(performance.now() / 140 + p.x) * 2;
  if (p.down) c.rotate(-Math.PI / 2);
  rect(c, -13, 5, 10, 18, "#14272b");
  rect(c, 4, 5, 10, 18, "#14272b");
  rect(c, -14, -14 + wob, 28, 29, color);
  rect(c, -18, -10 + wob, 8, 21, color);
  rect(c, 10, -10 + wob, 8, 21, color);
  rect(c, -12, -31 + wob, 24, 21, "#d6b58b");
  rect(c, -14, -33 + wob, 28, 8, "#273238");
  rect(c, -14, -27 + wob, 7, 12, "#273238");
  rect(c, 0, -22 + wob, 4, 4, "#18272b");
  rect(c, 9, -22 + wob, 4, 4, "#18272b");
  rect(c, -14, 0 + wob, 28, 6, "#384b3e");
  rect(c, -4, 0 + wob, 7, 6, "#e6d69b");
  c.save();
  c.rotate(p.aim || 0);
  const w = p.loadout?.weapon || "sword";
  if (w === "bow") {
    c.strokeStyle = "#e9c080";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(18, 0, 20, -1.4, 1.4);
    c.stroke();
    c.strokeStyle = "#dedbb7";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(21, -20);
    c.lineTo(21, 20);
    c.stroke();
  } else if (w === "staff") {
    rect(c, 12, -3, 43, 6, "#b39a6d");
    rect(c, 48, -8, 12, 16, ec[p.loadout.element]);
  } else if (w === "spear") {
    rect(c, 12, -3, 62, 6, "#a18b5a");
    rect(c, 68, -6, 18, 12, "#c7d7cd");
  } else if (w === "scythe") {
    rect(c, 12, -3, 50, 6, "#a18b5a");
    rect(c, 53, -23, 8, 26, "#d1daca");
    rect(c, 35, -26, 24, 7, "#d1daca");
  } else {
    rect(c, 14, -4, w === "daggers" ? 25 : 40, 8, "#dae3cc");
    rect(c, 17, -9, 6, 18, "#a8b281");
    if (w === "sword") {
      rect(c, -23, -13, 11, 26, "#879e7f");
      rect(c, -25, -6, 15, 12, "#bbca99");
    }
  }
  c.restore();
  c.restore();
}
function bossArt(c, b) {
  c.save();
  c.translate(b.x, b.y);
  const blue = b.azul,
    col = blue ? "#5ab5f3" : "#ef9851",
    light = blue ? "#b0e8ff" : "#ffe0a1";
  c.fillStyle = "#08181b88";
  c.beginPath();
  c.ellipse(0, 35, 63, 20, 0, 0, 7);
  c.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      t = performance.now() / 200 + i;
    rect(
      c,
      Math.cos(a) * 42 - 8,
      Math.sin(a) * 42 - 12 - Math.sin(t) * 6,
      16,
      27,
      col,
    );
    rect(
      c,
      Math.cos(a) * 42 - 4,
      Math.sin(a) * 42 - 8 - Math.sin(t) * 6,
      8,
      12,
      light,
    );
  }
  rect(c, -32, -31, 64, 65, "#293337");
  rect(c, -46, -14, 20, 47, "#344345");
  rect(c, 26, -14, 20, 47, "#344345");
  rect(c, -28, 25, 20, 22, "#263237");
  rect(c, 9, 25, 20, 22, "#263237");
  rect(c, -22, -42, 44, 37, "#3f4644");
  rect(c, -17, -28, 12, 6, light);
  rect(c, 6, -28, 12, 6, light);
  rect(c, -10, -11, 20, 7, col);
  rect(c, -5, 1, 10, 21, col);
  rect(c, -21, 8, 42, 6, col);
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
    ctx.strokeStyle = state.boss?.azul ? "#68bfff" : "#ff9a5c";
    ctx.fillStyle = state.boss?.azul ? "#68bfff33" : "#ff9a5c33";
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
    const pp = { ...p, ...pos };
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
