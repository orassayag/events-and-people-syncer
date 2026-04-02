import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class PortManager {
  static async ensurePortAvailable(port: number): Promise<void> {
    const isInUse = await this.isPortInUse(port);
    if (isInUse) {
      console.log(`Port ${port} is in use. Killing process...`);
      await this.killProcessOnPort(port);
    }
  }

  private static async isPortInUse(port: number): Promise<boolean> {
    const pid = await this.findProcessOnPort(port);
    return pid !== null;
  }

  private static async killProcessOnPort(port: number): Promise<void> {
    const pid = await this.findProcessOnPort(port);
    if (pid !== null) {
      try {
        const platform = process.platform;
        const killCommand =
          platform === "win32" ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;
        await execAsync(killCommand);
        console.log(`Process ${pid} killed successfully.`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to kill process ${pid}:`, error);
      }
    }
  }

  private static async findProcessOnPort(port: number): Promise<number | null> {
    try {
      const platform = process.platform;
      let command: string;
      if (platform === "win32") {
        command = `netstat -ano | findstr :${port}`;
      } else {
        command = `lsof -ti:${port}`;
      }
      const { stdout } = await execAsync(command);
      if (platform === "win32") {
        const lines = stdout.trim().split("\n");
        const match = lines[0]?.match(/\s+(\d+)\s*$/);
        return match ? parseInt(match[1], 10) : null;
      } else {
        const pid = parseInt(stdout.trim(), 10);
        return isNaN(pid) ? null : pid;
      }
    } catch {
      return null;
    }
  }
}
