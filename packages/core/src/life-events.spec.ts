import { describe, expect, test } from 'bun:test'
import { events, type Occupation, type StateEffect } from '@remake/data'
import { enableMapSet } from 'immer'
import { createState, type ProfileState } from './state'
import { advanceTime, applyEffects, satisfies } from './actor'
import { canTrigger, trigger } from './event'
import { next } from './game'

enableMapSet()
const profile: ProfileState = { times: 0, talents: new Set(), achievements: new Set(), events: new Set() }
const person = (age: number, effects: StateEffect[] = []) => applyEffects(
    advanceTime(createState({charm: 5, intelligence: 5, strength: 5, money: 5, spirit: 5}), age + 1),
    [{op: 'set', field: 'actor.sex', value: 'female'}, {op: 'set', field: 'actor.location', value: 'city'}, ...effects],
)

describe('Ordinary life event eligibility', () => {
    test('birth and location are initialized before the new infant descriptions', () => {
        for (const [id, sex] of [[10001, 'male'], [10002, 'female'], [10110, 'none'], [10111, 'intersex']] as const) {
            for (const money of [1, 4, 7, 10]) {
                const newborn = advanceTime(createState({charm: 5, intelligence: 5, strength: 5, money, spirit: 5}))
                const result = trigger(id, newborn, profile)
                expect(result.state.actor.sex).toBe(sex)
                expect(result.triggers).toEqual([id, 50000 + [1, 4, 7, 10].indexOf(money)])
                expect(result.state.props.current.money).toBe(money)
                expect(canTrigger(result.triggers[1]!, result.state, profile)).toBe(false)
            }
        }
        for (const [id, location, money, follow] of [[10009, 'rural', 5, 50004], [10010, 'city', 5, 50005], [10010, 'city', 7, 50006], [10011, 'usa', 9, 50007]] as const) {
            const infant = applyEffects(person(1), [{op: 'add', field: 'money', value: money - 5}])
            const result = trigger(id, infant, profile)
            expect(result.state.actor.origin).toBe(location)
            expect(result.state.actor.location).toBe(location)
            expect(result.triggers).toEqual([id, follow])
        }
        const initial = createState({charm: 5, intelligence: 5, strength: 5, money: 5, spirit: 5})
        const born = next(initial, profile, () => 0)
        const yearOne = next(born.state, profile, () => 0)
        expect(born.events).toEqual([10001, 50001])
        expect(yearOne.events).toEqual([10009, 50004])
    })

    test('school scenes require the current education stage and appropriate age', () => {
        for (const [id, min, max, stage] of [[50064, 6, 8, 'primary'], [50128, 12, 14, 'middle'], [50152, 15, 17, 'high'], [50192, 18, 24, 'college']] as const) {
            const studying: StateEffect[] = [{op: 'education', stage}]
            expect(canTrigger(id, person(min, studying), profile)).toBe(true)
            expect(canTrigger(id, person(max, studying), profile)).toBe(true)
            expect(canTrigger(id, person(min - 1, studying), profile)).toBe(false)
            expect(canTrigger(id, person(max + 1, studying), profile)).toBe(false)
            expect(canTrigger(id, person(min), profile)).toBe(false)
            expect(canTrigger(id, person(min, [{op: 'education', stage: 'completed'}]), profile)).toBe(false)
        }
    })

    test('occupation-specific stories stop on job loss, retirement or a career change', () => {
        const cases: [number, Occupation][] = [[50264, 'worker'], [50266, 'factory'], [50268, 'farmer'], [50269, 'teacher'], [50270, 'nurse'], [50271, 'doctor'], [50272, 'civilServant'], [50273, 'researcher'], [50274, 'entrepreneur'], [50275, 'finance'], [50276, 'performer'], [50277, 'creator'], [50278, 'athlete'], [50279, 'military']]
        for (const [id, occupation] of cases) {
            const employed = person(30, [{op: 'career', status: 'employed', occupation}])
            expect(canTrigger(id, employed, profile)).toBe(true)
            for (const status of ['unemployed', 'retired'] as const) {
                expect(canTrigger(id, applyEffects(employed, [{op: 'career', status}]), profile)).toBe(false)
            }
            const other = occupation === 'worker' ? 'teacher' : 'worker'
            expect(canTrigger(id, applyEffects(employed, [{op: 'career', status: 'employed', occupation: other}]), profile)).toBe(false)
        }
    })

    test('parent and partner scenes use current living and relationship states', () => {
        const child = person(3)
        expect(canTrigger(50010, child, profile)).toBe(true)
        expect(canTrigger(50010, applyEffects(child, [{op: 'set', field: 'actor.family.motherAlive', value: false}]), profile)).toBe(false)
        expect(canTrigger(50011, applyEffects(child, [{op: 'set', field: 'actor.family.fatherAlive', value: false}]), profile)).toBe(false)
        const married = person(30, [{op: 'relationship', status: 'married'}])
        expect(canTrigger(50252, married, profile)).toBe(true)
        expect(canTrigger(50251, married, profile)).toBe(true)
        expect(canTrigger(50251, applyEffects(married, [{op: 'set', field: 'actor.family.partnerIll', value: true}]), profile)).toBe(false)
        for (const status of ['single', 'divorced', 'widowed'] as const) {
            expect(canTrigger(50252, applyEffects(married, [{op: 'relationship', status}]), profile)).toBe(false)
        }
    })

    test('child stories require a living child of the specified age', () => {
        for (const [id, min, max] of [[50256, 1, 5], [50259, 6, 12], [50263, 13, 17]] as const) {
            expect(canTrigger(id, person(39), profile)).toBe(false)
            for (const age of [min, max]) {
                const parent = person(39, [{op: 'child.add', age}])
                expect(canTrigger(id, parent, profile)).toBe(true)
                const bereaved = applyEffects(parent, [{op: 'child.update', where: {id: 1}, alive: false}])
                expect(canTrigger(id, bereaved, profile)).toBe(false)
            }
            for (const age of [min - 1, max + 1]) expect(canTrigger(id, person(39, [{op: 'child.add', age}]), profile)).toBe(false)
        }
        const parent = person(70, [{op: 'child.add', age: 40}])
        expect(canTrigger(50317, parent, profile)).toBe(false)
        const grandparent = applyEffects(parent, [{op: 'child.grandchild', where: {alive: true, minAge: 16}}])
        expect(canTrigger(50317, grandparent, profile)).toBe(true)
    })

    test('retirement stories do not appear merely because someone is old', () => {
        expect(canTrigger(50320, person(65), profile)).toBe(false)
        expect(canTrigger(50320, person(65, [{op: 'career', status: 'employed', occupation: 'teacher'}]), profile)).toBe(false)
        expect(canTrigger(50320, person(65, [{op: 'career', status: 'retired'}]), profile)).toBe(true)
    })

    test('one-time scenes stay consumed after age reversal', () => {
        const result = trigger(50008, person(2), profile)
        expect(canTrigger(50008, result.state, profile)).toBe(false)
        const later = applyEffects(advanceTime(result.state, 10), [{op: 'add', field: 'age', value: -10}])
        expect(later.props.current.age).toBe(2)
        expect(canTrigger(50008, later, profile)).toBe(false)
    })

    test('the daily pool cutoff blocks direct triggers and follow-ups even when event conditions allow age 100', () => {
        expect(canTrigger(50328, person(99), profile)).toBe(true)
        for (const id of [50340, 50341, 50342, 50343]) {
            expect(canTrigger(id, person(99), profile)).toBe(false)
            for (const age of [100, 109, 110, 120, 200, 500]) {
                expect(satisfies(person(age), profile, events.get(id)!.when)).toBe(true)
                expect(canTrigger(id, person(age), profile)).toBe(false)
                expect(() => trigger(id, person(age), profile)).toThrow('not eligible')
            }
        }
        const source = {id: 900010, event: 'test', grade: 0 as const, random: true, when: {all: []}, effects: [], followUps: [{when: {all: []}, event: 50328}, {when: {all: []}, event: 50340}]}
        events.set(source.id, source)
        try {
            expect(trigger(source.id, person(99), profile).triggers).toEqual([source.id, 50328])
            expect(trigger(source.id, person(100), profile).triggers).toEqual([source.id])
        } finally { events.delete(source.id) }
    })

    test('recurring scenes wait elapsed years, allow at most three occurrences, and cannot be reset by rejuvenation', () => {
        const id = 50240
        let state = trigger(id, person(25), profile).state
        expect(canTrigger(id, state, profile)).toBe(false)
        state = advanceTime(state, 4)
        expect(canTrigger(id, state, profile)).toBe(false)
        state = applyEffects(advanceTime(state), [{op: 'add', field: 'age', value: -5}])
        expect(canTrigger(id, state, profile)).toBe(true)
        state = trigger(id, state, profile).state
        state = trigger(id, advanceTime(state, 5), profile).state
        expect(state.eventHistory.get(id)?.count).toBe(3)
        expect(canTrigger(id, advanceTime(state, 5), profile)).toBe(false)
    })

    test('ordinary outside-world scenes reject imprisonment, death and off-world locations', () => {
        const normal = person(30)
        expect(canTrigger(50240, normal, profile)).toBe(true)
        for (const effect of [
            {op: 'set', field: 'actor.imprisoned', value: true},
            {op: 'add', field: 'life', value: -1},
            {op: 'set', field: 'actor.location', value: 'mars'},
        ] satisfies StateEffect[]) {
            expect(canTrigger(50240, applyEffects(normal, [effect]), profile)).toBe(false)
        }
    })
})
