'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import styles from './review-session.module.css'
import { parseReport, parseRisk, parseSegments, parseVerdict, parseVerdictChange, type RiskLevel, type VerdictLabel } from '@/lib/parser'
import { REVIEWERS, reviewerByName } from '@/lib/reviewers'
import { AGENDA_STAGES } from '@/lib/reviewers'
import { extractText } from '@/lib/extract'
import { getReview, saveReview, type ChatMessage } from '@/lib/supabase'

type Phase = 'boot' | 'streaming' | 'idle' | 'error'

const QNA_SUGGESTS: readonly { readonly text: string; readonly target?: string }[] = [
  { text: '판정을 뒤집으려면 어떤 근거가 필요한가요?' },
  { text: '가장 큰 리스크 하나만 꼽아주세요.' },
  { text: '어떤 조건이면 찬성하시겠어요?', target: '반대자' },
  { text: '제일 먼저 검증해야 할 것은 무엇인가요?' },
]

const BOOT_STEPS = [
  '안건 성격에 맞는 검토진을 배정합니다.',
  '각 검토자가 고정된 첫 질문으로 독립 검토합니다.',
  '반박을 정확히 한 번 넣고, 모인 지점과 갈린 지점을 가릅니다.',
] as const

function liveStatus(text: string): { readonly label: string; readonly reviewer: string | null } {
  if (!text.trim()) return { label: '검토진을 배정하는 중', reviewer: null }
  if (/판정\s*[:：]/.test(text)) return { label: '판정을 내리는 중', reviewer: null }
  if (text.includes('## 아무도')) return { label: '전원이 놓친 위험을 찾는 중', reviewer: null }
  if (text.includes('## 갈린')) return { label: '갈린 지점을 가르는 중', reviewer: null }
  if (text.includes('## 모인')) return { label: '모인 지점을 정리하는 중', reviewer: null }
  if (text.includes('## 반박')) return { label: '반박이 오가는 중', reviewer: null }
  const speakers = [...text.matchAll(/^\[([^\]\n]{1,12})\]/gm)]
  const last = speakers.length > 0 ? speakers[speakers.length - 1][1].trim() : null
  if (last && reviewerByName(last)) return { label: `${reviewerByName(last)?.label ?? last} — 따져 묻는 중`, reviewer: last }
  return { label: '검토진을 배정하는 중', reviewer: null }
}

function riskClass(level: RiskLevel): string {
  if (level === '높음') return styles.riskHigh
  if (level === '중간') return styles.riskMid
  return styles.riskLow
}

function verdictText(label: VerdictLabel | null): string {
  if (label === '진행') return styles.textGo
  if (label === '폐기') return styles.textDrop
  if (label === '보류') return styles.textHold
  return ''
}

function verdictClass(label: VerdictLabel | null): string {
  if (label === '진행') return styles.verdictGo
  if (label === '폐기') return styles.verdictDrop
  if (label === '보류') return styles.verdictHold
  return ''
}

export function ReviewSession() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [streaming, setStreaming] = useState('')
  const [phase, setPhase] = useState<Phase>('boot')
  const [input, setInput] = useState('')
  const [evidence, setEvidence] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [fallbackShown, setFallbackShown] = useState(false)
  const [detailFor, setDetailFor] = useState<string | null>(null)
  const [detailText, setDetailText] = useState('')
  const [detailBusy, setDetailBusy] = useState(false)
  const detailCache = useRef<Record<string, string>>({})
  const evidenceFileInput = useRef<HTMLInputElement>(null)
  const sessionId = useRef('')
  const lastRequest = useRef<readonly ChatMessage[]>([])
  const started = useRef(false)
  const threadEndRef = useRef<HTMLDivElement>(null)

  const firstReport = messages.length > 1 ? messages[1].content : phase !== 'idle' && messages.length === 1 ? streaming : ''
  const report = useMemo(() => parseReport(firstReport), [firstReport])
  const risk = useMemo(() => parseRisk(firstReport), [firstReport])
  const score = useMemo(() => {
    const all = report.reviewers.flatMap((block) => block.scores.map((item) => item.score))
    return all.length > 0 ? Math.round((all.reduce((sum, value) => sum + value, 0) / all.length / 5) * 100) : null
  }, [report])

  const verdict = useMemo(() => {
    let current = messages.length > 1 ? parseVerdict(messages[1].content) : parseVerdict(streaming)
    for (const message of messages.slice(2)) {
      if (message.role !== 'assistant') continue
      const change = parseVerdictChange(message.content)
      if (change && current) current = { ...current, label: change.to, reason: change.reason }
      else if (change) current = { label: change.to, reason: change.reason, bullets: [] }
    }
    const streamingChange = parseVerdictChange(streaming)
    if (messages.length > 1 && streamingChange && current) current = { ...current, label: streamingChange.to, reason: streamingChange.reason }
    return current
  }, [messages, streaming])
  const verdictBasis = verdict?.bullets.find((bullet) => bullet.startsWith('판정 근거'))?.replace(/^판정 근거\s*[:：]\s*/, '') ?? ''
  const verdictBullets = verdict?.bullets.filter((bullet) => !bullet.startsWith('판정 근거')) ?? []

  function reviewPayload(all: readonly ChatMessage[]) {
    let current = all.length > 1 ? parseVerdict(all[1].content) : null
    for (const message of all.slice(2)) {
      if (message.role !== 'assistant') continue
      const change = parseVerdictChange(message.content)
      if (change) current = current ? { ...current, label: change.to, reason: change.reason } : { label: change.to, reason: change.reason, bullets: [] }
    }
    const firstLine = ((all[0]?.content ?? '').split('\n').find((line) => line.trim() && !line.trim().startsWith('[')) ?? '무제 안건').trim()
    const sentence = firstLine.split(/[.。!?…]/)[0].trim()
    return {
      id: sessionId.current,
      title: (sentence.length > 0 ? sentence : firstLine).slice(0, 40),
      agenda: all[0]?.content ?? '',
      messages: all,
      verdict: current?.label ?? null,
      verdict_reason: current?.reason ?? null,
    }
  }

  async function run(all: readonly ChatMessage[]) {
    lastRequest.current = all
    setMessages(all)
    setStreaming('')
    setPhase(all.length === 1 ? 'boot' : 'streaming')
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: all }),
      })
      if (!response.ok || !response.body) throw new Error(String(response.status))
      const isFallback = response.headers.get('x-fallback') === '1'
      if (isFallback) setFallbackShown(true)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setStreaming(text)
        setPhase('streaming')
      }
      const next = [...all, { role: 'assistant' as const, content: text }]
      setMessages(next)
      setStreaming('')
      setPhase('idle')
      if (!isFallback) void saveReview(reviewPayload(next))
    } catch {
      setPhase('error')
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    const existingId = searchParams.get('id')
    if (existingId) {
      sessionId.current = existingId
      void getReview(existingId).then((row) => {
        if (!row) {
          router.replace('/review')
          return
        }
        setMessages(row.messages)
        setPhase('idle')
      })
      return
    }
    const draft = window.sessionStorage.getItem('semoeye:draft')
    if (!draft) {
      router.replace('/review')
      return
    }
    const parsed = JSON.parse(draft) as { agenda: string; stageId: string; reviewers?: string[] }
    sessionId.current = crypto.randomUUID()
    const stage = AGENDA_STAGES.find((item) => item.id === parsed.stageId)
    const prefix: string[] = []
    if (stage) prefix.push(`[안건 단계: ${stage.label}]`)
    if (parsed.reviewers && parsed.reviewers.length > 0) prefix.push(`[지정 검토자: ${parsed.reviewers.join(' · ')}]`)
    const content = `${prefix.length > 0 ? `${prefix.join('\n')}\n\n` : ''}${parsed.agenda}`
    void run([{ role: 'user', content }])
  }, [router, searchParams])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length, phase])

  async function openDetail(name: string) {
    setDetailFor(name)
    const cacheKey = `semoeye:detail:${sessionId.current}:${name}`
    let cached: string | undefined = detailCache.current[name]
    if (!cached) {
      try {
        cached = window.localStorage.getItem(cacheKey) ?? undefined
      } catch {
        cached = undefined
      }
    }
    if (cached) {
      detailCache.current[name] = cached
      setDetailText(cached)
      return
    }
    setDetailText('')
    setDetailBusy(true)
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, { role: 'user', content: `[상세: ${name}]` }] }),
      })
      if (!response.ok || !response.body) throw new Error(String(response.status))
      const isFallback = response.headers.get('x-fallback') === '1'
      if (isFallback) setFallbackShown(true)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setDetailText(text)
      }
      detailCache.current[name] = text
      try {
        window.localStorage.setItem(cacheKey, text)
      } catch {
      }
    } catch {
      setDetailText('응답을 받지 못했습니다. 닫았다가 다시 시도해주세요.')
    } finally {
      setDetailBusy(false)
    }
  }

  function sendDiscussion() {
    const text = input.trim()
    if (!text || phase === 'streaming' || phase === 'boot') return
    const proof = evidence.trim()
    const content = `${target ? `[지목: ${target}]\n` : ''}${text}${proof ? `\n\n[근거]\n${proof}` : ''}`
    setInput('')
    setEvidence('')
    setEvidenceOpen(false)
    void run([...messages, { role: 'user', content }])
  }

  const pickedNames = /^\[지정 검토자:\s*(.+)\]$/m.exec(messages[0]?.content ?? '')?.[1]?.split('·').map((name) => name.trim())
  const panelNames = pickedNames
    ? [...pickedNames, '반대자']
    : report.assignment
      ? REVIEWERS.filter((reviewer) => report.assignment.includes(reviewer.name)).map((reviewer) => reviewer.name)
      : report.reviewers.map((block) => block.name)
  const panelReviewers = panelNames
    .map((name) => reviewerByName(name))
    .filter((reviewer): reviewer is NonNullable<ReturnType<typeof reviewerByName>> => Boolean(reviewer))

  if (messages.length <= 1 && phase !== 'error' && phase !== 'idle') {
    const status = liveStatus(streaming)
    const statusMeta = status.reviewer ? reviewerByName(status.reviewer) : undefined
    const bootStep = status.reviewer ? 1 : /##|판정\s*[:：]/.test(streaming) ? 2 : streaming.trim() ? 0 : 0
    return <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">세모눈</Link>
      </header>
      <section className={styles.loading} aria-live="polite" aria-labelledby="loading-title">
        <div className={styles.loadingAvatar}><Image alt={status.reviewer ?? '반대자'} height={160} src={(statusMeta ?? REVIEWERS[7]).avatar} width={160} /></div>
        <p className={styles.eyebrow}>PANEL IN SESSION</p>
        <h1 id="loading-title">검토진이 안건을<br />따져 묻는 중입니다.</h1>
        <div className={styles.bootStatus}>
          <span className={styles.livePulse} aria-hidden="true" />
          <p>{status.label}<span className={styles.liveDots} aria-hidden="true" /></p>
        </div>
        <ol className={styles.loadingSteps}>{BOOT_STEPS.map((step, index) => <li className={index < bootStep ? styles.stepDone : index === bootStep ? styles.stepNow : ''} key={step}><span>{index < bootStep ? '✓' : String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol>
      </section>
    </main>
  }

  const detailMeta = detailFor ? reviewerByName(detailFor) : undefined

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/">세모눈</Link>
      <div className={styles.topActions}>
        <button className={styles.quitButton} onClick={() => router.push('/review')} type="button">끝내기</button>
      </div>
    </header>

    <section className={styles.layout}>
      <div className={styles.leftCol}>
        {fallbackShown ? <div className={styles.fallbackNote}>
          지금 검토 응답이 지연되고 있어, 입력하신 안건과 가장 비슷한 안건의 저장된 검토 예시를 보여드립니다. 잠시 후 다시 시도하면 내 안건에 대한 검토를 받을 수 있습니다.
        </div> : null}
        {report.reviewers.length > 0 ? <div className={`${styles.reviewerGrid} ${report.reviewers.length % 3 === 0 ? styles.reviewerGrid3 : ''}`}>
          {report.reviewers.map((block, index) => {
            const meta = reviewerByName(block.name)
            return <article className={styles.reviewerCard} key={`${block.name}-${index}`}>
              <i className={`${styles.cardShade} ${styles[`cardShade${index % 4}`]}`} aria-hidden="true" />
              <div className={styles.cardTop}>
                {meta ? <Image alt={block.name} height={84} src={meta.avatar} width={84} /> : null}
                <div className={styles.quoteBox}>
                  <span aria-hidden="true">“</span>
                  <p>{block.answer || '…'}<b aria-hidden="true"> ”</b></p>
                </div>
              </div>
              <div className={styles.cardName}>
                <b>{meta?.label ?? block.name}</b>
                <span>{block.question || meta?.question}</span>
              </div>
              {block.scores.length > 0 ? <div className={styles.scoreList}>
                {block.scores.map((score) => <div className={styles.scoreRow} key={score.name}>
                  <span>{score.name}</span>
                  <i><b style={{ width: `${Math.min(score.score, 5) * 20}%` }} /></i>
                  <em>{score.score}/5</em>
                </div>)}
              </div> : null}
              {block.failure ? <div className={styles.cardSection}>
                <span>실패한다면</span>
                <p>{block.failure}</p>
              </div> : null}
              <button className={styles.detailButton} disabled={phase !== 'idle'} onClick={() => void openDetail(block.name)} type="button">판단 과정 자세히 보기 →</button>
            </article>
          })}
        </div> : null}

        {report.agreed || report.split || report.unspoken || verdict ? <div className={styles.summaryBox}>
          <p className={styles.summaryLabel}>전체 요약</p>
          {verdict && messages.length > 1 ? <div className={styles.sumRow}>
            <span className={styles.sumKey}>판정</span>
            <div className={styles.sumVerdict}>
              <strong className={verdictText(verdict.label)}>{verdict.label}</strong>
              {score !== null ? <em>{score}<small> / 100</small></em> : null}
            </div>
          </div> : null}
          {risk && messages.length > 1 ? <div className={styles.sumRow}>
            <span className={styles.sumKey}>위험도</span>
            <ul className={styles.sumRisk}>
              {risk.items.map((item) => <li key={item.name}>
                <span className={riskClass(item.level)}>{item.level}</span>
                <b>{item.name}</b>
                {item.reason ? <p>{item.reason}</p> : null}
              </li>)}
            </ul>
          </div> : null}
          {report.agreed ? <div className={styles.sumRow}><span className={styles.sumKey}>공통 의견</span><p>{report.agreed}</p></div> : null}
          {report.split ? <div className={styles.sumRow}><span className={styles.sumKey}>갈린 의견</span><p>{report.split}</p></div> : null}
          {report.unspoken ? <div className={styles.sumRow}><span className={styles.sumKey}>주의할 점</span><p>{report.unspoken}</p></div> : null}
          {verdict && messages.length > 1 && (verdict.reason || verdict.bullets.length > 0) ? <div className={styles.sumRow}>
            <span className={styles.sumKey}>판정 내용</span>
            <div>
              {verdict.reason ? <p className={styles.sumReason}>{verdict.reason}</p> : null}
              {verdictBasis ? <p className={styles.sumBasis}>{verdictBasis}</p> : null}
              {verdictBullets.length > 0 ? <ul className={styles.sumBullets}>
                {verdictBullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul> : null}
            </div>
          </div> : null}
        </div> : null}
      </div>

      <aside className={styles.rightCol}>
        <div className={styles.askPanel}>
          <div className={styles.askHead}>
            <b>Q&amp;A</b>
          </div>

          <div className={styles.thread}>
            {messages.length <= 2 && !streaming ? <div className={styles.qnaIntro}>
              <div className={styles.panelList}>
                {panelReviewers.map((reviewer) => <div className={styles.panelMember} key={reviewer.id}>
                  <Image alt={reviewer.name} height={44} src={reviewer.avatar} width={44} />
                  <div><b>{reviewer.label}</b><span>{reviewer.question}</span></div>
                </div>)}
              </div>
              <p className={styles.suggestLabel}>이렇게 물어보세요</p>
              <div className={styles.suggestChips}>
                {QNA_SUGGESTS.map((suggest) => <button key={suggest.text} onClick={() => { setTarget(suggest.target ?? ''); setInput(suggest.text) }} type="button">{suggest.text}</button>)}
              </div>
            </div> : null}
            {messages.slice(2).map((message, index) => {
              if (message.role !== 'user') return <DiscussionReply content={message.content} key={index} />
              const detail = /^\[상세:\s*([^\]]+)\]\s*$/.exec(message.content)
              return detail
                ? <div className={styles.detailChip} key={index}>@{reviewerByName(detail[1])?.label ?? detail[1]} — 판단 과정 상세 요청</div>
                : <div className={styles.bubbleUser} key={index}>{message.content}</div>
            })}
            {streaming && messages.length > 1 ? <DiscussionReply content={streaming} /> : null}
            <div ref={threadEndRef} />
          </div>

          {phase === 'error' ? <div className={styles.errorBox}>
            <p>응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.</p>
            <button onClick={() => void run(lastRequest.current)} type="button">다시 시도</button>
          </div> : null}

          {messages.length > 1 && phase !== 'error' ? <div className={styles.inputArea}>
            {evidenceOpen ? <div className={styles.evidenceBox}>
              <label htmlFor="evidence-input">근거/추가 정보 — 문서, 수치, 사례, 관찰 등. 근거가 있어야 판정이 바뀔 수 있습니다.</label>
              <textarea
                id="evidence-input"
                onChange={(event) => setEvidence(event.target.value)}
                placeholder="예) 학생 30명 설문에서 24명이 주 2회 이상 확인하겠다고 답함"
                rows={3}
                value={evidence}
              />
              <input
                accept=".pdf,.docx,.pptx,.hwp,.hwpx,.txt,.md,.markdown,.csv,.json,text/plain,text/markdown,application/pdf"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  event.target.value = ''
                  void extractText(file).then((raw) => {
                    const text = raw.slice(0, 8000)
                    if (text.trim()) setEvidence((current) => `${current.trim() ? `${current.trim()}\n\n` : ''}[첨부: ${file.name}]\n${text}`)
                  }).catch(() => {
                  })
                }}
                ref={evidenceFileInput}
                type="file"
              />
              <button className={styles.evidenceFileButton} onClick={() => evidenceFileInput.current?.click()} type="button">자료 파일 첨부</button>
            </div> : null}
            <div className={styles.inputBar}>
              <select onChange={(event) => setTarget(event.target.value)} value={target}>
                <option value="">검토진 전체에게</option>
                {panelReviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.name}>@{reviewer.label}</option>)}
              </select>
              <textarea
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    sendDiscussion()
                  }
                }}
                placeholder="판정에 반박하거나 물어보세요"
                rows={2}
                value={input}
              />
              <button aria-pressed={evidenceOpen} className={evidenceOpen || evidence.trim() ? styles.evidenceOn : ''} onClick={() => setEvidenceOpen((open) => !open)} type="button">근거 {evidence.trim() ? '✓' : '+'}</button>
              <button disabled={phase !== 'idle' || input.trim().length === 0} onClick={sendDiscussion} type="button">보내기</button>
            </div>
          </div> : null}
        </div>
      </aside>
    </section>

    {detailFor ? <div className={styles.modalOverlay} onClick={() => setDetailFor(null)} role="presentation">
      <div aria-label={`${detailFor} 상세 검토`} className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        <div className={styles.modalHead}>
          <div className={styles.modalWho}>
            {detailMeta ? <Image alt={detailFor} height={44} src={detailMeta.avatar} width={44} /> : null}
            <div><b>{detailMeta?.label ?? detailFor}</b><span>{detailMeta?.question}</span></div>
          </div>
          <button onClick={() => setDetailFor(null)} type="button">닫기</button>
        </div>
        <div className={styles.modalBody}>
          <DetailSections text={detailText} />
          {detailBusy && !detailText ? <p className={styles.modalWaiting}>판단 과정을 정리하는 중입니다…</p> : null}
        </div>
      </div>
    </div> : null}

  </main>
}

const DETAIL_LABELS: readonly { readonly key: string; readonly label: string }[] = [
  { key: '주목한 대목', label: '주목한 대목' },
  { key: '판단 과정', label: '판단 과정' },
  { key: '성립 조건', label: '보완해야 할 것' },
  { key: '실패 경로', label: '부족한 지점 · 실패 경로' },
  { key: '확인할 것', label: '확인할 것' },
]

function DetailSections({ text }: { readonly text: string }) {
  if (!text) return null
  const body = text.replace(/^\[[^\]\n]+\]\s*/, '')
  const pattern = /^(주목한 대목|판단 과정|성립 조건|실패 경로|확인할 것)\s*[:：]\s*/gm
  const matches = [...body.matchAll(pattern)]
  if (matches.length < 2) return <p className={styles.modalPlain}>{body}</p>
  return <div className={styles.detailSections}>
    {matches.map((match, index) => {
      const from = (match.index ?? 0) + match[0].length
      const to = index + 1 < matches.length ? matches[index + 1].index ?? body.length : body.length
      const meta = DETAIL_LABELS.find((item) => item.key === match[1])
      return <section key={match[1]}>
        <span>{meta?.label ?? match[1]}</span>
        <p>{body.slice(from, to).trim()}</p>
      </section>
    })}
  </div>
}

function DiscussionReply({ content }: { readonly content: string }) {
  const change = parseVerdictChange(content)
  const kept = content.startsWith('[판정 유지]')
  const body = content.replace(/^\[판정 변경\][^\n]*\n?/, '').replace(/^\[판정 유지\]\s*\n?/, '')
  const accepted = /^인정한 근거\s*[:：]\s*(.+)$/m.exec(body)?.[1]
  const rejected = /^근거로 보지 않은 것\s*[:：]\s*(.+)$/m.exec(body)?.[1]
  const cleaned = body.replace(/^인정한 근거\s*[:：].*$/m, '').replace(/^근거로 보지 않은 것\s*[:：].*$/m, '').trim()
  const segments = parseSegments(cleaned)
  return <div className={styles.bubbleAi}>
    {change ? <p className={`${styles.changeBanner} ${verdictClass(change.to)}`}>판정 변경 {change.from ? `${change.from} → ` : '→ '}{change.to}{change.reason ? ` — ${change.reason}` : ''}</p> : null}
    {kept ? <p className={styles.keptBanner}>판정 유지</p> : null}
    {segments.map((segment, index) => {
      const meta = segment.speaker ? reviewerByName(segment.speaker) : undefined
      return <div className={styles.speech} key={index}>
        {meta ? <Image alt={meta.name} height={32} src={meta.avatar} width={32} /> : null}
        <div>
          {segment.speaker ? <b>[{meta?.label ?? segment.speaker}]</b> : null}
          <p>{segment.text}</p>
        </div>
      </div>
    })}
    {accepted ? <p className={styles.evidenceAccepted}>새 근거로 인정 — {accepted}</p> : null}
    {rejected ? <p className={styles.evidenceRejected}>근거로 인정되지 않음 — {rejected}</p> : null}
  </div>
}
