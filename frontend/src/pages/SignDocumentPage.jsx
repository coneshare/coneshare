import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSignature,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  declineSignerRequest,
  exchangeSignerToken,
  getSignerExecutedDownloadUrl,
  getSignerPdfUrl,
  getSignerSession,
  recordSignerPageView,
  submitSignerFields,
} from '../services/api';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { PdfPage } from '../components/documents/PdfPage';
import { SignatureCapturePad } from '../components/viewer/SignatureCapturePad';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { cn } from '../lib/utils';

function extractFragmentToken() {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  return params.get('token');
}

export function SignDocumentPage() {
  const { requestId } = useParams();
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldValues, setFieldValues] = useState({});
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [scrollEl, setScrollEl] = useState(null);
  const activePageRef = useRef(1);
  const pageDwellRef = useRef(0);
  const fieldRefs = useRef(new Map());

  const pdfUrl = sessionData ? getSignerPdfUrl(requestId) : '';
  const { pdfDoc, numPages, pageDimensions } = usePdfDocument(pdfUrl);

  const initSession = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const fragmentToken = extractFragmentToken();
      if (fragmentToken) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        await exchangeSignerToken(requestId, fragmentToken);
      }
      const res = await getSignerSession(requestId);
      setSessionData(res.data);

      const initial = {};
      for (const f of res.data?.fields || []) {
        if (f.value) {
          initial[f.id] = { value: f.value };
        } else if (f.field_type === 'date') {
          initial[f.id] = { value: new Date().toISOString().slice(0, 10) };
        } else if (f.field_type === 'full_name' && res.data?.signer?.name) {
          initial[f.id] = { value: res.data.signer.name };
        }
      }
      setFieldValues(initial);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail || 'Your signing session is invalid or has expired.'
      );
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  // Pre-sign page dwell tracker
  useEffect(() => {
    if (!sessionData || sessionData.signer?.status === 'signed') return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        pageDwellRef.current += 1;
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      if (pageDwellRef.current > 0) {
        recordSignerPageView(requestId, activePageRef.current, pageDwellRef.current).catch(() => {});
        pageDwellRef.current = 0;
      }
    };
  }, [requestId, sessionData]);

  const signerFields = sessionData?.fields || [];
  const canSign = Boolean(sessionData?.signer?.can_sign);
  const reqStatus = sessionData?.request?.status;

  const incompleteRequired = signerFields.filter((f) => {
    if (!f.is_required) return false;
    const val = fieldValues[f.id];
    if (!val) return true;
    if (['signature', 'initials'].includes(f.field_type)) {
      return !val.signature_data && !val.value;
    }
    return !String(val.value || '').trim();
  });

  const handleJumpNext = () => {
    if (incompleteRequired.length === 0) return;
    const target = incompleteRequired[0];
    setActiveFieldId(target.id);
    const el = fieldRefs.current.get(target.id);
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleApplySignature = (sigPayload) => {
    if (!activeFieldId) return;
    setFieldValues((prev) => ({
      ...prev,
      [activeFieldId]: {
        signature_type: sigPayload.signature_type,
        signature_data: sigPayload.signature_data,
        value: sigPayload.signature_type === 'type' ? sigPayload.signature_data : '',
      },
    }));
    setActiveFieldId(null);
  };

  const handleSubmitAll = async () => {
    if (incompleteRequired.length > 0) {
      toast.error('Please complete all required fields before submitting.');
      handleJumpNext();
      return;
    }
    setSubmitting(true);
    try {
      const payloadFields = signerFields.map((f) => {
        const entry = fieldValues[f.id] || {};
        return {
          field_id: f.id,
          value: entry.value || '',
          signature_type: entry.signature_type || 'draw',
          signature_data: entry.signature_data || '',
        };
      });
      const res = await submitSignerFields(requestId, payloadFields);
      setSessionData(res.data);
      toast.success('Signature submitted successfully.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit signature.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDecline = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await declineSignerRequest(requestId, declineReason);
      setSessionData(res.data);
      setIsDeclining(false);
      toast.success('You have declined this signature request.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Unable to decline request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <p className="text-sm text-muted-foreground">Preparing signing ceremony...</p>
      </div>
    );
  }

  if (errorMsg || !sessionData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center dark:bg-zinc-950">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <h1 className="text-lg font-semibold">Unable to Open Signing Session</h1>
        <p className="max-w-md text-sm text-muted-foreground">{errorMsg}</p>
      </div>
    );
  }

  const activeField = signerFields.find((f) => f.id === activeFieldId);

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 backdrop-blur dark:bg-zinc-900/95">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileSignature className="h-5 w-5 text-indigo-600" />
            <div>
              <h1 className="text-sm font-semibold leading-tight">
                {sessionData.request.title || sessionData.request.document_name}
              </h1>
              <p className="text-xs text-muted-foreground">
                Signing as {sessionData.signer.name || sessionData.signer.email} ({sessionData.signer.status})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {reqStatus === 'completed' && sessionData.download_url ? (
              <Button asChild size="sm">
                <a
                  href={getSignerExecutedDownloadUrl(requestId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  Download Signed PDF
                </a>
              </Button>
            ) : canSign ? (
              <>
                {incompleteRequired.length > 0 && (
                  <Button type="button" size="sm" variant="outline" onClick={handleJumpNext}>
                    <span>Next Field ({incompleteRequired.length} left)</span>
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsDeclining(true)}
                  disabled={submitting}
                >
                  <XCircle className="mr-1 h-4 w-4" />
                  Decline
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSubmitAll}
                  disabled={submitting || incompleteRequired.length > 0}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {submitting ? 'Submitting...' : 'Submit Signature'}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {!canSign && reqStatus !== 'completed' && (
        <div className="border-b bg-amber-50 px-4 py-2.5 text-center text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {sessionData.signer.status === 'signed'
            ? 'You have completed your signature. Waiting for remaining recipients to finish.'
            : reqStatus === 'declined'
              ? 'This signature request was declined.'
              : 'Waiting for the previous signer in the sequential order to complete first.'}
        </div>
      )}

      {reqStatus === 'completed' && (
        <div className="border-b bg-emerald-50 px-4 py-2.5 text-center text-xs font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          All parties have signed and sealed this document.
        </div>
      )}

      <main className="container mx-auto flex-1 p-4">
        <div
          ref={(node) => setScrollEl(node)}
          className="mx-auto max-h-[82vh] max-w-4xl space-y-4 overflow-y-auto"
        >
          {!pdfDoc ? (
            <div className="flex h-96 items-center justify-center rounded-xl border bg-white text-sm text-muted-foreground">
              Loading document...
            </div>
          ) : (
            Array.from({ length: numPages }, (_, idx) => idx + 1).map((pageNum) => {
              const fieldsOnPage = signerFields.filter((f) => f.page_number === pageNum);
              return (
                <div
                  key={pageNum}
                  onMouseEnter={() => {
                    activePageRef.current = pageNum;
                  }}
                  className="relative mx-auto w-fit overflow-hidden rounded-lg border bg-white shadow"
                >
                  <PdfPage
                    pdfDoc={pdfDoc}
                    pageNumber={pageNum}
                    scale={1.1}
                    scrollContainer={scrollEl}
                    dimensions={pageDimensions[pageNum - 1]}
                  />
                  {fieldsOnPage.map((f) => {
                    const currentVal = fieldValues[f.id] || {};
                    const isSig = ['signature', 'initials'].includes(f.field_type);
                    const isFilled = isSig
                      ? Boolean(currentVal.signature_data || currentVal.value)
                      : Boolean(String(currentVal.value || '').trim());

                    return (
                      <div
                        key={f.id}
                        ref={(el) => {
                          if (el) fieldRefs.current.set(f.id, el);
                        }}
                        style={{
                          left: `${f.x}%`,
                          top: `${f.y}%`,
                          width: `${f.width}%`,
                          height: `${f.height}%`,
                        }}
                        onClick={() => {
                          if (!canSign) return;
                          if (isSig) setActiveFieldId(f.id);
                        }}
                        className={cn(
                          'absolute flex items-center justify-center rounded border-2 px-1 text-xs transition-all',
                          isFilled
                            ? 'border-emerald-600 bg-emerald-50/90 text-emerald-950'
                            : 'border-indigo-600 bg-indigo-50/90 text-indigo-950 animate-pulse',
                          canSign && isSig ? 'cursor-pointer hover:bg-indigo-100' : ''
                        )}
                      >
                        {isSig ? (
                          currentVal.signature_type === 'draw' && currentVal.signature_data ? (
                            <img
                              src={currentVal.signature_data}
                              alt="Applied signature"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <span className={cn(isFilled ? 'font-serif italic text-sm' : 'font-semibold')}>
                              {currentVal.signature_data || currentVal.value || `Click to ${f.field_type}`}
                            </span>
                          )
                        ) : canSign ? (
                          <Input
                            value={currentVal.value || ''}
                            onChange={(e) =>
                              setFieldValues((prev) => ({
                                ...prev,
                                [f.id]: { value: e.target.value },
                              }))
                            }
                            placeholder={f.field_type}
                            className="h-full border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
                          />
                        ) : (
                          <span>{currentVal.value || f.field_type}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </main>

      {activeField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold capitalize">
                Apply {activeField.field_type}
              </h2>
              <button
                type="button"
                onClick={() => setActiveFieldId(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <SignatureCapturePad
              initialName={sessionData.signer.name || ''}
              onApply={handleApplySignature}
              submitLabel="Apply to Document"
            />
          </div>
        </div>
      )}

      {isDeclining && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleConfirmDecline}
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900"
          >
            <h2 className="text-base font-semibold">Decline Signature Request</h2>
            <Input
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Optional reason for declining..."
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDeclining(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={submitting}>
                Confirm Decline
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
