import { injectable } from 'inversify';
import { readFile } from 'fs/promises';
import { HibobContact, ContactType } from '../../types';
import { SETTINGS } from '../../settings';
import { Logger } from '../../logging';
import { RegexPatterns } from '../../regex';
import { validateAndResolveFilePath } from '../../utils';
import { FormatUtils } from '../../constants';

@injectable()
export class HibobExtractor {
  private logger: Logger = new Logger('HibobExtractor');
  async extract(): Promise<HibobContact[]> {
    const filePath = await validateAndResolveFilePath(SETTINGS.hibob.filePath);
    this.logger.info(`Reading HiBob file: ${filePath}`);
    const fileContent = await readFile(filePath, 'utf-8');
    if (fileContent.startsWith('\uFEFF')) {
      throw new Error(
        'File contains UTF-8 BOM. Please save as UTF-8 without BOM.'
      );
    }
    if (
      fileContent.startsWith('\uFFFE') ||
      fileContent.startsWith('\uFEFF\u0000')
    ) {
      throw new Error(
        'File contains UTF-16 BOM. Please save as UTF-8 without BOM.'
      );
    }
    const allContacts: HibobContact[] = [];
    const lines = fileContent.split('\n');
    let currentLine = 0;
    while (currentLine < lines.length) {
      const line = lines[currentLine].trim();
      if (!line) {
        currentLine++;
        continue;
      }
      if (line.startsWith('[')) {
        const jsonResult = this.parseJsonSection(lines, currentLine);
        allContacts.push(...jsonResult.contacts);
        currentLine = jsonResult.nextLine;
      } else {
        const lineContacts = this.parseSimpleLine(line, currentLine + 1);
        allContacts.push(...lineContacts);
        currentLine++;
      }
    }
    this.logger.info(
      `Extracted ${FormatUtils.formatNumberWithLeadingZeros(allContacts.length)} contacts before deduplication`
    );
    const uniqueContacts = this.deduplicateContacts(allContacts);
    console.log('');
    this.logger.info(
      `After deduplication: ${FormatUtils.formatNumberWithLeadingZeros(uniqueContacts.length)} unique contacts`
    );
    return uniqueContacts;
  }

  private parseSimpleLine(line: string, lineNumber: number): HibobContact[] {
    const entries = line
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e);
    const contacts: HibobContact[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) {
        continue;
      }
      try {
        const contact = this.parseSimpleEntry(entry);
        if (contact) {
          contacts.push(contact);
        }
      } catch {
        this.logger.info(
          `Skipped problematic entry at line ${lineNumber}, position ${i + 1}: ${entry}`
        );
      }
    }
    return contacts;
  }

  private parseSimpleEntry(entry: string): HibobContact | null {
    const normalized = entry
      .replace(RegexPatterns.HIBOB_MULTIPLE_SPACES, ' ')
      .trim();
    let firstName = '';
    let lastName = '';
    let email = '';
    const nicknameMatch = normalized.match(
      RegexPatterns.HIBOB_NAME_WITH_NICKNAME
    );
    if (nicknameMatch) {
      firstName = nicknameMatch[1].trim();
      lastName = `${nicknameMatch[2].trim()} ${nicknameMatch[3].trim()}`.trim();
      email = nicknameMatch[4].trim();
    } else {
      const parensMatch = normalized.match(
        RegexPatterns.HIBOB_NAME_WITH_PARENS_EMAIL
      );
      if (parensMatch) {
        const namePart = parensMatch[1].trim();
        email = parensMatch[2].trim();
        const nameParts = namePart.split(/\s+/);
        if (nameParts.length >= 2) {
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        } else {
          firstName = namePart;
        }
      } else {
        const spaceMatch = normalized.match(
          RegexPatterns.HIBOB_NAME_WITH_SPACE_EMAIL
        );
        if (spaceMatch) {
          const namePart = spaceMatch[1].trim();
          email = spaceMatch[2].trim();
          const nameParts = namePart.split(/\s+/);
          if (nameParts.length >= 2) {
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
          } else {
            firstName = namePart;
          }
        } else {
          const emailMatch = normalized.match(
            RegexPatterns.HIBOB_EMAIL_IN_STRING
          );
          if (emailMatch) {
            email = emailMatch[1].trim();
            const nameBeforeEmail = normalized
              .replace(emailMatch[0], '')
              .trim();
            if (nameBeforeEmail) {
              const nameParts = nameBeforeEmail.split(/\s+/);
              if (nameParts.length >= 2) {
                firstName = nameParts[0];
                lastName = nameParts.slice(1).join(' ');
              } else {
                firstName = nameBeforeEmail;
              }
            }
          }
        }
      }
    }
    if (!firstName && !email) {
      return null;
    }
    if (!firstName && email) {
      return null;
    }
    firstName = firstName.replace(/^-+/, '').trim();
    if (lastName) {
      lastName = lastName.replace(/^-+/, '').trim();
    }
    if (!firstName) {
      return null;
    }
    const hasHebrew =
      RegexPatterns.HEBREW.test(firstName) ||
      (lastName ? RegexPatterns.HEBREW.test(lastName) : false);
    if (hasHebrew) {
      this.logger.debug(
        `Hebrew/RTL text detected in name: ${firstName} ${lastName || ''}`
      );
    }
    return {
      type: ContactType.HIBOB,
      firstName,
      lastName: lastName || undefined,
      email: email || undefined,
    };
  }

  private parseJsonSection(
    lines: string[],
    startLine: number
  ): { contacts: HibobContact[]; nextLine: number } {
    let jsonContent = '';
    let currentLine = startLine;
    let bracketCount = 0;
    let inArray = false;
    while (currentLine < lines.length) {
      const line = lines[currentLine];
      for (const char of line) {
        if (char === '[') {
          bracketCount++;
          inArray = true;
        } else if (char === ']') {
          bracketCount--;
        }
      }
      jsonContent += line;
      currentLine++;
      if (inArray && bracketCount === 0) {
        break;
      }
    }
    const contacts: HibobContact[] = [];
    try {
      const parsed = JSON.parse(jsonContent);
      if (Array.isArray(parsed)) {
        this.logger.info(
          `Processing JSON array with ${FormatUtils.formatNumberWithLeadingZeros(parsed.length)} objects`
        );
        for (let i = 0; i < parsed.length; i++) {
          const obj = parsed[i];
          try {
            const contact = this.parseJsonObject(obj);
            if (contact) {
              contacts.push(contact);
            }
          } catch (error) {
            this.logger.error(
              `Skipped malformed JSON object at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              undefined
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to parse JSON array: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined
      );
    }
    return { contacts, nextLine: currentLine };
  }

  private parseJsonObject(obj: any): HibobContact | null {
    const displayName = obj.displayName?.trim();
    const firstName = obj.firstName?.trim();
    const surname = obj.surname?.trim();
    const email = obj.email?.trim();
    let finalFirstName = '';
    let finalLastName = '';
    if (displayName) {
      const nameParts = displayName.split(/\s+/);
      if (nameParts.length >= 2) {
        finalFirstName = nameParts[0];
        finalLastName = nameParts.slice(1).join(' ');
      } else {
        finalFirstName = displayName;
      }
    } else if (firstName) {
      finalFirstName = firstName;
      finalLastName = surname || '';
    } else {
      return null;
    }
    if (!finalFirstName) {
      return null;
    }
    finalFirstName = finalFirstName.replace(/^-+/, '').trim();
    if (finalLastName) {
      finalLastName = finalLastName.replace(/^-+/, '').trim();
    }
    if (!finalFirstName) {
      return null;
    }
    const hasHebrew =
      RegexPatterns.HEBREW.test(finalFirstName) ||
      (finalLastName ? RegexPatterns.HEBREW.test(finalLastName) : false);
    if (hasHebrew) {
      this.logger.debug(
        `Hebrew/RTL text detected in name: ${finalFirstName} ${finalLastName || ''}`
      );
    }
    return {
      type: ContactType.HIBOB,
      firstName: finalFirstName,
      lastName: finalLastName || undefined,
      email:
        email && email.length > 0 && email.trim().length > 0
          ? email
          : undefined,
    };
  }

  private deduplicateContacts(contacts: HibobContact[]): HibobContact[] {
    const emailMap = new Map<string, HibobContact>();
    const emailToNamesMap = new Map<string, string>();
    const skippedEmailDuplicates: Array<{ name: string; email: string }> = [];
    for (const contact of contacts) {
      if (contact.email) {
        const key = `email:${contact.email.trim().toLowerCase()}`;
        if (!emailMap.has(key)) {
          emailMap.set(key, contact);
          const nameKey = `${contact.firstName.trim().toLowerCase()}|${contact.lastName?.trim().toLowerCase() || ''}`;
          emailToNamesMap.set(key, nameKey);
        } else {
          skippedEmailDuplicates.push({
            name: `${contact.firstName} ${contact.lastName || ''}`.trim(),
            email: contact.email,
          });
        }
      }
    }
    const nameOnlyContacts: HibobContact[] = [];
    const nameMap = new Map<string, HibobContact>();
    const skippedNameDuplicates: string[] = [];
    for (const contact of contacts) {
      if (!contact.email) {
        const nameKey = `${contact.firstName.trim().toLowerCase()}|${contact.lastName?.trim().toLowerCase() || ''}`;
        for (const [emailKey, trackedName] of emailToNamesMap.entries()) {
          if (trackedName === nameKey) {
            this.logger.warn(
              `Contact '${contact.firstName} ${contact.lastName || ''}' (name-only) might be duplicate of contact with email '${emailKey.replace('email:', '')}' - including both for user review`
            );
            break;
          }
        }
        const key = `name:${nameKey}`;
        if (!nameMap.has(key)) {
          nameMap.set(key, contact);
          nameOnlyContacts.push(contact);
        } else {
          skippedNameDuplicates.push(
            `${contact.firstName} ${contact.lastName || ''}`.trim()
          );
        }
      }
    }
    if (skippedEmailDuplicates.length > 0) {
      this.logger.info(
        `Skipped duplicates by email (${FormatUtils.formatNumberWithLeadingZeros(skippedEmailDuplicates.length)})`
      );
      console.log('');
      for (const dup of skippedEmailDuplicates) {
        this.logger.info(`${dup.name} - email - ${dup.email}`);
      }
    }
    if (skippedNameDuplicates.length > 0) {
      this.logger.info(
        `Skipped duplicates by name (${FormatUtils.formatNumberWithLeadingZeros(skippedNameDuplicates.length)})`
      );
      console.log('');
      for (const name of skippedNameDuplicates) {
        this.logger.info(`${name} - name match`);
      }
    }
    return [...emailMap.values(), ...nameOnlyContacts];
  }
}
