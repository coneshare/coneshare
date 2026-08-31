import logging
from django.db import transaction
from django.db.models import (
    Count,
    DateTimeField,
    F,
    IntegerField,
    Max,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, Lower
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from core.models import User
from core.permissions import APIKeyTierPermission, IsAdmin
from documents.models import Document
from sharelinks.models import ShareLink, ViewSession
from .models import Dataroom, DataroomCollaborator, DataroomDocument
from .serializers import (
    AdminDataroomSerializer,
    DataroomSerializer,
    DataroomDetailSerializer,
    DataroomCollaboratorSerializer,
    DataroomCollaboratorUserSerializer,
    DataroomAddCollaboratorSerializer,
    DataroomTransferOwnershipSerializer,
)
from .services import (
    delete_dataroom,
    sync_dataroom_rename,
    upgrade_dataroom_to_v2,
)

logger = logging.getLogger(__name__)


class AdminDataroomPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        metrics = getattr(self, 'metrics', {})
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': self.get_page_size(self.request),
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'metrics': metrics,
            'results': data,
        })


@extend_schema(tags=['admin-datarooms'])
class AdminDataroomViewSet(viewsets.ModelViewSet):
    """
    API endpoint for organization administrators to audit, govern,
    and manage all virtual datarooms within the organization.
    """
    permission_classes = [IsAuthenticated, IsAdmin, APIKeyTierPermission]
    queryset = Dataroom.objects.all()
    serializer_class = AdminDataroomSerializer
    pagination_class = AdminDataroomPagination

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DataroomDetailSerializer
        return AdminDataroomSerializer

    def list(self, request, *args, **kwargs):
        # Calculate org-wide metrics for the KPI cards
        user = request.user
        now = timezone.now()
        total_rooms = Dataroom.objects.filter(organization=user.organization).count()
        total_active_links = ShareLink.objects.filter(
            dataroom__organization=user.organization,
            is_active=True
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now)
        ).count()
        doc_ids = DataroomDocument.objects.filter(
            dataroom__organization=user.organization
        ).values_list('document_id', flat=True).distinct()
        total_storage_bytes = Document.objects.filter(
            id__in=doc_ids,
            deleted_at__isnull=True
        ).aggregate(total=Sum('file_size'))['total'] or 0

        # Pass metrics to paginator
        if self.paginator:
            self.paginator.metrics = {
                'total_rooms': total_rooms,
                'total_storage_bytes': total_storage_bytes,
                'total_active_links': total_active_links,
            }
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        now = timezone.now()

        active_links_subquery = (
            ShareLink.objects.filter(
                dataroom=OuterRef('pk'),
                is_active=True
            ).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gt=now)
            ).order_by().values('dataroom').annotate(c=Count('id')).values('c')[:1]
        )

        collaborators_subquery = (
            DataroomCollaborator.objects.filter(
                dataroom=OuterRef('pk')
            ).order_by().values('dataroom').annotate(c=Count('id')).values('c')[:1]
        )

        last_viewed_subquery = (
            ViewSession.objects.filter(
                share_link__dataroom=OuterRef('pk')
            ).order_by('-viewed_at').values('viewed_at')[:1]
        )

        doc_sum_subquery = (
            Document.objects.filter(
                id__in=Subquery(
                    DataroomDocument.objects.filter(dataroom=OuterRef(OuterRef('pk'))).values('document_id')
                ),
                deleted_at__isnull=True
            )
            .order_by()
            .annotate(dummy=Value(1))
            .values('dummy')
            .annotate(total=Sum('file_size'))
            .values('total')[:1]
        )

        qs = (
            Dataroom.objects.filter(organization=user.organization)
            .annotate(
                annotated_active_links_count=Coalesce(Subquery(active_links_subquery, output_field=IntegerField()), 0),
                annotated_last_viewed_at=Subquery(last_viewed_subquery, output_field=DateTimeField()),
                annotated_collaborators_count=Coalesce(Subquery(collaborators_subquery, output_field=IntegerField()), 0),
                annotated_storage_used_bytes=Coalesce(Subquery(doc_sum_subquery, output_field=IntegerField()), 0),
            )
            .select_related('created_by')
            .prefetch_related('collaborators', 'collaborators__user')
        )

        # Search filter
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(created_by__name__icontains=search) |
                Q(created_by__email__icontains=search)
            )

        # Status filter
        status_param = self.request.query_params.get('status', '').strip()
        if status_param == 'legacy_v1':
            qs = qs.filter(storage_version__lt=2)
        elif status_param == 'unlimited':
            qs = qs.filter(storage_quota_mb=0)
        elif status_param == 'near_capacity':
            qs = qs.filter(
                storage_quota_mb__gt=0,
                annotated_storage_used_bytes__gte=F('storage_quota_mb') * 838861
            )

        # Ordering
        ordering = self.request.query_params.get('ordering', '-created').strip()
        ordering_map = {
            'name': [Lower('name').asc()],
            '-name': [Lower('name').desc()],
            'owner': [Lower('created_by__name').asc(nulls_last=True), Lower('created_by__email').asc(nulls_last=True)],
            '-owner': [Lower('created_by__name').desc(nulls_last=True), Lower('created_by__email').desc(nulls_last=True)],
            'collaborators': [F('annotated_collaborators_count').asc()],
            '-collaborators': [F('annotated_collaborators_count').desc()],
            'active_links': [F('annotated_active_links_count').asc()],
            '-active_links': [F('annotated_active_links_count').desc()],
            'last_viewed': [F('annotated_last_viewed_at').asc(nulls_last=True)],
            '-last_viewed': [F('annotated_last_viewed_at').desc(nulls_last=True)],
            'storage': [F('annotated_storage_used_bytes').asc()],
            '-storage': [F('annotated_storage_used_bytes').desc()],
            'created': ['created_at'],
            '-created': ['-created_at'],
        }

        order_clauses = ordering_map.get(ordering, ['-created_at'])
        return qs.order_by(*order_clauses)

    def perform_destroy(self, instance):
        delete_dataroom(instance)

    def perform_update(self, serializer):
        old_name = self.get_object().name
        instance = serializer.save()
        sync_dataroom_rename(instance, old_name)

    @action(detail=True, methods=['post'], url_path='transfer-ownership')
    def transfer_ownership(self, request, pk=None):
        dataroom = self.get_object()

        if dataroom.storage_version < 2:
            return Response(
                {"detail": "This dataroom uses legacy storage (v1). Please upgrade to modern storage before transferring ownership."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DataroomTransferOwnershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_owner_id = serializer.validated_data['new_owner_id']
        new_owner = User.objects.filter(
            id=new_owner_id,
            organization=request.user.organization,
            is_active=True,
        ).first()

        if not new_owner:
            return Response(
                {"detail": "Target user was not found in your organization."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if new_owner.id == dataroom.created_by_id:
            return Response(
                {"detail": "User is already the owner of this dataroom."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            locked_dataroom = Dataroom.objects.select_for_update().get(id=dataroom.id)
            prev_owner = locked_dataroom.created_by

            # Remove new owner from collaborators if they were listed
            DataroomCollaborator.objects.filter(dataroom=locked_dataroom, user=new_owner).delete()

            # Convert previous owner to a collaborator if valid
            if prev_owner and prev_owner != new_owner:
                DataroomCollaborator.objects.get_or_create(
                    dataroom=locked_dataroom,
                    user=prev_owner,
                    defaults={'invited_by': request.user, 'role': DataroomCollaborator.ROLE_COLLABORATOR},
                )

            locked_dataroom.created_by = new_owner
            locked_dataroom.save()

        detail_serializer = DataroomDetailSerializer(locked_dataroom, context=self.get_serializer_context())
        return Response({
            "detail": f"Ownership successfully transferred to {new_owner.email}.",
            "dataroom": detail_serializer.data,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='upgrade-storage')
    def upgrade_storage(self, request, pk=None):
        dataroom = self.get_object()

        if dataroom.storage_version >= 2:
            return Response(
                {"detail": "Dataroom is already using modern storage architecture."},
                status=status.HTTP_200_OK,
            )

        success = upgrade_dataroom_to_v2(dataroom)
        if not success:
            return Response(
                {"detail": "Failed to upgrade dataroom storage architecture."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        dataroom.refresh_from_db()
        detail_serializer = DataroomDetailSerializer(dataroom, context=self.get_serializer_context())
        return Response(detail_serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get', 'post'], url_path='collaborators')
    def collaborators(self, request, pk=None):
        dataroom = self.get_object()

        if request.method == 'GET':
            collaborators_qs = dataroom.collaborators.select_related('user', 'invited_by').order_by('created_at')
            serializer = DataroomCollaboratorSerializer(collaborators_qs, many=True, context=self.get_serializer_context())
            owner_serializer = DataroomCollaboratorUserSerializer(dataroom.created_by, context=self.get_serializer_context()) if dataroom.created_by else None
            return Response({
                'owner': owner_serializer.data if owner_serializer else None,
                'collaborators': serializer.data,
                'total_count': len(serializer.data),
            }, status=status.HTTP_200_OK)

        # POST: Add collaborator(s)
        if dataroom.storage_version < 2:
            return Response(
                {"detail": "This dataroom uses legacy storage (v1). Please upgrade to modern storage to invite collaborators."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DataroomAddCollaboratorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_ids = serializer.validated_data.get('user_ids', [])
        email = serializer.validated_data.get('email', '').strip()

        users_to_add = []
        if email:
            target_user = User.objects.filter(
                organization=request.user.organization,
                email__iexact=email,
                is_active=True,
            ).first()
            if not target_user:
                return Response(
                    {"detail": f"User with email '{email}' was not found in your organization."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            users_to_add.append(target_user)

        if user_ids:
            found_users = User.objects.filter(
                organization=request.user.organization,
                id__in=user_ids,
                is_active=True,
            )
            if found_users.count() != len(user_ids):
                return Response(
                    {"detail": "One or more selected users were not found in your organization."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            users_to_add.extend(list(found_users))

        seen_ids = set()
        deduped_users = []
        for u in users_to_add:
            if u.id not in seen_ids:
                seen_ids.add(u.id)
                deduped_users.append(u)

        owner_conflicts = [u for u in deduped_users if u.id == dataroom.created_by_id]
        if owner_conflicts:
            return Response(
                {"detail": f"User '{owner_conflicts[0].email}' is already the owner of this dataroom."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_collaborators = []
        with transaction.atomic():
            for target_user in deduped_users:
                collab, created = DataroomCollaborator.objects.get_or_create(
                    dataroom=dataroom,
                    user=target_user,
                    defaults={'invited_by': request.user, 'role': DataroomCollaborator.ROLE_COLLABORATOR},
                )
                if created:
                    created_collaborators.append(collab)

        response_serializer = DataroomCollaboratorSerializer(
            dataroom.collaborators.select_related('user', 'invited_by').order_by('created_at'),
            many=True,
            context=self.get_serializer_context(),
        )
        return Response({
            "detail": f"Successfully added {len(created_collaborators)} collaborator(s).",
            "collaborators": response_serializer.data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'collaborators/(?P<user_id>[^/.]+)')
    def remove_collaborator(self, request, pk=None, user_id=None):
        dataroom = self.get_object()

        collaborator = DataroomCollaborator.objects.filter(
            dataroom=dataroom,
            user_id=user_id,
        ).first()

        if not collaborator:
            return Response(
                {"detail": "Collaborator not found in this dataroom."},
                status=status.HTTP_404_NOT_FOUND,
            )

        collaborator.delete()
        return Response({"detail": "Collaborator removed successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='eligible-collaborators')
    def eligible_collaborators(self, request, pk=None):
        dataroom = self.get_object()

        existing_collaborator_user_ids = set(
            dataroom.collaborators.values_list('user_id', flat=True)
        )
        if dataroom.created_by_id:
            existing_collaborator_user_ids.add(dataroom.created_by_id)

        query = request.query_params.get('q', '').strip()
        qs = User.objects.filter(
            organization=request.user.organization,
            is_active=True,
        ).exclude(id__in=existing_collaborator_user_ids)

        if query:
            qs = qs.filter(
                Q(email__icontains=query) | Q(name__icontains=query)
            )

        serializer = DataroomCollaboratorUserSerializer(qs.order_by('name', 'email')[:50], many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
