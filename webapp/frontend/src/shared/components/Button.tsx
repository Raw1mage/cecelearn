import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }>

type LinkButtonProps = PropsWithChildren<LinkProps & { variant?: 'primary' | 'secondary'; className?: string }>

export function Button({ children, className = '', variant = 'primary', ...props }: ButtonProps) {
  return (
    <button className={`ui-button ui-button--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  )
}

export function LinkButton({ children, className = '', variant = 'primary', ...props }: LinkButtonProps) {
  return (
    <Link className={`ui-button ui-button--${variant} ${className}`.trim()} {...props}>
      {children}
    </Link>
  )
}
