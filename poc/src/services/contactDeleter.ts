import { google, Auth } from 'googleapis';
import inquirer from 'inquirer';
import ora from 'ora';
import { SETTINGS } from '../settings.js';
import { ApiTracker } from './apiTracker.js';

export class ContactDeleter {
  constructor(private auth: Auth.OAuth2Client) {}
  async deleteAllContacts(): Promise<void> {
    const spinner = ora('Counting contacts...').start();
    try {
      const totalContacts = await this.fetchContactCount();
      spinner.stop();
      if (totalContacts === 0) {
        console.log('\nNo contacts found to delete.\n');
        return;
      }
      console.log(`\nFound ${totalContacts} contact(s) in your Google account.\n`);
      const confirmed = await this.confirmDeletion(totalContacts);
      if (!confirmed) {
        console.log('\nDeletion cancelled.\n');
        return;
      }
      await this.performDeletion(totalContacts);
      console.log('\n✅ All contacts deleted successfully.\n');
    } catch (error) {
      spinner.stop();
      throw error;
    }
  }
  private async fetchContactCount(): Promise<number> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    let totalCount = 0;
    let pageToken: string | undefined;
    do {
      const response = await service.people.connections.list({
        resourceName: 'people/me',
        pageSize: SETTINGS.API_PAGE_SIZE,
        personFields: 'names',
        pageToken,
      });
      await apiTracker.trackRead();
      const connections = response.data.connections || [];
      totalCount += connections.length;
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return totalCount;
  }
  private async confirmDeletion(totalContacts: number): Promise<boolean> {
    const { confirmText } = await inquirer.prompt([
      {
        type: 'input',
        name: 'confirmText',
        message: `⚠️  WARNING: You are about to delete ALL ${totalContacts} contact(s). This action CANNOT be undone!\nType "DELETE ALL" (case-sensitive) to confirm:`,
      },
    ]);
    return confirmText === 'DELETE ALL';
  }
  private async performDeletion(totalContacts: number): Promise<void> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    let deletedCount = 0;
    let pageToken: string | undefined;
    const spinner = ora(`Deleting contacts... 0/${totalContacts}`).start();
    try {
      do {
        const response = await service.people.connections.list({
          resourceName: 'people/me',
          pageSize: SETTINGS.API_PAGE_SIZE,
          personFields: 'names',
          pageToken,
        });
        await apiTracker.trackRead();
        const connections = response.data.connections || [];
        for (const person of connections) {
          if (person.resourceName) {
            try {
              await service.people.deleteContact({
                resourceName: person.resourceName,
              });
              await apiTracker.trackWrite();
              deletedCount++;
              spinner.text = `Deleting contacts... ${deletedCount}/${totalContacts}`;
              await this.delay(100);
            } catch (error: unknown) {
              console.error(`\nFailed to delete contact ${person.resourceName}:`, error instanceof Error ? error.message : 'Unknown error');
            }
          }
        }
        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);
      spinner.succeed(`Deleted ${deletedCount}/${totalContacts} contacts`);
      if (deletedCount < totalContacts) {
        console.log(`\n⚠️  Some deletions failed. Successfully deleted ${deletedCount} out of ${totalContacts} contacts.\n`);
      }
    } catch (error) {
      spinner.fail('Deletion failed');
      throw error;
    }
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
