export class FpsCounter {
  private readonly node: HTMLDivElement;
  private frameCount = 0;
  private accumulator = 0;
  private fps = 0;

  public constructor(parent: HTMLElement) {
    this.node = document.createElement("div");
    this.node.className = "eh-fps";
    this.node.textContent = "FPS: --";
    parent.appendChild(this.node);
  }

  public update(deltaSeconds: number): void {
    this.frameCount += 1;
    this.accumulator += deltaSeconds;
    if (this.accumulator >= 0.4) {
      this.fps = this.frameCount / this.accumulator;
      this.frameCount = 0;
      this.accumulator = 0;
      this.node.textContent = `FPS: ${this.fps.toFixed(1)}`;
    }
  }
}
