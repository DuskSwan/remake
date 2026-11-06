import { describe, expect, test } from 'bun:test'
import { enableMapSet, produce } from 'immer'
import { events, type Event } from '@remake/data'
import { createState, createFlatState, type ProfileState } from './state'
import { check as legacyCheck } from '@remake/condition'
import { migrateLegacyCondition } from '../../data/utils/migrate-events'
import { advanceTime, applyEffects, childAge, recordEvent, satisfies } from './actor'
import { canTrigger, check, trigger } from './event'

enableMapSet()
const profile: ProfileState = { times: 0, talents: new Set(), achievements: new Set(), events: new Set() }
const newborn = () => advanceTime(createState({ charm: 5, intelligence: 5, strength: 5, money: 5, spirit: 5 }))
function history(state: ReturnType<typeof newborn>, ids: number[]) {
    return ids.reduce((s, id) => recordEvent(s, id), state)
}

describe('Actor state and declarative events', () => {
    test('migration preserves mixed boolean logic, negation and history/profile membership', () => {
        const expressions = [
            'STR>3&CHR<7|INT>6&MNY<3',
            '((INT>6)&(EVT?[10940]))|(EVT?[10941])',
            '(EVT?[10009])&(TLT![1048])',
            'EVT=10009|EVT!=10941',
            '(AGE![500])&(TLT?[1148])&(EVT![20001])',
            '(AEVT?[10009,10941])&(TMS>3)',
        ]
        for (let i = 0; i < 20; i++) {
            const state = produce(newborn(), draft => {
                draft.props.current.strength = i % 10
                draft.props.current.intelligence = (i * 3) % 10
                draft.props.current.money = i % 4
                if (i % 2) draft.events.add(10009)
                if (i % 3) draft.events.add(10940)
                if (i % 4) draft.events.add(10941)
                if (i % 5) draft.talents.add(1048)
            })
            const p = { ...profile, times: i, events: new Set(i % 2 ? [10009] : []) }
            for (const expression of expressions) {
                expect(satisfies(state, p, migrateLegacyCondition(expression)))
                    .toBe(legacyCheck(createFlatState(state, p), expression))
            }
        }
    })
    test('natural time updates age and derives every child age independently', () => {
        let state = advanceTime(newborn(), 39)
        state = applyEffects(state, [{ op: 'child.add', sex: 'female' }])
        state = advanceTime(state, 3)
        state = applyEffects(state, [{ op: 'child.add', sex: 'male' }])
        const later = advanceTime(state, 6)
        expect(later.props.current.age).toBe(48)
        expect(later.actor.family.children.map(c => childAge(later, c))).toEqual([9, 6])
        expect(state.actor.family.children.map(c => childAge(state, c))).toEqual([3, 0])
        expect(later.actor.family.children.map(c => c.id)).toEqual([1, 2])
    })

    test('late parenthood cannot produce a grandchild nine years later', () => {
        let state = advanceTime(newborn(), 39)
        state = history(applyEffects(state, [{ op: 'child.add' }]), [10268])
        state = advanceTime(state, 9)
        expect(check(10286, state, profile)).toBe(false)
        expect(() => trigger(10286, state, profile)).toThrow('not eligible')
        state = advanceTime(state, 7)
        expect(check(10286, state, profile)).toBe(true)
        const result = trigger(10286, state, profile)
        expect(result.state.actor.family.children[0]!.grandchildren).toBe(1)
    })

    test('the same living eligible child receives the grandchild update', () => {
        const state = applyEffects(newborn(), [
            { op: 'child.add', age: 20 }, { op: 'child.add', age: 17 }, { op: 'child.add', age: 2 },
            { op: 'child.update', where: { id: 1 }, alive: false },
        ])
        const result = applyEffects(state, [{ op: 'child.grandchild', where: { alive: true, minAge: 16 } }])
        expect(result.actor.family.children.map(c => c.grandchildren)).toEqual([0, 1, 0])
    })

    test('divorce and widowhood block the old marriage birth route', () => {
        let state = history(newborn(), [10229])
        state = applyEffects(state, [{ op: 'relationship', status: 'married' }])
        expect(check(10268, state, profile)).toBe(true)
        for (const id of [20076, 10282]) {
            const ended = trigger(id, state, profile).state
            expect(check(10268, ended, profile)).toBe(false)
            expect(ended.events.has(10229)).toBe(true)
        }
    })

    test('relationship changes do not leave a previous partner illness or block a new marriage state', () => {
        let state = applyEffects(newborn(), [
            { op: 'relationship', status: 'married' },
            { op: 'set', field: 'actor.family.partnerIll', value: true },
            { op: 'relationship', status: 'widowed' },
        ])
        state = applyEffects(state, [{ op: 'relationship', status: 'married' }])
        expect(state.actor.family.relationship).toBe('married')
        expect(state.actor.family.partnerIll).toBe(false)
        expect(canTrigger(10281, history(state, [10279]), profile)).toBe(false)
    })

    test('a deceased parent cannot die again through another event ID', () => {
        const initial = history(applyEffects(newborn(), [
            { op: 'add', field: 'strength', value: -4 },
            { op: 'add', field: 'money', value: -4 },
            { op: 'add', field: 'spirit', value: -4 },
        ]), [10009])
        const state = trigger(10017, initial, profile).state
        expect(state.actor.family.fatherAlive).toBe(false)
        expect(canTrigger(10125, history(state, [10009]), profile)).toBe(false)
    })

    test('lost employment blocks workplace events even with old employment history', () => {
        let state = history(newborn(), [10468])
        state = applyEffects(state, [{ op: 'career', status: 'employed', occupation: 'factory' }])
        expect(check(10469, state, profile)).toBe(true)
        state = trigger(10473, state, profile).state
        expect(state.actor.career.status).toBe('unemployed')
        expect(check(10469, state, profile)).toBe(false)
    })

    test('age reversal does not reverse elapsed time or resurrect state', () => {
        let state = advanceTime(newborn(), 39)
        state = applyEffects(state, [{ op: 'child.add' }, { op: 'set', field: 'actor.family.fatherAlive', value: false }])
        state = advanceTime(state, 9)
        state = applyEffects(state, [{ op: 'add', field: 'age', value: -50 }])
        expect(state.clock).toBe(48)
        expect(state.props.current.age).toBe(-2)
        expect(childAge(state, state.actor.family.children[0]!)).toBe(9)
        expect(state.actor.family.fatherAlive).toBe(false)
    })

    test('current occupation gates old workplace events and first-time job seekers remain eligible', () => {
        let state = history(newborn(), [10468])
        state = applyEffects(state, [{ op: 'career', status: 'employed', occupation: 'factory' }])
        expect(check(10469, state, profile)).toBe(true)
        state = applyEffects(state, [{ op: 'career', status: 'employed', occupation: 'doctor' }])
        expect(check(10469, state, profile)).toBe(false)
        const seeking = history(applyEffects(newborn(), [{ op: 'add', field: 'charm', value: -4 }]), [10238])
        expect(check(10474, seeking, profile)).toBe(true)
    })

    test('ordinary prison release waits ten elapsed years from imprisonment', () => {
        const arrested = history(newborn(), [11230])
        const imprisoned = trigger(11231, arrested, profile).state
        expect(check(11233, advanceTime(imprisoned, 9), profile)).toBe(false)
        const completed = applyEffects(advanceTime(imprisoned, 10), [{ op: 'add', field: 'age', value: -5 }])
        expect(check(11233, completed, profile)).toBe(true)
        expect(trigger(11233, completed, profile).state.actor.imprisoned).toBe(false)
    })

    test('history keeps counts and first/last time as state', () => {
        let state = recordEvent(newborn(), 10069)
        state = recordEvent(advanceTime(state, 3), 10069)
        expect(state.events.size).toBe(1)
        expect(state.eventHistory.get(10069)).toEqual({ count: 2, firstAt: 0, lastAt: 3 })
        expect(satisfies(state, profile, { field: 'events', op: 'has', value: 10069 })).toBe(true)
        expect(satisfies(state, profile, { history: { event: 10069, minCount: 2 } })).toBe(true)
        expect(satisfies(state, profile, { history: { event: 10069, maxCount: 1 } })).toBe(false)
        expect(satisfies(state, profile, { history: { event: 10069, minYearsSinceLast: 1 } })).toBe(false)
        expect(satisfies(advanceTime(state, 2), profile, { history: { event: 10069, minYearsSinceLast: 2, maxYearsSinceLast: 3 } })).toBe(true)
        expect(satisfies(state, profile, { history: { event: 10001 } })).toBe(false)
    })

    test('invalid child update rolls back the entire event effect transaction', () => {
        const state = newborn()
        expect(() => applyEffects(state, [
            { op: 'add', field: 'money', value: 9 },
            { op: 'child.update', where: { alive: true }, alive: false },
        ])).toThrow('No child')
        expect(state.props.current.money).toBe(5)
    })

    test('follow-ups enforce target state conditions while allowing non-random resolutions', () => {
        const root: Event = { id: 900001, event: 'test', grade: 0, random: true, when: { all: [] }, effects: [], followUps: [{ when: { all: [] }, event: 900002 }] }
        const target: Event = { id: 900002, event: 'test', grade: 0, random: false, when: { field: 'actor.family.relationship', op: 'eq', value: 'married' }, effects: [] }
        events.set(root.id, root); events.set(target.id, target)
        try {
            expect(trigger(root.id, newborn(), profile).triggers).toEqual([root.id])
            const married = applyEffects(newborn(), [{ op: 'relationship', status: 'married' }])
            expect(check(target.id, married, profile)).toBe(false)
            expect(trigger(root.id, married, profile).triggers).toEqual([root.id, target.id])
        } finally { events.delete(root.id); events.delete(target.id) }
    })

    test('cyclic resolutions fail without mutating the input', () => {
        const event: Event = { id: 900003, event: 'cycle', grade: 0, random: true, when: { all: [] }, effects: [], followUps: [{ when: { all: [] }, event: 900003 }] }
        events.set(event.id, event)
        const state = newborn()
        try {
            expect(() => trigger(event.id, state, profile)).toThrow('Cyclic')
            expect(state.events.has(event.id)).toBe(false)
        } finally { events.delete(event.id) }
    })

    test('each newly created game owns independent actor state', () => {
        const first = applyEffects(newborn(), [{ op: 'child.add' }])
        const second = newborn()
        expect(first.actor.family.children).toHaveLength(1)
        expect(second.actor.family.children).toHaveLength(0)
        const advanced = produce(first, d => { d.actor.facts.add('world.test') })
        expect(second.actor.facts.size).toBe(0)
        expect(advanced.actor.facts.has('world.test')).toBe(true)
    })
})
