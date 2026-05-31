import Enquirer from 'enquirer';
import type {
  PromptResult,
  SelectChoice,
  SelectConfig,
  InputConfig,
  ConfirmConfig,
  CheckboxChoice,
  CheckboxConfig,
} from '../types';
import { SearchableSelect } from './searchableSelect';
import { SearchableMultiSelect } from './searchableMultiselect';

export {
  PromptResult,
  SelectChoice,
  SelectConfig,
  InputConfig,
  ConfirmConfig,
  CheckboxChoice,
  CheckboxConfig,
};

export class EscapeSignal extends Error {
  constructor() {
    super('User pressed ESC to go back');
    this.name = 'EscapeSignal';
  }
}

const POST_ESC_DELAY_MS = 120;
const ESC_GUARD_MS = 200;

let lastEscTimestamp: number | null = null;

function recordEsc(): void {
  lastEscTimestamp = Date.now();
}

function msSinceLastEsc(): number {
  if (lastEscTimestamp === null) return Infinity;
  return Date.now() - lastEscTimestamp;
}

function patchCancel(prompt: any): void {
  let cancelled = false;
  const originalCancel = prompt.cancel.bind(prompt);

  prompt.cancel = (err?: any): any => {
    const age = msSinceLastEsc();
    if (age < ESC_GUARD_MS) {
      return; // swallow phantom cancel from readline timer
    }
    if (cancelled) return;
    cancelled = true;
    recordEsc();
    return originalCancel(err);
  };
}

// ─── unified runner ───────────────────────────────────────────────────────────

async function runPrompt<T>(
  buildPrompt: () => any,
  extractValue: (result: any) => T
): Promise<PromptResult<T>> {
  const wait = POST_ESC_DELAY_MS - msSinceLastEsc();
  if (wait > 0) {
    await new Promise<void>((r) => setTimeout(r, wait));
  }

  if (process.stdin.isTTY) {
    process.stdin.resume();
    if (typeof process.stdin.setRawMode === 'function') {
      // Keep stdin in cooked mode before creating a prompt.
      // On Windows, lingering raw mode can break Ctrl+V paste in input prompts.
      process.stdin.setRawMode(false);
    }
  }

  let escaped = false;
  let value: T | undefined;
  let prompt: any;

  try {
    prompt = buildPrompt();
    patchCancel(prompt);

    const result = await prompt.run();
    value = extractValue(result);
  } catch {
    escaped = true;
  } finally {
    // 1. Restore cursor visibility immediately
    if (process.stdout.isTTY) {
      process.stdout.write('\u001b[?25h'); // show cursor
      process.stdout.write('\u001b[?12l'); // disable cursor blinking
    }

    // 2. Gentle prompt cleanup
    if (prompt) {
      try {
        if (typeof prompt.close === 'function') {
          await Promise.resolve(prompt.close()).catch(() => {});
        }
        if (prompt.rl && typeof prompt.rl.close === 'function') {
          prompt.rl.close();
        }
      } catch (_) {}
    }

    // 3. Minimal stdin reset
    // We NO LONGER setRawMode(false) or pause() here.
    // Toggling raw mode too quickly on Windows breaks subsequent prompts.
    // If a script needs non-raw mode, it can set it itself, but for a
    // mostly-interactive CLI, staying in raw mode is safer.
  }

  return escaped ? { escaped: true } : { escaped: false, value: value as T };
}

// ─── public API ───────────────────────────────────────────────────────────────

export function selectWithEscape<T = string>(
  config: SelectConfig<T> & { searchable?: boolean }
): Promise<PromptResult<T>> {
  const choiceNames = config.choices.map((c) => c.name || String(c.value));
  const defaultIndex = config.default
    ? config.choices.findIndex((c) => c.value === config.default)
    : 0;

  return runPrompt<T>(
    (): any => {
      const PromptClass = config.searchable
        ? SearchableSelect
        : (Enquirer as any).Select;
      return new PromptClass({
        type: 'select',
        name: 'value',
        message: config.message,
        choices: choiceNames,
        initial: defaultIndex >= 0 ? defaultIndex : 0,
        limit: config.pageSize || 5,
        loop: config.loop ?? true,
        // ← NEW: ESC is now handled in the normal action pipeline
        escape(): void {
          this.cancel();
        },
      });
    },
    (result: any): T => {
      const choice = (
        config.choices as Array<{ name?: string; value: T }>
      ).find((c) => (c.name || String(c.value)) === result);
      return choice ? choice.value : (result as T);
    }
  );
}

export function inputWithEscape(
  config: InputConfig
): Promise<PromptResult<string>> {
  return runPrompt<string>(
    (): any => {
      const { Input } = Enquirer as any;
      return new Input({
        type: 'input',
        name: 'value',
        message: config.message,
        initial: config.default || '',
        validate: config.validate as any,
        // ← NEW: ESC is now handled in the normal action pipeline
        escape(): void {
          this.cancel();
        },
      });
    },
    (result: any): string => result as string
  );
}

export function confirmWithEscape(
  config: ConfirmConfig
): Promise<PromptResult<boolean>> {
  return runPrompt<boolean>(
    (): any => {
      const { Confirm } = Enquirer as any;
      return new Confirm({
        type: 'confirm',
        name: 'value',
        message: config.message,
        initial: config.default ?? false,
        // ← NEW: ESC is now handled in the normal action pipeline
        escape(): void {
          this.cancel();
        },
      });
    },
    (result: any): boolean => result as boolean
  );
}

export function checkboxWithEscape<T = string>(
  config: CheckboxConfig<T>
): Promise<PromptResult<T[]>> {
  return runPrompt<T[]>(
    (): any => {
      const choiceConfigs = config.choices.map((c) => ({
        name: c.name || String(c.value),
        value: c.name || String(c.value),
        enabled: c.checked || false,
      }));
      const promptConfig: any = {
        name: 'value',
        message: config.message,
        choices: choiceConfigs,
        validate: config.validate as any,
        escape(): void {
          this.cancel();
        },
      };
      if (config.pageSize) {
        promptConfig.limit = config.pageSize;
      }
      return new (SearchableMultiSelect as any)(promptConfig);
    },
    (selectedNames: string[]): T[] => {
      return selectedNames.map((name: string) => {
        const choice = config.choices.find(
          (c) => (c.name || String(c.value)) === name
        );
        return choice ? choice.value : (name as unknown as T);
      });
    }
  );
}

export function searchableSelectWithEscape<T = string>(
  config: SelectConfig<T>
): Promise<PromptResult<T>> {
  return runPrompt<T>(
    (): any => {
      const choiceConfigs = config.choices.map((c) => ({
        name: c.name || String(c.value),
        value: c.name || String(c.value),
      }));

      return new (SearchableSelect as any)({
        name: 'value',
        message: config.message,
        choices: choiceConfigs,
        limit: config.pageSize || 10,
        escape(): void {
          this.cancel();
        },
      });
    },
    (selectedName: string): T => {
      const choice = config.choices.find(
        (c) => (c.name || String(c.value)) === selectedName
      );
      return choice ? choice.value : (selectedName as unknown as T);
    }
  );
}

export function resetEscapeManagerForTesting(): void {}
