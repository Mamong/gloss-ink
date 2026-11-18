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
