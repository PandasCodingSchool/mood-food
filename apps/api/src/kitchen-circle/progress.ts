import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Live progress for a chat turn ("Writing the recipe…"). The chat service opens a scope per message; anything running
 * inside it (recipe writing, impact checks, grocery builds) can report a step without threading a callback through.
 * Outside a scope `say` does nothing.
 */
const scope = new AsyncLocalStorage<(text: string) => void>();

export function withProgress<T>(report: (text: string) => void, run: () => Promise<T>): Promise<T> {
  return scope.run(report, run);
}

export function say(text: string): void {
  try { scope.getStore()?.(text); } catch { /* progress never breaks the work */ }
}
