import { beforeEach, describe, expect, test, vi } from 'vitest'
import { parseProfile, serializeProfile, type ProfileState } from '@remake/core'

const { set } = vi.hoisted(() => ({ set: vi.fn() }))
vi.mock('./index', () => ({ set }))
const profile = (times: number): ProfileState => ({ times, achievements: new Set(), events: new Set(), talents: new Set() })

beforeEach(() => {
    vi.resetModules()
    set.mockReset()
    set.mockResolvedValue(true)
})

describe('Profile restoration', () => {
    test('invalid input leaves both storage and current profile untouched', async () => {
        const { restoreProfile } = await import('./profile')
        const apply = vi.fn()
        await expect(restoreProfile('{}', apply)).rejects.toThrow()
        expect(set).not.toHaveBeenCalled()
        expect(apply).not.toHaveBeenCalled()
    })

    test('memory changes only after storage succeeds and persisted data reloads identically', async () => {
        const { restoreProfile } = await import('./profile')
        let finish!: (value: boolean) => void
        set.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
        const apply = vi.fn()
        const imported = profile(12)
        const restoring = restoreProfile(serializeProfile(imported), apply)
        await vi.waitFor(() => expect(set).toHaveBeenCalledOnce())
        expect(apply).not.toHaveBeenCalled()
        finish(true)
        await restoring
        expect(apply).toHaveBeenCalledWith(imported)
        expect(set.mock.calls[0]![0]).toBe('profile')
        expect(parseProfile(set.mock.calls[0]![1])).toEqual(imported)
    })

    test('failed storage writes keep the current profile and do not block a later retry', async () => {
        const { restoreProfile } = await import('./profile')
        const apply = vi.fn()
        set.mockRejectedValueOnce(new Error('storage full'))
        await expect(restoreProfile(serializeProfile(profile(1)), apply)).rejects.toThrow('storage full')
        expect(apply).not.toHaveBeenCalled()
        set.mockResolvedValueOnce(false)
        await expect(restoreProfile(serializeProfile(profile(2)), apply)).rejects.toThrow('无法保存')
        expect(apply).not.toHaveBeenCalled()
        await restoreProfile(serializeProfile(profile(3)), apply)
        expect(apply).toHaveBeenCalledExactlyOnceWith(profile(3))
    })

    test('a pending automatic save cannot finish after and overwrite the imported save', async () => {
        const { persistProfile, restoreProfile } = await import('./profile')
        let finish!: (value: boolean) => void
        set.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
        const previous = persistProfile(profile(50))
        await vi.waitFor(() => expect(set).toHaveBeenCalledOnce())
        const apply = vi.fn()
        const restoring = restoreProfile(serializeProfile(profile(1)), apply)
        expect(set).toHaveBeenCalledOnce()
        finish(true)
        await Promise.all([previous, restoring])
        expect(set.mock.calls.map(call => parseProfile(call[1]).times)).toEqual([50, 1])
        expect(apply).toHaveBeenCalledWith(profile(1))
    })
})
