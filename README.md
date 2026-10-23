# Frenemies Arena — playable multiplayer prototype

Built October 21, 2026 for the Handshake Create a Multiplayer Game mission.
Submission deadline: October 31, 2026. Based on the supplied GDD and approved rules.

## Run

Install Node.js 22 or newer. Extract this folder, open a terminal in it, then:

```sh
npm ci
npm start
```

Open http://localhost:3000. Create a room, share its six-character code or room link,
and join from three more clients. All four must ready up. There are no AI stand-ins.
To test across separate devices on the same Wi-Fi, open
`http://YOUR_COMPUTERS_LAN_IP:3000` on each device. Permit the Node server through
your firewall only on your trusted private network. Remote players need deployment.
Do not open index.html directly; it needs the server.

## Deploy to Render

1. Put the contents of this folder in a GitHub repository (package.json at its root).
2. Create a Render **Web Service**, connect that repository, choose Node runtime.
3. Build command: `npm ci --omit=dev`. Start command: `npm start`.
4. Health check: `/health`. Render supplies PORT; the server listens on 0.0.0.0.
5. Run **one instance**. Rooms live in process memory; scaling to multiple instances
   needs shared room ownership/state, not just a Socket.IO adapter.
6. Open the HTTPS URL Render returns. All four players use that same URL.
7. Complete the four-device checklist in TESTING.md before submission.

`render.yaml` provides the equivalent service configuration. Review the hosting
plan/cost before creating a paid service. The configuration uses a free plan for
an initial trial; verify its current limits with Render. An idle/sleeping service
can delay first connection. Deploys, process restarts and shutdowns end active
matches. No account registration, payment integration or persistent player data
is required by this game.

Live game: https://frenemies-arena.onrender.com/ . Source: https://github.com/mnearn/FrenemiesArena . Four browser clients joined and started a live match on October 23, 2026; four physical-device testing remains outstanding.
before this assistant can provide a live playable URL. The internal preview URL
is not a public deployment and is not a submission link.

## Controls

| Action | Control |
|---|---|
| Move | WASD / arrow keys |
| Aim | Mouse |
| Basic attack | Hold left mouse |
| Bow charge / fire | Hold / release left mouse |
| Weapon special | Q |
| Element ability | E |
| Switch sword stance | Space |
| Guard in defensive stance | Hold Shift |
| Revive downed ally | Hold R within 80 units for 3 seconds |

Audio is opt-in. Touch buttons are experimental; this build targets keyboard and
mouse. Mobile aiming and touchscreen balance have not been validated.

## Match rules

- Exactly four players start. Duplicate loadouts are allowed. Name length is 18.
- One weapon, one element, one trait. Changes only in lobby/selection phases.
- 10-second loadout selection; all four ready starts sooner.
- FFA: 6 minutes; 5-second respawn; 2-second protection, ended by attacking.
  +1 elimination, +2 extra if the finishing source is an elemental ability,
  Staff projectile, Burn or chain lightning. An ordinary elemental weapon hit
  is still a normal hit for scoring. +3 to the stage winner.
- Tied FFA leaders alone reset to full health for sudden death; no respawns,
  +1 per elimination. The arena boundary shrinks to zero; after 55 seconds all
  survivors take hazard damage. Simultaneous last deaths use sudden-death
  damage, then stable player order as a deterministic fallback.
- 2v2: randomly assigned fixed teams; best of five, first to three wins.
  60-second rounds with 10-second loadout breaks. No respawns. Dead players
  spectate. Timeout compares combined living HP, ignoring shields. Equal HP
  gives 15-second overtime; another tie uses round damage, then random draw.
  Five rounds with all overtimes can take about seven minutes including breaks.
  +3 per player for the stage win; +2 for personally eliminating both opponents
  in a mini-round. No ordinary elimination points in this stage.
- Raid: 7 minutes; Solara transforms once at <=50% HP to Azul, **without healing**.
  Azul has +20% direct attack damage and +10% attack frequency. A 2-second
  transformation freezes combat and the timer. Boss has telegraphed Flame Poke,
  Flame Charge and Fire Burst; no minions or additional Azul moves.
- Downed players crawl at 25% speed, cannot attack and bleed out in 30 seconds.
  A nearby living ally holds R for 3 seconds; damage to the reviver interrupts.
  Successful revival returns 30% HP with 2-second protection and clears Burn.
  The reviver then has a 30-second revive cooldown. Fully bled-out players wait.
- A full team wipe before timeout grants one retry; timeout does not. Every
  player changes at least one loadout choice. If unchanged at selection end,
  the server cycles that player's element and announces it. Retry resets
  contribution metrics, boss HP and the seven-minute timer.
- Raid damage, successful revives and living/not-downed time each award 4/3/2/1
  by competition rank: tied first gets 4/4, then 2/1. An all-zero category gives
  each player 1. Victory adds +3 to everyone; failure still awards contribution.
- Champion: cumulative total, then stage wins, total player eliminations, boss
  damage, then co-champions for an exact tie. Raid victory counts as a stage win
  for everyone, so it cannot distinguish their tiebreaks.

## Implemented loadouts

All six weapons, five elements and four traits from the GDD are represented.
The elemental shield cap is 10 across all weapons. Burn does not trigger
passives or lifesteal. Damage over shields does not heal Vampirism. Last Stand
resets per main stage/2v2 mini-round/raid attempt, not per FFA respawn.

Additional balance choices where the GDD left values unspecified:

- 100 player HP, 4,200 boss HP, 210 movement units/second; 1 unit of GDD spear
  knockback is represented by 40 canvas units.
- Weapon specials have an 8-second cooldown. Scythe gets Reaping Sweep, 24
  damage in a 130-unit frontal arc. Staff Q aliases its elemental ability,
  sharing E's cooldown. Sword Shield Counter reduces the next direct hit by
  50% during a 1-second window and returns 14 damage to player attackers.
- Bow full charge is 1 second; Perfect Draw is 0.85–0.95 seconds. Staff fires
  1.5 times/second. Sword third-hit bonus tracks successful hits.
- Water Wave knocks back 40 units. Earth barrier is a 2-second projectile
  blocking region in front of the caster. Air dash moves 160 units and gives
  0.25 seconds invulnerability. Thunderstrike is centered 220 units ahead.
- Spears stagger the boss briefly instead of moving it. Raid Burn ticks retain
  fixed 2 HP/stack/second damage; Azul's multiplier affects direct attacks.

Optional Perfect Switch, elaborate animation, music, advanced arena obstacles,
mobile-first controls, matchmaking and persistent leaderboards are not included.
The art is original code-drawn pixel-style placeholder art; sound uses Web Audio.
Fonts load from Google Fonts with local fallback fonts.

## Architecture and source

- `server.js`: Express + Socket.IO rooms, input limits, reconnect sessions,
  30 Hz authoritative simulation and 15 Hz shared state snapshots.
- `game.js`: server-only combat and stage rules, centralized CONFIG balance.
- `public/client.js`: Canvas renderer, interpolation, audio, UI and input.
- `public/style.css`, `public/index.html`: responsive shell and field guide.
- `test/game.test.js`: mechanics and scoring regression tests.
- `test/multiplayer.test.js`: real four-client Socket.IO integration test.

The first prototype uses JavaScript ES modules rather than the proposed
TypeScript compiler setup. It is a no-build Node application; the authoritative
server validates loadout and input boundaries. A typed protocol migration can
be added without changing the network model.

Clients send intentions, not HP, damage, positions or score. Inputs expire after
0.5 seconds without updates. Reconnect tokens are random and stored per browser
tab. They restore the original player while the room exists. A room with all
players disconnected is deleted after five minutes. Disconnected players remain
vulnerable in an active match. Lobby slots are reserved while the room exists;
if someone leaves permanently, create a new room before starting.

## Validation

Run `npm test`. Automated tests use actual WebSocket clients against an ephemeral
HTTP server. They are not a substitute for separate physical-device testing.
See TESTING.md for evidence and outstanding submission checks.
