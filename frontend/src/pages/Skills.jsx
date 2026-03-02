import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function Skills() {
  const { user } = useAuth()
  const [skills, setSkills] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = (params = {}) => {
    setLoading(true)
    api.getSkills(params)
      .then(data => { setSkills(data.items); setTotal(data.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Skills</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{total} skills</span>
          {user && (
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
              Upload Skill
            </button>
          )}
        </div>
      </div>

      {showCreate && <CreateSkillForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />}

      <div className="flex gap-2 mb-6">
        <input type="text" placeholder="Search skills..." value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') load({ search }) }}
          className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm" />
        <button onClick={() => load({ search })} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700">Search</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : skills.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No skills found. {user ? 'Upload the first one!' : 'Sign in to upload.'}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map(s => (
            <Link key={s.id} to={`/skills/${s.id}`}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
              <h3 className="font-medium text-gray-900 dark:text-white mb-1">{s.name}</h3>
              {s.description && <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{s.description}</p>}
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {s.version && `v${s.version} | `}{s.downloads > 0 ? `${s.downloads} downloads | ` : ''}by {s.uploader_name || 'Unknown'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateSkillForm({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    setCreating(true)

    try {
      await api.createSkill({
        name: name.trim(),
        description: description.trim(),
        tags: tags.trim() || undefined,
        version: version.trim() || undefined,
      })
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create Skill</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="text" placeholder="Skill name" value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        <textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={2}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        <div className="grid grid-cols-2 gap-3">
          <input type="text" placeholder="Tags (e.g. python, ml)" value={tags} onChange={e => setTags(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          <input type="text" placeholder="Version (1.0.0)" value={version} onChange={e => setVersion(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        </div>
        <button type="submit" disabled={creating}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
          {creating ? 'Creating...' : 'Create Skill'}
        </button>
      </form>
    </div>
  )
}
