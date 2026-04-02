export interface InitialContactData {
  labelResourceNames: string[];
  company: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  emails: string[];
  phones: string[];
  linkedInUrl?: string;
}

export interface EditableContactData {
  firstName: string;
  lastName: string;
  company?: string;
  jobTitle?: string;
  emails: string[];
  phones: string[];
  linkedInUrl?: string;
  labelResourceNames: string[];
}
