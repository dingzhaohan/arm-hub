export const BOHRIUM_CONFIG = {
  prod: {
    COOKIE_NAME: 'brmToken',
    COOKIE_DOMAIN: '.bohrium.com',
    PLATFORM: 'https://platform.bohrium.com',
    USER_API: '/api/auth/bohrium/me',
  },
  dev: {
    COOKIE_NAME: 'test-brmToken',
    COOKIE_DOMAIN: '.test.bohrium.com',
    PLATFORM: 'https://platform.test.bohrium.com',
    USER_API: '/api/auth/bohrium/me',
  },
}

export const CONFIG = BOHRIUM_CONFIG[import.meta.env.VITE_BOHRIUM_ENV || 'dev']

export function buildLoginUrl() {
  const url = new URL(`${CONFIG.PLATFORM}/login`)
  url.searchParams.set('business', 'Bohrium')
  url.searchParams.set('lang', localStorage.getItem('language') || 'cn')
  url.searchParams.set('redirect', window.location.href)
  url.searchParams.set('_t', `${Date.now()}`)
  return url.toString()
}

export function isValidOrigin(origin) {
  return origin.includes('bohrium.com') || origin.includes('bohrium.dp.tech')
}
