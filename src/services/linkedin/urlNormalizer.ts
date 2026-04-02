export class UrlNormalizer {
  static normalizeLinkedInUrl(url: string): string {
    let normalized: string = url.trim().toLowerCase();
    normalized = normalized.replace(/^https?:\/\//, '');
    normalized = normalized.replace(/^(www\.|m\.)/, '');
    normalized = normalized.replace(/^linkedin\.com\//, '');
    const queryIndex: number = normalized.indexOf('?');
    if (queryIndex !== -1) {
      normalized = normalized.substring(0, queryIndex);
    }
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  }

  static extractProfileSlug(url: string): string {
    const normalized: string = this.normalizeLinkedInUrl(url);
    const match: RegExpMatchArray | null = normalized.match(/in\/([^/]+)/);
    return match ? match[1] : normalized;
  }

  static isValidPersonalProfile(url: string): boolean {
    const lowerUrl: string = url.toLowerCase();
    return lowerUrl.includes('/in/') && !lowerUrl.includes('/company/');
  }
}
