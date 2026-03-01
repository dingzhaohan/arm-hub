import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

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
      .then(setBohriumResults)
      .catch(e => alert(e.message))
      .finally(() => setBohriumLoading(false))
  }

  const handleEnsure = async (paper) => {
    try {
      const year = paper.coverDateStart ? parseInt(paper.coverDateStart.slice(0, 4), 10) : null
      await api.ensurePaper({
        bohrium_paper_id: paper.paperId || paper.doi || String(paper.id || ''),
        title: paper.title,
        authors: paper.authors || '',
        abstract: paper.abstract || '',
        doi: paper.doi || null,
        citation_nums: paper.citationNums || 0,
        impact_factor: paper.impactFactor || null,
        year: year,
        publication: paper.publication || null,
        cover_date_start: paper.coverDateStart || null,
      })
      loadPapers()
      alert('Paper added to ARM Hub!')
    } catch (e) {
      alert(e.message)
    }
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
        <div className="mb-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-indigo-900 dark:text-indigo-200">
              Search Results ({bohriumResults.total || 0})
            </h3>
            <button onClick={() => setBohriumResults(null)} className="text-xs text-gray-500 hover:text-gray-700">Close</button>
          </div>
          {(bohriumResults.items || []).map((paper, i) => (
            <div key={i} className="flex items-start justify-between py-3 border-b border-indigo-100 dark:border-indigo-800 last:border-0">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{paper.title}</p>
                {paper.titleZh && paper.titleZh !== paper.title && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{paper.titleZh}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {paper.authors ? paper.authors.slice(0, 100) : ''}
                  {paper.coverDateStart ? ` · ${paper.coverDateStart.slice(0, 4)}` : ''}
                  {paper.publication ? ` · ${paper.publication}` : ''}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  {paper.citationNums > 0 && <span>{paper.citationNums} citations</span>}
                  {paper.impactFactor && <span>IF: {paper.impactFactor}</span>}
                  {paper.doi && <span>DOI: {paper.doi}</span>}
                </div>
              </div>
              <button onClick={() => handleEnsure(paper)} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 shrink-0">
                Add to Hub
              </button>
            </div>
          ))}
          {(bohriumResults.items || []).length === 0 && (
            <p className="text-sm text-gray-500">No results found</p>
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
            <Link key={paper.id} to={`/papers/${paper.id}`}
              className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
              <h3 className="font-medium text-gray-900 dark:text-white mb-1">{paper.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{paper.authors}</p>
              <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                {paper.year && <span>{paper.year}</span>}
                {paper.publication && <span>{paper.publication}</span>}
                <span>{paper.arm_series_count || 0} ARM series</span>
                {paper.citation_nums > 0 && <span>{paper.citation_nums} citations</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
