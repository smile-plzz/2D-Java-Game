# 2D Java Game Framework

A collection of classes used for 2d game programming in Java. Much of the dirty work is taken care which makes this useful for beginner game programmers.

## Play it in the browser

`web/` holds a small arcade of six games, plus a browser port of this framework's
core that they are all written against. It is a static site — no build step, no
dependencies, no server code.

| Game | Modes |
| --- | --- |
| **Vector Arena** — wave survival shooter | Survival · Time Attack · Zen |
| **Neon Snake** — grid arcade | Classic · Wrap · Maze |
| **Brick Breaker** — paddle arcade | Classic · Blitz · Endless |
| **Neon Pong** — head to head | Classic · Blitz · Multiball |
| **Neon 2048** — sliding puzzle | Compact 3×3 · Classic 4×4 · Grand 5×5 |
| **Connect Four** — minimax AI | Casual · Standard · Expert |

Each mode keeps its own high score. A mode is one entry in that game's
`MODE_INFO` table — the tuning it changes and the menu copy describing it live
side by side, so adding another is a single object rather than a branch through
the update loop.

Run it locally with any static file server:

```sh
cd web
python3 -m http.server 8000   # then open http://localhost:8000
```

A plain `file://` open will not work: the site uses ES modules, which browsers
refuse to load over that scheme.

### Deploying to Vercel (free tier)

`vercel.json` at the repository root already points Vercel at `web/`, so the
import is zero configuration:

1. Push this repository to GitHub.
2. On [vercel.com](https://vercel.com), **Add New → Project** and import the repo.
3. Leave every build setting empty — framework preset **Other**, no build
   command, no install command. `vercel.json` supplies the output directory.
4. **Deploy.**

Or from the command line:

```sh
npm i -g vercel
vercel        # preview deployment
vercel --prod # production deployment
```

If you would rather not use `vercel.json`, delete it and set **Root Directory**
to `web` in the project settings instead — the two approaches are equivalent.

### Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | `W` `A` `S` `D` or arrows | Left half of the screen |
| Aim | Mouse | Right half of the screen |
| Fire | Left click or `Space` | Hold the right stick |
| Dash | `Shift` | Double tap the left half |
| Pause | `P` or `Esc` | — |
| Mute | `M` | Sound button |

The other games use the same conventions: `WASD` or the arrows to move, `P` or
`Esc` to pause, `M` to mute, `Enter` or `R` to start and restart. Every page also
carries a quality button that cycles auto, high, medium and low.

### What the port covers

Java no longer runs in browsers, so the classes the game needed were ported to
ES modules under `web/js/framework/`. Names and method signatures were kept so
the two versions read the same.

| Java | Browser | Notes |
| --- | --- | --- |
| `game.framework.Game` | `framework/game.js` | Same `initialize` / `loadContent` / `update` / `draw` hooks; `requestAnimationFrame` replaces the `BufferStrategy` loop |
| `game.framework.GameTime` | `framework/gametime.js` | `tick`, `start`, `stop`, `getDeltaTimeSeconds` |
| `game.framework.Vector2` | `framework/vector2.js` | Immutable operations, plus in-place variants for the hot path |
| `game.framework.Rectangle` | `framework/rectangle.js` | `contains`, `intersects`, `inflate` |
| `game.framework.MathHelper` | `framework/mathhelper.js` | `clamp`, `lerp`, `smoothStep`, `random` |
| `game.input.Keyboard` / `Mouse` | `framework/input.js` | `keyDown` / `keyDownOnce` polling over DOM events |
| `game.animation.ease.*` | `framework/ease.js` | All eleven easing families, original `(time, begin, change, duration)` signature |

Two modules have no Java counterpart — they exist because a browser canvas has
problems a desktop JVM window does not:

| Browser | What it does |
| --- | --- |
| `framework/quality.js` | Watches the frame time and steps a quality level up and down, scaling glow radius, particle counts and the device pixel ratio. Pinnable by hand with the quality button, a `?quality=` parameter, or `prefers-reduced-motion` |
| `framework/spatialgrid.js` | Uniform grid broad phase for circle collision, rebuilt each frame with recycled buckets |

Vector Arena lives in `web/js/game/`: `arena.js` (loop, waves, HUD),
`entities.js` (player, enemies, pickups), `particles.js`, `audio.js` (synthesised
with the Web Audio API, so there are no audio assets), and `touch.js`. The other
five games are in `web/js/games/`, one module each plus `shell.js`, which wires
the DOM chrome — overlays, score readouts, mode pills and buttons — that every
page shares.

### Performance

The arcade is written for a phone that is already throttling as much as for a
desktop. What that costs, and what it bought:

- **Particles are typed arrays, drawn in batches.** The pool is nine flat buffers
  rather than a thousand objects; live particles are tracked by a dense index
  list, so a free slot is a stack pop instead of a scan. Drawing sorts them into
  buckets sharing a colour, a quantised alpha and a quantised line width, and
  strokes each bucket as one path. Measured in headless Chromium at a saturated
  1000 particle pool: **6.1ms → 0.18ms per frame**, most of a frame budget back.
- **The glow is the first thing to go.** `shadowBlur` behind every neon stroke is
  the single most expensive thing the canvas does per shape, so it is scaled by
  the quality level from one place and switched off entirely at the bottom.
- **The device pixel ratio is capped.** A phone reporting 3 would shade nine
  pixels for every one the player can tell apart; the cap is 2, 1.5 or 1 by level.
- **Bullet against enemy goes through a spatial grid** rather than every bullet
  against every enemy, which is what a late wave used to spend its frame on.
- **The hot paths allocate nothing.** Steering, damping, separation and collision
  work in plain numbers on vectors held in place; the per-frame `filter` calls
  that rebuilt four arrays became in-place compaction; the static backdrop grid
  is rasterised once and blitted; `getBoundingClientRect` is cached rather than
  read on every pointer move.

Not ported: `Matrix`, `Matrix3`, `Quaternion`, `Vector3`, `Vector4`, the Swing
GUI toolkit under `game.gui`, and `Texture2D` / `ImageHelper` — none of which the
game needed.

## Installation (Java framework)

1. install the java JDK7.
2. clone this repo.
3. run make.bat if on windows, make.sh if on linux, or compile it with netbeans.
4. add the .jar file created to your project.

## Usage

After building the framework, add the .jar file to your project. Once added to your project have your class extend "game.framework.Game" and implement all the methods from the abstract class. Once everything is set up correctly just run the project and you should see a blank window with a blue background. (Better instructions to come later! :p)
