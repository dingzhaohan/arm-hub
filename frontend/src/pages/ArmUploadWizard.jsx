import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import OSS from 'ali-oss'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

const STEPS = [
  { key: 'paper', label: 'Select Paper' },
  { key: 'series', label: 'Create Series & Version' },
  { key: 'code', label: 'Upload Code' },
  { key: 'report', label: 'Upload Report' },
  { key: 'trace', label: 'Upload Trace' },
  { key: 'dataset', label: 'Select Datasets' },
  { key: 'submit', label: 'Submit' },
]

export default function ArmUploadWizard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(0)

  // Wizard state
  const [paper, setPaper] = useState(null)
  const [series, setSeries] = useState(null)
  const [version, setVersion] = useState(null)
  const [uploads, setUploads] = useState({ code: null, report: null, trace: null })
  const [datasetIds, setDatasetIds] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  // Pre-fill paper from query param
  useEffect(() => {
    const paperId = searchParams.get('paper_id')
    if (paperId) {
      api.getPaper(paperId).then(p => {
        setPaper(p)
        setStep(1)
      }).catch(console.error)
    }
  }, [searchParams])

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">You must be signed in to upload an ARM.</p>
      </div>
    )
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
          {result.status === 'ready' ? (
            <>
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">ARM Created Successfully!</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">Your ARM version is ready for browsing.</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Processing Failed</h2>
              <p className="text-red-500 mb-6">{result.error || 'Unknown error during processing.'}</p>
            </>
          )}
          <Link
            to={`/arm-versions/${result.arm_version_id}`}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            View ARM Version
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Upload ARM</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              i === step
                ? 'bg-indigo-600 text-white'
                : i < step
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {i < step ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
              ) : (
                <span>{i + 1}</span>
              )}
              {s.label}
            </div>
            {i < STEPS.length - 1 && <div className="w-4 h-px bg-gray-300 dark:bg-gray-600 mx-1" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        {step === 0 && <StepSelectPaper paper={paper} setPaper={setPaper} onNext={() => setStep(1)} setError={setError} />}
        {step === 1 && <StepCreateSeries paper={paper} series={series} setSeries={setSeries} version={version} setVersion={setVersion} onNext={() => setStep(2)} setError={setError} />}
        {step === 2 && <StepUploadFile label="Code" accept=".zip" module="code" filename="code.zip" version={version} uploads={uploads} setUploads={setUploads} onNext={() => setStep(3)} setError={setError} />}
        {step === 3 && <StepUploadFile label="Report" accept=".md" module="report" filename="report.md" version={version} uploads={uploads} setUploads={setUploads} onNext={() => setStep(4)} setError={setError} />}
        {step === 4 && <StepUploadFile label="Trace" accept=".zip" module="trace" filename="trace.zip" version={version} uploads={uploads} setUploads={setUploads} onNext={() => setStep(5)} setError={setError} />}
        {step === 5 && <StepSelectDatasets datasetIds={datasetIds} setDatasetIds={setDatasetIds} onNext={() => setStep(6)} setError={setError} />}
        {step === 6 && (
          <StepSubmit
            version={version}
            uploads={uploads}
            datasetIds={datasetIds}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        )}
      </div>

      {/* Back button */}
      {step > 0 && step < 6 && !submitting && (
        <button onClick={() => setStep(s => s - 1)} className="mt-4 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          Back to previous step
        </button>
      )}
    </div>
  )

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    try {
      const res = await api.completeArmVersion(version.id, {
        code_zip_key: uploads.code,
        report_md_key: uploads.report,
        trace_zip_key: uploads.trace,
        dataset_ids: datasetIds,
      })
      setResult(res)
    } catch (e) {
      setError(e.message || 'Failed to submit ARM version')
    } finally {
      setSubmitting(false)
    }
  }
}

// Step 1: Select Paper
function StepSelectPaper({ paper, setPaper, onNext, setError }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  function handleSearch() {
    if (!search.trim()) return
    setError('')
    setSearching(true)
    api.searchBohriumPapers({ query: search.trim(), page_size: 10 })
      .then(data => setResults(data.items || []))
      .catch(e => setError(e.message))
      .finally(() => setSearching(false))
  }

  async function selectBohriumPaper(bp) {
    setError('')
    try {
      const year = bp.coverDateStart ? parseInt(bp.coverDateStart.slice(0, 4), 10) : null
      const p = await api.ensurePaper({
        bohrium_paper_id: bp.paperId || bp.id,
        title: bp.title,
        authors: bp.authors || '',
        abstract: bp.abstract || '',
        doi: bp.doi || null,
        citation_nums: bp.citationNums || 0,
        impact_factor: bp.impactFactor || null,
        year: year,
        publication: bp.publication || null,
        cover_date_start: bp.coverDateStart || null,
      })
      setPaper(p)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Select a Paper</h3>

      {paper ? (
        <div className="mb-4">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">{paper.title}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{paper.authors}</p>
              </div>
              <button onClick={() => setPaper(null)} className="text-xs text-gray-500 hover:text-red-500">Change</button>
            </div>
          </div>
          <button onClick={onNext} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Next: Create Series
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search papers by title, keyword..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button onClick={handleSearch} disabled={searching} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {results.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Search Results</h4>
              <div className="space-y-2">
                {results.map((bp, i) => (
                  <button key={i} onClick={() => selectBohriumPaper(bp)} className="w-full text-left bg-gray-50 dark:bg-gray-800 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <div className="font-medium text-sm text-gray-900 dark:text-white">{bp.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {bp.authors ? bp.authors.slice(0, 100) : ''}
                      {bp.coverDateStart ? ` · ${bp.coverDateStart.slice(0, 4)}` : ''}
                      {bp.publication ? ` · ${bp.publication}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Step 2: Create Series & Version
function StepCreateSeries({ paper, series, setSeries, version, setVersion, onNext, setError }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [versionStr, setVersionStr] = useState('1.0.0')
  const [entryCommand, setEntryCommand] = useState('')
  const [runtimeEnv, setRuntimeEnv] = useState('')
  const [creating, setCreating] = useState(false)
  const [existingSeries, setExistingSeries] = useState([])
  const [useExisting, setUseExisting] = useState(false)

  useEffect(() => {
    if (paper) {
      api.getArmSeries({ paper_id: paper.id, limit: 100 })
        .then(data => setExistingSeries(data.items || []))
        .catch(console.error)
    }
  }, [paper])

  async function handleCreate() {
    setError('')
    setCreating(true)
    try {
      let s = series
      if (!s) {
        s = await api.createArmSeries({
          paper_id: paper.id,
          title: title || `ARM for ${paper.title?.slice(0, 50)}`,
          description,
        })
        setSeries(s)
      }

      const v = await api.createArmVersion(s.id, {
        version: versionStr,
        entry_command: entryCommand || undefined,
        runtime_env: runtimeEnv || undefined,
      })
      setVersion(v)
      onNext()
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  if (version) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Series & Version Created</h3>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">Series: <strong>{series?.title}</strong></p>
          <p className="text-sm text-gray-700 dark:text-gray-300">Version: <strong>{version.version}</strong></p>
        </div>
        <button onClick={onNext} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          Next: Upload Code
        </button>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create ARM Series & Version</h3>

      {existingSeries.length > 0 && (
        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
            <input type="checkbox" checked={useExisting} onChange={e => setUseExisting(e.target.checked)} className="rounded" />
            Use existing series
          </label>
          {useExisting && (
            <select
              onChange={e => {
                const s = existingSeries.find(x => x.id === parseInt(e.target.value))
                setSeries(s)
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">Select a series...</option>
              {existingSeries.map(s => (
                <option key={s.id} value={s.id}>{s.title} ({s.version_count} versions)</option>
              ))}
            </select>
          )}
        </div>
      )}

      {!useExisting && (
        <>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Series Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`ARM for ${paper?.title?.slice(0, 50) || 'paper'}...`}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </>
      )}

      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Version</label>
          <input
            type="text"
            value={versionStr}
            onChange={e => setVersionStr(e.target.value)}
            placeholder="1.0.0"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entry Command (optional)</label>
          <input
            type="text"
            value={entryCommand}
            onChange={e => setEntryCommand(e.target.value)}
            placeholder="python main.py"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Runtime Env (optional)</label>
          <input
            type="text"
            value={runtimeEnv}
            onChange={e => setRuntimeEnv(e.target.value)}
            placeholder="Python 3.10"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <button onClick={handleCreate} disabled={creating} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
        {creating ? 'Creating...' : 'Create & Next'}
      </button>
    </div>
  )
}

// Step 3/4/5: Upload File
function StepUploadFile({ label, accept, module, filename, version, uploads, setUploads, onNext, setError }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const isUploaded = uploads[module] != null

  async function handleUpload() {
    if (!file) { setError(`Please select a ${label} file`); return }
    setError('')
    setUploading(true)
    setProgress(0)

    try {
      // Step 1: Get STS token from backend
      const cred = await api.getUploadCredential(version.id, {
        module,
        filename,
      })

      // Step 2: Upload via ali-oss SDK with STS credentials
      const client = new OSS({
        region: `oss-${cred.region}`,
        accessKeyId: cred.access_key_id,
        accessKeySecret: cred.access_key_secret,
        stsToken: cred.security_token,
        bucket: cred.bucket,
      })

      await client.put(cred.object_key, file, {
        progress: (p) => {
          setProgress(Math.round(p * 100))
        },
      })

      // Step 3: Record the object key
      setUploads(prev => ({ ...prev, [module]: cred.object_key }))
      setProgress(100)
    } catch (e) {
      setError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Upload {label}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {module === 'code' && 'Upload your code as a ZIP file. Must contain README.md in root.'}
        {module === 'report' && 'Upload your reproduction report as a Markdown file.'}
        {module === 'trace' && 'Upload your execution trace as a ZIP file. This is required.'}
      </p>

      {isUploaded ? (
        <div className="mb-4">
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4">
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            <span className="text-sm text-emerald-700 dark:text-emerald-300">{label} uploaded successfully</span>
          </div>
          <button onClick={onNext} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Next
          </button>
        </div>
      ) : (
        <>
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
            <input
              type="file"
              accept={accept}
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="hidden"
              id={`file-${module}`}
            />
            <label htmlFor={`file-${module}`} className="cursor-pointer">
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {file ? file.name : `Click to select ${filename}`}
              </p>
              {file && <p className="text-xs text-gray-400 mt-1">{formatSize(file.size)}</p>}
            </label>
          </div>

          {uploading && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">{progress}%</p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {uploading ? `Uploading ${progress}%...` : `Upload ${label}`}
          </button>
        </>
      )}
    </div>
  )
}

// Step 6: Select Datasets
function StepSelectDatasets({ datasetIds, setDatasetIds, onNext, setError }) {
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.getDatasets({ limit: 100 })
      .then(data => setDatasets(data.items || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function toggleDataset(id) {
    setDatasetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const filtered = search
    ? datasets.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : datasets

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Select Datasets</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        At least one dataset is required. Select existing datasets to link to this ARM version.
      </p>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Filter datasets..."
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-3"
      />

      {loading ? (
        <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">
          No datasets found. <Link to="/datasets" className="text-indigo-600 hover:underline">Create a dataset first</Link>.
        </p>
      ) : (
        <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
          {filtered.map(d => (
            <button
              key={d.id}
              onClick={() => toggleDataset(d.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                datasetIds.includes(d.id)
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700'
                  : 'bg-gray-50 dark:bg-gray-800 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                datasetIds.includes(d.id)
                  ? 'bg-indigo-600 border-indigo-600'
                  : 'border-gray-300 dark:border-gray-600'
              }`}>
                {datasetIds.includes(d.id) && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                )}
              </div>
              <span className="text-gray-900 dark:text-white">{d.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{datasetIds.length} selected</span>
        <button
          onClick={() => {
            if (datasetIds.length === 0) { setError('At least one dataset is required'); return }
            setError('')
            onNext()
          }}
          disabled={datasetIds.length === 0}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          Next: Review & Submit
        </button>
      </div>
    </div>
  )
}

// Step 7: Submit
function StepSubmit({ version, uploads, datasetIds, submitting, onSubmit }) {
  const allReady = uploads.code && uploads.report && uploads.trace && datasetIds.length > 0

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Review & Submit</h3>

      <div className="space-y-3 mb-6">
        <CheckItem label="Code (code.zip)" done={!!uploads.code} />
        <CheckItem label="Report (report.md)" done={!!uploads.report} />
        <CheckItem label="Trace (trace.zip)" done={!!uploads.trace} />
        <CheckItem label={`Datasets (${datasetIds.length} selected)`} done={datasetIds.length > 0} />
      </div>

      {!allReady && (
        <p className="text-sm text-red-500 mb-4">All four modules are required before submission.</p>
      )}

      <button
        onClick={onSubmit}
        disabled={!allReady || submitting}
        className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Submitting & Processing...' : 'Submit ARM Version'}
      </button>

      {submitting && (
        <p className="text-xs text-gray-500 text-center mt-2">
          This may take a moment as code.zip is being extracted and validated...
        </p>
      )}
    </div>
  )
}

function CheckItem({ label, done }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
        </svg>
      ) : (
        <svg className="w-5 h-5 text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd"/>
        </svg>
      )}
      <span className={`text-sm ${done ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{label}</span>
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
