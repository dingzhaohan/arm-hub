import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function SkillDetail() {
  const { id } = useParams()
  const [skill, setSkill] = useState(null)
  const [armVersions, setArmVersions] = useState([])
  const [loading, setLoading] = useState(true)
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

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!skill) return <div className="text-center py-12 text-gray-500">Skill not found</div>

  return (
    <div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{skill.name}</h1>
        {skill.description && <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{skill.description}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          {skill.version && <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">v{skill.version}</span>}
          <span>Uploaded by: {skill.uploader_name || 'Unknown'}</span>
          <span>{skill.downloads} downloads</span>
        </div>
        {user && (
          <button onClick={() => api.downloadSkill(id).then(r => { if (r.download_url) window.open(r.download_url) }).catch(e => alert(e.message))}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Download
          </button>
        )}
      </div>

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
