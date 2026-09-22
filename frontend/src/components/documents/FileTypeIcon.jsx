import { FileIcon, FileImageIcon, FileQuestion, FileSpreadsheet, FileTextIcon, FolderIcon, FileVideo } from "lucide-react";

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

export function FileTypeIcon({ type, className = "h-5 w-5", palette = "default" }) {
  const normalized = normalizeType(type);

  const paletteVars = {
    viewer: {
      folder: "var(--viewer-accent)",
      pdf: "#b91c1c",
      document: "#1d4ed8",
      spreadsheet: "#15803d",
      image: "#0f766e",
      video: "#8a2be2",
      unknown: "var(--viewer-secondary)",
    },
    dataroom: {
      folder: "var(--dataroom-secondary)",
      pdf: "#b91c1c",
      document: "#1d4ed8",
      spreadsheet: "#15803d",
      image: "#0f766e",
      video: "#8a2be2",
      unknown: "var(--dataroom-secondary)",
    },
    default: {
      folder: "#6b7280",
      pdf: "#b91c1c",
      document: "#1d4ed8",
      spreadsheet: "#15803d",
      image: "#0f766e",
      video: "#8a2be2",
      unknown: "#6b7280",
    },
  };

  const colors = paletteVars[palette] || paletteVars.default;
  const style = { color: colors[normalized] || colors.unknown };

  if (normalized === "folder") {
    return <FolderIcon data-testid="file-type-icon-folder" className={className} style={style} />;
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
  return <FileQuestion data-testid="file-type-icon-unknown" className={className} style={style} />;
}

