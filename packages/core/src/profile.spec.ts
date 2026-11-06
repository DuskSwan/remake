import { describe, expect, test } from 'bun:test'
import { achievements, events, talents } from '@remake/data'
import { parseProfile, serializeProfile } from './profile'
import type { ProfileState } from './state'

const achievementIds = Array.from(achievements.keys()).slice(0, 2).reverse()
const eventIds = Array.from(events.keys()).slice(0, 2)
const talentIds = Array.from(talents.keys()).slice(0, 2)
const saved = {
    times: 42, achievements: achievementIds, events: eventIds, talents: talentIds,
    locked: [talentIds[0]!],
    highest: { age: 100, charm: 10, intelligence: 11, strength: 9, money: 30, spirit: 8 },
    lowest: { age: -1, charm: 1, intelligence: 2, strength: -3, money: -10, spirit: 0 },
}

describe('Profile import/export', () => {
    test('the existing JSON format round trips all fields and achievement order', () => {
        const profile = parseProfile(JSON.stringify(saved))
        expect(profile.achievements).toBeInstanceOf(Set)
        expect(Array.from(profile.achievements)).toEqual(achievementIds)
        expect(JSON.parse(serializeProfile(profile, 2))).toEqual(saved)
        expect(parseProfile(serializeProfile(profile))).toEqual(profile)
    })

    test('a new empty profile does not gain optional fields or metadata', () => {
        const profile: ProfileState = { times: 0, achievements: new Set(), events: new Set(), talents: new Set() }
        expect(JSON.parse(serializeProfile(profile))).toEqual({ times: 0, achievements: [], events: [], talents: [] })
        expect(parseProfile(serializeProfile(profile))).toEqual(profile)
    })

    test('UTF-8 BOM and duplicate history IDs preserve first acquisition order', () => {
        const profile = parseProfile('\uFEFF' + JSON.stringify({ ...saved, achievements: [...achievementIds, achievementIds[0]] }))
        expect(Array.from(profile.achievements)).toEqual(achievementIds)
    })

    test('malformed and unrelated files cannot silently become an empty profile', () => {
        for (const text of ['broken', 'null', '[]', '{}', JSON.stringify({ ...saved, unique: {} })])
            expect(() => parseProfile(text)).toThrow()
        for (const times of [-1, 0.5, '42', Number.MAX_SAFE_INTEGER + 1])
            expect(() => parseProfile(JSON.stringify({ ...saved, times }))).toThrow()
    })

    test('every ID collection rejects wrong types and unknown IDs', () => {
        for (const field of ['achievements', 'events', 'talents', 'locked']) {
            for (const value of [null, {}, ['10001'], [999999999], [1.5]])
                expect(() => parseProfile(JSON.stringify({ ...saved, [field]: value }))).toThrow()
        }
    })

    test('extreme attributes must be complete finite numeric properties', () => {
        for (const field of ['highest', 'lowest']) {
            for (const value of [{}, { ...saved.highest, age: '100' }, { ...saved.highest, age: Infinity }, { ...saved.highest, extra: 1 }])
                expect(() => parseProfile(JSON.stringify({ ...saved, [field]: value }))).toThrow()
        }
    })
})
