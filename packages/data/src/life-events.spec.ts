import { describe, expect, test } from 'bun:test'
import { ages, originalAges, events, eventPools, type StateCondition } from './index'
import { isPoolActive } from './event-pools'

const daily = eventPools.get('custom-daily')!
const added = daily.events
function ageRange(when: StateCondition) {
    if (!('all' in when)) throw new Error('Life event must declare its age range')
    const bound = (op: 'gte' | 'lte') => {
        const c = when.all.find(c => 'field' in c && c.field === 'props.current.age' && c.op === op)
        if (!c || !('value' in c) || typeof c.value !== 'number') throw new Error(`Missing age ${op}`)
        return c.value
    }
    return [bound('gte'), bound('lte')] as const
}

describe('Ordinary life expansion', () => {
    test('adds 344 distinct ordinary stories, with most content before age 18', () => {
        expect(added).toHaveLength(344)
        expect(new Set(added.map(e => e.event.trim())).size).toBe(344)
        const previousTexts = new Set(eventPools.get('original')!.events.map(e => e.event.trim()))
        expect(added.every(e => !previousTexts.has(e.event.trim()) && e.grade === 0)).toBe(true)
        expect(added.filter(e => ageRange(e.when)[1] < 18)).toHaveLength(192)
        expect(added.filter(e => ageRange(e.when)[1] < 25)).toHaveLength(240)
        expect(added.filter(e => e.random)).toHaveLength(336)
    })

    test('every random story has exactly one ordinary-pool entry per eligible age', () => {
        let entries = 0
        for (const event of added) {
            const [min, max] = ageRange(event.when)
            for (const [age, pool] of ages) {
                const matches = pool.event.flatMap((tier, index) => tier.filter(([id]) => id === event.id).map(([id, weight]) => ({id, weight, index})))
                const expected = event.random && isPoolActive(daily, age) && age >= min && age <= max ? 1 : 0
                expect(matches.length).toBe(expected)
                if (!expected) continue
                // Existing source levels are all nonnegative, so level 0 is last.
                expect(matches[0]!.index).toBe(pool.event.length - 1)
                // Decimal weights elsewhere can scale the entire tier by powers of ten.
                expect([1, 10, 100, 1000, 10000]).toContain(matches[0]!.weight)
                entries++
            }
        }
        expect(entries).toBe(2728)
    })

    test('covers ordinary life through 99 while infancy uses initialization follow-ups', () => {
        expect(daily.maxAge).toBe(99)
        for (let age = 0; age <= 99; age++) {
            expect(added.some(e => {
                const [min, max] = ageRange(e.when)
                return age >= min && age <= max
            })).toBe(true)
        }
        const targets = new Set([...events.values()].flatMap(e => e.followUps?.map(f => f.event) ?? []))
        for (const event of added.filter(e => !e.random)) expect(targets.has(event.id)).toBe(true)
        for (const age of [0, 1]) expect(ages.get(age)!.event.flat().every(([id]) => id < 50000)).toBe(true)
    })

    test('age 100 onward restores every original candidate, weight and priority tier', () => {
        for (let age = 100; age <= 500; age++) {
            expect(isPoolActive(daily, age)).toBe(false)
            expect(ages.get(age)!.event).toEqual(originalAges.get(age)!.event.map(tier => tier.events))
        }
        const restored = new Set(ages.get(110)!.event.flat().map(([id]) => id))
        expect(restored.has(11335)).toBe(true) // Original talent scene, not a cultivation-only whitelist.
        expect(restored.has(20332)).toBe(true) // Original crossover scene remains available.
    })
})
