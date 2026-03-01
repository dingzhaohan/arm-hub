import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function Datasets() {
  const { user } = useAuth()
  const [datasets, setDatasets] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = (params = {}) => {
    setLoading(true)
    api.getDatasets(params)
      .then(data => { setDatasets(data.items); setTotal(data.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Datasets</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{total} datasets</span>
          {user && (
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
              Upload Dataset
            </button>
          )}
        </div>
      </div>

      {showCreate && <CreateDatasetForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />}

      <div className="flex gap-2 mb-6">
        <input type="text" placeholder="Search datasets..." value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') load({ search }) }}
          className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm" />
        <button onClick={() => load({ search })} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700">Search</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : datasets.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No datasets found. {user ? 'Upload the first one!' : 'Sign in to upload.'}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map(d => (
            <Link key={d.id} to={`/datasets/${d.id}`}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
              <h3 className="font-medium text-gray-900 dark:text-white mb-1">{d.name}</h3>
              {d.description && <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{d.description}</p>}
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {d.downloads > 0 ? `${d.downloads} downloads | ` : ''}by {d.uploader_name || 'Unknown'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateDatasetForm({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    setCreating(true)

    try {
      // Step 1: Create dataset metadata
      const ds = await api.createDataset({ name: name.trim(), description: description.trim() })

      if (file) {
        // Step 2: Get upload credential
        setUploading(true)
        const cred = await api.getDatasetUploadCredential(ds.id)

        // Step 3: Upload file to OSS
        const xhr = new XMLHttpRequest()
        await new Promise((resolve, reject) => {
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100))
          }
          xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))
          xhr.onerror = () => reject(new Error('Upload network error'))
          xhr.open('PUT', cred.upload_url)
          xhr.setRequestHeader('Content-Type', 'application/octet-stream')
          xhr.send(file)
        })

        // Step 4: Complete
        await api.completeDataset(ds.id, {
          oss_key: cred.object_key,
          size_bytes: file.size,
        })
      }

      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
      setUploading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upload Dataset</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="text" placeholder="Dataset name" value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        <textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={2}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Dataset file (.zip)</label>
          <input type="file" accept=".zip" onChange={e => setFile(e.target.files?.[0] || null)}
            className="text-sm text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 dark:file:bg-purple-900/50 dark:file:text-purple-300" />
        </div>
        {uploading && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <button type="submit" disabled={creating}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
          {uploading ? `Uploading ${progress}%...` : creating ? 'Creating...' : 'Create Dataset'}
        </button>
      </form>
    </div>
  )
}
