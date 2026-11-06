/** 权重事件 */
export type EventWithWeight = [number, number]

/** Preserve source priority and scaling when combining independently authored pools. */
export interface EventTier {
    readonly priority: number
    readonly scale: number
    readonly events: EventWithWeight[]
}

/** 年龄 */
export type Age = {
    /** 年龄 */
    readonly age: number
    /** 事件池 */
    readonly event: EventTier[]
}
// @vt-types-end
function handleEvent(val: string | number): {
    event: EventWithWeight
    level: number
} {
    if (typeof val === 'number') return { event: [val, 1], level: 0 }
    if (typeof val !== 'string') throw new Error(`Invalid event value: ${val}`)
    const [wval, l] = val.split('|')
    const [e, w] = wval!.split('*')
    return { event: [Number(e), Number(w) || 1], level: Number(l) || 0 }
}

export const transformers = {
    age: Number,
    event: (val: any) => {
        if (val === null || val === undefined || !Array.isArray(val))
            throw new Error(`Invalid event value: ${val}`)
        const ab: EventWithWeight[][][] = [[], []]
        for (const v of val) {
            const { event, level } = handleEvent(v)
            const li = level < 0 ? ab[1]! : ab[0]!
            const l = Math.abs(level)
            li[l] ??= []
            li[l].push(event)
        }
        const highestPriority = ab[0]!.length - 1
        ab[1]!.shift()
        const levels = ab[0]!.reverse().concat(ab[1]!)
        const result: EventTier[] = []
        for (let i = 0; i < levels.length; i++) {
            levels[i] ??= []
            const level = levels[i]!
            const pow = level.reduce(
                (pow, [, w]) =>
                    Math.max(pow, w.toString().split('.')[1]?.length || 0),
                0,
            )
            const scale = pow > 1 ? 10 ** pow : 1
            if (scale > 1) for (const item of level) item[1] = Math.floor(item[1] * scale)
            result.push({ priority: highestPriority - i, scale, events: level })
        }
        return result
    },
}
