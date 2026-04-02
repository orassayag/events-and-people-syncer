declare module 'enquirer' {
  interface Choice {
    name: string;
    enabled?: boolean;
  }
  
  interface KeypressEvent {
    name?: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
  }
  
  class MultiSelect {
    choices: Choice[];
    index: number;
    limit: number;
    styles: { muted: (s: string) => string };
    initialize(): Promise<void>;

    dispatch(s: string | undefined, key: KeypressEvent): Promise<void>;

    render(): Promise<void>;
  }
}
