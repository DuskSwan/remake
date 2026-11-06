import { describe, expect, test } from 'bun:test'
import catalog from './event.json'
import { parseEvents, validateCondition, validateEffect } from './event.schema'
import { migrateLegacyCondition } from '../utils/migrate-events'

describe('Event catalog validation', () => {
    test('all migrated events use the new schema and retain all 1720 identifiers', () => {
        const events = parseEvents(catalog)
        expect(events).toHaveLength(1720)
        expect(new Set(events.map(e => e.id)).size).toBe(1720)
        expect(events.filter(e => e.followUps?.length)).toHaveLength(230)
        expect(events.flatMap(e => e.followUps ?? [])).toHaveLength(319)
        expect(events.some(e => e.effects.some(effect => effect.op === 'child.add'))).toBe(true)
    })
    test('unknown fields, wrong types and unsupported operations are rejected', () => {
        expect(() => validateCondition({ field: 'actor.family.maried', op: 'eq', value: true })).toThrow('unknown state field')
        expect(() => validateCondition({ field: 'actor.family.fatherAlive', op: 'eq', value: 'true' })).toThrow()
        expect(() => validateCondition({ field: 'life', op: 'gte', value: '1' })).toThrow()
        expect(() => validateEffect({ op: 'set', field: '__proto__.polluted', value: true })).toThrow()
        expect(() => validateEffect({ op: 'add', field: 'money', value: Infinity })).toThrow()
        expect(() => validateEffect({ op: 'child.add', age: -1 })).toThrow()
        expect(() => validateEffect({ op: 'child.grandchild', where: { minAge: 9 } })).toThrow()
        expect(() => validateCondition({ history: { event: 11231, minYearsSinceLast: -1 } })).toThrow()
        expect(() => validateCondition({ history: { event: 11231, minCount: 2, maxCount: 1 } })).toThrow()
    })
    test('duplicate IDs and unresolved references are rejected', () => {
        expect(() => parseEvents([catalog[0], catalog[0]])).toThrow('duplicate id')
        expect(() => parseEvents([{ ...catalog[0], followUps: [{ when: { all: [] }, event: 999999 }] }])).toThrow('missing follow-up')
        expect(() => parseEvents([{ ...catalog[0], followUps: [], when: { history: { event: 999999 } } }])).toThrow('missing history')
    })
    test('legacy state tests are migrated to structured membership and negation', () => {
        expect(migrateLegacyCondition('EVT?[10001,10002]')).toEqual({ field: 'events', op: 'in', value: [10001,10002] })
        expect(migrateLegacyCondition('TLT!=1001')).toEqual({ not: { field: 'talents', op: 'has', value: 1001 } })
    })
})
