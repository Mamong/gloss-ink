// Generated from template-compiler/runtime.d.ts; SHA-256 048572fb7b68fb94e382b2af842ce97aa1a356a1fca22621a952bcb4a45932cb
// Regenerate with npm run types:component-ports
declare function createWxsRuntime(bundle: unknown): createWxsRuntime.Runtime;
declare namespace createWxsRuntime {
  interface Runtime {
    reset(): void;
    value(file: string, name: string, path: Array<string | number>): unknown;
    call(file: string, name: string, path: Array<string | number>, args: unknown[]): unknown;
    inspect(): {modules: number; steps: number; heap: number};
  }
}
export = createWxsRuntime;
