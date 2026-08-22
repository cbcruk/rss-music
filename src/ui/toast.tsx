'use client'

import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import { CircleAlert, CircleCheck, X } from 'lucide-react'

import { cn } from '#/lib/utils.ts'

function ToastProvider({ timeout = 6000, ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider timeout={timeout} {...props} />
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((toast) => (
    <ToastPrimitive.Root
      key={toast.id}
      toast={toast}
      data-slot="toast"
      className={cn(
        'absolute right-0 bottom-0 left-auto z-50 w-[min(24rem,calc(100vw-2rem))]',
        'mr-0 [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+var(--toast-index)*-0.75rem))_scale(calc(1-var(--toast-index)*0.05))]',
        'rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg transition-all duration-300',
        'select-none after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[""]',
        'data-[expanded]:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-offset-y)*-1+var(--toast-swipe-movement-y)-var(--toast-index)*var(--gap)))]',
        'data-[starting-style]:[transform:translateY(150%)] data-[ending-style]:opacity-0',
        'data-[ending-style]:[&:not([data-limited])]:[transform:translateY(150%)]',
        'data-[swipe-direction=down]:data-[ending-style]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-[swipe-direction=right]:data-[ending-style]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))]',
        'data-[type=error]:border-destructive/40',
      )}
      style={{ '--gap': '0.75rem' } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        {toast.type === 'error' ? (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : toast.type === 'success' ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-500" />
        ) : null}
        <div className="min-w-0 flex-1">
          <ToastPrimitive.Title className="text-sm font-medium" />
          <ToastPrimitive.Description className="mt-1 text-xs leading-relaxed break-words text-muted-foreground" />
        </div>
        <ToastPrimitive.Close
          aria-label="Close"
          className="-mt-1 -mr-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <X className="size-3.5" />
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  ))
}

function Toaster() {
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        className="fixed right-4 bottom-4 z-50 mx-auto flex w-[min(24rem,calc(100vw-2rem))] outline-none"
      >
        <ToastList />
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  )
}

const useToast = ToastPrimitive.useToastManager

export { ToastProvider, Toaster, useToast }
