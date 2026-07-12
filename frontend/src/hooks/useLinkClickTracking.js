import { useCallback } from 'react';
import { recordLinkClick } from '../services/api';

export function useLinkClickTracking(viewId, dataroomVisitId) {
  return useCallback((url, pageNumber) => {
    if (!viewId) return;
    const payload = { view_session: viewId, page_number: pageNumber, url };
    if (dataroomVisitId) {
      payload.dataroom_visit = dataroomVisitId;
    }
    const result = recordLinkClick(payload);
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  }, [viewId, dataroomVisitId]);
}
