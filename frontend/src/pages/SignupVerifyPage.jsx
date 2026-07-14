import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '../services/authService'
import { extractApiErrorMessage } from '../lib/apiErrors'
import { useBranding } from '../contexts/BrandingProvider'

export function SignupVerifyPage() {
  const navigate = useNavigate()
  const { brandName, brandLogoUrl, brandWebsiteUrl, termsUrl, privacyPolicyUrl } = useBranding()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Verifying your account...')

  useEffect(() => {
    document.title = `Email Verification - ${brandName}`;
  }, [brandName]);

  useEffect(() => {
    let mounted = true
    let redirectTimer = null
    const uid = searchParams.get('uid')
    const token = searchParams.get('token')

    if (!uid || !token) {
      if (mounted) {
        setStatus('error')
        setMessage('Invalid verification link.')
      }
      return () => {
        mounted = false
        if (redirectTimer) clearTimeout(redirectTimer)
      }
    }

    const run = async () => {
      try {
        await authService.verifySignup({ uid, token })
        if (!mounted) return
        setStatus('success')
        setMessage('Your account has been verified. Redirecting...')
        redirectTimer = setTimeout(() => {
          if (mounted) navigate('/')
        }, 1000)
      } catch (err) {
        if (!mounted) return
        setStatus('error')
        setMessage(extractApiErrorMessage(err, 'Verification failed.'))
      }
    }

    run()
    return () => {
      mounted = false
      if (redirectTimer) clearTimeout(redirectTimer)
    }
  }, [navigate, searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-gray-900">
      <div className="w-full max-w-md">
        <div className="rounded-md bg-white p-6 shadow dark:bg-gray-800">
          {brandLogoUrl ? (
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white p-2 shadow-sm border border-gray-100 dark:bg-gray-700 dark:border-gray-600">
              <img
                src={brandLogoUrl}
                alt={`${brandName} logo`}
                className="h-12 w-12 object-contain"
              />
            </div>
          ) : null}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Verification</h1>
          <p className={`mt-3 text-sm ${status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
            {message}
          </p>
          {status === 'error' && (
            <p className="mt-4 text-sm">
              <Link className="font-medium text-indigo-600 hover:text-indigo-500" to="/signup">
                Request a new verification email
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
          <div className="text-[11px] text-gray-400/80">
            Powered by <a href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-gray-700 dark:text-gray-100 dark:hover:text-gray-300 font-semibold underline transition-colors">Coneshare</a>
          </div>
        </div>
      </div>
    </div>
  )
}
