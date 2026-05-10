import { Button } from '../ui/Button';

function fmt(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export function DeliveryLogsTable({ deliveries, onReplay, replayingId = null }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="px-3 py-2">Event</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Attempts</th>
            <th className="px-3 py-2">Response</th>
            <th className="px-3 py-2">Next Retry</th>
            <th className="px-3 py-2">Delivered</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-center text-gray-500">
                No delivery logs yet.
              </td>
            </tr>
          )}
          {deliveries.map((delivery) => (
            <tr key={delivery.id} className="border-t">
              <td className="px-3 py-2">{delivery.event_type}</td>
              <td className="px-3 py-2">{delivery.status}</td>
              <td className="px-3 py-2">{delivery.attempt_count}</td>
              <td className="max-w-xl px-3 py-2 align-top">
                {delivery.response_body_excerpt ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-gray-600">View response</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border bg-gray-50 p-2 text-xs">
                      {delivery.response_body_excerpt}
                    </pre>
                  </details>
                ) : (
                  '-'
                )}
              </td>
              <td className="px-3 py-2">{fmt(delivery.next_retry_at)}</td>
              <td className="px-3 py-2">{fmt(delivery.delivered_at)}</td>
              <td className="px-3 py-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReplay(delivery.id)}
                  disabled={replayingId === delivery.id}
                >
                  {replayingId === delivery.id ? 'Replaying...' : 'Replay'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
