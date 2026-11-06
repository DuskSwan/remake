import { type Event, events } from '@remake/data'
import type { GameState, ProfileState } from './state'
import type { TriggerResult } from './game'
import { applyEffects, recordEvent, satisfies } from './actor'

function definition(id: Event['id']) {
    const event = events.get(id)
    if (!event) throw new Error(`Unknown event: ${id}`)
    return event
}

/** State eligibility is identical for random draws and immediate follow-ups. */
export function canTrigger(id: Event['id'], state: GameState, profile: ProfileState) {
    const event = definition(id)
    return satisfies(state, profile, event.when)
        && event.effects.every(effect =>
            effect.op !== 'child.update' && effect.op !== 'child.grandchild'
                || satisfies(state, profile, { child: effect.where }))
}

export function check(id: Event['id'], state: GameState, profile: ProfileState) {
    return definition(id).random && canTrigger(id, state, profile)
}

export function trigger(
    id: Event['id'], state: GameState, profile: ProfileState,
): TriggerResult<Event['id']> {
    return resolve(id, state, profile, new Set())
}

function resolve(
    id: Event['id'], state: GameState, profile: ProfileState, path: Set<number>,
): TriggerResult<Event['id']> {
    if (path.has(id) || path.size >= 64) throw new Error(`Cyclic or excessive event chain at ${id}`)
    if (!canTrigger(id, state, profile)) throw new Error(`Event ${id} is not eligible in the current state`)
    const event = definition(id)
    const updated = recordEvent(applyEffects(state, event.effects), id)
    const nextPath = new Set([...path, id])
    for (const followUp of event.followUps ?? []) {
        if (!satisfies(updated, profile, followUp.when) || !canTrigger(followUp.event, updated, profile)) continue
        const result = resolve(followUp.event, updated, profile, nextPath)
        return { state: result.state, triggers: [id, ...result.triggers] }
    }
    return { state: updated, triggers: [id] }
}
