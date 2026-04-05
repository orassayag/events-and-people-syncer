import {
  confirmWithEscape,
  inputWithEscape,
  TextUtils,
} from '../../utils';
import { injectable, inject } from 'inversify';
import type { OAuth2Client, EditableContactData, ContactGroup, PrePopulatedData } from '../../types';
import { ContactEditor } from './contactEditor';
import { DuplicateDetector } from './duplicateDetector';
import { InputValidator } from '../../validators';
import { EMOJIS } from '../../constants';

@injectable()
export class EventsContactEditor extends ContactEditor {
  constructor(
    @inject('OAuth2Client') auth: OAuth2Client,
    @inject(DuplicateDetector) duplicateDetector: DuplicateDetector
  ) {
    super(auth, duplicateDetector);
  }

  async collectInitialInput(
    prePopulated?: PrePopulatedData
  ): Promise<EditableContactData> {
    if (!prePopulated || Object.keys(prePopulated).length === 0) {
      return super.collectInitialInput();
    }
    let labelResourceNames: string[] = [];
    if (
      prePopulated.labelResourceNames &&
      prePopulated.labelResourceNames.length > 0
    ) {
      if (prePopulated.skipLabelConfirmation) {
        labelResourceNames = prePopulated.labelResourceNames;
      } else {
        const allGroups = await this.fetchContactGroups();
        const prePopulatedLabels = prePopulated.labelResourceNames
          .map((resourceName: string) => {
            const group = allGroups.find(
              (g: ContactGroup) => g.resourceName === resourceName
            );
            return group ? group.name : '';
          })
          .filter((name: string) => name);
        const result = await confirmWithEscape({
          message: `${EMOJIS.FIELDS.LABEL} Use suggested labels: ${prePopulatedLabels.join(', ')}?`,
          default: true,
        });
        if (result.escaped) {
          throw new Error('User cancelled');
        }
        const shouldUsePrePopulatedLabels = result.value;
        if (shouldUsePrePopulatedLabels) {
          labelResourceNames = prePopulated.labelResourceNames;
        } else {
          labelResourceNames = await this.promptForLabels();
        }
      }
    } else {
      labelResourceNames = await this.promptForLabels();
    }
    const fullNameResult = await inputWithEscape({
      message: `${EMOJIS.FIELDS.PERSON} Full name:`,
      default: '',
      validate: (input: string): boolean | string => {
        if (!input.trim()) {
          return 'Full name is required and cannot be empty.';
        }
        return InputValidator.validateText(input, false);
      },
    });
    if (fullNameResult.escaped) {
      throw new Error('User cancelled');
    }
    const fullName = fullNameResult.value;
    const { firstName, lastName } = TextUtils.parseFullName(fullName);
    
    // This will throw ExistingContactSelected if user selects an existing contact
    await this.checkAndHandleNameDuplicate(firstName, lastName);

    let company = '';
    const suggestedCompany = prePopulated.company || '';
    const companyResult = await inputWithEscape({
      message: `${EMOJIS.FIELDS.COMPANY} Company:`,
      default: suggestedCompany,
      validate: (input: string): boolean | string =>
        InputValidator.validateText(input, true),
    });
    if (companyResult.escaped) {
      throw new Error('User cancelled');
    }
    company = companyResult.value;
    const trimmedCompany = TextUtils.formatCompanyToPascalCase(company.trim());

    const jobTitleResult = await inputWithEscape({
      message: `${EMOJIS.FIELDS.JOB_TITLE} Job Title:`,
      default: '',
      validate: (input: string): boolean | string =>
        InputValidator.validateText(input, true),
    });
    if (jobTitleResult.escaped) {
      throw new Error('User cancelled');
    }
    const jobTitle = jobTitleResult.value;

    const emails: string[] = [];
    const emailResult = await inputWithEscape({
      message: `${EMOJIS.FIELDS.EMAIL} Email address:`,
      default: '',
      validate: (input: string): boolean | string =>
        InputValidator.validateEmail(input, true),
    });
    if (emailResult.escaped) {
      throw new Error('User cancelled');
    }
    const emailValue = emailResult.value;
    if (emailValue.trim()) {
      const trimmedEmail = emailValue.trim();
      await this.checkAndHandleEmailDuplicate(trimmedEmail);
      emails.push(trimmedEmail);
    }

    const phones: string[] = [];
    const phoneResult = await inputWithEscape({
      message: `${EMOJIS.FIELDS.PHONE} Phone number:`,
      default: '',
      validate: InputValidator.validatePhone,
    });
    if (phoneResult.escaped) {
      throw new Error('User cancelled');
    }
    const phoneNumber = phoneResult.value;
    if (phoneNumber.trim()) {
      const trimmedPhone = phoneNumber.trim();
      await this.checkAndHandlePhoneDuplicate(trimmedPhone);
      phones.push(trimmedPhone);
    }
    let linkedInUrl: string | undefined;
    const linkedInResult = await inputWithEscape({
      message: `${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL:`,
      default: '',
      validate: InputValidator.validateLinkedInUrl,
    });
    if (linkedInResult.escaped) {
      throw new Error('User cancelled');
    }
    const linkedInUrlInput = linkedInResult.value;
    if (linkedInUrlInput.trim()) {
      linkedInUrl = InputValidator.normalizeLinkedInUrl(linkedInUrlInput);
      await this.checkAndHandleLinkedInDuplicate(linkedInUrl);
    }
    return {
      firstName,
      lastName,
      company: trimmedCompany,
      jobTitle: jobTitle.trim() || undefined,
      emails,
      phones,
      linkedInUrl,
      labelResourceNames,
    };
  }
}
