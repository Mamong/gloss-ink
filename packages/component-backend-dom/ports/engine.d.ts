// Generated from component-engine/index.d.ts; SHA-256 3db28e8aa699167913a16162478a487f852003dce116d3d59b7cc70317b1ee17
// Regenerate with npm run types:component-ports
export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
export type Data = Record<string, JsonValue>;
export type Dictionary = Record<string, unknown>;

export class ComponentError extends Error {
  readonly code: string;
  readonly cause?: unknown;
  constructor(message: string, options?: {code?: string; cause?: unknown});
}

/** Execution ownership, e.g. scoped timers disposed with their business instance. */
export interface ExecutionContext {
  run<T>(owner: object, callback: () => T): T;
  dispose(owner: object): void;
}

/** Acknowledges backend submission; this does not promise pixels are on screen. */
export type RenderReceipt =
  | {readonly settled: true; readonly done?: Promise<unknown>}
  | {readonly settled: false; readonly done: Promise<unknown>};

export interface ComponentInstance {
  data: Dictionary;
  properties: Dictionary;
  id: string;
  dataset: Data;
  setData(changes: Data, callback?: () => void): void;
  triggerEvent(name: string, detail?: JsonValue, options?: {bubbles?: boolean; composed?: boolean; capturePhase?: boolean}): void;
  hasBehavior(token: object | string): boolean;
  getRelationNodes(key: string): ComponentInstance[];
  selectComponent(selector: string): unknown;
  selectAllComponents(selector: string): unknown[];
  [key: string]: unknown;
}

/** Minimum submission interface; transport and physical rendering are supplied externally. */
export interface RenderBackend {render(): RenderReceipt | void}

export interface ComponentView extends RenderBackend {
  markChanges(changes: Data): void;
  destroy(): void;
  select(selector: string, all: boolean): unknown;
  pageLifetime?(name: string, value: unknown): void;
}

export interface ComponentController {
  readonly instance: ComponentInstance;
  readonly relations: Dictionary;
  readonly options: {virtualHost: boolean; styleIsolation: string};
  readonly formField: boolean;
  readonly externalClasses: string[];
  setView(view: ComponentView): void;
  properties(attrs: Dictionary, dataset: Data, forced?: string[]): void;
  snapshot(): Data;
  restore(data: Data): void;
  attach(): RenderReceipt | void;
  move(): void;
  pageLifetime(name: string, value: unknown): void;
  exported(): unknown;
  destroy(): void;
}

export interface ComponentConnection {
  attached(): boolean;
  linked?(): void;
  relations?(key: string): ComponentInstance[];
  query?(): unknown;
}

export interface ComponentEngine {
  Behavior(definition: Dictionary): object;
  create(definition: Dictionary, source: string, connection: ComponentConnection, attrs: Dictionary,
    dataset: Data, dispatch: (name: string, detail: JsonValue, options: Dictionary) => void,
    notify: () => void): ComponentController;
}
export function createComponentEngine(options?: {execution?: ExecutionContext}): ComponentEngine;

export interface DataTools {
  clone<T extends JsonValue>(value: T): T;
  patch(data: Data, changes: Data): Data;
  pathParts(path: string): string[];
  error(message: string, code?: string): ComponentError;
  readonly forbidden: Set<string>;
}
export function createDataTools(): DataTools;
export interface BehaviorEngine {
  define(definition: Dictionary): object;
  normalize(definition: Dictionary): Dictionary;
  isBehavior(value: unknown): boolean;
  metadata(definition: Dictionary): unknown;
}
export function createBehaviorEngine(clone: DataTools['clone'], error: DataTools['error']): BehaviorEngine;

export interface LogicalNode {
  nodeId: string;
  parentNodeId: string | null;
  tag: string;
  elementId: string;
  classes: string[];
  componentId?: string | null;
}
export interface SelectorPart {tag?: string; id?: string; classes: string[]; relation: string}
export interface ComponentSelector {
  parse(selector: string): SelectorPart[];
  matchesNode(node: LogicalNode, parts: SelectorPart[], nodes: Map<string, LogicalNode>): boolean;
}
export function createComponentSelector(error?: (message: string) => Error): ComponentSelector;

/** Supply a validated JSON codec; the engine has no dependency on a transport. */
export interface InstancePortCodec {
  snapshot<T>(value: T): T;
  inputResult(value: unknown): string | {value: string; cursor?: number} | undefined;
  readonly limits: {readonly nodes: number};
}
export interface PageOwner {data: Dictionary; change(): void}
export interface InstanceDescriptor {
  id: string;
  kind: 'page' | 'component';
  source: string;
  parentId?: string;
  formField?: boolean;
  externalClasses?: string[];
  options?: ComponentController['options'];
  generics?: Record<string, string>;
}
export interface InstanceView {
  render(): RenderReceipt | void;
  markChanges(changes: Data): void;
  destroy(): void;
  dispatch?(event: Dictionary): void;
  query?(operations: unknown): unknown;
  mount?(): unknown;
  [key: string]: unknown;
}
export interface PlatformScope {
  id: string;
  source: string;
  kind: 'page' | 'component';
  page: PageOwner;
  live(): boolean;
}
export interface InstancePlatform {
  registerPage?(page: PageOwner, id: string): void;
  release?(id: string): void;
  navigate?(attrs: Dictionary, scope?: PlatformScope): unknown;
  request?(scope: PlatformScope, method: string, value: Dictionary): unknown;
  attachPage?(page: PageOwner, node: unknown): void;
  applyAnimation?(page: PageOwner, node: unknown, value: unknown): void;
  clearAnimation?(page: PageOwner, node: unknown): void;
}
export interface InstanceCommand {version: 1; ownerId: string; method: string; value?: unknown}
export interface InstanceDriver {
  request(command: InstanceCommand): unknown;
  connect(id: string, view: InstanceView): void;
  detach(id: string): unknown;
  reconnect(id: string): void;
  connected(id: string): unknown;
}
export interface InstanceRegistry {
  registerPage(page: PageOwner, source: string): InstanceDescriptor;
  readonly driver: InstanceDriver;
  readonly visual: {
    attachPage(id: string, node: unknown): void;
    applyAnimation(id: string, node: unknown, value: unknown): void;
    clearAnimation(id: string, node: unknown): void;
    changed(id: string): void;
  };
  select(id: string, selector: string, all: boolean): unknown;
  query(target: object): unknown;
  mount(target: object): unknown;
  scope(target: object): {id: string; page: PageOwner; live(): boolean; view(): InstanceView | undefined} | null;
  snapshot(id: string): JsonValue;
  restore(id: string, saved: JsonValue): void;
  destroy(id: string): void;
  callback(id: string, callback?: () => void): number | undefined;
  inspect(): {instances: number; components: number; placements: number};
}
export function createInstanceRegistry(options: {
  engine: ComponentEngine;
  port: InstancePortCodec;
  execution?: ExecutionContext;
  selector?: ComponentSelector;
  platform?: InstancePlatform;
  usingComponents: Record<string, Record<string, string>>;
  resolveComponent(source: string): Dictionary;
  componentGenerics?: Record<string, Record<string, {default?: string}>>;
  componentOptions?: Record<string, {virtualHost?: boolean; styleIsolation?: string}>;
  queryTools?: {create(options: Dictionary): unknown};
  metrics?: Dictionary;
}): InstanceRegistry;

export interface LogicalEventOriginal {
  readonly type?: string;
  readonly timeStamp?: number;
  readonly defaultPrevented?: boolean;
  readonly isTrusted?: boolean;
  readonly detail?: unknown;
  stopPropagation?(): void;
  preventDefault?(): void;
}
export interface LogicalEventBinding {name: string; handler: string; capture: boolean; stop?: boolean; mut?: boolean}
export interface LogicalEventNode {
  attrs: Dictionary;
  tag: string;
  events?: LogicalEventBinding[];
  logicalParent?: LogicalEventNode;
  projectedParent?: LogicalEventNode | null;
  eventView: {
    live(): boolean;
    parent?(): LogicalEventNode | undefined;
    send(node: LogicalEventNode, binding: LogicalEventBinding, detail: unknown, target: LogicalEventNode, original: LogicalEventOriginal): void;
  };
}
export interface LogicalEvents {
  path(source: LogicalEventNode, composed?: boolean): LogicalEventNode[];
  key(binding: LogicalEventBinding): string;
  route(source: LogicalEventNode, name: string, detail: unknown,
    settings?: {bubbles?: boolean; composed?: boolean; capturePhase?: boolean; onHandle?(): void}, original?: LogicalEventOriginal): boolean;
}
export function createLogicalEvents(): LogicalEvents;
export interface ProjectionNode {attrs?: Dictionary; projectedParent?: ProjectionNode | null}
export interface ProjectionPlanner {
  assign<T extends ProjectionNode>(slot: T, nodes: T[], previous?: T[], identity?: (node: T) => unknown): {assigned: T[]; released: T[]};
  link(slot: ProjectionNode, nodes: ProjectionNode[]): void;
  release(node: ProjectionNode, slot: ProjectionNode, current?: ProjectionNode): boolean;
  prepare(nodes: ProjectionNode[]): void;
}
export function createProjectionPlanner(): ProjectionPlanner;
export function createViewConnection<T extends RenderBackend>(backend: T): T;

/** Pure sibling matching. Physical movement and lifecycle delivery belong to the backend. */
export interface ChildIdentity {tag: string; key?: string; identity?: string}
export interface ChildPlan<T extends ChildIdentity> {
  removeFirst: T[];
  entries: Array<{node: T; previous: T | undefined}>;
  removeLast: T[];
}
export function createChildReconciler(): {plan<T extends ChildIdentity>(previous: readonly T[], next: readonly T[]): ChildPlan<T>};

export type TemplateScope = Record<string, unknown>;
export type TemplateExpression<T = unknown> = ((scope: TemplateScope) => T) & {dependencies?: readonly string[]};
export interface TemplateEvent {name: string; value: TemplateExpression; capture: boolean; stop?: boolean; mut?: boolean}
export interface TemplateElement {
  kind: 'element'; tag: string; origin?: string;
  attrs: Record<string, TemplateExpression>;
  events: TemplateEvent[];
  nodes: TemplateNode[];
}
export type TemplateNode = TemplateElement |
  {kind: 'text'; value: TemplateExpression} |
  {kind: 'block'; nodes: TemplateNode[]} |
  {kind: 'if'; branches: Array<{test?: TemplateExpression; nodes: TemplateNode[]}>} |
  {kind: 'for'; id: string; value: TemplateExpression; item: string; index: string; key?: string; nodes: TemplateNode[]} |
  {kind: 'template'; owner: string; name: TemplateExpression; data: TemplateExpression};
export type TemplateProgram = TemplateNode[] & {templates?: Record<string, Record<string, TemplateNode[]>>; wxs?: {reset(): void}};
export interface ExpandedNode extends ChildIdentity {
  text?: string;
  origin?: string;
  attrs?: Dictionary;
  dataset?: Dictionary;
  forced?: string[];
  events?: Array<TemplateEvent & {handler: string}>;
  children?: ExpandedNode[];
  [name: string]: unknown;
}
export interface TemplateElementContext {
  attrs: Dictionary;
  forced: string[];
  scope: TemplateScope;
  path: string;
  force: boolean;
}
export interface TemplateElementPolicy {
  skip?: boolean;
  flatten?: boolean;
  prefix?: string;
  range?: {start: number; end: number};
  before?: ExpandedNode[];
  after?: ExpandedNode[];
  metadata?: Dictionary;
}
export function createTemplateEvaluator(template: TemplateProgram, options?: {
  element?(node: TemplateElement, context: TemplateElementContext): TemplateElementPolicy | void;
}): {evaluate(data: Dictionary, changedRoots?: Iterable<string>): {nodes: ExpandedNode[]; templateCalls: number}};
