import { useState } from 'react'

export interface Track {
  searchQuery: string
  videoId: string | null
  videoTitle: string | null
}

interface TrackCardProps {
  track: Track
}

export function TrackCard({ track }: TrackCardProps) {
  const [playing, setPlaying] = useState(false)

  if (!track.videoId) {
    return (
      <a
        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(track.searchQuery)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block aspect-video rounded-md bg-muted p-2 text-xs text-muted-foreground hover:bg-muted/70"
        title={`Search YouTube: ${track.searchQuery}`}
      >
        🔍 {track.searchQuery}
      </a>
    )
  }

  const videoId = track.videoId

  return (
    <div
      className={`group relative aspect-video rounded overflow-hidden bg-black ${
        playing ? 'col-span-full' : ''
      }`}
    >
      {playing ? (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title={track.videoTitle ?? track.searchQuery}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0"
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="block w-full h-full text-left"
          title={track.videoTitle ?? track.searchQuery}
        >
          <img
            src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
            alt={track.videoTitle ?? ''}
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
          />
          <span className="absolute inset-0 flex items-center justify-center text-white text-3xl drop-shadow-lg">
            ▶
          </span>
          <span className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-1 text-xs text-white line-clamp-1">
            {track.videoTitle ?? track.searchQuery}
          </span>
        </button>
      )}
    </div>
  )
}
