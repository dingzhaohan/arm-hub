import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      api.getProfile().then(setProfile).catch(console.error).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [user])

  if (!user) return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Please sign in to view your profile.</div>
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!profile) return <div className="text-center py-12 text-gray-500">Failed to load profile</div>

  return (
    <div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center gap-4">
          {profile.user.avatar_url && <img src={profile.user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.user.display_name || profile.user.username}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{profile.user.email}</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* My ARM Series */}
        <Section title="My ARM Series" count={profile.my_arm_series.length}>
          {profile.my_arm_series.map(s => (
            <Link key={s.id} to={`/arms/${s.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
              <h3 className="font-medium text-gray-900 dark:text-white">{s.title}</h3>
              {s.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{s.description}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">{s.version_count} version(s)</span>
                {s.latest_status && (
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    s.latest_status === 'ready' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                  }`}>{s.latest_status}</span>
                )}
                {s.latest_score != null && <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{s.latest_score.toFixed(1)}</span>}
              </div>
            </Link>
          ))}
        </Section>

        {/* Followed Papers */}
        <Section title="Followed Papers" count={profile.followed_papers.length}>
          {profile.followed_papers.map(p => (
            <Link key={p.id} to={`/papers/${p.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
              <h3 className="font-medium text-gray-900 dark:text-white line-clamp-2">{p.title}</h3>
              {p.authors && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{p.authors}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {p.year && <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">{p.year}</span>}
                {p.publication && <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 max-w-[160px] truncate">{p.publication}</span>}
                {p.citation_nums > 0 && <span className="text-xs text-amber-700 dark:text-amber-400">Cited {p.citation_nums}</span>}
              </div>
            </Link>
          ))}
        </Section>

        {/* My Datasets */}
        <Section title="My Datasets" count={profile.my_datasets.length} color="purple">
          {profile.my_datasets.map(d => (
            <DatasetCard key={d.id} d={d} />
          ))}
        </Section>

        {/* My Skills */}
        <Section title="My Skills" count={profile.my_skills.length} color="amber">
          {profile.my_skills.map(s => (
            <SkillCard key={s.id} s={s} />
          ))}
        </Section>

        {/* Followed Datasets */}
        <Section title="Followed Datasets" count={profile.followed_datasets.length} color="purple">
          {profile.followed_datasets.map(d => (
            <DatasetCard key={d.id} d={d} />
          ))}
        </Section>

        {/* Followed Skills */}
        <Section title="Followed Skills" count={profile.followed_skills.length} color="amber">
          {profile.followed_skills.map(s => (
            <SkillCard key={s.id} s={s} />
          ))}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, count, color = 'indigo', children }) {
  const hoverColor = color === 'purple' ? 'hover:border-purple-300 dark:hover:border-purple-700' :
    color === 'amber' ? 'hover:border-amber-300 dark:hover:border-amber-700' : ''
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{title} ({count})</h2>
      {count === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">None yet</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  )
}

function DatasetCard({ d }) {
  return (
    <Link to={`/datasets/${d.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
      <h3 className="font-medium text-gray-900 dark:text-white">{d.name}</h3>
      {d.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{d.description}</p>}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
        {d.downloads > 0 && <span>{d.downloads} downloads</span>}
        {d.size_bytes > 0 && <span>{(d.size_bytes / 1024 / 1024).toFixed(1)} MB</span>}
      </div>
    </Link>
  )
}

function SkillCard({ s }) {
  return (
    <Link to={`/skills/${s.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
      <h3 className="font-medium text-gray-900 dark:text-white">{s.name}</h3>
      {s.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{s.description}</p>}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
        {s.version && <span>v{s.version}</span>}
        {s.downloads > 0 && <span>{s.downloads} downloads</span>}
      </div>
    </Link>
  )
}
