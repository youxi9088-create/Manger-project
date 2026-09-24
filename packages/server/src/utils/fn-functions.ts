type WaitUntil = (promise: Promise<unknown>) => void;

let waitUntilImpl: WaitUntil = () => {};

try {
  const fnFunctions = await import('@fn/functions');
  waitUntilImpl = fnFunctions.waitUntil;
} catch {
  // Local Node development has no FN request lifecycle to extend.
}

export function waitUntil(promise: Promise<unknown>): void {
  const forwarded = (globalThis as typeof globalThis & { __OPENCLAW_WAIT_UNTIL__?: WaitUntil }).__OPENCLAW_WAIT_UNTIL__;
  if (forwarded) {
    forwarded(promise);
    return;
  }
  waitUntilImpl(promise);
}
