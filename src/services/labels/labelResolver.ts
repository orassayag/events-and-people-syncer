import { google } from 'googleapis';
import { injectable, inject } from 'inversify';
import type { OAuth2Client, ContactGroup, LabelResolutionResult } from '../../types';
import { ApiTracker } from '../api';
import { retryWithBackoff, DryModeChecker, DryModeMocks } from '../../utils';
import { Logger } from '../../logging';
import { SETTINGS } from '../../settings';

export { LabelResolutionResult };

@injectable()
export class LabelResolver {
  private logApiStats: boolean = false;
  private uiLogger?: Logger;

  constructor(@inject('OAuth2Client') private auth: OAuth2Client) {}

  setApiLogging(enabled: boolean): void {
    this.logApiStats = enabled;
  }

  setUiLogger(logger: Logger): void {
    this.uiLogger = logger;
  }

  resolveLabel(
    labelName: string,
    required: boolean,
    contactGroups: ContactGroup[]
  ): LabelResolutionResult {
    const existing = contactGroups.find(
      (group: ContactGroup) => group.name === labelName
    );
    if (existing) {
      return {
        resourceName: existing.resourceName,
        created: false,
      };
    }
    if (required) {
      throw new Error(
        `Required label '${labelName}' does not exist. Please create it in Google Contacts first.`
      );
    }
    return {
      resourceName: '',
      created: false,
    };
  }

  inferLabelFromExisting(
    folderName: string,
    contactGroups: ContactGroup[]
  ): string | null {
    const words = folderName.trim().split(' ');
    for (const word of words) {
      const match = contactGroups.find(
        (group: ContactGroup) => group.name === word
      );
      if (match) {
        return match.name;
      }
    }
    return null;
  }

  async createLabel(name: string): Promise<string> {
    const apiTracker = ApiTracker.getInstance();
    if (SETTINGS.dryMode) {
      const prefixedName = `[DRY-MODE] ${name}`;
      DryModeChecker.logApiCall(
        'service.contactGroups.create()',
        `Group: ${prefixedName}`,
        this.uiLogger
      );
      const mockResourceName = DryModeMocks.createGroupResponse(prefixedName);
      await apiTracker.trackWrite();
      if (this.logApiStats && this.uiLogger) {
        await apiTracker.logStats(this.uiLogger);
      }
      return mockResourceName;
    }
    const service = google.people({ version: 'v1', auth: this.auth });
    const response = await retryWithBackoff(async () => {
      return await service.contactGroups.create({
        requestBody: {
          contactGroup: {
            name,
          },
        },
      });
    });
    await apiTracker.trackWrite();
    if (this.logApiStats && this.uiLogger) {
      await apiTracker.logStats(this.uiLogger);
    }
    return response.data.resourceName!;
  }
}
