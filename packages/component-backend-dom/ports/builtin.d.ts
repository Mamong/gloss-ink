// Generated from builtin-components/index.d.ts; SHA-256 f57baa5fec0ab2be86a974174ae508e668747a9b46a0545e1b319f9d2b8dbedc
// Regenerate with npm run types:component-ports
export interface BuiltinCatalog {
  readonly tags: readonly string[];
  readonly nodeNames: Readonly<Record<string, string>>;
  readonly icons: Readonly<Record<string, string>>;
  readonly events: readonly string[];
  readonly common: readonly string[];
  readonly properties: Readonly<Record<string, readonly string[]>>;
}
export function createBuiltinCatalog(): BuiltinCatalog;
export interface ViewNode {tag: string; attrs: Record<string, unknown>; dataset?: Record<string, unknown>; origin?: string; forced?: string[]}
export interface ErrorConstructor {new(message: string, options?: {code?: string; cause?: unknown}): Error}
export interface BuiltinDefinition {
  nodeName: string;
  create?(element: HTMLElement, node: ViewNode): void;
  created?(element: HTMLElement, node: ViewNode): void;
  attributes?(element: HTMLElement, next: Record<string, unknown>, old: Record<string, unknown> | undefined, node: ViewNode): void;
  remove?(element: HTMLElement, node: ViewNode): void;
}
export interface BuiltinRegistry {
  register(name: string, definition: BuiltinDefinition, options?: {replace?: boolean}): BuiltinRegistry;
  has(name: string): boolean;
  names(): string[];
  nodeName(name: string, custom?: boolean): string;
  create(element: HTMLElement, node: ViewNode): void;
  created(element: HTMLElement, node: ViewNode): void;
  patchAttributes(element: HTMLElement, node: ViewNode, old?: Record<string, unknown>): void;
  remove(element: HTMLElement, node: ViewNode): void;
}
export function createBuiltinRegistry(options?: {Error?: ErrorConstructor}): BuiltinRegistry;
export interface BrowserServices<N extends ViewNode = ViewNode> {
  Error?: ErrorConstructor;
  string?(value: unknown): string;
  style?(value: unknown, origin?: string): string;
  classNames?(value: unknown): string;
  asset?(value: unknown, origin?: string): string;
  node?(element: HTMLElement): N | undefined;
  interactive?(node: N): boolean;
  emit?(element: HTMLElement, name: string, detail: unknown): void;
  live?(): boolean;
  schedule?(): void;
  remoteImages?: Map<string, {data?: string; error?: string}>;
  deferImage?(element: HTMLElement, source: string, ready: () => void): boolean;
  textInputs?: {value(element: HTMLElement, value: string): boolean};
  accessibility?: {validate(attrs: Record<string, unknown>): void};
  owner?: string;
  canvasTransfer?: {resize(element: HTMLElement, axis: string, size: number): boolean};
}
export interface BrowserComponents extends BuiltinRegistry {
  attributes(element: HTMLElement, old: Record<string, unknown> | undefined, node: ViewNode): void;
}
export function createBrowserComponents<N extends ViewNode = ViewNode>(root: {document: Document}, options?: BrowserServices<N>): BrowserComponents;
export function createBrowserAttributes<N extends ViewNode = ViewNode>(options: BrowserServices<N> & {root: {document: Document}; registry: BuiltinRegistry}): BrowserComponents['attributes'];
export function patchProgress(element: HTMLElement, attrs: Record<string, unknown>, Error: ErrorConstructor, emit: (name: string, detail: unknown) => void): void;

export type BrowserRoot = Pick<Window, 'document' | 'setTimeout' | 'clearTimeout' | 'addEventListener' | 'removeEventListener'> & Partial<Window>;
export interface TextInputOptions<N extends ViewNode = ViewNode> {
  Error: ErrorConstructor;
  scope: string;
  styleRoot: ParentNode;
  style(value: unknown): string;
  classes(value: unknown): string;
  live(node: N): boolean;
  emit(element: HTMLElement, name: string, detail: unknown): void;
  invalidate(node: N): void;
  height(node: N): string;
  accessoryHeight?(element: HTMLElement): number;
}
export interface TextInputRuntime<N extends ViewNode = ViewNode> {
  create(element: HTMLElement, node: N): void;
  patch(element: HTMLElement, node: N, old?: N): void;
  flush(nodes?: N[]): void;
  remove(element: HTMLElement): void;
  keyboard(): void;
  result(element: HTMLElement, value: string | {value: string; cursor?: number}): void;
  value(element: HTMLElement, value: string): boolean;
  visibility(visible: boolean): void;
  dispose(): void;
}
export function createTextInputRuntime<N extends ViewNode = ViewNode>(root: BrowserRoot, options: TextInputOptions<N>): TextInputRuntime<N>;
export interface InteractionRuntime<N extends ViewNode = ViewNode> {
  create(element: HTMLElement, node: N, owner: string): void;
  patch(element: HTMLElement, node: N): void;
  flush(): void;
  remove(element: HTMLElement): void;
  cancelOwner(owner: string): void;
  disposeOwner(owner: string): void;
  live(node: N | undefined): boolean;
}
export function createWeappInteractions<N extends ViewNode = ViewNode>(root: BrowserRoot, options: {
  Error: ErrorConstructor;
  path(node: N): N[];
  emit(node: N, name: string, detail: unknown, original: Event): boolean;
}): InteractionRuntime<N>;
export interface FormOptions {
  scope: number;
  mount: HTMLElement;
  live(): boolean;
  node(element: HTMLElement): ViewNode | undefined;
  changed(): void;
  component(element: HTMLElement): {id: string; formField: boolean; name: string; value: unknown} | null;
  resetField(id: string, value: unknown): void;
  picker?: {value(element: HTMLElement): unknown; reset(element: HTMLElement): void};
}
export function createFormRuntime(root: BrowserRoot, Error: ErrorConstructor, options: FormOptions): {
  create(element: HTMLElement, tag: string): void;
  sync(nodes: ViewNode[]): void;
  detail(node: ViewNode, event: Event): {value: unknown} | Record<string, never> | null;
};

/** Opaque physical metadata for a backend's virtual host/range. */
export interface VirtualElement {readonly virtualRange: true; readonly isConnected: boolean}
export interface ControllerTextNode {tag: '#text'; text: string; element: Text; identity?: string; key?: string}
export interface ControllerNode extends ViewNode {
  element: HTMLElement | VirtualElement;
  children?: Array<ControllerNode | ControllerTextNode>;
  logicalParent?: ControllerNode;
  viewNodeId?: string;
}
export type ComponentEmit = (element: HTMLElement, name: string, detail: unknown) => void;
export interface BrowserController {
  create(element: HTMLElement, tag: string): void;
  patch(element: HTMLElement, node: ControllerNode, old?: ControllerNode): void;
  flush(): void;
  remove(element: HTMLElement): void;
  visibility(visible: boolean): void;
  dispose(): void;
}
export interface RegionEntry {name: string; code?: string; children?: RegionEntry[]}
export interface PickerRuntime extends BrowserController {
  value(element: HTMLElement): number | string | number[] | string[] | undefined;
  reset(element: HTMLElement): void;
  ownsEvent(tag: string, name: string): boolean;
}
export function createPickerRuntime(root: BrowserRoot, options: {
  Error: ErrorConstructor; regionData?: RegionEntry[]; live(): boolean;
  emit: ComponentEmit; report(error: Error): void;
}): PickerRuntime;
export type EditorCommand = 'format' | 'getContents' | 'setContents' | 'clear' | 'insertText' | 'insertImage' |
  'insertDivider' | 'insertCustomBlock' | 'deleteText' | 'setSelection' | 'getBounds' | 'getSelection' |
  'getSelectionText' | 'getHistoryState' | 'undo' | 'redo' | 'removeFormat' | 'blur' | 'scrollIntoView';
export type EditorExecute = (method: EditorCommand, value?: Record<string, unknown>) => Record<string, unknown>;
export interface EditorRuntime extends BrowserController {
  prepare(element: HTMLElement): void;
  identify(element: HTMLElement, nodeId: string): void;
  execute(nodeId: string, method: EditorCommand, value?: Record<string, unknown>): Record<string, unknown>;
}
export function createEditorRuntime(root: BrowserRoot, options: {
  Error: ErrorConstructor; scope: string; live(): boolean; emit: ComponentEmit;
  asset(value: string, origin?: string): string;
  createContext(execute: EditorExecute): object;
}): EditorRuntime;
export interface NativeComponentsOptions {
  Error: ErrorConstructor; live(): boolean; emit: ComponentEmit;
  asset(value: string, origin?: string): string;
  find(id: string): HTMLElement | undefined;
  imageStatus?(source: string): {pending?: boolean} | undefined;
  backToTop?: BackToTopRuntime;
}
export interface EventController extends BrowserController {ownsEvent(tag: string, name: string): boolean}
export function createNativeComponents(root: BrowserRoot, options: NativeComponentsOptions): EventController;
export function createInteractiveComponents(root: BrowserRoot, options: {
  Error: ErrorConstructor; live(): boolean; emit: ComponentEmit;
  style(value: unknown): string; classes(value: unknown): string;
}): EventController;
export function createLayerComponents(root: BrowserRoot, options: {
  Error: ErrorConstructor; scope: string; page: HTMLElement; styleRoot: ParentNode; theme?: string;
  live(): boolean; style(value: unknown): string; emit: ComponentEmit;
}): BrowserController & {back(): boolean};
export interface VirtualListRange {start: number; end: number; top: number; bottom: number; length: number; itemHeight: number}
export function createVirtualLists(root: BrowserRoot, options: {invalidate(): void}): {
  range(key: string, length: number, attrs?: Record<string, unknown>, findIndex?: (id: string) => number, forced?: string[]): VirtualListRange;
  attach(key: string, element: HTMLElement, rows: HTMLElement[]): void;
  remove(key: string): void;
  flush(): void;
  dispose(): void;
};
export interface CameraHostResult {id?: string; maxZoom?: number; preview?: string; [name: string]: unknown}
export type CameraHost = (method: string, value: Record<string, unknown>) => Promise<CameraHostResult>;
export function createCameraRuntime(root: BrowserRoot, options: {
  Error: ErrorConstructor; live(element: HTMLElement): boolean; emit: ComponentEmit; host: CameraHost;
}): BrowserController & {execute(method: string, value?: Record<string, unknown>): Promise<CameraHostResult>};
export function createKeyboardAccessoryRuntime<N extends ControllerNode = ControllerNode>(root: BrowserRoot, options: {
  Error: ErrorConstructor; mount: HTMLElement; live(node: N): boolean; layout(): void;
}): BrowserController & {children(element: HTMLElement, node: N): HTMLElement | null; height(element: HTMLElement): number};
export interface BackToTopRecord {props(): Record<string, unknown>; live(): boolean}
export interface ScrollPhysics {
  key: number; fast: boolean; x: number; y: number; width: number; height: number;
  contentWidth: number; contentHeight: number; depth: number;
}
export interface BackToTopState {enabled: boolean; epoch: number; physics: ScrollPhysics[]; viewport: {width: number}}
export interface BackToTopRuntime {
  register(element: HTMLElement, record: BackToTopRecord): void;
  remove(element: HTMLElement): void;
  refresh(force?: boolean): void;
  visibility(visible: boolean): void;
  request(epoch: number): boolean;
  inspect(): {epoch: number; visible: boolean; count: number; eligible: HTMLElement[]};
}
/** A host may observe geometry; sending native bridge messages belongs to its adapter. */
export function createBackToTop(root: BrowserRoot, options?: {publish?(state: BackToTopState): void}): BackToTopRuntime;
export function createPageMeta(root: BrowserRoot, options: {
  Error: ErrorConstructor; mount: HTMLElement; live(): boolean; style(value: unknown): string;
  emit: ComponentEmit; send(value: {window: Record<string, unknown>; navigation: Record<string, unknown>}): unknown;
}): {
  validate(nodes: ControllerNode[]): void;
  update(nodes: ControllerNode[]): unknown;
  flush(): void; resize(): void; visibility(visible: boolean): void; dispose(): void;
};
export function matchesViewport(attrs: Record<string, unknown>, width: number, height: number, Error: ErrorConstructor): boolean;
export type VideoCommand = 'play' | 'pause' | 'stop' | 'seek' | 'playbackRate' | 'requestFullScreen' | 'exitFullScreen' |
  'sendDanmu' | 'showStatusBar' | 'hideStatusBar' | 'enableAutoRotation';
export function createVideoRuntime(root: BrowserRoot, options: {
  Error: ErrorConstructor;
  find(id: unknown): HTMLVideoElement | undefined;
  live(element: HTMLVideoElement): boolean;
}): {
  execute(method: VideoCommand, value?: Record<string, unknown>): Record<string, unknown> | Promise<Record<string, unknown>>;
  detail(element: HTMLVideoElement, name: string): {currentTime: number; duration: number; width?: number; height?: number};
  remove(element: HTMLElement): void; visibility(visible: boolean): void; dispose(): void;
};
export type MapCommand = 'getCenterLocation' | 'getRegion' | 'getScale' | 'getRotate' | 'getSkew' | 'getMapInfo' |
  'moveToLocation' | 'includePoints' | 'addMarkers' | 'removeMarkers' | 'translateMarker' | 'setCenterOffset' | 'openMapApp';
export function createMapRuntime(root: BrowserRoot, options: {
  Error: ErrorConstructor; find(id: unknown): HTMLElement | undefined;
  node(element: HTMLElement): ControllerNode; live(element: HTMLElement): boolean; emit: ComponentEmit;
}): {
  execute(method: MapCommand, value?: Record<string, unknown>): Record<string, unknown>;
  patch(element: HTMLElement, node: ViewNode): void; remove(element: HTMLElement): void; dispose(): void;
};
export function createAccessibility(root: BrowserRoot, options: {Error: ErrorConstructor}): {
  validate(attrs: Record<string, unknown>): void;
  handled(event: Event): boolean;
  scope(settings: {live(): boolean; activate(element: HTMLElement, event: KeyboardEvent): void}): {
    patch(element: HTMLElement, node: ControllerNode): void;
    flush(): void; remove(element: HTMLElement): void; visibility(visible: boolean): void; dispose(): void;
  };
};
