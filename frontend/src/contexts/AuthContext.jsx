import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import Cookies from 'js-cookie'
import { CONFIG } from '../config/bohrium'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const getToken = useCallback(() => {
    return Cookies.get(CONFIG.COOKIE_NAME) || localStorage.getItem(CONFIG.COOKIE_NAME)
  }, [])

  const fetchUserInfo = useCallback(async (token) => {
    try {
      // Use our backend auth/me endpoint which returns structured UserOut
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch user info')
      const data = await res.json()
      // data is UserOut: { id, username, email, display_name, avatar_url, bio, created_at }
      setUser({
        id: data.id,
        username: data.username,
        email: data.email,
        display_name: data.display_name,
        avatar_url: data.avatar_url,
        bio: data.bio,
        // Compat fields for Layout
        nickname: data.display_name || data.username,
        name: data.username,
        profilePhoto: data.avatar_url,
      })
      return data
    } catch (error) {
      console.error('Failed to fetch user info:', error)
      // Try Bohrium directly as fallback
      try {
        const res2 = await fetch(CONFIG.USER_API, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (res2.ok) {
          const bdata = await res2.json()
          setUser({
            id: bdata.id,
            username: bdata.userNo || bdata.username,
            email: bdata.email,
            display_name: bdata.nickname,
            avatar_url: bdata.profilePhoto,
            nickname: bdata.nickname || bdata.userNo,
            name: bdata.userNo || bdata.username,
            profilePhoto: bdata.profilePhoto,
          })
          return bdata
        }
      } catch (e2) {
        console.error('Bohrium fallback also failed:', e2)
      }
      logout()
      return null
    }
  }, [])

  useEffect(() => {
    const token = getToken()
    if (token) {
      fetchUserInfo(token).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [getToken, fetchUserInfo])

  const loginWithBohrium = useCallback(async (token) => {
    setLoading(true)
    await fetchUserInfo(token)
    setLoading(false)
  }, [fetchUserInfo])

  const logout = useCallback(() => {
    Cookies.remove(CONFIG.COOKIE_NAME, { domain: CONFIG.COOKIE_DOMAIN })
    Cookies.remove(CONFIG.COOKIE_NAME)
    localStorage.removeItem(CONFIG.COOKIE_NAME)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, loginWithBohrium, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
