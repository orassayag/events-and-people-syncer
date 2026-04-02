import Fuse from 'fuse.js';
import type { FolderMapping, FolderMatch } from '../../types';

export class FolderMatcher {
  private readonly FUZZY_THRESHOLD: number = 0.4;
  findExactMatch(
    input: string,
    folders: FolderMapping[]
  ): FolderMapping | null {
    const inputLower = input.toLowerCase();
    const match = folders.find(
      (folder: FolderMapping) => folder.name.toLowerCase() === inputLower
    );
    return match || null;
  }

  searchFolders(input: string, folders: FolderMapping[]): FolderMatch[] {
    const fuse = new Fuse(folders, {
      keys: ['name'],
      threshold: this.FUZZY_THRESHOLD,
      ignoreLocation: true,
      includeScore: true,
    });
    const results = fuse.search(input);
    return results.map((result) => ({
      folder: result.item,
      score: result.score || 0,
    }));
  }
}
