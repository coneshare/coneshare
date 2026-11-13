import { useEffect, useRef, useState } from 'react';
import { Eraser, PenTool, Type } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { cn } from '../../lib/utils';

export function SignatureCapturePad({
  onChange,
  onApply = null,
  showIdentityFields = false,
  initialName = '',
  initialTitle = '',
  initialCompany = '',
  initialEmail = '',
  submitLabel = 'Apply Signature',
  disabled = false,
}) {
  const [mode, setMode] = useState('draw');
  const [typedSignature, setTypedSignature] = useState(initialName || '');
  const [signerName, setSignerName] = useState(initialName || '');
  const [signerTitle, setSignerTitle] = useState(initialTitle || '');
  const [signerCompany, setSignerCompany] = useState(initialCompany || '');
  const [signerEmail, setSignerEmail] = useState(initialEmail || '');
  const [hasDrawnStroke, setHasDrawnStroke] = useState(false);

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const emitPayload = (nextMode, drawnUrl, typedVal, identity) => {
    const cleanTyped = (typedVal || '').trim();
    const signatureData = nextMode === 'draw' ? drawnUrl : cleanTyped;
    const isValidSignature = nextMode === 'draw' ? Boolean(drawnUrl) : Boolean(cleanTyped);
    if (typeof onChange === 'function') {
      onChange({
        signature_type: nextMode,
        signature_data: signatureData,
        isValidSignature,
        signer_name: identity.signerName,
        signer_title: identity.signerTitle,
        signer_company: identity.signerCompany,
        signer_email: identity.signerEmail,
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [mode]);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / (rect.width || 1)) * canvas.width,
      y: ((clientY - rect.top) / (rect.height || 1)) * canvas.height,
    };
  };

  const handleStart = (e) => {
    if (disabled || mode !== 'draw') return;
    const ctx = canvasRef.current?.getContext?.('2d');
    if (!ctx) return;
    drawingRef.current = true;
    const pt = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const handleMove = (e) => {
    if (!drawingRef.current || disabled || mode !== 'draw') return;
    const ctx = canvasRef.current?.getContext?.('2d');
    if (!ctx) return;
    const pt = getPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    hasDrawnRef.current = true;
    setHasDrawnStroke(true);
  };

  const handleEnd = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const dataUrl = hasDrawnRef.current ? canvasRef.current?.toDataURL?.('image/png') || '' : '';
    emitPayload('draw', dataUrl, typedSignature, {
      signerName,
      signerTitle,
      signerCompany,
      signerEmail,
    });
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    hasDrawnRef.current = false;
    setHasDrawnStroke(false);
    setTypedSignature('');
    emitPayload(mode, '', '', { signerName, signerTitle, signerCompany, signerEmail });
  };

  const handleModeSwitch = (nextMode) => {
    setMode(nextMode);
    const dataUrl = hasDrawnRef.current ? canvasRef.current?.toDataURL?.('image/png') || '' : '';
    emitPayload(nextMode, dataUrl, typedSignature, {
      signerName,
      signerTitle,
      signerCompany,
      signerEmail,
    });
  };

  const handleTypedChange = (val) => {
    setTypedSignature(val);
    emitPayload('type', '', val, { signerName, signerTitle, signerCompany, signerEmail });
  };

  const updateIdentity = (field, val) => {
    const next = {
      signerName: field === 'signerName' ? val : signerName,
      signerTitle: field === 'signerTitle' ? val : signerTitle,
      signerCompany: field === 'signerCompany' ? val : signerCompany,
      signerEmail: field === 'signerEmail' ? val : signerEmail,
    };
    if (field === 'signerName') setSignerName(val);
    if (field === 'signerTitle') setSignerTitle(val);
    if (field === 'signerCompany') setSignerCompany(val);
    if (field === 'signerEmail') setSignerEmail(val);
    const dataUrl = hasDrawnRef.current ? canvasRef.current?.toDataURL?.('image/png') || '' : '';
    emitPayload(mode, dataUrl, typedSignature, next);
  };

  const canSubmit =
    mode === 'draw' ? hasDrawnStroke : Boolean((typedSignature || '').trim());

  const handleApplyClick = () => {
    if (!onApply || !canSubmit) return;
    const dataUrl = hasDrawnRef.current ? canvasRef.current?.toDataURL?.('image/png') || '' : '';
    onApply({
      signature_type: mode,
      signature_data: mode === 'draw' ? dataUrl : typedSignature.trim(),
      signer_name: signerName.trim(),
      signer_title: signerTitle.trim(),
      signer_company: signerCompany.trim(),
      signer_email: signerEmail.trim(),
    });
  };

  return (
    <div className="space-y-3">
      {showIdentityFields && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sig-signer-name" className="text-xs">Full Name *</Label>
            <Input
              id="sig-signer-name"
              value={signerName}
              onChange={(e) => updateIdentity('signerName', e.target.value)}
              placeholder="Jane Doe"
              disabled={disabled}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sig-signer-email" className="text-xs">Email</Label>
            <Input
              id="sig-signer-email"
              type="email"
              value={signerEmail}
              onChange={(e) => updateIdentity('signerEmail', e.target.value)}
              placeholder="jane@company.com"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sig-signer-title" className="text-xs">Title</Label>
            <Input
              id="sig-signer-title"
              value={signerTitle}
              onChange={(e) => updateIdentity('signerTitle', e.target.value)}
              placeholder="Managing Partner"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sig-signer-company" className="text-xs">Company</Label>
            <Input
              id="sig-signer-company"
              value={signerCompany}
              onChange={(e) => updateIdentity('signerCompany', e.target.value)}
              placeholder="Acme Capital"
              disabled={disabled}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-gray-200 dark:border-zinc-700 p-0.5 bg-gray-100 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => handleModeSwitch('draw')}
            className={cn(
              'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
              mode === 'draw'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-zinc-400'
            )}
          >
            <PenTool className="h-3.5 w-3.5" />
            <span>Draw</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('type')}
            className={cn(
              'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
              mode === 'type'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-zinc-400'
            )}
          >
            <Type className="h-3.5 w-3.5" />
            <span>Type</span>
          </button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={disabled}
          className="h-7 px-2 text-xs text-gray-500"
        >
          <Eraser className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {mode === 'draw' ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-1.5 dark:border-zinc-700">
          <canvas
            ref={canvasRef}
            width={440}
            height={130}
            data-testid="signature-draw-canvas"
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
            className="h-32 w-full cursor-crosshair touch-none rounded bg-white"
          />
          <p className="mt-1 text-center text-[11px] text-gray-400">
            Draw your signature inside the box above
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            aria-label="Typed signature"
            value={typedSignature}
            onChange={(e) => handleTypedChange(e.target.value)}
            placeholder="Type your full signature"
            disabled={disabled}
          />
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-4 text-2xl italic font-serif text-slate-900 dark:border-zinc-700">
            {typedSignature.trim() || 'Signature Preview'}
          </div>
        </div>
      )}

      {onApply && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleApplyClick}
            disabled={disabled || !canSubmit}
          >
            {submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
