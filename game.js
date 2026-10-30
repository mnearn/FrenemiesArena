import { randomUUID, randomInt } from "node:crypto";

export const WEAPONS = ["sword", "daggers", "spear", "scythe", "bow", "staff"];
export const ELEMENTS = ["fire", "water", "earth", "air", "electricity"];
export const TRAITS = ["vampirism", "berserker", "laststand", "adrenaline"];
export const CONFIG = {
  width: 1200,
  height: 760,
  hp: 100,
  speed: 210,
  ffa: 360,
  duel: 60,
  overtime: 15,
  raid: 420,
  select: 10,
  respawn: 5,
  bossHP: 4200,
};
const W = {
  sword: { damage: 12, rate: 1.5, range: 88, halfAngle: 1.05 },
  daggers: { damage: 7, rate: 2.2, range: 65, halfAngle: 0.8 },
  spear: { damage: 11, rate: 1.4, range: 125, halfWidth: 10 },
  scythe: { damage: 16, rate: 1, range: 110, halfAngle: 1.3 },
  bow: { damage: 10, rate: 1.2, range: 700 },
  staff: { damage: 9, rate: 1.5, range: 600 },
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function rankPoints(values) {
  return values.every((v) => v === 0)
    ? values.map(() => 1)
    : values.map((v) => 4 - values.filter((x) => x > v + 1e-7).length);
}
export function validLoadout(l) {
  return (
    l &&
    WEAPONS.includes(l.weapon) &&
    ELEMENTS.includes(l.element) &&
    TRAITS.includes(l.trait)
  );
}
export class Game {
  constructor(code, config = {}) {
    this.code = code;
    this.cfg = { ...CONFIG, ...config };
    this.players = [];
    this.phase = "lobby";
    this.next = "ffa";
    this.time = 0;
    this.now = 0;
    this.events = [];
    this.projectiles = [];
    this.zones = [];
    this.barriers = [];
    this.wins = [0, 0];
    this.round = 0;
    this.attempt = 1;
    this.boss = null;
    this.message = "Gather four players. Ready when you are.";
    this.created = Date.now();
  }
  event(type, data = {}) {
    this.events.push({ id: randomUUID(), type, t: this.now, ...data });
    if (this.events.length > 45) this.events.shift();
  }
  add(name) {
    if (this.phase !== "lobby" || this.players.length >= 4)
      throw Error("Room is full or the match has started.");
    const p = {
      id: randomUUID(),
      name:
        String(name || "Player")
          .trim()
          .slice(0, 18) || "Player",
      connected: true,
      ready: false,
      loadout: { weapon: "sword", element: "fire", trait: "vampirism" },
      score: [0, 0, 0],
      eliminations: 0,
      stageWins: 0,
      team: this.players.length % 2,
      damage: 0,
      revives: 0,
      aliveTime: 0,
    };
    this.players.push(p);
    this.reset(p);
    return p;
  }
  reset(p) {
    const i = this.players.indexOf(p),
      pos = [
        [180, 180],
        [1020, 580],
        [1020, 180],
        [180, 580],
      ][i] || [200, 200];
    Object.assign(p, {
      x: pos[0],
      y: pos[1],
      hp: this.cfg.hp,
      maxHP: this.cfg.hp,
      shield: 0,
      dead: false,
      down: false,
      bleed: 0,
      respawn: 0,
      protection: 2,
      attackCD: 0,
      specialCD: 0,
      elementCD: 0,
      stanceCD: 0,
      reviveCD: 0,
      reviveProgress: 0,
      reviveTarget: null,
      stance: "offense",
      hitCount: 0,
      contender: true,
      counter: 0,
      flurry: 0,
      flurryCD: 0,
      burn: 0,
      burnTime: 0,
      burnTick: 0,
      burnOwner: null,
      soaked: 0,
      airStacks: 0,
      airTime: 0,
      overcharge: 0,
      chargeTime: 0,
      daggerBuff: 0,
      adrenaline: 0,
      dashBuff: 0,
      lastUsed: false,
      eagle: 0,
      charge: 0,
      charging: false,
      roundDamage: 0,
      roundKills: 0,
      aim: 0,
      input: {},
      lastHitAt: -100,
    });
  }
  loadout(p, l) {
    if (!["lobby", "select"].includes(this.phase) || !validLoadout(l))
      return false;
    p.loadout = { weapon: l.weapon, element: l.element, trait: l.trait };
    p.ready = false;
    return true;
  }
  ready(p) {
    if (!["lobby", "select"].includes(this.phase)) return;
    p.ready = !p.ready;
    if (
      this.players.length === 4 &&
      this.players.every((x) => x.ready && x.connected)
    ) {
      if (this.phase === "lobby") this.select("ffa");
      else this.startSelected();
    }
  }
  select(next) {
    this.phase = "select";
    this.next = next;
    this.time = this.cfg.select;
    this.projectiles = [];
    this.zones = [];
    this.barriers = [];
    this.players.forEach((p) => {
      p.ready = false;
      p.input = {};
      p.charge = 0;
    });
    this.message =
      next === "ffa"
        ? "Choose your opening loadout"
        : next === "duel"
          ? `2v2 • Round ${this.round + 1} • Loadouts open`
          : `Raid • Attempt ${this.attempt} • ${this.attempt === 2 ? "Change at least one loadout choice" : "Prepare for Solara"}`;
  }
  startSelected() {
    if (this.next === "raid" && this.attempt === 2)
      for (const p of this.players)
        if (JSON.stringify(p.loadout) === JSON.stringify(p.oldLoadout)) {
          p.loadout.element =
            ELEMENTS[(ELEMENTS.indexOf(p.loadout.element) + 1) % 5];
          this.event("notice", {
            text: `${p.name}: retry element changed to ${p.loadout.element}`,
          });
        }
    this.phase = this.next;
    this.players.forEach((p) => this.reset(p));
    this.time = this.cfg[this.phase];
    this.projectiles = [];
    this.zones = [];
    this.barriers = [];
    this.sudden = false;
    this.suddenAge = 0;
    this.message = "";
    if (this.phase === "duel") {
      this.round++;
      for (const p of this.players) {
        p.x = p.team === 0 ? 200 : 1000;
        p.y =
          260 + this.players.filter((x) => x.team === p.team).indexOf(p) * 240;
      }
    }
    if (this.phase === "raid") {
      this.boss = {
        id: "boss",
        name: "Solara",
        x: 600,
        y: 330,
        hp: this.cfg.bossHP,
        maxHP: this.cfg.bossHP,
        shield: 0,
        azul: false,
        transform: 0,
        attackCD: 2,
        burn: 0,
        burnTime: 0,
        burnTick: 0,
        soaked: 0,
        stagger: 0,
      };
      this.players.forEach((p, i) => {
        p.x = 300 + i * 200;
        p.y = 650;
        p.damage = 0;
        p.revives = 0;
        p.aliveTime = 0;
      });
    }
    this.event("stage", {
      text:
        this.phase === "duel"
          ? `2v2 • Round ${this.round}`
          : this.phase === "raid"
            ? "SOLARA AWAKENS"
            : "FREE FOR ALL",
    });
  }
  input(p, data) {
    if (!data || typeof data !== "object") return;
    p.input = {
      x: clamp(Number(data.x) || 0, -1, 1),
      y: clamp(Number(data.y) || 0, -1, 1),
      aim: Number.isFinite(data.aim) ? data.aim : p.aim,
      attack: !!data.attack,
      special: !!data.special,
      element: !!data.element,
      stance: !!data.stance,
      guard: !!data.guard,
      interact: !!data.interact,
    };
    p.lastInput = this.now;
  }
  enemies(p) {
    if (this.phase === "raid")
      return this.boss && this.boss.hp > 0 ? [this.boss] : [];
    return this.players.filter(
      (t) =>
        t !== p &&
        !t.dead &&
        !t.down &&
        (this.phase !== "ffa" || !this.sudden || t.contender !== false) &&
        (this.phase !== "duel" || t.team !== p.team),
    );
  }
  damage(
    source,
    target,
    amount,
    { elemental = false, dot = false, proc = false, burnStacks = 0 } = {},
  ) {
    if (
      target.hp <= 0 ||
      target.dead ||
      target.down ||
      target.protection > 0 ||
      target.transform > 0
    )
      return 0;
    if (!dot && target.loadout?.element === "air" && Math.random() < 0.1) {
      this.event("float", {
        x: target.x,
        y: target.y,
        text: "DODGE",
        color: "#c9f5e5",
      });
      return 0;
    }
    if (
      !dot &&
      source?.loadout?.trait === "berserker" &&
      source.hp < source.maxHP * 0.25
    )
      amount *= 1.25;
    if (!dot && elemental && source?.loadout?.weapon === "staff") amount *= 1.1;
    if (
      target.input?.guard &&
      target.loadout.weapon === "sword" &&
      target.stance === "defense" &&
      !dot
    )
      amount *= 0.75;
    if (target.counter > 0 && !dot) {
      amount *= 0.5;
      target.counter = 0;
      if (source?.id !== "boss" && source)
        this.damage(target, source, 14, { proc: true });
    }
    const absorbed = Math.min(target.shield || 0, amount);
    target.shield = (target.shield || 0) - absorbed;
    amount -= absorbed;
    let actual = Math.min(target.hp, amount);
    if (
      target.loadout?.trait === "laststand" &&
      !target.lastUsed &&
      amount >= target.hp
    ) {
      actual = target.hp - 1;
      target.hp = 1;
      target.lastUsed = true;
      target.protection = 1.5;
      this.event("float", {
        x: target.x,
        y: target.y,
        text: "LAST STAND",
        color: "#fff1a8",
      });
    } else target.hp = Math.max(0, target.hp - amount);
    target.lastHitAt = this.now;
    target.reviveProgress = 0;
    this.event("hit", {
      target: target.id,
      x: target.x,
      y: target.y,
      amount: Math.round(actual + absorbed),
      color: dot ? "#ff9955" : "#fff2da",
    });
    if (source?.loadout) {
      if (this.phase === "raid" && target.id === "boss")
        source.damage += actual;
      source.roundDamage += actual;
      if (!dot && !proc) {
        source.hitCount++;
        if (source.loadout.trait === "vampirism")
          source.hp = Math.min(
            source.maxHP,
            source.hp +
              actual *
                (["sword", "spear", "scythe"].includes(source.loadout.weapon)
                  ? 0.07
                  : 0.05),
          );
        this.onHit(source, target);
      }
    }
    if (burnStacks > 0 && !target.dead && !target.down) {
      target.burn = Math.min(3, (target.burn || 0) + burnStacks);
      target.burnTime = 3;
      target.burnOwner = source?.id;
    }
    if (target.dead || target.down) return actual;
    if (target.hp <= 0) {
      if (target.id === "boss") {
        this.finishRaid(true);
        return actual;
      }
      if (this.phase === "raid") {
        target.down = true;
        target.bleed = 30;
        target.input = {};
        this.event("notice", {
          text: `${target.name} is down — hold R nearby to revive`,
        });
      } else this.eliminate(source, target, elemental);
    }
    return actual;
  }
  onHit(p, t) {
    const e = p.loadout.element;
    if (e === "fire") {
      t.burn = Math.min(3, (t.burn || 0) + 1);
      t.burnTime = 3;
      t.burnOwner = p.id;
    }
    if (e === "water") t.soaked = 5;
    if (e === "earth") p.shield = Math.min(10, p.shield + 1);
    if (e === "air") {
      p.airStacks = Math.min(5, p.airStacks + 1);
      p.airTime = 4;
    }
    if (e === "electricity") {
      if (p.overcharge === 5) {
        p.overcharge = 0;
        const extra = this.enemies(p).filter(
          (x) => x !== t && dist(x, t) < 180,
        )[0];
        this.damage(p, extra || t, 6, { elemental: true, proc: true });
        this.event("beam", {
          x: t.x,
          y: t.y,
          tx: (extra || t).x,
          ty: (extra || t).y,
          color: "#e5c9ff",
        });
      } else p.overcharge++;
      p.chargeTime = 4;
    }
    if (p.loadout.weapon === "daggers" && p.hitCount % 4 === 0)
      p.daggerBuff = Math.min(5, p.daggerBuff + 3);
    if (p.loadout.weapon === "staff" && e === "earth" && p.hitCount % 3 === 0)
      p.shield = Math.min(10, p.shield + 8);
  }
  eliminate(p, t, elemental) {
    t.dead = true;
    t.respawn = this.phase === "ffa" && !this.sudden ? this.cfg.respawn : 0;
    t.charge = 0;
    if (p?.loadout && p !== t) {
      p.eliminations++;
      p.roundKills++;
      if (this.phase === "ffa")
        p.score[0] += this.sudden ? 1 : 1 + (elemental ? 2 : 0);
      if (this.phase === "duel" && p.roundKills === 2) p.score[1] += 2;
      if (p.loadout.trait === "adrenaline") p.adrenaline = 5;
      this.event("notice", {
        text: `${p.name} eliminated ${t.name}${elemental ? " · elemental" : ""}`,
      });
    }
  }
  melee(
    p,
    damage,
    range,
    { elemental = false, tip = false, knock = 0, proc = false, burnStacks = 0 } = {},
  ) {
    let hit = false;
    const weapon = p.loadout.weapon;
    const thrust = tip && !elemental;
    const halfAngle = elemental ? 1.05 : (W[weapon].halfAngle || 1.05);
    const halfWidth = W.spear.halfWidth;
    for (const t of this.enemies(p)) {
      const d = dist(p, t), radius = t.id === "boss" ? 32 : 14;
      const dx = t.x - p.x, dy = t.y - p.y;
      const along = dx * Math.cos(p.aim) + dy * Math.sin(p.aim);
      const across = Math.abs(-dx * Math.sin(p.aim) + dy * Math.cos(p.aim));
      // A thrust is a narrow capsule, not a long, wide sword sweep.
      const inThrust = along >= 0 && Math.hypot(
        along - clamp(along, 0, range), Math.max(0, across - halfWidth)
      ) < radius;
      const inArc = d < range + radius &&
        Math.abs(angleDiff(Math.atan2(dy, dx), p.aim)) < halfAngle;
      if (thrust ? inThrust : inArc) {
        hit = true;
        const tipper = thrust && along > range * 0.75;
        let a = damage + (tipper ? 6 : 0);
        if (
          p.loadout.weapon === "scythe" &&
          t.hp < t.maxHP * 0.5 &&
          Math.random() < 0.02
        )
          a = t.id === "boss" ? a + 50 : t.hp + (t.shield || 0);
        const shieldBefore = t.shield || 0;
        const dealt = this.damage(p, t, a, { elemental, proc, burnStacks });
        const landed = dealt > 0 || (t.shield || 0) < shieldBefore;
        if (tipper && landed) this.event("float", {
          x: t.x, y: t.y - 24, text: "TIPPER", color: "#ffe29b",
        });
        if (landed && (tipper || knock) && this.now - (t.knockAt ?? -10) > 1) {
          t.knockAt = this.now;
          if (t.id === "boss") t.stagger = 0.45;
          else {
            const k = knock || (damage === 20 ? 80 : 60);
            t.x = clamp(t.x + Math.cos(p.aim) * k, 30, 1170);
            t.y = clamp(t.y + Math.sin(p.aim) * k, 30, 730);
          }
        }
      }
    }
    this.event("swing", {
      owner: p.id, weapon, shape: thrust ? "thrust" : "arc",
      halfAngle, halfWidth, tipStart: thrust ? range * 0.75 : 0,
      elemental, duration: weapon === "daggers" ? 180 : 320,
      x: p.x,
      y: p.y,
      aim: p.aim,
      range,
      color: ELEMENT_COLORS[p.loadout.element],
    });
    return hit;
  }
  shoot(
    p,
    damage,
    {
      elemental = false,
      pierce = 0,
      speed = 650,
      kind = "arrow",
      perfect = false,
    } = {},
  ) {
    this.event("shot", {
      owner: p.id, weapon: p.loadout.weapon, x: p.x, y: p.y, aim: p.aim,
      color: ELEMENT_COLORS[p.loadout.element], duration: 240,
    });
    this.projectiles.push({
      id: randomUUID(),
      owner: p.id,
      x: p.x,
      y: p.y,
      vx: Math.cos(p.aim) * speed,
      vy: Math.sin(p.aim) * speed,
      damage,
      elemental,
      pierce,
      life: 1.2,
      hit: [],
      kind,
      perfect,
      color: ELEMENT_COLORS[p.loadout.element],
    });
  }
  attack(p, special = false) {
    const w = p.loadout.weapon,
      d = W[w];
    if (p.dead || p.down) return;
    if (special ? p.specialCD > 0 : p.attackCD > 0) return;
    if (p.input.guard && p.stance === "defense" && w === "sword") return;
    p.protection = 0;
    if (special) {
      p.specialCD = 8;
      if (w === "sword") {
        if (p.stance === "defense") {
          p.counter = 1;
          this.event("float", {
            x: p.x,
            y: p.y,
            text: "COUNTER",
            color: "#97ddeb",
          });
        } else {
          p.x = clamp(p.x + Math.cos(p.aim) * 95, 30, 1170);
          p.y = clamp(p.y + Math.sin(p.aim) * 95, 30, 730);
          this.melee(p, 20, 100);
        }
      }
      if (w === "daggers") {
        p.flurry = 4;
        p.flurryCD = 0;
      }
      if (w === "spear") this.melee(p, 20, 155, { tip: true, knock: 80 });
      if (w === "scythe") this.melee(p, 24, 130);
      if (w === "bow") {
        const perfect = p.charge >= 0.85 && p.charge <= 0.95;
        this.shoot(p, perfect ? 27 : 18, { pierce: 3, perfect });
        p.charge = 0;
        p.charging = false;
      }
      if (w === "staff") {
        p.specialCD = 0;
        this.element(p);
      }
      return;
    }
    const speed =
      (p.daggerBuff > 0 ? 1.3 : 1) *
      (p.adrenaline > 0 ? 1.2 : 1) *
      (1 + p.overcharge * 0.03);
    p.attackCD = 1 / (d.rate * speed);
    if (w === "bow") {
      const perfect = p.charge >= 0.85 && p.charge <= 0.95;
      this.shoot(
        p,
        (perfect ? 30 : p.charge >= 0.5 ? 20 : 10) * (1 + p.eagle * 0.05),
        { perfect },
      );
      p.charge = 0;
      p.charging = false;
    } else if (w === "staff") {
      const e = p.loadout.element;
      this.shoot(
        p,
        e === "earth" ? 11 : ["air", "electricity"].includes(e) ? 8 : 9,
        { elemental: true, pierce: e === "air" ? 1 : 0, kind: e, speed: 520 },
      );
    } else
      this.melee(
        p,
        w === "sword"
          ? p.stance === "defense"
            ? 8
            : 12 + (p.hitCount % 3 === 2 ? 6 : 0)
          : d.damage,
        d.range,
        { tip: w === "spear" },
      );
    if (w === "sword" && p.stance === "defense") p.attackCD = 1 / speed;
  }
  element(p) {
    if (p.elementCD > 0 || p.dead || p.down) return;
    p.protection = 0;
    const e = p.loadout.element;
    p.elementCD =
      (e === "earth" ? 14 : 12) * (p.loadout.weapon === "staff" ? 0.85 : 1);
    if (e === "air") {
      p.x = clamp(p.x + Math.cos(p.aim) * 160, 30, 1170);
      p.y = clamp(p.y + Math.sin(p.aim) * 160, 30, 730);
      p.protection = 0.25;
      p.dashBuff = 2;
      this.event("swing", {
        x: p.x,
        y: p.y,
        aim: p.aim,
        range: 80,
        color: ELEMENT_COLORS[e],
      });
    } else if (e === "earth") {
      p.shield = Math.min(10, p.shield + 5);
      this.barriers.push({
        owner: p.id,
        x: p.x + Math.cos(p.aim) * 48,
        y: p.y + Math.sin(p.aim) * 48,
        life: 2,
      });
    } else if (e === "electricity") {
      const pos = {
        x: clamp(p.x + Math.cos(p.aim) * 220, 20, 1180),
        y: clamp(p.y + Math.sin(p.aim) * 220, 20, 740),
      };
      this.event("burst", { ...pos, r: 100, color: ELEMENT_COLORS[e] });
      const targets = this.enemies(p).filter((t) => dist(t, pos) < 110);
      if (targets[0]) {
        this.damage(p, targets[0], 18, { elemental: true });
        const chain = this.enemies(p).find(
          (t) => t !== targets[0] && dist(t, targets[0]) < 200,
        );
        if (chain) this.damage(p, chain, 8, { elemental: true, proc: true });
        else if (targets[0].id === "boss")
          this.damage(p, targets[0], 6, { elemental: true, proc: true });
      }
    } else {
      this.melee(p, e === "fire" ? 12 : 10, 155, {
        elemental: true,
        knock: e === "water" ? 40 : 0,
        burnStacks: e === "fire" ? 1 : 0,
      });

    }
  }
  update(dt) {
    this.now += dt;
    this.events = this.events.filter((e) => this.now - e.t < 6);
    if (this.phase === "lobby" || this.phase === "results") return;
    this.time = Math.max(0, this.time - dt);
    if (this.phase === "select") {
      if (this.time <= 0) this.startSelected();
      return;
    }
    if (this.boss?.transform > 0 && this.phase === "raid") {
      this.boss.transform -= dt;
      this.time += dt;
      return;
    }
    for (const p of this.players) {
      for (const key of [
        "protection",
        "attackCD",
        "specialCD",
        "elementCD",
        "stanceCD",
        "reviveCD",
        "soaked",
        "airTime",
        "chargeTime",
        "daggerBuff",
        "adrenaline",
        "dashBuff",
        "counter",
      ])
        p[key] = Math.max(0, (p[key] || 0) - dt);
      if (!p.airTime) p.airStacks = 0;
      if (!p.chargeTime) p.overcharge = 0;
      if (p.dead) {
        if (p.respawn > 0) {
          p.respawn -= dt;
          if (p.respawn <= 0) {
            const used = p.lastUsed;
            this.reset(p);
            p.lastUsed = used;
          }
        }
        continue;
      }
      if (p.down) {
        p.bleed -= dt;
        if (p.bleed <= 0) {
          p.dead = true;
          p.down = false;
          p.input = {};
          continue;
        }
      } else if (this.phase === "raid") p.aliveTime += dt;
      const input =
        p.connected && this.now - (p.lastInput || 0) < 0.5 ? p.input : {};
      p.aim = input.aim ?? p.aim;
      let speed =
        this.cfg.speed *
        (p.down ? 0.25 : 1) *
        (p.soaked > 0 ? 0.85 : 1) *
        (1 + Math.min(0.25, p.airStacks * 0.03 + (p.dashBuff > 0 ? 0.2 : 0))) *
        (input.guard && p.stance === "defense" && p.loadout.weapon === "sword"
          ? 0.4
          : 1) *
        (p.charging ? 0.7 : 1);
      const len = Math.hypot(input.x || 0, input.y || 0) || 1;
      p.x = clamp(
        p.x + ((input.x || 0) / Math.max(1, len)) * speed * dt,
        28,
        1172,
      );
      p.y = clamp(
        p.y + ((input.y || 0) / Math.max(1, len)) * speed * dt,
        28,
        732,
      );
      if (p.down) continue;
      if (input.stance && p.stanceCD <= 0 && p.loadout.weapon === "sword") {
        p.stance = p.stance === "offense" ? "defense" : "offense";
        p.stanceCD = 1;
      }
      if (p.loadout.weapon === "bow") {
        if (input.attack) {
          p.charging = true;
          p.charge = Math.min(1.2, p.charge + dt);
        } else if (p.charging) this.attack(p);
      } else if (input.attack) this.attack(p);
      if (input.special) this.attack(p, true);
      if (input.element) this.element(p);
      if (p.flurry > 0) {
        p.flurryCD -= dt;
        if (p.flurryCD <= 0) {
          this.melee(p, 5, 80);
          p.flurry--;
          p.flurryCD = 0.12;
        }
      }
      if (this.phase === "raid") {
        const target =
          input.interact &&
          this.players.find((t) => t.down && !t.dead && dist(p, t) < 80);
        if (target && p.reviveCD <= 0 && this.now - p.lastHitAt > dt) {
          p.reviveProgress =
            p.reviveTarget === target.id ? p.reviveProgress + dt : dt;
          p.reviveTarget = target.id;
          if (p.reviveProgress >= 3) {
            target.down = false;
            target.hp = target.maxHP * 0.3;
            target.protection = 2;
            target.burn = 0;
            target.burnTime = 0;
            p.revives++;
            p.reviveCD = 30;
            p.reviveProgress = 0;
            this.event("notice", { text: `${p.name} revived ${target.name}` });
          }
        } else {
          p.reviveProgress = 0;
          p.reviveTarget = null;
        }
      }
      this.tickBurn(p, dt);
    }
    for (const b of this.barriers) b.life -= dt;
    this.barriers = this.barriers.filter((b) => b.life > 0);
    for (const s of this.projectiles) {
      s.life -= dt;
      const owner = this.players.find((p) => p.id === s.owner);
      if (!owner) {
        s.life = 0;
        continue;
      }
      const steps = Math.ceil((Math.hypot(s.vx, s.vy) * dt) / 12);
      for (let i = 0; i < steps && s.life > 0; i++) {
        s.x += (s.vx * dt) / steps;
        s.y += (s.vy * dt) / steps;
        if (s.x < 0 || s.x > 1200 || s.y < 0 || s.y > 760) {
          s.life = 0;
          break;
        }
        if (
          this.barriers.some(
            (b) =>
              b.owner !== owner.id &&
              this.enemies(owner).some((t) => t.id === b.owner) &&
              dist(b, s) < 46,
          )
        ) {
          s.life = 0;
          break;
        }
        for (const t of this.enemies(owner)) {
          if (s.hit.includes(t.id) || dist(t, s) > (t.id === "boss" ? 45 : 23))
            continue;
          s.hit.push(t.id);
          this.damage(owner, t, s.damage, { elemental: s.elemental });
          if (this.phase === "results") break;
          if (s.kind === "arrow") owner.eagle = Math.min(4, owner.eagle + 1);
          if (s.kind === "electricity") {
            const extra = this.enemies(owner).find(
              (x) => x !== t && dist(x, t) < 180,
            );
            if (extra)
              this.damage(owner, extra, 4, { elemental: true, proc: true });
          }
          if (s.hit.length > s.pierce) {
            s.life = 0;
            break;
          }
        }
      }
      if (this.phase === "results") break;
      if (s.life <= 0 && s.kind === "arrow" && !s.hit.length) owner.eagle = 0;
    }
    if (this.phase === "results") return;
    this.projectiles = this.projectiles.filter((s) => s.life > 0);
    if (this.phase === "raid") this.updateBoss(dt);
    if (this.sudden) {
      this.suddenAge += dt;
      const r = Math.max(0, 620 - this.suddenAge * 12);
      for (const p of this.players)
        if (
          !p.dead &&
          !p.down &&
          (dist(p, { x: 600, y: 380 }) > r || this.suddenAge > 55)
        )
          this.damage(null, p, 12 * dt, { dot: true });
    }
    if (this.phase === "ffa") {
      if (this.sudden) {
        const living = this.players.filter((p) => !p.dead && p.contender);
        if (living.length <= 1)
          this.finishFFA(
            living[0] ||
              this.players
                .filter((p) => p.contender)
                .sort((a, b) => b.roundDamage - a.roundDamage)[0],
          );
      } else if (this.time <= 0) {
        const top = Math.max(...this.players.map((p) => p.score[0])),
          leaders = this.players.filter((p) => p.score[0] === top);
        if (leaders.length === 1) this.finishFFA(leaders[0]);
        else {
          this.sudden = true;
          this.time = 9999;
          this.players.forEach((p) => {
            this.reset(p);
            p.contender = leaders.includes(p);
            p.dead = !p.contender;
          });
          this.event("stage", { text: "SUDDEN DEATH • TIED LEADERS" });
        }
      }
    } else if (this.phase === "duel") {
      const live = [0, 1].map((t) =>
        this.players.filter((p) => p.team === t && !p.dead),
      );
      if (!live[0].length || !live[1].length) {
        const winner =
          !live[0].length && !live[1].length
            ? this.duelDamageWinner()
            : live[0].length
              ? 0
              : 1;
        this.finishDuel(winner);
      } else if (this.time <= 0) {
        const hp = [0, 1].map((t) =>
          this.players
            .filter((p) => p.team === t && !p.dead)
            .reduce((n, p) => n + p.hp, 0),
        );
        if (Math.abs(hp[0] - hp[1]) > 0.01)
          this.finishDuel(hp[0] > hp[1] ? 0 : 1);
        else if (!this.sudden) {
          this.sudden = true;
          this.time = this.cfg.overtime;
          this.event("stage", { text: "OVERTIME • BREAK THE TIE" });
        } else this.finishDuel(this.duelDamageWinner());
      }
    } else if (
      this.phase === "raid" &&
      (this.time <= 0 || this.players.every((p) => p.down || p.dead))
    ) {
      if (this.attempt === 1 && this.time > 0) {
        this.players.forEach((p) => (p.oldLoadout = { ...p.loadout }));
        this.attempt = 2;
        this.select("raid");
      } else this.finishRaid(false);
    }
  }
  tickBurn(t, dt) {
    if (t.burnTime > 0 && t.hp > 0 && !t.down && !t.dead) {
      t.burnTime -= dt;
      t.burnTick = (t.burnTick || 0) + dt;
      if (t.burnTick >= 1) {
        t.burnTick -= 1;
        this.damage(
          this.players.find((p) => p.id === t.burnOwner),
          t,
          2 * t.burn,
          { elemental: true, dot: true },
        );
      }
      if (t.burnTime <= 0) t.burn = 0;
    }
  }
  duelDamageWinner() {
    const totals = [0, 1].map((team) =>
      this.players
        .filter((p) => p.team === team)
        .reduce((n, p) => n + p.roundDamage, 0),
    );
    return totals[0] === totals[1]
      ? randomInt(2)
      : totals[0] > totals[1]
        ? 0
        : 1;
  }
  finishFFA(p) {
    if (p) {
      p.score[0] += 3;
      p.stageWins++;
    }
    const shuffled = [...this.players].sort(() => Math.random() - 0.5);
    shuffled.forEach((x, i) => (x.team = i % 2));
    this.event("notice", { text: `${p?.name || "Nobody"} wins the FFA` });
    this.round = 0;
    this.select("duel");
  }
  finishDuel(team) {
    this.wins[team]++;
    this.event("notice", {
      text: `Team ${team === 0 ? "Jade" : "Violet"} wins round ${this.round}`,
    });
    if (this.wins[team] >= 3) {
      this.players
        .filter((p) => p.team === team)
        .forEach((p) => {
          p.score[1] += 3;
          p.stageWins++;
        });
      this.select("raid");
    } else this.select("duel");
  }
  updateBoss(dt) {
    const b = this.boss;
    if (!b || b.hp <= 0) return;
    this.tickBurn(b, dt);
    if (this.phase !== "raid") return;
    if (!b.azul && b.hp <= b.maxHP * 0.5) {
      b.azul = true;
      b.name = "Azul";
      b.transform = 2;
      b.attackCD = 2;
      this.zones = [];
      this.event("stage", { text: "SOLARA → AZUL" });
      return;
    }
    b.soaked = Math.max(0, b.soaked - dt);
    b.stagger = Math.max(0, b.stagger - dt);
    const targets = this.players.filter((p) => !p.dead && !p.down);
    if (!targets.length) return;
    const target = targets.reduce((a, p) => (dist(p, b) < dist(a, b) ? p : a));
    const d = dist(target, b);
    if (d > 100 && b.stagger <= 0) {
      const s = 65 * (b.soaked > 0 ? 0.925 : 1);
      b.x += ((target.x - b.x) / d) * s * dt;
      b.y += ((target.y - b.y) / d) * s * dt;
    }
    b.attackCD -= dt;
    if (b.attackCD <= 0) {
      b.attackCD = 2.8 / (b.azul ? 1.1 : 1);
      b.sequence = (b.sequence || 0) + 1;
      const n = b.sequence % 3;
      if (n === 0) {
        this.zones.push({
          kind: "burst",
          x: b.x,
          y: b.y,
          r: 190,
          delay: 1.1,
          damage: 28,
        });
      } else if (n === 1) {
        this.zones.push({
          kind: "poke",
          x: target.x,
          y: target.y,
          r: 68,
          delay: 0.75,
          damage: 15,
        });
      } else {
        this.zones.push({
          kind: "charge",
          x: b.x,
          y: b.y,
          tx: target.x,
          ty: target.y,
          r: 62,
          delay: 1.2,
          damage: 25,
        });
      }
    }
    for (const z of this.zones) {
      z.delay -= dt;
      if (z.delay <= 0) {
        for (const p of targets) {
          let hit = dist(p, z) < z.r;
          if (z.kind === "charge") {
            const dx = z.tx - z.x,
              dy = z.ty - z.y,
              l = dx * dx + dy * dy,
              u = clamp(((p.x - z.x) * dx + (p.y - z.y) * dy) / (l || 1), 0, 1);
            hit = Math.hypot(p.x - z.x - u * dx, p.y - z.y - u * dy) < z.r;
          }
          if (hit) {
            this.damage(b, p, z.damage * (b.azul ? 1.2 : 1), { burnStacks: 2 });
          }
        }
        if (z.kind === "charge") {
          b.x = z.tx;
          b.y = z.ty;
        }
        this.event("burst", {
          x: z.kind === "charge" ? z.tx : z.x,
          y: z.kind === "charge" ? z.ty : z.y,
          r: z.r,
          color: b.azul ? "#69bbff" : "#ff9b48",
        });
      }
    }
    this.zones = this.zones.filter((z) => z.delay > 0);
  }
  finishRaid(victory) {
    if (this.phase !== "raid") return;
    const metrics = ["damage", "revives", "aliveTime"];
    this.raidRanks = {};
    for (const m of metrics) {
      const points = rankPoints(this.players.map((p) => p[m]));
      this.raidRanks[m] = points;
      this.players.forEach((p, i) => (p.score[2] += points[i]));
    }
    if (victory)
      this.players.forEach((p) => {
        p.score[2] += 3;
        p.stageWins++;
      });
    this.victory = victory;
    this.phase = "results";
    this.time = 0;
    this.message = victory
      ? "Together you defeated Azul. Only one crown remains."
      : "The raid is over. Every contribution still counts.";
    this.projectiles = [];
    this.zones = [];
    this.event("stage", { text: victory ? "RAID COMPLETE" : "RAID ENDED" });
  }
  snapshot() {
    return {
      weaponProfiles: W,
      code: this.code,
      phase: this.phase,
      next: this.next,
      time: this.time,
      now: this.now,
      message: this.message,
      wins: this.wins,
      round: this.round,
      attempt: this.attempt,
      sudden: this.sudden,
      suddenAge: this.suddenAge,
      boss: this.phase === "raid" ? this.boss : null,
      players: this.players.map(({ input, lastInput, oldLoadout, ...p }) => p),
      projectiles: this.projectiles,
      zones: this.zones,
      barriers: this.barriers,
      events: this.events,
      raidRanks: this.raidRanks,
      victory: this.victory,
    };
  }
}
export const ELEMENT_COLORS = {
  fire: "#ff975e",
  water: "#67c8ff",
  earth: "#b8cf78",
  air: "#b6f1dc",
  electricity: "#d1a3ff",
};
