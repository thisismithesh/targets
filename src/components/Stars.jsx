// Renders a member's earned stars (one ⭐️ per clean sweep).
// Compact by default; shows nothing when count is 0.
export default function Stars({ count = 0, className = '' }) {
  if (!count || count < 1) return null

  // For small counts, show individual stars; for larger, collapse to ⭐️ ×N
  if (count <= 5) {
    return (
      <span className={`inline-flex items-center text-xs leading-none ${className}`} title={`${count} clean sweep${count > 1 ? 's' : ''}`}>
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className="leading-none">⭐️</span>
        ))}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs leading-none ${className}`}
      title={`${count} clean sweeps`}
    >
      <span className="leading-none">⭐️</span>
      <span className="font-semibold text-gray-600">×{count}</span>
    </span>
  )
}
