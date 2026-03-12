import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium',
    'transition-all duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-accent)]',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'bg-[var(--accent)] text-black font-semibold',
          'hover:bg-[var(--accent-hover)] hover:shadow-[var(--glow-accent)]',
          'active:brightness-90 active:scale-[0.98]',
        ].join(' '),
        soft: [
          'bg-[var(--accent-soft)] text-[var(--accent)] font-medium',
          'hover:bg-[var(--accent-soft-hover)]',
          'active:scale-[0.98]',
        ].join(' '),
        secondary: [
          'bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
          'hover:bg-[var(--bg-hover)] shadow-[var(--shadow-card)]',
          'active:scale-[0.98]',
        ].join(' '),
        ghost: [
          'text-[var(--text-secondary)]',
          'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
          'active:scale-[0.97]',
        ].join(' '),
        outline: [
          'border border-[var(--border)] bg-transparent text-[var(--text-primary)]',
          'hover:bg-[var(--bg-hover)] hover:border-[var(--border-accent)]',
          'active:scale-[0.98]',
        ].join(' '),
        danger: [
          'bg-[var(--danger-bg)] text-[var(--danger)]',
          'hover:bg-[var(--danger)]/20',
          'active:scale-[0.98]',
        ].join(' '),
        link: 'text-[var(--accent)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 rounded-lg px-3 text-sm',
        lg: 'h-10 rounded-lg px-5',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
