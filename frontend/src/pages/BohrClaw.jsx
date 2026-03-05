import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

const STEPS = [
  { key: 'fetching_ak', label: 'Fetching access key' },
  { key: 'resolving_project', label: 'Resolving project' },
  { key: 'creating_node', label: 'Creating compute node' },
  { key: 'waiting_node', label: 'Waiting for node ready' },
  { key: 'starting_service', label: 'Starting BohrClaw service' },
  { key: 'verifying_service', label: 'Verifying service ready' },
]

function StepProgress({ currentStep }) {
  const idx = STEPS.findIndex(s => s.key === currentStep)
  return (
    <div className="space-y-3">
      {STEPS.map((step, i) => {
        const done = i < idx
        const active = i === idx
        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
              done ? 'bg-green-500 text-white' :
              active ? 'bg-indigo-600 text-white' :
              'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              {done ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-sm transition-colors ${
              done ? 'text-green-600 dark:text-green-400' :
              active ? 'text-gray-900 dark:text-white font-medium' :
              'text-gray-400 dark:text-gray-500'
            }`}>
              {step.label}
              {active && (
                <span className="inline-block ml-1.5 animate-pulse">...</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function BohrClaw() {
  const { user } = useAuth()
  const [instance, setInstance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [destroying, setDestroying] = useState(false)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  const fetchStatus = () => {
    return api.getBohrClawStatus()
      .then(data => {
        if (data) setInstance(data)
        return data
      })
      .catch(() => null)
  }

  // Initial load
  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    fetchStatus().finally(() => setLoading(false))
  }, [user])

  // Poll while provisioning
  useEffect(() => {
    if (instance?.status === 'provisioning') {
      pollRef.current = setInterval(async () => {
        const data = await fetchStatus()
        if (data && data.status !== 'provisioning') {
          clearInterval(pollRef.current)
          setLaunching(false)
        }
      }, 2000)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [instance?.status])

  const handleLaunch = async () => {
    setLaunching(true)
    setError(null)
    try {
      const data = await api.launchBohrClaw()
      setInstance(data)
    } catch (e) {
      setError(e.message || 'Failed to launch')
      setLaunching(false)
    }
  }

  const handleDestroy = async () => {
    if (!confirm('Are you sure you want to destroy this BohrClaw instance? The Bohrium node will also be deleted.')) return
    setDestroying(true)
    setError(null)
    try {
      await api.destroyBohrClaw()
      setInstance(null)
    } catch (e) {
      setError(e.message || 'Failed to destroy')
    } finally {
      setDestroying(false)
    }
  }

  // Not logged in
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">BohrClaw</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">Sign in to launch your personal BohrClaw instance.</p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('show-login-modal'))}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          Sign In
        </button>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  // Instance ready — show link to BohrClaw
  if (instance?.status === 'ready' && instance.instance_url) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">BohrClaw</h1>
          <p className="text-gray-500 dark:text-gray-400">Your BohrClaw instance is ready!</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Instance is running
          </div>
          {instance.node_ip && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Node: {instance.node_ip} (ID: {instance.node_id})
            </p>
          )}
          <a
            href={instance.instance_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            Open BohrClaw
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button
            onClick={handleDestroy}
            disabled={destroying}
            className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {destroying && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {destroying ? 'Destroying...' : 'Destroy Instance'}
          </button>
        </div>
      </div>
    )
  }

  // Failed
  if (instance?.status === 'failed') {
    return (
      <div className="max-w-xl mx-auto py-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">BohrClaw</h1>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            <p className="font-medium mb-1">Provisioning failed</p>
            <p>{instance.error_message || 'Unknown error'}</p>
          </div>
          <button
            onClick={handleLaunch}
            disabled={launching}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {launching ? 'Starting...' : 'Retry'}
          </button>
          <button
            onClick={handleDestroy}
            disabled={destroying}
            className="w-full px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {destroying ? 'Cleaning up...' : 'Clear failed instance'}
          </button>
        </div>
      </div>
    )
  }

  // Provisioning in progress — show step progress
  if (instance?.status === 'provisioning') {
    return (
      <div className="max-w-xl mx-auto py-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">BohrClaw</h1>
          <p className="text-gray-500 dark:text-gray-400">Setting up your BohrClaw instance...</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <StepProgress currentStep={instance.progress_step} />
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">
            This usually takes 2-5 minutes. You can stay on this page.
          </p>
        </div>
      </div>
    )
  }

  // Launch page (no instance yet)
  return (
    <div className="max-w-xl mx-auto py-16">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">BohrClaw</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Launch your own personal BohrClaw instance on Bohrium with one click.
        </p>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
        <button
          onClick={handleLaunch}
          disabled={launching}
          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {launching && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {launching ? 'Starting...' : 'Launch BohrClaw'}
        </button>
      </div>
    </div>
  )
}
