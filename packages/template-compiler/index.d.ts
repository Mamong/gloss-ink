export type Diagnostic = (level: 'error' | 'warning', code: string, file: string, offset: number, message: string) => void;
export interface TemplateSchema {
  readonly tags: Iterable<string>;
  readonly events: Iterable<string>;
  readonly common: Iterable<string>;
  readonly properties: Readonly<Record<string, readonly string[]>>;
  readonly icons: Readonly<Record<string, string>>;
}
export interface TemplateSettings {
  read?(file: string, optional?: boolean): string | null;
  components?: string[];
  component?: boolean;
  onWxs?(bundle: unknown): void;
  [name: string]: unknown;
}
export interface TemplateCompiler {
  /** Returns the existing template factory source; it is not GlassEasel bytecode. */
  compile(source: string, file: string, diagnostic: Diagnostic, settings?: TemplateSettings): string;
  parse(source: string, file: string, diagnostic: Diagnostic): unknown;
  documents(source: string, file: string, diagnostic: Diagnostic, settings?: TemplateSettings): unknown;
  readonly tags: Set<string>;
  literal(value: unknown): string;
}
export function createTemplateCompiler(schema: TemplateSchema): TemplateCompiler;
