import { useState, useEffect } from 'react'
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
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">My ARM Series ({profile.my_arm_series.length})</h2>
          {profile.my_arm_series.length === 0 ? <p className="text-sm text-gray-500">No ARM series yet</p> : (
            <div className="space-y-2">
              {profile.my_arm_series.map(s => (
                <a key={s.id} href={`/arms/${s.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm hover:border-indigo-300">
                  <span className="font-medium text-gray-900 dark:text-white">{s.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Followed Papers ({profile.followed_papers.length})</h2>
          {profile.followed_papers.length === 0 ? <p className="text-sm text-gray-500">No followed papers</p> : (
            <div className="space-y-2">
              {profile.followed_papers.map(p => (
                <a key={p.id} href={`/papers/${p.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm hover:border-indigo-300">
                  <span className="font-medium text-gray-900 dark:text-white">{p.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">My Datasets ({profile.my_datasets.length})</h2>
          {profile.my_datasets.length === 0 ? <p className="text-sm text-gray-500">No datasets</p> : (
            <div className="space-y-2">
              {profile.my_datasets.map(d => (
                <a key={d.id} href={`/datasets/${d.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm hover:border-purple-300">
                  <span className="font-medium text-gray-900 dark:text-white">{d.name}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">My Skills ({profile.my_skills.length})</h2>
          {profile.my_skills.length === 0 ? <p className="text-sm text-gray-500">No skills</p> : (
            <div className="space-y-2">
              {profile.my_skills.map(s => (
                <a key={s.id} href={`/skills/${s.id}`} className="block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm hover:border-amber-300">
                  <span className="font-medium text-gray-900 dark:text-white">{s.name}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
