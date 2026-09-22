import React, { useState, useEffect, useRef, useMemo, useCallback, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, AlertTriangle, FileSpreadsheet, Loader2, ChevronUp, ChevronDown, X } from 'lucide-react';
import axios from 'axios';

/**
 * Generates an SVG watermark pattern matching PdfJsViewer / PreviewViewer style.
 */
function buildWatermarkSvg(text) {
  const safe = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="180" viewBox="0 0 340 180">
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
      transform="rotate(-28 170 90)" fill="#000000" font-family="sans-serif"
      font-size="14" font-weight="500" letter-spacing="0.5">${safe}</text>
  </svg>`;
}

const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_COL_WIDTH = 90;
const HEADER_ROW_HEIGHT = 28;
const ROW_HEADER_WIDTH = 54;
const OVERSCAN_ROWS = 5;
const OVERSCAN_COLS = 3;

export const SpreadsheetViewer = forwardRef(({
  spreadsheetUrl,
  title = 'Spreadsheet',
  watermarkText = '',
  allowDownload = true,
  canCopy = null,
  zoomLevel = 1,
  documentData = null,
}, ref) => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [selectedCell, setSelectedCell] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [scrollState, setScrollState] = useState({ top: 0, left: 0, viewportWidth: 800, viewportHeight: 600 });

  const containerRef = useRef(null);

  // Resolved URL to fetch
  const urlToFetch = spreadsheetUrl || documentData?.spreadsheet_preview_url;

  useEffect(() => {
    if (!urlToFetch) {
      if (documentData && documentData.preview_mode !== 'spreadsheet') {
        setError(t('errors.unsupportedFormat', 'Document is not a spreadsheet.'));
      }
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    axios.get(urlToFetch)
      .then((res) => {
        if (isMounted) {
          setData(res.data);
          setActiveSheetIndex(res.data.active_sheet_index || 0);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load spreadsheet preview.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [urlToFetch, t, documentData]);

  // Track container viewport dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      setScrollState((prev) => ({
        ...prev,
        viewportWidth: el.clientWidth || 800,
        viewportHeight: el.clientHeight || 600,
      }));
    };

    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  const onScroll = useCallback((e) => {
    const target = e.currentTarget;
    setScrollState((prev) => ({
      ...prev,
      top: target.scrollTop,
      left: target.scrollLeft,
    }));
  }, []);

  const activeSheet = useMemo(() => {
    if (!data || !data.sheets || !data.sheets[activeSheetIndex]) return null;
    return data.sheets[activeSheetIndex];
  }, [data, activeSheetIndex]);

  // Scaled dimensions based on zoomLevel
  const scale = Math.max(0.75, Math.min(zoomLevel || 1, 2.0));
  const rowHeight = Math.round(DEFAULT_ROW_HEIGHT * scale);
  const rowHeaderWidth = Math.round(ROW_HEADER_WIDTH * scale);
  const headerRowHeight = Math.round(HEADER_ROW_HEIGHT * scale);

  // Column width calculations & cumulative offsets
  const { columns, colOffsets, totalColsWidth } = useMemo(() => {
    if (!activeSheet) return { columns: [], colOffsets: [0], totalColsWidth: 0 };
    const cols = activeSheet.columns || [];
    const offsets = [0];
    let running = 0;
    for (let i = 0; i < cols.length; i++) {
      const w = Math.round((cols[i].width || DEFAULT_COL_WIDTH) * scale);
      running += w;
      offsets.push(running);
    }
    return { columns: cols, colOffsets: offsets, totalColsWidth: running };
  }, [activeSheet, scale]);

  const rowCount = activeSheet?.row_count || 0;
  const colCount = columns.length;
  const totalGridHeight = rowCount * rowHeight;

  // 2D Virtual Windowing: Calculate visible row & col ranges
  const { startRow, endRow, startCol, endCol } = useMemo(() => {
    const startR = Math.max(0, Math.floor(scrollState.top / rowHeight) - OVERSCAN_ROWS);
    const endR = Math.min(rowCount, Math.ceil((scrollState.top + scrollState.viewportHeight) / rowHeight) + OVERSCAN_ROWS);

    // Binary search for visible startCol and endCol
    let startC = 0;
    let endC = colCount;

    for (let i = 0; i < colCount; i++) {
      if (colOffsets[i + 1] >= scrollState.left) {
        startC = Math.max(0, i - OVERSCAN_COLS);
        break;
      }
    }

    const rightBound = scrollState.left + scrollState.viewportWidth;
    for (let i = startC; i < colCount; i++) {
      if (colOffsets[i] > rightBound) {
        endC = Math.min(colCount, i + OVERSCAN_COLS);
        break;
      }
    }

    return { startRow: startR, endRow: endR, startCol: startC, endCol: endC };
  }, [scrollState, rowHeight, rowCount, colCount, colOffsets]);

  // Copy protection & watermark gating
  const isProtected = canCopy !== null ? !canCopy : (Boolean(watermarkText) || !allowDownload);
  const handleCopy = useCallback((e) => {
    if (isProtected) {
      e.preventDefault();
    }
  }, [isProtected]);

  // Real-time search matches calculation across active sheet
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || !activeSheet || !activeSheet.cells) return [];
    const matches = [];
    for (const [key, cellData] of Object.entries(activeSheet.cells)) {
      if (cellData && cellData.v !== undefined && cellData.v !== null) {
        if (String(cellData.v).toLowerCase().includes(query)) {
          const [rStr, cStr] = key.split(':');
          matches.push({ r: parseInt(rStr, 10), c: parseInt(cStr, 10), key });
        }
      }
    }
    matches.sort((a, b) => a.r - b.r || a.c - b.c);
    return matches;
  }, [searchQuery, activeSheet]);

  const scrollToMatch = useCallback((matchIndex) => {
    if (!searchMatches || searchMatches.length === 0) return;
    const match = searchMatches[matchIndex];
    if (!match) return;

    const { r, c } = match;
    const colLetter = columns[c]?.name || '';
    if (colLetter) {
      setSelectedCell(`${colLetter}${r + 1}`);
    }

    const container = containerRef.current;
    if (!container) return;

    const targetTop = r * rowHeight;
    const targetLeft = colOffsets[c] || 0;
    const cellW = (colOffsets[c + 1] || targetLeft + DEFAULT_COL_WIDTH) - targetLeft;

    const viewH = container.clientHeight || 600;
    const viewW = container.clientWidth || 800;
    const scrollT = container.scrollTop;
    const scrollL = container.scrollLeft;

    if (targetTop < scrollT) {
      container.scrollTop = targetTop;
    } else if (targetTop + rowHeight > scrollT + viewH - headerRowHeight) {
      container.scrollTop = targetTop + rowHeight - viewH + headerRowHeight + 40;
    }

    if (targetLeft < scrollL) {
      container.scrollLeft = targetLeft;
    } else if (targetLeft + cellW > scrollL + viewW - rowHeaderWidth) {
      container.scrollLeft = targetLeft + cellW - viewW + rowHeaderWidth + 40;
    }
  }, [searchMatches, columns, rowHeight, colOffsets, headerRowHeight, rowHeaderWidth]);

  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIdx);
    scrollToMatch(nextIdx);
  }, [currentMatchIndex, searchMatches.length, scrollToMatch]);

  const handlePrevMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIdx);
    scrollToMatch(prevIdx);
  }, [currentMatchIndex, searchMatches.length, scrollToMatch]);

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setCurrentMatchIndex(0);
    }
  }, [handleNextMatch, handlePrevMatch]);

  useEffect(() => {
    if (searchMatches.length > 0) {
      scrollToMatch(0);
    }
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [activeSheetIndex]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-muted/20 min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
        <p className="text-sm text-muted-foreground">{t('viewer.loadingSpreadsheet', 'Loading spreadsheet...')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-6 text-center bg-muted/10 min-h-[400px]">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
        <h3 className="text-base font-semibold text-foreground mb-1">
          {t('viewer.previewFailed', 'Unable to preview spreadsheet')}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">{error || 'No spreadsheet data available.'}</p>
      </div>
    );
  }

  const sheets = data.sheets || [];
  const cells = activeSheet?.cells || {};

  return (
    <div
      ref={ref}
      aria-label={title || 'Spreadsheet'}
      className={`relative flex flex-col h-full w-full bg-background overflow-hidden border border-border select-text ${
        isProtected ? 'select-none' : ''
      }`}
      onCopy={handleCopy}
    >
      {/* Top Controls Bar: Active Cell Coordinate + Search Input */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40 text-xs text-muted-foreground gap-3">
        <div className="flex items-center space-x-2">
          <span className="font-semibold px-2 py-0.5 rounded bg-background border border-border text-foreground min-w-14 text-center">
            {selectedCell || (activeSheet?.row_count > 0 ? 'A1' : '-')}
          </span>
          {activeSheet?.is_truncated && (
            <div className="flex items-center text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900 text-[11px]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              <span>{t('viewer.truncatedSpreadsheetNotice', 'Showing first 2,000 rows. Download full file for complete data.')}</span>
            </div>
          )}
        </div>

        {/* In-sheet Keyword Search with Real-time Occurrences */}
        <div className="relative flex items-center">
          <div className="relative flex items-center">
            <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentMatchIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('common.search', 'Search in sheet...')}
              className={`h-7 pl-7 text-xs rounded border bg-background text-foreground focus:outline-none focus:ring-1 transition-all ${
                searchQuery.trim()
                  ? searchMatches.length > 0
                    ? 'w-64 pr-24 border-primary/40 focus:ring-primary'
                    : 'w-64 pr-14 border-destructive/60 text-destructive focus:ring-destructive'
                  : 'w-48 pr-2 border-border focus:ring-primary'
              }`}
            />

            {/* Real-time Occurrence Display & Match Navigation */}
            {searchQuery.trim() && (
              <div className="absolute right-1.5 flex items-center gap-0.5 text-[11px] select-none">
                {searchMatches.length > 0 ? (
                  <>
                    <span
                      data-testid="search-count"
                      className="font-mono text-muted-foreground px-1"
                    >
                      {currentMatchIndex + 1}/{searchMatches.length}
                    </span>
                    <button
                      type="button"
                      aria-label="Previous match"
                      title={t('viewer.prevMatch', 'Previous match (Shift+Enter)')}
                      onClick={handlePrevMatch}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next match"
                      title={t('viewer.nextMatch', 'Next match (Enter)')}
                      onClick={handleNextMatch}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <span
                    data-testid="search-count"
                    className="font-mono text-destructive px-1"
                  >
                    0/0
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Clear search"
                  title={t('common.clear', 'Clear')}
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentMatchIndex(0);
                  }}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Viewport Wrapper: Non-scrolling relative container hosting scrollable grid and fixed watermark overlay */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* Main Virtualized Grid Viewport */}
        <div
          ref={containerRef}
          onScroll={onScroll}
          data-testid="spreadsheet-scroll-container"
          className="h-full w-full overflow-auto bg-background"
          style={{ fontSize: `${Math.max(11, Math.round(13 * scale))}px` }}
        >
        {/* Sizing dummy wrapper establishing scroll extents */}
        <div
          style={{
            width: `${rowHeaderWidth + totalColsWidth}px`,
            height: `${headerRowHeight + totalGridHeight}px`,
            position: 'relative',
          }}
        >
          {/* 1. Unified Sticky Header Row (Corner Cell + Column Headers A, B, C...) */}
          <div
            data-testid="spreadsheet-header-row"
            className="sticky top-0 z-30 flex bg-muted/80 border-b border-border"
            style={{
              width: `${rowHeaderWidth + totalColsWidth}px`,
              height: `${headerRowHeight}px`,
            }}
          >
            {/* 1.1 Sticky Top-Left Corner Cell */}
            <div
              data-testid="spreadsheet-corner-cell"
              className="sticky left-0 z-40 bg-muted border-r border-border font-semibold text-center flex items-center justify-center text-muted-foreground flex-shrink-0"
              style={{ width: `${rowHeaderWidth}px`, height: `${headerRowHeight}px` }}
            />

            {/* 1.2 Virtualized Column Headers (A, B, C...) */}
            <div
              className="relative flex-1"
              style={{
                width: `${totalColsWidth}px`,
                height: `${headerRowHeight}px`,
              }}
            >
              {columns.slice(startCol, endCol).map((col, idx) => {
                const colIndex = startCol + idx;
                const leftPos = colOffsets[colIndex];
                const w = colOffsets[colIndex + 1] - leftPos;
                return (
                  <div
                    key={col.name || colIndex}
                    className="absolute top-0 flex items-center justify-center border-r border-border text-xs font-medium text-muted-foreground bg-muted/80 select-none overflow-hidden"
                    style={{
                      left: `${leftPos}px`,
                      width: `${w}px`,
                      height: `${headerRowHeight}px`,
                    }}
                  >
                    {col.name}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Grid Body: Sticky Row Headers (1, 2, 3...) + 2D Virtual Cells Matrix */}
          <div
            data-testid="spreadsheet-grid-body"
            className="flex relative"
            style={{
              width: `${rowHeaderWidth + totalColsWidth}px`,
              height: `${totalGridHeight}px`,
            }}
          >
            {/* 2.1 Sticky Row Headers (1, 2, 3...) */}
            <div
              className="sticky left-0 z-20 flex-shrink-0 bg-muted/80 border-r border-border"
              style={{
                width: `${rowHeaderWidth}px`,
                height: `${totalGridHeight}px`,
              }}
            >
              {Array.from({ length: endRow - startRow }).map((_, idx) => {
                const rowNum = startRow + idx + 1;
                const topPos = (rowNum - 1) * rowHeight;
                return (
                  <div
                    key={rowNum}
                    className="absolute left-0 flex items-center justify-center border-b border-border text-xs font-mono text-muted-foreground bg-muted/80 select-none"
                    style={{
                      top: `${topPos}px`,
                      height: `${rowHeight}px`,
                      width: `${rowHeaderWidth}px`,
                    }}
                  >
                    {rowNum}
                  </div>
                );
              })}
            </div>

            {/* 2.2 Visible 2D Virtual Cells Matrix */}
            <div
              className="relative z-10"
              style={{
                width: `${totalColsWidth}px`,
                height: `${totalGridHeight}px`,
              }}
            >
            {Array.from({ length: endRow - startRow }).map((_, rIdxRel) => {
              const rIdx = startRow + rIdxRel;
              const cellTop = rIdx * rowHeight;

              return Array.from({ length: endCol - startCol }).map((_, cIdxRel) => {
                const cIdx = startCol + cIdxRel;
                const cellLeft = colOffsets[cIdx];
                const cellWidth = colOffsets[cIdx + 1] - cellLeft;

                const cellKey = `${rIdx}:${cIdx}`;
                const cellData = cells[cellKey];
                const cellVal = cellData ? cellData.v : '';
                const cellStyle = cellData?.s || {};

                const colLetter = columns[cIdx]?.name || '';
                const cellCoord = `${colLetter}${rIdx + 1}`;
                const isSelected = selectedCell === cellCoord;

                const currentMatchKey = searchMatches[currentMatchIndex]?.key;
                const isCurrentMatch = currentMatchKey === cellKey;
                const isMatch = isCurrentMatch || Boolean(searchQuery.trim() && cellVal && String(cellVal).toLowerCase().includes(searchQuery.trim().toLowerCase()));

                return (
                  <div
                    key={cellKey}
                    onClick={() => setSelectedCell(cellCoord)}
                    title={cellVal ? String(cellVal) : ''}
                    className={`absolute px-1.5 flex items-center border-b border-r border-border overflow-hidden text-ellipsis whitespace-nowrap cursor-cell transition-colors ${
                      isSelected
                        ? 'ring-2 ring-primary ring-inset z-20 bg-primary/5'
                        : isCurrentMatch
                        ? 'ring-2 ring-amber-500 ring-inset z-20 bg-amber-300 dark:bg-amber-600/70 text-amber-950 dark:text-amber-50 font-semibold shadow-xs'
                        : isMatch
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 font-medium'
                        : 'hover:bg-muted/30'
                    }`}
                    style={{
                      top: `${cellTop}px`,
                      left: `${cellLeft}px`,
                      width: `${cellWidth}px`,
                      height: `${rowHeight}px`,
                      fontWeight: cellStyle.b ? 'bold' : 'normal',
                      fontStyle: cellStyle.i ? 'italic' : 'normal',
                      textAlign: cellStyle.al || (cellData?.t === 'n' ? 'right' : 'left'),
                      justifyContent:
                        cellStyle.al === 'center'
                          ? 'center'
                          : cellStyle.al === 'right' || cellData?.t === 'n'
                          ? 'flex-end'
                          : 'flex-start',
                      color: cellStyle.c || undefined,
                      backgroundColor: cellStyle.bg || undefined,
                    }}
                  >
                    {cellVal}
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>
    </div>

      {/* Repeating Watermark Overlay - stays pinned over the viewport upon scrolling */}
      {watermarkText && (
        <div
          data-testid="spreadsheet-watermark"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden select-none z-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(buildWatermarkSvg(watermarkText))}")`,
            backgroundSize: '340px 180px',
            backgroundRepeat: 'repeat',
            opacity: 0.18,
          }}
        />
      )}
    </div>

      {/* Bottom Sheet Switcher Tabs */}
      {sheets.length > 0 && (
        <div className="flex items-center px-2 border-t bg-muted/60 overflow-x-auto scrollbar-none h-9 gap-1 shrink-0">
          {sheets.map((sheet, sIdx) => {
            const isActive = sIdx === activeSheetIndex;
            return (
              <button
                key={sheet.id || sIdx}
                type="button"
                onClick={() => {
                  setActiveSheetIndex(sIdx);
                  setSelectedCell(null);
                }}
                className={`flex items-center px-3 py-1 text-xs rounded-t border border-b-0 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-background text-primary font-semibold border-border border-t-2 border-t-primary'
                    : 'text-muted-foreground hover:bg-background/50 border-transparent'
                }`}
              >
                <span>{sheet.name}</span>
                {sheet.row_count > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-60">({sheet.row_count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

SpreadsheetViewer.displayName = 'SpreadsheetViewer';
