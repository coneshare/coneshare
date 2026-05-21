import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '../services/authService'
import { extractApiErrorMessage } from '../lib/apiErrors'

export function SignupVerifyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Verifying your account...')

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
      <div className="w-full max-w-md rounded-md bg-white p-6 shadow dark:bg-gray-800">
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
    </div>
  )
}
