import { FileCode, FileIcon, FileImageIcon, FileQuestion, FileSpreadsheet, FileTextIcon, FolderIcon, FolderSync, FileVideo } from "lucide-react";

function normalizeType(type) {
  if (!type) return "unknown";
  const raw = String(type).trim().toLowerCase();
  if (raw === "folder") return "folder";
  if (raw === "pdf" || raw.endsWith(".pdf")) return "pdf";
  if (raw === "image" || ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp"].includes(raw) || /\.(jpg|jpeg|png|gif|svg|webp|bmp)$/i.test(raw)) return "image";
  if (
    raw === "video" ||
    ["mov", "mp4", "avi", "webm", "m3u8", "mkv"].includes(raw) ||
    /\.(mov|mp4|avi|webm|m3u8|mkv)$/i.test(raw)
  ) return "video";
  if (
    raw === "markdown" ||
    raw === "md" ||
    ["md", "markdown"].includes(raw) ||
    /\.(md|markdown)$/i.test(raw) ||
    raw === "text/markdown" ||
    raw === "text/x-markdown"
  ) {
    return "markdown";
  }
  if (
    raw === "spreadsheet" ||
    raw === "sheet" ||
    ["xlsx", "xls", "csv", "tsv"].includes(raw) ||
    /\.(xlsx|xls|csv|tsv)$/i.test(raw) ||
    raw === "text/csv" ||
    raw.includes("spreadsheet") ||
    raw.includes("excel")
  ) {
    return "spreadsheet";
  }
  if (
    raw === "document" ||
    raw === "doc" ||
    raw === "docx" ||
    /\.(doc|docx|txt|rtf|odt)$/i.test(raw)
  ) return "document";
  return "unknown";
}

export function FileTypeIcon({ type, className = "h-5 w-5", palette = "default", isSynced = false }) {
  const normalized = normalizeType(type);

  const paletteVars = {
    viewer: {
      folder: "var(--viewer-accent)",
      pdf: "#b91c1c",
      document: "#1d4ed8",
      spreadsheet: "#15803d",
      image: "#0f766e",
      video: "#8a2be2",
      markdown: "#0284c7",
      unknown: "var(--viewer-secondary)",
    },
    dataroom: {
      folder: "var(--dataroom-secondary)",
      pdf: "#b91c1c",
      document: "#1d4ed8",
      spreadsheet: "#15803d",
      image: "#0f766e",
      video: "#8a2be2",
      markdown: "#0284c7",
      unknown: "var(--dataroom-secondary)",
    },
    default: {
      folder: "#6b7280",
      pdf: "#b91c1c",
      document: "#1d4ed8",
      spreadsheet: "#15803d",
      image: "#0f766e",
      video: "#8a2be2",
      markdown: "#0284c7",
      unknown: "#6b7280",
    },
  };

  const colors = paletteVars[palette] || paletteVars.default;
  const style = { color: colors[normalized] || colors.unknown };

  if (normalized === "folder") {
    const FolderGraphic = isSynced ? FolderSync : FolderIcon;
    return (
      <FolderGraphic
        data-testid={isSynced ? "file-type-icon-folder-sync" : "file-type-icon-folder"}
        className={className}
        style={style}
      />
    );
  }
  if (normalized === "pdf") {
    return <FileTextIcon data-testid="file-type-icon-pdf" className={className} style={style} />;
  }
  if (normalized === "spreadsheet") {
    return <FileSpreadsheet data-testid="file-type-icon-spreadsheet" className={className} style={style} />;
  }
  if (normalized === "image") {
    return <FileImageIcon data-testid="file-type-icon-image" className={className} style={style} />;
  }
  if (normalized === "document") {
    return <FileIcon data-testid="file-type-icon-document" className={className} style={style} />;
  }
  if (normalized === "video") {
    return <FileVideo data-testid="file-type-icon-video" className={className} style={style} />;
  }
  if (normalized === "markdown") {
    return <FileCode data-testid="file-type-icon-markdown" className={className} style={style} />;
  }
  return <FileQuestion data-testid="file-type-icon-unknown" className={className} style={style} />;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getDocumentBadgeStyle(type = '') {
  const normalized = normalizeType(type);
  switch (normalized) {
    case 'pdf':
      return 'bg-rose-50 text-rose-700 border-rose-100/80';
    case 'image':
      return 'bg-teal-50 text-teal-700 border-teal-100/80';
    case 'document':
      return 'bg-blue-50 text-blue-700 border-blue-100/80';
    case 'spreadsheet':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100/80';
    case 'markdown':
      return 'bg-sky-50 text-sky-700 border-sky-100/80';
    case 'video':
      return 'bg-violet-50 text-violet-700 border-violet-100/80';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200/60';
  }
}

