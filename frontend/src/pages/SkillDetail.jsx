import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import hljs from 'highlight.js'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function SkillDetail() {
  const { id } = useParams()
  const [skill, setSkill] = useState(null)
  const [armVersions, setArmVersions] = useState([])
  const [readme, setReadme] = useState(null)
  const [loading, setLoading] = useState(true)
  const [followed, setFollowed] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    Promise.all([
      api.getSkill(id),
      api.getSkillArmVersions(id),
    ]).then(([s, av]) => {
      setSkill(s)
      setArmVersions(av)
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (user) {
      api.getFollowSkillStatus(id).then(r => setFollowed(r.followed)).catch(() => {})
      api.getSkillReadme(id).then(r => { if (r.content) setReadme(r.content) }).catch(() => {})
    }
  }, [id, user])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!skill) return <div className="text-center py-12 text-gray-500">Skill not found</div>

  return (
    <div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{skill.name}</h1>
          {user && (
            <button
              onClick={() => {
                setFollowLoading(true)
                api.toggleFollowSkill(id).then(r => setFollowed(r.followed)).catch(console.error).finally(() => setFollowLoading(false))
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
        {skill.description && <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{skill.description}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          {skill.version && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">v{skill.version}</span>}
          <span>Uploaded by: {skill.uploader_name || 'Unknown'}</span>
          <span>{skill.downloads} downloads</span>
        </div>
        {user && skill.oss_zip_key && (
          <button onClick={() => api.downloadSkill(id).then(r => { if (r.download_url) window.open(r.download_url) }).catch(e => alert(e.message))}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Download
          </button>
        )}
      </div>

      {/* Readme / Markdown doc */}
      {readme && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">README</h2>
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {readme}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* File browser */}
      {user && skill.oss_zip_key && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Files</h2>
          <SkillFileBrowser skillId={id} />
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Associated ARM Versions ({armVersions.length})</h2>
      {armVersions.length === 0 ? <p className="text-sm text-gray-500">None</p> : (
        <div className="space-y-2">
          {armVersions.map(v => (
            <div key={v.id} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
              <span className="font-medium text-gray-900 dark:text-white">Version {v.version}</span>
              <span className="ml-2 text-xs text-gray-500">({v.status}) | Series #{v.series_id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SkillFileBrowser({ skillId }) {
  const [entries, setEntries] = useState([])
  const [file, setFile] = useState(null)
  const [currentPath, setCurrentPath] = useState('')
  const [pathStack, setPathStack] = useState([])
  const [loading, setLoading] = useState(true)
  const [fileLoading, setFileLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setFile(null)
    setError('')
    api.getSkillFiles(skillId, currentPath)
      .then(data => {
        if (data.type === 'file') {
          setFile(data)
        } else {
          setEntries(data.entries || [])
          if (!currentPath && data.entries) {
            const files = data.entries.filter(e => e.type === 'file')
            const skillMd = files.find(e => /^skill\.md$/i.test(e.name))
            const readmeMd = files.find(e => /^readme\.md$/i.test(e.name))
            const target = skillMd || readmeMd
            if (target) loadFile(target.name)
          }
        }
      })
      .catch(err => setError(err.message || 'Failed to load files'))
      .finally(() => setLoading(false))
  }, [skillId, currentPath])

  function loadFile(name) {
    const filePath = currentPath ? `${currentPath}/${name}` : name
    setFileLoading(true)
    api.getSkillFiles(skillId, filePath)
      .then(data => { if (data.type === 'file') setFile(data) })
      .catch(console.error)
      .finally(() => setFileLoading(false))
  }

  function navigateToDir(name) {
    const newPath = currentPath ? `${currentPath}/${name}` : name
    setPathStack(prev => [...prev, currentPath])
    setCurrentPath(newPath)
  }

  function navigateUp() {
    if (pathStack.length > 0) {
      setPathStack(s => s.slice(0, -1))
      setCurrentPath(pathStack[pathStack.length - 1])
    }
  }

  function navigateToBreadcrumb(index) {
    const parts = currentPath.split('/')
    const newPath = parts.slice(0, index + 1).join('/')
    setPathStack(prev => [...prev, currentPath])
    setCurrentPath(newPath)
  }

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return []
    return currentPath.split('/')
  }, [currentPath])

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
  }

  if (error) {
    return <div className="text-center py-8 text-sm text-red-500">{error}</div>
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-sm">
        <button
          onClick={() => { setPathStack([]); setCurrentPath(''); setFile(null) }}
          className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
        >
          root
        </button>
        {breadcrumbs.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-gray-400">/</span>
            {i < breadcrumbs.length - 1 ? (
              <button onClick={() => navigateToBreadcrumb(i)} className="text-indigo-600 dark:text-indigo-400 hover:underline">{part}</button>
            ) : (
              <span className="text-gray-700 dark:text-gray-300">{part}</span>
            )}
          </span>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Directory listing */}
        {entries.length > 0 && (
          <div className="lg:w-72 lg:min-w-72 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
            {currentPath && (
              <button onClick={navigateUp}
                className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                ..
              </button>
            )}
            <div className="max-h-[600px] overflow-y-auto">
              {entries.map(entry => (
                <button
                  key={entry.name}
                  onClick={() => entry.type === 'directory' ? navigateToDir(entry.name) : loadFile(entry.name)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 ${
                    file?.path?.endsWith('/' + entry.name) || file?.path === entry.name ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                  }`}
                >
                  {entry.type === 'directory' ? (
                    <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  <span className="truncate text-gray-700 dark:text-gray-300">{entry.name}</span>
                  {entry.type === 'file' && entry.size > 0 && (
                    <span className="ml-auto text-xs text-gray-400 shrink-0">{formatSize(entry.size)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* File preview */}
        <div className="flex-1 min-w-0">
          {fileLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
          ) : file ? (
            <div>
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{file.path}</span>
                {file.size > 0 && <span className="text-xs text-gray-500">{formatSize(file.size)}</span>}
              </div>
              <SkillFileContent file={file} />
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400 text-sm">
              Select a file to preview
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SkillFileContent({ file }) {
  // PDF preview via iframe
  const isPdf = file.mime_type === 'application/pdf' || file.path?.toLowerCase().endsWith('.pdf')
  if (isPdf && file.download_url) {
    return (
      <div className="flex flex-col" style={{ height: '700px' }}>
        <iframe
          src={file.download_url}
          className="w-full flex-1 border-0"
          title={file.path}
        />
      </div>
    )
  }

  if (file.content === '[Binary file]') {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 mb-3">Binary file — cannot preview</p>
        {file.download_url && (
          <a href={file.download_url} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
            Download File
          </a>
        )}
      </div>
    )
  }

  if (file.truncated) {
    return <div className="p-6 text-center text-gray-500">File is too large to preview</div>
  }

  const isMarkdown = file.mime_type === 'text/markdown' ||
    file.path?.endsWith('.md') || file.path?.endsWith('.mdx')

  if (isMarkdown) {
    return (
      <div className="prose dark:prose-invert max-w-none p-6 overflow-auto max-h-[700px]">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {file.content}
        </ReactMarkdown>
      </div>
    )
  }

  return <HighlightedCode content={file.content} path={file.path} />
}

function HighlightedCode({ content, path }) {
  const lang = extToLang(path)
  const highlighted = useMemo(() => {
    try {
      if (lang) return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
      return hljs.highlightAuto(content).value
    } catch {
      return null
    }
  }, [content, lang])

  const lines = content.split('\n')

  return (
    <div className="overflow-auto max-h-[700px]">
      <pre className="text-sm leading-relaxed">
        <code>
          {highlighted ? (
            lines.map((_, i) => (
              <div key={i} className="flex hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <span className="select-none text-gray-400 dark:text-gray-600 text-right w-12 pr-4 py-0 shrink-0 text-xs leading-relaxed">{i + 1}</span>
                <span
                  className="hljs flex-1 px-4 py-0 whitespace-pre"
                  dangerouslySetInnerHTML={{ __html: highlighted.split('\n')[i] ?? '' }}
                />
              </div>
            ))
          ) : (
            lines.map((line, i) => (
              <div key={i} className="flex hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <span className="select-none text-gray-400 dark:text-gray-600 text-right w-12 pr-4 py-0 shrink-0 text-xs leading-relaxed">{i + 1}</span>
                <span className="flex-1 px-4 py-0 whitespace-pre text-gray-800 dark:text-gray-200">{line}</span>
              </div>
            ))
          )}
        </code>
      </pre>
    </div>
  )
}

function extToLang(path) {
  if (!path) return null
  const ext = path.split('.').pop()?.toLowerCase()
  const map = {
    py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    sh: 'bash', bash: 'bash', zsh: 'bash', yml: 'yaml', yaml: 'yaml',
    json: 'json', md: 'markdown', html: 'xml', xml: 'xml', css: 'css', scss: 'scss',
    sql: 'sql', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', rb: 'ruby',
    php: 'php', swift: 'swift', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    r: 'r', lua: 'lua', pl: 'perl', ex: 'elixir', exs: 'elixir',
    dart: 'dart', toml: 'ini', ini: 'ini', cfg: 'ini',
  }
  return map[ext] || null
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
