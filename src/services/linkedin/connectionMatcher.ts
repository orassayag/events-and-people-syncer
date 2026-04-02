import { injectable, inject } from 'inversify';
import {
  LinkedInConnection,
  MatchType,
  MatchResult,
} from '../../types';
import {
  DuplicateDetector,
  DuplicateMatch,
} from '../contacts';
import { UrlNormalizer } from './urlNormalizer';

@injectable()
export class ConnectionMatcher {
  private readonly FUZZY_ACCEPT_THRESHOLD: number = 0.2;
  private readonly FUZZY_WARNING_THRESHOLD: number = 0.4;

  constructor(
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {}

  async match(connection: LinkedInConnection): Promise<MatchResult> {
    const urlMatch: MatchResult | null = await this.matchByLinkedInUrl(
      connection.url
    );
    if (urlMatch) {
      return urlMatch;
    }
    if (connection.email) {
      const emailMatch: MatchResult | null = await this.matchByEmail(
        connection.email
      );
      if (emailMatch) {
        return emailMatch;
      }
    }
    const nameMatch: MatchResult | null = await this.matchByName(
      connection.firstName,
      connection.lastName
    );
    if (nameMatch) {
      return nameMatch;
    }
    return { matchType: MatchType.NONE };
  }

  private async matchByLinkedInUrl(url: string): Promise<MatchResult | null> {
    const normalizedUrl: string = UrlNormalizer.normalizeLinkedInUrl(url);
    const matches: DuplicateMatch[] =
      await this.duplicateDetector.checkDuplicateLinkedInUrl(normalizedUrl);
    if (matches.length === 0) {
      return null;
    }
    if (matches.length > 1) {
      return { matchType: MatchType.UNCERTAIN };
    }
    return {
      matchType: MatchType.EXACT,
      resourceName: matches[0].contact.resourceName,
    };
  }

  private async matchByEmail(email: string): Promise<MatchResult | null> {
    const matches: DuplicateMatch[] =
      await this.duplicateDetector.checkDuplicateEmail(email);
    if (matches.length === 0) {
      return null;
    }
    if (matches.length > 1) {
      return { matchType: MatchType.UNCERTAIN };
    }
    return {
      matchType: MatchType.EXACT,
      resourceName: matches[0].contact.resourceName,
    };
  }

  private async matchByName(
    firstName: string,
    lastName: string
  ): Promise<MatchResult | null> {
    const matches: DuplicateMatch[] =
      await this.duplicateDetector.checkDuplicateName(firstName, lastName);
    if (matches.length === 0) {
      return null;
    }
    if (matches.length > 1) {
      return { matchType: MatchType.UNCERTAIN };
    }
    const match: DuplicateMatch = matches[0];
    const score: number = match.score ?? 1;
    if (score <= this.FUZZY_ACCEPT_THRESHOLD) {
      return {
        matchType: MatchType.FUZZY,
        resourceName: match.contact.resourceName,
        score,
      };
    }
    if (score <= this.FUZZY_WARNING_THRESHOLD) {
      return { matchType: MatchType.UNCERTAIN, score };
    }
    return null;
  }
}
