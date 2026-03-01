import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

function PaperCard({ paper, linkTo }) {
  const title = paper.title || ''
  const titleZh = paper.titleZh || ''
  const authors = paper.authors || ''
  const year = paper.year || null
  const publication = paper.publication || ''
  const citationNums = paper.citationNums ?? paper.citation_nums ?? 0
  const impactFactor = paper.impactFactor ?? paper.impact_factor ?? null
  const doi = paper.doi || ''
  const abstract = paper.abstract || ''
  const armSeriesCount = paper.arm_series_count ?? null

  return (
    <Link to={linkTo}
      className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
      {/* Title */}
      <h3 className="font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2">{title}</h3>
      {titleZh && titleZh !== title && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{titleZh}</p>
      )}

      {/* Authors */}
      {authors && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-1">{authors}</p>
      )}

      {/* Meta badges */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {year && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
            {year}
          </span>
        )}
        {publication && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">
            {publication}
          </span>
        )}
        {citationNums > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
            Cited {citationNums}
          </span>
        )}
        {impactFactor && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
            IF {impactFactor}
          </span>
        )}
        {armSeriesCount != null && armSeriesCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
            {armSeriesCount} ARM series
          </span>
        )}
      </div>

      {/* DOI */}
      {doi && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 truncate">DOI: {doi}</p>
      )}

      {/* Abstract */}
      {abstract && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-3 leading-relaxed">{abstract}</p>
      )}
    </Link>
  )
}

export default function Papers() {
  const [papers, setPapers] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [bohriumResults, setBohriumResults] = useState(null)
  const [bohriumLoading, setBohriumLoading] = useState(false)
  const { user } = useAuth()

  const loadPapers = () => {
    setLoading(true)
    api.getPapers()
      .then(data => { setPapers(data.items); setTotal(data.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadPapers() }, [])

  const handleSearch = () => {
    if (!search.trim()) return
    setBohriumLoading(true)
    api.searchBohriumPapers({ query: search, page_size: 20 })
      .then(data => {
        setBohriumResults(data)
        loadPapers()
      })
      .catch(e => alert(e.message))
      .finally(() => setBohriumLoading(false))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Papers</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">{total} papers in hub</span>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <input
          type="text" placeholder="Search papers from Bohrium..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
          className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm"
        />
        <button onClick={handleSearch} disabled={bohriumLoading || !search.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {bohriumLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Bohrium search results */}
      {bohriumResults && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Search Results ({bohriumResults.total || 0})
            </h3>
            <button onClick={() => setBohriumResults(null)} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Close</button>
          </div>
          {(bohriumResults.items || []).length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No results found</p>
          ) : (
            <div className="space-y-3">
              {(bohriumResults.items || []).map((paper) => (
                <PaperCard key={paper.id || paper.bohrium_paper_id} paper={paper} linkTo={`/papers/${paper.id}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Paper list from hub */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : papers.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">No papers in hub yet. Search above to add papers.</div>
      ) : (
        <div className="space-y-3">
          {papers.map(paper => (
            <PaperCard key={paper.id} paper={paper} linkTo={`/papers/${paper.id}`} />
          ))}
        </div>
      )}
    </div>
  )
}
