import { injectable, inject } from 'inversify';
import { LinkedInConnection, ContactData } from '../../types';
import { DuplicateDetector } from '../contacts/duplicateDetector';

@injectable()
export class LinkedInMatcher {
  constructor(
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {}

  async findMatch(connection: LinkedInConnection): Promise<ContactData | null> {
    const contacts: ContactData[] =
      await this.duplicateDetector.fetchAllContacts();

    const searchFirstName = connection.firstName.toLowerCase().trim();
    const searchLastName = connection.lastName.toLowerCase().trim();

    const matches = contacts.filter((contact) => {
      const firstName = (contact.firstName || '').toLowerCase().trim();
      const lastName = (contact.lastName || '').toLowerCase().trim();

      // 3.1.1. Match both first name and last name (ignore case) - MATCH EXACTLY.
      if (firstName !== searchFirstName || lastName !== searchLastName) {
        return false;
      }

      // 3.1.2. The google contact have "Connected On:" on the notes.
      const biography = contact.biography || '';
      const hasConnectedOn = biography.includes('Connected On:');
      if (!hasConnectedOn) {
        return false;
      }

      // 3.1.3. The google contact have no emails.
      if (contact.emails && contact.emails.length > 0) {
        return false;
      }

      // 3.1.4. The google contact have no phones.
      if (contact.phones && contact.phones.length > 0) {
        return false;
      }

      // 3.1.5. The google contact don't have Website (URL).
      if (contact.websites && contact.websites.length > 0) {
        return false;
      }

      return true;
    });

    if (matches.length === 1) {
      return matches[0];
    }

    return null;
  }
}
