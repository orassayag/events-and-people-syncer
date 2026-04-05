import Enquirer from 'enquirer';

type Choice = {
  name: string;
  value: any;
};

type KeypressEvent = {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
};

const PASSTHROUGH_KEYS = new Set([
  'up', 'down', 'return', 'enter', 'escape',
  'tab', 'pageup', 'pagedown', 'home', 'end',
]);

export class SearchableSelect extends (Enquirer as any).Select {
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
      return super.dispatch(s, key);
    }

    if (key?.name === 'backspace') {
      if (this.searchTerm.length > 0) {
        this.searchTerm = this.searchTerm.slice(0, -1);
      }
    } else {
      this.searchTerm += s;
    }

    this._applyFilter();
    await this.render();
  }

  private _applyFilter(): void {
    if (!this._allChoices) return;
    const term = this.searchTerm.toLowerCase();
    const filtered = this._allChoices
      .filter((c: Choice) => c.name.toLowerCase().includes(term));
    
    this.choices = filtered;
    this.index = Math.min(this.index, filtered.length - 1);
    if (this.index < 0) this.index = 0;
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
