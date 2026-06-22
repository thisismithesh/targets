import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { session } = useAuth()

  // Still loading session from Supabase — render nothing to avoid flash
  if (session === undefined) {
    return <div className="text-center py-16 text-gray-400">Loading...</div>
  }

  // No session → hard redirect to login, no way around it
  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}
