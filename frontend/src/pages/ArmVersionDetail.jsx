import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'
import CodeBrowser from '../components/CodeBrowser'

const TABS = [
  { key: 'code', label: 'Code' },
  { key: 'report', label: 'Report' },
  { key: 'trace', label: 'Trace' },
  { key: 'datasets', label: 'Datasets' },
  { key: 'score', label: 'Score' },
]

export default function ArmVersionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [version, setVersion] = useState(null)
  const [paper, setPaper] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('code')
  const [reportContent, setReportContent] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [traceInfo, setTraceInfo] = useState(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [score, setScore] = useState(null)
  const [scoreLoading, setScoreLoading] = useState(false)

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

  // Load tab content on tab change
  useEffect(() => {
    if (!version || !user) return

    if (activeTab === 'report' && !reportContent) {
      setReportLoading(true)
      api.getArmContent(id, 'report')
        .then(data => setReportContent(data.content || ''))
        .catch(() => setReportContent(null))
        .finally(() => setReportLoading(false))
    }

    if (activeTab === 'trace' && !traceInfo) {
      setTraceLoading(true)
      api.getArmContent(id, 'trace')
        .then(setTraceInfo)
        .catch(() => setTraceInfo(null))
        .finally(() => setTraceLoading(false))
    }

    if (activeTab === 'score' && !score) {
      setScoreLoading(true)
      api.getScore(id)
        .then(setScore)
        .catch(() => setScore(null))
        .finally(() => setScoreLoading(false))
    }
  }, [activeTab, version, user, id])

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

        {/* Linked datasets & skills summary */}
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

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-0 -mb-px">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.key === 'datasets' && version.datasets?.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs">
                  {version.datasets.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {version.status !== 'ready' && activeTab !== 'datasets' && activeTab !== 'score' ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
          <p className="text-yellow-700 dark:text-yellow-300">
            This ARM version is currently <strong>{version.status}</strong>. Content browsing is available once the version is ready.
          </p>
          {version.error_message && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{version.error_message}</p>
          )}
        </div>
      ) : !user && activeTab !== 'datasets' && activeTab !== 'score' ? (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-2">Sign in to browse ARM content</p>
          <p className="text-xs text-gray-500">All file content is private and requires authentication.</p>
        </div>
      ) : (
        <>
          {activeTab === 'code' && <CodeBrowser armVersionId={id} />}
          {activeTab === 'report' && <ReportTab loading={reportLoading} content={reportContent} />}
          {activeTab === 'trace' && <TraceTab loading={traceLoading} info={traceInfo} armVersionId={id} />}
          {activeTab === 'datasets' && <DatasetsTab datasets={version.datasets} />}
          {activeTab === 'score' && <ScoreTab loading={scoreLoading} score={score} version={version} user={user} />}
        </>
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

function ReportTab({ loading, content }) {
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
  if (content === null) return <div className="text-center py-12 text-gray-500">No report available</div>
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
      <div className="prose dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function TraceTab({ loading, info, armVersionId }) {
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
  if (!info || !info.entries || info.entries.length === 0) {
    return <div className="text-center py-12 text-gray-500">No trace file available</div>
  }

  const traceFile = info.entries[0]

  function handleDownload() {
    api.downloadArmContent(armVersionId, 'trace', 'trace.zip')
      .then(data => {
        if (data.download_url) window.open(data.download_url, '_blank')
      })
      .catch(console.error)
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 text-center">
      <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
      </svg>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Execution Trace</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {traceFile.name} ({formatSize(traceFile.size)})
      </p>
      <button
        onClick={handleDownload}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
      >
        Download Trace
      </button>
    </div>
  )
}

function DatasetsTab({ datasets }) {
  if (!datasets || datasets.length === 0) {
    return <div className="text-center py-12 text-gray-500">No datasets linked to this ARM version</div>
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {datasets.map(d => (
        <Link
          key={d.id}
          to={`/datasets/${d.id}`}
          className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"/><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z"/><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z"/></svg>
            <h3 className="font-medium text-gray-900 dark:text-white text-sm">{d.name}</h3>
          </div>
          {d.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{d.description}</p>
          )}
        </Link>
      ))}
    </div>
  )
}

function ScoreTab({ loading, score, version, user }) {
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>

  if (version.score_total != null) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
        <div className="text-center mb-6">
          <div className="text-5xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">
            {version.score_total.toFixed(1)}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Score</p>
        </div>
        {score?.dimensions_json && (
          <div className="grid sm:grid-cols-2 gap-3">
            {Object.entries(JSON.parse(typeof score.dimensions_json === 'string' ? score.dimensions_json : JSON.stringify(score.dimensions_json))).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-medium text-gray-900 dark:text-white">{typeof value === 'number' ? value.toFixed(1) : value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 text-center">
      <p className="text-gray-500 dark:text-gray-400 mb-4">
        {score?.status === 'pending' || score?.status === 'running'
          ? 'Scoring is in progress...'
          : 'This ARM version has not been scored yet.'}
      </p>
      {user && version.owner_user_id === user.id && version.status === 'ready' && (
        <button
          onClick={() => api.requestScore(version.id).catch(console.error)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          Request Scoring
        </button>
      )}
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
