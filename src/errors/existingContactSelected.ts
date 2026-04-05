import type { ContactData } from '../types';

export class ExistingContactSelected extends Error {
  constructor(public readonly contact: ContactData) {
    super('User selected existing contact');
    this.name = 'ExistingContactSelected';
  }
}
