'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import styles from './records.module.css'
import { currentUser, deleteReview, listReviews, type ReviewRow } from '@/lib/supabase'

export default function RecordsPage() {
  const [rows, setRows] = useState<readonly ReviewRow[]>([])
  const [state, setState] = useState<'loading' | 'anonymous' | 'ready'>('loading')

  useEffect(() => {
    void currentUser().then(async (user) => {
      setRows(await listReviews())
      setState(user ? 'ready' : 'anonymous')
    })
  }, [])

  async function remove(id: string) {
    await deleteReview(id)
    setRows((current) => current.filter((row) => row.id !== id))
  }

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/">세모눈</Link>
      <Link href="/review">새 안건 검토 <span aria-hidden="true">↗</span></Link>
    </header>
    <section className={styles.body}>
      <p className={styles.eyebrow}>MY RECORDS</p>
      <h1>내 판정 기록</h1>
      {state === 'anonymous' ? <div className={styles.empty}>
        <p>{rows.length > 0 ? '아래 기록은 이 브라우저에만 저장된 것입니다. 로그인하면 계정에 보관됩니다.' : '로그인하면 판정과 토론이 내 계정에만 저장되고, 여기서 이어서 진행할 수 있습니다.'}</p>
        <Link href="/login">로그인하기 <span aria-hidden="true">→</span></Link>
      </div> : null}
      {state === 'ready' && rows.length === 0 ? <div className={styles.empty}>
        <p>아직 저장된 검토가 없습니다. 첫 안건을 따져보세요.</p>
        <Link href="/review">검토 시작하기 <span aria-hidden="true">→</span></Link>
      </div> : null}
      <ul className={styles.list}>
        {rows.map((row) => <li key={row.id}>
          <Link className={styles.item} href={`/review/session?id=${row.id}`}>
            <span className={`${styles.badge} ${row.verdict === '진행' ? styles.go : row.verdict === '폐기' ? styles.drop : styles.hold}`}>{row.verdict ?? '미판정'}</span>
            <div>
              <b>{row.title}</b>
              <small>{new Date(row.updated_at).toLocaleString('ko-KR')} · 메시지 {row.messages.length}개{row.verdict_reason ? ` · ${row.verdict_reason}` : ''}</small>
            </div>
          </Link>
          <button onClick={() => void remove(row.id)} type="button">삭제</button>
        </li>)}
      </ul>
    </section>
  </main>
}
