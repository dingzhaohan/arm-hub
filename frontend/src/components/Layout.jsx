import { NavLink, Outlet, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import BohriumLoginModal from './BohriumLoginModal'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/papers', label: 'Papers' },
  { to: '/arms', label: 'ARMs' },
  { to: '/datasets', label: 'Datasets' },
  { to: '/skills', label: 'Skills' },
  { to: '/playground', label: 'BohrClaw' },
]

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()

  useEffect(() => {
    const handler = () => setAuthOpen(true)
    window.addEventListener('show-login-modal', handler)
    return () => window.removeEventListener('show-login-modal', handler)
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 dark:bg-gray-900 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <NavLink to="/" className="flex items-center gap-2 shrink-0">
              <span className="font-bold text-xl text-gray-900 dark:text-white">ARM Hub</span>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium dark:bg-emerald-900 dark:text-emerald-300">Beta</span>
            </NavLink>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">
                {theme === 'dark' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
              {user ? (
                <div className="hidden md:flex items-center gap-2">
                  {user.profilePhoto && <img src={user.profilePhoto} alt="" className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-700" />}
                  <Link to="/profile" className="text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">{user.nickname || user.name}</Link>
                  <button onClick={logout} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400">Logout</button>
                </div>
              ) : (
                <button onClick={() => setAuthOpen(true)} className="hidden md:inline-flex px-3 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-lg">
                  Sign In
                </button>
              )}
              <button className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setMobileOpen(!mobileOpen)}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  }
                </svg>
              </button>
            </div>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white px-4 py-2 dark:bg-gray-900 dark:border-gray-800">
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `block px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400'}`}>
                {item.label}
              </NavLink>
            ))}
            {user ? (
              <div className="flex items-center justify-between px-3 py-2 mt-2 border-t border-gray-200 dark:border-gray-800">
                <Link to="/profile" onClick={() => setMobileOpen(false)} className="text-sm text-gray-700 dark:text-gray-300">{user.nickname || user.name}</Link>
                <button onClick={() => { logout(); setMobileOpen(false) }} className="text-xs text-red-600 dark:text-red-400">Logout</button>
              </div>
            ) : (
              <button onClick={() => { setAuthOpen(true); setMobileOpen(false) }} className="block w-full text-left px-3 py-2 mt-2 border-t border-gray-200 dark:border-gray-800 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                Sign In
              </button>
            )}
          </div>
        )}
      </header>
      {authOpen && <BohriumLoginModal onClose={() => setAuthOpen(false)} />}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <Outlet />
      </main>
      <footer className="border-t border-gray-200 bg-white mt-16 dark:bg-gray-900 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="font-semibold text-gray-900 dark:text-white">ARM Hub</span>
            <p className="text-sm text-gray-500 dark:text-gray-400">Agent-Ready Manuscripts for Reproducible Research</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Powered by Bohrium</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
