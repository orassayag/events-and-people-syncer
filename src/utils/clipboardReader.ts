import { spawn } from 'child_process';
import type { ClipboardReadResult } from '../types';

export { ClipboardReadResult };

export async function readFromClipboard(
  maxSizeBytes?: number
): Promise<ClipboardReadResult> {
  const clipboardCommand =
    process.platform === 'darwin'
      ? 'pbpaste'
      : process.platform === 'win32'
        ? 'powershell.exe'
        : 'xclip';
  const clipboardArgs =
    process.platform === 'win32'
      ? ['-command', 'Get-Clipboard']
      : process.platform === 'linux'
        ? ['-o', '-selection', 'clipboard']
        : [];
  const content = await new Promise<string>((resolve, reject) => {
    const proc = spawn(clipboardCommand, clipboardArgs);
    let data = '';
    let errorData = '';
    proc.stdout.on('data', (chunk) => {
      data += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      errorData += chunk.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(data);
      } else {
        reject(new Error(`Clipboard read failed: ${errorData}`));
      }
    });
    proc.on('error', (err) => {
      reject(new Error(`Failed to read clipboard: ${err.message}`));
    });
  });
  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  if (maxSizeBytes && sizeBytes > maxSizeBytes) {
    throw new Error(
      `Clipboard content exceeds ${formatBytes(maxSizeBytes)} limit (got ${formatBytes(sizeBytes)})`
    );
  }
  return { content, sizeBytes };
}

export async function clearClipboard(): Promise<void> {
  let clearCommand: string;
  let clearArgs: string[];
  if (process.platform === 'darwin') {
    clearCommand = 'pbcopy';
    clearArgs = [];
  } else if (process.platform === 'win32') {
    clearCommand = 'powershell.exe';
    clearArgs = ['-command', 'Set-Clipboard -Value $null'];
  } else {
    clearCommand = 'xclip';
    clearArgs = ['-i', '/dev/null'];
  }
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(clearCommand, clearArgs);
    if (process.platform === 'darwin') {
      proc.stdin.write('');
      proc.stdin.end();
    }
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Failed to clear clipboard'));
      }
    });
    proc.on('error', () => {
      resolve();
    });
  });
}

export function isHtmlContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.includes('<') || !trimmed.includes('>')) {
    return false;
  }
  const htmlTagPatterns = [
    /<html/i,
    /<div/i,
    /<span/i,
    /<body/i,
    /<head/i,
    /<meta/i,
    /<script/i,
    /<link/i,
  ];
  return htmlTagPatterns.some((pattern) => pattern.test(trimmed));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
