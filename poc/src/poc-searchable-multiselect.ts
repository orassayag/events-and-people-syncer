#!/usr/bin/env tsx
import Enquirer from 'enquirer';

interface Choice {
  name: string;
  value?: string;
  enabled?: boolean;
}

interface KeypressEvent {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

const PASSTHROUGH_KEYS = new Set([
  'up',
  'down',
  'return',
  'enter',
  'escape',
  'tab',
  'pageup',
  'pagedown',
  'home',
  'end',
  'space',
]);

class SearchableMultiSelect extends (Enquirer as any).MultiSelect {
  private searchTerm: string = '';
  private _allChoices: Choice[] | null = null;

  async initialize(): Promise<void> {
    await super.initialize();
    this._allChoices = this.choices.slice();
  }

  async dispatch(s: string | undefined, key: KeypressEvent): Promise<void> {
    const isPassthrough =
      !s ||
      key?.ctrl ||
      key?.meta ||
      PASSTHROUGH_KEYS.has(key?.name ?? '');
    if (isPassthrough) {
      this._syncSelections();
      return super.dispatch(s, key);
    }
    if (key?.name === 'backspace') {
      this.searchTerm = this.searchTerm.slice(0, -1);
    } else if (s) {
      this.searchTerm += s;
    }
    this._applyFilter();
    await this.render();
  }

  private _syncSelections(): void {
    if (!this._allChoices) return;
    for (const choice of this.choices) {
      const master = this._allChoices.find((c: Choice) => c.name === choice.name);
      if (master) {
        master.enabled = choice.enabled;
      }
    }
  }

  private _applyFilter(): void {
    if (!this._allChoices) return;
    const term = this.searchTerm.toLowerCase();
    const filtered = this._allChoices.filter((c: Choice) =>
      c.name.toLowerCase().includes(term)
    );
    this.choices = filtered;
    this.index = Math.min(this.index, filtered.length - 1);
    if (this.index < 0) this.index = 0;
  }

  result(): string[] {
    this._syncSelections();
    const source = this._allChoices ?? this.choices;
    return source.filter((c: Choice) => c.enabled === true).map((c: Choice) => c.name);
  }

  async header(): Promise<string> {
    const cursor = '█';
    const matchCount = this.choices.length;
    const totalCount = this._allChoices?.length ?? 0;
    return this.styles.muted(
      `  Search: ${this.searchTerm}${cursor} (${matchCount}/${totalCount} matches)`
    );
  }
}

interface ContactGroup {
  resourceName: string;
  name: string;
  memberCount?: number;
}

function generateMockContactGroups(): ContactGroup[] {
  const groups: ContactGroup[] = [
    { resourceName: 'contactGroups/1', name: 'Work', memberCount: 42 },
    { resourceName: 'contactGroups/2', name: 'Family', memberCount: 15 },
    { resourceName: 'contactGroups/3', name: 'Friends', memberCount: 87 },
    { resourceName: 'contactGroups/4', name: 'Job Interviews', memberCount: 23 },
    { resourceName: 'contactGroups/5', name: 'Clients', memberCount: 56 },
    { resourceName: 'contactGroups/6', name: 'Suppliers', memberCount: 12 },
    { resourceName: 'contactGroups/7', name: 'Colleagues', memberCount: 34 },
    { resourceName: 'contactGroups/8', name: 'University', memberCount: 45 },
    { resourceName: 'contactGroups/9', name: 'Sports Team', memberCount: 18 },
    { resourceName: 'contactGroups/10', name: 'Book Club', memberCount: 8 },
    { resourceName: 'contactGroups/11', name: 'Gym Buddies', memberCount: 7 },
    { resourceName: 'contactGroups/12', name: 'Photography Club', memberCount: 14 },
    { resourceName: 'contactGroups/13', name: 'Church', memberCount: 65 },
    { resourceName: 'contactGroups/14', name: 'Neighbors', memberCount: 11 },
    { resourceName: 'contactGroups/15', name: 'High School', memberCount: 28 },
    { resourceName: 'contactGroups/16', name: 'Startup Network', memberCount: 91 },
    { resourceName: 'contactGroups/17', name: 'Tech Meetup', memberCount: 103 },
    { resourceName: 'contactGroups/18', name: 'Vendors', memberCount: 19 },
    { resourceName: 'contactGroups/19', name: 'Investment Group', memberCount: 6 },
    { resourceName: 'contactGroups/20', name: 'Volunteer Work', memberCount: 22 },
  ];
  return groups;
}

function sortContactGroups(groups: ContactGroup[]): ContactGroup[] {
  return groups.sort((a, b) => {
    const countA = a.memberCount ?? 0;
    const countB = b.memberCount ?? 0;
    if (countB !== countA) {
      return countB - countA;
    }
    return a.name.localeCompare(b.name, 'en-US');
  });
}

async function testSearchableMultiselect(): Promise<void> {
  console.clear();
  console.log('='.repeat(60));
  console.log('POC: Searchable MultiSelect with Popularity Sorting');
  console.log('='.repeat(60));
  console.log('');
  console.log('Testing:');
  console.log('  1. Contact groups sorted by popularity (memberCount)');
  console.log('  2. Real-time search/filter by typing');
  console.log('  3. Selection preservation during filtering');
  console.log('');
  console.log('Instructions:');
  console.log('  • Type to filter labels in real-time');
  console.log('  • Use ↑/↓ arrows to navigate');
  console.log('  • Press SPACE to select/deselect');
  console.log('  • Press BACKSPACE to clear search');
  console.log('  • Press ENTER to confirm selection');
  console.log('  • Press ESC to cancel');
  console.log('');
  console.log('Mock Data: 20 contact groups with varying member counts');
  console.log('');
  console.log('-'.repeat(60));
  console.log('');
  const mockGroups = generateMockContactGroups();
  console.log('Before Sorting (alphabetical):');
  mockGroups.slice(0, 5).forEach((g) => {
    console.log(`  ${g.name}: ${g.memberCount} members`);
  });
  console.log('  ...');
  console.log('');
  const sortedGroups = sortContactGroups([...mockGroups]);
  console.log('After Sorting (by popularity):');
  sortedGroups.slice(0, 5).forEach((g) => {
    console.log(`  ${g.name}: ${g.memberCount} members`);
  });
  console.log('  ...');
  console.log('');
  console.log('-'.repeat(60));
  console.log('');
  const choices = sortedGroups.map((group) => ({
    name: `${group.name} (${group.memberCount} contacts)`,
    value: group.resourceName,
    enabled: false,
  }));
  try {
    const prompt = new SearchableMultiSelect({
      name: 'labels',
      message: 'Select labels (Type to search, Space to toggle):',
      choices,
      limit: 10,
    });
    const selectedNames = await prompt.run();
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ Selection completed!');
    console.log('='.repeat(60));
    console.log('');
    console.log(`You selected ${selectedNames.length} label(s):`);
    selectedNames.forEach((name: string, index: number) => {
      const group = sortedGroups.find((g) =>
        name.startsWith(g.name)
      );
      if (group) {
        console.log(`  ${index + 1}. ${group.name} (${group.memberCount} contacts)`);
      } else {
        console.log(`  ${index + 1}. ${name}`);
      }
    });
    console.log('');
    console.log('Resource names:');
    const selectedResourceNames = selectedNames.map((name: string) => {
      const group = sortedGroups.find((g) =>
        name.startsWith(g.name)
      );
      return group?.resourceName ?? 'unknown';
    });
    console.log(`  ${selectedResourceNames.join(', ')}`);
    console.log('');
  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    console.log('❌ Selection cancelled (ESC pressed)');
    console.log('='.repeat(60));
    console.log('');
  }
}

testSearchableMultiselect().catch((error) => {
  console.error('Error running POC:', error);
  process.exit(1);
});
