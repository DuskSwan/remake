/** One-time, reproducible migration. Input is the archived Excel's v-transform output. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, type ConditionNode } from '../../condition'
import type { Event as LegacyEvent } from '../legacy/event.types'
import type { Event, StateCondition, StateEffect, StateField, Education, Occupation } from '../src/event.types'
import { parseEvents } from '../src/event.schema'

const fields: Record<string, StateField> = {
    AGE: 'props.current.age', CHR: 'props.current.charm', INT: 'props.current.intelligence',
    STR: 'props.current.strength', MNY: 'props.current.money', SPR: 'props.current.spirit',
    HAGE: 'props.highest.age', HCHR: 'props.highest.charm', HINT: 'props.highest.intelligence',
    HSTR: 'props.highest.strength', HMNY: 'props.highest.money', HSPR: 'props.highest.spirit',
    LAGE: 'props.lowest.age', LCHR: 'props.lowest.charm', LINT: 'props.lowest.intelligence',
    LSTR: 'props.lowest.strength', LMNY: 'props.lowest.money', LSPR: 'props.lowest.spirit',
    LIF: 'life', EVT: 'events', TLT: 'talents', TMS: 'profile.times',
    AEVT: 'profile.events', ATLT: 'profile.talents', AACH: 'profile.achievements', SUM: 'summary',
}
const operators = { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte', '=': 'eq', '!=': 'ne', '?': 'in', '!': 'notIn' } as const
const all = (...conditions: StateCondition[]): StateCondition => {
    const flattened = conditions.flatMap(c => 'all' in c ? c.all : [c])
    return flattened.length === 1 ? flattened[0]! : { all: flattened }
}
const test = (field: StateField, value: number | string | boolean, op: 'eq' | 'ne' | 'gte' = 'eq'): StateCondition => ({ field, op, value })
const inside = (field: StateField, value: (number | string)[]): StateCondition => ({ field, op: 'in', value })
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

function convert(node: ConditionNode): StateCondition {
    if (!Array.isArray(node)) {
        const match = node.match(/^\s*([A-Z]+)\s*(>=|<=|!=|>|<|=|\?|!)\s*(.*?)\s*$/)
        if (!match || !fields[match[1]!]) throw new Error(`Unsupported legacy condition: ${node}`)
        const [, name, operator, literal] = match
        const field = fields[name!]!
        const value = literal!.startsWith('[') ? JSON.parse(literal!) : Number(literal)
        const op = operators[operator as keyof typeof operators]
        if (['EVT', 'TLT', 'AEVT', 'ATLT', 'AACH'].includes(name!) && ['=', '!='].includes(operator!)) {
            const has: StateCondition = { field, op: 'has', value }
            return operator === '=' ? has : { not: has }
        }
        return { field, op, value }
    }
    if (!node.length) return { all: [] }
    // Preserve legacy short-circuit OR groups; do not reinterpret mixed operators.
    const groups: StateCondition[][] = [[]]
    for (let i = 0; i < node.length; i++) {
        const part = node[i]!
        if (part === '|') groups.push([])
        else if (part !== '&') groups.at(-1)!.push(convert(part))
    }
    const alternatives = groups.map(group => all(...group))
    return alternatives.length === 1 ? alternatives[0]! : { any: alternatives }
}

export function migrateLegacyCondition(condition?: string): StateCondition {
    return convert(parse(condition ?? ''))
}

export function migrateEvents(source: Iterable<LegacyEvent>): Event[] {
    const propertyNames = { AGE: 'age', CHR: 'charm', INT: 'intelligence', STR: 'strength', MNY: 'money', SPR: 'spirit', LIF: 'life' } as const
    const result = Array.from(source, (old): Event => ({
        id: old.id, event: old.event, grade: old.grade,
        ...(old.postEvent ? { postEvent: old.postEvent } : {}),
        ...(old.format ? { format: true } : {}),
        random: !old.NoRandom,
        when: all(
            ...(old.include ? [migrateLegacyCondition(old.include)] : []),
            ...(old.exclude ? [{ not: migrateLegacyCondition(old.exclude) }] : []),
        ),
        effects: Object.entries(old.effect ?? {}).map(([key, value]) => ({
            op: 'add', field: propertyNames[key as keyof typeof propertyNames], value,
        })),
        ...(old.branch ? { followUps: old.branch.map(b => ({ when: migrateLegacyCondition(b.condition), event: b.event })) } : {}),
    }))
    const map = new Map(result.map(e => [e.id, e]))
    function edit(ids: number[], effects: StateEffect[] = [], guard?: StateCondition) {
        for (const id of ids) {
            const event = map.get(id)
            if (!event) throw new Error(`Unknown migration target ${id}`)
            map.set(id, { ...event, when: guard ? all(event.when, guard) : event.when, effects: [...event.effects, ...effects] })
        }
    }
    const partnered = inside('actor.family.relationship', ['married', 'partnered'])
    const unmarried = { not: partnered }
    const livingChild: StateCondition = { child: { alive: true } }
    const employed = test('actor.career.status', 'employed')

    // Relationship transitions update current state; historical IDs remain historical.
    edit([10088,10229,10230,10234,10235,10236,10250,10266,10610,10611,10612,11093,11171], [{ op: 'relationship', status: 'married' }], unmarried)
    edit([10231,10233,10818], [{ op: 'relationship', status: 'partnered' }], unmarried)
    edit([10115,10116,10211,10212,10245,10246,10561,10562,10974,10975,11088,11089,11111,11112,11131,11140], [{ op: 'relationship', status: 'dating' }], unmarried)
    edit([10270,20076,11294], [{ op: 'relationship', status: 'divorced' }], partnered)
    edit([10281,10282,10653,10819,11295], [{ op: 'relationship', status: 'widowed' }], partnered)
    edit([10279,10280], [{ op: 'set', field: 'actor.family.partnerIll', value: true }], partnered)
    edit([10281], [], test('actor.family.partnerIll', true))
    edit([10273,10275,10276,10307,10622,...range(11350,11359),...range(11361,11376)], [], partnered)
    edit([10228,10251,10252,11128,11129,11130,11132], [], unmarried)

    // Every birth/adoption gets its own identity and clock-relative birth time.
    edit([10268], [{ op: 'child.add', sex: 'female' }], partnered)
    edit([10269], [{ op: 'child.add', sex: 'male' }], partnered)
    edit([10621,11240], [{ op: 'child.add' }], all(partnered, test('actor.family.childCount', 0)))
    edit([10830,11241,11242], [{ op: 'child.add' }], all(partnered, test('actor.family.childCount', 1)))
    edit([10831,11243,11244], [{ op: 'child.add' }], all(partnered, test('actor.family.childCount', 2)))
    edit([10272], [{ op: 'child.add', adopted: true }], partnered)
    edit([11311], [{ op: 'child.update', where: { alive: true }, alive: false }], livingChild)
    const adultChild = { alive: true, minAge: 16 } as const
    edit([10286,10287,10654], [{ op: 'child.grandchild', where: adultChild }], { child: adultChild })
    edit([10283,10284,10285,10322,10633,10634,10636,10834,10835,10838,...range(11245,11255),...range(11377,11404)], [], livingChild)
    edit([10283,11384,...range(11386,11393),...range(11396,11404)], [], { child: { alive: true, minAge: 6 } })
    edit([10647], [], { child: { alive: true, minAge: 16 } })
    edit([10694], [], test('actor.family.grandchildCount', 1, 'gte'))

    edit([10017,10125,10253,10255,10256,10649,10651,10868,11217,11257], [{ op: 'set', field: 'actor.family.fatherAlive', value: false }], test('actor.family.fatherAlive', true))
    edit([10016,10126,10254,10257,10650,10652,10869,11218,11258], [{ op: 'set', field: 'actor.family.motherAlive', value: false }], test('actor.family.motherAlive', true))
    edit([10012,10014,10019,10021,10144,10166,10172,10498,10536,10537,10728], [], all(test('actor.family.fatherAlive', true), test('actor.family.motherAlive', true)))
    edit([10018,10177], [], test('actor.family.fatherAlive', true))
    edit([10027,11044], [], test('actor.family.motherAlive', true))

    for (const [ids, sex] of [[[10001], 'male'], [[10002], 'female'], [[10110], 'none'], [[10111], 'intersex']] as const)
        edit([...ids], [{ op: 'set', field: 'actor.sex', value: sex }])
    for (const [id, location] of [[10009,'rural'],[10010,'city'],[10011,'usa']] as const)
        edit([id], [{ op: 'set', field: 'actor.origin', value: location }, { op: 'set', field: 'actor.location', value: location }])
    for (const [ids, location] of [[[10025,10082],'city'],[[10226],'rural'],[[10637],'switzerland'],[[11332],'space'],[[11333],'moon'],[[11334],'mars']] as const)
        edit([...ids], [{ op: 'set', field: 'actor.location', value: location }])

    const education: [number[], Education][] = [
        [[10101,10518,10870,10871], 'primary'],
        [[10184,10541,10542,10940,10941], 'middle'],
        [[10199,10200,10944,10945,10946], 'high'],
        [[10237,10238,10239,10580,20580,10581,10582,10584,10586,10587,11067,...range(11069,11077)], 'college'],
        [[11122], 'graduate'], [[11155], 'doctorate'], [[10736], 'completed'],
    ]
    for (const [ids, stage] of education) edit(ids, [{ op: 'education', stage }])
    edit([10155,10156,10185,10198], [{ op: 'education', stage: 'none' }])
    edit(range(11100,11121), [], test('actor.education.stage', 'college'))
    edit([11152,11153,11154,11161], [], inside('actor.education.stage', ['graduate','doctorate']))

    const jobs: [number[], Occupation][] = [
        [[10157,10737,11123,11236], 'worker'], [[10468], 'factory'], [[10226], 'farmer'],
        [[10475,11162,11163], 'teacher'], [[10476], 'nurse'], [[10477], 'doctor'],
        [[11127], 'civilServant'], [[10607], 'finance'], [[10608,11124], 'entrepreneur'],
        [[10609,10667,10669,10671,11259,11260], 'researcher'],
        [[10082,10950,10959,10960], 'performer'], [[10952,10953,10954,10955], 'creator'],
        [[10191,10202,10203,10939], 'athlete'], [[10259], 'military'],
    ]
    for (const [ids, occupation] of jobs) edit(ids, [{ op: 'career', status: 'employed', occupation }])
    edit([10475,10476,10477,10607,10608,10609,10737,11123,11124,11127,11162,11163], [{ op: 'education', stage: 'completed' }])
    edit([10195,10197,10210,10264,10473,10951,11172,11239], [{ op: 'career', status: 'unemployed' }], employed)
    edit([10492,10493,10769,10627,11238,11256], [{ op: 'career', status: 'retired' }], employed)
    edit([10161,10162,...range(10469,10473),...range(10478,10488),10611,10660,10661,10662,10663,10664,...range(10738,10741),10746,10747,10758,10763,10764,10766,11133,11135,11136,11137,11138,...range(11141,11149),11151,11248,11249,11250,11279,30001], [], employed)
    edit([10474], [], inside('actor.career.status', ['none', 'unemployed']))
    // A past job is not the current job after a career change.
    const role = (occupations: Occupation[]) => all(employed, inside('actor.career.occupation', occupations))
    edit(range(10469,10473), [], role(['factory']))
    edit([10478,10479,10487,10488,10491,10492,10493], [], role(['teacher','nurse','doctor']))
    edit([10480,10485,10486], [], role(['teacher']))
    edit([10481], [], role(['teacher','doctor']))
    edit([10482], [], role(['nurse','doctor']))
    edit([10483], [], role(['doctor']))
    edit([10484], [], role(['nurse']))
    edit(range(10660,10664), [], role(['researcher']))
    edit([11231,11319], [{ op: 'set', field: 'actor.imprisoned', value: true }, { op: 'career', status: 'unemployed' }])
    edit([11233,11234,11321,11322], [{ op: 'set', field: 'actor.imprisoned', value: false }], test('actor.imprisoned', true))
    edit([11232,11320,11323], [], test('actor.imprisoned', true))
    edit([11233], [], { history: { event: 11231, minYearsSinceLast: 10 } })

    // Named facts are also state, covering illnesses and world milestones.
    for (const [ids, name] of [[[10085],'health.hiv'],[[10290],'health.cancer'],[[10315],'health.paralysis'],[[10794],'health.chronic'],[[10805,11263],'world.fusion'],[[11288],'world.virtualWorld'],[[11305],'world.cancerCure']] as const)
        edit([...ids], [{ op: 'fact', name, value: true }])
    edit([10086], [], { field: 'actor.facts', op: 'has', value: 'health.hiv' })
    edit([10803], [], { not: { field: 'actor.facts', op: 'has', value: 'world.cancerCure' } })
    edit([11272], [], { field: 'actor.facts', op: 'has', value: 'world.fusion' })
    edit([11289,11290,11291], [], { field: 'actor.facts', op: 'has', value: 'world.virtualWorld' })
    // Death and resurrection are state transitions, including immediate resolutions.
    edit([10000], [], test('life', 1, 'gte'))
    edit([20000,20001,11504], [], { field: 'life', op: 'lte', value: 0 })
    return parseEvents(Array.from(map.values()))
}

if (import.meta.main) {
    const [input, output] = process.argv.slice(2)
    if (!input || !output) throw new Error('Usage: bun migrate-events.ts <legacy-event.ts> <output.json>')
    const legacy = (await import(pathToFileURL(resolve(input)).href)).default as Map<number, LegacyEvent>
    const migrated = migrateEvents(legacy.values())
    await Bun.write(resolve(output), JSON.stringify(migrated, null, 2) + '\n')
    console.log(JSON.stringify({ events: migrated.length, statefulEvents: migrated.filter(e => e.effects.some(x => x.op !== 'add')).length }))
}
