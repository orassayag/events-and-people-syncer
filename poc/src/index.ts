import inquirer from 'inquirer';
import { validateEnvironment } from './config.js';
import { AuthService, ContactReader, ContactWriter, ContactDeleter } from './services/index.js';

const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');

if (isVerbose) {
  process.env.VERBOSE_MODE = 'true';
}

async function main(): Promise<void> {
  validateEnvironment();
  const authService = new AuthService();
  const auth = await authService.authorize();
  const contactReader = new ContactReader(auth);
  const contactWriter = new ContactWriter(auth);
  const contactDeleter = new ContactDeleter(auth);
  let continueRunning = true;
  while (continueRunning) {
    console.log('\n=== Google People API POC ===\n');
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'What would you like to do?',
        loop: false,
        choices: [
          { name: '📖 Read and display all contacts', value: 'read' },
          { name: '➕ Add new contact', value: 'add' },
          { name: '📝 Add note to contact', value: 'addNote' },
          { name: '🗑️  Delete all contacts', value: 'delete' },
          { name: '🚪 Exit', value: 'exit' },
        ],
      },
    ]);
    try {
      switch (choice) {
        case 'read':
          await contactReader.displayContacts();
          break;
        case 'add':
          await contactWriter.addContact();
          break;
        case 'addNote':
          await contactWriter.addNoteToContact();
          break;
        case 'delete':
          await contactDeleter.deleteAllContacts();
          break;
        case 'exit':
          console.log('\nGoodbye!\n');
          continueRunning = false;
          break;
        default:
          console.log('\nInvalid choice.\n');
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'User cancelled' || error.message === 'User cancelled due to duplicate') {
          continue;
        }
        console.error('\nError:', error.message);
      } else {
        console.error('\nAn unknown error occurred');
      }
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
