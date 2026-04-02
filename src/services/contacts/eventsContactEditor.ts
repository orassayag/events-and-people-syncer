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
    let company = '';
    if (prePopulated.company) {
      const result = await inputWithEscape({
        message: `${EMOJIS.FIELDS.COMPANY} Company:`,
        default: prePopulated.company,
        validate: (input: string): boolean | string =>
          InputValidator.validateText(input, true),
      });
      if (result.escaped) {
        throw new Error('User cancelled');
      }
      company = result.value;
    } else {
      const result = await inputWithEscape({
        message: `${EMOJIS.FIELDS.COMPANY} Company:`,
        default: '',
        validate: (input: string): boolean | string =>
          InputValidator.validateText(input, true),
      });
      if (result.escaped) {
        throw new Error('User cancelled');
      }
      company = result.value;
    }
    const trimmedCompany = TextUtils.formatCompanyToPascalCase(company.trim());
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
    const shouldContinueAfterNameCheck = await this.checkAndHandleNameDuplicate(
      firstName,
      lastName
    );
    if (!shouldContinueAfterNameCheck) {
      throw new Error('User cancelled due to duplicate');
    }
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
      const shouldContinueAfterEmailCheck =
        await this.checkAndHandleEmailDuplicate(trimmedEmail);
      if (!shouldContinueAfterEmailCheck) {
        throw new Error('User cancelled due to duplicate');
      }
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
      const shouldContinueAfterPhoneCheck =
        await this.checkAndHandlePhoneDuplicate(trimmedPhone);
      if (!shouldContinueAfterPhoneCheck) {
        throw new Error('User cancelled due to duplicate');
      }
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
      const shouldContinueAfterLinkedInCheck =
        await this.checkAndHandleLinkedInDuplicate(linkedInUrl);
      if (!shouldContinueAfterLinkedInCheck) {
        throw new Error('User cancelled due to duplicate');
      }
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
