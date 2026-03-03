import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function DatasetDetail() {
  const { id } = useParams()
  const [dataset, setDataset] = useState(null)
  const [armVersions, setArmVersions] = useState([])
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [followed, setFollowed] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    Promise.all([
      api.getDataset(id),
      api.getDatasetArmVersions(id),
      api.getDatasetPapers(id),
    ]).then(([d, av, p]) => {
      setDataset(d)
      setArmVersions(av)
      setPapers(p)
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (user) {
      api.getFollowDatasetStatus(id).then(r => setFollowed(r.followed)).catch(() => {})
    }
  }, [id, user])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!dataset) return <div className="text-center py-12 text-gray-500">Dataset not found</div>

  return (
    <div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{dataset.name}</h1>
          {user && (
            <button
              onClick={() => {
                setFollowLoading(true)
                api.toggleFollowDataset(id).then(r => setFollowed(r.followed)).catch(console.error).finally(() => setFollowLoading(false))
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
        {dataset.description && <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{dataset.description}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>Uploaded by: {dataset.uploader_name || 'Unknown'}</span>
          <span>{dataset.downloads} downloads</span>
          {dataset.size_bytes > 0 && <span>{(dataset.size_bytes / 1024 / 1024).toFixed(1)} MB</span>}
        </div>
        {user && (
          <button onClick={() => api.downloadDataset(id).then(r => { if (r.download_url) window.open(r.download_url) }).catch(e => alert(e.message))}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Download
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Associated ARM Versions ({armVersions.length})</h2>
          {armVersions.length === 0 ? <p className="text-sm text-gray-500">None</p> : (
            <div className="space-y-2">
              {armVersions.map(v => (
                <div key={v.id} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">Version {v.version}</span>
                  <span className="ml-2 text-xs text-gray-500">({v.status})</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Associated Papers ({papers.length})</h2>
          {papers.length === 0 ? <p className="text-sm text-gray-500">None</p> : (
            <div className="space-y-2">
              {papers.map(p => (
                <a key={p.id} href={`/papers/${p.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm hover:border-indigo-300 dark:hover:border-indigo-700">
                  <span className="font-medium text-gray-900 dark:text-white">{p.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
