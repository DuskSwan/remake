import { expect, test } from 'bun:test'
import { talents } from '@remake/data'
import { createState, type ProfileState } from './state'
import { next } from './game'
import { exclude, replacement } from './talent'
import { childAge } from './actor'

const profile: ProfileState = { times: 10, talents: new Set(), events: new Set(), achievements: new Set() }
function seeded(seed: number) {
    let value = seed >>> 0
    return (max = 1, min = 0) => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0
        return min + Math.floor(value / 4294967296 * (max - min + 1))
    }
}

// Full cultivation routes can exceed the runner's default five-second budget.
test('300 seeded lives preserve time, child identities and event history through full runs', () => {
    const allTalents = [...talents.keys()]
    let turns = 0
    let finished = 0
    for (let seed = 1; seed <= 300; seed++) {
        const rng = seeded(seed)
        const selected = new Set<number>()
        while (selected.size < 3) {
            const id = allTalents[rng(allTalents.length - 1)]!
            if (!selected.has(id) && exclude(id, selected) === null) selected.add(id)
        }
        let state = createState({ charm: rng(10), intelligence: rng(10), strength: rng(10), money: rng(10), spirit: 5 }, replacement(selected, rng).talents)
        try {
            for (let turn = 0; turn < 1200; turn++) {
                const previousClock = state.clock
                const result = next(state, profile, rng)
                state = result.state
                turns++
                if (state.clock !== previousClock + 1) throw new Error('clock did not advance exactly once')
                if (new Set(state.actor.family.children.map(c => c.id)).size !== state.actor.family.children.length) throw new Error('duplicate child identity')
                if (state.actor.family.children.some(c => childAge(state, c) < 0)) throw new Error('negative child age')
                if (result.events.some(id => !state.events.has(id) || !state.eventHistory.has(id))) throw new Error('missing event history')
                if (result.end) { finished++; break }
                if (turn === 1199) throw new Error('life did not finish within 1200 turns')
            }
        } catch (error) {
            throw new Error(`Seed ${seed}, age ${state.props.current.age}, talents ${[...state.talents]}: ${error}`)
        }
    }
    expect(finished).toBe(300)
    expect(turns).toBeGreaterThan(3000)
}, 15000)
