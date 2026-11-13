import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getShareLinkDetails,
  getShareLinkNdaAcceptances,
  getShareLinkNdaDownloadUrl,
  getShareLinkViewSessions,
} from '../services/api';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { ArrowLeft, Download, FileCheck2 } from 'lucide-react';

export function ShareLinkAnalyticsPage() {
  const { documentId, linkId } = useParams();
  const [link, setLink] = useState(null);
  const [viewsData, setViewsData] = useState(null);
  const [ndaAcceptances, setNdaAcceptances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLinkDetails = useCallback(async () => {
    try {
      setLoading(true);
      const [linkResp, ndaResp] = await Promise.all([
        getShareLinkDetails(linkId),
        getShareLinkNdaAcceptances(linkId).catch(() => ({ data: [] })),
      ]);
      setLink(linkResp.data);
      setNdaAcceptances(Array.isArray(ndaResp.data) ? ndaResp.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  const fetchViews = useCallback(async () => {
    try {
      setViewsLoading(true);
      const response = await getShareLinkViewSessions(linkId, currentPage);
      setViewsData(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setViewsLoading(false);
    }
  }, [linkId, currentPage]);

  useEffect(() => {
    fetchLinkDetails();
  }, [fetchLinkDetails]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!link) {
    return (
      <div className="flex h-full items-center justify-center">
        <p>Link not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <div className="mb-8">
        <Button asChild variant="outline">
          <Link to={`/documents/${documentId}`} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Document</span>
          </Link>
        </Button>
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          View Sessions for "{link.name || 'Untitled Link'}"
        </h1>
        <p className="text-muted-foreground">
          Showing all {viewsData?.count || 0} recorded view sessions for this share link.
        </p>
      </div>
      <div className="mt-8">
        <ViewSessionsTable
          views={viewsData?.results || []}
          totalCount={viewsData?.count || 0}
          loading={viewsLoading}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={10}
        />
      </div>

      {ndaAcceptances.length > 0 && (
        <div className="mt-10 space-y-3">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Executed NDA Records</h2>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Signer</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Signed At</th>
                  <th className="px-4 py-3">Document SHA-256</th>
                  <th className="px-4 py-3 text-right">Executed PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ndaAcceptances.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium">
                      {item.signer_name || 'Viewer'}
                      {item.signer_company ? ` (${item.signer_company})` : ''}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.signer_email || item.viewer_email || '—'}
                    </td>
                    <td className="px-4 py-3">v{item.nda_version}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.accepted_at ? new Date(item.accepted_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {item.signed_doc_sha256 ? `${item.signed_doc_sha256.slice(0, 12)}...` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.has_executed_pdf ? (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={getShareLinkNdaDownloadUrl(link.slug, item.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download PDF</span>
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Plain Text</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
