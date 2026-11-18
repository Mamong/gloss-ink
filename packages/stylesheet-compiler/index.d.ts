export type Diagnostic = (level: 'error' | 'warning', code: string, file: string, offset: number, message: string) => void;
export type ReadSource = (file: string, optional?: boolean) => string | null;
export interface StylesheetSettings {
  keyframeScope?: string;
  virtualHost?: boolean;
  sharing?: boolean;
  owner?: string;
  [name: string]: unknown;
}
export interface StylesheetCompiler {
  compile(entries: string[], read: ReadSource, asset: (url: string, from: string, offset: number) => string,
    diagnostic: Diagnostic, scope?: string, customTags?: string[], settings?: StylesheetSettings): string;
  externalRules(css: string, owner?: string): Record<string, string[]>;
  owned(css: string, owner: string): string;
}
export function createStylesheetCompiler(options?: {tags?: Iterable<string>}): StylesheetCompiler;
export function createLessCompiler(options: {
  read: ReadSource; exists(file: string): boolean; diagnostic: Diagnostic; root(): string;
  common?(): string | undefined; records?: unknown[];
}): {compile(output: string): string | null; location(file: string, index: number): unknown; records: unknown[]; generated(): string[]};
