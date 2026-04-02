export class EmailNormalizer {
  static normalize(email: string): string {
    return email.toLowerCase().trim();
  }

  static emailsMatch(email1: string, email2: string): boolean {
    return (
      EmailNormalizer.normalize(email1) === EmailNormalizer.normalize(email2)
    );
  }
}
