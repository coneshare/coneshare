import { FileIcon, FileImageIcon, FileQuestion, FileTextIcon, FolderIcon, FileVideo } from "lucide-react";

function normalizeType(type) {
  if (!type) return "unknown";
  const lower = String(type).toLowerCase();
  if (lower === "folder") return "folder";
  if (lower === "pdf") return "pdf";
  if (lower === "image") return "image";
  if (lower === "video" || lower === "mov" || lower === "mp4" || lower === "avi" || lower === "webm" || lower === "m3u8") return "video";
  if (lower === "document" || lower === "doc" || lower === "docx") return "document";
  return "unknown";
}

export function FileTypeIcon({ type, className = "h-5 w-5", palette = "default" }) {
  const normalized = normalizeType(type);

  const paletteVars = {
    viewer: {
      folder: "var(--viewer-accent)",
      pdf: "#b91c1c",
      document: "#1d4ed8",
      image: "#0f766e",
      video: "#8a2be2",
      unknown: "var(--viewer-secondary)",
    },
    dataroom: {
      folder: "var(--dataroom-secondary)",
      pdf: "#b91c1c",
      document: "#1d4ed8",
      image: "#0f766e",
      video: "#8a2be2",
      unknown: "var(--dataroom-secondary)",
    },
    default: {
      folder: "#6b7280",
      pdf: "#b91c1c",
      document: "#1d4ed8",
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

