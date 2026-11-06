import { describe, expect, test } from 'bun:test'
import type { Age } from './age.types'
import type { Event } from './event.types'
import { createEventPools, type EventPool } from './event-pools'
import { parseEvents } from './event.schema'
import { transformers } from './age.types'
import originalCatalog from './event.json'
import { eventPools } from './event'

const event = (id: number): Event => ({id, event: `Event ${id}`, grade: 0, random: true, when: {all: []}, effects: []})
const original = [event(1), event(2), event(3)]
const sourceAges = new Map<number, Age>([109, 110].map(age => [age, {age, event: [
    {priority: 2, scale: 1, events: [[1, 1]]},
    {priority: 0, scale: 1000, events: [[2, 2000], [3, 1000]]},
]}]))
const daily: EventPool = {
    id: 'custom-daily', name: '自定义-日常事件池', maxAge: 109, events: [event(10)],
    placements: [{minAge: 109, maxAge: 110, events: [10]}],
    followUps: [{from: 1, when: {all: []}, event: 10}],
}

describe('Independent event pools', () => {
    test('original definitions stay separate from custom stories and attached branches', () => {
        const parsed = parseEvents(originalCatalog)
        expect(parsed).toHaveLength(1720)
        expect(eventPools.get('original')!.events).toEqual(parsed)
        expect(parsed.flatMap(e => e.followUps ?? [])).toHaveLength(319)
        expect(eventPools.get('custom-daily')!.events).toHaveLength(344)
    })

    test('the original age conversion retains empty tiers, negative priorities and scaled weights', () => {
        expect(transformers.event(['1|2', 2, '3*0.03', '4|-1'])).toEqual([
            {priority: 2, scale: 1, events: [[1, 1]]},
            {priority: 1, scale: 1, events: []},
            {priority: 0, scale: 100, events: [[2, 100], [3, 3]]},
            {priority: -1, scale: 1, events: [[4, 1]]},
        ])
    })

    test('source weight 1 joins the same priority at the original scale without changing original data', () => {
        const snapshot = structuredClone([...sourceAges])
        const compiled = createEventPools(original, sourceAges, [daily])
        expect(compiled.ages.get(109)!.event).toEqual([[[1, 1]], [[2, 2000], [3, 1000], [10, 1000]]])
        expect(compiled.ages.get(110)!.event).toEqual([[[1, 1]], [[2, 2000], [3, 1000]]])
        expect([...sourceAges]).toEqual(snapshot)
        expect(original[0]!.followUps).toBeUndefined()
        expect(compiled.events.get(1)!.followUps).toEqual(daily.followUps!.map(({when, event}) => ({when, event})))
        expect(compiled.isEventEnabled(10, 109)).toBe(true)
        expect(compiled.isEventEnabled(10, 110)).toBe(false)
        expect(compiled.isEventEnabled(1, 110)).toBe(true)
    })

    test('other custom pools may remain active after daily life ends and have independent priorities', () => {
        const future: EventPool = {
            id: 'custom-future', name: 'Another pool', minAge: 110, events: [event(20)],
            placements: [{minAge: 109, maxAge: 110, events: [20], priority: 1, weight: 2}],
        }
        const compiled = createEventPools(original, sourceAges, [daily, future])
        expect(compiled.ages.get(110)!.event).toEqual([[[1, 1]], [[20, 2]], [[2, 2000], [3, 1000]]])
        expect(compiled.isEventEnabled(20, 109)).toBe(false)
        expect(compiled.isEventEnabled(20, 110)).toBe(true)
        expect(compiled.isEventEnabled(10, 110)).toBe(false)
    })

    test('disabling a pool removes its candidates and blocks its follow-ups without losing history definitions', () => {
        const compiled = createEventPools(original, sourceAges, [{...daily, enabled: false}])
        for (const age of [109, 110]) {
            expect(compiled.ages.get(age)!.event).toEqual(sourceAges.get(age)!.event.map(t => t.events))
            expect(compiled.isEventEnabled(10, age)).toBe(false)
        }
        expect(compiled.events.has(10)).toBe(true)
    })

    test('multiple pools share a priority and weights retain their ratios', () => {
        const other: EventPool = {id: 'other', name: 'Other', events: [event(20)], placements: [{minAge: 109, maxAge: 110, events: [20], weight: 0.02}]}
        const compiled = createEventPools(original, sourceAges, [daily, other])
        expect(compiled.ages.get(109)!.event[1]).toEqual([[2, 2000], [3, 1000], [10, 1000], [20, 20]])
    })

    test('invalid registrations fail instead of silently replacing original entries or multiplying weights', () => {
        expect(() => createEventPools(original, sourceAges, [{...daily, id: 'original'}])).toThrow('duplicate pool ID')
        expect(() => createEventPools(original, sourceAges, [{...daily, events: [event(1)]}])).toThrow('duplicate id')
        expect(() => createEventPools(original, sourceAges, [{...daily, placements: [...daily.placements!, ...daily.placements!]}])).toThrow('duplicate placement')
        expect(() => createEventPools(original, sourceAges, [{...daily, placements: [{minAge: 109, maxAge: 110, events: [999]}]}])).toThrow('another pool')
        expect(() => createEventPools(original, sourceAges, [{...daily, placements: [{minAge: 110, maxAge: 109, events: [10]}]}])).toThrow('inverted age')
        expect(() => createEventPools(original, sourceAges, [{...daily, placements: [{minAge: 109, maxAge: 110, events: [10], weight: 0}]}])).toThrow('weight')
        expect(() => createEventPools(original, sourceAges, [{...daily, followUps: [{from: 999, when: {all: []}, event: 10}]}])).toThrow('missing follow-up source')
        expect(() => createEventPools(original, sourceAges, [{...daily, followUps: [{from: 1, when: {all: []}, event: 2}]}])).toThrow('must own')
    })
})
