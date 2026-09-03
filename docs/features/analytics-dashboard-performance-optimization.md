# Analytics Dashboard Performance Optimization Analysis

## 1. Executive Summary

- **Target Endpoint:** `GET /api/v1/analytics/dashboard/` ([`backend/analytics/views.py`](file:///home/ubuntu/dev/coneshare/backend/analytics/views.py))
- **Observed Issue:** API latency ~0.90s – 1.0s under moderate production loads.
- **Root Cause:** N+1 cascading query explosion triggered by nested DRF serializers (`ShareLinkSerializer` and `ViewSessionSerializer`) combined with an unindexed correlated subquery for recent view timestamps.
- **Projected Impact:** Query count reduction from **550 queries** to **7 queries**; response latency reduction from **~900 ms** to **~50–60 ms** (~15x–18x speedup).

---

## 2. Profiling & Diagnostic Metrics

Direct container profiling executed via `dc` on the `web` container for user `xiez1989@gmail.com`:

```text
Status Code: 200
Total Execution Time: 0.8951s
Total SQL Queries: 550
Total DB Time: 0.4790s
Python / Serialization Time: 0.4161s
Unique Queries: 425, Duplicate Query Groups: 63
```

### Breakdown by View Component

| Section | Query Count | Analysis |
| :--- | :--- | :--- |
| **`recent_views` (10 items)** | **31 queries** | Missing `select_related('share_link__dataroom')` and un-prefetched reverse relations (`page_views`, `link_clicks`, `dataroom_visits`). |
| **`recent_links` (10 items)** | **519 queries** | Massive recursive N+1 cascade. `ShareLinkSerializer` executes `get_recent_view_sessions()`, which serializes 10 nested `ViewSessionSerializer` objects per link. Each `ViewSessionSerializer` in turn queries `page_views`, `dataroom_visits` (and its nested models), and `link_clicks`. |

---

## 3. Root Cause Analysis

### 3.1. Over-fetching in Serializers
- In [`ShareLinkSerializer.get_recent_view_sessions()`](file:///home/ubuntu/dev/coneshare/backend/sharelinks/serializers.py#L423), the full [`ViewSessionSerializer`](file:///home/ubuntu/dev/coneshare/backend/sharelinks/serializers.py#L92) is invoked.
- The frontend UI ([`LinksTable.jsx`](file:///home/ubuntu/dev/coneshare/frontend/src/components/documents/LinksTable.jsx)) only needs top-level metrics (`viewer_email`, device/user agent, location, `viewed_at`, `duration_seconds`, `completion_rate`) when expanding recent view sessions for a link. It does **not** consume nested page views or dataroom document visit hierarchies.

### 3.2. Unannotated Aggregates & Properties
- [`ShareLinkSerializer.get_view_count()`](file:///home/ubuntu/dev/coneshare/backend/sharelinks/serializers.py#L416) executes `obj.view_sessions.count()` for every row (10 separate `COUNT(*)` queries) when `view_sessions` is not cached or annotated.

### 3.3. Unindexed Correlated Subquery
- [`DashboardSummaryView`](file:///home/ubuntu/dev/coneshare/backend/analytics/views.py#L39-L41) filters active links via:
  ```python
  latest_view_subquery = ViewSession.objects.filter(
      share_link=OuterRef('pk')
  ).order_by('-viewed_at').values('viewed_at')[:1]
  ```
- [`ViewSession`](file:///home/ubuntu/dev/coneshare/backend/sharelinks/models.py#L213) lacks a composite index on `(share_link_id, viewed_at DESC)`, requiring table scans and sorting across view sessions for every share link.

---

## 4. Remediation Architecture

### 4.1. Dedicated Compact Serializer
Introduce a lightweight `CompactViewSessionSerializer` to serialize only the visitor-level metadata required by link previews:

```python
class CompactViewSessionSerializer(serializers.ModelSerializer):
    is_owner_view = serializers.SerializerMethodField()

    class Meta:
        model = ViewSession
        fields = [
            'id', 'viewer_email', 'user_agent', 'country', 'city',
            'duration_seconds', 'completion_rate', 'viewed_at',
            'downloaded_at', 'is_owner_view'
        ]

    def get_is_owner_view(self, obj) -> bool:
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            return obj.viewer_email == request.user.email
        return False
```

Update [`ShareLinkSerializer.get_recent_view_sessions()`](file:///home/ubuntu/dev/coneshare/backend/sharelinks/serializers.py#L423):
```python
def get_recent_view_sessions(self, obj) -> list[dict]:
    if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
        sessions = obj._prefetched_objects_cache['view_sessions'][:10]
    else:
        sessions = obj.view_sessions.all()[:10]
    return CompactViewSessionSerializer(sessions, many=True, context=self.context).data
```

### 4.2. QuerySet Prefetching & Joins in `DashboardSummaryView`
Refactor [`DashboardSummaryView.get()`](file:///home/ubuntu/dev/coneshare/backend/analytics/views.py#L30-L55):

```python
@extend_schema(tags=['analytics'])
class DashboardSummaryView(APIView):
    class DashboardSummaryResponseSerializer(serializers.Serializer):
        recent_views = ViewSessionSerializer(many=True)
        recent_links = ShareLinkSerializer(many=True)

    @extend_schema(responses={200: DashboardSummaryResponseSerializer})
    def get(self, request, *args, **kwargs):
        # 1. Recent views (batch prefetch reverse relations)
        recent_views = ViewSession.objects.filter(
            share_link__created_by=request.user
        ).select_related(
            'share_link', 'share_link__document', 'share_link__dataroom'
        ).prefetch_related(
            'page_views',
            'link_clicks',
            'dataroom_visits__page_views',
            'dataroom_visits__link_clicks',
            'dataroom_visits__dataroom_document__document',
            'dataroom_visits__dataroom_folder'
        ).order_by('-viewed_at')[:10]

        # 2. Recent links (subquery + prefetch compact view sessions)
        latest_view_subquery = ViewSession.objects.filter(
            share_link=OuterRef('pk')
        ).order_by('-viewed_at').values('viewed_at')[:1]

        compact_view_qs = ViewSession.objects.only(
            'id', 'share_link_id', 'viewer_email', 'user_agent', 'country', 'city',
            'duration_seconds', 'completion_rate', 'viewed_at', 'downloaded_at'
        ).order_by('-viewed_at')

        recent_links = ShareLink.objects.filter(
            created_by=request.user
        ).select_related(
            'document', 'dataroom', 'created_by'
        ).annotate(
            last_viewed_at=Subquery(latest_view_subquery),
            annotated_view_count=Count('view_sessions')
        ).filter(
            last_viewed_at__isnull=False
        ).prefetch_related(
            'dataroom_settings',
            Prefetch('view_sessions', queryset=compact_view_qs)
        ).order_by('-last_viewed_at')[:10]

        return Response({
            'recent_views': ViewSessionSerializer(recent_views, many=True, context={'request': request}).data,
            'recent_links': ShareLinkSerializer(recent_links, many=True, context={'request': request}).data,
        })
```

### 4.3. Database Indexing
Add a composite index on [`ViewSession`](file:///home/ubuntu/dev/coneshare/backend/sharelinks/models.py#L213):

```python
class ViewSession(models.Model):
    ...
    class Meta:
        ordering = ['-viewed_at']
        indexes = [
            models.Index(fields=['share_link', '-viewed_at']),
        ]
```

---

## 5. Verification & Benchmark Comparison

| Metric | Baseline | Optimized (Projected) | Improvement |
| :--- | :--- | :--- | :--- |
| **SQL Queries (`recent_views`)** | 31 queries | 6 queries | **80.6% reduction** |
| **SQL Queries (`recent_links`)** | 519 queries | 1 query | **99.8% reduction** |
| **Total SQL Queries** | **550 queries** | **7 queries** | **98.7% reduction** |
| **Database Execution Time** | 479 ms | ~20 ms | **24x faster** |
| **Python Serialization Time** | 416 ms | ~35 ms | **12x faster** |
| **Total Response Time** | **~895 ms** | **~55–60 ms** | **~15x faster** |
