import test from "node:test";
import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { createArena } from "../server.js";
const until = (fn, ms = 3000) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (fn()) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > ms) {
        clearInterval(t);
        reject(Error("Timed out waiting for synchronized state"));
      }
    }, 15);
  });
test("four real Socket.IO clients share room, movement, damage, scoring, stage changes and reconnect", async (t) => {
  const server = createArena();
  await new Promise((r) => server.http.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.http.address().port}`,
    clients = [];
  t.after(async () => {
    clients.forEach((c) => c.socket.disconnect());
    await server.close();
  });
  async function client(data) {
    const socket = connect(url, { transports: ["websocket"], forceNew: true });
    const c = { socket, state: null };
    clients.push(c);
    socket.on("state", (s) => (c.state = s));
    await new Promise((r) => socket.on("connect", r));
    const result = await socket.emitWithAck("enter", data);
    return Object.assign(c, result);
  }
  const a = await client({ create: true, name: "One" }),
    b = await client({ code: a.code, name: "Two" }),
    c = await client({ code: a.code, name: "Three" }),
    d = await client({ code: a.code, name: "Four" });
  assert.equal(
    [a, b, c, d].every((c) => c.ok),
    true,
  );
  await until(() => [a, b, c, d].every((c) => c.state?.players.length === 4));
  const fifth = await client({ code: a.code, name: "Fifth" });
  assert.equal(fifth.ok, false);
  [a, b, c, d].forEach((c) => c.socket.emit("ready"));
  await until(() => [a, b, c, d].every((c) => c.state?.phase === "select"));
  [a, b, c, d].forEach((c) => c.socket.emit("ready"));
  await until(() => [a, b, c, d].every((c) => c.state?.phase === "ffa"));
  const before = a.state.players.find((p) => p.id === a.id).x;
  const sender = setInterval(
    () => a.socket.emit("input", { x: 1, y: 0, aim: 0 }),
    30,
  );
  await until(() =>
    [a, b, c, d].every(
      (c) => c.state.players.find((p) => p.id === a.id).x > before + 40,
    ),
  );
  clearInterval(sender);
  a.socket.emit("input", { x: 0, y: 0 });
  // Arrange combat positions on the authoritative test server; clients still issue only normal input.
  const game = server.rooms.get(a.code),
    pa = game.players.find((p) => p.id === a.id),
    pb = game.players.find((p) => p.id === b.id);
  Object.assign(pa, { x: 300, y: 300, protection: 0 });
  Object.assign(pb, { x: 355, y: 300, hp: 5, protection: 0 });
  pa.loadout = { weapon: "sword", element: "earth", trait: "vampirism" };
  a.socket.emit("input", { attack: true, aim: 0 });
  await until(() =>
    [a, b, c, d].every((c) => c.state.players.find((p) => p.id === b.id).dead),
  );
  assert.equal(a.state.players.find((p) => p.id === a.id).score[0], 1);
  const savedToken = d.token,
    savedId = d.id;
  d.socket.disconnect();
  await until(() => !a.state.players.find((p) => p.id === savedId).connected);
  const returning = await client({ token: savedToken });
  assert.equal(returning.id, savedId);
  await until(() => a.state.players.find((p) => p.id === savedId).connected);
  assert.equal(game.players.length, 4);
  game.time = 0;
  await until(() =>
    [a, b, c, returning].every(
      (c) => c.state.phase === "select" && c.state.next === "duel",
    ),
  );
  const scores = game.players.map((p) => p.score[0]);
  assert.equal(
    new Set(
      [a, b, c, returning].map((c) =>
        JSON.stringify(c.state.players.map((p) => p.score[0])),
      ),
    ).size,
    1,
  );
  assert.equal(
    scores.reduce((a, b) => a + b, 0),
    4,
  );
  game.startSelected();
  game.finishDuel(0);
  game.startSelected();
  game.finishDuel(0);
  game.startSelected();
  game.finishDuel(0);
  game.startSelected();
  await until(() =>
    [a, b, c, returning].every((c) => c.state.phase === "raid"),
  );
  game.boss.hp = game.boss.maxHP * 0.49;
  await until(() => [a, b, c, returning].every((c) => c.state.boss.azul));
  game.finishRaid(true);
  await until(() =>
    [a, b, c, returning].every((c) => c.state.phase === "results"),
  );
  assert.equal(
    new Set(
      [a, b, c, returning].map((c) =>
        JSON.stringify(c.state.players.map((p) => p.score)),
      ),
    ).size,
    1,
  );
});
