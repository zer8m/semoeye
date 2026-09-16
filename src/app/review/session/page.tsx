import { Suspense } from 'react'

import { ReviewSession } from '@/components/session/review-session'

export default function SessionPage() {
  return <Suspense fallback={null}><ReviewSession /></Suspense>
}
