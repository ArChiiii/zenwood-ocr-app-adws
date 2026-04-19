interface LoadingSpinnerProps {
  label?: string
}

export function LoadingSpinner({ label = 'Processing...' }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-3 text-sm text-gray-600">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      <span>{label}</span>
    </div>
  )
}
