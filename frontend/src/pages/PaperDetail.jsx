import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { ossUpload, validateFile } from '../utils/ossUpload'

export default function PaperDetail() {
  const { id } = useParams()
  const [paper, setPaper] = useState(null)
  const [armSeries, setArmSeries] = useState([])
  const [datasets, setDatasets] = useState([])
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [followed, setFollowed] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const { user } = useAuth()

  // Diagnosis report (single)
  const [diagContent, setDiagContent] = useState(null)
  const [diagReport, setDiagReport] = useState(null)
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagUploading, setDiagUploading] = useState(false)
  const [diagProgress, setDiagProgress] = useState(0)
  const [diagError, setDiagError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    Promise.all([
      api.getPaper(id),
      api.getPaperArmSeries(id),
      api.getPaperDatasets(id),
      api.getPaperSkills(id),
    ]).then(([p, s, d, sk]) => {
      setPaper(p)
      setArmSeries(s)
      setDatasets(d)
      setSkills(sk)
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  // Load diagnosis report
  useEffect(() => {
    api.getDiagnosis(id).then(res => {
      if (res) {
        setDiagReport(res.report)
        setDiagContent(res.content)
      }
    }).catch(() => { })
  }, [id])

  // Load follow status
  useEffect(() => {
    if (user) {
      api.getFollowPaperStatus(id).then(r => setFollowed(r.followed)).catch(() => {})
    }
  }, [id, user])

  async function handleDeleteDiagnosis() {
    if (!diagReport) return
    setDeleting(true)
    try {
      await api.deleteDiagnosisReport(id, diagReport.id)
      setDiagReport(null)
      setDiagContent(null)
      setDiagOpen(false)
    } catch (err) {
      setDiagError(err.message || 'Failed to delete report')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  async function handleDiagnosisUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const err = validateFile(file, { allowedExts: ['.md'] })
    if (err) { setDiagError(err); return }

    setDiagError('')
    setDiagUploading(true)
    setDiagProgress(0)

    try {
      const { report, credential } = await api.createDiagnosisReport(id)
      await ossUpload(credential, file, { onProgress: pct => setDiagProgress(pct) })
      await api.completeDiagnosisReport(id, report.id)

      // Reload
      const res = await api.getDiagnosis(id)
      if (res) {
        setDiagReport(res.report)
        setDiagContent(res.content)
        setDiagOpen(true)
      }
    } catch (err) {
      setDiagError(err.message || 'Upload failed')
    } finally {
      setDiagUploading(false)
      setDiagProgress(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!paper) return <div className="text-center py-12 text-gray-500">Paper not found</div>

  const hasDiag = !!diagContent

  return (
    <div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{paper.title}</h1>
          {user && (
            <button
              onClick={() => {
                setFollowLoading(true)
                api.toggleFollowPaper(id).then(r => setFollowed(r.followed)).catch(console.error).finally(() => setFollowLoading(false))
              }}
              disabled={followLoading}
              className={`ml-4 shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                followed
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              } disabled:opacity-50`}
            >
              {followLoading ? '...' : followed ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{paper.authors}</p>
        {paper.abstract && <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">{paper.abstract}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          {paper.year && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{paper.year}</span>}
          {paper.publication && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{paper.publication}</span>}
          {paper.doi && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">DOI: {paper.doi}</span>}
          {paper.citation_nums > 0 && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{paper.citation_nums} citations</span>}
        </div>
      </div>

      {/* Diagnosis Report */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reproducibility Diagnosis</h2>
          <div className="flex items-center gap-2">
            {hasDiag && (
              <>
                <button
                  onClick={() => setDiagOpen(o => !o)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {diagOpen ? 'Collapse' : 'View Report'}
                  <svg className={`w-4 h-4 transition-transform ${diagOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {user && user.id === diagReport?.uploader_user_id && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </>
            )}
            {user && !hasDiag && (
            <label className={`px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer ${diagUploading ? 'bg-gray-400 text-white cursor-wait' : 'bg-teal-600 text-white hover:bg-teal-700'}`}>
              {diagUploading ? `Uploading ${diagProgress}%...` : 'Upload Report'}
              <input
                ref={fileRef}
                type="file"
                accept=".md"
                className="hidden"
                disabled={diagUploading}
                onChange={handleDiagnosisUpload}
              />
            </label>
          )}
          </div>
        </div>

        {diagError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3 text-sm text-red-600 dark:text-red-400">
            {diagError}
          </div>
        )}

        {diagUploading && (
          <div className="mb-3">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div className="bg-teal-600 h-2 rounded-full transition-all duration-300" style={{ width: `${diagProgress}%` }} />
            </div>
          </div>
        )}

        {hasDiag ? (
          <>
            {diagReport && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Uploaded by {diagReport.uploader_name} · {new Date(diagReport.created_at).toLocaleDateString()}
              </p>
            )}
            {diagOpen && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{diagContent}</ReactMarkdown>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No diagnosis report yet. {user ? 'Upload a markdown file to add one.' : 'Sign in to upload.'}</p>
        )}
      </div>

      {/* ARM Series */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ARM Series ({armSeries.length})</h2>
          {user && <Link to={`/arms/new?paper_id=${paper.id}`} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Upload ARM</Link>}
        </div>
        {armSeries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No ARM series yet. {user ? 'Be the first to upload!' : 'Sign in to upload.'}</p>
        ) : (
          <div className="space-y-2">
            {armSeries.map(s => (
              <Link key={s.id} to={`/arms/${s.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{s.title}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">by {s.owner_name} | {s.version_count} versions</p>
                  </div>
                  <div className="text-right text-xs">
                    {s.latest_version && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded mr-2">v{s.latest_version}</span>}
                    {s.latest_status && <span className={`px-2 py-1 rounded ${s.latest_status === 'ready' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'}`}>{s.latest_status}</span>}
                    {s.latest_score != null && <span className="ml-2 font-medium text-indigo-600 dark:text-indigo-400">{s.latest_score.toFixed(1)}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Associated datasets / skills */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Datasets ({datasets.length})</h2>
          {datasets.length === 0 ? <p className="text-sm text-gray-500">No datasets</p> : (
            <div className="space-y-2">
              {datasets.map(d => (
                <Link key={d.id} to={`/datasets/${d.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 hover:border-purple-300 dark:hover:border-purple-700 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{d.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Skills ({skills.length})</h2>
          {skills.length === 0 ? <p className="text-sm text-gray-500">No skills</p> : (
            <div className="space-y-2">
              {skills.map(s => (
                <Link key={s.id} to={`/skills/${s.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 hover:border-amber-300 dark:hover:border-amber-700 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{s.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Diagnosis Report</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Are you sure? This will permanently delete the diagnosis report for this paper.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDiagnosis}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
