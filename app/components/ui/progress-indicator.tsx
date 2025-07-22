interface ProgressIndicatorProps {
  isVisible: boolean;
  message: string;
  progress?: number; // 0-100, if not provided will show indeterminate progress
}

export function ProgressIndicator({
  isVisible,
  message,
  progress,
}: ProgressIndicatorProps) {
  if (!isVisible) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-600">{message}</div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full animate-pulse transition-all duration-300"
          style={{ width: `${progress ?? 100}%` }}
        />
      </div>
    </div>
  );
}
