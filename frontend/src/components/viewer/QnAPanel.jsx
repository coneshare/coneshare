import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Lock, MessageCircle, Send, X } from 'lucide-react';
import { formatRelativeTime } from '../../utils/formatters';
import { toast } from 'sonner';
import {
  createPublicQnaMessage,
  createPublicQnaThread,
  getPublicQnaThreads,
} from '../../services/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';

function messageSenderLabel(message) {
  if (message.sender_type === 'user') return message.sender_name || 'Owner';
  return message.sender_email || 'Viewer';
}

export function QnAPanel({
  open,
  onOpenChange,
  slug,
  viewId,
  dataroomDocumentId = null,
  dataroomFolderId = null,
  contextLabel = 'Q&A',
  onThreadCountChange,
}) {
  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingThread, setIsSubmittingThread] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [subject, setSubject] = useState('');
  const [newThreadBody, setNewThreadBody] = useState('');
  const [replyBody, setReplyBody] = useState('');

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || threads[0] || null,
    [threads, selectedThreadId]
  );

  const loadThreads = useCallback(async () => {
    if (!open || !slug || !viewId) return;
    setIsLoading(true);
    try {
      const response = await getPublicQnaThreads(slug, {
        viewSessionId: viewId,
        dataroomDocumentId,
        dataroomFolderId,
      });
      const nextThreads = Array.isArray(response.data) ? response.data : [];
      setThreads(nextThreads);
      onThreadCountChange?.(nextThreads.length);
      setSelectedThreadId((currentId) => {
        if (currentId && nextThreads.some((thread) => thread.id === currentId)) return currentId;
        return nextThreads[0]?.id || null;
      });
    } catch (error) {
      console.error('Failed to load Q&A threads:', error);
    } finally {
      setIsLoading(false);
    }
  }, [open, slug, viewId, dataroomDocumentId, dataroomFolderId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const resetComposer = () => {
    setSubject('');
    setNewThreadBody('');
  };

  const handleCreateThread = async (event) => {
    event.preventDefault();
    if (!viewId || !subject.trim() || !newThreadBody.trim()) return;
    setIsSubmittingThread(true);
    try {
      const response = await createPublicQnaThread(slug, {
        viewSessionId: viewId,
        subject: subject.trim(),
        body: newThreadBody.trim(),
        dataroomDocumentId,
        dataroomFolderId,
      });
      setThreads((prev) => {
        const nextThreads = [response.data, ...prev];
        onThreadCountChange?.(nextThreads.length);
        return nextThreads;
      });
      setSelectedThreadId(response.data.id);
      resetComposer();
      toast.success('Question sent.');
    } catch (error) {
      console.error('Failed to create Q&A thread:', error);
    } finally {
      setIsSubmittingThread(false);
    }
  };

  const handleReply = async (event) => {
    event.preventDefault();
    if (!viewId || !selectedThread || !replyBody.trim() || selectedThread.status === 'closed') return;
    setIsSubmittingReply(true);
    try {
      const response = await createPublicQnaMessage(slug, selectedThread.id, {
        viewSessionId: viewId,
        body: replyBody.trim(),
      });
      setThreads((prev) => prev.map((thread) => (
        thread.id === selectedThread.id
          ? { ...thread, messages: [...(thread.messages || []), response.data], updated_at: response.data.created_at }
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

  const isClosed = selectedThread?.status === 'closed';

  if (!open) return null;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l bg-white shadow-xl sm:max-w-xl lg:w-[34rem] lg:max-w-none xl:w-[38rem]"
      aria-label="Q&A panel"
    >
      <header className="border-b px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <MessageCircle className="h-5 w-5" />
              Q&A
            </h2>
            <p className="truncate text-sm text-gray-500">{contextLabel}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close Q&A"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[auto,1fr,auto]">
          <section className="border-b p-4">
            <form className="space-y-3" onSubmit={handleCreateThread}>
              <Input
                aria-label="Question subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
                disabled={!viewId || isSubmittingThread}
              />
              <Textarea
                aria-label="Question message"
                value={newThreadBody}
                onChange={(event) => setNewThreadBody(event.target.value)}
                placeholder="Ask a question"
                disabled={!viewId || isSubmittingThread}
                className="min-h-[92px]"
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={!viewId || !subject.trim() || !newThreadBody.trim() || isSubmittingThread}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {isSubmittingThread ? 'Sending...' : 'Ask'}
                </Button>
              </div>
            </form>
          </section>

          <section className="grid min-h-0 grid-cols-1 border-b md:grid-cols-[190px,1fr]">
            <div className="max-h-56 overflow-y-auto border-b md:max-h-none md:border-b-0 md:border-r">
              {isLoading ? (
                <div className="p-4 text-sm text-gray-500">Loading...</div>
              ) : threads.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">No questions yet.</div>
              ) : (
                <div className="divide-y">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={`block w-full px-4 py-3 text-left text-sm hover:bg-gray-50 ${selectedThread?.id === thread.id ? 'bg-gray-50' : ''}`}
                    >
                      <div className="truncate font-medium text-gray-900">{thread.subject}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <span>{formatRelativeTime(thread.updated_at || thread.created_at)}</span>
                        {thread.status === 'closed' && <Lock className="h-3 w-3" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto p-4">
              {!selectedThread ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  Select a question to view its history.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="truncate text-sm font-semibold text-gray-900">{selectedThread.subject}</h3>
                    <Badge className={isClosed ? 'border-gray-300 text-gray-600' : 'border-emerald-200 text-emerald-700'}>
                      {isClosed ? 'Closed' : 'Open'}
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {(selectedThread.messages || []).map((message) => (
                      <article key={message.id} className="rounded-md border bg-white p-3">
                        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                          <span className="truncate font-medium text-gray-700">{messageSenderLabel(message)}</span>
                          <span className="shrink-0">{formatRelativeTime(message.created_at)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800 [overflow-wrap:anywhere]">{message.body}</p>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="p-4">
            {isClosed ? (
              <div className="flex items-center gap-2 rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
                <CheckCircle2 className="h-4 w-4" />
                This thread is closed.
              </div>
            ) : (
              <form className="flex gap-2" onSubmit={handleReply}>
                <Textarea
                  aria-label="Reply message"
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder={selectedThread ? 'Reply' : 'Select a question to reply'}
                  disabled={!selectedThread || !viewId || isSubmittingReply}
                  className="min-h-[44px]"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!selectedThread || !replyBody.trim() || isSubmittingReply}
                  aria-label="Send reply"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            )}
          </section>
      </div>
    </aside>
  );
}
