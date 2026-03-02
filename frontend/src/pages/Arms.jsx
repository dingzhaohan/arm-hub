import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function Arms() {
  const { user } = useAuth()
  const [series, setSeries] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getArmSeries()
      .then(data => { setSeries(data.items); setTotal(data.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ARM Series</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{total} series</span>
          {user && (
            <Link to="/arms/new" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Upload ARM
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : series.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No ARM series yet. {user ? 'Go to a Paper and create one!' : 'Sign in to upload.'}
        </div>
      ) : (
        <div className="space-y-3">
          {series.map(s => (
            <Link key={s.id} to={`/arms/${s.id}`}
              className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{s.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    by {s.owner_name} | Paper #{s.paper_id} | {s.version_count} version(s)
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {s.latest_version && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">v{s.latest_version}</span>}
                  {s.latest_status && (
                    <span className={`px-2 py-1 rounded ${
                      s.latest_status === 'ready' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                    }`}>{s.latest_status}</span>
                  )}
                  {s.latest_score != null && <span className="font-semibold text-indigo-600 dark:text-indigo-400">{s.latest_score.toFixed(1)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
