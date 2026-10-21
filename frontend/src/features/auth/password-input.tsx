'use client'

import * as React from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react/dist/ssr'
import { Input, type InputProps } from '@/components/ui/input'

/** A password field with a show / hide button (so sign up needs no confirm field). */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'trailing'>>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = React.useState(false)
    return (
      <Input
        ref={ref}
        {...props}
        type={visible ? 'text' : 'password'}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="-mr-1.5 grid size-7 place-items-center rounded-chip text-fg-3 transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
          >
            {visible ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
          </button>
        }
      />
    )
  }
)
