import { promises as fs } from 'fs';
import { join } from 'path';

const ILLEGAL_CHARS_REGEX = /[\/\\:*?"<>|]/;
const RESERVED_NAMES_REGEX = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const MAX_PATH_LENGTH = 255;
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
const HIDDEN_FILES = /^\./;
const WINDOWS_JUNK_FILES = ['Thumbs.db', 'desktop.ini'];
export class FolderManager {
  trimFolderName(name: string): string {
    return name.trim();
  }

  validateFolderName(name: string): string | true {
    const trimmed = this.trimFolderName(name);
    if (!trimmed) {
      return 'Folder name cannot be empty.';
    }
    if (trimmed.length < 2) {
      return 'Folder name must be at least 2 characters.';
    }
    if (ILLEGAL_CHARS_REGEX.test(trimmed)) {
      return 'Folder name cannot contain: / \\ : * ? " < > |';
    }
    if (EMOJI_REGEX.test(trimmed)) {
      return 'Folder name cannot contain emojis or special Unicode characters.';
    }
    if (RESERVED_NAMES_REGEX.test(trimmed)) {
      return `Folder name '${trimmed}' is reserved by the operating system and cannot be used.`;
    }
    if (trimmed.length > MAX_PATH_LENGTH) {
      return 'Folder path exceeds maximum length for your operating system.';
    }
    return true;
  }

  parseFolderName(
    folderName: string,
    isJobOrHR: boolean
  ): { label: string; companyName?: string } {
    const trimmed = this.trimFolderName(folderName);
    if (isJobOrHR) {
      const match = trimmed.match(/^(Job|HR)_([^ ].+)$/);
      if (!match) {
        throw new Error(
          `Invalid folder format: '${trimmed}'. Expected format: 'Job_CompanyName' or 'HR_CompanyName' (case-sensitive)`
        );
      }
      return {
        label: match[1],
        companyName: match[2],
      };
    } else {
      const words = trimmed.split(' ');
      const label = words[words.length - 1];
      if (label.length < 2) {
        throw new Error(
          `Invalid folder name: '${trimmed}'. Extracted label '${label}' must be at least 2 characters`
        );
      }
      return { label };
    }
  }

  async createFolder(basePath: string, folderName: string): Promise<string> {
    const trimmed = this.trimFolderName(folderName);
    const validation = this.validateFolderName(trimmed);
    if (validation !== true) {
      throw new Error(validation);
    }
    const fullPath = join(basePath, trimmed);
    try {
      await fs.access(basePath);
    } catch {
      throw new Error(`Parent directory no longer exists: ${basePath}`);
    }
    await fs.mkdir(fullPath);
    return fullPath;
  }

  async isEmptyFolder(folderPath: string): Promise<boolean> {
    const files = await fs.readdir(folderPath);
    const visibleFiles = files.filter((file: string) => {
      if (HIDDEN_FILES.test(file)) return false;
      if (WINDOWS_JUNK_FILES.includes(file)) return false;
      return true;
    });
    return visibleFiles.length === 0;
  }

  async deleteFolder(folderPath: string): Promise<void> {
    await fs.rmdir(folderPath);
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath);
  }

  async checkFolderExists(
    folderName: string,
    basePath: string
  ): Promise<boolean> {
    const trimmed = this.trimFolderName(folderName);
    const files = await fs.readdir(basePath);
    return files.some(
      (file: string) => file.toLowerCase() === trimmed.toLowerCase()
    );
  }
}
