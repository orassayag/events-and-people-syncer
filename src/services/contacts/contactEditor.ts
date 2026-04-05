import { google } from 'googleapis';
import {
  selectWithEscape,
  inputWithEscape,
  checkboxWithEscape,
  TextUtils,
  retryWithBackoff,
  DryModeChecker,
  DryModeMocks,
} from '../../utils';
import ora from 'ora';
import { injectable, inject } from 'inversify';
import type { ContactData, OAuth2Client, ContactGroup, CreateContactRequest, EditableContactData } from '../../types';
import { ApiTracker } from '../api';
import { DuplicateDetector } from './duplicateDetector';
import { PhoneNormalizer } from './phoneNormalizer';
import { EmailNormalizer } from './emailNormalizer';
import { InputValidator } from '../../validators';
import { SETTINGS } from '../../settings';
import { ContactCache } from '../../cache';
import { Logger } from '../../logging';
import { EMOJIS } from '../../constants';
import { ExistingContactSelected } from '../../errors';

export { EditableContactData };

@injectable()
export class ContactEditor {
  private cachedContactGroups: ContactGroup[] | null = null;
  private fetchInProgress: Promise<ContactGroup[]> | null = null;
  private logApiStats: boolean = false;
  private uiLogger = new Logger('ContactEditor');

  constructor(
    @inject('OAuth2Client') private auth: OAuth2Client,
    @inject(DuplicateDetector) private duplicateDetector: DuplicateDetector
  ) {}

  setApiLogging(enabled: boolean): void {
    this.logApiStats = enabled;
    this.duplicateDetector.setApiLogging(enabled);
    this.duplicateDetector.setUiLogger(this.uiLogger);
  }

  setLogCallback(callback: (message: string) => Promise<void>): void {
    this.logCallback = callback;
    this.duplicateDetector.setLogCallback(callback);
  }

  private logCallback?: (message: string) => Promise<void>;

  clearCache(): void {
    this.cachedContactGroups = null;
    this.fetchInProgress = null;
    this.uiLogger.debug('Contact groups cache cleared');
  }

  private async log(message: string): Promise<void> {
    if (this.logCallback) {
      await this.logCallback(message);
    }
  }

  protected async checkAndHandleNameDuplicate(
    firstName: string,
    lastName: string
  ): Promise<boolean> {
    if (!firstName || !lastName) return true;
    const nameDuplicates = await this.duplicateDetector.checkDuplicateName(firstName, lastName);
    const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(nameDuplicates, this.uiLogger);
    if (result === null) return false;                          // user escaped
    if (result.action === 'use_existing') throw new ExistingContactSelected(result.contact);
    return true;                                               // 'create_new'
  }

  protected async checkAndHandleEmailDuplicate(
    email: string
  ): Promise<boolean> {
    const emailDuplicates = await this.duplicateDetector.checkDuplicateEmail(email);
    const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(emailDuplicates, this.uiLogger);
    if (result === null) return false;
    if (result.action === 'use_existing') throw new ExistingContactSelected(result.contact);
    return true;
  }

  protected async checkAndHandlePhoneDuplicate(
    phone: string
  ): Promise<boolean> {
    const phoneDuplicates = await this.duplicateDetector.checkDuplicatePhone(phone);
    const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(phoneDuplicates, this.uiLogger);
    if (result === null) return false;
    if (result.action === 'use_existing') throw new ExistingContactSelected(result.contact);
    return true;
  }

  protected async checkAndHandleLinkedInDuplicate(
    url: string
  ): Promise<boolean> {
    const linkedInDuplicates = await this.duplicateDetector.checkDuplicateLinkedInUrl(url);
    const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(linkedInDuplicates, this.uiLogger);
    if (result === null) return false;
    if (result.action === 'use_existing') throw new ExistingContactSelected(result.contact);
    return true;
  }

  async collectInitialInput(
    prePopulatedData?: Partial<EditableContactData>
  ): Promise<EditableContactData> {
    const labelResourceNames = prePopulatedData?.labelResourceNames?.length
      ? prePopulatedData.labelResourceNames
      : await this.promptForLabels();
    const defaultCompany = prePopulatedData?.company || '';
    const companyResult = await inputWithEscape({
      message: `${EMOJIS.FIELDS.COMPANY} Company:`,
      default: defaultCompany,
      validate: (input: string): boolean | string =>
        InputValidator.validateText(input, true),
    });
    if (companyResult.escaped) {
      throw new Error('User cancelled');
    }
    const company = companyResult.value;
    const trimmedCompany = TextUtils.formatCompanyToPascalCase(company.trim());
    const defaultFirstName = prePopulatedData?.firstName || '';
    const defaultLastName = prePopulatedData?.lastName || '';
    const defaultFullName = `${defaultFirstName} ${defaultLastName}`.trim();
    const fullNameResult = await inputWithEscape({
      message: `${EMOJIS.FIELDS.PERSON} Full name:`,
      default: defaultFullName,
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
    if (firstName && lastName) {
      const nameDuplicates = await this.duplicateDetector.checkDuplicateName(
        firstName,
        lastName
      );
      const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(
        nameDuplicates,
        this.uiLogger
      );
      if (result === null) {
        throw new Error('User cancelled');
      }
      if (result.action === 'use_existing') {
        throw new ExistingContactSelected(result.contact);
      }
    }
    const defaultJobTitle = prePopulatedData?.jobTitle || '';
    const jobTitleResult = await inputWithEscape({
      message: `${EMOJIS.FIELDS.JOB_TITLE} Job Title:`,
      default: defaultJobTitle,
      validate: (input: string): boolean | string =>
        InputValidator.validateText(input, true),
    });
    if (jobTitleResult.escaped) {
      throw new Error('User cancelled');
    }
    const jobTitle = jobTitleResult.value;
    const emails: string[] = prePopulatedData?.emails?.slice() || [];
    if (emails.length === 0) {
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
        const emailDuplicates =
          await this.duplicateDetector.checkDuplicateEmail(trimmedEmail);
        const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(
          emailDuplicates,
          this.uiLogger
        );
        if (result === null) {
          throw new Error('User cancelled');
        }
        if (result.action === 'use_existing') {
          throw new ExistingContactSelected(result.contact);
        }
        emails.push(trimmedEmail);
      }
    }
    const phones: string[] = prePopulatedData?.phones?.slice() || [];
    if (phones.length === 0) {
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
        const phoneDuplicates =
          await this.duplicateDetector.checkDuplicatePhone(trimmedPhone);
        const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(
          phoneDuplicates,
          this.uiLogger
        );
        if (result === null) {
          throw new Error('User cancelled');
        }
        if (result.action === 'use_existing') {
          throw new ExistingContactSelected(result.contact);
        }
        phones.push(trimmedPhone);
      }
    }
    let linkedInUrl: string | undefined = prePopulatedData?.linkedInUrl;
    if (!linkedInUrl) {
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
        const linkedInDuplicates =
          await this.duplicateDetector.checkDuplicateLinkedInUrl(linkedInUrl);
        const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(
          linkedInDuplicates,
          this.uiLogger
        );
        if (result === null) {
          throw new Error('User cancelled');
        }
        if (result.action === 'use_existing') {
          throw new ExistingContactSelected(result.contact);
        }
      }
    }
    return {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company: trimmedCompany,
      jobTitle: jobTitle.trim(),
      emails,
      phones,
      linkedInUrl,
      labelResourceNames,
    };
  }

  async showSummaryAndEdit(
    data: EditableContactData,
    actionVerb: 'Create' | 'Save' = 'Create',
    isSyncFlow: boolean = false,
    syncMetadata?: {
      reason: string;
      currentIndex: number;
      totalCount: number;
      resourceName: string;
    }
  ): Promise<EditableContactData | null> {
    let editableData = { ...data };
    const initialData = JSON.stringify(data);
    while (true) {
      const currentAllGroups = await this.fetchContactGroups();
      const currentSelectedLabelNames = editableData.labelResourceNames.map(
        (resourceName) => {
          const group = currentAllGroups.find(
            (g) => g.resourceName === resourceName
          );
          return group ? group.name : resourceName;
        }
      );
      const firstLabelName =
        currentSelectedLabelNames.length > 0
          ? currentSelectedLabelNames[0]
          : '';

      // Intelligent composite suffix for display
      const compositeSuffix = (editableData.company && firstLabelName && editableData.company.startsWith(firstLabelName))
        ? editableData.company
        : [firstLabelName, editableData.company].filter(s => s).join(' ');

      const displaySuffix = compositeSuffix
        ? TextUtils.reverseHebrewText(compositeSuffix)
        : '';
      const displayFirstName = editableData.firstName
        ? TextUtils.reverseHebrewText(editableData.firstName)
        : '';
      
      const baseLastName = this.extractBaseLastName(editableData.lastName, firstLabelName, editableData.company);
      const displayBaseLastName = baseLastName ? TextUtils.reverseHebrewText(baseLastName) : '';
      const cleanFullName = `${displayFirstName} ${displayBaseLastName}`.trim();

      const fullNameWithLabel = cleanFullName
        ? `${cleanFullName} ${displaySuffix}`.trim()
        : '';

      if (syncMetadata) {
        const { FormatUtils } = await import('../../constants/formatUtils');
        console.log('');
        console.log(`${EMOJIS.DATA.REASON}  Reason: ${syncMetadata.reason}`);
        console.log(
          `${EMOJIS.DATA.INDEX} Contact Index: ${FormatUtils.formatNumberWithLeadingZeros(syncMetadata.currentIndex)}/${FormatUtils.formatNumberWithLeadingZeros(syncMetadata.totalCount)}`
        );
        console.log(
          `${EMOJIS.DATA.ID} Contact ID: ${syncMetadata.resourceName}\n`
        );
      } else {
        console.log('\n--- Contact Summary ---');
      }
      console.log(`${EMOJIS.FIELDS.PERSON} Full name: ${fullNameWithLabel}`);
      if (currentSelectedLabelNames.length > 0) {
        const displayLabelNames = currentSelectedLabelNames.map((name) =>
          TextUtils.reverseHebrewText(name)
        );
        console.log(
          `${EMOJIS.FIELDS.LABEL}  Labels: ${displayLabelNames.join(' | ')}`
        );
      } else {
        console.log(`${EMOJIS.FIELDS.LABEL}  Labels: `);
      }
      
      console.log(`${EMOJIS.FIELDS.COMPANY} Company: ${displaySuffix}`);
      const displayJobTitle = editableData.jobTitle
        ? TextUtils.reverseHebrewText(editableData.jobTitle)
        : '';
      console.log(`${EMOJIS.FIELDS.JOB_TITLE} Job Title: ${displayJobTitle}`);
      
      if (editableData.emails.length === 1) {
        const displayEmail = TextUtils.reverseHebrewText(
          editableData.emails[0]
        );
        console.log(`${EMOJIS.FIELDS.EMAIL} Email: ${displayEmail} ${displaySuffix}`);
      } else if (editableData.emails.length > 1) {
        console.log(`${EMOJIS.FIELDS.EMAIL} Emails:`);
        editableData.emails.forEach((email) => {
          const displayEmail = TextUtils.reverseHebrewText(email);
          console.log(`  ${displayEmail} ${displaySuffix}`);
        });
      } else {
        console.log(`${EMOJIS.FIELDS.EMAIL} Email: `);
      }
      if (editableData.phones.length === 1) {
        const displayPhone = TextUtils.reverseHebrewText(
          editableData.phones[0]
        );
        console.log(`${EMOJIS.FIELDS.PHONE} Phone: ${displayPhone} ${displaySuffix}`);
      } else if (editableData.phones.length > 1) {
        console.log(`${EMOJIS.FIELDS.PHONE} Phones:`);
        editableData.phones.forEach((phone) => {
          const displayPhone = TextUtils.reverseHebrewText(phone);
          console.log(`  ${displayPhone} ${displaySuffix}`);
        });
      } else {
        console.log(`${EMOJIS.FIELDS.PHONE} Phone: `);
      }
      if (editableData.linkedInUrl) {
        console.log(
          `${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL: ${editableData.linkedInUrl} LinkedIn`
        );
      } else {
        console.log(`${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL: `);
      }
      console.log('');
      const validationResult =
        InputValidator.validateMinimumRequirements(editableData);
      const fieldLimitsResult =
        InputValidator.validateFieldLimits(editableData);
      const isValid = validationResult === true && fieldLimitsResult === true;
      if (!isValid) {
        const errorMessage =
          validationResult !== true ? validationResult : fieldLimitsResult;
        console.log(`${EMOJIS.STATUS.WARNING}  ${errorMessage}\n`);
      }
      const currentData = JSON.stringify(editableData);
      const hasChanges = currentData !== initialData;
      const choices = [];
      if (isSyncFlow) {
        choices.push({
          name: `${EMOJIS.NAVIGATION.SKIP_ARROW}  Skip to next contact`,
          value: 'skip',
        });
      }
      if (isValid && (actionVerb === 'Create' || hasChanges)) {
        choices.push({
          name: `${EMOJIS.STATUS.SUCCESS} ${actionVerb} contact`,
          value: 'save',
        });
      }
      choices.push(
        { name: `${EMOJIS.FIELDS.LABEL}  Edit labels`, value: 'edit_labels' },
        {
          name: `${EMOJIS.FIELDS.LABEL}  Add existing label`,
          value: 'add_existing_label',
        },
        {
          name: `${EMOJIS.FIELDS.LABEL}  Create new label`,
          value: 'create_label',
        },
        { name: `${EMOJIS.FIELDS.LABEL}  Remove label`, value: 'remove_label' }
      );
      if (editableData.labelResourceNames.length > 1) {
        choices.push({
          name: `${EMOJIS.FIELDS.LABEL}  Order labels`,
          value: 'order_labels',
        });
      }
      choices.push(
        {
          name: `${EMOJIS.FIELDS.COMPANY} Edit company`,
          value: 'edit_company',
        },
        {
          name: `${EMOJIS.FIELDS.COMPANY} Remove company`,
          value: 'remove_company',
        },
        {
          name: `${EMOJIS.FIELDS.PERSON} Edit full name`,
          value: 'edit_fullName',
        },
        {
          name: `${EMOJIS.FIELDS.JOB_TITLE} Edit job title`,
          value: 'edit_jobTitle',
        },
        {
          name: `${EMOJIS.FIELDS.JOB_TITLE} Remove job title`,
          value: 'remove_jobTitle',
        }
      );
      if (editableData.emails.length > 0) {
        choices.push({
          name: `${EMOJIS.FIELDS.EMAIL} Edit email`,
          value: 'edit_email',
        });
      }
      choices.push({
        name: `${EMOJIS.FIELDS.EMAIL} Add email`,
        value: 'add_email',
      });
      if (editableData.emails.length > 0) {
        choices.push({
          name: `${EMOJIS.FIELDS.EMAIL} Remove email`,
          value: 'remove_email',
        });
      }
      if (editableData.phones.length > 0) {
        choices.push({
          name: `${EMOJIS.FIELDS.PHONE} Edit phone`,
          value: 'edit_phone',
        });
      }
      choices.push({
        name: `${EMOJIS.FIELDS.PHONE} Add phone`,
        value: 'add_phone',
      });
      if (editableData.phones.length > 0) {
        choices.push({
          name: `${EMOJIS.FIELDS.PHONE} Remove phone`,
          value: 'remove_phone',
        });
      }
      if (editableData.linkedInUrl) {
        choices.push({
          name: `${EMOJIS.FIELDS.LINKEDIN} Edit LinkedIn URL`,
          value: 'edit_linkedIn',
        });
        choices.push({
          name: `${EMOJIS.FIELDS.LINKEDIN} Remove LinkedIn URL`,
          value: 'remove_linkedIn',
        });
      } else {
        choices.push({
          name: `${EMOJIS.FIELDS.LINKEDIN} Add LinkedIn URL`,
          value: 'add_linkedIn',
        });
      }
      choices.push({ name: `${EMOJIS.STATUS.ERROR} Cancel`, value: 'cancel' });
      await this.log('? What would you like to do now? (Use arrow keys)');
      for (const choice of choices) {
        await this.log(`  ${choice.name}`);
      }
      const result = await selectWithEscape<string>({
        message: 'What would you like to do now?',
        loop: false,
        choices,
      });
      if (result.escaped) {
        throw new Error('User cancelled');
      }
      const action = result.value;
      const selectedChoice = choices.find((c) => c.value === action);
      if (selectedChoice) {
        await this.log(`User selected: ${selectedChoice.name}`);
      }
      if (action === 'save') {
        break;
      }
      if (action === 'skip') {
        return null;
      }
      if (action === 'cancel') {
        throw new Error('User cancelled');
      }
      editableData = await this.handleEditAction(action, editableData);
    }
    return editableData;
  }

  async handleEditAction(
    action: string,
    data: EditableContactData
  ): Promise<EditableContactData> {
    const newData = { ...data };
    if (action === 'edit_labels') {
      newData.labelResourceNames = await this.promptForLabels();
    } else if (action === 'add_existing_label') {
      const currentGroups = await this.fetchContactGroups();
      const availableGroups = currentGroups.filter(
        (group) => !newData.labelResourceNames.includes(group.resourceName)
      );
      if (availableGroups.length === 0) {
        this.uiLogger.displayWarning(
          'All available labels are already assigned to this contact'
        );
      } else {
        const choices = availableGroups.map((group) => ({
          name: group.name,
          value: group.resourceName,
        }));
        const selectedLabelsResult = await checkboxWithEscape<string>({
          message: 'Select labels to add:',
          choices,
          loop: false,
          pageSize: SETTINGS.api.displayPageSize,
          validate: (selected: string[]): boolean | string => {
            if (!selected || selected.length === 0) {
              return 'At least one label must be selected.';
            }
            return true;
          },
        });
        if (!selectedLabelsResult.escaped) {
          const selectedResourceNames = selectedLabelsResult.value;
          const uniqueNewLabels = selectedResourceNames.filter(
            (resourceName) => !newData.labelResourceNames.includes(resourceName)
          );
          newData.labelResourceNames = [
            ...newData.labelResourceNames,
            ...uniqueNewLabels,
          ];
          if (uniqueNewLabels.length > 0) {
            this.uiLogger.displaySuccess(
              `Added ${uniqueNewLabels.length} label(s) successfully`
            );
          }
        }
      }
    } else if (action === 'create_label') {
      const currentGroups = await this.fetchContactGroups();
      const labelResult = await inputWithEscape({
        message: "Enter new label name (type 'cancel' to go back):",
        validate: (input: string): boolean | string =>
          InputValidator.validateLabelName(input, currentGroups),
      });
      if (labelResult.escaped) {
        return newData;
      }
      const labelName = labelResult.value;
      if (labelName.trim().toLowerCase() !== 'cancel') {
        const trimmedLabelName = labelName.trim();
        this.uiLogger.displayInfo(`Creating new label: ${trimmedLabelName}`);
        const newGroupResourceName =
          await this.createContactGroup(trimmedLabelName);
        newData.labelResourceNames.push(newGroupResourceName);
        this.uiLogger.displaySuccess(`Created label: ${trimmedLabelName}`);
      }
    } else if (action === 'edit_email') {
      if (newData.emails.length === 0) {
        this.uiLogger.displayWarning(
          'No emails to edit. Please add an email first'
        );
      } else {
        const emailChoices = newData.emails.map((email, index) => ({
          name: email,
          value: index,
        }));
        const emailIndexResult = await selectWithEscape<number>({
          message: 'Select email to edit:',
          loop: false,
          choices: emailChoices,
        });
        if (emailIndexResult.escaped) {
          return newData;
        }
        const emailIndex = emailIndexResult.value;
        const updatedEmailResult = await inputWithEscape({
          message: `${EMOJIS.FIELDS.EMAIL} Email address (type 'cancel' to go back):`,
          default: newData.emails[emailIndex],
          validate: (input: string): boolean | string => {
            const trimmed = input.trim().toLowerCase();
            if (trimmed === 'cancel') {
              return true;
            }
            if (!input.trim()) {
              return "Email address cannot be empty. Type 'cancel' to go back.";
            }
            return InputValidator.validateUniqueEmail(
              input,
              newData.emails,
              emailIndex,
              true
            );
          },
        });
        if (updatedEmailResult.escaped) {
          return newData;
        }
        const updatedEmail = updatedEmailResult.value;
        if (updatedEmail.trim().toLowerCase() !== 'cancel') {
          const trimmedEmail = updatedEmail.trim();
          const emailDuplicates =
            await this.duplicateDetector.checkDuplicateEmail(trimmedEmail);
          const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(
            emailDuplicates,
            this.uiLogger
          );
          if (result === null) return newData;
          if (result.action === 'use_existing') {
            throw new ExistingContactSelected(result.contact);
          }
          newData.emails[emailIndex] = trimmedEmail;
        }
      }
    } else if (action === 'add_email') {
      const newEmailResult = await inputWithEscape({
        message: `${EMOJIS.FIELDS.EMAIL} Email address (type 'cancel' to go back):`,
        default: '',
        validate: (input: string): boolean | string => {
          const trimmed = input.trim().toLowerCase();
          if (trimmed === 'cancel') {
            return true;
          }
          if (!input.trim()) {
            return "Email address cannot be empty. Type 'cancel' to go back.";
          }
          return InputValidator.validateUniqueEmail(
            input,
            newData.emails,
            undefined,
            true
          );
        },
      });
      if (newEmailResult.escaped) {
        return newData;
      }
      const newEmail = newEmailResult.value;
      if (newEmail.trim().toLowerCase() !== 'cancel') {
        const trimmedEmail = newEmail.trim();
        const emailDuplicates =
          await this.duplicateDetector.checkDuplicateEmail(trimmedEmail);
        const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(
          emailDuplicates,
          this.uiLogger
        );
        if (result === null) return newData;
        if (result.action === 'use_existing') {
          throw new ExistingContactSelected(result.contact);
        }
        newData.emails.push(trimmedEmail);
      }
    } else if (action === 'edit_phone') {
      if (newData.phones.length === 0) {
        this.uiLogger.displayWarning(
          'No phones to edit. Please add a phone first'
        );
      } else {
        const phoneChoices = newData.phones.map((phone, index) => ({
          name: phone,
          value: index,
        }));
        const phoneIndexResult = await selectWithEscape<number>({
          message: 'Select phone to edit:',
          loop: false,
          choices: phoneChoices,
        });
        if (phoneIndexResult.escaped) {
          return newData;
        }
        const phoneIndex = phoneIndexResult.value;
        const updatedPhoneResult = await inputWithEscape({
          message: `${EMOJIS.FIELDS.PHONE} Phone number (type 'cancel' to go back):`,
          default: newData.phones[phoneIndex],
          validate: (input: string): boolean | string => {
            const trimmed = input.trim().toLowerCase();
            if (trimmed === 'cancel') {
              return true;
            }
            if (!input.trim()) {
              return "Phone number cannot be empty. Type 'cancel' to go back.";
            }
            return InputValidator.validateUniquePhone(
              input,
              newData.phones,
              phoneIndex
            );
          },
        });
        if (updatedPhoneResult.escaped) {
          return newData;
        }
        const updatedPhone = updatedPhoneResult.value;
        if (updatedPhone.trim().toLowerCase() !== 'cancel') {
          const trimmedPhone = updatedPhone.trim();
          const phoneDuplicates =
            await this.duplicateDetector.checkDuplicatePhone(trimmedPhone);
          const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(
            phoneDuplicates,
            this.uiLogger
          );
          if (result === null) return newData;
          if (result.action === 'use_existing') {
            throw new ExistingContactSelected(result.contact);
          }
          newData.phones[phoneIndex] = trimmedPhone;
        }
      }
    } else if (action === 'add_phone') {
      const newPhoneResult = await inputWithEscape({
        message: `${EMOJIS.FIELDS.PHONE} Phone number (type 'cancel' to go back):`,
        default: '',
        validate: (input: string): boolean | string => {
          const trimmed = input.trim().toLowerCase();
          if (trimmed === 'cancel') {
            return true;
          }
          if (!input.trim()) {
            return "Phone number cannot be empty. Type 'cancel' to go back.";
          }
          return InputValidator.validateUniquePhone(input, newData.phones);
        },
      });
      if (newPhoneResult.escaped) {
        return newData;
      }
      const newPhone = newPhoneResult.value;
      if (newPhone.trim().toLowerCase() !== 'cancel') {
        const trimmedPhone = newPhone.trim();
        const phoneDuplicates =
          await this.duplicateDetector.checkDuplicatePhone(trimmedPhone);
        const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(
          phoneDuplicates,
          this.uiLogger
        );
        if (result === null) return newData;
        if (result.action === 'use_existing') {
          throw new ExistingContactSelected(result.contact);
        }
        newData.phones.push(trimmedPhone);
      }
    } else if (action === 'edit_fullName') {
      const currentFullName = `${newData.firstName} ${newData.lastName}`.trim();
      const newFullNameResult = await inputWithEscape({
        message: `${EMOJIS.FIELDS.PERSON} Full name:`,
        default: currentFullName,
        validate: (input: string): boolean | string => {
          if (!input.trim()) {
            return 'Full name is required and cannot be empty.';
          }
          return InputValidator.validateText(input, false);
        },
      });
      if (newFullNameResult.escaped) {
        return newData;
      }
      const newFullName = newFullNameResult.value;
      const { firstName, lastName } = TextUtils.parseFullName(newFullName);
      const nameDuplicates = await this.duplicateDetector.checkDuplicateName(
        firstName.trim(),
        lastName.trim()
      );
      const result = await this.duplicateDetector.promptDuplicateSelectOrCreate(
        nameDuplicates,
        this.uiLogger
      );
      if (result === null) {
        return newData;
      }
      if (result.action === 'use_existing') {
        throw new ExistingContactSelected(result.contact);
      }
      newData.firstName = firstName.trim();
      newData.lastName = lastName.trim();
    } else if (action === 'edit_company') {
      await this.log(`? ${EMOJIS.FIELDS.COMPANY} Company:`);
      const newCompanyResult = await inputWithEscape({
        message: `${EMOJIS.FIELDS.COMPANY} Company:`,
        default: newData.company || '',
        validate: (input: string): boolean | string =>
          InputValidator.validateText(input, true),
      });
      if (newCompanyResult.escaped) {
        return newData;
      }
      const newCompany = newCompanyResult.value;
      await this.log(`User entered: ${newCompany}`);
      newData.company = TextUtils.formatCompanyToPascalCase(newCompany.trim());
    } else if (action === 'edit_jobTitle') {
      const newJobTitleResult = await inputWithEscape({
        message: `${EMOJIS.FIELDS.JOB_TITLE} Job Title:`,
        default: newData.jobTitle,
        validate: (input: string): boolean | string =>
          InputValidator.validateText(input, true),
      });
      if (newJobTitleResult.escaped) {
        return newData;
      }
      const newJobTitle = newJobTitleResult.value;
      newData.jobTitle = newJobTitle.trim();
    } else if (action === 'remove_label') {
      if (newData.labelResourceNames.length === 0) {
        this.uiLogger.displayWarning('No labels to remove');
      } else if (newData.labelResourceNames.length === 1) {
        this.uiLogger.displayWarning(
          'Cannot remove the last label. At least one label is required'
        );
      } else {
        const currentGroups = await this.fetchContactGroups();
        const labelChoices = newData.labelResourceNames.map((resourceName) => {
          const group = currentGroups.find(
            (g) => g.resourceName === resourceName
          );
          return {
            name: group ? group.name : resourceName,
            value: resourceName,
          };
        });
        labelChoices.push({ name: 'Cancel', value: 'cancel' });
        const labelToRemoveResult = await selectWithEscape<string>({
          message: 'Select label to remove:',
          loop: false,
          choices: labelChoices,
        });
        if (labelToRemoveResult.escaped) {
          return newData;
        }
        const labelToRemove = labelToRemoveResult.value;
        if (labelToRemove !== 'cancel') {
          newData.labelResourceNames = newData.labelResourceNames.filter(
            (resourceName) => resourceName !== labelToRemove
          );
          this.uiLogger.displaySuccess('Label removed successfully');
        }
      }
    } else if (action === 'order_labels') {
      const currentGroups = await this.fetchContactGroups();
      const labelChoices = newData.labelResourceNames.map((resourceName) => {
        const group = currentGroups.find(
          (g) => g.resourceName === resourceName
        );
        return {
          name: group ? group.name : resourceName,
          value: resourceName,
        };
      });
      const orderedLabelsResult = await checkboxWithEscape<string>({
        message:
          'Select labels in the order you want them (the order of selection will be the new order):',
        choices: labelChoices,
        loop: false,
        pageSize: SETTINGS.api.displayPageSize,
        validate: (selected: string[]): boolean | string => {
          if (!selected || selected.length === 0) {
            return 'At least one label must be selected.';
          }
          return true;
        },
      });
      if (!orderedLabelsResult.escaped) {
        const orderedResourceNames = orderedLabelsResult.value;
        newData.labelResourceNames = orderedResourceNames;
        this.uiLogger.displaySuccess('Labels reordered successfully');
      }
    } else if (action === 'remove_company') {
      newData.company = '';
      this.uiLogger.displaySuccess('Company removed successfully');
    } else if (action === 'remove_jobTitle') {
      newData.jobTitle = '';
      this.uiLogger.displaySuccess('Job title removed successfully');
    } else if (action === 'remove_email') {
      if (newData.emails.length === 0) {
        this.uiLogger.displayWarning('No emails to remove');
      } else {
        const emailChoices = newData.emails.map((email, index) => ({
          name: email,
          value: index,
        }));
        emailChoices.push({ name: 'Cancel', value: -1 });
        const emailIndexResult = await selectWithEscape<number>({
          message: 'Select email to remove:',
          loop: false,
          choices: emailChoices,
        });
        if (emailIndexResult.escaped) {
          return newData;
        }
        const emailIndex = emailIndexResult.value;
        if (emailIndex !== -1) {
          newData.emails.splice(emailIndex, 1);
          this.uiLogger.displaySuccess('Email removed successfully');
        }
      }
    } else if (action === 'remove_phone') {
      if (newData.phones.length === 0) {
        this.uiLogger.displayWarning('No phones to remove');
      } else {
        const phoneChoices = newData.phones.map((phone, index) => ({
          name: phone,
          value: index,
        }));
        phoneChoices.push({ name: 'Cancel', value: -1 });
        const phoneIndexResult = await selectWithEscape<number>({
          message: 'Select phone to remove:',
          loop: false,
          choices: phoneChoices,
        });
        if (phoneIndexResult.escaped) {
          return newData;
        }
        const phoneIndex = phoneIndexResult.value;
        if (phoneIndex !== -1) {
          newData.phones.splice(phoneIndex, 1);
          this.uiLogger.displaySuccess('Phone removed successfully');
        }
      }
    } else if (action === 'edit_linkedIn' || action === 'add_linkedIn') {
      const isAdding = action === 'add_linkedIn';
      const promptLabel = isAdding ? 'Add' : 'Edit';
      const newLinkedInUrlResult = await inputWithEscape({
        message: `${EMOJIS.FIELDS.LINKEDIN} ${promptLabel} LinkedIn URL (type 'cancel' to go back):`,
        default: newData.linkedInUrl || '',
        validate: (input: string): boolean | string => {
          const trimmed = input.trim().toLowerCase();
          if (trimmed === 'cancel') {
            return true;
          }
          return InputValidator.validateLinkedInUrl(input);
        },
      });
      if (newLinkedInUrlResult.escaped) {
        return newData;
      }
      const newLinkedInUrl = newLinkedInUrlResult.value;
      if (newLinkedInUrl.trim().toLowerCase() !== 'cancel') {
        if (newLinkedInUrl.trim()) {
          const normalizedUrl =
            InputValidator.normalizeLinkedInUrl(newLinkedInUrl);
          const linkedInDuplicates =
            await this.duplicateDetector.checkDuplicateLinkedInUrl(
              normalizedUrl
            );
          const shouldContinue =
            await this.duplicateDetector.promptForDuplicateContinue(
              linkedInDuplicates,
              this.uiLogger
            );
          if (shouldContinue) {
            newData.linkedInUrl = normalizedUrl;
            if (isAdding) {
              this.uiLogger.displaySuccess('LinkedIn URL added successfully');
            } else {
              this.uiLogger.displaySuccess('LinkedIn URL updated successfully');
            }
          }
        } else {
          newData.linkedInUrl = undefined;
        }
      }
    } else if (action === 'remove_linkedIn') {
      newData.linkedInUrl = undefined;
      this.uiLogger.displaySuccess('LinkedIn URL removed successfully');
    }
    return newData;
  }

  async createContact(data: EditableContactData, note: string): Promise<void> {
    const validationError = InputValidator.validateMinimumRequirements(data);
    if (validationError !== true) {
      this.uiLogger.displayError(validationError);
      throw new Error(validationError);
    }
    const apiTracker = ApiTracker.getInstance();
    const finalAllGroups = await this.fetchContactGroups();
    const finalSelectedLabelNames = data.labelResourceNames.map(
      (resourceName) => {
        const group = finalAllGroups.find(
          (g) => g.resourceName === resourceName
        );
        return group ? group.name : resourceName;
      }
    );

    const firstLabelName =
      finalSelectedLabelNames.length > 0 ? finalSelectedLabelNames[0] : '';
    
    // Construct compositeSuffix intelligently to avoid 'HR HR Huntiq'
    const compositeSuffix = (data.company && firstLabelName && data.company.startsWith(firstLabelName))
      ? data.company
      : [firstLabelName, data.company].filter(s => s).join(' ');

    const { requestBody } = this.buildContactRequestBody(data, note);

    if (Object.keys(requestBody).length === 0) {
      this.uiLogger.displayError(
        'No data provided. Contact creation cancelled'
      );
      return;
    }

    if (SETTINGS.dryMode) {
      const contactDetails =
        `Contact: ${data.firstName} ${data.lastName}` +
        (data.emails[0] ? ` (${data.emails[0]})` : '') +
        (data.company ? ` - Label: ${data.company}` : '');
      DryModeChecker.logApiCall(
        'service.people.createContact()',
        contactDetails,
        this.uiLogger
      );
      const mockResponse = DryModeMocks.createContactResponse(
        data.firstName,
        data.lastName
      );

      const newContact: ContactData = {
        label: finalSelectedLabelNames.join(' | '),
        firstName: data.firstName,
        lastName: data.lastName,
        company: compositeSuffix || '',
        jobTitle: data.jobTitle ?? '',
        emails: data.emails.map((email) => ({
          value: email,
          label: compositeSuffix || 'other',
        })),
        phones: data.phones.map((phone) => ({
          number: phone,
          label: compositeSuffix || 'other',
        })),
        websites: data.linkedInUrl
          ? [{ url: data.linkedInUrl, label: 'LinkedIn' }]
          : [],
        resourceName: mockResponse.resourceName,
        biography: note,
        etag: mockResponse.etag,
      };
      this.duplicateDetector.addRecentlyModifiedContact(newContact);

      await apiTracker.trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      if (this.logApiStats) {
        await apiTracker.logStats(this.uiLogger);
      }
      this.uiLogger.displaySuccess('[DRY MODE] Contact created successfully');
      console.log(`-Resource Name: ${mockResponse.resourceName} (mock)`);
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      if (compositeSuffix && !fullName.endsWith(compositeSuffix)) {
        console.log(`-Full name: ${fullName} ${compositeSuffix}`);
      } else {
        console.log(`-Full name: ${fullName}`);
      }
      console.log(`-Labels: ${finalSelectedLabelNames.join(' | ') || ''}`);
      console.log(`-Company: ${compositeSuffix || ''}`);
      console.log(`-Job Title: ${data.jobTitle || ''}`);
      if (data.emails.length === 1) {
        console.log(`-Email: ${data.emails[0]} ${compositeSuffix || 'other'}`);
      } else if (data.emails.length > 1) {
        console.log('-Emails:');
        data.emails.forEach((email) => {
          console.log(`  ${email} ${compositeSuffix || 'other'}`);
        });
      } else {
        console.log('-Email: ');
      }
      if (data.phones.length === 1) {
        console.log(`-Phone: ${data.phones[0]} ${compositeSuffix || 'other'}`);
      } else if (data.phones.length > 1) {
        console.log('-Phones:');
        data.phones.forEach((phone) => {
          console.log(`  ${phone} ${compositeSuffix || 'other'}`);
        });
      } else {
        console.log('-Phone: ');
      }
      if (data.linkedInUrl) {
        console.log(`-LinkedIn URL: ${data.linkedInUrl} LinkedIn`);
      } else {
        console.log('-LinkedIn URL: ');
      }
      console.log('');
      return;
    }

    const service = google.people({ version: 'v1', auth: this.auth });
    const spinner = ora('Creating new contact...').start();
    const response = await retryWithBackoff(async () => {
      return await service.people.createContact({
        requestBody,
      });
    });
    await apiTracker.trackWrite();
    spinner.stop();
    this.uiLogger.resetState('spinner');
    if (this.logApiStats) {
      await apiTracker.logStats(this.uiLogger);
    }
    await this.delay(SETTINGS.contactsSync.writeDelayMs);
    await ContactCache.getInstance().invalidate();

    const resourceName = response.data.resourceName;
    const newContact: ContactData = {
      label: finalSelectedLabelNames.join(' | '),
      firstName: data.firstName,
      lastName: data.lastName,
      company: compositeSuffix || '',
      jobTitle: data.jobTitle ?? '',
      emails: data.emails.map((email) => ({
        value: email,
        label: compositeSuffix || 'other',
      })),
      phones: data.phones.map((phone) => ({
        number: phone,
        label: compositeSuffix || 'other',
      })),
      websites: data.linkedInUrl
        ? [{ url: data.linkedInUrl, label: 'LinkedIn' }]
        : [],
      resourceName: resourceName ?? undefined,
      biography: note,
      etag: response.data.etag ?? undefined,
    };
    this.duplicateDetector.addRecentlyModifiedContact(newContact);
    this.uiLogger.displaySuccess('Contact created successfully');

    console.log(`-Resource Name: ${resourceName}`);
    const fullNameOut = `${data.firstName} ${data.lastName}`.trim();
    if (compositeSuffix && !fullNameOut.endsWith(compositeSuffix)) {
      console.log(`-Full name: ${fullNameOut} ${compositeSuffix}`);
    } else {
      console.log(`-Full name: ${fullNameOut}`);
    }
    console.log(`-Labels: ${finalSelectedLabelNames.join(' | ') || ''}`);
    console.log(`-Company: ${compositeSuffix || ''}`);
    console.log(`-Job Title: ${data.jobTitle || ''}`);
    if (data.emails.length === 1) {
      console.log(`-Email: ${data.emails[0]} ${compositeSuffix || 'other'}`);
    } else if (data.emails.length > 1) {
      console.log('-Emails:');
      data.emails.forEach((email) => {
        console.log(`  ${email} ${compositeSuffix || 'other'}`);
      });
    } else {
      console.log('-Email: ');
    }
    if (data.phones.length === 1) {
      console.log(`-Phone: ${data.phones[0]} ${compositeSuffix || 'other'}`);
    } else if (data.phones.length > 1) {
      console.log('-Phones:');
      data.phones.forEach((phone) => {
        console.log(`  ${phone} ${compositeSuffix || 'other'}`);
      });
    } else {
      console.log('-Phone: ');
    }
    if (data.linkedInUrl) {
      console.log(`-LinkedIn URL: ${data.linkedInUrl} LinkedIn`);
    } else {
      console.log('-LinkedIn URL: ');
    }
    console.log('');
  }

  convertContactDataToEditable(contact: ContactData): EditableContactData {
    const emailValues = contact.emails.map((e) => e.value);
    const phoneValues = contact.phones.map((p) => p.number);
    const linkedInWebsite = contact.websites.find((w) =>
      w.label.toLowerCase().includes('linkedin') ||
      w.url.toLowerCase().includes('linkedin.com')
    );
    const labelResourceNames: string[] = [];
    return {
      firstName: contact.firstName,
      lastName: this.extractBaseLastName(
        contact.lastName,
        contact.label,
        contact.company
      ),
      company: contact.company,
      jobTitle: contact.jobTitle,
      emails: emailValues,
      phones: phoneValues,
      linkedInUrl: linkedInWebsite?.url,
      labelResourceNames,
    };
  }

  private extractBaseLastName(
    lastName: string,
    label?: string,
    company?: string
  ): string {
    if (!lastName) return '';
    let current = lastName.trim();

    // Collect possible suffixes to strip
    const possibleSuffixes: string[] = [];
    if (label) {
      const parts = label.split(' | ').map((p) => p.trim());
      possibleSuffixes.push(...parts);
    }
    if (company) {
      possibleSuffixes.push(company.trim());
      const formatted = TextUtils.formatCompanyToPascalCase(company);
      if (formatted && formatted !== company.trim()) {
        possibleSuffixes.push(formatted);
      }
    }
    
    // Sort suffixes by length descending to match longest first
    const sorted = [...new Set(possibleSuffixes)].sort((a, b) => b.length - a.length);

    // Iteratively strip from the end
    let changed = true;
    while (changed) {
      changed = false;
      for (const suffix of sorted) {
        if (suffix && current.toLowerCase().endsWith(' ' + suffix.toLowerCase())) {
          current = current.substring(0, current.length - suffix.length - 1).trim();
          changed = true;
          break; // restart loop after a change to check all suffixes again
        }
      }
    }
    return current;
  }

  async promptForLabels(): Promise<string[]> {
    let existingGroups = await this.fetchContactGroups();
    let selectedResourceNames: string[] = [];
    if (existingGroups.length === 0) {
      this.uiLogger.displayWarning(
        'At least 1 label is required to create a new contact'
      );
      this.uiLogger.displayInfo('No existing labels found. Creating new label');
      while (existingGroups.length === 0) {
        const labelNameResult = await inputWithEscape({
          message: 'Enter new label name:',
          validate: (input: string): boolean | string => {
            if (!input.trim()) {
              return 'Label name cannot be empty.';
            }
            return InputValidator.validateLabelName(input, existingGroups);
          },
        });
        if (labelNameResult.escaped) {
          throw new Error('User cancelled');
        }
        const labelName = labelNameResult.value;
        const trimmedLabelName = labelName.trim();
        const ora = (await import('ora')).default;
        const spinner = ora({
          text: `Creating label: ${trimmedLabelName}...`,
          color: 'cyan',
        }).start();
        await this.createContactGroup(trimmedLabelName);
        spinner.stop();
        spinner.clear();
        this.uiLogger.resetState('spinner');
        this.uiLogger.displaySuccess(`Label created: ${trimmedLabelName}`);
        existingGroups = await this.fetchContactGroups(true);
      }
    }
    const choices = existingGroups.map((group) => ({
      name: group.name,
      value: group.resourceName,
    }));
    const selectedLabelsResult = await checkboxWithEscape<string>({
      message: 'Select labels (At least one required):',
      choices,
      loop: false,
      pageSize: SETTINGS.api.displayPageSize,
      validate: (selected: string[]): boolean | string => {
        if (!selected || selected.length === 0) {
          return 'At least one label is required.';
        }
        return true;
      },
    });
    if (selectedLabelsResult.escaped) {
      throw new Error('User cancelled');
    }
    selectedResourceNames = selectedLabelsResult.value;
    return selectedResourceNames;
  }

  async fetchContactGroups(forceRefresh: boolean = false): Promise<ContactGroup[]> {
    if (!forceRefresh && this.cachedContactGroups) {
      this.uiLogger.debug('Contact groups cache hit');
      return this.cachedContactGroups;
    }
    if (this.fetchInProgress) {
      return this.fetchInProgress;
    }
    this.uiLogger.debug('Contact groups cache miss, fetching from API');
    this.fetchInProgress = this._fetchContactGroupsImpl()
      .finally(() => {
        this.fetchInProgress = null;
      });
    const result = await this.fetchInProgress;
    return result;
  }

  private async _fetchContactGroupsImpl(): Promise<ContactGroup[]> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const contactGroups: ContactGroup[] = [];
    let pageToken: string | undefined;
    do {
      const response = await retryWithBackoff(async () => {
        return await service.contactGroups.list({
          pageSize: SETTINGS.api.pageSize,
          pageToken,
        });
      });
      await apiTracker.trackRead();
      if (this.logApiStats) {
        await apiTracker.logStats(this.uiLogger);
      }
      const groups = response.data.contactGroups || [];
      contactGroups.push(
        ...groups
          .filter(
            (group) =>
              group.resourceName &&
              group.name &&
              group.groupType === 'USER_CONTACT_GROUP'
          )
          .map((group) => ({
            resourceName: group.resourceName!,
            name: group.name!,
          }))
      );
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    try {
      if (contactGroups.length > 0) {
        const resourceNames = contactGroups.map(g => g.resourceName);
        if (SETTINGS.dryMode) {
          DryModeChecker.logApiCall(
            'service.contactGroups.batchGet()',
            `Fetching memberCount for ${resourceNames.length} groups`,
            this.uiLogger
          );
          for (const group of contactGroups) {
            group.memberCount = Math.floor(Math.random() * 50);
          }
        } else {
          const BATCH_SIZE = 200;
          const memberCountMap = new Map<string, number>();
          for (let i = 0; i < resourceNames.length; i += BATCH_SIZE) {
            const batch = resourceNames.slice(i, i + BATCH_SIZE);
            const batchResponse = await retryWithBackoff(async () => {
              return await service.contactGroups.batchGet({
                resourceNames: batch,
                groupFields: 'name,memberCount,groupType',
                maxMembers: 0,
              });
            });
            await apiTracker.trackRead();
            if (this.logApiStats) {
              await apiTracker.logStats(this.uiLogger);
            }
            const responses = batchResponse.data.responses || [];
            for (const resp of responses) {
              const memberCount = resp.contactGroup?.memberCount;
              if (resp.contactGroup?.resourceName && memberCount !== undefined && memberCount !== null) {
                memberCountMap.set(resp.contactGroup.resourceName, memberCount);
              }
            }
          }
          for (const group of contactGroups) {
            group.memberCount = memberCountMap.get(group.resourceName) || 0;
          }
        }
      }
    } catch (error: unknown) {
      const isQuota = error instanceof Error && 
        (error.message.includes('quota') || error.message.includes('429'));
      if (isQuota) {
        this.uiLogger.displayWarning(
          'API quota exceeded - using alphabetical order. Try again in a few minutes.'
        );
      } else {
        this.uiLogger.displayWarning('Failed to fetch label popularity, using alphabetical order');
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.uiLogger.displayError(`Error: ${errorMessage}`);
    }
    const sortedGroups = contactGroups.sort((a, b) => {
      const countA = a.memberCount ?? 0;
      const countB = b.memberCount ?? 0;
      if (countB !== countA) {
        return countB - countA;
      }
      return a.name.localeCompare(b.name, 'en-US');
    });
    this.cachedContactGroups = sortedGroups;
    return sortedGroups;
  }

  async createContactGroup(name: string): Promise<string> {
    if (SETTINGS.dryMode) {
      const prefixedName = `[DRY-MODE] ${name}`;
      DryModeChecker.logApiCall(
        'service.contactGroups.create()',
        `Group: ${prefixedName}`,
        this.uiLogger
      );
      const mockResourceName = DryModeMocks.createGroupResponse(prefixedName);
      const apiTracker = ApiTracker.getInstance();
      await apiTracker.trackWrite();
      if (this.logApiStats) {
        await apiTracker.logStats(this.uiLogger);
      }
      this.cachedContactGroups = null;
      this.fetchInProgress = null;
      return mockResourceName;
    }
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
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
    if (this.logApiStats) {
      await apiTracker.logStats(this.uiLogger);
    }
    this.cachedContactGroups = null;
    this.fetchInProgress = null;
    return response.data.resourceName!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async addPhoneToExistingContact(
    resourceName: string,
    phone: string
  ): Promise<void> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const currentContact = await retryWithBackoff(async () => {
      return await service.people.get({
        resourceName,
        personFields: 'phoneNumbers',
      });
    });
    await apiTracker.trackRead();
    const existingPhones = currentContact.data.phoneNumbers || [];
    const phoneAlreadyExists = existingPhones.some((p) =>
      PhoneNormalizer.phonesMatch(p.value || '', phone)
    );
    if (phoneAlreadyExists) {
      this.uiLogger.displayWarning(
        `Phone ${phone} already exists in this contact`
      );
      return;
    }
    if (SETTINGS.dryMode) {
      DryModeChecker.logApiCall(
        'service.people.updateContact()',
        `${resourceName}: Add phone ${phone}`,
        this.uiLogger
      );
      await apiTracker.trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      return;
    }
    const updatedPhones = [...existingPhones, { value: phone, type: 'other' }];
    try {
      await retryWithBackoff(async () => {
        return await service.people.updateContact({
          resourceName,
          updatePersonFields: 'phoneNumbers',
          requestBody: {
            etag: currentContact.data.etag,
            phoneNumbers: updatedPhones,
          },
        });
      });
    } catch (error: unknown) {
      const errorCode =
        (error as { code?: number; status?: number })?.code ||
        (error as { code?: number; status?: number })?.status;
      if (errorCode === 412) {
        const refreshedContact = await retryWithBackoff(async () => {
          return await service.people.get({
            resourceName,
            personFields: 'phoneNumbers',
          });
        });
        await apiTracker.trackRead();
        const refreshedPhones = refreshedContact.data.phoneNumbers || [];
        const phoneExistsAfterRefresh = refreshedPhones.some((p) =>
          PhoneNormalizer.phonesMatch(p.value || '', phone)
        );
        if (phoneExistsAfterRefresh) {
          this.uiLogger.displayWarning(
            `Phone ${phone} already exists in this contact`
          );
          return;
        }
        const retryUpdatedPhones = [
          ...refreshedPhones,
          { value: phone, type: 'other' },
        ];
        await retryWithBackoff(async () => {
          return await service.people.updateContact({
            resourceName,
            updatePersonFields: 'phoneNumbers',
            requestBody: {
              etag: refreshedContact.data.etag,
              phoneNumbers: retryUpdatedPhones,
            },
          });
        });
      } else {
        throw error;
      }
    }
    await apiTracker.trackWrite();
    await this.delay(SETTINGS.contactsSync.writeDelayMs);
    await ContactCache.getInstance().invalidate();
  }

  async addEmailToExistingContact(
    resourceName: string,
    email: string
  ): Promise<void> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const currentContact = await retryWithBackoff(async () => {
      return await service.people.get({
        resourceName,
        personFields: 'emailAddresses',
      });
    });
    await apiTracker.trackRead();
    const existingEmails = currentContact.data.emailAddresses || [];
    const emailAlreadyExists = existingEmails.some((e) =>
      EmailNormalizer.emailsMatch(e.value || '', email)
    );
    if (emailAlreadyExists) {
      this.uiLogger.displayWarning(
        `Email ${email} already exists in this contact`
      );
      return;
    }
    if (SETTINGS.dryMode) {
      DryModeChecker.logApiCall(
        'service.people.updateContact()',
        `${resourceName}: Add email ${email}`,
        this.uiLogger
      );
      await apiTracker.trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      return;
    }
    const updatedEmails = [...existingEmails, { value: email, type: 'other' }];
    try {
      await retryWithBackoff(async () => {
        return await service.people.updateContact({
          resourceName,
          updatePersonFields: 'emailAddresses',
          requestBody: {
            etag: currentContact.data.etag,
            emailAddresses: updatedEmails,
          },
        });
      });
    } catch (error: unknown) {
      const errorCode =
        (error as { code?: number; status?: number })?.code ||
        (error as { code?: number; status?: number })?.status;
      if (errorCode === 412) {
        const refreshedContact = await retryWithBackoff(async () => {
          return await service.people.get({
            resourceName,
            personFields: 'emailAddresses',
          });
        });
        await apiTracker.trackRead();
        const refreshedEmails = refreshedContact.data.emailAddresses || [];
        const emailExistsAfterRefresh = refreshedEmails.some((e) =>
          EmailNormalizer.emailsMatch(e.value || '', email)
        );
        if (emailExistsAfterRefresh) {
          this.uiLogger.displayWarning(
            `Email ${email} already exists in this contact`
          );
          return;
        }
        const retryUpdatedEmails = [
          ...refreshedEmails,
          { value: email, type: 'other' },
        ];
        await retryWithBackoff(async () => {
          return await service.people.updateContact({
            resourceName,
            updatePersonFields: 'emailAddresses',
            requestBody: {
              etag: refreshedContact.data.etag,
              emailAddresses: retryUpdatedEmails,
            },
          });
        });
      } else {
        throw error;
      }
    }
    await apiTracker.trackWrite();
    await this.delay(SETTINGS.contactsSync.writeDelayMs);
    await ContactCache.getInstance().invalidate();
  }

  async updateExistingContact(
    resourceName: string,
    data: EditableContactData,
    note: string
  ): Promise<void> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();

    // 1. Fetch current etag and metadata
    const current = await retryWithBackoff(async () =>
      service.people.get({
        resourceName,
        personFields: 'names,emailAddresses,phoneNumbers,organizations,urls,memberships,biographies,metadata',
      })
    );
    await apiTracker.trackRead();

    if (resourceName.startsWith('people/d')) {
      if (this.logCallback) {
        await this.logCallback(`WARNING: Targeted contact ${resourceName} looks like a Directory contact. Updates may trigger 'Save Contact' prompt.`);
      }
    }

    // 2. Build requestBody and identify updated fields
    const { requestBody, updatedFields } = this.buildContactRequestBody(
      data,
      note,
      current.data
    );

    // 3. Dry mode
    if (SETTINGS.dryMode) {
      DryModeChecker.logApiCall(
        'service.people.updateContact()',
        `${resourceName}`,
        this.uiLogger
      );
      await apiTracker.trackWrite();
      await this.delay(SETTINGS.contactsSync.writeDelayMs);
      await ContactCache.getInstance().invalidate();
      this.uiLogger.displaySuccess('[DRY MODE] Contact updated successfully');
      return;
    }

    if (updatedFields.length === 0) {
      this.uiLogger.displayInfo('No fields changed, skipping update');
      return;
    }

    // 4. Real API update
    const spinner = ora('Updating contact...').start();
    await retryWithBackoff(async () =>
      service.people.updateContact({
        resourceName,
        updatePersonFields: updatedFields.join(','),
        requestBody: { etag: current.data.etag, ...requestBody },
      })
    );
    await apiTracker.trackWrite();
    spinner.stop();
    this.uiLogger.resetState('spinner');
    if (this.logApiStats) await apiTracker.logStats(this.uiLogger);
    await this.delay(SETTINGS.contactsSync.writeDelayMs);
    await ContactCache.getInstance().invalidate();
    this.uiLogger.displaySuccess('Contact updated successfully');
  }

  private buildContactRequestBody(
    data: EditableContactData,
    note: string,
    existingContact?: any
  ): { requestBody: CreateContactRequest; updatedFields: string[] } {
    const allGroups = this.cachedContactGroups || [];
    const selectedLabelNames = data.labelResourceNames.map((resourceName) => {
      const group = allGroups.find((g) => g.resourceName === resourceName);
      return group ? group.name : resourceName;
    });
    const firstLabelName =
      selectedLabelNames.length > 0 ? selectedLabelNames[0] : '';

    const compositeSuffix =
      data.company && firstLabelName && data.company.startsWith(firstLabelName)
        ? data.company
        : [firstLabelName, data.company].filter((s) => s).join(' ');

    const baseLastName = this.extractBaseLastName(
      data.lastName,
      selectedLabelNames.join(' | '),
      data.company
    );
    const lastNameValue = [baseLastName, compositeSuffix]
      .filter((s) => s)
      .join(' ');

    const requestBody: CreateContactRequest = {};
    const updatedFields: string[] = [];

    // 1. Names
    if (data.firstName || lastNameValue) {
      const existingName = existingContact?.names?.[0] || {};
      requestBody.names = [
        {
          ...existingName,
          givenName: data.firstName || undefined,
          familyName: lastNameValue || undefined,
        },
      ];
      updatedFields.push('names');
    }

    // 2. Emails
    if (data.emails.length > 0) {
      requestBody.emailAddresses = data.emails.map((email, i) => {
        const existingEmail = existingContact?.emailAddresses?.[i] || {};
        return {
          ...existingEmail,
          value: email,
          type: compositeSuffix || 'other',
        };
      });
      updatedFields.push('emailAddresses');
    } else if (existingContact?.emailAddresses?.length > 0) {
      requestBody.emailAddresses = [];
      updatedFields.push('emailAddresses');
    }

    // 3. Phones
    if (data.phones.length > 0) {
      requestBody.phoneNumbers = data.phones.map((phone, i) => {
        const existingPhone = existingContact?.phoneNumbers?.[i] || {};
        return {
          ...existingPhone,
          value: phone,
          type: compositeSuffix || 'other',
        };
      });
      updatedFields.push('phoneNumbers');
    } else if (existingContact?.phoneNumbers?.length > 0) {
      requestBody.phoneNumbers = [];
      updatedFields.push('phoneNumbers');
    }

    // 4. Organizations
    if (data.company || data.jobTitle) {
      const existingOrg = existingContact?.organizations?.[0] || {};
      requestBody.organizations = [
        {
          ...existingOrg,
          name: compositeSuffix || undefined,
          title: data.jobTitle || undefined,
          type: 'work',
        },
      ];
      updatedFields.push('organizations');
    } else if (existingContact?.organizations?.length > 0) {
      requestBody.organizations = [];
      updatedFields.push('organizations');
    }

    // 5. URLs
    if (data.linkedInUrl) {
      const existingUrl = existingContact?.urls?.[0] || {};
      requestBody.urls = [
        {
          ...existingUrl,
          value: data.linkedInUrl,
          type: 'LinkedIn',
        },
      ];
      updatedFields.push('urls');
    } else if (existingContact?.urls?.length > 0) {
      requestBody.urls = [];
      updatedFields.push('urls');
    }

    // 6. Memberships - Preserve system memberships correctly
    const userManageableGroups = this.cachedContactGroups || [];
    const systemMemberships = (existingContact?.memberships || []).filter(
      (m: any) => {
        const rn = m.contactGroupMembership?.contactGroupResourceName;
        if (!rn) return true; // Keep domainMembership etc.
        
        // Keep memberships that are NOT in our manageable user groups list (e.g. 'myContacts', 'starred')
        return !userManageableGroups.some(g => g.resourceName === rn);
      }
    );

    const userMemberships = data.labelResourceNames.map((resourceName) => ({
      contactGroupMembership: { contactGroupResourceName: resourceName },
    }));

    requestBody.memberships = [...systemMemberships, ...userMemberships];
    updatedFields.push('memberships');

    // 7. Biographies
    if (note) {
      requestBody.biographies = [
        {
          value: note,
          contentType: 'TEXT_PLAIN',
        },
      ];
      updatedFields.push('biographies');
    }

    return { requestBody, updatedFields };
  }
}
