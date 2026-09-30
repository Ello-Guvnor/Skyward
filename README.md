# Skyward flight simulator

Browser flight sim built with Three.js (bundled in `vendor/`, no install needed).

## Play
From this folder run:

    python3 -m http.server 8080

then open http://localhost:8080 in Chrome/Edge/Firefox. (Opening index.html directly won't work; ES modules need a local server.)

## Files
- `index.html` / `style.css`: title screen, HUD, controls overlay
- `main.js`: world (island, airport, carrier, camps), flight physics, combat, HUD logic
- `planes.js`: the five aircraft (models + performance numbers)

To keep modifying it with Devin: put this folder in a GitHub repo, give the Devin GitHub App access, and start a session pointing at it.
