import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../logging';

const execAsync = promisify(exec);

export class PortManager {
  private static logger: Logger = new Logger('PortManager');

  static async ensurePortAvailable(port: number): Promise<void> {
    const isInUse: boolean = await this.isPortInUse(port);
    if (isInUse) {
      this.logger.info(`Port ${port} is in use. Killing process`);
      await this.killProcessOnPort(port);
    }
  }

  private static async isPortInUse(port: number): Promise<boolean> {
    const pid: number | null = await this.findProcessOnPort(port);
    return pid !== null;
  }

  private static async killProcessOnPort(port: number): Promise<void> {
    const pid: number | null = await this.findProcessOnPort(port);
    if (pid !== null) {
      const platform: string = process.platform;
      const killCommand: string =
        platform === 'win32' ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;
      await execAsync(killCommand);
      this.logger.info(`Process ${pid} killed successfully`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  private static async findProcessOnPort(port: number): Promise<number | null> {
    const platform: string = process.platform;
    let command: string;
    if (platform === 'win32') {
      command = `netstat -ano | findstr :${port}`;
    } else {
      command = `lsof -ti:${port}`;
    }
    try {
      const { stdout } = await execAsync(command);
      if (platform === 'win32') {
        const lines: string[] = stdout.trim().split('\n');
        const match: RegExpMatchArray | null = lines[0]?.match(/\s+(\d+)\s*$/);
        return match ? parseInt(match[1], 10) : null;
      } else {
        const pid: number = parseInt(stdout.trim(), 10);
        return isNaN(pid) ? null : pid;
      }
    } catch {
      return null;
    }
  }
}
