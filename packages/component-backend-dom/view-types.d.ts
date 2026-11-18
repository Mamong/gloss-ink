import type * as Core from './ports/engine';
import type * as Builtin from './ports/builtin';

export interface DomTouchPoint {
  readonly identifier?: number; readonly pageX?: number; readonly pageY?: number;
  readonly clientX?: number; readonly clientY?: number; readonly force?: number;
}
export interface DomEventOriginal extends Core.LogicalEventOriginal {
  readonly target?: EventTarget | null;
  readonly clientX?: number; readonly clientY?: number;
  readonly touches?: ArrayLike<DomTouchPoint>; readonly changedTouches?: ArrayLike<DomTouchPoint>;
  readonly key?: string; readonly isComposing?: boolean; readonly repeat?: boolean;
}
export interface DomEventNode extends Builtin.ControllerNode {
  element: HTMLElement | VirtualRange;
  viewNodeId?: string;
  logicalParent?: DomEventNode;
  projectedParent?: DomEventNode | null;
  children?: Array<DomEventNode | Builtin.ControllerTextNode>;
  events?: Core.LogicalEventBinding[];
  eventView: Omit<Core.LogicalEventNode['eventView'], 'parent' | 'send'> & {
    parent?(): DomEventNode | undefined;
    send(node: DomEventNode, binding: Core.LogicalEventBinding, detail: unknown, target: DomEventNode, original: DomEventOriginal): void;
    classes(value: unknown): string;
    special(node: DomEventNode, name: string, original: DomEventOriginal): void;
    detail(node: DomEventNode, original: DomEventOriginal, name: string): unknown;
  };
}
export interface DomElementEventNode extends DomEventNode {element: HTMLElement}
export interface VirtualRange {
  readonly virtualRange: true;
  readonly start: Comment;
  readonly end: Comment;
  readonly stage: DocumentFragment;
  readonly childNodes: ChildNode[];
  readonly children: Element[];
  readonly isConnected: boolean;
  readonly parentElement: HTMLElement | null;
  readonly parentNode: ParentNode | null;
  className: string;
  dataset: Record<string, string>;
  attrs: Record<string, unknown>;
  hidden: boolean;
  inert: boolean;
  projection?: boolean;
  insertBefore(node: Node, reference?: Node | null): Node;
  append(...nodes: Node[]): void;
  contains(node: Node): boolean;
  remove(): void;
  getRootNode(): Node;
}
export type PhysicalElement = Node | VirtualRange;
export interface StyleHandle {readonly textContent: string | null; remove(): void}
export interface ComponentViewTools {
  range(): VirtualRange;
  physical(element: PhysicalElement): Node[];
  move(element: PhysicalElement, target: ParentNode | VirtualRange, reference: Node | null): void;
  after(target: ParentNode | VirtualRange, element: PhysicalElement): ChildNode | null;
  markProjection(node: {element: PhysicalElement}, token: string, enabled: boolean): void;
  css(value: string | undefined, id: string, virtual?: boolean): string;
  style(target: ParentNode, value: string | undefined, id: string, virtual?: boolean): StyleHandle;
  merge(...tables: Array<Record<string, string[]> | undefined>): Record<string, string[]>;
  bind(element: HTMLElement | VirtualRange, node: DomEventNode): void;
  route(source: DomEventNode, name: string, detail: unknown,
    settings?: {bubbles?: boolean; composed?: boolean; capturePhase?: boolean; onHandle?(): void}, original?: DomEventOriginal): boolean;
  path(source: DomEventNode, composed?: boolean): DomEventNode[];
  key(binding: Core.LogicalEventBinding): string;
  setGuard(guard: (node: DomEventNode, event: Event) => boolean): void;
}
