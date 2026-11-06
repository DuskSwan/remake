import { parseProfile, serializeProfile, type ProfileState } from '@remake/core'
import { set } from './index'

// Imports and automatic saves share one queue, including on cloud storage.
let pending: Promise<void> = Promise.resolve()

export function persistProfile(profile: ProfileState): Promise<void> {
    const json = serializeProfile(profile)
    const saving = pending.catch(() => {}).then(async () => {
        if (!await set('profile', json)) throw new Error('无法保存存档，请重试')
    })
    pending = saving
    return saving
}

export async function restoreProfile(text: string, apply: (profile: ProfileState) => void): Promise<void> {
    const profile = parseProfile(text)
    await persistProfile(profile)
    apply(profile)
}
