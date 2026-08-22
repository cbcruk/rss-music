import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * clsx로 조건부 클래스를 합친 뒤 tailwind-merge로 충돌을 정리한다.
 * (예: `cn('p-2', 'p-4')` → `'p-4'`)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
