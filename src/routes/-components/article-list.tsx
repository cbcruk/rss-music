import { useState, type ReactNode } from 'react'
import { ExternalLink, Music, Newspaper, Play } from 'lucide-react'
import type { ArticleWithTracks, CachedTrack } from '#/server/db'
import { Badge } from '#/ui/badge'
import { feedColorClass } from './app-sidebar/feed-color'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

type Variant = 'featured' | 'standard' | 'compact'

/**
 * Picks a card variant from content richness.
 * - `featured`: image + tracks (large thumb)
 * - `standard`: image xor tracks (small thumb)
 * - `compact`: neither (no thumb)
 */
function variantOf(a: ArticleWithTracks): Variant {
  const hasImage = Boolean(a.image)
  const hasTracks = a.tracks.length > 0
  if (hasImage && hasTracks) return 'featured'
  if (hasImage || hasTracks) return 'standard'
  return 'compact'
}

interface ArticleListProps {
  articles: ArticleWithTracks[]
}

function SourceRow({ article: a }: { article: ArticleWithTracks }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span
        className={`inline-block size-1.5 shrink-0 rounded-full ${feedColorClass(a.feedUrl)}`}
        aria-hidden
      />
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {a.source}
      </span>
      <span className="text-[11px] text-muted-foreground"> / {formatDate(a.published)}</span>
    </div>
  )
}

function TrackThumb({ track }: { track: CachedTrack }) {
  const [playing, setPlaying] = useState(false)

  if (!track.videoId) {
    return <Music className="size-7 text-muted-foreground/60" aria-hidden />
  }

  if (playing) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1`}
        title={track.videoTitle ?? track.searchQuery}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="size-full border-0"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      title={track.videoTitle ?? track.searchQuery}
      className="group relative block size-full cursor-pointer overflow-hidden"
    >
      <img
        src={`https://i.ytimg.com/vi/${track.videoId}/mqdefault.jpg`}
        alt={track.videoTitle ?? ''}
        className="size-full object-cover transition-opacity group-hover:opacity-80"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Play className="size-8 fill-white text-white drop-shadow-lg" />
      </span>
    </button>
  )
}

function CardThumb({ article: a }: { article: ArticleWithTracks }) {
  const firstTrack = a.tracks.at(0)

  if (firstTrack?.videoId) {
    return (
      <div className="relative w-80 aspect-video shrink-0 self-start overflow-hidden bg-muted rounded-lg">
        <TrackThumb track={firstTrack} />
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center justify-center bg-muted w-25 rounded-lg overflow-hidden">
      {a.image ? (
        <img src={a.image} alt="" className="size-full object-cover" />
      ) : (
        <Newspaper className="size-7 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  )
}

function CardBody({
  article: a,
  variant,
  children,
}: {
  article: ArticleWithTracks
  variant: Variant
  children: ReactNode
}) {
  return (
    <div className="flex justify-between gap-4 min-w-0 flex-1">
      <div className="flex flex-col">
        <SourceRow article={a} />
        <h2
          className={`mb-1.5 font-serif font-medium leading-snug ${
            variant === 'featured' ? 'text-[17px]' : 'text-[15px]'
          }`}
        >
          {a.title}
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open article"
            className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </h2>
        {a.summary && (
          <p
            className={`text-xs leading-relaxed text-muted-foreground ${
              variant === 'featured' ? 'line-clamp-3' : 'line-clamp-2'
            }`}
          >
            {a.summary}
          </p>
        )}
        {a.categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {a.categories.map((c, i) => (
              <Badge key={`${c}-${i}`} variant="outline" className="text-[10px] tracking-wide">
                {c}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function ArticleCard({ article: a }: { article: ArticleWithTracks }) {
  const variant = variantOf(a)

  return (
    <article
      data-variant={variant}
      data-read={a.read}
      data-tracks={a.tracks.length}
      className="overflow-hidden p-4 rounded-lg bg-card text-card-foreground transition-colors hover:border-muted-foreground/30 border border-border"
    >
      <CardBody article={a} variant={variant}>
        {variant !== 'compact' && <CardThumb article={a} />}
      </CardBody>
    </article>
  )
}

export function ArticleList({ articles }: ArticleListProps) {
  return (
    <div className="flex flex-col gap-4">
      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} />
      ))}
    </div>
  )
}
