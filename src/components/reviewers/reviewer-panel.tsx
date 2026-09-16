'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import styles from './reviewer-panel.module.css'
import { autoAssign, reviewerAffinities, type Affinity } from '@/lib/match'
import { REVIEWERS } from '@/lib/reviewers'

const MAX_PICK = 3

export function ReviewerPanel() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [picked, setPicked] = useState<readonly string[]>([])
  const [limitHit, setLimitHit] = useState(false)
  const [affinities, setAffinities] = useState<readonly Affinity[]>([])

  useEffect(() => {
    const draft = window.sessionStorage.getItem('semoeye:draft')
    if (!draft) {
      router.replace('/review')
      return
    }
    const parsed = JSON.parse(draft) as { agenda: string }
    setAffinities(reviewerAffinities(parsed.agenda))
    setReady(true)
  }, [router])

  function togglePick(id: string) {
    setPicked((current) => {
      if (current.includes(id)) {
        setLimitHit(false)
        return current.filter((item) => item !== id)
      }
      if (current.length >= MAX_PICK) {
        setLimitHit(true)
        return current
      }
      setLimitHit(false)
      return [...current, id]
    })
  }

  function startSession() {
    const draft = window.sessionStorage.getItem('semoeye:draft')
    if (!draft) return
    const parsed = JSON.parse(draft) as { agenda: string; stageId: string }
    const names = picked.length > 0
      ? picked
          .map((id) => REVIEWERS.find((reviewer) => reviewer.id === id)?.name)
          .filter((name): name is string => Boolean(name))
      : autoAssign(parsed.agenda).filter((name) => name !== '반대자')
    window.sessionStorage.setItem('semoeye:draft', JSON.stringify({ ...parsed, reviewers: names }))
    router.push('/review/session')
  }

  function affinityOf(id: string): Affinity | undefined {
    return affinities.find((item) => item.reviewer.id === id)
  }

  if (!ready) return null

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/">세모눈</Link>
      <Link aria-label="안건 다시 쓰기" className={styles.backIcon} href="/review"><span aria-hidden="true">←</span></Link>
    </header>

    <section className={styles.intro} aria-labelledby="panel-title">
      <h1 id="panel-title">검토진</h1>
      <p aria-live="polite" className={styles.pickStatus}>
        지정 {picked.length}/{MAX_PICK} · 반대자 자동 포함{limitHit ? ' — 검토진은 최대 4명입니다. 다른 검토자를 빼고 골라주세요.' : ''}
      </p>
      <div className={styles.startAction}>
        <button onClick={startSession} type="button">
          {picked.length === 0 ? '자동 배정으로 검토 시작' : `지정한 ${picked.length}명 + 반대자로 검토 시작`} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>

    <section className={styles.grid} aria-label="검토자 명단">
      {REVIEWERS.filter((reviewer) => !reviewer.hidden).map((reviewer, index) => {
        const selected = picked.includes(reviewer.id)
        return <article className={`${styles.card} ${selected ? styles.cardSelected : ''}`} key={reviewer.id}>
          <div className={`${styles.cardShade} ${styles[`shade${index % 4}`]}`} aria-hidden="true" />
          <div className={styles.bubble}>“{reviewer.question}”</div>
          <div className={styles.avatar}>
            <Image alt={`${reviewer.label} 검토자`} height={230} priority={index < 2} src={reviewer.avatar} width={230} />
          </div>
          <div className={styles.cardBody}>
            <p className={styles.identity}>{reviewer.always ? '항상 포함' : reviewer.conditional ? '조건부 참여' : '배정 대상'}</p>
            <h2>{reviewer.label}{(() => {
              const affinity = affinityOf(reviewer.id)
              if (reviewer.always) return <span className={`${styles.affinity} ${styles.affinityAlways}`}>항상 포함</span>
              if (!affinity) return null
              const percent = Math.round(affinity.relative * 100)
              return <span className={`${styles.affinity} ${percent >= 60 ? styles.affinityHigh : ''}`}>안건 적합도 {percent}%</span>
            })()}</h2>
            <dl>
              <div><dt>WHO</dt><dd>{reviewer.persona}</dd></div>
              <div><dt>판단 근거</dt><dd>{reviewer.basis}</dd></div>
              <div><dt>채점 기준</dt><dd>{reviewer.rubric.join(' · ')}</dd></div>
            </dl>
            {reviewer.always
              ? <button disabled type="button">예외 없이 포함됩니다</button>
              : <button aria-pressed={selected} onClick={() => togglePick(reviewer.id)} type="button">
                  {selected ? '지정 해제' : '이 검토자 지정하기'} <span aria-hidden="true">{selected ? '✓' : '→'}</span>
                </button>}
          </div>
        </article>
      })}
    </section>

  </main>
}
