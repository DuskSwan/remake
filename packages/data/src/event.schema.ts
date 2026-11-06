import type { Event } from './event.types'
import { numericStateFields, enumStateFields, booleanStateFields, setStateFields } from './event.types'

type RecordValue = Record<string, unknown>
const numeric = new Set<string>(numericStateFields)
const booleans = new Set<string>(booleanStateFields)
const sets = new Set<string>(setStateFields)
const enums: Record<string, readonly string[]> = enumStateFields
const properties = ['age', 'charm', 'intelligence', 'strength', 'money', 'spirit', 'life']
const fail = (message: string): never => { throw new Error(`Invalid event data: ${message}`) }
function object(value: unknown): RecordValue {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('expected an object')
    return value as RecordValue
}
function keys(value: RecordValue, allowed: string[]) {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown key ${key}`)
}
function number(value: unknown, minimum = -Infinity) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) fail(`invalid number ${value}`)
}
function integer(value: unknown, minimum = 0) {
    number(value, minimum)
    if (!Number.isSafeInteger(value)) fail(`invalid integer ${value}`)
}
function oneOf(value: unknown, allowed: readonly unknown[]) {
    if (!allowed.includes(value)) fail(`unexpected value ${String(value)}`)
}
function bool(value: unknown) {
    if (typeof value !== 'boolean') fail('expected a boolean')
}
function childQuery(value: unknown) {
    const q = object(value)
    keys(q, ['id', 'minAge', 'maxAge', 'alive', 'sex', 'maxGrandchildren'])
    for (const key of ['id', 'minAge', 'maxAge', 'maxGrandchildren']) if (q[key] !== undefined) integer(q[key])
    if (q.alive !== undefined) bool(q.alive)
    if (q.sex !== undefined) oneOf(q.sex, enums['actor.sex']!)
    if (typeof q.minAge === 'number' && typeof q.maxAge === 'number' && q.minAge > q.maxAge) fail('inverted child age range')
}

export function validateCondition(value: unknown): void {
    const c = object(value)
    for (const combinator of ['all', 'any']) {
        if (!(combinator in c)) continue
        keys(c, [combinator])
        const children = c[combinator]
        if (!Array.isArray(children)) return fail(`${combinator} requires an array`)
        children.forEach(validateCondition)
        return
    }
    if ('not' in c) { keys(c, ['not']); validateCondition(c.not); return }
    if ('child' in c) { keys(c, ['child']); childQuery(c.child); return }
    if ('history' in c) {
        keys(c, ['history'])
        const query = object(c.history)
        keys(query, ['event', 'minCount', 'maxCount', 'minYearsSinceLast', 'maxYearsSinceLast'])
        integer(query.event)
        for (const key of ['minCount', 'maxCount']) if (query[key] !== undefined) integer(query[key], 1)
        for (const key of ['minYearsSinceLast', 'maxYearsSinceLast']) if (query[key] !== undefined) integer(query[key])
        for (const [min, max] of [['minCount', 'maxCount'], ['minYearsSinceLast', 'maxYearsSinceLast']] as const)
            if (typeof query[min] === 'number' && typeof query[max] === 'number' && query[min] > query[max]) fail('inverted history range')
        return
    }
    keys(c, ['field', 'op', 'value'])
    if (typeof c.field !== 'string') return fail('missing condition field')
    const field = c.field
    if (!numeric.has(field) && !booleans.has(field) && !sets.has(field) && !Object.hasOwn(enums, field)) return fail(`unknown state field ${field}`)
    if (sets.has(field)) oneOf(c.op, ['has', 'in', 'notIn'])
    else if (numeric.has(field)) oneOf(c.op, ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn'])
    else oneOf(c.op, ['eq', 'ne', 'in', 'notIn'])
    const members = c.op === 'in' || c.op === 'notIn'
    if (members && !Array.isArray(c.value)) return fail('membership requires an array')
    const values = members ? c.value as unknown[] : [c.value]
    for (const entry of values) {
        if (numeric.has(field)) number(entry)
        else if (booleans.has(field)) bool(entry)
        else if (Object.hasOwn(enums, field)) oneOf(entry, enums[field]!)
        else if (field === 'actor.facts') {
            if (typeof entry !== 'string' || !entry.trim()) fail('fact name must be nonempty')
        } else integer(entry)
    }
}

export function validateEffect(value: unknown): void {
    const e = object(value)
    switch (e.op) {
        case 'add':
            keys(e, ['op', 'field', 'value']); oneOf(e.field, properties); number(e.value)
            if (e.field === 'age') integer(e.value, -Infinity)
            return
        case 'set':
            keys(e, ['op', 'field', 'value'])
            oneOf(e.field, ['actor.sex', 'actor.origin', 'actor.location', ...booleanStateFields])
            if (booleans.has(e.field as string)) bool(e.value)
            else oneOf(e.value, enums[e.field as string]!)
            return
        case 'relationship':
            keys(e, ['op', 'status']); oneOf(e.status, enums['actor.family.relationship']!); return
        case 'education':
            keys(e, ['op', 'stage']); oneOf(e.stage, enums['actor.education.stage']!); return
        case 'career':
            keys(e, ['op', 'status', 'occupation']); oneOf(e.status, enums['actor.career.status']!)
            if (e.occupation !== undefined) oneOf(e.occupation, enums['actor.career.occupation']!)
            if (e.status === 'employed' && (!e.occupation || e.occupation === 'none')) fail('employment requires an occupation')
            return
        case 'fact':
            keys(e, ['op', 'name', 'value']); bool(e.value)
            if (typeof e.name !== 'string' || !e.name.trim()) fail('fact name must be nonempty')
            return
        case 'child.add':
            keys(e, ['op', 'sex', 'age', 'adopted'])
            if (e.sex !== undefined) oneOf(e.sex, enums['actor.sex']!)
            if (e.age !== undefined) integer(e.age)
            if (e.adopted !== undefined) bool(e.adopted)
            return
        case 'child.update':
            keys(e, ['op', 'where', 'alive']); childQuery(e.where); bool(e.alive); return
        case 'child.grandchild':
            keys(e, ['op', 'where']); childQuery(e.where)
            if (object(e.where).alive !== true || Number(object(e.where).minAge ?? -1) < 16)
                fail('grandchild requires a living child aged at least 16')
            return
        default: return fail(`unknown state operation ${String(e.op)}`)
    }
}

export function parseEvents(value: unknown): Event[] {
    if (!Array.isArray(value)) return fail('event catalog must be an array')
    const ids = new Set<number>()
    for (const item of value) {
        const event = object(item)
        keys(event, ['id', 'event', 'grade', 'postEvent', 'format', 'random', 'when', 'effects', 'followUps'])
        integer(event.id)
        if (ids.has(event.id as number)) fail(`duplicate id ${event.id}`)
        ids.add(event.id as number)
        if (typeof event.event !== 'string' || !event.event.trim()) fail(`missing text for ${event.id}`)
        oneOf(event.grade, [0, 1, 2, 3]); bool(event.random)
        if (event.postEvent !== undefined && typeof event.postEvent !== 'string') fail('invalid postEvent')
        if (event.format !== undefined) bool(event.format)
        try {
            validateCondition(event.when)
            if (!Array.isArray(event.effects)) fail('missing effects array')
            ;(event.effects as unknown[]).forEach(validateEffect)
            if (event.followUps !== undefined) {
                if (!Array.isArray(event.followUps)) fail('followUps requires an array')
                for (const value of event.followUps as unknown[]) {
                    const follow = object(value)
                    keys(follow, ['when', 'event']); integer(follow.event); validateCondition(follow.when)
                }
            }
        } catch (error) { throw new Error(`Event ${event.id}: ${String(error)}`) }
    }
    const result = value as Event[]
    for (const event of result) {
        for (const follow of event.followUps ?? []) if (!ids.has(follow.event)) fail(`missing follow-up ${follow.event}`)
        function references(condition: Event['when']) {
            if ('all' in condition) condition.all.forEach(references)
            else if ('any' in condition) condition.any.forEach(references)
            else if ('not' in condition) references(condition.not)
            else if ('history' in condition) {
                if (!ids.has(condition.history.event)) fail(`event ${event.id} refers to missing history ${condition.history.event}`)
            }
            else if ('field' in condition && ['events', 'profile.events'].includes(condition.field)) {
                const values = Array.isArray(condition.value) ? condition.value : [condition.value]
                for (const id of values) if (!ids.has(id as number)) fail(`event ${event.id} refers to missing history ${id}`)
            }
        }
        references(event.when)
        event.followUps?.forEach(f => references(f.when))
    }
    return result
}
