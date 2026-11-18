import type * as Builtin from './ports/builtin';
import type {CanvasTools, CanvasOptions} from './canvas-types';
export interface QueryFields {
  id?: boolean; dataset?: boolean; rect?: boolean; size?: boolean; scrollOffset?: boolean;
  computedStyle?: string[]; properties?: string[]; node?: boolean; context?: boolean;
}
export type QueryOperation =
  | (({selector: string; viewport: false} | {selector: null; viewport: true}) & {all: boolean; fields: QueryFields; node?: false})
  | {selector: string; all: false; viewport: false; node: true; fields?: never};
export type QueryResult = Record<string, unknown> | Record<string, unknown>[] | null;
export type QueryCallback<T = QueryResult> = (value: T) => void | Promise<void>;
export interface QuerySelection {
  boundingClientRect(callback?: QueryCallback): SelectorQuery;
  scrollOffset(callback?: QueryCallback): SelectorQuery;
  context(callback?: QueryCallback): SelectorQuery;
  fields(value: QueryFields, callback?: QueryCallback): SelectorQuery;
  node(callback?: QueryCallback): SelectorQuery;
}
export interface SelectorQuery {
  in(target: object): SelectorQuery;
  select(value: string): QuerySelection;
  selectAll(value: string): QuerySelection;
  selectViewport(): QuerySelection;
  exec(callback?: QueryCallback<QueryResult[]>): Promise<QueryResult[]>;
}
export interface EditorCallbacks {
  success?(value: Record<string, unknown> & {errMsg: string}): void | Promise<void>;
  fail?(value: {errMsg: string; errCode: string}): void | Promise<void>;
  complete?(value: {errMsg: string}): void | Promise<void>;
}
export type EditorContext = {
  [K in Exclude<Builtin.EditorCommand, 'format'>]: (options?: Record<string, unknown> & EditorCallbacks) => void;
} & {format(name: string, value: unknown): void};
export interface MeasureOptions extends CanvasOptions {
  contextMarker?: boolean;
  editorMarker?(element: HTMLElement): unknown;
  nodeMarker?(element: HTMLCanvasElement): unknown;
}
export interface SelectorQueryTools extends CanvasTools {
  selector(value: string): string;
  fields(value: QueryFields): QueryFields;
  create<S>(options: {
    scope: S; resolveScope?(target: object): S; live(scope: S): boolean;
    execute(scope: S, operations: QueryOperation[]): QueryResult[] | Promise<QueryResult[]>;
    report?(error: unknown): void;
  }): SelectorQuery;
  editorContext(execute: Builtin.EditorExecute, report?: (error: unknown) => void): Readonly<EditorContext>;
  measure(root: Builtin.BrowserRoot, mount: HTMLElement, operations: QueryOperation[],
    select?: (selector: string) => HTMLElement[], metadata?: (element: HTMLElement) => {dataset: Record<string, string>},
    viewport?: HTMLElement, options?: MeasureOptions): QueryResult[];
  queryAll(mount: ParentNode, selector: string): HTMLElement[];
}
