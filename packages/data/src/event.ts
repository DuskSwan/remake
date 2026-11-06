import catalog from './event.json'
import { parseEvents } from './event.schema'
export * from './event.types'
export default new Map(parseEvents(catalog).map(event => [event.id, event]))
