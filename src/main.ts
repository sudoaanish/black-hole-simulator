import "./style.css";
import { ControlPanel, defaultControls, type AppControls } from "./gui";
import { Renderer } from "./renderer";
import { SceneController } from "./scene";
import { FpsCounter } from "./utils/stats";

const canvas = document.getElementById("app-canvas");
const uiRoot = document.getElementById("ui-root");

if (!(canvas instanceof HTMLCanvasElement) || uiRoot === null) {
  throw new Error("Missing required DOM nodes: #app-canvas or #ui-root.");
}

const initialControls = defaultControls();
const scene = new SceneController(canvas);
scene.setDistance(initialControls.cameraDistance);
scene.setAutoOrbit(initialControls.autoOrbit);
scene.setOrbitSpeed(initialControls.orbitSpeed);
scene.setOrbitElevation(initialControls.orbitElevation);

const panel = new ControlPanel(uiRoot, initialControls);
let controls: AppControls = panel.getControls();
let previousControls: AppControls = { ...controls };
panel.onChange((next) => {
  const prev = previousControls;
  controls = next;
  if (next.cameraDistance !== prev.cameraDistance) {
    scene.setDistance(next.cameraDistance);
  }
  if (next.autoOrbit !== prev.autoOrbit) {
    scene.setAutoOrbit(next.autoOrbit);
  }
  if (next.orbitSpeed !== prev.orbitSpeed) {
    scene.setOrbitSpeed(next.orbitSpeed);
  }
  if (next.orbitElevation !== prev.orbitElevation) {
    scene.setOrbitElevation(next.orbitElevation);
  }
  previousControls = { ...next };
});

panel.onOrbitCommand((command) => {
  if (command === "reverse") {
    return scene.reverseOrbitDirection();
  }
  if (command === "play") {
    return scene.playOrbit();
  }
  if (command === "pause") {
    return scene.pauseOrbit();
  }
  return scene.stopOrbit();
});
panel.setOrbitPlaybackState(scene.getOrbitPlaybackState());

const fps = new FpsCounter(uiRoot);
const credit = document.createElement("div");
credit.className = "eh-credit";
credit.textContent = "Developed by Aanish Farrukh";
uiRoot.appendChild(credit);

let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown WebGL initialization error.";
  const node = document.createElement("div");
  node.className = "eh-error";
  node.textContent =
    `Geodesica could not start.\n\n${message}\n\n` +
    "Requires WebGL2 and modern desktop/mobile GPU drivers (Chrome 120+ / Firefox 120+).";
  uiRoot.appendChild(node);
  throw error;
}

let previousTimeMs = performance.now();
const tick = (timeMs: number): void => {
  const deltaSeconds = Math.min(0.1, (timeMs - previousTimeMs) * 0.001);
  previousTimeMs = timeMs;

  const frame = scene.update(deltaSeconds);
  renderer.render(frame, controls, timeMs * 0.001);
  panel.syncCameraDistance(scene.getDistance());
  fps.update(deltaSeconds);
  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);
