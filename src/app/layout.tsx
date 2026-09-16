import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: '세모눈',
  description: '반대자가 반드시 포함된 AI 검토진이 아이디어의 갈린 지점을 드러내고 진행·보류·폐기를 판정합니다.',
}

interface RootLayoutProps { readonly children: ReactNode }

export default function RootLayout({ children }: RootLayoutProps) {
  return <html lang="ko"><body>{children}</body></html>
}
