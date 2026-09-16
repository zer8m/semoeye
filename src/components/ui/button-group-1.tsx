"use client"

import { FiPlus } from 'react-icons/fi'
import { Button } from '@/components/ui/button'

type ButtonGroup1Props = {
  readonly actionLabel: string
  readonly onClick: () => void
}

const ButtonGroup1 = ({ actionLabel, onClick }: ButtonGroup1Props) => {
  return (
    <div className='inline-flex w-fit'>
      <Button
        type='button'
        onClick={onClick}
        variant='outline'
        className='h-12 gap-2 rounded-full border-[#0a1b33] bg-[#0a1b33] px-4 text-white shadow-none hover:bg-[#19345e] hover:text-white focus-visible:z-10'
      >
        <FiPlus className='size-4' />
        {actionLabel}
      </Button>
    </div>
  )
}

export default ButtonGroup1
