import blackholeVertSource from "./shaders/blackhole.vert";
import blackholeFragSource from "./shaders/blackhole.frag";
import postprocessFragSource from "./shaders/postprocess.frag";
import type { AppControls } from "./gui";
import type { CameraFrame } from "./scene";
import type { Vec3 } from "./utils/math";

interface BlackHoleUniformLocations {
  uTime: WebGLUniformLocation;
  uTimeScale: WebGLUniformLocation;
  uCameraPos: WebGLUniformLocation;
  uCameraForward: WebGLUniformLocation;
  uCameraRight: WebGLUniformLocation;
  uCameraUp: WebGLUniformLocation;
  uFovY: WebGLUniformLocation;
  uAspect: WebGLUniformLocation;
  uSchwarzschildRadius: WebGLUniformLocation;
  uSteps: WebGLUniformLocation;
  uStepSize: WebGLUniformLocation;
  uShowAccretionDisk: WebGLUniformLocation;
  uShowDoppler: WebGLUniformLocation;
  uShowRedshift: WebGLUniformLocation;
  uShowBeaming: WebGLUniformLocation;
  uShowPhotonSphere: WebGLUniformLocation;
  uObserverVelocity: WebGLUniformLocation;
  uStarDensity: WebGLUniformLocation;
}

interface PostUniformLocations {
  uSceneTexture: WebGLUniformLocation;
  uResolution: WebGLUniformLocation;
  uBloomIntensity: WebGLUniformLocation;
  uExposure: WebGLUniformLocation;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly blackHoleProgram: WebGLProgram;
  private readonly postProgram: WebGLProgram;
  private readonly blackHoleUniforms: BlackHoleUniformLocations;
  private readonly postUniforms: PostUniformLocations;
  private readonly vao: WebGLVertexArrayObject;
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneColor: WebGLTexture | null = null;
  private renderWidth = 1;
  private renderHeight = 1;

  public constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false });
    if (gl === null) {
      throw new Error("WebGL2 is unavailable on this browser/device.");
    }
    this.canvas = canvas;
    this.gl = gl;

    const ext = gl.getExtension("EXT_color_buffer_float");
    if (ext === null) {
      throw new Error("WebGL2 float framebuffers are unsupported (missing EXT_color_buffer_float).");
    }

    this.blackHoleProgram = this.createProgram(blackholeVertSource, blackholeFragSource);
    this.postProgram = this.createProgram(blackholeVertSource, postprocessFragSource);
    this.blackHoleUniforms = {
      uTime: this.getUniform(this.blackHoleProgram, "uTime"),
      uTimeScale: this.getUniform(this.blackHoleProgram, "uTimeScale"),
      uCameraPos: this.getUniform(this.blackHoleProgram, "uCameraPos"),
      uCameraForward: this.getUniform(this.blackHoleProgram, "uCameraForward"),
      uCameraRight: this.getUniform(this.blackHoleProgram, "uCameraRight"),
      uCameraUp: this.getUniform(this.blackHoleProgram, "uCameraUp"),
      uFovY: this.getUniform(this.blackHoleProgram, "uFovY"),
      uAspect: this.getUniform(this.blackHoleProgram, "uAspect"),
      uSchwarzschildRadius: this.getUniform(this.blackHoleProgram, "uSchwarzschildRadius"),
      uSteps: this.getUniform(this.blackHoleProgram, "uSteps"),
      uStepSize: this.getUniform(this.blackHoleProgram, "uStepSize"),
      uShowAccretionDisk: this.getUniform(this.blackHoleProgram, "uShowAccretionDisk"),
      uShowDoppler: this.getUniform(this.blackHoleProgram, "uShowDoppler"),
      uShowRedshift: this.getUniform(this.blackHoleProgram, "uShowRedshift"),
      uShowBeaming: this.getUniform(this.blackHoleProgram, "uShowBeaming"),
      uShowPhotonSphere: this.getUniform(this.blackHoleProgram, "uShowPhotonSphere"),
      uObserverVelocity: this.getUniform(this.blackHoleProgram, "uObserverVelocity"),
      uStarDensity: this.getUniform(this.blackHoleProgram, "uStarDensity")
    };
    this.postUniforms = {
      uSceneTexture: this.getUniform(this.postProgram, "uSceneTexture"),
      uResolution: this.getUniform(this.postProgram, "uResolution"),
      uBloomIntensity: this.getUniform(this.postProgram, "uBloomIntensity"),
      uExposure: this.getUniform(this.postProgram, "uExposure")
    };

    const vao = gl.createVertexArray();
    if (vao === null) {
      throw new Error("Failed to create VAO.");
    }
    this.vao = vao;
    this.resize();
  }

  public resize(): void {
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));
    if (width === this.renderWidth && height === this.renderHeight) {
      return;
    }
    this.renderWidth = width;
    this.renderHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.rebuildFramebuffer();
  }

  public render(frame: CameraFrame, controls: AppControls, elapsedSeconds: number): void {
    this.resize();
    const gl = this.gl;
    if (this.sceneFbo === null || this.sceneColor === null) {
      return;
    }

    const stepScale = controls.qualityPreset === "low" ? 1.55 : controls.qualityPreset === "med" ? 1.2 : 0.95;
    const stepSize = (0.11 + controls.cameraDistance * 0.006) * stepScale;

    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.viewport(0, 0, this.renderWidth, this.renderHeight);
    gl.useProgram(this.blackHoleProgram);

    gl.uniform1f(this.blackHoleUniforms.uTime, elapsedSeconds);
    gl.uniform1f(this.blackHoleUniforms.uTimeScale, controls.timeScale);
    this.setVec3(this.blackHoleUniforms.uCameraPos, frame.position);
    this.setVec3(this.blackHoleUniforms.uCameraForward, frame.forward);
    this.setVec3(this.blackHoleUniforms.uCameraRight, frame.right);
    this.setVec3(this.blackHoleUniforms.uCameraUp, frame.up);
    gl.uniform1f(this.blackHoleUniforms.uFovY, frame.fovY);
    gl.uniform1f(this.blackHoleUniforms.uAspect, frame.aspect);
    gl.uniform1f(this.blackHoleUniforms.uSchwarzschildRadius, controls.schwarzschildRadius);
    gl.uniform1i(this.blackHoleUniforms.uSteps, controls.odeSteps);
    gl.uniform1f(this.blackHoleUniforms.uStepSize, stepSize);
    gl.uniform1i(this.blackHoleUniforms.uShowAccretionDisk, controls.showAccretionDisk ? 1 : 0);
    gl.uniform1i(this.blackHoleUniforms.uShowDoppler, controls.showDopplerShift ? 1 : 0);
    gl.uniform1i(this.blackHoleUniforms.uShowRedshift, controls.showGravitationalRedshift ? 1 : 0);
    gl.uniform1i(this.blackHoleUniforms.uShowBeaming, controls.showRelativisticBeaming ? 1 : 0);
    gl.uniform1i(this.blackHoleUniforms.uShowPhotonSphere, 1);
    this.setVec3(this.blackHoleUniforms.uObserverVelocity, frame.observerVelocity);
    gl.uniform1f(this.blackHoleUniforms.uStarDensity, controls.starDensity);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.renderWidth, this.renderHeight);
    gl.useProgram(this.postProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneColor);
    gl.uniform1i(this.postUniforms.uSceneTexture, 0);
    this.setVec2(this.postUniforms.uResolution, this.renderWidth, this.renderHeight);
    gl.uniform1f(this.postUniforms.uBloomIntensity, controls.bloomIntensity);
    gl.uniform1f(this.postUniforms.uExposure, controls.exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
  }

  private rebuildFramebuffer(): void {
    const gl = this.gl;
    if (this.sceneColor !== null) {
      gl.deleteTexture(this.sceneColor);
      this.sceneColor = null;
    }
    if (this.sceneFbo !== null) {
      gl.deleteFramebuffer(this.sceneFbo);
      this.sceneFbo = null;
    }

    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (texture === null || fbo === null) {
      throw new Error("Failed to allocate scene framebuffer resources.");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      this.renderWidth,
      this.renderHeight,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Scene framebuffer incomplete (status ${status}).`);
    }

    this.sceneColor = texture;
    this.sceneFbo = fbo;
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource, "vertex");
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource, "fragment");

    const program = gl.createProgram();
    if (program === null) {
      throw new Error("Failed to allocate GL program.");
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) ?? "Unknown link error.";
      gl.deleteProgram(program);
      throw new Error(`Program link error:\n${info}`);
    }
    return program;
  }

  private createShader(type: number, source: string, label: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (shader === null) {
      throw new Error(`Failed to create ${label} shader.`);
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader) ?? "Unknown compile error.";
      const numbered = source
        .split("\n")
        .map((line, i) => `${(i + 1).toString().padStart(4, " ")} | ${line}`)
        .join("\n");
      gl.deleteShader(shader);
      throw new Error(`${label.toUpperCase()} shader compile error:\n${info}\n\n${numbered}`);
    }
    return shader;
  }

  private getUniform(program: WebGLProgram, name: string): WebGLUniformLocation {
    const location = this.gl.getUniformLocation(program, name);
    if (location === null) {
      throw new Error(`Missing uniform "${name}".`);
    }
    return location;
  }

  private setVec2(location: WebGLUniformLocation, x: number, y: number): void {
    this.gl.uniform2f(location, x, y);
  }

  private setVec3(location: WebGLUniformLocation, v: Vec3): void {
    this.gl.uniform3f(location, v[0], v[1], v[2]);
  }
}
