export type QualityPreset = "low" | "med" | "high";

export interface AppControls {
  schwarzschildRadius: number;
  odeSteps: number;
  cameraDistance: number;
  timeScale: number;
  showAccretionDisk: boolean;
  showDopplerShift: boolean;
  showGravitationalRedshift: boolean;
  showRelativisticBeaming: boolean;
  bloomIntensity: number;
  exposure: number;
  qualityPreset: QualityPreset;
  starDensity: number;
  autoOrbit: boolean;
  orbitSpeed: number;
  orbitElevation: number;
}

export const defaultControls = (): AppControls => ({
  schwarzschildRadius: 1.0,
  odeSteps: 256,
  cameraDistance: 25.0,
  timeScale: 1.0,
  showAccretionDisk: true,
  showDopplerShift: true,
  showGravitationalRedshift: true,
  showRelativisticBeaming: true,
  bloomIntensity: 0.0,
  exposure: 1.1,
  qualityPreset: "high",
  starDensity: 7.0,
  autoOrbit: true,
  orbitSpeed: 0.08,
  orbitElevation: 0.3
});

const tooltips: Record<string, string> = {
  schwarzschildRadius:
    "The Schwarzschild radius (r_s) defines the event horizon size. For a black hole with Earth's mass, r_s is about 9mm. For the Sun, r_s is about 3km. Nothing can escape from within this radius.",
  odeSteps:
    "Controls how many Runge-Kutta integration steps are used to trace each light ray through curved spacetime. More steps means more accurate bending and a sharper photon ring. 128 is balanced; 256 is highest quality with higher GPU cost.",
  timeScale:
    "Scales accretion disk animation speed. Gas near the ISCO moves at relativistic speeds. Set to 0 to freeze motion and inspect structure.",
  cameraDistance:
    "Observer distance from the black hole center, measured in units of r_s. The photon sphere is at 1.5r_s and the ISCO is at 3r_s.",
  bloomIntensity:
    "Controls glow around bright regions. This emulates optical/sensor bloom. Set to 0 for a crisp scientific render.",
  exposure:
    "Camera exposure before tone mapping. Higher values reveal dim structures but can over-brighten highlights. ACES maps HDR to display range.",
  starDensity:
    "Controls background star density. Higher values lower generation thresholds for all star layers, increasing visible star count.",
  qualityPreset:
    "LOW: 64 ODE steps. MED: 128 ODE steps. HIGH: 256 ODE steps for maximum lensing fidelity on modern GPUs.",
  showAccretionDisk:
    "Toggles rendering of the relativistic accretion disk around the black hole.",
  showDoppler:
    "Relativistic Doppler beaming: approaching gas appears brighter and slightly bluer; receding gas appears dimmer and redder.",
  showGravitationalRedshift:
    "Light climbing out of strong gravity redshifts. This dims and reddens emission from near the horizon.",
  showRelativisticBeaming:
    "Observer-motion aberration that shifts apparent light direction across the full sky.",
  autoOrbit:
    "Automatically orbits the camera around the black hole. Manual drag adjusts the view while orbit continues.",
  orbitSpeed:
    "Angular speed of automatic camera orbit in radians per second. At 0.08 rad/s one orbit takes about 78 seconds.",
  elevation:
    "Camera elevation above the disk plane. 0 degrees is edge-on; 90 degrees is top-down.",
  orbitReverse: "Reverse the orbit direction.",
  orbitPlay: "Resume automatic orbit.",
  orbitPause: "Pause orbit rotation. Disk animation continues.",
  orbitStop: "Stop and reset orbit to starting position."
};

type ChangeCallback = (controls: AppControls) => void;
type OrbitCommand = "reverse" | "play" | "pause" | "stop";
interface PlaybackState {
  paused: boolean;
  reversed: boolean;
}
type OrbitCommandCallback = (command: OrbitCommand) => PlaybackState | void;

interface RangeBinding {
  input: HTMLInputElement;
  valueNode: HTMLSpanElement;
  min: number;
  max: number;
}

export class ControlPanel {
  private readonly panel: HTMLDivElement;
  private readonly panelBody: HTMLDivElement;
  private readonly controls: AppControls;
  private readonly listeners = new Set<ChangeCallback>();
  private readonly stepBinding: RangeBinding;
  private readonly cameraBinding: RangeBinding;
  private readonly qualityButtons = new Map<QualityPreset, HTMLButtonElement>();
  private readonly tooltip: HTMLDivElement;
  private readonly orbitCallbacks = new Set<OrbitCommandCallback>();
  private readonly playbackWrap: HTMLDivElement;
  private readonly playbackButtons: Record<OrbitCommand, { wrap: HTMLDivElement; button: HTMLButtonElement }>;
  private playbackState: PlaybackState = { paused: false, reversed: false };
  private collapsed = false;

  public constructor(parent: HTMLElement, initial: AppControls) {
    this.controls = { ...initial };

    this.panel = document.createElement("div");
    this.panel.className = "eh-panel";
    parent.appendChild(this.panel);

    const header = document.createElement("div");
    header.className = "eh-panel-header";
    this.panel.appendChild(header);

    const title = document.createElement("div");
    title.className = "eh-panel-title";
    title.textContent = "Geodesica";
    header.appendChild(title);

    const collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "eh-collapse-btn";
    collapseButton.textContent = ">";
    collapseButton.addEventListener("click", () => {
      this.collapsed = !this.collapsed;
      this.panel.classList.toggle("is-collapsed", this.collapsed);
      collapseButton.textContent = this.collapsed ? "<" : ">";
      this.hideTooltip();
    });
    header.appendChild(collapseButton);

    const rule = document.createElement("div");
    rule.className = "eh-rule";
    this.panel.appendChild(rule);

    this.panelBody = document.createElement("div");
    this.panelBody.className = "eh-panel-body";
    this.panel.appendChild(this.panelBody);

    this.tooltip = document.createElement("div");
    this.tooltip.className = "eh-tooltip";
    parent.appendChild(this.tooltip);

    const simulation = this.addSection("Simulation");
    this.addRangeControl(simulation, {
      key: "schwarzschildRadius",
      label: "Schwarzschild radius",
      min: 0.1,
      max: 2.0,
      step: 0.01,
      initial: this.controls.schwarzschildRadius,
      format: (v) => v.toFixed(2),
      onValue: (v) => {
        this.controls.schwarzschildRadius = v;
      }
    });
    this.stepBinding = this.addRangeControl(simulation, {
      key: "odeSteps",
      label: "ODE steps",
      min: 32,
      max: 256,
      step: 8,
      initial: this.controls.odeSteps,
      format: (v) => Math.round(v).toString(),
      onValue: (v) => {
        this.controls.odeSteps = Math.round(v);
      }
    });
    this.addRangeControl(simulation, {
      key: "timeScale",
      label: "Time scale",
      min: 0.0,
      max: 5.0,
      step: 0.01,
      initial: this.controls.timeScale,
      format: (v) => v.toFixed(2),
      onValue: (v) => {
        this.controls.timeScale = v;
      }
    });

    const camera = this.addSection("Camera");
    this.cameraBinding = this.addRangeControl(camera, {
      key: "cameraDistance",
      label: "Camera distance",
      min: 2.0,
      max: 50.0,
      step: 0.01,
      initial: this.controls.cameraDistance,
      format: (v) => v.toFixed(2),
      onValue: (v) => {
        this.controls.cameraDistance = v;
      }
    });
    this.addToggleControl(camera, "Auto orbit", "autoOrbit", this.controls.autoOrbit, (v) => {
      this.controls.autoOrbit = v;
      this.updatePlaybackVisibility();
    });
    this.playbackWrap = document.createElement("div");
    this.playbackWrap.className = "eh-playback-wrap";
    camera.appendChild(this.playbackWrap);
    this.playbackButtons = {
      reverse: this.createPlaybackButton("reverse", "<<", "orbitReverse"),
      play: this.createPlaybackButton("play", ">", "orbitPlay"),
      pause: this.createPlaybackButton("pause", "||", "orbitPause"),
      stop: this.createPlaybackButton("stop", "[]", "orbitStop")
    };
    const playbackControls = document.createElement("div");
    playbackControls.className = "eh-playback-controls";
    playbackControls.append(
      this.playbackButtons.reverse.wrap,
      this.playbackButtons.play.wrap,
      this.playbackButtons.pause.wrap,
      this.playbackButtons.stop.wrap
    );
    this.playbackWrap.appendChild(playbackControls);
    this.updatePlaybackButtons();
    this.updatePlaybackVisibility();
    this.addRangeControl(camera, {
      key: "orbitSpeed",
      label: "Orbit speed",
      min: 0.01,
      max: 0.5,
      step: 0.01,
      initial: this.controls.orbitSpeed,
      format: (v) => v.toFixed(2),
      onValue: (v) => {
        this.controls.orbitSpeed = v;
      }
    });
    this.addRangeControl(camera, {
      key: "elevation",
      label: "Elevation",
      min: -0.5,
      max: 1.0,
      step: 0.01,
      initial: this.controls.orbitElevation,
      format: (v) => `${(v * 180.0 / Math.PI).toFixed(1)} deg`,
      onValue: (v) => {
        this.controls.orbitElevation = v;
      }
    });

    const visual = this.addSection("Visual");
    this.addRangeControl(visual, {
      key: "bloomIntensity",
      label: "Bloom intensity",
      min: 0.0,
      max: 3.0,
      step: 0.01,
      initial: this.controls.bloomIntensity,
      format: (v) => v.toFixed(2),
      onValue: (v) => {
        this.controls.bloomIntensity = v;
      }
    });
    this.addRangeControl(visual, {
      key: "exposure",
      label: "Exposure",
      min: 0.1,
      max: 5.0,
      step: 0.01,
      initial: this.controls.exposure,
      format: (v) => v.toFixed(2),
      onValue: (v) => {
        this.controls.exposure = v;
      }
    });
    this.addRangeControl(visual, {
      key: "starDensity",
      label: "Stars",
      min: 0.0,
      max: 15.0,
      step: 0.1,
      initial: this.controls.starDensity,
      format: (v) => v.toFixed(1),
      onValue: (v) => {
        this.controls.starDensity = v;
      }
    });
    this.addQualityControl(visual, this.controls.qualityPreset);

    const effects = this.addSection("Effects");
    this.addToggleControl(effects, "Accretion disk", "showAccretionDisk", this.controls.showAccretionDisk, (v) => {
      this.controls.showAccretionDisk = v;
    });
    this.addToggleControl(effects, "Doppler shift", "showDoppler", this.controls.showDopplerShift, (v) => {
      this.controls.showDopplerShift = v;
    });
    this.addToggleControl(
      effects,
      "Gravitational redshift",
      "showGravitationalRedshift",
      this.controls.showGravitationalRedshift,
      (v) => {
        this.controls.showGravitationalRedshift = v;
      }
    );
    this.addToggleControl(
      effects,
      "Relativistic beaming",
      "showRelativisticBeaming",
      this.controls.showRelativisticBeaming,
      (v) => {
        this.controls.showRelativisticBeaming = v;
      }
    );

    this.decorateFps();
    document.addEventListener("pointerdown", (event) => {
      if (!this.tooltip.contains(event.target as Node)) {
        this.hideTooltip();
      }
    });
  }

  public onChange(listener: ChangeCallback): void {
    this.listeners.add(listener);
  }

  public onOrbitCommand(listener: OrbitCommandCallback): void {
    this.orbitCallbacks.add(listener);
  }

  public getControls(): AppControls {
    return { ...this.controls };
  }

  public syncCameraDistance(distance: number): void {
    this.controls.cameraDistance = distance;
    this.cameraBinding.input.value = distance.toFixed(2);
    this.cameraBinding.valueNode.textContent = distance.toFixed(2);
    this.updateSliderFill(this.cameraBinding.input, this.cameraBinding.min, this.cameraBinding.max);
  }

  public setOrbitPlaybackState(state: PlaybackState): void {
    this.playbackState = state;
    this.updatePlaybackButtons();
  }

  private emit(): void {
    const snapshot = this.getControls();
    for (const callback of this.listeners) {
      callback(snapshot);
    }
  }

  private addSection(title: string): HTMLElement {
    const section = document.createElement("section");
    section.className = "eh-section";
    const heading = document.createElement("div");
    heading.className = "eh-section-title";
    heading.textContent = title;
    section.appendChild(heading);
    this.panelBody.appendChild(section);
    return section;
  }

  private addRangeControl(
    section: HTMLElement,
    cfg: {
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      initial: number;
      format: (value: number) => string;
      onValue: (value: number) => void;
    }
  ): RangeBinding {
    const wrap = document.createElement("div");
    wrap.className = "eh-control";

    const head = document.createElement("div");
    head.className = "eh-control-head";
    const labelWrap = document.createElement("div");
    labelWrap.className = "eh-label-wrap";
    const label = document.createElement("label");
    label.textContent = cfg.label;
    labelWrap.appendChild(label);
    this.addTooltipTrigger(labelWrap, cfg.key);
    const value = document.createElement("span");
    value.className = "eh-value";
    value.textContent = cfg.format(cfg.initial);
    head.append(labelWrap, value);
    wrap.appendChild(head);

    const input = document.createElement("input");
    input.className = "eh-slider";
    input.type = "range";
    input.min = String(cfg.min);
    input.max = String(cfg.max);
    input.step = String(cfg.step);
    input.value = String(cfg.initial);
    input.addEventListener("input", () => {
      const next = Number(input.value);
      cfg.onValue(next);
      value.textContent = cfg.format(next);
      this.updateSliderFill(input, cfg.min, cfg.max);
      this.emit();
    });
    this.updateSliderFill(input, cfg.min, cfg.max);
    wrap.appendChild(input);

    section.appendChild(wrap);
    return { input, valueNode: value, min: cfg.min, max: cfg.max };
  }

  private addToggleControl(
    section: HTMLElement,
    labelText: string,
    tooltipKey: string,
    initial: boolean,
    onValue: (value: boolean) => void
  ): void {
    const row = document.createElement("div");
    row.className = "eh-toggle-row";

    const labelWrap = document.createElement("div");
    labelWrap.className = "eh-label-wrap";
    const label = document.createElement("span");
    label.className = "eh-toggle-label";
    label.textContent = labelText;
    labelWrap.appendChild(label);
    this.addTooltipTrigger(labelWrap, tooltipKey);
    row.appendChild(labelWrap);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "eh-toggle";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", initial ? "true" : "false");
    if (initial) {
      toggle.classList.add("is-on");
    }
    const knob = document.createElement("span");
    knob.className = "eh-toggle-knob";
    toggle.appendChild(knob);

    toggle.addEventListener("click", () => {
      const next = !toggle.classList.contains("is-on");
      toggle.classList.toggle("is-on", next);
      toggle.setAttribute("aria-checked", next ? "true" : "false");
      onValue(next);
      this.emit();
    });

    row.appendChild(toggle);
    section.appendChild(row);
  }

  private addQualityControl(section: HTMLElement, initial: QualityPreset): void {
    const row = document.createElement("div");
    row.className = "eh-quality";

    const label = document.createElement("div");
    label.className = "eh-quality-label";
    const labelWrap = document.createElement("div");
    labelWrap.className = "eh-label-wrap";
    const text = document.createElement("span");
    text.textContent = "Quality";
    labelWrap.appendChild(text);
    this.addTooltipTrigger(labelWrap, "qualityPreset");
    label.appendChild(labelWrap);
    row.appendChild(label);

    const segmented = document.createElement("div");
    segmented.className = "eh-segmented";
    const options: QualityPreset[] = ["low", "med", "high"];

    for (const option of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "eh-segment";
      btn.textContent = option;
      btn.addEventListener("click", () => {
        this.controls.qualityPreset = option;
        const presetSteps = option === "low" ? 64 : option === "med" ? 128 : 256;
        this.controls.odeSteps = presetSteps;
        this.stepBinding.input.value = String(presetSteps);
        this.stepBinding.valueNode.textContent = String(presetSteps);
        this.updateSliderFill(this.stepBinding.input, this.stepBinding.min, this.stepBinding.max);
        this.updateQualityButtons(option);
        this.emit();
      });
      segmented.appendChild(btn);
      this.qualityButtons.set(option, btn);
    }

    row.appendChild(segmented);
    section.appendChild(row);
    this.updateQualityButtons(initial);
  }

  private updateQualityButtons(active: QualityPreset): void {
    for (const [key, button] of this.qualityButtons) {
      button.classList.toggle("is-active", key === active);
    }
  }

  private updateSliderFill(slider: HTMLInputElement, min: number, max: number): void {
    const value = Number(slider.value);
    const pct = ((value - min) / Math.max(max - min, 1e-6)) * 100;
    slider.style.background = `linear-gradient(to right, rgba(245,166,35,0.6) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
  }

  private addTooltipTrigger(container: HTMLElement, key: string): void {
    const content = tooltips[key];
    if (content === undefined) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "eh-help";
    button.textContent = "?";

    const show = (): void => {
      if (this.collapsed) {
        return;
      }
      this.tooltip.textContent = content;
      const rect = container.getBoundingClientRect();
      const tooltipRect = this.tooltip.getBoundingClientRect();
      const left = Math.max(10, rect.left - tooltipRect.width - 12);
      const top = Math.min(window.innerHeight - tooltipRect.height - 10, Math.max(10, rect.top - 8));
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
      this.tooltip.classList.add("is-visible");
    };

    button.addEventListener("mouseenter", show);
    button.addEventListener("focus", show);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (this.tooltip.classList.contains("is-visible")) {
        this.hideTooltip();
      } else {
        show();
      }
    });
    button.addEventListener("mouseleave", () => this.hideTooltip());
    button.addEventListener("blur", () => this.hideTooltip());

    container.appendChild(button);
  }

  private createPlaybackButton(
    command: OrbitCommand,
    label: string,
    tooltipKey: string
  ): { wrap: HTMLDivElement; button: HTMLButtonElement } {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "eh-playback-btn";
    button.textContent = label;
    button.addEventListener("click", () => {
      for (const callback of this.orbitCallbacks) {
        const result = callback(command);
        if (result !== undefined) {
          this.playbackState = result;
        }
      }
      this.updatePlaybackButtons();
    });

    const wrap = document.createElement("div");
    wrap.className = "eh-playback-btn-wrap";
    wrap.appendChild(button);
    this.addTooltipTrigger(wrap, tooltipKey);
    return { wrap, button };
  }

  private updatePlaybackVisibility(): void {
    this.playbackWrap.classList.toggle("is-visible", this.controls.autoOrbit);
  }

  private updatePlaybackButtons(): void {
    this.playbackButtons.reverse.button.classList.toggle("active", this.playbackState.reversed);
    this.playbackButtons.play.button.classList.toggle("active", this.playbackState.paused);
    this.playbackButtons.pause.button.classList.toggle("active", !this.playbackState.paused);
    this.playbackButtons.stop.button.classList.remove("active");
  }

  private hideTooltip(): void {
    this.tooltip.classList.remove("is-visible");
  }

  private decorateFps(): void {
    const normalize = (): void => {
      const node = document.querySelector<HTMLElement>(".eh-fps");
      if (node === null) {
        return;
      }
      const text = node.textContent?.trim() ?? "";
      const prefixed = /^FPS:\s*([0-9]+(?:\.[0-9]+)?)$/i.exec(text);
      if (prefixed !== null) {
        node.textContent = `${prefixed[1]} FPS`;
      }
    };

    normalize();
    const observer = new MutationObserver(() => normalize());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

