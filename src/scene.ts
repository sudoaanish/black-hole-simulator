import { add3, cross3, dot3, lerp3, normalize3, scale3, type Vec3 } from "./utils/math";

export interface CameraFrame {
  position: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  fovY: number;
  aspect: number;
  observerVelocity: Vec3;
}

export interface OrbitPlaybackState {
  paused: boolean;
  reversed: boolean;
}

export class SceneController {
  private readonly canvas: HTMLCanvasElement;
  private focus: Vec3 = [0, 0, 0];
  private distance = 25.0;
  private readonly fovY = Math.PI / 3.0;
  private readonly pressed = new Set<string>();
  private dragActive = false;
  private lastPointer: [number, number] = [0, 0];
  private touchMode: "none" | "orbit" | "pinch" = "none";
  private lastPinchDistance = 0;
  private observerVelocity: Vec3 = [0, 0, 0];

  private autoOrbitEnabled = true;
  private orbitSpeed = 0.08;
  private orbitDirection = 1.0;
  private orbitAngle = 0.0;
  private orbitElevation = 0.3;
  private orbitPaused = false;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bindInputs();
  }

  public setDistance(distance: number): void {
    this.distance = Math.min(50.0, Math.max(0.8, distance));
  }

  public getDistance(): number {
    return this.distance;
  }

  public setAutoOrbit(enabled: boolean): void {
    if (this.autoOrbitEnabled === enabled) {
      return;
    }
    this.autoOrbitEnabled = enabled;
    if (enabled) {
      this.orbitPaused = false;
    }
  }

  public setOrbitSpeed(speed: number): void {
    this.orbitSpeed = Math.min(0.5, Math.max(0.01, Math.abs(speed)));
  }

  public setOrbitElevation(elevation: number): void {
    this.orbitElevation = Math.min(1.0, Math.max(-0.5, elevation));
  }

  public reverseOrbitDirection(): OrbitPlaybackState {
    this.orbitDirection *= -1.0;
    return this.getOrbitPlaybackState();
  }

  public playOrbit(): OrbitPlaybackState {
    this.orbitPaused = false;
    return this.getOrbitPlaybackState();
  }

  public pauseOrbit(): OrbitPlaybackState {
    this.orbitPaused = true;
    return this.getOrbitPlaybackState();
  }

  public stopOrbit(): OrbitPlaybackState {
    this.orbitPaused = true;
    this.orbitAngle = 0.0;
    return this.getOrbitPlaybackState();
  }

  public getOrbitPlaybackState(): OrbitPlaybackState {
    return {
      paused: this.orbitPaused,
      reversed: this.orbitDirection < 0.0
    };
  }

  public update(deltaSeconds: number): CameraFrame {
    if (this.autoOrbitEnabled && !this.orbitPaused) {
      this.orbitAngle += this.orbitDirection * this.orbitSpeed * deltaSeconds;
    }

    const frame = this.getFrame();
    const move = this.computeMoveVector(frame);
    const speed = 4.0 * Math.max(0.75, this.distance * 0.12);
    const displacement = scale3(move, speed * deltaSeconds);
    if (dot3(displacement, displacement) > 0) {
      this.focus = add3(this.focus, displacement);
      this.observerVelocity = lerp3(this.observerVelocity, scale3(displacement, 1 / Math.max(deltaSeconds, 1e-4)), 0.24);
    } else {
      this.observerVelocity = lerp3(this.observerVelocity, [0, 0, 0], 0.1);
    }
    return this.getFrame();
  }

  private getFrame(): CameraFrame {
    const cosEl = Math.cos(this.orbitElevation);
    const sinEl = Math.sin(this.orbitElevation);
    const cosAz = Math.cos(this.orbitAngle);
    const sinAz = Math.sin(this.orbitAngle);

    const offset: Vec3 = [this.distance * cosAz * cosEl, this.distance * sinEl, this.distance * sinAz * cosEl];
    const position = add3(this.focus, offset);
    const forward = normalize3([this.focus[0] - position[0], this.focus[1] - position[1], this.focus[2] - position[2]]);
    let right = normalize3(cross3(forward, [0, 1, 0]));
    if (dot3(right, right) < 1e-6) {
      right = [1, 0, 0];
    }
    const up = normalize3(cross3(right, forward));

    return {
      position,
      forward,
      right,
      up,
      fovY: this.fovY,
      aspect: this.canvas.width > 0 ? this.canvas.width / this.canvas.height : 1,
      observerVelocity: this.observerVelocity
    };
  }

  private computeMoveVector(frame: CameraFrame): Vec3 {
    const movement: Vec3 = [0, 0, 0];
    if (this.pressed.has("w") || this.pressed.has("arrowup")) {
      movement[0] += frame.forward[0];
      movement[1] += frame.forward[1];
      movement[2] += frame.forward[2];
    }
    if (this.pressed.has("s") || this.pressed.has("arrowdown")) {
      movement[0] -= frame.forward[0];
      movement[1] -= frame.forward[1];
      movement[2] -= frame.forward[2];
    }
    if (this.pressed.has("a") || this.pressed.has("arrowleft")) {
      movement[0] -= frame.right[0];
      movement[1] -= frame.right[1];
      movement[2] -= frame.right[2];
    }
    if (this.pressed.has("d") || this.pressed.has("arrowright")) {
      movement[0] += frame.right[0];
      movement[1] += frame.right[1];
      movement[2] += frame.right[2];
    }
    if (this.pressed.has("q")) {
      movement[1] -= 1;
    }
    if (this.pressed.has("e")) {
      movement[1] += 1;
    }
    return normalize3(movement);
  }

  private bindInputs(): void {
    window.addEventListener("keydown", (event) => {
      this.pressed.add(event.key.toLowerCase());
    });

    window.addEventListener("keyup", (event) => {
      this.pressed.delete(event.key.toLowerCase());
    });

    this.canvas.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      this.dragActive = true;
      this.lastPointer = [event.clientX, event.clientY];
    });

    window.addEventListener("mousemove", (event) => {
      if (!this.dragActive) {
        return;
      }
      const dy = event.clientY - this.lastPointer[1];
      this.lastPointer = [event.clientX, event.clientY];
      this.applyOrbit(dy);
    });

    window.addEventListener("mouseup", () => {
      this.dragActive = false;
    });

    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const scale = Math.exp(event.deltaY * 0.0011);
        this.distance = Math.min(50.0, Math.max(0.8, this.distance * scale));
      },
      { passive: false }
    );

    this.canvas.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length === 1) {
          const touch = event.touches[0];
          this.touchMode = "orbit";
          this.lastPointer = [touch.clientX, touch.clientY];
        } else if (event.touches.length >= 2) {
          this.touchMode = "pinch";
          this.lastPinchDistance = this.measurePinch(event.touches[0], event.touches[1]);
        }
      },
      { passive: true }
    );

    this.canvas.addEventListener(
      "touchmove",
      (event) => {
        if (this.touchMode === "orbit" && event.touches.length === 1) {
          const touch = event.touches[0];
          const dy = touch.clientY - this.lastPointer[1];
          this.lastPointer = [touch.clientX, touch.clientY];
          this.applyOrbit(dy);
          event.preventDefault();
        } else if (this.touchMode === "pinch" && event.touches.length >= 2) {
          const current = this.measurePinch(event.touches[0], event.touches[1]);
          const ratio = this.lastPinchDistance / Math.max(current, 1);
          this.distance = Math.min(50.0, Math.max(0.8, this.distance * ratio));
          this.lastPinchDistance = current;
          event.preventDefault();
        }
      },
      { passive: false }
    );

    this.canvas.addEventListener("touchend", () => {
      this.touchMode = "none";
    });
  }

  private applyOrbit(dy: number): void {
    const sensitivity = 0.004;
    this.orbitElevation = Math.min(1.0, Math.max(-0.5, this.orbitElevation - dy * sensitivity));
  }

  private measurePinch(a: Touch, b: Touch): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
}
