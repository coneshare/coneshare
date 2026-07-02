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

export function PageViewsChart({ pageViews, documentType }) {
  if (!pageViews || pageViews.length === 0) {
    return <p className="text-sm text-gray-500">No detailed page view data available.</p>;
  }

  const isVideo = documentType === 'video' || pageViews[0]?.media_type === 'video';

  if (isVideo) {
    const formatTime = (timeInSecs) => {
      if (timeInSecs == null) return "00:00";
      const m = Math.floor(timeInSecs / 60);
      const s = Math.floor(timeInSecs % 60);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const formatDate = (dateStr) => {
      const d = new Date(dateStr);
      return d.toLocaleString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    };

    const totalVideoDuration = pageViews.reduce((sum, v) => sum + v.duration_seconds, 0);

    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">
          Total time watched: {formatDuration(totalVideoDuration)}
        </p>
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full divide-y divide-gray-200 text-xs text-gray-700">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase font-semibold text-[10px] tracking-wider">
                <th className="px-3 py-2 text-left">Event Time</th>
                <th className="px-3 py-2 text-left">Playback Timespan</th>
                <th className="px-3 py-2 text-right">Duration</th>
                <th className="px-3 py-2 text-center">Audio</th>
                <th className="px-3 py-2 text-center">Screen</th>
                <th className="px-3 py-2 text-center">Speed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {pageViews.map((view, idx) => (
                <tr key={view.id || idx} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(view.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono">
                    {formatTime(view.video_start_time)} - {formatTime(view.video_end_time)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-medium">
                    {view.duration_seconds}s
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-center">
                    {view.video_volume === 0 ? (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-red-700 font-medium">Muted</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-green-700 font-medium">
                        {view.video_volume != null ? `${view.video_volume}%` : 'Sound On'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-center">
                    {view.is_fullscreen ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 font-medium">Fullscreen</span>
                    ) : (
                      <span className="text-gray-400">Standard</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-center font-mono">
                    {view.playback_speed ? `${view.playback_speed}x` : '1.0x'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Aggregate views by page_number to prevent duplicate key warnings
  const uniquePageViews = Object.values(
    pageViews.reduce((acc, { page_number, duration_seconds, url }) => {
      if (acc[page_number]) {
        acc[page_number].duration_seconds += duration_seconds;
        // Prefer a valid URL if the existing one is missing.
        if (!acc[page_number].url && url) {
          acc[page_number].url = url;
        }
      } else {
        acc[page_number] = { page_number, url, duration_seconds };
      }
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
