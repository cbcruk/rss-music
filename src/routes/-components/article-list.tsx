import type { ArticleWithTracks } from '#/db'
import { TrackGrid } from './track-grid'

interface ArticleListProps {
  articles: ArticleWithTracks[]
}

export function ArticleList({ articles }: ArticleListProps) {
  return (
    <ul className="space-y-4">
      {articles.map((a) => (
        <li key={a.id} className={`rounded border p-3 ${a.read === 0 ? 'bg-yellow-50' : ''}`}>
          <div className="flex gap-3">
            {a.image && (
              <img src={a.image} alt="" className="w-20 h-20 object-cover rounded shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline line-clamp-2"
              >
                {a.title}
              </a>
              <p className="text-xs text-gray-500 mt-1">
                {a.source} · {a.published ? a.published.slice(0, 10) : '—'}
                {a.read === 0 && <span className="ml-2 text-yellow-700">unread</span>}
              </p>
            </div>
          </div>
          {a.tracks.length > 0 && <TrackGrid tracks={a.tracks} />}
        </li>
      ))}
    </ul>
  )
}
