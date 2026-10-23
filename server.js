import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Game } from "./game.js";
export function createArena({ config = {} } = {}) {
  const app = express(),
    http = createServer(app),
    io = new Server(http, {
      maxHttpBufferSize: 4096,
      connectionStateRecovery: {
        maxDisconnectionDuration: 30000,
        skipMiddlewares: false,
      },
    }),
    rooms = new Map(),
    sessions = new Map();
  app.disable("x-powered-by");
  app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));
  app.get("/health", (_q, r) => r.json({ ok: true, rooms: rooms.size }));
  io.on("connection", (socket) => {
    let current = null,
      player = null;
    let requests = 0,
      last = Date.now();
    const limited = () => {
      if (Date.now() - last > 1000) {
        last = Date.now();
        requests = 0;
      }
      return ++requests > 80;
    };
    socket.on("enter", (data = {}, reply = () => {}) => {
      try {
        if (limited()) return;
        if (current) throw Error("Already in a room.");
        if (typeof data !== "object" || !data)
          throw Error("Invalid room request.");
        let token = typeof data.token === "string" ? data.token : "";
        const session = sessions.get(token);
        if (session && rooms.has(session.code)) {
          current = rooms.get(session.code);
          player = current.players.find((p) => p.id === session.id);
          if (player) {
            if (player.connected)
              throw Error("This player is already connected in another tab.");
            player.connected = true;
          }
        }
        if (!player) {
          if (data.create) {
            if (rooms.size >= 100)
              throw Error("Server is full. Try again shortly.");
            let code;
            do {
              code = randomBytes(3).toString("hex").toUpperCase();
            } while (rooms.has(code));
            current = new Game(code, config);
            rooms.set(code, current);
          } else {
            current = rooms.get(
              String(data.code || "")
                .trim()
                .toUpperCase(),
            );
            if (!current)
              throw Error("Room not found. Check the six-character code.");
          }
          player = current.add(data.name);
          token = randomBytes(24).toString("hex");
          sessions.set(token, { code: current.code, id: player.id });
        }
        socket.join(current.code);
        socket.data.playerId = player.id;
        reply({ ok: true, id: player.id, token, code: current.code });
        io.to(current.code).emit("state", current.snapshot());
      } catch (e) {
        current = null;
        player = null;
        reply({ ok: false, error: e.message });
      }
    });
    socket.on("input", (data) => {
      if (current && player && !limited()) current.input(player, data);
    });
    socket.on("loadout", (data) => {
      if (current && player && !limited()) current.loadout(player, data);
    });
    socket.on("ready", () => {
      if (current && player && !limited()) current.ready(player);
    });
    socket.on("disconnect", () => {
      if (player) {
        player.connected = false;
        player.disconnectedAt = Date.now();
        player.input = {};
        player.ready = false;
      }
    });
  });
  let previous = performance.now(),
    broadcast = 0;
  const timer = setInterval(() => {
    const now = performance.now(),
      dt = Math.min(0.1, (now - previous) / 1000);
    previous = now;
    broadcast++;
    for (const [code, g] of rooms) {
      g.update(dt);
      if (broadcast % 2 === 0) io.to(code).emit("state", g.snapshot());
      if (
        g.players.every((p) => !p.connected) &&
        g.players.every(
          (p) => Date.now() - (p.disconnectedAt || g.created) > 300000,
        )
      ) {
        rooms.delete(code);
        for (const [token, s] of sessions)
          if (s.code === code) sessions.delete(token);
      }
    }
  }, 1000 / 30);
  return {
    app,
    http,
    io,
    rooms,
    close: async () => {
      clearInterval(timer);
      await new Promise((r) => io.close(r));
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { http } = createArena();
  http.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
    console.log(`Frenemies Arena listening on ${process.env.PORT || 3000}`),
  );
}
