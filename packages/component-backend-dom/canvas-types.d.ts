import type * as Builtin from './ports/builtin';
export interface CanvasGradient {addColorStop(offset: number, color: string): void}
export interface CanvasPattern {readonly image: string | object; readonly repetition: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'}
export interface LegacyCanvasContext {
  setFillStyle(color: string | CanvasGradient | CanvasPattern): void; setStrokeStyle(color: string | CanvasGradient | CanvasPattern): void;
  setShadow(offsetX: number, offsetY: number, blur: number, color: string): void; setGlobalAlpha(alpha: number): void;
  setLineWidth(width: number): void; setLineCap(cap: 'butt' | 'round' | 'square'): void; setLineJoin(join: 'bevel' | 'round' | 'miter'): void; setMiterLimit(limit: number): void;
  setLineDash(pattern: number[], offset?: number): void; setLineDashOffset(offset: number): void; setFontSize(size: number): void;
  setTextAlign(align: 'left' | 'center' | 'right' | 'start' | 'end'): void; setTextBaseline(baseline: 'top' | 'bottom' | 'middle' | 'normal' | 'alphabetic' | 'ideographic' | 'hanging'): void;
  setGlobalCompositeOperation(type: string): void; save(): void; restore(): void; translate(x: number, y: number): void; rotate(angle: number): void; scale(x: number, y: number): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void; setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void; quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  rect(x: number, y: number, width: number, height: number): void; clip(): void; fill(): void; stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void; strokeRect(x: number, y: number, width: number, height: number): void; clearRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string | number, x: number, y: number, maxWidth?: number): void; strokeText(text: string | number, x: number, y: number, maxWidth?: number): void; measureText(text: string | number): {width: number};
  drawImage(image: string | object, dx: number, dy: number): void;
  drawImage(image: string | object, dx: number, dy: number, width: number, height: number): void;
  drawImage(image: string | object, sx: number, sy: number, sWidth: number, sHeight: number, dx: number, dy: number, width: number, height: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient; createCircularGradient(x: number, y: number, radius: number): CanvasGradient;
  createPattern(image: string | object, repetition: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'): CanvasPattern;
  draw(reserve?: boolean, callback?: (result: {errMsg: string}) => void): void | Promise<void>;
}
/** A validated command batch, crossing a transport as data rather than callable code. */
export interface CanvasAction {name: string; args: unknown[]}
export interface CanvasSurface {
  managed: boolean; dpr: number; logicalWidth: number; logicalHeight: number; deviceWidth: number; deviceHeight: number;
}
export interface CanvasPixelRect {
  x: number; y: number; width: number; height: number; dpr: number; deviceX: number; deviceY: number; deviceWidth: number; deviceHeight: number;
}
export interface CanvasOptions {
  canvasId?: string;
  imageSource?(value: string | object): CanvasImageSource | string | Promise<CanvasImageSource | string>;
  measureView?: Builtin.BrowserRoot;
  fontFamily?: string;
  initialFontFamily?: string;
  dpr?: number;
  remote?(value: {canvasId: string | undefined; actions: CanvasAction[]; reserve: boolean}): Promise<unknown>;
  remoteFont?(): string | Promise<string>;
}
export interface CanvasTools {
  canvasContext(resolve: () => HTMLCanvasElement | null | undefined, options?: CanvasOptions): Readonly<LegacyCanvasContext>;
  canvasContext(resolve: null | undefined, options: CanvasOptions & {remote: NonNullable<CanvasOptions['remote']>}): Readonly<LegacyCanvasContext>;
  applyCanvas(context: CanvasRenderingContext2D, batch: CanvasAction[], element: HTMLCanvasElement, options?: CanvasOptions): Promise<void>;
  canvasSurface(element: HTMLCanvasElement, root?: Pick<Window, 'devicePixelRatio'>): CanvasSurface;
  prepareCanvas(element: HTMLCanvasElement, context: CanvasRenderingContext2D, surface: CanvasSurface, reserve: boolean): number;
  canvasPixelRect(value: {x?: number; y?: number; width?: number; height?: number}, surface: CanvasSurface, limitDevicePixels?: boolean): CanvasPixelRect;
  canvasFontFamily(element: HTMLCanvasElement, root?: Builtin.BrowserRoot): string;
}
