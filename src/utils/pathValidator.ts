import { access, constants, stat } from 'fs/promises';
import { resolve, normalize } from 'path';

export function isWindowsPath(pathStr: string): boolean {
  const drivePattern = /^[a-zA-Z]:[/\\]/;
  const uncPattern = /^[/\\]{2}/;
  return drivePattern.test(pathStr) || uncPattern.test(pathStr);
}

export async function validatePathPermissions(
  resolvedPath: string
): Promise<void> {
  try {
    await access(resolvedPath, constants.R_OK);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'EACCES' ||
      (error as NodeJS.ErrnoException).code === 'EPERM'
    ) {
      throw new Error(`Permission denied accessing path: ${resolvedPath}`);
    }
    throw error;
  }
}

export async function validateAndResolveFilePath(
  targetPath: string
): Promise<string> {
  if (!targetPath || targetPath.trim() === '') {
    throw new Error('File path cannot be empty');
  }
  const resolvedPath = resolve(targetPath);
  try {
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      throw new Error(`Target must be a file, not a folder: ${resolvedPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${resolvedPath}`);
    }
    throw error;
  }
  await validatePathPermissions(resolvedPath);
  return resolvedPath;
}

export function normalizePath(pathStr: string): string {
  return normalize(resolve(pathStr));
}
