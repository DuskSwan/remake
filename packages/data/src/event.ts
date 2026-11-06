import catalog from './event.json'
import customDaily from './event-pools/custom-daily.json'
import originalAges from '../dist/age'
import { createEventPools } from './event-pools'
export * from './event.types'

// Register future pools here; their identity, activation and entries live in JSON.
const compiled = createEventPools(catalog, originalAges, [customDaily])
export const eventPools = compiled.pools
export const ages = compiled.ages
export const isEventEnabled = compiled.isEventEnabled
export default compiled.events
