import { achievements, events, talents } from '@remake/data'
import type { ProfileState, Properties } from './state'

const fields = ['times', 'achievements', 'events', 'talents', 'locked', 'highest', 'lowest']
const properties = ['age', 'charm', 'intelligence', 'strength', 'money', 'spirit'] as const

function object(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error(`${name}必须是对象`)
    return value as Record<string, unknown>
}

function ids(value: unknown, catalog: ReadonlyMap<number, unknown>, name: string): number[] {
    if (!Array.isArray(value)) throw new Error(`${name}必须是 ID 数组`)
    for (const id of value) {
        if (!Number.isSafeInteger(id) || !catalog.has(id))
            throw new Error(`${name}含有无效或当前版本不支持的 ID：${String(id)}`)
    }
    // Preserve achievement acquisition order while removing duplicate IDs.
    return Array.from(new Set(value as number[]))
}

function props(value: unknown, name: string): Properties {
    const source = object(value, name)
    if (Object.keys(source).some(key => !properties.includes(key as keyof Properties)))
        throw new Error(`${name}含有未知属性`)
    const result = {} as Properties
    for (const key of properties) {
        const number = source[key]
        if (typeof number !== 'number' || !Number.isFinite(number))
            throw new Error(`${name}.${key}必须是有限数值`)
        result[key] = number
    }
    return result
}

/** Read the existing profile JSON format without adding any save fields. */
export function parseProfile(text: string): ProfileState {
    let value: unknown
    try { value = JSON.parse(text.replace(/^\uFEFF/, '')) }
    catch { throw new Error('文件不是有效的 JSON 存档') }
    const source = object(value, '存档')
    if (Object.keys(source).some(key => !fields.includes(key)))
        throw new Error('存档含有未知字段，请选择本游戏导出的存档文件')
    if (typeof source.times !== 'number' || !Number.isSafeInteger(source.times) || source.times < 0)
        throw new Error('游玩次数必须是非负整数')
    const profile: ProfileState = {
        times: source.times,
        achievements: new Set(ids(source.achievements, achievements, '成就')),
        events: new Set(ids(source.events, events, '事件')),
        talents: new Set(ids(source.talents, talents, '天赋')),
    }
    if (source.locked !== undefined) profile.locked = ids(source.locked, talents, '继承天赋')
    if (source.highest !== undefined) profile.highest = props(source.highest, '最高属性')
    if (source.lowest !== undefined) profile.lowest = props(source.lowest, '最低属性')
    return profile
}

export function serializeProfile(profile: ProfileState, space?: number): string {
    return JSON.stringify({
        times: profile.times,
        achievements: Array.from(profile.achievements),
        events: Array.from(profile.events),
        talents: Array.from(profile.talents),
        locked: profile.locked,
        highest: profile.highest,
        lowest: profile.lowest,
    }, null, space)
}
