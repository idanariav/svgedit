// Shared fast-check setup. A failing property prints its seed; reproduce with
//   FC_SEED=<seed> npx vitest run tests/unit/properties
import fc from 'fast-check'

const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined

/** Options for `fc.assert`: modest run counts (the whole folder must stay fast). */
export const params = (numRuns = 100) => ({ numRuns, ...(seed === undefined ? {} : { seed }) })

export { fc }
