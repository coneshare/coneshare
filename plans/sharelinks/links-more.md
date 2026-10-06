 Implementing the "View more" link to a dedicated analytics page is a much cleaner and more maintainable approach. I will proceed with that plan.

Here are the changes for the files we have in the chat, along with the new analytics page component.

Backend Changes

First, I'll update the backend to support fetching paginated view sessions for a specific link and to limit the number of sessions returned in the main document list.


backend/documents/models.py
<<<<<<< SEARCH
    def __str__(self):
        return f"ViewSession {self.id} on {self.share_link}"


class PageView(models.Model):
=======
    def __str__(self):
        return f"ViewSession {self.id} on {self.share_link}"

    class Meta:
        ordering = ['-viewed_at']


class PageView(models.Model):
>>>>>>> REPLACE



backend/documents/serializers.py
<<<<<<< SEARCH
class ShareLinkSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, style={'input_type': 'password'}
    )
    has_password = serializers.SerializerMethodField()
    view_count = serializers.SerializerMethodField()
    view_sessions = ViewSessionSerializer(many=True, read_only=True)

    def validate(self, data):
=======
class ShareLinkSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, style={'input_type': 'password'}
    )
    has_password = serializers.SerializerMethodField()
    view_count = serializers.SerializerMethodField()
    recent_view_sessions = serializers.SerializerMethodField()

    def validate(self, data):
>>>>>>> REPLACE



backend/documents/serializers.py
<<<<<<< SEARCH
    class Meta:
        model = ShareLink
        fields = [
            'id', 'document', 'created_by', 'name', 'slug', 'expires_at',
            'has_password', 'password', 'requires_email', 'requires_email_verification', 'allow_download',
            'enable_watermark', 'watermark_text', 'receive_email_notification', 'is_active', 'created_at', 'updated_at',
            'view_count', 'view_sessions'
        ]
=======
    class Meta:
        model = ShareLink
        fields = [
            'id', 'document', 'created_by', 'name', 'slug', 'expires_at',
            'has_password', 'password', 'requires_email', 'requires_email_verification', 'allow_download',
            'enable_watermark', 'watermark_text', 'receive_email_notification', 'is_active', 'created_at', 'updated_at',
            'view_count', 'recent_view_sessions'
        ]
>>>>>>> REPLACE



backend/documents/serializers.py
<<<<<<< SEARCH
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache['view_sessions'])
        return obj.view_sessions.count()

    def _hash_password(self, validated_data):
=======
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache['view_sessions'])
        return obj.view_sessions.count()

    def get_recent_view_sessions(self, obj):
        """Returns up to 10 most recent view sessions."""
        # This is efficient because of the prefetch_related in the view.
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            # Slicing the prefetched list. Relies on the model's Meta ordering.
            sessions = obj._prefetched_objects_cache['view_sessions'][:10]
        else:
            # Fallback to a query if not prefetched. Relies on Meta.ordering.
            sessions = obj.view_sessions.all()[:10]

        serializer = ViewSessionSerializer(sessions, many=True, context=self.context)
        return serializer.data

    def _hash_password(self, validated_data):
>>>>>>> REPLACE



backend/documents/views.py
<<<<<<< SEARCH
class ShareLinkViewSet(viewsets.ModelViewSet):
    queryset = ShareLink.objects.all()
    serializer_class = ShareLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ShareLink.objects.filter(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='preview')
=======
class ShareLinkViewSet(viewsets.ModelViewSet):
    queryset = ShareLink.objects.all()
    serializer_class = ShareLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ShareLink.objects.filter(created_by=self.request.user)

    @action(detail=True, methods=['get'], url_path='view-sessions')
    def view_sessions(self, request, pk=None):
        share_link = self.get_object()
        view_queryset = share_link.view_sessions.all()

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(view_queryset, request, view=self)
        if page is not None:
            serializer = ViewSessionSerializer(page, many=True, context=self.get_serializer_context())
            return paginator.get_paginated_response(serializer.data)

        serializer = ViewSessionSerializer(view_queryset, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='preview')
>>>>>>> REPLACE


Frontend Changes

Next, I'll create the new analytics page and update the existing LinksTable to link to it.


frontend/src/pages/ShareLinkAnalyticsPage.jsx
<<<<<<< SEARCH
=======
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getShareLinkDetails, getShareLinkViewSessions } from '../services/api';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { ArrowLeft } from 'lucide-react';

export function ShareLinkAnalyticsPage() {
  const { documentId, linkId } = useParams();
  const [link, setLink] = useState(null);
  const [viewsData, setViewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLinkDetails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getShareLinkDetails(linkId);
      setLink(response.data);
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
    </div>
  );
}
>>>>>>> REPLACE



frontend/src/pages/DocumentPage.jsx
<<<<<<< SEARCH
        <LinksTable
          links={document.share_links}
          onEditLink={handleEditLink}
          onDeleteLink={handleDeleteLink}
          onLinkUpdate={handleLinkUpdate}
        />
=======
        <LinksTable
          links={document.share_links}
          documentId={documentId}
          onEditLink={handleEditLink}
          onDeleteLink={handleDeleteLink}
          onLinkUpdate={handleLinkUpdate}
        />
>>>>>>> REPLACE



frontend/src/components/documents/LinksTable.jsx
<<<<<<< SEARCH
import { Eye, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';
=======
import { Link } from 'react-router-dom';
import { Eye, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';
>>>>>>> REPLACE



frontend/src/components/documents/LinksTable.jsx
<<<<<<< SEARCH
export function LinksTable({ links, onEditLink, onDeleteLink, onLinkUpdate }) {
  const [expandedRowId, setExpandedRowId] = useState(null);
=======
export function LinksTable({ links, documentId, onEditLink, onDeleteLink, onLinkUpdate }) {
  const [expandedRowId, setExpandedRowId] = useState(null);
>>>>>>> REPLACE



frontend/src/components/documents/LinksTable.jsx
<<<<<<< SEARCH
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {link.view_sessions.map((view) => {
                                const { browser, os } = parseUserAgent(view.user_agent);
                                const deviceInfo =
=======
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {link.recent_view_sessions.map((view) => {
                                const { browser, os } = parseUserAgent(view.user_agent);
                                const deviceInfo =
>>>>>>> REPLACE



frontend/src/components/documents/LinksTable.jsx
<<<<<<< SEARCH
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
=======
                            </TableBody>
                          </Table>
                          {link.view_count > link.recent_view_sessions.length && (
                            <div className="mt-2 text-center">
                              <Link
                                to={`/documents/${documentId}/links/${link.id}`}
                                className="text-sm font-medium text-blue-600 hover:underline"
                              >
                                View all {link.view_count} sessions
                              </Link>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
>>>>>>> REPLACE
