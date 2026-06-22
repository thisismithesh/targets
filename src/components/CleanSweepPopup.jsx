import { useEffect } from 'react'

// Animated celebration shown when a member completes every task in a week.
export default function CleanSweepPopup({ onClose }) {
  // Auto-dismiss after a few seconds
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 sweep-overlay"
      onClick={onClose}
    >
      <div
        className="sweep-card bg-white rounded-2xl shadow-2xl px-10 py-8 text-center max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sweep-star text-6xl mb-2">⭐️</div>
        <h2 className="text-2xl font-bold text-gray-900">That's a clean sweep!</h2>
        <p className="text-lg text-gray-700 mt-1">Congratulations!</p>
        <p className="sweep-plus text-xl font-bold text-yellow-500 mt-3">⭐️ +1</p>
      </div>
    </div>
  )
}
