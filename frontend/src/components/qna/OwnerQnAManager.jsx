import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Lock, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  createOwnerQnaMessage,
  getOwnerQnaThreads,
  updateOwnerQnaThreadStatus,
} from '../../services/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';

function formatRelativeTime(value) {
  if (!value) return '';
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return '';
  }
}

function senderLabel(message) {
  if (message.sender_type === 'user') return message.sender_name || 'Owner';
  return message.sender_email || 'Viewer';
}

function contextLabel(thread) {
  if (thread.context_name) return thread.context_name;
  if (thread.context_type === 'dataroom') return 'Dataroom';
  return 'Document';
}

export function OwnerQnAManager({ documentId = null, dataroomId = null }) {
  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || threads[0] || null,
    [threads, selectedThreadId]
  );

  const loadThreads = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getOwnerQnaThreads({
        documentId,
        dataroomId,
        status: statusFilter,
      });
      const nextThreads = Array.isArray(response.data) ? response.data : [];
      setThreads(nextThreads);
      setSelectedThreadId((currentId) => (
        currentId && nextThreads.some((thread) => thread.id === currentId)
          ? currentId
          : nextThreads[0]?.id || null
      ));
    } catch (error) {
      console.error('Failed to load Q&A threads:', error);
    } finally {
      setIsLoading(false);
    }
  }, [documentId, dataroomId, statusFilter]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const handleReply = async (event) => {
    event.preventDefault();
    if (!selectedThread || !replyBody.trim()) return;
    setIsSubmittingReply(true);
    try {
      const response = await createOwnerQnaMessage(selectedThread.id, replyBody.trim());
      setThreads((prev) => prev.map((thread) => (
        thread.id === selectedThread.id
          ? {
              ...thread,
              messages: [...(thread.messages || []), response.data],
              updated_at: response.data.created_at,
            }
          : thread
      )));
      setReplyBody('');
      toast.success('Reply sent.');
    } catch (error) {
      console.error('Failed to send Q&A reply:', error);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleStatusChange = async (nextStatus) => {
    if (!selectedThread || selectedThread.status === nextStatus) return;
    try {
      const response = await updateOwnerQnaThreadStatus(selectedThread.id, nextStatus);
      if (statusFilter === 'all' || nextStatus === statusFilter) {
        setThreads((prev) => prev.map((thread) => (
          thread.id === selectedThread.id ? response.data : thread
        )));
      } else {
        setThreads((prev) => prev.filter((thread) => thread.id !== selectedThread.id));
        setSelectedThreadId(null);
      }
      toast.success(nextStatus === 'closed' ? 'Thread closed.' : 'Thread reopened.');
    } catch (error) {
      console.error('Failed to update Q&A thread status:', error);
    }
  };

  const statusFilters = [
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
    { value: 'all', label: 'All' },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Q&amp;A</h2>
          <p className="text-sm text-gray-500">Review viewer questions and respond in context.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-white p-1">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`rounded px-3 py-1 text-sm ${statusFilter === filter.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="icon" onClick={loadThreads} disabled={isLoading} aria-label="Refresh Q&A">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid min-h-[440px] overflow-hidden rounded-md border bg-white md:grid-cols-[280px,1fr]">
        <div className="border-b md:border-b-0 md:border-r">
          {isLoading ? (
            <div className="p-4 text-sm text-gray-500">Loading...</div>
          ) : threads.length === 0 ? (
            <div className="flex h-full min-h-[220px] items-center justify-center p-6 text-center text-sm text-gray-500">
              No Q&amp;A threads found.
            </div>
          ) : (
            <div className="divide-y">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={`block w-full px-4 py-3 text-left hover:bg-gray-50 ${selectedThread?.id === thread.id ? 'bg-gray-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{thread.subject}</span>
                    {thread.status === 'closed' ? <Lock className="h-3.5 w-3.5 text-gray-400" /> : null}
                  </div>
                  <div className="mt-1 truncate text-xs text-gray-500">{contextLabel(thread)}</div>
                  <div className="mt-1 text-xs text-gray-400">
                    {formatRelativeTime(thread.updated_at || thread.created_at)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col">
          {!selectedThread ? (
            <div className="flex min-h-[300px] flex-1 items-center justify-center text-sm text-gray-500">
              <MessageCircle className="mr-2 h-4 w-4" />
              Select a Q&amp;A thread.
            </div>
          ) : (
            <>
              <div className="border-b p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-gray-900">{selectedThread.subject}</h3>
                    <p className="mt-1 text-sm text-gray-500">{contextLabel(selectedThread)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={selectedThread.status === 'closed' ? 'border-gray-300 text-gray-600' : 'border-emerald-200 text-emerald-700'}>
                      {selectedThread.status === 'closed' ? 'Closed' : 'Open'}
                    </Badge>
                    {selectedThread.status === 'closed' ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => handleStatusChange('open')}>
                        Reopen
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => handleStatusChange('closed')}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Close
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {(selectedThread.messages || []).map((message) => (
                  <article key={message.id} className="rounded-md border bg-white p-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                      <span className="truncate font-medium text-gray-700">{senderLabel(message)}</span>
                      <span className="shrink-0">{formatRelativeTime(message.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{message.body}</p>
                  </article>
                ))}
              </div>

              <form className="flex gap-2 border-t p-4" onSubmit={handleReply}>
                <Textarea
                  aria-label="Owner Q&A reply"
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder="Reply to this thread"
                  disabled={isSubmittingReply}
                  className="min-h-[52px]"
                />
                <Button type="submit" size="icon" disabled={!replyBody.trim() || isSubmittingReply} aria-label="Send owner Q&A reply">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
