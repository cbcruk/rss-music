import { TrackCard, type Track } from './track-card'

interface TrackGridProps {
  tracks: Track[]
}

/** 기사에 딸린 트랙들을 반응형 그리드로 배치한다. */
export function TrackGrid({ tracks }: TrackGridProps) {
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {tracks.map((t, i) => (
        <TrackCard key={`${t.searchQuery}-${i}`} track={t} />
      ))}
    </div>
  )
}
