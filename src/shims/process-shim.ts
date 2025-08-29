// Minimal process shim for browser builds
export const process = {
  env: {},
  browser: true,
} as unknown as NodeJS.Process;

// Provide a global reference if accessed as globalThis.process
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).process = (globalThis as any).process || (process as unknown as object);


