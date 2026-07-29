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

/**
 * 피드 URL을 고정 팔레트의 색 하나에 대응시킨다. 해시 기반이라 같은 피드는 항상 같은 색이고,
 * 색 정보를 따로 저장할 필요가 없다.
 * @returns Tailwind 배경색 클래스 (예: `'bg-[#5b8dd9]'`)
 */
export function feedColorClass(url: string): string {
  return PALETTE[hash(url) % PALETTE.length]!
}
