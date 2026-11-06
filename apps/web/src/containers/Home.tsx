import { useRef, useState, type ChangeEvent } from 'react'
import { useRemake, useFeatures, useGoAchv, useGoThanks, useProfile } from '@remake/hooks'
import { serializeProfile } from '@remake/core'
import { useProfileImport } from '@/hooks/storage'
import { toastMsg } from '@/toast'
import { TextSvg } from '@/components/TextSvg'
import ThemeToggle from '@/components/ThemeToggle'
import Github from '@/components/Github'
import './Home.css'

export default function Home() {
    const remake = useRemake()
    const features = useFeatures()
    const goAchv = useGoAchv()
    const goThanks = useGoThanks()
    const [profile] = useProfile()
    const restore = useProfileImport()
    const input = useRef<HTMLInputElement>(null)
    const [importing, setImporting] = useState(false)
    const exportSave = () => {
        try {
            const blob = new Blob([serializeProfile(profile, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            try {
                link.href = url
                link.download = `remake-profile-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
                document.body.appendChild(link)
                link.click()
            } finally {
                link.remove()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
            }
        } catch {
            toastMsg('导出失败，请重试', 'profile-transfer')
        }
    }
    const importSave = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (!file || importing) return
        setImporting(true)
        try {
            if (file.size > 1024 * 1024) throw new Error('文件超过 1 MB，请选择正确的存档文件')
            await restore(await file.text())
            toastMsg('存档已导入', 'profile-transfer')
        } catch (error) {
            toastMsg(`导入失败：${error instanceof Error ? error.message : '无法读取或保存文件'}`, 'profile-transfer')
        } finally {
            setImporting(false)
        }
    }
    return (
        <div className="screen home">
            <div className="title">
                <TextSvg text="人生重开模拟器" className="main" />
                <TextSvg text="这垃圾人生一秒也不想待了" className="sub" />
            </div>
            <div className="controls">
                <div>
                    <button className="primary focus" onClick={remake} disabled={importing}>
                        立即重开
                    </button>
                </div>
                {features && (
                    <div>
                        <button className="secondary" onClick={goAchv} disabled={importing}>
                            成就
                        </button>
                        <button className="secondary" onClick={goThanks} disabled={importing}>
                            感谢
                        </button>
                    </div>
                )}
                <div>
                    <button className="secondary" onClick={exportSave} disabled={importing}>
                        导出存档
                    </button>
                    <button className="secondary" onClick={() => input.current?.click()} disabled={importing}>
                        导入存档
                    </button>
                    <input ref={input} type="file" accept=".json,application/json" hidden
                        aria-label="选择存档文件" onChange={importSave} disabled={importing} />
                </div>
                <p className="save-hint" aria-live="polite">
                    {importing ? '正在导入存档…' : '导入将替换当前存档中的成就、统计和继承天赋。'}
                </p>
            </div>
            <div className="actions">
                {features && <Github />}
                <ThemeToggle />
            </div>
        </div>
    )
}
