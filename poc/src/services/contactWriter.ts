import { google, Auth } from "googleapis";
import inquirer from "inquirer";
import type {
  ContactGroup,
  EditableContactData,
  CreateContactRequest,
} from "../types.js";
import { ApiTracker } from "./apiTracker.js";
import { DuplicateDetector } from "./duplicateDetector.js";
import { InputValidator } from "../validators/index.js";
import { TextUtils } from "../utils/index.js";
import { SETTINGS } from "../settings.js";

type OAuth2Client = Auth.OAuth2Client;

export class ContactWriter {
  private duplicateDetector: DuplicateDetector;

  constructor(private auth: OAuth2Client) {
    this.duplicateDetector = new DuplicateDetector(auth);
  }

  async addContact(): Promise<void> {
    const initialData = await this.collectInitialInput();
    const finalData = await this.showSummaryAndEdit(initialData);
    await this.createContact(finalData);
    this.duplicateDetector.clearCache();
  }

  async addNoteToContact(): Promise<void> {
    const contacts = await this.fetchAllContactsForSelection();
    if (contacts.length === 0) {
      console.log('\nNo contacts found.\n');
      return;
    }
    const selectedContact = await this.selectContact(contacts);
    if (!selectedContact) {
      console.log('\nOperation cancelled.\n');
      return;
    }
    const { note } = await inquirer.prompt([
      {
        type: 'input',
        name: 'note',
        message: '📝 Enter note:',
        default: 'Hello World',
      },
    ]);
    if (!note.trim()) {
      console.log('\nOperation cancelled - no note entered.\n');
      return;
    }
    await this.updateContactNote(selectedContact.resourceName, note.trim());
    console.log(`\n✅ Note added to ${selectedContact.displayName}\n`);
  }

  private async fetchAllContactsForSelection(): Promise<Array<{ resourceName: string; displayName: string }>> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const contacts: Array<{ resourceName: string; displayName: string }> = [];
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
      for (const person of connections) {
        if (person.resourceName) {
          const names = person.names?.[0];
          const displayName = names
            ? `${names.givenName || ''} ${names.familyName || ''}`.trim() ||
              person.resourceName
            : person.resourceName;
          contacts.push({
            resourceName: person.resourceName,
            displayName,
          });
        }
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return contacts;
  }

  private async selectContact(
    contacts: Array<{ resourceName: string; displayName: string }>,
  ): Promise<{ resourceName: string; displayName: string } | null> {
    const choices = contacts.map((contact) => ({
      name: contact.displayName,
      value: contact,
    }));
    choices.push({ name: '🚪 Cancel', value: null as any });
    const { selectedContact } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedContact',
        message: 'Select a contact to add a note to:',
        choices,
        pageSize: 15,
        loop: false,
      },
    ]);
    return selectedContact;
  }

  private async updateContactNote(resourceName: string, note: string): Promise<void> {
    const service = google.people({ version: 'v1', auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const existingContact = await service.people.get({
      resourceName,
      personFields: 'biographies',
    });
    await apiTracker.trackRead();
    await service.people.updateContact({
      resourceName,
      updatePersonFields: 'biographies',
      requestBody: {
        resourceName,
        etag: existingContact.data.etag,
        biographies: [
          {
            value: note,
            contentType: 'TEXT_PLAIN',
          },
        ],
      },
    });
    await apiTracker.trackWrite();
  }

  private async collectInitialInput(): Promise<EditableContactData> {
    const labelResourceNames = await this.promptForLabels();
    const { company } = await inquirer.prompt([
      {
        type: "input",
        name: "company",
        message: "🏢 Company:",
        default: "",
        validate: InputValidator.validateText,
      },
    ]);
    const trimmedCompany = TextUtils.formatCompanyToPascalCase(company.trim());
    const { fullName } = await inquirer.prompt([
      {
        type: "input",
        name: "fullName",
        message: "👤 Full name:",
        default: "",
        validate: InputValidator.validateText,
      },
    ]);
    const { firstName, lastName } = TextUtils.parseFullName(fullName);
    if (firstName && lastName) {
      const nameDuplicates = await this.duplicateDetector.checkDuplicateName(
        firstName,
        lastName,
      );
      const shouldContinue =
        await this.duplicateDetector.promptForDuplicateContinue(nameDuplicates);
      if (!shouldContinue) {
        console.log("\nContact creation cancelled.\n");
        throw new Error("User cancelled due to duplicate");
      }
    }
    const { jobTitle } = await inquirer.prompt([
      {
        type: "input",
        name: "jobTitle",
        message: "💼 Job Title:",
        default: "",
        validate: InputValidator.validateText,
      },
    ]);
    const emails: string[] = [];
    const { emailValue } = await inquirer.prompt([
      {
        type: "input",
        name: "emailValue",
        message: "📧 Email address:",
        default: "",
        validate: InputValidator.validateEmail,
      },
    ]);
    if (emailValue.trim()) {
      const trimmedEmail = emailValue.trim();
      const emailDuplicates =
        await this.duplicateDetector.checkDuplicateEmail(trimmedEmail);
      const shouldContinue =
        await this.duplicateDetector.promptForDuplicateContinue(
          emailDuplicates,
        );
      if (!shouldContinue) {
        console.log("\nContact creation cancelled.\n");
        throw new Error("User cancelled due to duplicate");
      }
      emails.push(trimmedEmail);
    }
    const phones: string[] = [];
    const { phoneNumber } = await inquirer.prompt([
      {
        type: "input",
        name: "phoneNumber",
        message: "📱 Phone number:",
        default: "",
        validate: InputValidator.validatePhone,
      },
    ]);
    if (phoneNumber.trim()) {
      const trimmedPhone = phoneNumber.trim();
      const phoneDuplicates =
        await this.duplicateDetector.checkDuplicatePhone(trimmedPhone);
      const shouldContinue =
        await this.duplicateDetector.promptForDuplicateContinue(
          phoneDuplicates,
        );
      if (!shouldContinue) {
        console.log("\nContact creation cancelled.\n");
        throw new Error("User cancelled due to duplicate");
      }
      phones.push(trimmedPhone);
    }
    let linkedInUrl: string | undefined;
    const { linkedInUrlInput } = await inquirer.prompt([
      {
        type: "input",
        name: "linkedInUrlInput",
        message: "🔗 LinkedIn URL:",
        default: "",
        validate: InputValidator.validateLinkedInUrl,
      },
    ]);
    if (linkedInUrlInput.trim()) {
      linkedInUrl = InputValidator.normalizeLinkedInUrl(linkedInUrlInput);
      const linkedInDuplicates =
        await this.duplicateDetector.checkDuplicateLinkedInUrl(linkedInUrl);
      const shouldContinue =
        await this.duplicateDetector.promptForDuplicateContinue(
          linkedInDuplicates,
        );
      if (!shouldContinue) {
        console.log("\nContact creation cancelled.\n");
        throw new Error("User cancelled due to duplicate");
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

  private async showSummaryAndEdit(
    data: EditableContactData,
  ): Promise<EditableContactData> {
    let editableData = { ...data };
    while (true) {
      const currentAllGroups = await this.fetchContactGroups();
      const currentSelectedLabelNames = editableData.labelResourceNames.map(
        (resourceName) => {
          const group = currentAllGroups.find(
            (g) => g.resourceName === resourceName,
          );
          return group ? group.name : resourceName;
        },
      );
      const firstLabelName =
        currentSelectedLabelNames.length > 0
          ? currentSelectedLabelNames[0]
          : "";
      const currentCompositeSuffix = [firstLabelName, editableData.company]
        .filter((s) => s)
        .join(" ");
      console.log("\n=== Contact Summary ===\n");
      if (currentSelectedLabelNames.length > 0) {
        console.log(`-Labels: ${currentSelectedLabelNames.join(" | ")}`);
      } else {
        console.log("-Labels: ");
      }
      console.log(`-Company: ${editableData.company || ""}`);
      const fullName =
        `${editableData.firstName} ${editableData.lastName}`.trim();
      if (currentCompositeSuffix) {
        console.log(
          `-Full name: ${fullName || ""} ${currentCompositeSuffix}`,
        );
      } else {
        console.log(`-Full name: ${fullName || ""}`);
      }
      console.log(`-Job Title: ${editableData.jobTitle || ""}`);
      if (editableData.emails.length === 1) {
        console.log(
          `-Email: ${editableData.emails[0]} ${currentCompositeSuffix || "other"}`,
        );
      } else if (editableData.emails.length > 1) {
        console.log("-Emails:");
        editableData.emails.forEach((email) => {
          console.log(`-${email} ${currentCompositeSuffix || "other"}`);
        });
      } else {
        console.log("-Email: ");
      }
      if (editableData.phones.length === 1) {
        console.log(
          `-Phone: ${editableData.phones[0]} ${currentCompositeSuffix || "other"}`,
        );
      } else if (editableData.phones.length > 1) {
        console.log("-Phones:");
        editableData.phones.forEach((phone) => {
          console.log(`-${phone} ${currentCompositeSuffix || "other"}`);
        });
      } else {
        console.log("-Phone: ");
      }
      if (editableData.linkedInUrl) {
        console.log(`-LinkedIn URL: ${editableData.linkedInUrl} LinkedIn`);
      } else {
        console.log("-LinkedIn URL: ");
      }
      console.log("");
      const validationResult =
        InputValidator.validateMinimumRequirements(editableData);
      const fieldLimitsResult =
        InputValidator.validateFieldLimits(editableData);
      const isValid = validationResult === true && fieldLimitsResult === true;
      const choices = [];
      if (isValid) {
        choices.push({ name: "✅ Create contact", value: "create" });
      } else {
        const errorMessage =
          validationResult !== true ? validationResult : fieldLimitsResult;
        choices.push({
          name: `✅ Create contact (disabled: ${errorMessage})`,
          value: "create_disabled",
          disabled: true,
        });
      }
      choices.push(
        { name: "🏷️  Edit labels", value: "edit_labels" },
        { name: "🏷️  Create new label", value: "create_label" },
        { name: "🏷️  Remove label", value: "remove_label" },
        { name: "🏢 Edit company", value: "edit_company" },
        { name: "🏢 Remove company", value: "remove_company" },
        { name: "👤 Edit first name", value: "edit_firstName" },
        { name: "👤 Edit last name", value: "edit_lastName" },
        { name: "💼 Edit job title", value: "edit_jobTitle" },
        { name: "💼 Remove job title", value: "remove_jobTitle" },
        { name: "📧 Edit email", value: "edit_email" },
        { name: "📧 Add email", value: "add_email" },
        { name: "📧 Remove email", value: "remove_email" },
        { name: "📱 Edit phone", value: "edit_phone" },
        { name: "📱 Add phone", value: "add_phone" },
        { name: "📱 Remove phone", value: "remove_phone" },
        { name: "🔗 Edit LinkedIn URL", value: "edit_linkedIn" },
        { name: "🔗 Remove LinkedIn URL", value: "remove_linkedIn" },
        { name: "❌ Cancel", value: "cancel" },
      );
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What would you like to do now?",
          loop: false,
          choices,
        },
      ]);
      if (action === "create") {
        break;
      }
      if (action === "cancel") {
        console.log("\nContact creation cancelled.\n");
        throw new Error("User cancelled");
      }
      editableData = await this.handleEditAction(action, editableData);
    }
    return editableData;
  }

  private async handleEditAction(
    action: string,
    data: EditableContactData,
  ): Promise<EditableContactData> {
    const newData = { ...data };
    if (action === "edit_labels") {
      newData.labelResourceNames = await this.promptForLabels();
    } else if (action === "create_label") {
      const currentGroups = await this.fetchContactGroups();
      const { labelName } = await inquirer.prompt([
        {
          type: "input",
          name: "labelName",
          message: "Enter new label name (type 'cancel' to go back):",
          validate: (input: string): boolean | string =>
            InputValidator.validateLabelName(input, currentGroups),
        },
      ]);
      if (labelName.trim().toLowerCase() !== "cancel") {
        const trimmedLabelName = labelName.trim();
        console.log(`Creating new label: ${trimmedLabelName}...`);
        const newGroupResourceName =
          await this.createContactGroup(trimmedLabelName);
        newData.labelResourceNames.push(newGroupResourceName);
        console.log(`Created label: ${trimmedLabelName}\n`);
      }
    } else if (action === "edit_email") {
      if (newData.emails.length === 0) {
        console.log("\nNo emails to edit. Please add an email first.\n");
      } else {
        const emailChoices = newData.emails.map((email, index) => ({
          name: email,
          value: index,
        }));
        const { emailIndex } = await inquirer.prompt([
          {
            type: "list",
            name: "emailIndex",
            message: "Select email to edit:",
            loop: false,
            choices: emailChoices,
          },
        ]);
        const { updatedEmail } = await inquirer.prompt([
          {
            type: "input",
            name: "updatedEmail",
            message: "📧 Email address (type 'cancel' to go back):",
            default: newData.emails[emailIndex],
            validate: (input: string): boolean | string => {
              const trimmed = input.trim().toLowerCase();
              if (trimmed === "cancel") {
                return true;
              }
              if (!input.trim()) {
                return "Email address cannot be empty. Type 'cancel' to go back.";
              }
              return InputValidator.validateUniqueEmail(
                input,
                newData.emails,
                emailIndex,
              );
            },
          },
        ]);
        if (updatedEmail.trim().toLowerCase() !== "cancel") {
          const trimmedEmail = updatedEmail.trim();
          const emailDuplicates =
            await this.duplicateDetector.checkDuplicateEmail(trimmedEmail);
          const shouldContinue =
            await this.duplicateDetector.promptForDuplicateContinue(
              emailDuplicates,
            );
          if (shouldContinue) {
            newData.emails[emailIndex] = trimmedEmail;
          }
        }
      }
    } else if (action === "add_email") {
      const { newEmail } = await inquirer.prompt([
        {
          type: "input",
          name: "newEmail",
          message: "📧 Email address (type 'cancel' to go back):",
          default: "",
          validate: (input: string): boolean | string => {
            const trimmed = input.trim().toLowerCase();
            if (trimmed === "cancel") {
              return true;
            }
            if (!input.trim()) {
              return "Email address cannot be empty. Type 'cancel' to go back.";
            }
            return InputValidator.validateUniqueEmail(input, newData.emails);
          },
        },
      ]);
      if (newEmail.trim().toLowerCase() !== "cancel") {
        const trimmedEmail = newEmail.trim();
        const emailDuplicates =
          await this.duplicateDetector.checkDuplicateEmail(trimmedEmail);
        const shouldContinue =
          await this.duplicateDetector.promptForDuplicateContinue(
            emailDuplicates,
          );
        if (shouldContinue) {
          newData.emails.push(trimmedEmail);
        }
      }
    } else if (action === "edit_phone") {
      if (newData.phones.length === 0) {
        console.log("\nNo phones to edit. Please add a phone first.\n");
      } else {
        const phoneChoices = newData.phones.map((phone, index) => ({
          name: phone,
          value: index,
        }));
        const { phoneIndex } = await inquirer.prompt([
          {
            type: "list",
            name: "phoneIndex",
            message: "Select phone to edit:",
            loop: false,
            choices: phoneChoices,
          },
        ]);
        const { updatedPhone } = await inquirer.prompt([
          {
            type: "input",
            name: "updatedPhone",
            message: "📱 Phone number (type 'cancel' to go back):",
            default: newData.phones[phoneIndex],
            validate: (input: string): boolean | string => {
              const trimmed = input.trim().toLowerCase();
              if (trimmed === "cancel") {
                return true;
              }
              if (!input.trim()) {
                return "Phone number cannot be empty. Type 'cancel' to go back.";
              }
              return InputValidator.validateUniquePhone(
                input,
                newData.phones,
                phoneIndex,
              );
            },
          },
        ]);
        if (updatedPhone.trim().toLowerCase() !== "cancel") {
          const trimmedPhone = updatedPhone.trim();
          const phoneDuplicates =
            await this.duplicateDetector.checkDuplicatePhone(trimmedPhone);
          const shouldContinue =
            await this.duplicateDetector.promptForDuplicateContinue(
              phoneDuplicates,
            );
          if (shouldContinue) {
            newData.phones[phoneIndex] = trimmedPhone;
          }
        }
      }
    } else if (action === "add_phone") {
      const { newPhone } = await inquirer.prompt([
        {
          type: "input",
          name: "newPhone",
          message: "📱 Phone number (type 'cancel' to go back):",
          default: "",
          validate: (input: string): boolean | string => {
            const trimmed = input.trim().toLowerCase();
            if (trimmed === "cancel") {
              return true;
            }
            if (!input.trim()) {
              return "Phone number cannot be empty. Type 'cancel' to go back.";
            }
            return InputValidator.validateUniquePhone(input, newData.phones);
          },
        },
      ]);
      if (newPhone.trim().toLowerCase() !== "cancel") {
        const trimmedPhone = newPhone.trim();
        const phoneDuplicates =
          await this.duplicateDetector.checkDuplicatePhone(trimmedPhone);
        const shouldContinue =
          await this.duplicateDetector.promptForDuplicateContinue(
            phoneDuplicates,
          );
        if (shouldContinue) {
          newData.phones.push(trimmedPhone);
        }
      }
    } else if (action === "edit_firstName") {
      const { newFirstName } = await inquirer.prompt([
        {
          type: "input",
          name: "newFirstName",
          message: "👤 First name:",
          default: newData.firstName,
          validate: InputValidator.validateText,
        },
      ]);
      newData.firstName = newFirstName.trim();
    } else if (action === "edit_lastName") {
      const { newLastName } = await inquirer.prompt([
        {
          type: "input",
          name: "newLastName",
          message: "👤 Last name:",
          default: newData.lastName,
          validate: InputValidator.validateText,
        },
      ]);
      newData.lastName = newLastName.trim();
    } else if (action === "edit_company") {
      const { newCompany } = await inquirer.prompt([
        {
          type: "input",
          name: "newCompany",
          message: "🏢 Company:",
          default: newData.company,
          validate: InputValidator.validateText,
        },
      ]);
      newData.company = TextUtils.formatCompanyToPascalCase(newCompany.trim());
    } else if (action === "edit_jobTitle") {
      const { newJobTitle } = await inquirer.prompt([
        {
          type: "input",
          name: "newJobTitle",
          message: "💼 Job Title:",
          default: newData.jobTitle,
          validate: InputValidator.validateText,
        },
      ]);
      newData.jobTitle = newJobTitle.trim();
    } else if (action === "remove_label") {
      if (newData.labelResourceNames.length === 0) {
        console.log("\nNo labels to remove.\n");
      } else if (newData.labelResourceNames.length === 1) {
        console.log("\n⚠️  Cannot remove the last label. At least one label is required.\n");
      } else {
        const currentGroups = await this.fetchContactGroups();
        const labelChoices = newData.labelResourceNames.map((resourceName) => {
          const group = currentGroups.find(
            (g) => g.resourceName === resourceName,
          );
          return {
            name: group ? group.name : resourceName,
            value: resourceName,
          };
        });
        labelChoices.push({ name: "Cancel", value: "cancel" });
        const { labelToRemove } = await inquirer.prompt([
          {
            type: "list",
            name: "labelToRemove",
            message: "Select label to remove:",
            loop: false,
            choices: labelChoices,
          },
        ]);
        if (labelToRemove !== "cancel") {
          newData.labelResourceNames = newData.labelResourceNames.filter(
            (resourceName) => resourceName !== labelToRemove,
          );
          console.log("\nLabel removed.\n");
        }
      }
    } else if (action === "remove_company") {
      newData.company = "";
      console.log("\nCompany removed.\n");
    } else if (action === "remove_jobTitle") {
      newData.jobTitle = "";
      console.log("\nJob title removed.\n");
    } else if (action === "remove_email") {
      if (newData.emails.length === 0) {
        console.log("\nNo emails to remove.\n");
      } else {
        const emailChoices = newData.emails.map((email, index) => ({
          name: email,
          value: index,
        }));
        emailChoices.push({ name: "Cancel", value: -1 });
        const { emailIndex } = await inquirer.prompt([
          {
            type: "list",
            name: "emailIndex",
            message: "Select email to remove:",
            loop: false,
            choices: emailChoices,
          },
        ]);
        if (emailIndex !== -1) {
          newData.emails.splice(emailIndex, 1);
          console.log("\nEmail removed.\n");
        }
      }
    } else if (action === "remove_phone") {
      if (newData.phones.length === 0) {
        console.log("\nNo phones to remove.\n");
      } else {
        const phoneChoices = newData.phones.map((phone, index) => ({
          name: phone,
          value: index,
        }));
        phoneChoices.push({ name: "Cancel", value: -1 });
        const { phoneIndex } = await inquirer.prompt([
          {
            type: "list",
            name: "phoneIndex",
            message: "Select phone to remove:",
            loop: false,
            choices: phoneChoices,
          },
        ]);
        if (phoneIndex !== -1) {
          newData.phones.splice(phoneIndex, 1);
          console.log("\nPhone removed.\n");
        }
      }
    } else if (action === "edit_linkedIn") {
      const { newLinkedInUrl } = await inquirer.prompt([
        {
          type: "input",
          name: "newLinkedInUrl",
          message: "🔗 LinkedIn URL (type 'cancel' to go back):",
          default: newData.linkedInUrl || "",
          validate: (input: string): boolean | string => {
            const trimmed = input.trim().toLowerCase();
            if (trimmed === "cancel") {
              return true;
            }
            return InputValidator.validateLinkedInUrl(input);
          },
        },
      ]);
      if (newLinkedInUrl.trim().toLowerCase() !== "cancel") {
        if (newLinkedInUrl.trim()) {
          const normalizedUrl = InputValidator.normalizeLinkedInUrl(newLinkedInUrl);
          const linkedInDuplicates =
            await this.duplicateDetector.checkDuplicateLinkedInUrl(normalizedUrl);
          const shouldContinue =
            await this.duplicateDetector.promptForDuplicateContinue(
              linkedInDuplicates,
            );
          if (shouldContinue) {
            newData.linkedInUrl = normalizedUrl;
          }
        } else {
          newData.linkedInUrl = undefined;
        }
      }
    } else if (action === "remove_linkedIn") {
      newData.linkedInUrl = undefined;
      console.log("\nLinkedIn URL removed.\n");
    }
    return newData;
  }

  private async createContact(data: EditableContactData): Promise<void> {
    const validationError = InputValidator.validateMinimumRequirements(data);
    if (validationError !== true) {
      console.log(`\n${validationError}\n`);
      throw new Error(validationError);
    }
    const service = google.people({ version: "v1", auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const finalAllGroups = await this.fetchContactGroups();
    const finalSelectedLabelNames = data.labelResourceNames.map(
      (resourceName) => {
        const group = finalAllGroups.find(
          (g) => g.resourceName === resourceName,
        );
        return group ? group.name : resourceName;
      },
    );
    const finalFirstLabelName =
      finalSelectedLabelNames.length > 0 ? finalSelectedLabelNames[0] : "";
    const finalCompositeSuffix = [finalFirstLabelName, data.company]
      .filter((s) => s)
      .join(" ");
    const finalLastNameValue = [data.lastName, finalCompositeSuffix]
      .filter((s) => s)
      .join(" ");
    const requestBody: CreateContactRequest = {};
    if (data.firstName || finalLastNameValue) {
      requestBody.names = [
        {
          givenName: data.firstName || undefined,
          familyName: finalLastNameValue || undefined,
        },
      ];
    }
    if (data.emails.length > 0) {
      requestBody.emailAddresses = data.emails.map((email) => ({
        value: email,
        type: finalCompositeSuffix || "other",
      }));
    }
    if (data.phones.length > 0) {
      requestBody.phoneNumbers = data.phones.map((phone) => ({
        value: phone,
        type: finalCompositeSuffix || "other",
      }));
    }
    if (data.company || data.jobTitle) {
      requestBody.organizations = [
        {
          name: data.company || undefined,
          title: data.jobTitle || undefined,
          type: "work",
        },
      ];
    }
    if (data.linkedInUrl) {
      requestBody.urls = [
        {
          value: data.linkedInUrl,
          type: "LinkedIn",
        },
      ];
    }
    if (data.labelResourceNames.length > 0) {
      requestBody.memberships = data.labelResourceNames.map((resourceName) => ({
        contactGroupMembership: {
          contactGroupResourceName: resourceName,
        },
      }));
    }
    if (Object.keys(requestBody).length === 0) {
      console.log("\nNo data provided. Contact creation cancelled.\n");
      return;
    }
    console.log("\nCreating new contact...");
    const response = await service.people.createContact({
      requestBody,
    });
    await apiTracker.trackWrite();
    const resourceName = response.data.resourceName;
    const displayName = response.data.names?.[0]?.displayName || "Unknown";
    const firstLabelName =
      finalSelectedLabelNames.length > 0 ? finalSelectedLabelNames[0] : "";
    const compositeSuffix = [firstLabelName, data.company]
      .filter((s) => s)
      .join(" ");
    console.log("Contact created successfully!");
    console.log(`Resource Name: ${resourceName}`);
    console.log(`Display Name: ${displayName}`);
    console.log(`-Labels: ${finalSelectedLabelNames.join(" | ") || ""}`);
    console.log(`-Company: ${data.company || ""}`);
    const fullName = `${data.firstName} ${data.lastName}`.trim();
    if (compositeSuffix) {
      console.log(`-Full name: ${fullName} ${compositeSuffix}`);
    } else {
      console.log(`-Full name: ${fullName}`);
    }
    console.log(`-Job Title: ${data.jobTitle || ""}`);
    if (data.emails.length === 1) {
      console.log(`-Email: ${data.emails[0]} ${compositeSuffix || "other"}`);
    } else if (data.emails.length > 1) {
      console.log("-Emails:");
      data.emails.forEach((email) => {
        console.log(`-${email} ${compositeSuffix || "other"}`);
      });
    } else {
      console.log("-Email: ");
    }
    if (data.phones.length === 1) {
      console.log(`-Phone: ${data.phones[0]} ${compositeSuffix || "other"}`);
    } else if (data.phones.length > 1) {
      console.log("-Phones:");
      data.phones.forEach((phone) => {
        console.log(`-${phone} ${compositeSuffix || "other"}`);
      });
    } else {
      console.log("-Phone: ");
    }
    if (data.linkedInUrl) {
      console.log(`-LinkedIn URL: ${data.linkedInUrl} LinkedIn`);
    } else {
      console.log("-LinkedIn URL: ");
    }
    console.log("");
  }

  private async promptForLabels(): Promise<string[]> {
    console.log("\n=== Select Labels ===\n");
    const existingGroups = await this.fetchContactGroups();
    let selectedResourceNames: string[] = [];
    if (existingGroups.length > 0) {
      const choices = existingGroups.map((group) => ({
        name: group.name,
        value: group.resourceName,
      }));
      const { selectedLabels } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "selectedLabels",
          message: "🏷️  Select labels (Press enter to skip or to continue):",
          choices,
          pageSize: SETTINGS.DISPLAY_PAGE_SIZE,
          loop: false,
          instructions: " ",
        },
      ]);
      selectedResourceNames = selectedLabels;
    } else {
      console.log("No existing labels found.\n");
    }
    return selectedResourceNames;
  }

  private async fetchContactGroups(): Promise<ContactGroup[]> {
    const service = google.people({ version: "v1", auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const contactGroups: ContactGroup[] = [];
    let pageToken: string | undefined;
    do {
      const response = await service.contactGroups.list({
        pageSize: SETTINGS.API_PAGE_SIZE,
        pageToken,
      });
      await apiTracker.trackRead();
      const groups = response.data.contactGroups || [];
      contactGroups.push(
        ...groups
          .filter(
            (group) =>
              group.resourceName &&
              group.name &&
              group.groupType === "USER_CONTACT_GROUP",
          )
          .map((group) => ({
            resourceName: group.resourceName!,
            name: group.name!,
          })),
      );
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return contactGroups.sort((a, b) => a.name.localeCompare(b.name, "en-US"));
  }

  private async createContactGroup(name: string): Promise<string> {
    const service = google.people({ version: "v1", auth: this.auth });
    const apiTracker = ApiTracker.getInstance();
    const response = await service.contactGroups.create({
      requestBody: {
        contactGroup: {
          name,
        },
      },
    });
    await apiTracker.trackWrite();
    return response.data.resourceName!;
  }
}
