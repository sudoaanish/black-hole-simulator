# Geodesica

Real-time Schwarzschild black hole simulator running entirely in the browser with WebGL2 and GLSL. The project renders gravitational lensing, a relativistic accretion disk, Doppler shift, redshift, and the photon ring without external scene libraries.

<!-- Screenshot: add docs/preview.png after first deploy -->

## Features

- Fullscreen WebGL2 renderer with GPU-side RK4 ray integration
- Procedural background starfield and accretion disk
- Doppler shift, gravitational redshift, and observer aberration controls
- Adjustable Schwarzschild radius, integration steps, exposure, bloom, and orbit parameters
- Zero runtime dependencies beyond the browser platform

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- A browser with WebGL2 support
- `EXT_color_buffer_float` support for HDR rendering

## Development

```bash
npm install
npm run dev
```

Vite will print the local development URL, typically `http://localhost:5173`.

## Production Build

```bash
npm run build
npm run preview
```

## Controls

- Drag: tilt the camera
- Mouse wheel or pinch: zoom
- `W` `A` `S` `D` or arrow keys: move the observer
- `Q` / `E`: move down / up

## Tech Stack

- Vite
- TypeScript in strict mode
- WebGL2
- GLSL via `vite-plugin-glsl`

## Project Layout

```text
black-hole-simulator/
|-- index.html
|-- package.json
|-- src/
|   |-- main.ts
|   |-- renderer.ts
|   |-- scene.ts
|   |-- gui.ts
|   |-- style.css
|   |-- shaders/
|   |   |-- blackhole.vert
|   |   |-- blackhole.frag
|   |   `-- postprocess.frag
|   `-- utils/
|       |-- math.ts
|       `-- stats.ts
|-- tsconfig.json
`-- vite.config.ts
```

## Notes

- All visuals are generated procedurally in shaders or in code. The repo does not ship third-party texture assets.
- The app is intended for modern desktop and mobile browsers with reasonably current GPU drivers.
