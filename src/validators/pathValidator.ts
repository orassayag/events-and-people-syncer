import { promises as fs } from 'fs';
import type { PathValidationResult } from '../types';

export { PathValidationResult };

export class PathValidator {
  async validatePathsExist(paths: string[]): Promise<PathValidationResult[]> {
    const results: PathValidationResult[] = [];
    for (const path of paths) {
      try {
        await fs.access(path);
        const stats = await fs.stat(path);
        results.push({
          path,
          exists: true,
          isDirectory: stats.isDirectory(),
        });
      } catch {
        results.push({
          path,
          exists: false,
          isDirectory: false,
        });
      }
    }
    return results;
  }

  async validateWritable(path: string): Promise<boolean> {
    try {
      await fs.access(path, fs.constants.W_OK);
      return true;
    } catch {
      throw new Error(`Insufficient permissions for path: ${path}`);
    }
  }

  async validateReadable(path: string): Promise<boolean> {
    try {
      await fs.access(path, fs.constants.R_OK);
      return true;
    } catch {
      throw new Error(`Insufficient permissions for path: ${path}`);
    }
  }
}
