/**
 * Run a sequence of labeled, independent steps, isolating each from the
 * others: a step that throws (e.g. a stale DOM id after a panel refactor) is
 * logged and skipped, but every later step still runs. Used for
 * event-handler chains (selectedChanged, elementChanged, zoomChanged, ...)
 * where the steps are unrelated UI updates and one broken step must not
 * silently abort the rest of the chain, leaving other panels stuck stale.
 * @param {Array<[string, function(): void]>} steps
 * @returns {void}
 */
export const runSteps = (steps) => {
  for (const [label, fn] of steps) {
    try {
      fn()
    } catch (err) {
      console.error(`Step failed: ${label}; `, err)
    }
  }
}
