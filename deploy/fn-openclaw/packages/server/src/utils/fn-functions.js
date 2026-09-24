let waitUntilImpl = () => { };
try {
    const fnFunctions = await import('@fn/functions');
    waitUntilImpl = fnFunctions.waitUntil;
}
catch {
    // Local Node development has no FN request lifecycle to extend.
}
export function waitUntil(promise) {
    const forwarded = globalThis.__OPENCLAW_WAIT_UNTIL__;
    if (forwarded) {
        forwarded(promise);
        return;
    }
    waitUntilImpl(promise);
}
//# sourceMappingURL=fn-functions.js.map