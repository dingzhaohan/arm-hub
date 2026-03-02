import { useRef, useEffect, useMemo } from 'react'
import Cookies from 'js-cookie'
import { CONFIG, buildLoginUrl, isValidOrigin } from '../config/bohrium'
import { useAuth } from '../contexts/AuthContext'

export default function BohriumLoginModal({ onClose }) {
  const iframeRef = useRef(null)
  const { loginWithBohrium } = useAuth()
  const loginUrl = useMemo(() => buildLoginUrl(), [])

  useEffect(() => {
    const handleLoginSuccess = (token) => {
      Cookies.set(CONFIG.COOKIE_NAME, token, {
        domain: CONFIG.COOKIE_DOMAIN,
        expires: 7,
      })
      localStorage.setItem(CONFIG.COOKIE_NAME, token)
      loginWithBohrium(token)
      onClose()
    }

    const handleMessage = (event) => {
      if (!isValidOrigin(event.origin)) return
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.data.token && !event.data.brm_auth_code) {
        handleLoginSuccess(event.data.token)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onClose, loginWithBohrium])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <iframe ref={iframeRef} src={loginUrl} style={{ width: 400, height: 650, border: 'none' }} allow="clipboard-write; clipboard-read" title="Bohrium Login" />
      </div>
    </div>
  )
}
