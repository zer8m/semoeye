import { type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div
    className={cn('flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 [&>svg]:text-red-600', className)}
    role="alert"
    {...props}
  />
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-[15.5px] font-semibold leading-relaxed', className)} {...props} />
}
