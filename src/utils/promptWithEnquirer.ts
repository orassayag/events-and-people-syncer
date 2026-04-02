import Enquirer from 'enquirer';
import type { PromptResult, SelectChoice, SelectConfig, InputConfig, ConfirmConfig, CheckboxChoice, CheckboxConfig } from '../types';
import { SearchableMultiSelect } from './searchableMultiselect';

export { PromptResult, SelectChoice, SelectConfig, InputConfig, ConfirmConfig, CheckboxChoice, CheckboxConfig };

export class EscapeSignal extends Error {
  constructor() {
    super('User pressed ESC to go back');
    this.name = 'EscapeSignal';
  }
}

let enquirerInstance: any = null;

function getEnquirer(): any {
  if (!enquirerInstance) {
    enquirerInstance = new (Enquirer as any)();
  }
  return enquirerInstance;
}

async function enquirerPrompt<T>(
  promptConfig: any,
  choices?: Array<{ name?: string; value: T }>
): Promise<PromptResult<T>> {
  try {
    const enquirer = getEnquirer();
    const result: any = await enquirer.prompt(promptConfig);
    const selectedText = result[promptConfig.name];
    if (choices && promptConfig.type === 'select') {
      const choice = choices.find(
        (c) => (c.name || String(c.value)) === selectedText
      );
      return {
        escaped: false,
        value: choice ? choice.value : (selectedText as T),
      };
    }
    return { escaped: false, value: selectedText as T };
  } catch (error) {
    enquirerInstance = null;
    if (
      error instanceof Error &&
      error.message.includes('ERR_USE_AFTER_CLOSE')
    ) {
      return { escaped: true };
    }
    return { escaped: true };
  }
}

export function selectWithEscape<T = string>(
  config: SelectConfig<T>
): Promise<PromptResult<T>> {
  const choiceNames = config.choices.map((c) => c.name || String(c.value));
  const defaultIndex = config.default
    ? config.choices.findIndex((c) => c.value === config.default)
    : 0;
  return enquirerPrompt<T>(
    {
      type: 'select',
      name: 'value',
      message: config.message,
      choices: choiceNames,
      initial: defaultIndex >= 0 ? defaultIndex : 0,
      limit: config.pageSize || 5,
      loop: config.loop ?? true,
    },
    config.choices as Array<{ name?: string; value: T }>
  );
}

export function inputWithEscape(
  config: InputConfig
): Promise<PromptResult<string>> {
  return enquirerPrompt<string>({
    type: 'input',
    name: 'value',
    message: config.message,
    initial: config.default || '',
    validate: config.validate as any,
  });
}

export async function confirmWithEscape(
  config: ConfirmConfig
): Promise<PromptResult<boolean>> {
  try {
    const enquirer = getEnquirer();
    const result: any = await enquirer.prompt({
      type: 'confirm',
      name: 'value',
      message: config.message,
      initial: config.default ?? false,
    });
    return { escaped: false, value: result.value };
  } catch {
    enquirerInstance = null;
    return { escaped: true };
  }
}

export async function checkboxWithEscape<T = string>(
  config: CheckboxConfig<T>
): Promise<PromptResult<T[]>> {
  try {
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
    };
    if (config.pageSize) {
      promptConfig.limit = config.pageSize;
    }
    const prompt: any = new (SearchableMultiSelect as any)(promptConfig);
    const selectedNames: string[] = await prompt.run();
    const selectedValues = selectedNames.map((name: string) => {
      const choice = config.choices.find(
        (c) => (c.name || String(c.value)) === name
      );
      return choice ? choice.value : (name as unknown as T);
    });
    return { escaped: false, value: selectedValues };
  } catch {
    enquirerInstance = null;
    return { escaped: true };
  }
}

export function resetEscapeManagerForTesting(): void {}
