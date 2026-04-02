export type PromptResult<T> = { escaped: true } | { escaped: false; value: T };

export interface SelectChoice<T = string> {
  name?: string;
  value: T;
  description?: string;
  disabled?: boolean | string;
}

export interface SelectConfig<T = string> {
  message: string;
  choices: ReadonlyArray<SelectChoice<T>>;
  default?: T;
  loop?: boolean;
  pageSize?: number;
}

export interface InputConfig {
  message: string;
  default?: string;
  validate?: (input: string) => boolean | string | Promise<boolean | string>;
  transformer?: (input: string, context: { isFinal: boolean }) => string;
}

export interface ConfirmConfig {
  message: string;
  default?: boolean;
  transformer?: (value: boolean) => string;
}

export interface CheckboxChoice<T = string> {
  name?: string;
  value: T;
  checked?: boolean;
  disabled?: boolean | string;
}

export interface CheckboxConfig<T = string> {
  message: string;
  choices: ReadonlyArray<CheckboxChoice<T>>;
  loop?: boolean;
  pageSize?: number;
  validate?: (items: T[]) => boolean | string | Promise<boolean | string>;
}

export interface ClipboardReadResult {
  content: string;
  sizeBytes: number;
}
