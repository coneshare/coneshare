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
    const uid = searchParams.get('uid')
    const token = searchParams.get('token')

    if (!uid || !token) {
      setStatus('error')
      setMessage('Invalid verification link.')
      return
    }

    const run = async () => {
      try {
        await authService.verifySignup({ uid, token })
        setStatus('success')
        setMessage('Your account has been verified. Redirecting...')
        setTimeout(() => navigate('/'), 1000)
      } catch (err) {
        setStatus('error')
        setMessage(extractApiErrorMessage(err, 'Verification failed.'))
      }
    }

    run()
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
