import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { ossUpload } from '../utils/ossUpload'

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
  const [files, setFiles] = useState([])
  const [pickMode, setPickMode] = useState('files') // 'files' | 'folder'
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState('')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  function handleFileChange(e) {
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return
    setError('')
    setFiles(selected)
  }

  function clearFiles() {
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (files.length === 0) { setError('Please select files to upload'); return }
    setError('')
    setCreating(true)
    setProgress('Creating skill...')
    setUploadPercent(0)

    try {
      const skill = await api.createSkill({
        name: name.trim(),
        description: description.trim(),
        tags: tags.trim() || undefined,
        version: version.trim() || undefined,
      })

      setProgress('Getting upload credentials...')
      const cred = await api.getSkillUploadCredential(skill.id)

      // Package files into a zip
      setProgress('Packaging files...')
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      let mdFile = null

      for (const file of files) {
        const path = file.webkitRelativePath || file.name
        zip.file(path, file)
        if (!mdFile && file.name.toLowerCase().endsWith('.md')) {
          mdFile = file
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const zipFileObj = new File([zipBlob], 'skill.zip', { type: 'application/zip' })

      // Upload zip
      setProgress('Uploading...')
      setUploadPercent(0)
      const zipResult = await ossUpload(
        { ...cred, object_key: cred.zip_object_key },
        zipFileObj,
        { onProgress: (p) => setUploadPercent(p) }
      )

      // Upload md if found
      let ossMdKey = null
      if (mdFile) {
        setProgress('Uploading readme...')
        setUploadPercent(0)
        const mdResult = await ossUpload(
          { ...cred, object_key: cred.md_object_key },
          mdFile,
          { onProgress: (p) => setUploadPercent(p) }
        )
        ossMdKey = mdResult.objectKey
      }

      setProgress('Finalizing...')
      const params = { oss_zip_key: zipResult.objectKey }
      if (ossMdKey) params.oss_md_key = ossMdKey
      await api.completeSkill(skill.id, params)

      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
      setProgress('')
      setUploadPercent(0)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
  const tabCls = (active) =>
    `px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
      active
        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
    }`

  const filesSummary = files.length > 0
    ? `${files.length} file${files.length > 1 ? 's' : ''} selected` +
      (files.some(f => f.name.toLowerCase().endsWith('.md')) ? ' (includes .md)' : '')
    : null

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Create Skill</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="text" placeholder="Skill name" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        <textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputCls} />
        <div className="grid grid-cols-2 gap-3">
          <input type="text" placeholder="Tags (e.g. python, ml)" value={tags} onChange={e => setTags(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          <input type="text" placeholder="Version (1.0.0)" value={version} onChange={e => setVersion(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        </div>

        {/* File upload */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Upload Files</label>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button type="button" onClick={() => { setPickMode('files'); clearFiles() }} className={tabCls(pickMode === 'files')}>Files</button>
              <button type="button" onClick={() => { setPickMode('folder'); clearFiles() }} className={tabCls(pickMode === 'folder')}>Folder</button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
          <input ref={folderInputRef} type="file" webkitdirectory="" onChange={handleFileChange} className="hidden" />
          <button type="button"
            onClick={() => pickMode === 'folder' ? folderInputRef.current?.click() : fileInputRef.current?.click()}
            className="px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 w-full text-left">
            {filesSummary || (pickMode === 'folder' ? 'Click to select a folder...' : 'Click to select files...')}
          </button>
          {files.length > 0 && (
            <button type="button" onClick={clearFiles} className="text-xs text-red-500 hover:text-red-700 mt-1">Clear</button>
          )}
        </div>

        {/* Progress bar */}
        {creating && (
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>{progress}</span>
              {uploadPercent > 0 && <span>{uploadPercent}%</span>}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadPercent || 5}%` }} />
            </div>
          </div>
        )}

        <button type="submit" disabled={creating}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
          {creating ? progress || 'Creating...' : 'Create Skill'}
        </button>
      </form>
    </div>
  )
}
