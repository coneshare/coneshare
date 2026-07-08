import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Link } from 'react-router-dom'
import { authService } from '../services/authService'
import { APP_DISPLAY_VERSION } from '../lib/constants'
import { Button } from '../components/ui/Button'
import { useBranding } from '../contexts/BrandingProvider'

function LoginPage() {
  const navigate = useNavigate()
  const { brandName, brandLogoUrl, brandWebsiteUrl, termsUrl, privacyPolicyUrl } = useBranding()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showSignupLink, setShowSignupLink] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadPublicSettings = async () => {
      try {
        const data = await authService.getPublicSettings()
        if (mounted) setShowSignupLink(Boolean(data?.enable_public_signup))
      } catch (_err) {
        if (mounted) setShowSignupLink(false)
      }
    }

    loadPublicSettings()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    document.title = `Sign In - ${brandName}`;
  }, [brandName])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      await authService.login(email, password)
      // Redirect to homepage on successful login
      navigate('/')
    } catch (err) {
      setError('Invalid credentials. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center">
          {brandLogoUrl ? (
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white p-2 shadow-sm border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
              <img
                src={brandLogoUrl}
                alt={`${brandName} logo`}
                className="h-12 w-12 object-contain"
              />
            </div>
          ) : null}
          <h2 className="text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Sign In
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Welcome back to {brandName}.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div>
            <Button
              type="submit"
              size="lg"
              disabled={isLoading}
              className="w-full active:scale-[0.98] transition-transform"
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </Button>
          </div>
        </form>
        {showSignupLink && (
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            New to {brandName}?{' '}
            <Link className="font-medium text-indigo-600 hover:text-indigo-500" to="/signup">
              Create an account
            </Link>
          </p>
        )}

      </div>

      {/* Footer Links */}
      <div className="mt-8 flex flex-col items-center justify-center gap-2 text-xs text-gray-400">
        <div className="flex items-center gap-3">
          <a
            href={brandWebsiteUrl || "https://www.coneshare.com/about"}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 transition-colors"
          >
            {brandWebsiteUrl ? `About ${brandName}` : "About Coneshare"}
          </a>
          <span className="text-gray-300">&bull;</span>
          <a
            href={termsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 transition-colors"
          >
            Terms
          </a>
          <span className="text-gray-300">&bull;</span>
          <a
            href={privacyPolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 transition-colors"
          >
            Privacy Policy
          </a>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400/80">
          <span>
            This website is powered by <a href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-gray-700 dark:text-gray-100 dark:hover:text-gray-300 font-semibold underline transition-colors">Coneshare</a>
          </span>
          {APP_DISPLAY_VERSION && (
            <>
              <span className="text-gray-300 select-none">&bull;</span>
              <span>{`ver-${APP_DISPLAY_VERSION}`}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default LoginPage
