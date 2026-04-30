import Enquirer from 'enquirer';
import fs from 'fs';
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

function dlog(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync('debug_esc.txt', `[${timestamp}] [prompts] ${msg}\n`);
}

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
  dlog(`recordEsc: t=${lastEscTimestamp}`);
}

function msSinceLastEsc(): number {
  if (lastEscTimestamp === null) return Infinity;
  return Date.now() - lastEscTimestamp;
}

function patchCancel(prompt: any): void {
  let cancelled = false;
  const originalCancel = prompt.cancel.bind(prompt);

  prompt.cancel = async (err?: any) => {
    const age = msSinceLastEsc();
    if (age < ESC_GUARD_MS) {
      dlog(`cancel() BLOCKED — ESC bleed (age=${age}ms)`);
      return; // swallow phantom cancel from readline timer
    }
    if (cancelled) return;
    cancelled = true;
    dlog(`cancel() ALLOWED (age=${age}ms)`);
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
    dlog(`runPrompt: waiting ${Math.round(wait)}ms for readline ESC timers`);
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

    dlog('runPrompt: prompt.run() starting');
    const result = await prompt.run();
    dlog(`runPrompt: prompt.run() resolved — ${JSON.stringify(result)}`);
    value = extractValue(result);
  } catch (err) {
    dlog(`runPrompt: prompt.run() rejected — ${err}`);
    escaped = true;
  } finally {
    dlog('runPrompt: starting cleanup');

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

    dlog('runPrompt: cleanup finished');
  }

  return escaped ? { escaped: true } : { escaped: false, value: value as T };
}

// ─── public API ───────────────────────────────────────────────────────────────

export function selectWithEscape<T = string>(
  config: SelectConfig<T>
): Promise<PromptResult<T>> {
  const choiceNames = config.choices.map((c) => c.name || String(c.value));
  const defaultIndex = config.default
    ? config.choices.findIndex((c) => c.value === config.default)
    : 0;

  return runPrompt<T>(
    () => {
      const { Select } = Enquirer as any;
      return new Select({
        type: 'select',
        name: 'value',
        message: config.message,
        choices: choiceNames,
        initial: defaultIndex >= 0 ? defaultIndex : 0,
        limit: config.pageSize || 5,
        loop: config.loop ?? true,
        // ← NEW: ESC is now handled in the normal action pipeline
        escape() {
          this.cancel();
        },
      });
    },
    (result) => {
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
    () => {
      const { Input } = Enquirer as any;
      return new Input({
        type: 'input',
        name: 'value',
        message: config.message,
        initial: config.default || '',
        validate: config.validate as any,
        // ← NEW: ESC is now handled in the normal action pipeline
        escape() {
          this.cancel();
        },
      });
    },
    (result) => result as string
  );
}

export function confirmWithEscape(
  config: ConfirmConfig
): Promise<PromptResult<boolean>> {
  return runPrompt<boolean>(
    () => {
      const { Confirm } = Enquirer as any;
      return new Confirm({
        type: 'confirm',
        name: 'value',
        message: config.message,
        initial: config.default ?? false,
        // ← NEW: ESC is now handled in the normal action pipeline
        escape() {
          this.cancel();
        },
      });
    },
    (result) => result as boolean
  );
}

export async function checkboxWithEscape<T = string>(
  config: CheckboxConfig<T>
): Promise<PromptResult<T[]>> {
  return runPrompt<T[]>(
    () => {
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
        escape() {
          this.cancel();
        },
      };
      if (config.pageSize) {
        promptConfig.limit = config.pageSize;
      }
      return new (SearchableMultiSelect as any)(promptConfig);
    },
    (selectedNames: string[]) => {
      return selectedNames.map((name: string) => {
        const choice = config.choices.find(
          (c) => (c.name || String(c.value)) === name
        );
        return choice ? choice.value : (name as unknown as T);
      });
    }
  );
}

export async function searchableSelectWithEscape<T = string>(
  config: SelectConfig<T>
): Promise<PromptResult<T>> {
  return runPrompt<T>(
    () => {
      const choiceConfigs = config.choices.map((c) => ({
        name: c.name || String(c.value),
        value: c.value,
      }));
      const promptConfig: any = {
        name: 'value',
        message: config.message,
        choices: choiceConfigs,
        escape() {
          this.cancel();
        },
      };
      if (config.pageSize) {
        promptConfig.limit = config.pageSize;
      }
      return new (SearchableSelect as any)(promptConfig);
    },
    (result: string) => {
      const finalChoice = config.choices.find(
        (c) => (c.name || String(c.value)) === result
      );
      return finalChoice ? finalChoice.value : (result as unknown as T);
    }
  );
}

export function resetEscapeManagerForTesting(): void {}
