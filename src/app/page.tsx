import type { CSSProperties } from 'react'
import Link from 'next/link'

import styles from './landing.module.css'
import { AuthScreen } from '@/components/auth/auth-screen'

const TILE_SPOTS = [
  { angle: 10, radius: '31vmin', size: 76, tilt: -8, variant: 'note', tone: '#ffffff', faint: true },
  { angle: 55, radius: '30vmin', size: 72, tilt: 6, variant: 'doc', tone: '#f1efec' },
  { angle: 100, radius: '32vmin', size: 80, tilt: -5, variant: 'photo', tone: '#ffffff' },
  { angle: 145, radius: '30vmin', size: 70, tilt: 9, variant: 'doc', tone: '#faf8f5', faint: true },
  { angle: 190, radius: '33vmin', size: 84, tilt: -6, variant: 'note', tone: '#efe9df' },
  { angle: 235, radius: '31vmin', size: 74, tilt: 5, variant: 'doc', tone: '#ffffff', faint: true },
  { angle: 280, radius: '30vmin', size: 78, tilt: -9, variant: 'photo', tone: '#f3ede4' },
  { angle: 325, radius: '32vmin', size: 75, tilt: 4, variant: 'doc', tone: '#e9ebee' },
  { angle: 28, radius: '55vmin', size: 104, tilt: 4, variant: 'photo', tone: '#ffffff' },
  { angle: 64, radius: '57vmin', size: 112, tilt: -5, variant: 'doc', tone: '#faf8f5' },
  { angle: 106, radius: '53vmin', size: 92, tilt: 7, variant: 'slide', tone: '#1a1815', dark: true },
  { angle: 136, radius: '56vmin', size: 108, tilt: -4, variant: 'doc', tone: '#ffffff' },
  { angle: 172, radius: '54vmin', size: 96, tilt: 8, variant: 'note', tone: '#f1efec' },
  { angle: 208, radius: '58vmin', size: 116, tilt: -6, variant: 'photo', tone: '#efe9df' },
  { angle: 244, radius: '53vmin', size: 94, tilt: 5, variant: 'doc', tone: '#1a1815', dark: true },
  { angle: 286, radius: '56vmin', size: 110, tilt: -8, variant: 'slide', tone: '#e9ebee' },
  { angle: 316, radius: '54vmin', size: 98, tilt: 6, variant: 'doc', tone: '#ffffff' },
  { angle: 352, radius: '57vmin', size: 106, tilt: -5, variant: 'photo', tone: '#f3ede4' },
] as const

export default async function HomePage({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const { auth } = await searchParams
  return <main className={styles.page}>
    <nav className={styles.navAuth}>
      <Link className={styles.navLogin} href="/?auth=login">로그인</Link>
      <Link className={styles.navSignup} href="/?auth=signup">가입하기</Link>
    </nav>
    {auth === 'login' || auth === 'signup' ? <AuthScreen mode={auth} /> : null}
    <section className={styles.hero}>
      <div aria-hidden="true" className={styles.tileLayer}>
        <div className={styles.orbit}>
          {TILE_SPOTS.map((spot) => {
            const spokeStyle: CSSProperties & Record<'--angle' | '--radius', string> = {
              '--angle': `${spot.angle}deg`,
              '--radius': spot.radius,
            }
            const tileStyle: CSSProperties & Record<'--tile-size' | '--tile-tilt', string> = {
              '--tile-size': `${spot.size}px`,
              '--tile-tilt': `${spot.tilt}deg`,
              background: spot.tone,
            }
            const tileClass = [
              styles.tile,
              spot.variant === 'slide' ? styles.tileSlide : '',
              'dark' in spot && spot.dark ? styles.tileDark : '',
              'faint' in spot && spot.faint ? styles.tileFaint : '',
            ].join(' ').trim()
            return <span className={styles.spoke} key={spot.angle} style={spokeStyle}>
              <span className={tileClass} style={tileStyle}>
                {spot.variant === 'photo' && <span className={styles.docPhoto} />}
                {(spot.variant === 'doc' || spot.variant === 'slide') && <span className={styles.docTitle} />}
                <span className={styles.docLines} />
              </span>
            </span>
          })}
        </div>
      </div>
      <div className={styles.heroContent}>
        <h1>세모눈</h1>
        <p className={styles.tagline}>아이디어를 묻는 공간</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/review">검토 시작하기</Link>
        </div>
      </div>
    </section>
  </main>
}
