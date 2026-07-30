# 2D Java Game Framework

[github.com/smile-plzz/Game](https://github.com/smile-plzz/Game)

A collection of classes used for 2d game programming in Java. Much of the dirty work is taken care which makes this useful for beginner game programmers.

## Play it in the browser

`web/` holds **Vector Arena**, a wave based survival shooter, plus a browser port
of this framework's core that the game is written against. It is a static site —
no build step, no dependencies, no server code.

Run it locally with any static file server:

```sh
git clone https://github.com/smile-plzz/Game.git
cd Game/web
python3 -m http.server 8000   # then open http://localhost:8000
```

A plain `file://` open will not work: the site uses ES modules, which browsers
refuse to load over that scheme.

### Deploying to Vercel (free tier)

`vercel.json` at the repository root already points Vercel at `web/`, so the
import is zero configuration:

1. Push this repository to GitHub (`smile-plzz/Game`, or your own fork of it).
2. On [vercel.com](https://vercel.com), **Add New → Project** and import that repo.
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

The game itself lives in `web/js/game/`: `arena.js` (loop, waves, HUD),
`entities.js` (player, enemies, pickups), `particles.js`, `audio.js` (synthesised
with the Web Audio API, so there are no audio assets), and `touch.js`.

Not ported: `Matrix`, `Matrix3`, `Quaternion`, `Vector3`, `Vector4`, the Swing
GUI toolkit under `game.gui`, and `Texture2D` / `ImageHelper` — none of which the
game needed.

## Installation (Java framework)

1. install the java JDK7.
2. clone this repo: `git clone https://github.com/smile-plzz/Game.git`
3. run make.bat if on windows, make.sh if on linux, or compile it with netbeans.
4. add the .jar file created to your project.

## Usage

After building the framework, add the .jar file to your project. Once added to your project have your class extend "game.framework.Game" and implement all the methods from the abstract class. Once everything is set up correctly just run the project and you should see a blank window with a blue background. (Better instructions to come later! :p)
