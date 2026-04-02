export class StatusBar {
  private static instance: StatusBar;
  private readCount: number = 0;
  private writeCount: number = 0;
  private isEnabled: boolean = true;

  private constructor() {}

  static getInstance(): StatusBar {
    if (!StatusBar.instance) {
      StatusBar.instance = new StatusBar();
    }
    return StatusBar.instance;
  }

  updateCounts(read: number, write: number): void {
    this.readCount = read;
    this.writeCount = write;
    this.render();
  }

  private render(): void {
    if (!this.isEnabled) return;
    const status: string = `[API Usage] Read: ${this.readCount} | Write: ${this.writeCount}`;
    process.stdout.write(`\x1b[s\x1b[999;0H\x1b[K${status}\x1b[u`);
  }

  hide(): void {
    this.isEnabled = false;
    process.stdout.write('\x1b[s\x1b[999;0H\x1b[K\x1b[u');
  }

  show(): void {
    this.isEnabled = true;
    this.render();
  }
}
