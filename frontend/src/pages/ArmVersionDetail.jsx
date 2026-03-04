import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'
import CodeBrowser from '../components/CodeBrowser'

export default function ArmVersionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [version, setVersion] = useState(null)
  const [paper, setPaper] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getArmVersion(id)
      .then(v => {
        setVersion(v)
        return api.getPaper(v.paper_id)
      })
      .then(setPaper)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!version) return <div className="text-center py-12 text-gray-500">ARM Version not found</div>

  return (
    <div>
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                ARM v{version.version}
              </h1>
              <StatusBadge status={version.status} />
              {version.score_total != null && (
                <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-bold">
                  Score: {version.score_total.toFixed(1)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>by {version.owner_name}</span>
              <span>|</span>
              <Link to={`/arms/${version.series_id}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                View Series
              </Link>
              {version.downloads > 0 && (
                <>
                  <span>|</span>
                  <span>{version.downloads} downloads</span>
                </>
              )}
            </div>
          </div>
        </div>

        {version.entry_command && (
          <div className="mt-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Entry Command:</span>
            <code className="ml-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-sm rounded text-gray-800 dark:text-gray-200">
              {version.entry_command}
            </code>
          </div>
        )}

        {version.runtime_env && (
          <div className="mt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Runtime:</span>
            <code className="ml-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-sm rounded text-gray-800 dark:text-gray-200">
              {version.runtime_env}
            </code>
          </div>
        )}

        {/* Linked datasets & skills */}
        {(version.datasets?.length > 0 || version.skills?.length > 0) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {version.datasets?.map(d => (
              <Link key={d.id} to={`/datasets/${d.id}`} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs hover:bg-purple-100 dark:hover:bg-purple-900/50">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"/><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z"/><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z"/></svg>
                {d.name}
              </Link>
            ))}
            {version.skills?.map(s => (
              <Link key={s.id} to={`/skills/${s.id}`} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs hover:bg-amber-100 dark:hover:bg-amber-900/50">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/></svg>
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Paper info */}
      {paper && (
        <Link to={`/papers/${paper.id}`} className="block bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-6 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Paper</p>
          <h3 className="font-medium text-gray-900 dark:text-white leading-snug line-clamp-2 text-sm">{paper.title}</h3>
          {paper.authors && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{paper.authors}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {paper.year && <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">{paper.year}</span>}
            {paper.publication && <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 max-w-[180px] truncate">{paper.publication}</span>}
            {paper.citation_nums > 0 && <span className="text-xs text-amber-700 dark:text-amber-400">Cited {paper.citation_nums}</span>}
          </div>
        </Link>
      )}

      {/* File browser */}
      {version.status !== 'ready' ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
          <p className="text-yellow-700 dark:text-yellow-300">
            This ARM version is currently <strong>{version.status}</strong>. Content browsing is available once the version is ready.
          </p>
          {version.error_message && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{version.error_message}</p>
          )}
        </div>
      ) : !user ? (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-2">Sign in to browse ARM content</p>
          <p className="text-xs text-gray-500">All file content is private and requires authentication.</p>
        </div>
      ) : (
        <CodeBrowser armVersionId={id} />
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    uploading: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.draft}`}>
      {status}
    </span>
  )
}
