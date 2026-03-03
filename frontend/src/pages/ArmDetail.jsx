import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function ArmDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [series, setSeries] = useState(null)
  const [versions, setVersions] = useState([])
  const [paper, setPaper] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getArmSeriesDetail(id)
      .then(s => {
        setSeries(s)
        return api.getPaper(s.paper_id)
      })
      .then(setPaper)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!series) return <div className="text-center py-12 text-gray-500">ARM Series not found</div>

  return (
    <div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{series.title}</h1>
          <Link to={`/papers/${series.paper_id}`} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">View Paper</Link>
        </div>
        {series.description && <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{series.description}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>Owner: {series.owner_name}</span>
          <span>{series.version_count} version(s)</span>
          {series.latest_version && <span>Latest: v{series.latest_version}</span>}
          {series.latest_status && (
            <span className={`px-2 py-0.5 rounded ${
              series.latest_status === 'ready'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
            }`}>{series.latest_status}</span>
          )}
          {series.latest_score != null && (
            <span className="font-medium text-indigo-600 dark:text-indigo-400">Score: {series.latest_score.toFixed(1)}</span>
          )}
        </div>
      </div>

      {/* Paper info card */}
      {paper && (
        <Link to={`/papers/${paper.id}`} className="block bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-6 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Reproducing Paper</p>
          <h3 className="font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2">{paper.title}</h3>
          {paper.authors && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{paper.authors}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {paper.year && <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">{paper.year}</span>}
            {paper.publication && <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">{paper.publication}</span>}
            {paper.doi && <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">DOI: {paper.doi}</span>}
            {paper.citation_nums > 0 && <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">Cited {paper.citation_nums}</span>}
          </div>
          {paper.abstract && <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 line-clamp-3 leading-relaxed">{paper.abstract}</p>}
        </Link>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Versions</h2>
        {user && (
          <Link
            to={`/arms/new?paper_id=${series.paper_id}`}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            New Version
          </Link>
        )}
      </div>

      <VersionsList seriesId={series.id} />
    </div>
  )
}

function VersionsList({ seriesId }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // We need to fetch versions for this series
    // The backend has GET /api/arm-series/{series_id} which returns version count
    // but we need individual versions. Let's query all versions for this series.
    // We'll use a direct fetch since the API might not have a dedicated list endpoint
    // Actually, looking at the backend, there's no direct list-versions-for-series endpoint
    // Let's fetch via the series detail which includes version info
    fetch(`/api/arm-series/${seriesId}/versions`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setVersions(Array.isArray(data) ? data : (data.items || [])))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false))
  }, [seriesId])

  if (loading) return <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>

  if (versions.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center">
        No versions yet. Create the first version by uploading an ARM.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {versions.map(v => (
        <Link
          key={v.id}
          to={`/arm-versions/${v.id}`}
          className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-medium text-gray-900 dark:text-white">v{v.version}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                v.status === 'ready' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' :
                v.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
              }`}>{v.status}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              {v.score_total != null && (
                <span className="font-medium text-indigo-600 dark:text-indigo-400">{v.score_total.toFixed(1)}</span>
              )}
              {v.downloads > 0 && <span>{v.downloads} downloads</span>}
              <span>{new Date(v.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
