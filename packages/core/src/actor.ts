import type { ActorState, ChildQuery, ChildState, StateCondition, StateEffect, StateField } from '@remake/data'
import type { GameState, ProfileState } from './state'
import { propsEffect, summary } from './state'
import { produce } from 'immer'

export function createActor(): ActorState {
    return {
        sex: 'unknown', origin: 'unknown', location: 'unknown',
        family: {
            relationship: 'single', relationshipSince: null, partnerIll: false,
            fatherAlive: true, motherAlive: true, children: [], nextChildId: 1,
        },
        education: { stage: 'none', since: null },
        career: { status: 'none', occupation: 'none', since: null },
        imprisoned: false, facts: new Set(),
    }
}

/** clock is elapsed simulation time, independent of age-reversal events. */
export function advanceTime(state: GameState, years = 1): GameState {
    if (!Number.isSafeInteger(years) || years < 0) throw new Error('Invalid elapsed years')
    return produce(state, draft => {
        draft.clock += years
        draft.props = propsEffect(draft.props, { age: years })
    })
}

export function childAge(state: GameState, child: ChildState) {
    return state.clock - child.bornAt
}

export function matchesChild(state: GameState, child: ChildState, query: ChildQuery) {
    const age = childAge(state, child)
    return (query.id === undefined || child.id === query.id)
        && (query.minAge === undefined || age >= query.minAge)
        && (query.maxAge === undefined || age <= query.maxAge)
        && (query.alive === undefined || child.alive === query.alive)
        && (query.sex === undefined || child.sex === query.sex)
        && (query.maxGrandchildren === undefined || child.grandchildren <= query.maxGrandchildren)
}

function readField(state: GameState, profile: ProfileState, field: StateField): unknown {
    const { family, education, career } = state.actor
    const years = (since: number | null) => since === null ? 0 : state.clock - since
    switch (field) {
        case 'summary': return summary(state)
        case 'actor.family.childCount': return family.children.length
        case 'actor.family.livingChildCount': return family.children.filter(c => c.alive).length
        case 'actor.family.grandchildCount': return family.children.reduce((n, c) => n + c.grandchildren, 0)
        case 'actor.family.relationshipYears': return years(family.relationshipSince)
        case 'actor.education.years': return years(education.since)
        case 'actor.career.years': return years(career.since)
    }
    let value: unknown = { ...state, profile }
    for (const key of field.split('.')) {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
            throw new Error(`Unknown state field: ${field}`)
        value = (value as Record<string, unknown>)[key]
    }
    return value
}

export function satisfies(state: GameState, profile: ProfileState, condition: StateCondition): boolean {
    if ('all' in condition) return condition.all.every(c => satisfies(state, profile, c))
    if ('any' in condition) return condition.any.some(c => satisfies(state, profile, c))
    if ('not' in condition) return !satisfies(state, profile, condition.not)
    if ('child' in condition) return state.actor.family.children.some(c => matchesChild(state, c, condition.child))
    if ('history' in condition) {
        const query = condition.history
        const record = state.eventHistory.get(query.event)
        if (!record) return false
        const elapsed = state.clock - record.lastAt
        return (query.minCount === undefined || record.count >= query.minCount)
            && (query.maxCount === undefined || record.count <= query.maxCount)
            && (query.minYearsSinceLast === undefined || elapsed >= query.minYearsSinceLast)
            && (query.maxYearsSinceLast === undefined || elapsed <= query.maxYearsSinceLast)
    }
    const actual = readField(state, profile, condition.field)
    const expected = condition.value
    switch (condition.op) {
        case 'eq': return actual === expected
        case 'ne': return actual !== expected
        case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected
        case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
        case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected
        case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
        case 'has': return actual instanceof Set && actual.has(expected)
        case 'in':
        case 'notIn': {
            if (!Array.isArray(expected)) throw new Error('Membership requires an array')
            const match = expected.some(v => actual instanceof Set ? actual.has(v) : actual === v)
            return condition.op === 'in' ? match : !match
        }
    }
}

/** Apply an event as one immutable transaction. Never execute code from event data. */
export function applyEffects(state: GameState, effects: readonly StateEffect[]): GameState {
    return produce(state, draft => {
        for (const effect of effects) {
            const actor = draft.actor
            switch (effect.op) {
                case 'add':
                    if (effect.field === 'life') draft.life += effect.value
                    else draft.props = propsEffect(draft.props, { [effect.field]: effect.value })
                    break
                case 'set': {
                    const parts = effect.field.split('.')
                    const last = parts.pop()!
                    let target = draft as unknown as Record<string, unknown>
                    for (const key of parts) target = target[key] as Record<string, unknown>
                    target[last] = effect.value
                    break
                }
                case 'relationship':
                    actor.family.relationship = effect.status
                    actor.family.relationshipSince = draft.clock
                    actor.family.partnerIll = false
                    break
                case 'education':
                    actor.education = { stage: effect.stage, since: draft.clock }
                    break
                case 'career':
                    actor.career = {
                        status: effect.status,
                        occupation: effect.occupation ?? actor.career.occupation,
                        since: effect.status === actor.career.status
                            && (effect.occupation ?? actor.career.occupation) === actor.career.occupation
                            ? actor.career.since : draft.clock,
                    }
                    break
                case 'fact':
                    if (effect.value) actor.facts.add(effect.name)
                    else actor.facts.delete(effect.name)
                    break
                case 'child.add':
                    actor.family.children.push({
                        id: actor.family.nextChildId++, bornAt: draft.clock - (effect.age ?? 0),
                        alive: true, sex: effect.sex ?? 'unknown', adopted: effect.adopted ?? false,
                        grandchildren: 0,
                    })
                    break
                case 'child.update':
                case 'child.grandchild': {
                    const child = actor.family.children.find(c => matchesChild(draft, c, effect.where))
                    if (!child) throw new Error(`No child matches ${effect.op}`)
                    if (effect.op === 'child.update') child.alive = effect.alive
                    else child.grandchildren++
                    break
                }
            }
        }
    })
}

export function recordEvent(state: GameState, event: number): GameState {
    return produce(state, draft => {
        draft.events.add(event)
        const previous = draft.eventHistory.get(event)
        draft.eventHistory.set(event, {
            count: (previous?.count ?? 0) + 1,
            firstAt: previous?.firstAt ?? draft.clock,
            lastAt: draft.clock,
        })
    })
}
