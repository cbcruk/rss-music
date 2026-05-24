const PALETTE = [
  'bg-[#5b8dd9]',
  'bg-[#e07070]',
  'bg-[#5cbd8a]',
  'bg-[#c87de0]',
  'bg-[#e09a3a]',
  'bg-[#7dcfe0]',
  'bg-[#e0c87d]',
  'bg-[#9b9b9b]',
] as const

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function feedColorClass(url: string): string {
  return PALETTE[hash(url) % PALETTE.length]!
}
