import type {ViewProtocol} from './ports/backend';
import type * as Core from './ports/engine';
import type * as Builtin from './ports/builtin';
import type {ComponentViewTools} from './view-types';
import type {SelectorQueryTools, QueryOperation, QueryResult} from './query-types';
export * from './view-types';
export * from './query-types';
export * from './canvas-types';

export type Dictionary = Core.Dictionary;
export type Receipt = import('./ports/backend').Receipt;
export type ErrorType = Builtin.ErrorConstructor;
export type BrowserRoot = Builtin.BrowserRoot;
export type WxsFactory = typeof import('./ports/wxs');
export type TemplateFactory = (lookup: (scope: Core.TemplateScope, key: string) => unknown,
  read: (value: unknown, key: string | number) => unknown, string: (value: unknown) => string,
  createWxs: WxsFactory | undefined) => Core.TemplateProgram;
export interface DomBackendFactories {
  templates: Readonly<Record<string, TemplateFactory>>;
  componentPlaceholders?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  usingComponents: Readonly<Record<string, Readonly<Record<string, string>>>>;
  assets: Readonly<Record<string, string>>;
  componentOptions: Readonly<Record<string, {virtualHost?: boolean; styleIsolation?: 'isolated' | 'shared' | 'apply-shared'}>>;
  componentStyles: Readonly<Record<string, string>>;
  componentScopedStyles?: Readonly<Record<string, string>>;
  styleTokens: Readonly<Record<string, string>>;
  externalStyleRules: Readonly<Record<string, Readonly<Record<string, string[]>>>>;
  sharedStyleRules?: Readonly<Record<string, string[]>>;
  advancedComponents?: boolean;
  componentViews: typeof createComponentViews;
  logicalEvents: typeof Core.createLogicalEvents;
  projectionPlanner: typeof Core.createProjectionPlanner;
  childReconciler: typeof Core.createChildReconciler;
  templateEvaluator: typeof Core.createTemplateEvaluator;
  builtinComponents: typeof Builtin.createBrowserComponents;
  interactions: typeof Builtin.createWeappInteractions;
  textInput: typeof Builtin.createTextInputRuntime;
  formRuntime: typeof Builtin.createFormRuntime;
  selectorQuery: typeof createSelectorQueryTools;
  componentSelector: typeof Core.createComponentSelector;
  remoteImageOrigins?: readonly string[];
  wxsRuntime?: WxsFactory;
  regionData?: Builtin.RegionEntry[];
  accessibility?: typeof Builtin.createAccessibility;
  webViewRuntime?: typeof Builtin.createWebViewRuntime;
  cameraRuntime?: typeof Builtin.createCameraRuntime;
  videoRuntime?: typeof Builtin.createVideoRuntime;
  mapRuntime?: typeof Builtin.createMapRuntime;
  pickerRuntime?: typeof Builtin.createPickerRuntime;
  virtualList?: typeof Builtin.createVirtualLists;
  backToTop?: typeof Builtin.createBackToTop;
  nativeComponents?: typeof Builtin.createNativeComponents;
  interactiveComponents?: typeof Builtin.createInteractiveComponents;
  layerComponents?: typeof Builtin.createLayerComponents;
  editorRuntime?: typeof Builtin.createEditorRuntime;
  keyboardAccessory?: typeof Builtin.createKeyboardAccessoryRuntime;
  pageMeta?: typeof Builtin.createPageMeta;
  matchMedia?: typeof Builtin.matchesViewport;
}
export interface PageEntry {route: string; template: string; styles: string}
export type PageResourceBinding =
  | {pageResources?: undefined; pageEntries?: Readonly<Record<string, PageEntry>>}
  | {pageResources: {acquire(entry: PageEntry): () => void}; pageEntries: Readonly<Record<string, PageEntry>>};
export type DomBackendConfig = DomBackendFactories & PageResourceBinding;
export interface DomPlacement {
  mount: HTMLElement | import('./view-types').VirtualRange;
  pageMount?: HTMLElement;
  generics?: Record<string, string>;
  virtual?: boolean;
  styleRoot?: ParentNode;
  externalStyle?: {textContent: string | null};
  sharedStyle?: {textContent: string | null};
  pageRoute?: string;
  parking?: HTMLElement | import('./view-types').VirtualRange;
  eventParent?(): import('./view-types').DomEventNode | undefined;
  parentId?: string;
  visible?: boolean;
  /** Page-owned deferred injection state, shared only with descendant views. */
  lazyState?: {ready: Set<string>; failed: Set<string>; jobs: Map<string, Promise<unknown>>; views: Set<() => void>; closed: boolean};
}
export interface DomView {
  render(): Receipt | void;
  /** Tokens come from the instance registry callback table, never function values. */
  schedule(callbackToken?: number): void;
  markChanges(patch: Dictionary): void;
  project(nodes: unknown[]): void;
  query(operations: QueryOperation[]): QueryResult[] | Promise<QueryResult[]>;
  visibility(visible: boolean): void;
  show(): Receipt | void;
  hide(): void;
  destroy(): void | Promise<unknown>;
  isIdle(): boolean;
  refreshControls(): void;
  refreshCamera(): void;
  moved(): unknown;
  pageLifetime(name: string, value?: unknown): unknown;
  setExternal(classes: Record<string, string>, rules: Record<string, string[]>): void;
  back(): boolean;
  canvasNode(nodeId: string): HTMLCanvasElement;
  camera(method: string, value?: Dictionary): unknown;
  video(method: Builtin.VideoCommand, value?: Dictionary): Dictionary | Promise<Dictionary>;
  map(method: Builtin.MapCommand, value?: Dictionary): Dictionary;
  editor(nodeId: string, method: Builtin.EditorCommand, value?: Dictionary): Dictionary;
}
export type InstanceView = Core.InstanceView;
export interface DomBackendEnvironment {
  root: BrowserRoot;
  Error?: ErrorType;
  trackCommit?(done?: Promise<unknown>): void;
  config: DomBackendConfig;
  instances: Pick<Core.InstanceDriver, 'request' | 'connect'>;
  visual: Core.InstanceRegistry['visual'];
  viewProtocol: Pick<ViewProtocol, 'connect'>;
  customEvents?: WeakMap<object, unknown>;
  metrics?: Dictionary;
  remote?: boolean;
  canvasTransfer?: {resize(element: HTMLElement, axis: string, size: number): boolean; visibility(id: string, visible: boolean): void};
  wrap?(id: string, view: DomView): DomView;
}
export function createDomBackend(environment: DomBackendEnvironment): (instanceId: string, route: string, placement?: DomPlacement) => DomView;
export function createComponentViews(root: {document: Document}, logicalEvents: Core.LogicalEvents): ComponentViewTools;
/** Protocol declarations are generated from the platform-neutral backend. */
export {createViewProtocol} from './ports/backend';
export type {ProtocolOptions, ProtocolInspection, ProtocolLogic, ProtocolReceiver, ViewProtocol, ScheduleTimeout, CancelTimeout} from './ports/backend';
export function createSelectorQueryTools(): SelectorQueryTools;

/** Core-owned declarations are bundled locally so this package has no type-only peers. */
export type ChildIdentity = Core.ChildIdentity;
export type ChildPlan<T extends ChildIdentity> = Core.ChildPlan<T>;
export type TemplateEvaluation = ReturnType<typeof Core.createTemplateEvaluator>;
