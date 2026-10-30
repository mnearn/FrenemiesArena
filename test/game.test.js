import test from "node:test";
import assert from "node:assert/strict";
import { Game, rankPoints, WEAPONS, ELEMENTS, TRAITS } from "../game.js";
function arena() {
  const g = new Game("ABC123");
  for (let i = 0; i < 4; i++) g.add("Player " + i);
  g.next = "ffa";
  g.startSelected();
  g.players.forEach((p) => {
    p.protection = 0;
    p.loadout.element = "earth";
  });
  return g;
}
test("raid shared ranks skip places and zero categories get 1", () => {
  assert.deepEqual(rankPoints([100, 100, 40, 0]), [4, 4, 2, 1]);
  assert.deepEqual(rankPoints([0, 0, 0, 0]), [1, 1, 1, 1]);
  assert.deepEqual(rankPoints([2, 1, 1, 0]), [4, 3, 3, 1]);
});
test("all loadout combinations are accepted only during selection", () => {
  const g = new Game("A"),
    p = g.add("A");
  for (const weapon of WEAPONS)
    for (const element of ELEMENTS)
      for (const trait of TRAITS)
        assert.equal(g.loadout(p, { weapon, element, trait }), true);
  assert.equal(
    g.loadout(p, { weapon: "hacked", element: "fire", trait: "vampirism" }),
    false,
  );
  g.next = "ffa";
  g.startSelected();
  assert.equal(
    g.loadout(p, { weapon: "bow", element: "water", trait: "vampirism" }),
    false,
  );
});
test("shield absorbs damage; vampirism only heals actual direct HP damage", () => {
  const g = arena(),
    [a, b] = g.players;
  a.hp = 50;
  b.shield = 10;
  g.damage(a, b, 20);
  assert.equal(b.hp, 90);
  assert.equal(a.hp, 50.7);
  g.damage(a, b, 10, { dot: true });
  assert.equal(a.hp, 50.7);
});
test("burn kills award base + elemental bonus; respawn retains Last Stand use", () => {
  const g = arena(),
    [a, b] = g.players;
  b.hp = 2;
  b.burn = 1;
  b.burnTime = 3;
  b.burnOwner = a.id;
  g.tickBurn(b, 1);
  assert.equal(b.dead, true);
  assert.equal(a.score[0], 3);
  b.lastUsed = true;
  g.update(5.1);
  assert.equal(b.dead, false);
  assert.equal(b.lastUsed, true);
  assert.equal(b.protection, 2);
});
test("Last Stand survives fatal Burn once and next round resets", () => {
  const g = arena(),
    [a, b] = g.players;
  b.loadout.trait = "laststand";
  b.hp = 2;
  g.damage(a, b, 4, { dot: true });
  assert.equal(b.hp, 1);
  assert.equal(b.lastUsed, true);
  g.damage(a, b, 100);
  assert.equal(b.hp, 1);
  b.protection = 0;
  g.damage(a, b, 4, { dot: true });
  assert.equal(b.dead, true);
  g.reset(b);
  assert.equal(b.lastUsed, false);
});
test("Earth shield cap, six-hit Overcharge, and Berserker threshold", () => {
  const g = arena(),
    [a, b] = g.players;
  for (let i = 0; i < 15; i++) g.onHit(a, b);
  assert.equal(a.shield, 10);
  a.loadout.element = "electricity";
  for (let i = 0; i < 5; i++) g.onHit(a, b);
  assert.equal(a.overcharge, 5);
  g.onHit(a, b);
  assert.equal(a.overcharge, 0);
  a.loadout.element = "earth";
  a.loadout.trait = "berserker";
  a.hp = 25;
  b.hp = 100;
  g.damage(a, b, 10);
  assert.equal(b.hp, 90);
  a.hp = 24;
  g.damage(a, b, 10);
  assert.equal(b.hp, 77.5);
});
test("FFA tied leaders alone enter sudden death then fixed teams enter 2v2", () => {
  const g = arena();
  g.players[0].score[0] = 3;
  g.players[1].score[0] = 3;
  g.time = 0;
  g.update(0.01);
  assert.equal(g.sudden, true);
  assert.equal(g.players.filter((p) => !p.dead).length, 2);
  const [a, b] = g.players;
  b.protection = 0;
  g.damage(a, b, 1000);
  g.update(0.01);
  assert.equal(g.phase, "select");
  assert.equal(g.next, "duel");
  assert.equal(a.score[0], 7);
  assert.equal(g.players.filter((p) => p.team === 0).length, 2);
});
test("2v2 excludes shield from timeout HP, team first to three gets +3 each", () => {
  const g = arena();
  g.players.forEach((p, i) => (p.team = i % 2));
  g.next = "duel";
  g.startSelected();
  g.players[0].hp = 90;
  g.players[0].shield = 10;
  g.players[2].hp = 90;
  g.time = 0;
  g.update(0.01);
  assert.equal(g.wins[1], 1);
  g.startSelected();
  g.finishDuel(1);
  g.startSelected();
  g.finishDuel(1);
  assert.equal(g.next, "raid");
  assert.equal(g.players[1].score[1], 3);
  assert.equal(g.players[3].score[1], 3);
});
test("double kill awards +2 only once and teammate cannot be attacked", () => {
  const g = arena();
  g.players.forEach((p, i) => (p.team = i % 2));
  g.next = "duel";
  g.startSelected();
  g.players.forEach((p) => (p.protection = 0));
  const a = g.players[0];
  assert.equal(g.enemies(a).length, 2);
  g.damage(a, g.players[1], 1000);
  g.damage(a, g.players[3], 1000);
  assert.equal(a.score[1], 2);
});
test("Azul transformation keeps half HP and boosts phase only once", () => {
  const g = arena();
  g.next = "raid";
  g.startSelected();
  g.boss.hp = 2000;
  g.updateBoss(0.1);
  assert.equal(g.boss.name, "Azul");
  assert.equal(g.boss.hp, 2000);
  assert.equal(g.boss.transform, 2);
  g.update(2.1);
  g.updateBoss(0.1);
  assert.equal(g.boss.hp, 2000);
});
test("downing, successful revive, and damage interrupt", () => {
  const g = arena();
  g.next = "raid";
  g.startSelected();
  const [a, b] = g.players;
  a.protection = b.protection = 0;
  a.x = b.x = 200;
  a.y = b.y = 600;
  g.damage(g.boss, b, 1000);
  assert.equal(b.down, true);
  for (let i = 0; i < 65; i++) {
    g.input(a, { interact: true });
    g.update(0.05);
  }
  assert.equal(b.down, false);
  assert.equal(b.hp, 30);
  assert.equal(a.revives, 1);
  assert.ok(a.reviveCD > 29);
  g.damage(g.boss, a, 1);
  assert.equal(a.reviveProgress, 0);
});
test("team wipe allows one retry, forces loadout change, and resets contribution", () => {
  const g = arena();
  g.next = "raid";
  g.startSelected();
  g.players.forEach((p) => {
    p.down = true;
    p.damage = 50;
  });
  g.update(0.1);
  assert.equal(g.phase, "select");
  assert.equal(g.attempt, 2);
  const old = g.players[0].loadout.element;
  g.startSelected();
  assert.notEqual(g.players[0].loadout.element, old);
  assert.equal(g.players[0].damage, 0);
  g.players.forEach((p) => (p.down = true));
  g.update(0.1);
  assert.equal(g.phase, "results");
  assert.equal(g.victory, false);
});
test("raid victory awards contribution plus bonus exactly once", () => {
  const g = arena();
  g.next = "raid";
  g.startSelected();
  g.players.forEach((p, i) => {
    p.damage = 400 - i * 100;
    p.aliveTime = 10;
    p.revives = 0;
  });
  g.finishRaid(true);
  assert.deepEqual(
    g.players.map((p) => p.score[2]),
    [12, 11, 10, 9],
  );
  g.finishRaid(true);
  assert.equal(g.players[0].score[2], 12);
});
test("chain finishing damage does not double count elimination", () => {
  const g = arena(),
    [a, b] = g.players;
  a.loadout.element = "electricity";
  a.overcharge = 5;
  b.hp = 8;
  g.damage(a, b, 5);
  assert.equal(a.eliminations, 1);
  assert.equal(a.score[0], 3);
});


test("FFA spectator flags do not exclude opponents from later 2v2 overtime", () => {
  const g = arena();
  g.players[1].contender = false;
  g.players.forEach((p, i) => p.team = i % 2);
  g.next = "duel";
  g.startSelected();
  g.sudden = true;
  assert.equal(g.enemies(g.players[0]).length, 2);
});

test("Flame Burst applies two Burn stacks to the raid boss", () => {
  const g = arena();
  g.next = "raid";
  g.startSelected();
  const a = g.players[0];
  a.loadout.element = "fire";
  a.x = g.boss.x - 100; a.y = g.boss.y; a.aim = 0;
  g.element(a);
  assert.equal(g.boss.burn, 2);
  assert.equal(g.boss.hp, g.boss.maxHP - 12);
});

test("dodged Flame Burst and boss hits do not apply Burn", (t) => {
  const g = arena(), [a,b] = g.players;
  a.loadout.element = "fire"; b.loadout.element = "air";
  a.x = 300; a.y = 300; a.aim = 0; b.x = 350; b.y = 300;
  t.mock.method(Math, "random", () => 0);
  g.element(a);
  assert.equal(b.hp,100); assert.equal(b.burn,0);
  g.damage({id:"boss"}, b, 15, {burnStacks:2});
  assert.equal(b.hp,100); assert.equal(b.burn,0);
});

test("round reset clears unfinished flurry and counter", () => {
  const g = arena(), a = g.players[0];
  a.flurry = 3; a.counter = 1; a.contender = false;
  g.reset(a);
  assert.equal(a.flurry,0); assert.equal(a.counter,0); assert.equal(a.contender,true);
});

test('spear rewards its tip but misses a sidestep and targets beyond its reach', () => {
  const g = arena(), [a,b,c,d] = g.players;
  a.loadout.weapon = 'spear'; a.aim = 0;
  Object.assign(a,{x:300,y:300});
  Object.assign(b,{x:410,y:300});
  Object.assign(c,{x:400,y:345});
  Object.assign(d,{x:445,y:300});
  g.attack(a);
  assert.equal(b.hp,83, 'tip hit still deals 17');
  assert.equal(b.x,470, 'tip knockback remains');
  assert.equal(c.hp,100, 'sidestepping the narrow thrust avoids damage');
  assert.equal(d.hp,100, 'old long range no longer hits');
  const swing = g.events.findLast(e=>e.type==='swing');
  assert.equal(swing.owner,a.id);
  assert.equal(swing.shape,'thrust');
  assert.equal(swing.range,125);
});
test('spear inner hit deals 11 and cannot hit behind the wielder', () => {
  const g=arena(), [a,b,c] = g.players;
  a.loadout.weapon='spear'; a.aim=0;
  Object.assign(a,{x:300,y:300}); Object.assign(b,{x:370,y:300});
  Object.assign(c,{x:280,y:300}); g.attack(a);
  assert.equal(b.hp,89); assert.equal(b.x,370); assert.equal(c.hp,100);
});
test('spear special has bounded reach and protection prevents knockback', () => {
  const g=arena(), [a,b,c,d]=g.players;
  a.loadout.weapon='spear';a.aim=0;
  Object.assign(a,{x:300,y:300});Object.assign(b,{x:445,y:300});
  Object.assign(c,{x:475,y:300});Object.assign(d,{x:435,y:300,protection:2});
  g.attack(a,true);
  assert.equal(b.hp,74);assert.equal(c.hp,100);assert.equal(d.hp,100);
  assert.equal(d.x,435);
  assert.equal(g.events.findLast(e=>e.type==='swing').range,155);
});
test('melee weapons have different arcs; elemental attacks retain their own cone', () => {
  for(const [weapon, expectedHit] of [['daggers',false],['sword',true],['scythe',true]]) {
    const g=arena(),[a,b]=g.players;
    Object.assign(a,{x:300,y:300,aim:0});a.loadout.weapon=weapon;
    Object.assign(b,{x:300+50*Math.cos(0.95),y:300+50*Math.sin(0.95)});
    g.attack(a);assert.equal(b.hp<100,expectedHit,weapon);
  }
  const g=arena(),[a,b]=g.players;
  Object.assign(a,{x:300,y:300,aim:0});a.loadout.weapon='spear';a.loadout.element='fire';
  Object.assign(b,{x:380,y:350});g.element(a);
  assert.equal(b.hp,88);assert.equal(b.burn,2);
  assert.equal(g.events.findLast(e=>e.type==='swing').shape,'arc');
});
test('ranged attacks broadcast shooter animation metadata without changing projectile damage', () => {
  const g=arena(),[a]=g.players;
  a.loadout.weapon='bow';a.charge=0.9;g.attack(a);
  const shot=g.events.findLast(e=>e.type==='shot');
  assert.equal(shot.owner,a.id);assert.equal(shot.weapon,'bow');
  assert.equal(g.projectiles[0].damage,30);
  assert.equal(g.snapshot().weaponProfiles.spear.range,125);
});


test("raid bleedout stops movement immediately", () => {
  const g = arena();
  g.next = "raid";
  g.startSelected();
  const p = g.players[0];
  p.down = true;
  p.bleed = 0.01;
  p.input = { x: 1, y: 0 };
  p.lastInput = g.now;
  const x = p.x;
  g.update(0.05);
  assert.equal(p.dead, true);
  assert.equal(p.x, x);
  assert.deepEqual(p.input, {});
});

test("raid victory halts subsequent combat simulation", () => {
  const g = arena();
  g.next = "raid";
  g.startSelected();
  const [a, b] = g.players;
  a.protection = b.protection = 0;
  g.boss.azul = true;
  g.boss.hp = 1;
  g.boss.x = 400;
  g.boss.y = 300;
  a.x = 350;
  a.y = 300;
  b.x = 450;
  b.y = 300;
  b.hp = 50;
  g.projectiles = [
    { id: "finish", owner: a.id, x: 380, y: 300, vx: 650, vy: 0, damage: 10, elemental: false, pierce: 0, life: 1, hit: [], kind: "arrow" },
    { id: "late", owner: b.id, x: 430, y: 300, vx: -650, vy: 0, damage: 50, elemental: false, pierce: 0, life: 1, hit: [], kind: "arrow" },
  ];
  g.update(0.05);
  assert.equal(g.phase, "results");
  assert.equal(b.hp, 50);
});
