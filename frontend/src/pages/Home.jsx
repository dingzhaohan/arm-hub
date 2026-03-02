import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

export default function Home() {
  const [stats, setStats] = useState(null)
  const [latestArms, setLatestArms] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getStats(),
      api.getArmSeries({ limit: 6 }),
    ]).then(([s, arms]) => {
      setStats(s)
      setLatestArms(arms.items || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const statCards = stats ? [
    { label: 'Papers', value: stats.total_papers, to: '/papers', color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    { label: 'ARMs', value: stats.total_arms, to: '/arms', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    { label: 'Datasets', value: stats.total_datasets, to: '/datasets', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    { label: 'Skills', value: stats.total_skills, to: '/skills', color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  ] : []

  return (
    <div>
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">ARM Hub</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          A platform for sharing and discovering Agent-Ready Manuscripts (ARMs) — reproducible paper implementations with Code, Dataset, Report, and Trace.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {statCards.map(card => (
              <Link key={card.label} to={card.to} className={`${card.color} rounded-xl p-6 text-center hover:opacity-80 transition-opacity`}>
                <div className="text-3xl font-bold mb-1">{card.value}</div>
                <div className="text-sm font-medium">{card.label}</div>
              </Link>
            ))}
          </div>

          {/* Latest ARM Series */}
          {latestArms.length > 0 && (
            <div className="mb-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Latest ARMs</h2>
                <Link to="/arms" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">View all</Link>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {latestArms.map(s => (
                  <Link key={s.id} to={`/arms/${s.id}`} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-1 line-clamp-1">{s.title}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">by {s.owner_name}</p>
                    <div className="flex items-center gap-2 text-xs">
                      {s.latest_version && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">v{s.latest_version}</span>}
                      {s.latest_status && (
                        <span className={`px-2 py-0.5 rounded ${
                          s.latest_status === 'ready' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                        }`}>{s.latest_status}</span>
                      )}
                      {s.latest_score != null && (
                        <span className="font-medium text-indigo-600 dark:text-indigo-400">{s.latest_score.toFixed(1)}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">What is an ARM?</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
            An Agent-Ready Manuscript (ARM) is a complete reproducibility package for a research paper. Each ARM contains four required modules:
          </p>
          <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2"><span className="text-indigo-500 font-bold">Code</span> — Source code with README</li>
            <li className="flex items-start gap-2"><span className="text-emerald-500 font-bold">Dataset</span> — Data used in the paper</li>
            <li className="flex items-start gap-2"><span className="text-purple-500 font-bold">Report</span> — Markdown reproduction report</li>
            <li className="flex items-start gap-2"><span className="text-amber-500 font-bold">Trace</span> — Execution trace for verification</li>
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Getting Started</h2>
          <ol className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-2">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
              Sign in with your Bohrium account
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
              Search for a paper using Bohrium's paper search
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</span>
              Create an ARM Series and upload your reproduction package
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">4</span>
              Browse and download ARMs from the community
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
