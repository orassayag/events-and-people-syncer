import { EMOJIS } from './emojis';

export const UI_CONSTANTS = {
  MESSAGES: {
    WELCOME: 'Google People API POC',
    GOODBYE: 'Goodbye!',
    EXIT_SCRIPT: 'Exit script',
    CONTACT_CREATED: 'Contact created successfully',
    CONTACT_CANCELLED: 'Contact creation cancelled',
    FETCHING_CONTACTS: 'Fetching contacts from Google People API',
    ESC_GOING_BACK: 'Going back',
    ESC_CANCELLED: 'Cancelled',
  },
  PROMPTS: {
    COMPANY: `${EMOJIS.FIELDS.COMPANY} Company:`,
    FULL_NAME: `${EMOJIS.FIELDS.PERSON} Full name:`,
    JOB_TITLE: `${EMOJIS.FIELDS.JOB_TITLE} Job Title:`,
    EMAIL: `${EMOJIS.FIELDS.EMAIL} Email address:`,
    PHONE: `${EMOJIS.FIELDS.PHONE} Phone number:`,
    LINKEDIN: `${EMOJIS.FIELDS.LINKEDIN} LinkedIn URL:`,
  },
  MENU_CHOICES: {
    READ_CONTACTS: 'Read and display all contacts',
    ADD_CONTACT: 'Add new contact',
    EXIT: 'Exit',
  },
};
