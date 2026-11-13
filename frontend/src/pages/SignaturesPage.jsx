import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  FileSignature,
  Plus,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createSignatureRequest,
  deleteSignatureRequest,
  getDatarooms,
  getDocumentPreviewData,
  getDocuments,
  getSignaturePageViews,
  getSignatureRequest,
  getSignatureRequestDownloadUrl,
  getSignatureSigningLinks,
  sendSignatureRequest,
  listSignatureRequests,
  voidSignatureRequest,
} from '../services/api';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { PdfPage } from '../components/documents/PdfPage';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { cn } from '../lib/utils';

const STATUS_BADGES = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-200',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  declined: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  voided: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
};

const FIELD_TYPES = [
  { value: 'signature', label: 'Signature', width: 28, height: 8 },
  { value: 'initials', label: 'Initials', width: 14, height: 6 },
  { value: 'date', label: 'Date Signed', width: 20, height: 5 },
  { value: 'full_name', label: 'Full Name', width: 24, height: 5 },
  { value: 'text', label: 'Text', width: 24, height: 5 },
];

function clampFieldBox(x, y, width, height) {
  const safeW = Math.max(4, Math.min(80, Number(width) || 24));
  const safeH = Math.max(3, Math.min(40, Number(height) || 7));
  const safeX = Math.max(0, Math.min(100 - safeW, Number(x) || 0));
  const safeY = Math.max(0, Math.min(100 - safeH, Number(y) || 0));
  return {
    x: Math.round(safeX * 100) / 100,
    y: Math.round(safeY * 100) / 100,
    width: Math.round(safeW * 100) / 100,
    height: Math.round(safeH * 100) / 100,
  };
}

export function SignaturesPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [signingLinks, setSigningLinks] = useState([]);
  const [pageViews, setPageViews] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  // Draft creation form state
  const [pdfDocs, setPdfDocs] = useState([]);
  const [datarooms, setDatarooms] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [selectedDataroomId, setSelectedDataroomId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [signingOrder, setSigningOrder] = useState('parallel');
  const [signers, setSigners] = useState([
    { name: '', email: '', role: 'Signer', order_index: 1 },
  ]);
  const [fields, setFields] = useState([]);
  const [activeSignerIndex, setActiveSignerIndex] = useState(0);
  const [activeFieldType, setActiveFieldType] = useState('signature');
  const [previewUrl, setPreviewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const scrollContainerRef = useRef(null);
  const [scrollEl, setScrollEl] = useState(null);
  const { pdfDoc, numPages, pageDimensions } = usePdfDocument(previewUrl);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSignatureRequests();
      const rows = res.data?.results || res.data || [];
      setRequests(rows);
      if (rows.length > 0 && !selectedId) {
        setSelectedId(rows[0].id);
      }
    } catch (err) {
      console.error('Failed to load signature requests:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      const [reqRes, pvRes] = await Promise.all([
        getSignatureRequest(id),
        getSignaturePageViews(id).catch(() => ({ data: { results: [] } })),
      ]);
      setDetail(reqRes.data);
      setPageViews(pvRes.data?.results || []);
      if (['sent', 'in_progress', 'completed'].includes(reqRes.data?.status)) {
        const linkRes = await getSignatureSigningLinks(id).catch(() => ({ data: { results: [] } }));
        setSigningLinks(linkRes.data?.results || []);
      } else {
        setSigningLinks([]);
      }
    } catch (err) {
      console.error('Failed to load signature detail:', err);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!isCreating && selectedId) {
      loadDetail(selectedId);
    }
  }, [isCreating, selectedId, loadDetail]);

  const openCreator = async () => {
    setIsCreating(true);
    setFields([]);
    setSigners([{ name: '', email: '', role: 'Signer', order_index: 1 }]);
    setActiveSignerIndex(0);
    setTitle('');
    setMessage('');
    setSelectedDocId('');
    setSelectedDataroomId('');
    setPreviewUrl('');
    try {
      const [docsRes, roomsRes] = await Promise.all([
        getDocuments({ limit: 100 }),
        getDatarooms().catch(() => ({ data: [] })),
      ]);
      const docs = (docsRes.data?.results || docsRes.data || []).filter(
        (d) => d.type === 'pdf' && d.status === 'ready'
      );
      setPdfDocs(docs);
      setDatarooms(roomsRes.data?.results || roomsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch documents for eSign:', err);
    }
  };

  useEffect(() => {
    if (!selectedDocId) {
      setPreviewUrl('');
      return;
    }
    let cancelled = false;
    getDocumentPreviewData(selectedDocId)
      .then((res) => {
        if (cancelled) return;
        const url = res.data?.pdf_preview_url || res.data?.download_url || '';
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDocId]);

  const handleSelectDoc = (docId) => {
    setSelectedDocId(docId);
    setFields([]);
    const match = pdfDocs.find((d) => d.id === docId);
    if (match && !title.trim()) {
      setTitle(match.name.replace(/\.pdf$/i, ''));
    }
  };

  const handlePageClick = (pageNumber, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
    const rawY = ((event.clientY - rect.top) / rect.height) * 100;
    const preset = FIELD_TYPES.find((f) => f.value === activeFieldType) || FIELD_TYPES[0];
    const box = clampFieldBox(rawX - preset.width / 2, rawY - preset.height / 2, preset.width, preset.height);
    setFields((prev) => [
      ...prev,
      {
        localId: `${Date.now()}-${Math.random()}`,
        signer_index: activeSignerIndex,
        field_type: activeFieldType,
        page_number: pageNumber,
        ...box,
      },
    ]);
  };

  const updateFieldCoord = (index, key, val) => {
    setFields((prev) =>
      prev.map((f, idx) => {
        if (idx !== index) return f;
        const next = { ...f, [key]: Number(val) };
        return { ...next, ...clampFieldBox(next.x, next.y, next.width, next.height) };
      })
    );
  };

  const handleAddSigner = () => {
    setSigners((prev) => [
      ...prev,
      { name: '', email: '', role: 'Signer', order_index: prev.length + 1 },
    ]);
  };

  const handleCreateDraft = async (e) => {
    e.preventDefault();
    if (!selectedDocId) {
      toast.error('Please select a PDF document.');
      return;
    }
    const cleanSigners = signers.map((s, idx) => ({
      name: s.name.trim(),
      email: s.email.trim(),
      role: (s.role || 'Signer').trim(),
      order_index: Number(s.order_index) || idx + 1,
    }));
    if (cleanSigners.some((s) => !s.email)) {
      toast.error('Every signer must have a valid email address.');
      return;
    }
    if (fields.length === 0) {
      toast.error('Click anywhere on the PDF preview to place at least one field.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createSignatureRequest({
        document: selectedDocId,
        dataroom: selectedDataroomId || null,
        title: title.trim() || 'Signature Request',
        message: message.trim(),
        signing_order: signingOrder,
        signers: cleanSigners,
        fields: fields.map((f) => ({
          signer_index: f.signer_index,
          field_type: f.field_type,
          page_number: f.page_number,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          is_required: true,
        })),
      });
      toast.success('Signature request draft created.');
      setIsCreating(false);
      await loadList();
      setSelectedId(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create signature request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSend = async (id) => {
    try {
      await sendSignatureRequest(id);
      toast.success('Invitations dispatched.');
      await loadList();
      await loadDetail(id);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.fields || 'Unable to send request.');
    }
  };

  const handleVoid = async (id) => {
    try {
      await voidSignatureRequest(id, 'Voided by owner');
      toast.success('Signature request voided.');
      await loadList();
      await loadDetail(id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Unable to void request.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteSignatureRequest(id);
      toast.success('Draft deleted.');
      setSelectedId(null);
      setDetail(null);
      await loadList();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Only draft or voided requests can be deleted.');
    }
  };

  const copySigningUrl = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Signing link copied.');
    } catch {
      toast.error('Clipboard copy unavailable.');
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileSignature className="h-6 w-6 text-indigo-600" />
            <span>eSignatures</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Prepare agreements, place signature fields, and track execution audit trails.
          </p>
        </div>
        <Button onClick={isCreating ? () => setIsCreating(false) : openCreator}>
          <Plus className="mr-1.5 h-4 w-4" />
          <span>{isCreating ? 'Back to Requests' : 'New Signature Request'}</span>
        </Button>
      </div>

      {isCreating ? (
        <form onSubmit={handleCreateDraft} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-5 rounded-xl border bg-card p-5 lg:col-span-5">
            <h2 className="text-base font-semibold">1. Agreement & Recipients</h2>

            <div className="space-y-1.5">
              <Label htmlFor="esign-doc">PDF Document *</Label>
              <select
                id="esign-doc"
                value={selectedDocId}
                onChange={(e) => handleSelectDoc(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">Select a ready PDF...</option>
                {pdfDocs.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="esign-title">Request Title</Label>
                <Input
                  id="esign-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Series A SAFE"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="esign-order">Signing Order</Label>
                <select
                  id="esign-order"
                  value={signingOrder}
                  onChange={(e) => setSigningOrder(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="parallel">Parallel (All at once)</option>
                  <option value="sequential">Sequential (Ordered)</option>
                </select>
              </div>
            </div>

            {datarooms.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="esign-dataroom">Deposit Signed Copy to Dataroom (Optional)</Label>
                <select
                  id="esign-dataroom"
                  value={selectedDataroomId}
                  onChange={(e) => setSelectedDataroomId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">None (Document library only)</option>
                  {datarooms.map((dr) => (
                    <option key={dr.id} value={dr.id}>
                      {dr.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Signers</Label>
                <Button type="button" size="sm" variant="outline" onClick={handleAddSigner}>
                  Add Signer
                </Button>
              </div>
              <div className="space-y-2">
                {signers.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 rounded-lg border p-2.5">
                    <Input
                      className="col-span-4"
                      placeholder="Name"
                      value={s.name}
                      onChange={(e) =>
                        setSigners((prev) =>
                          prev.map((row, rIdx) => (rIdx === idx ? { ...row, name: e.target.value } : row))
                        )
                      }
                    />
                    <Input
                      className="col-span-5"
                      type="email"
                      required
                      placeholder="email@company.com"
                      value={s.email}
                      onChange={(e) =>
                        setSigners((prev) =>
                          prev.map((row, rIdx) => (rIdx === idx ? { ...row, email: e.target.value } : row))
                        )
                      }
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      min={1}
                      max={20}
                      title="Order"
                      value={s.order_index}
                      onChange={(e) =>
                        setSigners((prev) =>
                          prev.map((row, rIdx) =>
                            rIdx === idx ? { ...row, order_index: Number(e.target.value) } : row
                          )
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="col-span-1"
                      disabled={signers.length <= 1}
                      onClick={() => {
                        setSigners((prev) => prev.filter((_, rIdx) => rIdx !== idx));
                        setFields((prev) => prev.filter((f) => f.signer_index !== idx));
                        setActiveSignerIndex(0);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Placement Tool (Click PDF page to drop)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={activeSignerIndex}
                  onChange={(e) => setActiveSignerIndex(Number(e.target.value))}
                  className="flex h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {signers.map((s, idx) => (
                    <option key={idx} value={idx}>
                      {s.name || s.email || `Signer ${idx + 1}`}
                    </option>
                  ))}
                </select>
                <select
                  value={activeFieldType}
                  onChange={(e) => setActiveFieldType(e.target.value)}
                  className="flex h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {FIELD_TYPES.map((ft) => (
                    <option key={ft.value} value={ft.value}>
                      {ft.label}
                    </option>
                  ))}
                </select>
              </div>
              {fields.length > 0 && (
                <div className="max-h-40 space-y-1.5 overflow-y-auto pt-1">
                  {fields.map((f, idx) => (
                    <div key={f.localId} className="flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-xs">
                      <span className="font-medium">
                        P{f.page_number} · {f.field_type}
                      </span>
                      <span className="text-muted-foreground">
                        (S{f.signer_index + 1})
                      </span>
                      <Input
                        type="number"
                        step="0.5"
                        value={f.x}
                        onChange={(e) => updateFieldCoord(idx, 'x', e.target.value)}
                        className="h-6 w-14 px-1 text-[11px]"
                        title="X %"
                      />
                      <Input
                        type="number"
                        step="0.5"
                        value={f.y}
                        onChange={(e) => updateFieldCoord(idx, 'y', e.target.value)}
                        className="h-6 w-14 px-1 text-[11px]"
                        title="Y %"
                      />
                      <button
                        type="button"
                        onClick={() => setFields((prev) => prev.filter((_, i) => i !== idx))}
                        className="ml-auto text-rose-500 hover:text-rose-700"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="esign-msg">Email Message (Optional)</Label>
              <Input
                id="esign-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Please review and sign."
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating Draft...' : 'Save Draft Request'}
            </Button>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4 lg:col-span-7">
            <h2 className="mb-3 text-base font-semibold">2. Click on PDF to Place Fields</h2>
            {!selectedDocId ? (
              <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
                Select a PDF document on the left to preview pages and place fields.
              </div>
            ) : !pdfDoc ? (
              <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
                Loading PDF pages...
              </div>
            ) : (
              <div
                ref={(node) => {
                  scrollContainerRef.current = node;
                  setScrollEl(node);
                }}
                className="max-h-[75vh] space-y-4 overflow-y-auto pr-2"
              >
                {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
                  const pageFields = fields.filter((f) => f.page_number === pageNum);
                  return (
                    <div
                      key={pageNum}
                      onClick={(e) => handlePageClick(pageNum, e)}
                      className="relative mx-auto w-fit cursor-crosshair overflow-hidden rounded border bg-white shadow-sm"
                    >
                      <PdfPage
                        pdfDoc={pdfDoc}
                        pageNumber={pageNum}
                        scale={1.0}
                        scrollContainer={scrollEl}
                        dimensions={pageDimensions[pageNum - 1]}
                      />
                      {pageFields.map((pf) => (
                        <div
                          key={pf.localId}
                          style={{
                            left: `${pf.x}%`,
                            top: `${pf.y}%`,
                            width: `${pf.width}%`,
                            height: `${pf.height}%`,
                          }}
                          className="pointer-events-none absolute flex items-center justify-center rounded border-2 border-indigo-600 bg-indigo-500/20 text-[10px] font-semibold text-indigo-950"
                        >
                          {pf.field_type} (S{pf.signer_index + 1})
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-2 rounded-xl border bg-card p-3 lg:col-span-5">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading requests...</p>
            ) : requests.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No signature requests yet. Create one to get started.
              </div>
            ) : (
              requests.map((req) => (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => setSelectedId(req.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                    selectedId === req.id
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20'
                      : 'hover:bg-muted/40'
                  )}
                >
                  <div className="min-w-0 pr-3">
                    <div className="truncate text-sm font-medium">{req.title || req.document_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {req.document_name} · {req.signers?.length || 0} signers
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                      STATUS_BADGES[req.status] || STATUS_BADGES.draft
                    )}
                  >
                    {req.status.replace('_', ' ')}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="rounded-xl border bg-card p-5 lg:col-span-7">
            {!detail ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Select a signature request to inspect details.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                  <div>
                    <h2 className="text-lg font-semibold">{detail.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      Document: {detail.document_name} · Order: {detail.signing_order}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.status === 'draft' && (
                      <>
                        <Button size="sm" onClick={() => handleSend(detail.id)}>
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          Send
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(detail.id)}>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </>
                    )}
                    {['sent', 'in_progress'].includes(detail.status) && (
                      <Button size="sm" variant="outline" onClick={() => handleVoid(detail.id)}>
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Void
                      </Button>
                    )}
                    {detail.has_completed_pdf && (
                      <Button asChild size="sm">
                        <a
                          href={getSignatureRequestDownloadUrl(detail.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Download Executed PDF
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Recipients</h3>
                  <div className="space-y-2">
                    {(detail.signers || []).map((signer) => {
                      const matchingLink = signingLinks.find((l) => l.signer_id === signer.id);
                      return (
                        <div
                          key={signer.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                        >
                          <div>
                            <div className="font-medium">
                              {signer.order_index}. {signer.name || signer.email}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {signer.email} · {signer.status}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {signer.status === 'signed' && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            )}
                            {matchingLink && detail.status !== 'voided' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => copySigningUrl(matchingLink.signing_url)}
                              >
                                <Copy className="mr-1 h-3.5 w-3.5" />
                                Copy Link
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {pageViews.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Pre-Sign Page Reading Dwell</h3>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs text-muted-foreground">
                      {pageViews.map((pv) => (
                        <div key={pv.id} className="flex justify-between">
                          <span>{pv.signer_email} · Page {pv.page_number}</span>
                          <span>{pv.duration_seconds}s</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Audit Trail</h3>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border p-3 text-xs">
                    {(detail.audit_events || []).map((evt) => (
                      <div key={evt.id} className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {evt.event_type} {evt.signer_email ? `(${evt.signer_email})` : ''}
                        </span>
                        <span className="text-muted-foreground">
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
