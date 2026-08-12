import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Lock, MessageCircle, Plus, RefreshCw, Send, X } from 'lucide-react';
import { formatRelativeTime } from '../../utils/formatters';
import { toast } from 'sonner';
import {
  createOwnerQnaMessage,
  createOwnerQnaThread,
  getOwnerQnaThreads,
  updateOwnerQnaThreadStatus,
} from '../../services/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';


function senderLabel(message) {
  if (message.sender_type === 'user') return message.sender_name || 'Owner';
  return message.sender_email || 'Viewer';
}

function contextLabel(thread, t) {
  if (thread.context_name) return thread.context_name;
  if (thread.context_type === 'dataroom') return t ? t('datarooms.title') : 'Dataroom';
  return t ? t('analytics.document') : 'Document';
}

function shareLinkLabel(link, index) {
  return link.name || link.slug || `Share link ${index + 1}`;
}

const EMPTY_SHARE_LINKS = [];

export function OwnerQnAManager({ documentId = null, dataroomId = null, shareLinks = EMPTY_SHARE_LINKS }) {
  const { t } = useTranslation();
  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [selectedShareLinkId, setSelectedShareLinkId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const loadRequestIdRef = useRef(0);

  const availableShareLinks = useMemo(() => (
    Array.isArray(shareLinks) ? shareLinks.filter((link) => link?.id) : []
  ), [shareLinks]);

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    return threads.find((thread) => thread.id === selectedThreadId) || null;
  }, [threads, selectedThreadId]);
  const isSelectedThreadClosed = selectedThread?.status === 'closed';

  const loadThreads = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setIsLoading(true);
    try {
      const response = await getOwnerQnaThreads({
        documentId,
        dataroomId,
        status: statusFilter,
      });
      if (requestId !== loadRequestIdRef.current) return;
      const nextThreads = Array.isArray(response.data) ? response.data : [];
      setThreads(nextThreads);
      setSelectedThreadId((currentId) => (
        currentId && nextThreads.some((thread) => thread.id === currentId)
          ? currentId
          : nextThreads[0]?.id || null
      ));
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error('Failed to load Q&A threads:', error);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [documentId, dataroomId, statusFilter]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    setThreads([]);
    setSelectedThreadId(null);
    setReplyBody('');
    setNewSubject('');
    setNewBody('');
    setIsCreateOpen(false);
  }, [documentId, dataroomId]);

  useEffect(() => {
    setSelectedShareLinkId((currentId) => (
      currentId && availableShareLinks.some((link) => link.id === currentId)
        ? currentId
        : availableShareLinks[0]?.id || ''
    ));
  }, [availableShareLinks]);

  const handleCreateThread = async (event) => {
    event.preventDefault();
    if (!selectedShareLinkId || !newSubject.trim() || !newBody.trim()) return;
    setIsCreatingThread(true);
    try {
      const response = await createOwnerQnaThread({
        shareLinkId: selectedShareLinkId,
        subject: newSubject.trim(),
        body: newBody.trim(),
      });
      const createdThread = response.data;
      setThreads((prev) => (
        statusFilter === 'closed'
          ? [createdThread]
          : [createdThread, ...prev.filter((thread) => thread.id !== createdThread.id)]
      ));
      setSelectedThreadId(createdThread.id);
      if (statusFilter === 'closed') setStatusFilter('open');
      setNewSubject('');
      setNewBody('');
      setIsCreateOpen(false);
      toast.success('Q&A thread started.');
    } catch (error) {
      console.error('Failed to start Q&A thread:', error);
    } finally {
      setIsCreatingThread(false);
    }
  };

  const handleReply = async (event) => {
    event.preventDefault();
    if (!selectedThread || isSelectedThreadClosed || !replyBody.trim()) return;
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
      if (nextStatus === 'closed') setReplyBody('');
      toast.success(nextStatus === 'closed' ? 'Thread closed.' : 'Thread reopened.');
    } catch (error) {
      console.error('Failed to update Q&A thread status:', error);
    }
  };

  const statusFilters = [
    { value: 'open', label: t('qna.open') },
    { value: 'closed', label: t('qna.closed') },
    { value: 'all', label: t('qna.all') },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('qna.title')}</h2>
          <p className="text-sm text-gray-500">{t('qna.subtitle')}</p>
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
          <Button
            type="button"
            variant={isCreateOpen ? 'outline' : 'default'}
            size="sm"
            onClick={() => setIsCreateOpen((value) => !value)}
            aria-expanded={isCreateOpen}
            aria-controls="owner-qna-create-form"
          >
            {isCreateOpen ? (
              <>
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                {t('qna.startQna')}
              </>
            )}
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={loadThreads} disabled={isLoading} aria-label={t('qna.refreshQna')}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isCreateOpen ? (
        <form id="owner-qna-create-form" className="space-y-3 rounded-md border bg-white p-4" onSubmit={handleCreateThread}>
          <div className="grid gap-3 md:grid-cols-[220px,1fr]">
            <div>
              <label htmlFor="owner-qna-share-link" className="mb-1 block text-xs font-medium text-gray-600">
                {t('qna.shareLink')}
              </label>
              <Select
                id="owner-qna-share-link"
                aria-label="Owner Q&A share link"
                value={selectedShareLinkId}
                onChange={(event) => setSelectedShareLinkId(event.target.value)}
                disabled={availableShareLinks.length === 0 || isCreatingThread}
              >
                {availableShareLinks.length === 0 ? (
                  <option value="">{t('qna.noShareLinks')}</option>
                ) : (
                  availableShareLinks.map((link, index) => (
                    <option key={link.id} value={link.id}>
                      {shareLinkLabel(link, index)}
                    </option>
                  ))
                )}
              </Select>
            </div>
            <div>
              <label htmlFor="owner-qna-subject" className="mb-1 block text-xs font-medium text-gray-600">
                {t('qna.subject')}
              </label>
              <Input
                id="owner-qna-subject"
                aria-label="Owner Q&A subject"
                value={newSubject}
                onChange={(event) => setNewSubject(event.target.value)}
                placeholder={t('qna.startThreadPlaceholder')}
                disabled={availableShareLinks.length === 0 || isCreatingThread}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Textarea
              aria-label="Owner Q&A first message"
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              placeholder={
                availableShareLinks.length === 0
                  ? t('qna.createLinkBeforeQna')
                  : t('qna.writeFirstMessage')
              }
              disabled={availableShareLinks.length === 0 || isCreatingThread}
              className="min-h-[64px]"
            />
            <Button
              type="submit"
              disabled={!selectedShareLinkId || !newSubject.trim() || !newBody.trim() || isCreatingThread}
              className="self-end"
            >
              {t('qna.startQna')}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="grid min-h-[440px] overflow-hidden rounded-md border bg-white md:grid-cols-[280px,1fr]">
        <div className="border-b md:border-b-0 md:border-r">
          {isLoading ? (
            <div className="p-4 text-sm text-gray-500">{t('qna.loading')}</div>
          ) : threads.length === 0 ? (
            <div className="flex h-full min-h-[220px] items-center justify-center p-6 text-center text-sm text-gray-500">
              {t('qna.noThreadsFound')}
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
                  <div className="mt-1 truncate text-xs text-gray-500">{contextLabel(thread, t)}</div>
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
              {t('qna.selectThread')}
            </div>
          ) : (
            <>
              <div className="border-b p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-gray-900">{selectedThread.subject}</h3>
                    <p className="mt-1 text-sm text-gray-500">{contextLabel(selectedThread, t)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={selectedThread.status === 'closed' ? 'border-gray-300 text-gray-600' : 'border-emerald-200 text-emerald-700'}>
                      {selectedThread.status === 'closed' ? t('qna.closed') : t('qna.open')}
                    </Badge>
                    {selectedThread.status === 'closed' ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => handleStatusChange('open')}>
                        {t('qna.reopen')}
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => handleStatusChange('closed')}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {t('qna.close')}
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
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800 [overflow-wrap:anywhere]">{message.body}</p>
                  </article>
                ))}
              </div>

              <form className="flex gap-2 border-t p-4" onSubmit={handleReply}>
                <Textarea
                  aria-label="Owner Q&A reply"
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder={isSelectedThreadClosed ? t('qna.reopenToReply') : t('qna.replyPlaceholder')}
                  disabled={isSubmittingReply || isSelectedThreadClosed}
                  className="min-h-[52px]"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!replyBody.trim() || isSubmittingReply || isSelectedThreadClosed}
                  aria-label="Send owner Q&A reply"
                >
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
