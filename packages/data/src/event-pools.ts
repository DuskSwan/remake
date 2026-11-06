import type { Age, EventTier, EventWithWeight } from './age.types'
import type { Event, StateCondition } from './event.types'
import { parseEvents, validateCondition } from './event.schema'

export interface EventPlacement {
    readonly minAge: number
    readonly maxAge: number
    readonly events: number[]
    readonly priority?: number
    readonly weight?: number
}

export interface EventPool {
    readonly id: string
    readonly name: string
    readonly enabled?: boolean
    readonly minAge?: number
    readonly maxAge?: number
    readonly events: Event[]
    readonly placements?: EventPlacement[]
    /** Append eligible resolutions without changing another pool's source data. */
    readonly followUps?: { from: number; when: StateCondition; event: number }[]
}

export interface ActiveAge {
    readonly age: number
    readonly event: EventWithWeight[][]
}

export function isPoolActive(pool: EventPool, age: number) {
    return pool.enabled !== false
        && (pool.minAge === undefined || age >= pool.minAge)
        && (pool.maxAge === undefined || age <= pool.maxAge)
}

function fail(message: string): never { throw new Error(`Invalid event pool: ${message}`) }
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('expected an object')
    return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: string[]) {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown key ${key}`)
}
function integer(value: unknown, min = 0): asserts value is number {
    if (!Number.isSafeInteger(value) || Number(value) < min) fail(`invalid integer ${String(value)}`)
}
function ageBounds(value: Record<string, unknown>, required = false) {
    for (const field of ['minAge', 'maxAge']) if (required || value[field] !== undefined) integer(value[field])
    if (typeof value.minAge === 'number' && typeof value.maxAge === 'number' && value.minAge > value.maxAge) fail('inverted age range')
}

function parsePool(value: unknown): EventPool {
    const pool = object(value)
    keys(pool, ['id', 'name', 'enabled', 'minAge', 'maxAge', 'events', 'placements', 'followUps'])
    for (const key of ['id', 'name']) if (typeof pool[key] !== 'string' || !pool[key].trim()) fail(`missing ${key}`)
    if (pool.enabled !== undefined && typeof pool.enabled !== 'boolean') fail('enabled must be boolean')
    ageBounds(pool)
    if (!Array.isArray(pool.events)) fail('events must be an array')
    if (pool.placements !== undefined) {
        if (!Array.isArray(pool.placements)) return fail('placements must be an array')
        for (const item of pool.placements) {
            const p = object(item)
            keys(p, ['minAge', 'maxAge', 'events', 'priority', 'weight'])
            ageBounds(p, true)
            if (!Array.isArray(p.events) || !p.events.length) return fail('placement requires event IDs')
            p.events.forEach(id => integer(id))
            if (p.priority !== undefined) integer(p.priority, -Infinity)
            if (p.weight !== undefined && (typeof p.weight !== 'number' || !Number.isFinite(p.weight) || p.weight <= 0)) fail('weight must be positive and finite')
        }
    }
    if (pool.followUps !== undefined) {
        if (!Array.isArray(pool.followUps)) return fail('followUps must be an array')
        for (const item of pool.followUps) {
            const follow = object(item)
            keys(follow, ['from', 'when', 'event'])
            integer(follow.from); integer(follow.event); validateCondition(follow.when)
        }
    }
    // Event schemas and cross-pool references are checked together below.
    return pool as unknown as EventPool
}

/** Compile source pools once. Selection still uses the original ordered tiers. */
export function createEventPools(originalCatalog: unknown, originalAges: ReadonlyMap<number, Age>, additions: unknown[]) {
    const original: EventPool = {id: 'original', name: '原版事件池', events: parseEvents(originalCatalog)}
    const pools = new Map<string, EventPool>([[original.id, original]])
    for (const input of additions) {
        const pool = parsePool(input)
        if (pools.has(pool.id)) fail(`duplicate pool ID ${pool.id}`)
        pools.set(pool.id, pool)
    }
    const definitions = parseEvents([...pools.values()].flatMap(p => p.events))
    const events = new Map(definitions.map(e => [e.id, e]))
    const owners = new Map([...pools.values()].flatMap(pool => pool.events.map(e => [e.id, pool] as const)))
    for (const pool of pools.values()) {
        const placements = new Set<string>()
        for (const p of pool.placements ?? []) {
            for (const id of p.events) {
                if (owners.get(id) !== pool) fail(`${pool.id} cannot place another pool's event ${id}`)
                if (!events.get(id)!.random) fail(`non-random event ${id} has a random placement`)
                for (let age = p.minAge; age <= p.maxAge; age++) {
                    if (!originalAges.has(age)) fail(`missing age pool ${age}`)
                    const key = `${age}:${id}`
                    if (placements.has(key)) fail(`duplicate placement ${key}`)
                    placements.add(key)
                }
            }
        }
        for (const follow of pool.followUps ?? []) {
            const source = events.get(follow.from)
            if (!source) fail(`missing follow-up source ${follow.from}`)
            if (owners.get(follow.event) !== pool) fail(`${pool.id} must own follow-up target ${follow.event}`)
            // Copy; the original definitions and original JSON remain untouched.
            events.set(source.id, {...source, followUps: [...(source.followUps ?? []), {when: follow.when, event: follow.event}]})
        }
    }
    parseEvents([...events.values()])

    const ages = new Map<number, ActiveAge>()
    for (const [age, source] of originalAges) {
        const active = [...pools.values()].filter(pool => isPoolActive(pool, age))
            .flatMap(pool => (pool.placements ?? []).filter(p => age >= p.minAge && age <= p.maxAge))
        if (!active.length) {
            ages.set(age, {age, event: source.event.map(tier => tier.events)})
            continue
        }
        const tiers = new Map<number, EventTier>(source.event.map(tier => [tier.priority, tier]))
        for (const placement of active) {
            const priority = placement.priority ?? 0
            const weight = placement.weight ?? 1
            const tier = tiers.get(priority) ?? {priority, scale: 1, events: []}
            const precision = weight.toString().split('.')[1]?.length ?? 0
            // Match the original transformer's scaling rule. In particular,
            // a source weight of 1 must join a scale-100 tier as weight 100.
            const scale = Math.max(tier.scale, precision > 1 ? 10 ** precision : 1)
            tiers.set(priority, {priority, scale, events: [
                ...tier.events.map(([id, w]): EventWithWeight => [id, w * (scale / tier.scale)]),
                ...placement.events.map((id): EventWithWeight => [id, scale > 1 ? Math.floor(weight * scale) : weight]),
            ]})
        }
        ages.set(age, {age, event: [...tiers.values()].sort((a, b) => b.priority - a.priority).map(tier => tier.events)})
    }
    return {
        pools, events, ages,
        isEventEnabled(id: number, age: number) {
            const pool = owners.get(id)
            return pool === undefined || isPoolActive(pool, age)
        },
    }
}
