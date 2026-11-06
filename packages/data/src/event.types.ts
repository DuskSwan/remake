/** Declarative event format. Conditions read state; effects only change state. */
export type EventGrade = 0 | 1 | 2 | 3
export type Relationship = 'single' | 'dating' | 'partnered' | 'married' | 'divorced' | 'widowed'
export type Education = 'none' | 'primary' | 'middle' | 'high' | 'college' | 'graduate' | 'doctorate' | 'completed'
export type Employment = 'none' | 'employed' | 'unemployed' | 'retired'
export type Occupation = 'none' | 'worker' | 'factory' | 'farmer' | 'teacher' | 'nurse' | 'doctor' | 'civilServant' | 'researcher' | 'entrepreneur' | 'finance' | 'performer' | 'creator' | 'athlete' | 'military'
export type Sex = 'unknown' | 'male' | 'female' | 'intersex' | 'none'
export type Location = 'unknown' | 'rural' | 'city' | 'usa' | 'switzerland' | 'space' | 'moon' | 'mars'

export interface ChildState {
    id: number
    bornAt: number
    alive: boolean
    sex: Sex
    adopted: boolean
    grandchildren: number
}

export interface ActorState {
    sex: Sex
    origin: Location
    location: Location
    family: {
        relationship: Relationship
        relationshipSince: number | null
        partnerIll: boolean
        fatherAlive: boolean
        motherAlive: boolean
        children: ChildState[]
        nextChildId: number
    }
    education: { stage: Education; since: number | null }
    career: { status: Employment; occupation: Occupation; since: number | null }
    imprisoned: boolean
    facts: Set<string>
}

export const numericStateFields = [
    'props.current.age', 'props.current.charm', 'props.current.intelligence',
    'props.current.strength', 'props.current.money', 'props.current.spirit',
    'props.highest.age', 'props.highest.charm', 'props.highest.intelligence',
    'props.highest.strength', 'props.highest.money', 'props.highest.spirit',
    'props.lowest.age', 'props.lowest.charm', 'props.lowest.intelligence',
    'props.lowest.strength', 'props.lowest.money', 'props.lowest.spirit',
    'life', 'clock', 'summary', 'profile.times',
    'actor.family.childCount', 'actor.family.livingChildCount',
    'actor.family.grandchildCount', 'actor.family.relationshipYears',
    'actor.education.years', 'actor.career.years',
] as const
export const enumStateFields = {
    'actor.sex': ['unknown', 'male', 'female', 'intersex', 'none'],
    'actor.origin': ['unknown', 'rural', 'city', 'usa', 'switzerland', 'space', 'moon', 'mars'],
    'actor.location': ['unknown', 'rural', 'city', 'usa', 'switzerland', 'space', 'moon', 'mars'],
    'actor.family.relationship': ['single', 'dating', 'partnered', 'married', 'divorced', 'widowed'],
    'actor.education.stage': ['none', 'primary', 'middle', 'high', 'college', 'graduate', 'doctorate', 'completed'],
    'actor.career.status': ['none', 'employed', 'unemployed', 'retired'],
    'actor.career.occupation': ['none', 'worker', 'factory', 'farmer', 'teacher', 'nurse', 'doctor', 'civilServant', 'researcher', 'entrepreneur', 'finance', 'performer', 'creator', 'athlete', 'military'],
} as const
export const booleanStateFields = [
    'actor.family.partnerIll', 'actor.family.fatherAlive', 'actor.family.motherAlive', 'actor.imprisoned',
] as const
export const setStateFields = ['events', 'talents', 'achievements', 'profile.events', 'profile.talents', 'profile.achievements', 'actor.facts'] as const
export type StateField = typeof numericStateFields[number] | keyof typeof enumStateFields | typeof booleanStateFields[number] | typeof setStateFields[number]
export type Comparison = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'has'
export type StateValue = number | string | boolean | (number | string | boolean)[]
export interface ChildQuery {
    id?: number
    minAge?: number
    maxAge?: number
    alive?: boolean
    sex?: Sex
    maxGrandchildren?: number
}
export interface HistoryQuery {
    event: number
    minCount?: number
    maxCount?: number
    minYearsSinceLast?: number
    maxYearsSinceLast?: number
}
export type StateCondition =
    | { all: StateCondition[] }
    | { any: StateCondition[] }
    | { not: StateCondition }
    | { field: StateField; op: Comparison; value: StateValue }
    | { child: ChildQuery }
    | { history: HistoryQuery }

export type PropertyName = 'age' | 'charm' | 'intelligence' | 'strength' | 'money' | 'spirit'
export type SettableField = 'actor.sex' | 'actor.origin' | 'actor.location' | typeof booleanStateFields[number]
export type StateEffect =
    | { op: 'add'; field: PropertyName | 'life'; value: number }
    | { op: 'set'; field: SettableField; value: string | boolean }
    | { op: 'relationship'; status: Relationship }
    | { op: 'education'; stage: Education }
    | { op: 'career'; status: Employment; occupation?: Occupation }
    | { op: 'fact'; name: string; value: boolean }
    | { op: 'child.add'; sex?: Sex; age?: number; adopted?: boolean }
    | { op: 'child.update'; where: ChildQuery; alive: boolean }
    | { op: 'child.grandchild'; where: ChildQuery }

export interface Event {
    readonly id: number
    readonly event: string
    readonly grade: EventGrade
    readonly postEvent?: string
    readonly format?: boolean
    /** Selection metadata; false does not bypass the state condition on a follow-up. */
    readonly random: boolean
    readonly when: StateCondition
    readonly effects: StateEffect[]
    /** Existing immediate resolutions only; not a multi-event yearly scheduler. */
    readonly followUps?: { when: StateCondition; event: number }[]
}
