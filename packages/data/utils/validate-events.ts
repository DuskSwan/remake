import { events, ages, eventPools, talents, achievements, type StateCondition } from '../src'

function references(condition: StateCondition) {
    if ('all' in condition) return condition.all.forEach(references)
    if ('any' in condition) return condition.any.forEach(references)
    if ('not' in condition) return references(condition.not)
    if ('history' in condition) {
        if (!events.has(condition.history.event)) throw new Error(`Unknown history ID: ${condition.history.event}`)
        return
    }
    if (!('field' in condition)) return
    const catalogs = {
        events, 'profile.events': events,
        talents, 'profile.talents': talents,
        achievements, 'profile.achievements': achievements,
    }
    const catalog = catalogs[condition.field as keyof typeof catalogs]
    if (!catalog) return
    for (const id of Array.isArray(condition.value) ? condition.value : [condition.value]) {
        if (!catalog.has(id as number)) throw new Error(`Unknown ${condition.field} ID: ${id}`)
    }
}

for (const event of events.values()) {
    references(event.when)
    event.followUps?.forEach(follow => references(follow.when))
}
for (const [age, pool] of ages) {
    for (const tier of pool.event) {
        for (const [id, weight] of tier) {
            if (!events.has(id)) throw new Error(`Age ${age}: unknown event ${id}`)
            if (!events.get(id)!.random) throw new Error(`Age ${age}: non-random event ${id}`)
            if (!Number.isFinite(weight) || weight <= 0) throw new Error(`Age ${age}: invalid weight for ${id}`)
        }
    }
}
console.log(`Validated ${eventPools.size} event pools, ${events.size} events, ${ages.size} age pools and all state/history references.`)
