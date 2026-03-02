import { useState, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { api } from '../api'

/**
 * GitHub-style code browser.
 * - Left: directory tree from manifest (via content API)
 * - Right: file preview (text w/ syntax highlight, markdown rendered, binary → download)
 */
export default function CodeBrowser({ armVersionId }) {
  const [tree, setTree] = useState(null)    // current directory listing
  const [file, setFile] = useState(null)     // current file content
  const [currentPath, setCurrentPath] = useState('')
  const [pathStack, setPathStack] = useState([])
  const [loading, setLoading] = useState(true)
  const [fileLoading, setFileLoading] = useState(false)
  const [readmeContent, setReadmeContent] = useState(null)

  // Load directory listing
  useEffect(() => {
    setLoading(true)
    setFile(null)
    api.getArmContent(armVersionId, 'code', currentPath)
      .then(data => {
        if (data.entries !== undefined) {
          // Directory listing
          setTree(data)
          setFile(null)
          // Try to auto-load README.md if at root
          if (!currentPath && data.entries) {
            const readme = data.entries.find(
              e => e.type === 'file' && e.name.toLowerCase() === 'readme.md'
            )
            if (readme) {
              loadFile(readme.name)
            }
          }
        } else if (data.content !== undefined) {
          // Direct file
          setFile(data)
          setTree(null)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [armVersionId, currentPath])

  function loadFile(name) {
    const filePath = currentPath ? `${currentPath}/${name}` : name
    setFileLoading(true)
    api.getArmContent(armVersionId, 'code', filePath)
      .then(data => setFile(data))
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
      const prev = pathStack[pathStack.length - 1]
      setPathStack(s => s.slice(0, -1))
      setCurrentPath(prev)
    }
  }

  function navigateToBreadcrumb(index) {
    const parts = currentPath.split('/')
    const newPath = parts.slice(0, index + 1).join('/')
    setPathStack(prev => [...prev, currentPath])
    setCurrentPath(newPath)
  }

  function handleDownload(path) {
    api.downloadArmContent(armVersionId, 'code', path || 'code.zip')
      .then(data => {
        if (data.download_url) window.open(data.download_url, '_blank')
      })
      .catch(console.error)
  }

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return []
    return currentPath.split('/')
  }, [currentPath])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Breadcrumb navigation */}
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
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {part}
              </button>
            ) : (
              <span className="text-gray-700 dark:text-gray-300">{part}</span>
            )}
          </span>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => handleDownload('code.zip')}
          className="px-2 py-1 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-200 dark:hover:bg-emerald-900"
        >
          Download ZIP
        </button>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Directory listing */}
        {tree && tree.entries && (
          <div className="lg:w-72 lg:min-w-72 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
            {currentPath && (
              <button
                onClick={navigateUp}
                className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700"
              >
                ..
              </button>
            )}
            <div className="max-h-[600px] overflow-y-auto">
              {tree.entries.map(entry => (
                <button
                  key={entry.name}
                  onClick={() => entry.type === 'directory' ? navigateToDir(entry.name) : loadFile(entry.name)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 ${
                    file && file.path && file.path.endsWith('/' + entry.name) ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
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
              {tree.entries.length === 0 && (
                <div className="px-4 py-6 text-sm text-gray-500 text-center">Empty directory</div>
              )}
            </div>
          </div>
        )}

        {/* File preview */}
        <div className="flex-1 min-w-0">
          {fileLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          ) : file ? (
            <div>
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{file.path}</span>
                <div className="flex items-center gap-2">
                  {file.size > 0 && (
                    <span className="text-xs text-gray-500">{formatSize(file.size)}</span>
                  )}
                  <button
                    onClick={() => handleDownload(file.path)}
                    className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    Download
                  </button>
                </div>
              </div>
              <FileContent file={file} />
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

function FileContent({ file }) {
  if (file.truncated && !file.content) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 mb-3">File is too large to preview</p>
        {file.download_url && (
          <a href={file.download_url} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
            Download File
          </a>
        )}
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

  // Code with line numbers
  return (
    <div className="overflow-auto max-h-[700px]">
      <pre className="text-sm leading-relaxed">
        <code>
          {file.content.split('\n').map((line, i) => (
            <div key={i} className="flex hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <span className="select-none text-gray-400 dark:text-gray-600 text-right w-12 pr-4 py-0 shrink-0 text-xs leading-relaxed">{i + 1}</span>
              <span className="flex-1 px-4 py-0 whitespace-pre text-gray-800 dark:text-gray-200">{line}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
