'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { MdError } from 'react-icons/md'

import { Alert, AlertTitle } from '@/components/ui/alert'
import { RadialCarousel, type GalleryItem } from '@/components/ui/radial-carousel'
import { extractText } from '@/lib/extract'
import { listReviews, type ReviewRow } from '@/lib/supabase'

import styles from './agenda-input.module.css'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cardArtwork(title: string, detail: string, accent: string): string {
  const safeTitle = escapeXml(title.slice(0, 14))
  const safeDetail = escapeXml(detail.slice(0, 22))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="#F7F7F6"/><circle cx="652" cy="138" r="184" fill="${accent}" opacity=".92"/><path d="M-44 628C144 462 310 564 436 718C510 808 642 804 844 686V844H-44Z" fill="#0A1B33"/><text x="70" y="480" fill="#0A1B33" font-size="58" font-family="Arial, sans-serif" font-weight="700">${safeTitle}</text><text x="72" y="540" fill="#526071" font-size="30" font-family="Arial, sans-serif">${safeDetail}</text><text x="72" y="702" fill="#FFFFFF" font-size="25" font-family="Arial, sans-serif" letter-spacing="4">MULTI-ANGLE</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const VERDICT_ACCENTS: Record<string, string> = { 진행: '#B9D9C7', 보류: '#E8C89A', 폐기: '#E5AFA6' }

const MAX_LOG_CARDS = 7

const LogCarousel = memo(function LogCarousel({ items, onSelect }: {
  readonly items: GalleryItem[]
  readonly onSelect: (item: GalleryItem) => void
}) {
  return <RadialCarousel centerSize={380} items={items} onItemSelect={onSelect} radius={150} thumbnailSize={145} />
})

export function AgendaInput() {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [agenda, setAgenda] = useState('')
  const [rows, setRows] = useState<readonly ReviewRow[]>([])
  const [notice, setNotice] = useState('')
  const [warn, setWarn] = useState(false)

  useEffect(() => {
    void listReviews().then((loaded) => setRows(loaded.slice(0, MAX_LOG_CARDS)))
  }, [])

  const logCards = useMemo<GalleryItem[]>(() => rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: cardArtwork(row.title, `${row.verdict ?? '검토 중'} · ${new Date(row.updated_at).toLocaleDateString('ko-KR')}`, VERDICT_ACCENTS[row.verdict ?? ''] ?? '#9CB8FA'),
  })), [rows])

  const charCount = agenda.replace(/\s/g, '').length

  const openLog = useCallback((item: GalleryItem) => {
    router.push(`/review/session?id=${item.id}`)
  }, [router])

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    setWarn(false)
    setNotice(`${file.name}에서 내용을 읽는 중입니다...`)
    try {
      const text = (await extractText(file)).slice(0, 20000)
      if (!text.trim()) {
        setWarn(true)
        setNotice(`${file.name}에서 읽을 텍스트가 없습니다. 스캔 이미지가 아닌 텍스트가 담긴 파일인지 확인해주세요.`)
        return
      }
      setAgenda(text)
      setNotice(`${file.name} 내용을 불러왔습니다.`)
    } catch {
      setWarn(true)
      setNotice(`${file.name}을 읽지 못했습니다. PDF, Word(.docx), PPT(.pptx), 한글(.hwp/.hwpx), 텍스트 파일을 지원합니다.`)
    }
  }

  function startReview() {
    const trimmed = agenda.trim()
    if (trimmed.length === 0) return
    if (trimmed.replace(/\s/g, '').length < 30) {
      setWarn(true)
      setNotice('안건이 너무 짧습니다.')
      return
    }
    window.sessionStorage.setItem('semoeye:draft', JSON.stringify({ agenda: trimmed, stageId: 'auto' }))
    router.push('/review/panel')
  }

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/">세모눈</Link>
      <Link href="/records">내 기록</Link>
    </header>
    <section className={styles.content} aria-labelledby="agenda-title">
      <div className={styles.copy}>
        <h1 id="agenda-title">무엇을<br />따져볼까요?</h1>
        <p className={styles.helper}>검토하고 싶은 내용을 작성해주세요. 공백 제외 30자 이상이면 검토를 시작할 수 있습니다.</p>
        <textarea
          className={`${styles.agendaInput} ${warn ? styles.agendaWarn : ''}`}
          maxLength={20000}
          onChange={(event) => { setAgenda(event.target.value); if (warn && event.target.value.replace(/\s/g, '').length >= 30) { setWarn(false); setNotice('') } }}
          placeholder="예) 학식 메뉴를 매일 알려주는 알림 서비스를 만들려고 합니다. 대상은..."
          rows={9}
          value={agenda}
        />
        <p aria-live="polite" className={`${styles.counter} ${charCount >= 30 ? styles.counterOk : ''}`}>
          {charCount >= 30 ? '✓ ' : ''}{charCount.toLocaleString()}자 / 최소 30자 (공백 제외)
        </p>
        <div className={styles.actions}>
          <input accept=".pdf,.docx,.pptx,.hwp,.hwpx,.txt,.md,.markdown,.csv,.json,text/plain,text/markdown,application/pdf" className={styles.folderInput} onChange={loadFile} ref={fileInput} type="file" />
          <button className={styles.uploadButton} onClick={() => fileInput.current?.click()} type="button">파일 불러오기</button>
          <button className={styles.selectProject} disabled={agenda.trim().length === 0} onClick={startReview} type="button">
            검토진 확인하기 <span aria-hidden="true">→</span>
          </button>
        </div>
        {notice && warn ? <Alert className="mt-4">
          <MdError />
          <AlertTitle className="flex-1">{notice}</AlertTitle>
        </Alert> : null}
        {notice && !warn ? <p aria-live="polite" className={styles.stageNote}>{notice}</p> : null}
      </div>
      {logCards.length > 0 ? <div className={styles.orbit}>
        <LogCarousel items={logCards} onSelect={openLog} />
      </div> : null}
    </section>
  </main>
}
