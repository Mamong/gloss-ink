/** Platform-neutral protocol data; validated and copied at runtime. */
export type Dictionary = Record<string, unknown>;
/** Submission acknowledgement, not a guarantee that pixels are displayed. */
export type RenderReceipt =
  | {readonly settled: true; readonly done?: Promise<unknown>}
  | {readonly settled: false; readonly done: Promise<unknown>};
export type Receipt = RenderReceipt & {readonly error?: Error};
/** Timer handles belong to the environment, and may be numbers or objects. */
export type ScheduleTimeout = (callback: () => void, milliseconds: number) => unknown;
export type CancelTimeout = (handle: any) => void;
export interface ProtocolOptions {
  id: string;
  route: string;
  kind?: 'page' | 'component';
  parentId?: string;
  data: Dictionary;
  visible?: boolean;
  setTimeout?: ScheduleTimeout;
  clearTimeout?: CancelTimeout;
  render(value: Dictionary, forced: string[], settings: {reset: boolean; revision: number}): void | PromiseLike<unknown>;
  result?(nodeId: string, value: string | {value: string; cursor?: number}): void;
  visibility?(visible: boolean): void;
  destroy?(): void;
  invoke?(binding: Dictionary, event: Dictionary): unknown;
  onError?(error: unknown): void;
}
export interface ProtocolInspection {id: string; revision: number; closed: boolean; visible: boolean; broken: boolean; nodes: number; data: Dictionary}
export interface ProtocolLogic {
  readonly id: string;
  receive(packet: unknown): boolean;
  create(): Receipt;
  update(data: Dictionary, forced?: string[]): Receipt;
  reset(data?: Dictionary): Receipt;
  visibility(visible: boolean): Receipt;
  destroy(): void;
  inspect(): ProtocolInspection & {pending: number};
}
export interface ProtocolReceiver {
  readonly id: string;
  receive(packet: unknown): boolean;
  isVisible(): boolean;
  node(): string;
  bind(nodeId: string, metadata: Dictionary, bindings: Dictionary[]): void;
  invalidateInput(nodeId: string): void;
  remove(nodeId: string): void;
  event(nodeId: string, key: string, input?: Dictionary): boolean;
  inspect(): ProtocolInspection;
}
export interface ViewProtocol {
  readonly version: 1;
  readonly protocol: string;
  readonly limits: {readonly dataCharacters: number; readonly packetCharacters: number; readonly eventCharacters: number; readonly nodes: number; readonly pending: number; readonly timeout: number};
  snapshot<T>(value: T, maximum?: number): T;
  inputResult(value: unknown): string | {value: string; cursor?: number} | undefined;
  connect(options: ProtocolOptions): {logic: ProtocolLogic; receiver: ProtocolReceiver};
  createLogic(options: Omit<ProtocolOptions, 'render'> & {render?: ProtocolOptions['render']; send(packet: Dictionary): void}): ProtocolLogic;
  createReceiver(options: ProtocolOptions & {send(packet: Dictionary): void}): ProtocolReceiver;
}
export function createViewProtocol(): ViewProtocol;
