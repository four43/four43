# Tractor Pickup

A 3D tractor game (three.js + Rapier) for small children, published at four43.com/exp/tractor-pickup. `docs/tractor-pickup-spec.md` is the design.

## Test

```bash
npm install
npm test           # node --test test/
```

## Build

```bash
npm run build      # writes site/exp/tractor-pickup/ (do not commit it; deploys go through gh-pages)
npm run bake       # after editing a model in assets/models/
```

## Run multiplayer locally

Multiplayer needs a Handshake signaling server (a separate repo; production is `https://handshake.four43.com`). To run one
locally, check out Handshake's `phase-1` branch, for example next to this repo:

```bash
cd ~/projects/four43/handshake-phase-1   # the Handshake repo, phase-1 branch
docker build -t handshake:phase1 .
cat > /tmp/hs-local.toml <<'TOML'
allow_localhost = true
[turn]
urls = []
[apps.tractor-pickup]
origins = ["http://localhost:8767"]
max_players = 4
max_rooms = 20
public_rooms = true
list = "none"
turn = false
TOML
chmod 644 /tmp/hs-local.toml       # the container runs as nonroot and must be able to read it
docker run --rm -d --name hs-local -p 8080:8080 \
  -e SESSION_SECRET=$(openssl rand -hex 32) -e TURN_SECRET=x \
  -v /tmp/hs-local.toml:/etc/handshake/config.toml:ro handshake:phase1
curl -s localhost:8080/healthz     # ok
```

Then, back in `games/tractor-pickup`, build and serve the game:

```bash
npm run build
cd ../../site/exp/tractor-pickup && python3 -m http.server 8767
```

Open `http://localhost:8767/?signal=http://localhost:8080&seed=7` in two windows (use a private window for the second so the two keep separate saved state):

- Window A: hold the gear 2 s → Multiplayer → Host.
- Window B: Multiplayer → Join → type the code → Join.
- Add `&lag=300,80,5` (delay ms, jitter ms, loss %) to a window's URL to simulate a slow network.

Stop with `docker stop hs-local` and Ctrl+C on the `http.server`.

`?signal=` accepts only `localhost`/`127.0.0.1` or the page's own origin, so a link cannot send players to another server. A
device on the LAN (an iPad) cannot use the local server this way: on that device `localhost` is the device itself. Serve the game
and Handshake (`/session`, `/turn`, `/ws`) from one origin behind a reverse proxy, or test against `https://handshake.four43.com`.
