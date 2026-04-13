import { promises as fs } from 'fs';
import { join } from 'path';
import { formatDateDDMMYYYYCompact } from '../../utils';

const NOTE_PATTERN_REGEX = /^notes_\d{8}-\d+\.txt$/;
const MAX_NOTE_LENGTH = 1048576;

export class NoteWriter {
  async getNextFileName(folderPath: string, date: Date): Promise<string> {
    const dateStr = formatDateDDMMYYYYCompact(date);
    const files = await fs.readdir(folderPath);
    const matchingFiles = files.filter(
      (file: string) =>
        NOTE_PATTERN_REGEX.test(file) && file.startsWith(`notes_${dateStr}-`)
    );
    if (matchingFiles.length === 0) {
      return `notes_${dateStr}-1.txt`;
    }
    let maxCounter = 0;
    for (const file of matchingFiles) {
      const match = file.match(/notes_\d{8}-(\d+)\.txt$/);
      if (match) {
        const counter = parseInt(match[1], 10);
        if (counter > maxCounter) {
          maxCounter = counter;
        }
      }
    }
    return `notes_${dateStr}-${maxCounter + 1}.txt`;
  }

  async writeNote(
    folderPath: string,
    content: string,
    date: Date
  ): Promise<string> {
    if (content.length > MAX_NOTE_LENGTH) {
      throw new Error('Message cannot exceed 1MB (~1,048,576 characters).');
    }
    if (content.includes('\0')) {
      throw new Error('Note content cannot contain binary data (null bytes).');
    }
    try {
      await fs.access(folderPath);
    } catch {
      throw new Error(`Folder no longer exists: ${folderPath}`);
    }
    const fileName = await this.getNextFileName(folderPath, date);
    const filePath = join(folderPath, fileName);
    try {
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (_error: unknown) {
      throw new Error('Failed to write note file - check permissions');
    }
    return filePath;
  }

  async deleteNote(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  async listNotes(folderPath: string): Promise<string[]> {
    const files = await fs.readdir(folderPath);
    const noteFiles = files.filter((file: string) =>
      NOTE_PATTERN_REGEX.test(file)
    );
    return noteFiles.sort();
  }

  async rewriteNote(filePath: string, content: string): Promise<void> {
    if (content.length > MAX_NOTE_LENGTH) {
      throw new Error('Message cannot exceed 1MB (~1,048,576 characters).');
    }
    if (content.includes('\0')) {
      throw new Error('Note content cannot contain binary data (null bytes).');
    }
    await fs.writeFile(filePath, content, 'utf-8');
  }
}
