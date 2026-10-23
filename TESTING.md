# Verification — October 21, 2026

## Completed

15 automated tests passed (Node built-in test runner):

1. Raid shared ranking and all-zero categories.
2. All 120 weapon/element/trait combinations and selection-only changes.
3. Shield absorption and lifesteal from actual HP damage.
4. Burn kill scoring, respawn and Last Stand persistence.
5. Fatal Burn, Last Stand invulnerability and reset.
6. Earth shield cap, six-hit Overcharge and Berserker threshold.
7. FFA leader-only sudden death and transition to 2v2.
8. Shield-excluded 2v2 timeout and stage victory scoring.
9. 2v2 double kill and enemy filtering.
10. Azul transformation without healing.
11. Downing, revival and damage interruption.
12. One retry, required loadout change and contribution reset.
13. Raid victory scoring exactly once.
14. Chain-lightning elimination counted exactly once.
15. Four actual Socket.IO clients: shared room, fifth-player rejection,
    ready-up, synchronized movement and damage, scoring, reconnect with original
    identity, transitions through 2v2 and raid, and identical final scores.

The integration test uses four separate network connections on one execution
host. It arranges combat positions and advances stage outcomes in the test
server to make assertions deterministic. It does not represent a human-played,
full-duration match or a four-physical-device session.

Browser inspection: landing page and server-connected status observed; room
creation, Spear/Water selection, and READY status verified; lobby layout inspected. This does not
verify every browser interaction or all mobile layouts.

Bug found and fixed: a killing chain-lightning proc could count the original
attack's elimination a second time. A regression test now covers it.

## Outstanding before submission

- Deploy to a connected Node-compatible host; record the real HTTPS URL.
- Four physical devices join that URL, ideally on at least two networks.
- Play a complete match with normal timers and different loadouts.
- Check aim/movement feel, latency, full raid balance and skill readability.
- Disconnect/reconnect one device; confirm identity, HP and score persist.
- Confirm round change, spectating, revive interruption and half-HP transform
  are visible consistently on every device.
- Confirm no console errors on target desktop browsers.
- Record playtest feedback, final deployed commit and any submission media.

No live public URL or four-device verification is claimed by this package.
