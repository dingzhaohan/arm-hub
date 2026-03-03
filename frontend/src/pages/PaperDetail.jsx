import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function PaperDetail() {
  const { id } = useParams()
  const [paper, setPaper] = useState(null)
  const [armSeries, setArmSeries] = useState([])
  const [datasets, setDatasets] = useState([])
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true) 
  const { user } = useAuth()

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

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!paper) return <div className="text-center py-12 text-gray-500">Paper not found</div>

  return (
    <div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{paper.title}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{paper.authors}</p>
        {paper.abstract && <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">{paper.abstract}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          {paper.year && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{paper.year}</span>}
          {paper.publication && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{paper.publication}</span>}
          {paper.doi && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">DOI: {paper.doi}</span>}
          {paper.citation_nums > 0 && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{paper.citation_nums} citations</span>}
        </div>
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
    </div>
  )
}
