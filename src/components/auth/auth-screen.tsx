'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import styles from './auth-screen.module.css'
import { supabase } from '@/lib/supabase'

type AuthMode = 'login' | 'signup'

export function AuthScreen({ mode }: { readonly mode: AuthMode }) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const isSignup = mode === 'signup'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const db = supabase()
    if (!db) {
      router.push('/review')
      return
    }
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    if (isSignup && password !== String(form.get('password-confirmation') ?? '')) {
      setStatus('비밀번호가 서로 다릅니다.')
      return
    }
    setBusy(true)
    setStatus(isSignup ? '계정을 만드는 중입니다.' : '로그인하는 중입니다.')
    const { error } = isSignup
      ? await db.auth.signUp({ email, password, options: { data: { name: String(form.get('name') ?? '') } } })
      : await db.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setStatus(error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 맞지 않습니다.' : error.message)
      return
    }
    setStatus('검토실로 이동합니다.')
    router.push('/review')
  }

  return <div className={styles.overlay}>
    <Link aria-label="닫기" className={styles.backdrop} href="/" />
    <div aria-modal="true" className={styles.card} role="dialog">
      <div className={styles.cardHeader}><h2>{isSignup ? '회원가입' : '로그인'}</h2><Link href="/">닫기</Link></div>
      <form onSubmit={handleSubmit}>{isSignup ? <label>이름<input name="name" required type="text" /></label> : null}<label>이메일<input name="email" required type="email" /></label><label>비밀번호<input minLength={8} name="password" required type="password" /></label>{isSignup ? <label>비밀번호 확인<input minLength={8} name="password-confirmation" required type="password" /></label> : null}<button disabled={busy} type="submit">{isSignup ? '회원가입 시작하기' : '로그인하고 시작하기'} <span aria-hidden="true">→</span></button></form>
      <p aria-live="polite" className={styles.status}>{status}</p><p className={styles.switcher}>{isSignup ? '이미 계정이 있으신가요?' : '회원가입 하시겠습니까?'} <Link href={isSignup ? '/?auth=login' : '/?auth=signup'}>{isSignup ? '로그인' : '회원가입'}</Link></p>
    </div>
  </div>
}
