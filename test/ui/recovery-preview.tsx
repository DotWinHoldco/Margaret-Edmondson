import { createRoot } from 'react-dom/client'
import ResetPasswordForm from '@/app/reset-password/ResetPasswordForm'
import ForgotPasswordPage from '@/app/(marketing)/forgot-password/page'
import '@/app/globals.css'

const query = new URLSearchParams(window.location.search)
createRoot(document.getElementById('root')!).render(
  query.get('mode') === 'request' ? <ForgotPasswordPage /> : <ResetPasswordForm invalidLink={query.get('mode') === 'invalid'} />,
)
