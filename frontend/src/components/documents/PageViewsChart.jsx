import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function PageViewsChart({ pageViews }) {
  if (!pageViews || pageViews.length === 0) {
    return <p className="text-sm text-gray-500">No detailed page view data available.</p>;
  }

  // Aggregate views by page_number to prevent duplicate key warnings
  const uniquePageViews = Object.values(
    pageViews.reduce((acc, { page_number, duration_seconds, url }) => {
      if (!acc[page_number]) {
        acc[page_number] = { page_number, url, duration_seconds: 0 };
      }
      acc[page_number].duration_seconds += duration_seconds;
      return acc;
    }, {})
  );  

  const maxDuration = Math.max(...uniquePageViews.map((v) => v.duration_seconds), 0);
  const totalDuration = uniquePageViews.reduce((sum, v) => sum + v.duration_seconds, 0);

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">
          Total time spent: {formatDuration(totalDuration)}
        </p>
        <div className="space-y-1">
          {uniquePageViews
            .sort((a, b) => a.page_number - b.page_number)
            .map((view) => (
              <div key={view.page_number} className="flex items-center gap-4 text-sm">
                <span className="w-16 flex-shrink-0 text-right text-gray-500">
                  Page {view.page_number}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="h-4 flex-grow cursor-pointer rounded bg-gray-200">
                      <div
                        className="h-4 rounded bg-blue-500"
                        style={{
                          width: maxDuration > 0 ? `${(view.duration_seconds / maxDuration) * 100}%` : '0%',
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  {view.url && (
                    <TooltipContent>
                      <img
                        src={view.url}
                        alt={`Page ${view.page_number} preview`}
                        className="h-48 w-auto rounded"
                      />
                    </TooltipContent>
                  )}
                </Tooltip>
                <span className="w-16 flex-shrink-0 text-left font-medium text-gray-800">
                  {formatDuration(view.duration_seconds)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
