import logging
import os
from pathlib import Path

from django.utils.translation import gettext_lazy as _
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, APIException
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from backend.utils import get_unique_name
from core.models import User
from documents.models import Document, Folder
from core.pagination import StandardResultsSetPagination
from documents.services import (
    delete_folder_and_contents,
    check_user_quota_on_upload,
    QuotaExceededError,
    generate_storage_key,
    create_document_from_upload,
    validate_storage_key,
    ensure_storage_key_not_claimed,
)

from documents.fileserver import fileserver_client
from sharelinks.models import DataroomVisit, ViewSession
from sharelinks.serializers import ViewSessionSerializer
from .models import (
    Dataroom,
    DataroomBannerImage,
    DataroomCollaborator,
    DataroomDocument,
    DataroomFolder,
    DataroomItemOrder,
)
from .services import (
    delete_dataroom,
    remove_dataroom_content,
    touch_dataroom_folder_ancestors,
    get_or_create_dataroom_storage_folder,
    upgrade_dataroom_to_v2,
    sync_dataroom_rename,
    sync_dataroom_folder_rename,
    sync_dataroom_document_rename,
    get_dataroom_storage_used_bytes,
)
from .utils import (
    get_dataroom_storage_folder_name,
    build_ordered_dataroom_items,
    is_dataroom_owner_or_admin,
    is_dataroom_collaborator_or_above,
)
from .serializers import (
    AddContentSerializer, DataroomDetailSerializer,
    DataroomDocumentSerializer, DataroomDocumentUpdateSerializer,
    DataroomFolderSerializer, DataroomSerializer,
    DataroomCollaboratorSerializer, DataroomCollaboratorUserSerializer,
    DataroomAddCollaboratorSerializer, DataroomTransferOwnershipSerializer,
    MoveDataroomContentSerializer, RemoveContentSerializer,
    ReorderDataroomItemsSerializer, EnsureDataroomFolderPathsSerializer,
    DataroomUploadRequestSerializer, DataroomUploadFinalizeSerializer,
    DataroomBannerImageSerializer, DataroomBannerImageReorderItemSerializer,
    MAX_BANNER_IMAGES_PER_DATAROOM,
)


logger = logging.getLogger(__name__)


def get_dataroom_queryset_for_user(user):
    """
    Returns the queryset of datarooms accessible to a given user:
    - If user is an org admin: all datarooms in their organization.
    - Otherwise: datarooms created by the user OR where the user is a collaborator.
    """
    if getattr(user, 'role', '') == 'admin':
        return Dataroom.objects.filter(organization=user.organization)
    return Dataroom.objects.filter(
        Q(created_by=user) | Q(collaborators__user=user),
        organization=user.organization
    ).distinct()


@extend_schema(tags=['datarooms'])
class DataroomViewSet(viewsets.ModelViewSet):
    queryset = Dataroom.objects.all()
    serializer_class = DataroomSerializer

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DataroomDetailSerializer
        return DataroomSerializer

    def get_queryset(self):
        """
        Returns datarooms accessible to the requesting user, with optional scope filtering.
        In the standard user workspace list, both admins and members see only rooms they
        participate in (created_by or collaborator). Enterprise governance is handled via
        /api/v1/admin/datarooms/.
        """
        user = self.request.user
        if self.action != 'list' and getattr(user, 'role', '') == 'admin':
            qs = Dataroom.objects.filter(organization=user.organization)
        else:
            qs = Dataroom.objects.filter(
                Q(created_by=user) | Q(collaborators__user=user),
                organization=user.organization
            ).distinct()

        scope = self.request.query_params.get('scope')
        if scope == 'created_by_me':
            qs = qs.filter(created_by=user)
        elif scope == 'shared_with_me':
            qs = qs.filter(collaborators__user=user)
        return qs.select_related('created_by').prefetch_related('collaborators', 'collaborators__user').order_by('-created_at', '-id')

    def perform_create(self, serializer):
        """
        Automatically assign the organization and creator from the request user.
        """
        serializer.save(
            organization=self.request.user.organization,
            created_by=self.request.user
        )

    def perform_destroy(self, instance):
        if not is_dataroom_owner_or_admin(self.request.user, instance):
            raise PermissionDenied("Only the dataroom owner or an organization admin can delete this dataroom.")
        delete_dataroom(instance)

    def perform_update(self, serializer):
        old_name = self.get_object().name
        instance = serializer.save()
        sync_dataroom_rename(instance, old_name)

    def _scope_has_item_order_rows(self, dataroom, parent_folder):
        return DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=parent_folder).exists()

    def _append_item_order(self, dataroom, parent_folder, item_type, folder=None, dataroom_document=None):
        current_max = (
            DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=parent_folder)
            .order_by("-position")
            .values_list("position", flat=True)
            .first()
        )
        next_position = (current_max + 1) if current_max is not None else 0
        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=parent_folder,
            item_type=item_type,
            folder=folder,
            dataroom_document=dataroom_document,
            position=next_position,
        )

    def _collect_all_folder_document_ids(self, folders, user):
        collected_doc_ids = set()
        stack = list(folders)
        while stack:
            current = stack.pop()
            collected_doc_ids.update(
                current.documents.active().filter(created_by=user).values_list('id', flat=True)
            )
            stack.extend(list(current.children.active().filter(created_by=user)))
        return collected_doc_ids

    def _replicate_folder_structure(self, dataroom, source_folder, parent_dataroom_folder, requesting_user):
        """
        Recursively replicates a source folder structure and its documents
        into a dataroom.
        """
        # Create a new DataroomFolder for the source folder.
        new_dataroom_folder = DataroomFolder.objects.create(
            dataroom=dataroom,
            name=source_folder.name,
            parent=parent_dataroom_folder,
            created_by=requesting_user or getattr(source_folder, 'created_by', None) or dataroom.created_by,
        )
        if dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, parent_dataroom_folder):
            self._append_item_order(
                dataroom=dataroom,
                parent_folder=parent_dataroom_folder,
                item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                folder=new_dataroom_folder,
            )

        # Add documents from the source folder to the new dataroom folder.
        for doc in source_folder.documents.filter(created_by=requesting_user):
            unique_name = self._get_unique_dataroom_document_name(
                dataroom, new_dataroom_folder, doc.name
            )
            created_doc = DataroomDocument.objects.create(
                dataroom=dataroom,
                document=doc,
                folder=new_dataroom_folder,
                name=unique_name,
                is_direct_upload=False,
            )
            if dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, new_dataroom_folder):
                self._append_item_order(
                    dataroom=dataroom,
                    parent_folder=new_dataroom_folder,
                    item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
                    dataroom_document=created_doc,
                )

        # Recurse for subfolders.
        for subfolder in source_folder.children.filter(created_by=requesting_user):
            self._replicate_folder_structure(dataroom, subfolder, new_dataroom_folder, requesting_user)

    @action(detail=True, methods=['post'], url_path='add-content')
    def add_content(self, request, pk=None):
        dataroom = self.get_object()
        serializer = AddContentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        doc_ids = data.get('document_ids', [])
        folder_ids = data.get('folder_ids', [])
        dest_folder_id = data.get('destination_folder_id')

        destination_folder = None
        if dest_folder_id:
            destination_folder = get_object_or_404(DataroomFolder, id=dest_folder_id, dataroom=dataroom)

        try:
            with transaction.atomic():
                locked_dataroom = Dataroom.objects.select_for_update().get(id=dataroom.id)

                # Add individual documents.
                docs_to_add = Document.objects.active().filter(id__in=doc_ids, created_by=request.user)
                if docs_to_add.count() != len(doc_ids):
                    raise PermissionDenied("You do not have permission to add one or more of the selected documents.")

                # Add folders and their contents recursively.
                folders_to_add = list(Folder.objects.active().filter(id__in=folder_ids, created_by=request.user))
                if len(folders_to_add) != len(folder_ids):
                    raise PermissionDenied("You do not have permission to add one or more of the selected folders.")

                # Check Dataroom storage quota cap under row lock
                if locked_dataroom.storage_quota_mb and locked_dataroom.storage_quota_mb > 0:
                    all_new_doc_ids = set(docs_to_add.values_list('id', flat=True)) | self._collect_all_folder_document_ids(folders_to_add, request.user)
                    existing_doc_ids = set(
                        DataroomDocument.objects.filter(dataroom=locked_dataroom).values_list('document_id', flat=True)
                    )
                    unique_added_ids = all_new_doc_ids - existing_doc_ids
                    additional_bytes = Document.objects.filter(
                        id__in=unique_added_ids,
                        deleted_at__isnull=True
                    ).aggregate(total=Sum('file_size'))['total'] or 0

                    current_usage = get_dataroom_storage_used_bytes(locked_dataroom)
                    room_quota_bytes = locked_dataroom.storage_quota_mb * 1024 * 1024
                    if current_usage + additional_bytes > room_quota_bytes:
                        return Response(
                            {
                                'detail': f"Adding these items would exceed the Dataroom storage limit of {locked_dataroom.storage_quota_mb} MB."
                            },
                            status=status.HTTP_400_BAD_REQUEST
                        )

                for doc in docs_to_add:
                    unique_name = self._get_unique_dataroom_document_name(
                        dataroom, destination_folder, doc.name
                    )
                    created_doc = DataroomDocument.objects.create(
                        dataroom=dataroom,
                        document=doc,
                        folder=destination_folder,
                        name=unique_name,
                        is_direct_upload=False,
                    )
                    if dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, destination_folder):
                        self._append_item_order(
                            dataroom=dataroom,
                            parent_folder=destination_folder,
                            item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
                            dataroom_document=created_doc,
                        )

                for folder in folders_to_add:
                    self._replicate_folder_structure(dataroom, folder, destination_folder, request.user)

                if destination_folder:
                    touch_dataroom_folder_ancestors(destination_folder)

            return Response({"detail": "Content added successfully."}, status=status.HTTP_200_OK)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            logger.error(e)
            return Response({
                "detail": "An internal server error occurred while adding content."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='remove-content')
    def remove_content(self, request, pk=None):
        dataroom = self.get_object()
        serializer = RemoveContentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        dataroom_doc_ids = data.get('dataroom_document_ids', [])
        dataroom_folder_ids = data.get('dataroom_folder_ids', [])

        remove_dataroom_content(dataroom, dataroom_doc_ids, dataroom_folder_ids)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _get_unique_dataroom_folder_name(self, dataroom, parent_folder, original_name):
        filter_kwargs = {
            'dataroom': dataroom, 'parent': parent_folder
        }
        return get_unique_name(DataroomFolder, original_name, filter_kwargs, has_extension=False)

    def _get_unique_dataroom_document_name(self, dataroom, parent_folder, original_name):
        filter_kwargs = {
            'dataroom': dataroom,
            'folder': parent_folder
        }
        return get_unique_name(DataroomDocument, original_name, filter_kwargs, has_extension=True)

    @action(detail=True, methods=['post'], url_path='reorder-items')
    def reorder_items(self, request, pk=None):
        dataroom = self.get_object()
        serializer = ReorderDataroomItemsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        parent_id = serializer.validated_data.get('parent_id') or None
        ordered_items = serializer.validated_data['ordered_items']

        parent = None
        if parent_id:
            parent = get_object_or_404(DataroomFolder, id=parent_id, dataroom=dataroom)

        with transaction.atomic():
            locked_dataroom = Dataroom.objects.select_for_update().get(id=dataroom.id)

            existing_folders = DataroomFolder.objects.filter(dataroom=locked_dataroom, parent=parent)
            existing_documents = DataroomDocument.objects.filter(dataroom=locked_dataroom, folder=parent, document__deleted_at__isnull=True)

            existing_item_keys = {
                *{("folder", str(folder_id)) for folder_id in existing_folders.values_list('id', flat=True)},
                *{("document", str(doc_id)) for doc_id in existing_documents.values_list('id', flat=True)},
            }
            requested_item_keys = {(item["type"], str(item["id"])) for item in ordered_items}

            if existing_item_keys != requested_item_keys:
                return Response(
                    {"detail": "ordered_items must include all and only items in the target scope."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            folder_ids = [item["id"] for item in ordered_items if item["type"] == "folder"]
            doc_ids = [item["id"] for item in ordered_items if item["type"] == "document"]

            # Clear all existing order rows for this scope to prevent
            # UniqueConstraint collisions and OneToOne validation errors.
            DataroomItemOrder.objects.filter(dataroom=locked_dataroom, parent_folder=parent).delete()
            # Also clear any order rows for these specific items in case they originated elsewhere
            DataroomItemOrder.objects.filter(dataroom=locked_dataroom, folder_id__in=folder_ids).delete()
            DataroomItemOrder.objects.filter(dataroom=locked_dataroom, dataroom_document_id__in=doc_ids).delete()

            # Recreate them in the new sequence using bulk_create to avoid N+1 query overhead.
            orders_to_create = []
            for position, item in enumerate(ordered_items):
                if item["type"] == "folder":
                    orders_to_create.append(
                        DataroomItemOrder(
                            dataroom=locked_dataroom,
                            parent_folder=parent,
                            item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                            folder_id=item["id"],
                            position=position,
                        )
                    )
                else:
                    orders_to_create.append(
                        DataroomItemOrder(
                            dataroom=locked_dataroom,
                            parent_folder=parent,
                            item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
                            dataroom_document_id=item["id"],
                            position=position,
                        )
                    )
            DataroomItemOrder.objects.bulk_create(orders_to_create)

        return Response({"detail": "Items reordered successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='move-content')
    def move_content(self, request, pk=None):
        dataroom = self.get_object()
        serializer = MoveDataroomContentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        doc_ids = data.get('dataroom_document_ids', [])
        folder_ids = data.get('dataroom_folder_ids', [])
        dest_folder_id = data.get('destination_folder_id')

        try:
            with transaction.atomic():
                destination_folder = None
                if dest_folder_id:
                    destination_folder = get_object_or_404(
                        DataroomFolder, id=dest_folder_id, dataroom=dataroom
                    )

                # TODO: This loop executes a save() for each document being moved, which can cause performance issues
                # (N+1 queries) when moving many documents. This should be converted to use bulk_update.
                source_folders = set()
                docs_to_move = DataroomDocument.objects.filter(id__in=doc_ids, dataroom=dataroom)
                docs_changed_parent = []
                for doc in docs_to_move:
                    old_folder = doc.folder
                    if old_folder != destination_folder:
                        docs_changed_parent.append(doc)
                        if old_folder:
                            source_folders.add(old_folder)
                        doc.name = self._get_unique_dataroom_document_name(dataroom, destination_folder, doc.name)
                        doc.folder = destination_folder
                        doc.save()

                folders_to_move = DataroomFolder.objects.filter(id__in=folder_ids, dataroom=dataroom)
                folders_changed_parent = []
                for folder in folders_to_move:
                    if folder.id == dest_folder_id:
                        raise serializers.ValidationError("Cannot move a folder into itself.")
                    old_parent = folder.parent
                    if old_parent != destination_folder:
                        folders_changed_parent.append(folder)
                        if old_parent:
                            source_folders.add(old_parent)
                        folder.name = self._get_unique_dataroom_folder_name(dataroom, destination_folder, folder.name)
                        folder.parent = destination_folder
                        folder.save()

                for src_folder in source_folders:
                    touch_dataroom_folder_ancestors(src_folder)
                if destination_folder and (docs_changed_parent or folders_changed_parent):
                    touch_dataroom_folder_ancestors(destination_folder)

                # Clear old order rows for items that actually changed parent folders
                if folders_changed_parent:
                    DataroomItemOrder.objects.filter(dataroom=dataroom, folder__in=folders_changed_parent).delete()
                if docs_changed_parent:
                    DataroomItemOrder.objects.filter(dataroom=dataroom, dataroom_document__in=docs_changed_parent).delete()

                # If destination scope uses custom ordering, append items that changed parent to the end
                if (folders_changed_parent or docs_changed_parent) and self._scope_has_item_order_rows(dataroom, destination_folder):
                    for folder in folders_changed_parent:
                        self._append_item_order(
                            dataroom, destination_folder, DataroomItemOrder.ITEM_TYPE_FOLDER, folder=folder
                        )
                    for doc in docs_changed_parent:
                        self._append_item_order(
                            dataroom, destination_folder, DataroomItemOrder.ITEM_TYPE_DOCUMENT, dataroom_document=doc
                        )

            return Response({"detail": "Content moved successfully."}, status=status.HTTP_200_OK)
        except serializers.ValidationError as e:
            return Response({"detail": str(e.detail)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(e)
            return Response({
                "detail": "An internal server error occurred while moving content."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], url_path='view-sessions')
    def view_sessions(self, request, pk=None):

        dataroom = self.get_object()
        view_queryset = ViewSession.objects.filter(
            share_link__dataroom=dataroom
        ).order_by('-viewed_at').select_related('share_link').prefetch_related('dataroom_visits__page_views')

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(view_queryset, request, view=self)
        if page is not None:
            serializer = ViewSessionSerializer(page, many=True, context=self.get_serializer_context())
            return paginator.get_paginated_response(serializer.data)

        serializer = ViewSessionSerializer(view_queryset, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        dataroom = self.get_object()
        sessions = ViewSession.objects.filter(share_link__dataroom=dataroom)

        aggregates = sessions.aggregate(
            total_views=Count('id'),
            total_duration_seconds=Sum('duration_seconds'),
            engaged_views=Count('id', filter=Q(duration_seconds__gt=0)),
            session_downloads=Count('id', filter=Q(downloaded_at__isnull=False)),
        )

        total_views = aggregates['total_views']
        total_duration = aggregates['total_duration_seconds'] or 0
        engaged_views = aggregates['engaged_views'] or 0
        avg_duration = total_duration / engaged_views if engaged_views > 0 else 0

        # Unique viewers: count distinct identified emails + distinct anonymous IPs.
        # Records missing both email and IP are omitted.
        unique_emails = sessions.filter(~Q(viewer_email='')).values('viewer_email').distinct().count()
        unique_anon_ips = sessions.filter(
            Q(viewer_email='') & Q(ip_address__isnull=False)
        ).values('ip_address').distinct().count()
        unique_viewers = unique_emails + unique_anon_ips

        # Combine direct session downloads with downloads of specific documents/folders within dataroom visits
        visit_downloads = DataroomVisit.objects.filter(
            view_session__share_link__dataroom=dataroom,
            downloaded_at__isnull=False
        ).count()
        total_downloads = (aggregates['session_downloads'] or 0) + visit_downloads

        return Response({
            'total_views': total_views,
            'unique_viewers': unique_viewers,
            'total_duration_seconds': total_duration,
            'avg_duration_seconds': avg_duration,
            'total_downloads': total_downloads,
        })

    def _ensure_library_folder_path(self, requesting_user, dataroom, relative_path=None):
        """
        Ensures backing Folder structure exists via get_or_create_dataroom_storage_folder.
        """
        return get_or_create_dataroom_storage_folder(
            dataroom=dataroom,
            requesting_user=requesting_user,
            relative_path=relative_path
        )

    @action(detail=True, methods=['post'], url_path='ensure-paths')
    def ensure_paths(self, request, pk=None):
        dataroom = self.get_object()
        serializer = EnsureDataroomFolderPathsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        paths = serializer.validated_data['paths']
        parent_folder = serializer.validated_data.get('parent_folder_id')

        if parent_folder and parent_folder.dataroom != dataroom:
            return Response(
                {"detail": "Parent folder does not belong to this dataroom."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                top_level_dirs = {Path(p).parts[0] for p in paths if Path(p).parts}
                path_mappings = {}
                for original_name in top_level_dirs:
                    unique_name = self._get_unique_dataroom_folder_name(
                        dataroom=dataroom,
                        parent_folder=parent_folder,
                        original_name=original_name
                    )
                    path_mappings[original_name] = unique_name

                all_required_paths = set()
                for path_str in paths:
                    p = Path(path_str)
                    if not p.parts:
                        continue

                    original_top_level = p.parts[0]
                    renamed_top_level = path_mappings.get(original_top_level, original_top_level)

                    new_path_parts = [renamed_top_level] + list(p.parts[1:])
                    new_p = Path(*new_path_parts)

                    all_required_paths.add(str(new_p))
                    for parent in new_p.parents:
                        if parent != Path('.'):
                            all_required_paths.add(str(parent))

                sorted_paths = sorted(list(all_required_paths), key=lambda p: p.count(os.sep))
                path_to_folder_map = {'': parent_folder}

                any_created = False
                for path_str in sorted_paths:
                    path = Path(path_str)
                    parent_path_str = str(path.parent) if path.parent != Path('.') else ''

                    parent_dataroom_folder = path_to_folder_map.get(parent_path_str)
                    if not parent_dataroom_folder and parent_path_str != '':
                        return Response(
                            {"detail": f"An error occurred: parent folder for '{path_str}' not found."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        )

                    folder_name = path.name
                    folder, created = DataroomFolder.objects.get_or_create(
                        dataroom=dataroom,
                        parent=parent_dataroom_folder,
                        name=folder_name,
                        defaults={'created_by': request.user},
                    )
                    path_to_folder_map[path_str] = folder
                    if created:
                        any_created = True

                    if created and dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, parent_dataroom_folder):
                        self._append_item_order(
                            dataroom=dataroom,
                            parent_folder=parent_dataroom_folder,
                            item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                            folder=folder,
                        )

                if any_created and parent_folder:
                    touch_dataroom_folder_ancestors(parent_folder)

            return Response(
                {
                    "detail": "Folder structure ensured successfully.",
                    "path_mappings": path_mappings,
                },
                status=status.HTTP_201_CREATED
            )
        except Exception as e:
            logger.exception("Failed to ensure dataroom folder paths: %s", paths)
            return Response(
                {"detail": "An unexpected error occurred while creating the folder structure."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='uploads/request')
    def upload_request(self, request, pk=None):
        dataroom = self.get_object()
        serializer = DataroomUploadRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data

        # Check Dataroom storage quota cap (0 means unlimited)
        if dataroom.storage_quota_mb and dataroom.storage_quota_mb > 0:
            current_room_usage = get_dataroom_storage_used_bytes(dataroom)
            room_quota_bytes = dataroom.storage_quota_mb * 1024 * 1024
            if current_room_usage + validated_data['file_size'] > room_quota_bytes:
                return Response(
                    {'detail': f"Uploading this file would exceed the Dataroom storage limit of {dataroom.storage_quota_mb} MB."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # For legacy v1 datarooms whose backing storage resides in personal storage ('Dataroom Uploads'),
        # enforce user personal storage quota. Modern v2 system vaults bypass user quota.
        if dataroom.storage_version < 2:
            try:
                check_user_quota_on_upload(request.user, validated_data['file_size'])
            except QuotaExceededError as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        file_name = validated_data['file_name']
        relative_path = validated_data.get('path')
        destination_folder = validated_data.get('destination_folder_id')

        if destination_folder and destination_folder.dataroom != dataroom:
            return Response(
                {"detail": "Destination folder does not belong to this dataroom."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if relative_path:
            folder_path, file_name_from_path = os.path.split(relative_path)
            if folder_path:
                current_folder = None
                path_parts = Path(folder_path).parts
                try:
                    for part in path_parts:
                        current_folder = DataroomFolder.objects.get(
                            dataroom=dataroom,
                            parent=current_folder,
                            name=part
                        )
                    destination_folder = current_folder
                except DataroomFolder.DoesNotExist:
                    return Response(
                        {"detail": f"Folder path '{folder_path}' does not exist in this dataroom."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            if file_name_from_path:
                file_name = file_name_from_path

        unique_name = self._get_unique_dataroom_document_name(
            dataroom=dataroom,
            parent_folder=destination_folder,
            original_name=file_name
        )

        storage_key = generate_storage_key(request.user.organization.id, unique_name)

        try:
            upload_url = fileserver_client.generate_upload_url(storage_key, is_internal=False)
        except APIException as e:
            logger.error(f"Failed to get upload URL from file server: {e}")
            return Response({"detail": str(e.detail)}, status=e.status_code)

        return Response({
            'upload_url': upload_url,
            'storage_key': storage_key,
            'unique_name': unique_name,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='uploads/finalize')
    def upload_finalize(self, request, pk=None):
        dataroom = self.get_object()
        serializer = DataroomUploadFinalizeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        try:
            validated_data['storage_key'] = validate_storage_key(
                validated_data['storage_key'], dataroom.organization.id
            )
            ensure_storage_key_not_claimed(
                validated_data['storage_key'], dataroom.organization.id
            )
        except serializers.ValidationError as e:
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)

        try:
            file_info = fileserver_client.get_file_info(validated_data['storage_key'])
        except APIException as e:
            logger.error(f"Failed to check file info for key {validated_data['storage_key']}: {e}")
            return Response(
                {"detail": "Failed to verify file on storage server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        if not file_info or not file_info.get('exists') or file_info.get('size', 0) <= 0:
            return Response(
                {"detail": "Uploaded file not found on storage server."},
                status=status.HTTP_400_BAD_REQUEST
            )

        actual_file_size = file_info['size']

        destination_folder = validated_data.get('destination_folder_id')

        relative_path = validated_data.get('path')

        if destination_folder and destination_folder.dataroom != dataroom:
            return Response(
                {"detail": "Destination folder does not belong to this dataroom."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if relative_path:
            folder_path, _ = os.path.split(relative_path)
            if folder_path:
                current_folder = None
                path_parts = Path(folder_path).parts
                try:
                    for part in path_parts:
                        current_folder = DataroomFolder.objects.get(
                            dataroom=dataroom,
                            parent=current_folder,
                            name=part
                        )
                    destination_folder = current_folder
                except DataroomFolder.DoesNotExist:
                    return Response(
                        {"detail": f"Folder path '{folder_path}' does not exist in this dataroom."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        library_folder = self._ensure_library_folder_path(
            requesting_user=request.user,
            dataroom=dataroom,
            relative_path=relative_path
        )

        try:
            with transaction.atomic():
                locked_dataroom = Dataroom.objects.select_for_update().get(id=dataroom.id)
                if locked_dataroom.storage_quota_mb and locked_dataroom.storage_quota_mb > 0:
                    current_room_usage = get_dataroom_storage_used_bytes(locked_dataroom)
                    room_quota_bytes = locked_dataroom.storage_quota_mb * 1024 * 1024
                    if current_room_usage + actual_file_size > room_quota_bytes:
                        return Response(
                            {
                                'detail': f"Uploading this file would exceed the Dataroom storage limit of {locked_dataroom.storage_quota_mb} MB."
                            },
                            status=status.HTTP_400_BAD_REQUEST
                        )

                # Modern v2 system vaults (__datarooms__) do not track user personal quota.
                # Legacy v1 uploads reside in personal storage ('Dataroom Uploads') and track user quota.
                track_user_quota = (locked_dataroom.storage_version < 2)
                document = create_document_from_upload(
                    requesting_user=request.user,
                    folder=library_folder,
                    storage_key=validated_data['storage_key'],
                    unique_name=validated_data['unique_name'],
                    file_size=actual_file_size,
                    content_type=validated_data['content_type'],
                    track_user_quota=track_user_quota,
                )

                unique_name = self._get_unique_dataroom_document_name(
                    dataroom=dataroom,
                    parent_folder=destination_folder,
                    original_name=document.name
                )
                dataroom_doc = DataroomDocument.objects.create(
                    dataroom=dataroom,
                    document=document,
                    folder=destination_folder,
                    name=unique_name,
                    is_direct_upload=True,
                )

                if dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, destination_folder):
                    self._append_item_order(
                        dataroom=dataroom,
                        parent_folder=destination_folder,
                        item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
                        dataroom_document=dataroom_doc,
                    )

                if destination_folder:
                    touch_dataroom_folder_ancestors(destination_folder)
        except serializers.ValidationError as e:
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Failed to finalize dataroom document upload: {e}")
            return Response(
                {"detail": f"Failed to finalize dataroom document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        doc_serializer = DataroomDocumentSerializer(dataroom_doc, context={'request': request})
        return Response(doc_serializer.data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['get', 'post'], url_path='collaborators')
    def collaborators(self, request, pk=None):
        dataroom = self.get_object()

        # Design decision: GET is intentionally accessible to all room members (owner,
        # admin, and invited collaborators scoped via get_queryset) to display collaboration
        # presence (e.g., CollaboratorsAvatarGroup in header) and support self-leave workflows.
        # Mutating actions (POST, DELETE of others) are strictly guarded for owners and admins.
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
        if not is_dataroom_owner_or_admin(request.user, dataroom):
            raise PermissionDenied("Only the dataroom owner or an organization admin can add collaborators.")

        if dataroom.storage_version < 2:
            return Response(
                {"detail": "This dataroom uses legacy storage (v1). Please upgrade to modern storage to invite collaborators."},
                status=status.HTTP_400_BAD_REQUEST
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
                is_active=True
            ).first()
            if not target_user:
                return Response(
                    {"detail": f"User with email '{email}' was not found in your organization."},
                    status=status.HTTP_404_NOT_FOUND
                )
            users_to_add.append(target_user)

        if user_ids:
            found_users = User.objects.filter(
                organization=request.user.organization,
                id__in=user_ids,
                is_active=True
            )
            if found_users.count() != len(user_ids):
                return Response(
                    {"detail": "One or more selected users were not found in your organization."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            users_to_add.extend(list(found_users))

        # Filter out duplicates while preserving order
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
                status=status.HTTP_400_BAD_REQUEST
            )

        created_collaborators = []
        with transaction.atomic():
            for target_user in deduped_users:
                collab, created = DataroomCollaborator.objects.get_or_create(
                    dataroom=dataroom,
                    user=target_user,
                    defaults={'invited_by': request.user, 'role': DataroomCollaborator.ROLE_COLLABORATOR}
                )
                if created:
                    created_collaborators.append(collab)

        response_serializer = DataroomCollaboratorSerializer(
            dataroom.collaborators.select_related('user', 'invited_by').order_by('created_at'),
            many=True,
            context=self.get_serializer_context()
        )
        return Response({
            "detail": f"Successfully added {len(created_collaborators)} collaborator(s).",
            "collaborators": response_serializer.data,
        }, status=status.HTTP_201_CREATED)

    @extend_schema(
        methods=['delete'],
        operation_id='v1_datarooms_collaborators_remove',
        parameters=[
            OpenApiParameter('user_id', type=OpenApiTypes.UUID, location=OpenApiParameter.PATH,
                             description='UUID of the collaborator user to remove.'),
        ],
    )
    @extend_schema(
        methods=['post'],
        operation_id='v1_datarooms_collaborators_leave',
        parameters=[
            OpenApiParameter('user_id', type=OpenApiTypes.UUID, location=OpenApiParameter.PATH,
                             description='UUID of the collaborator user leaving the dataroom.'),
        ],
    )
    @action(detail=True, methods=['delete', 'post'], url_path=r'collaborators/(?P<user_id>[^/.]+)')
    def remove_collaborator(self, request, pk=None, user_id=None):
        dataroom = self.get_object()

        # Permission check: Owner, Admin, or the user themselves leaving
        is_self_removal = str(request.user.id) == str(user_id)
        if not (is_self_removal or is_dataroom_owner_or_admin(request.user, dataroom)):
            raise PermissionDenied("You do not have permission to remove this collaborator.")

        collaborator = DataroomCollaborator.objects.filter(
            dataroom=dataroom,
            user_id=user_id
        ).first()

        if not collaborator:
            return Response(
                {"detail": "Collaborator not found in this dataroom."},
                status=status.HTTP_404_NOT_FOUND
            )

        collaborator.delete()
        return Response({"detail": "Collaborator removed successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='transfer-ownership')
    def transfer_ownership(self, request, pk=None):
        dataroom = self.get_object()

        if not is_dataroom_owner_or_admin(request.user, dataroom):
            raise PermissionDenied("Only the dataroom owner or an organization admin can transfer ownership.")

        if dataroom.storage_version < 2:
            return Response(
                {"detail": "This dataroom uses legacy storage (v1). Please upgrade to modern storage before transferring ownership."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DataroomTransferOwnershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_owner_id = serializer.validated_data['new_owner_id']
        new_owner = User.objects.filter(
            id=new_owner_id,
            organization=request.user.organization,
            is_active=True
        ).first()

        if not new_owner:
            return Response(
                {"detail": "Target user was not found in your organization."},
                status=status.HTTP_404_NOT_FOUND
            )

        if new_owner.id == dataroom.created_by_id:
            return Response(
                {"detail": "User is already the owner of this dataroom."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            locked_dataroom = Dataroom.objects.select_for_update().get(id=dataroom.id)
            prev_owner = locked_dataroom.created_by

            # Remove new owner from collaborators list if they were a collaborator
            DataroomCollaborator.objects.filter(dataroom=locked_dataroom, user=new_owner).delete()

            # Make the previous owner a collaborator if they exist
            if prev_owner and prev_owner != new_owner:
                DataroomCollaborator.objects.get_or_create(
                    dataroom=locked_dataroom,
                    user=prev_owner,
                    defaults={'invited_by': request.user, 'role': DataroomCollaborator.ROLE_COLLABORATOR}
                )

            locked_dataroom.created_by = new_owner
            locked_dataroom.save()

        detail_serializer = DataroomDetailSerializer(locked_dataroom, context=self.get_serializer_context())
        return Response({
            "detail": f"Ownership successfully transferred to {new_owner.email}.",
            "dataroom": detail_serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='upgrade-storage')
    def upgrade_storage(self, request, pk=None):
        dataroom = self.get_object()
        if not is_dataroom_owner_or_admin(request.user, dataroom):
            raise PermissionDenied("Only the dataroom owner or an organization admin can upgrade this dataroom.")

        if dataroom.storage_version >= 2:
            return Response(
                {"detail": "Dataroom is already using modern storage architecture."},
                status=status.HTTP_200_OK
            )

        success = upgrade_dataroom_to_v2(dataroom)
        if not success:
            return Response(
                {"detail": "Failed to upgrade dataroom storage architecture."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        dataroom.refresh_from_db()
        detail_serializer = DataroomDetailSerializer(dataroom, context=self.get_serializer_context())
        return Response(detail_serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='eligible-collaborators')
    def eligible_collaborators(self, request, pk=None):
        dataroom = self.get_object()

        if not is_dataroom_collaborator_or_above(request.user, dataroom):
            raise PermissionDenied("You do not have permission to view eligible collaborators.")

        existing_collaborator_user_ids = set(
            dataroom.collaborators.values_list('user_id', flat=True)
        )
        if dataroom.created_by_id:
            existing_collaborator_user_ids.add(dataroom.created_by_id)

        query = request.query_params.get('q', '').strip()
        users_qs = User.objects.filter(
            organization=request.user.organization,
            is_active=True
        ).exclude(id__in=existing_collaborator_user_ids).order_by('name', 'email')

        if query:
            users_qs = users_qs.filter(
                Q(name__icontains=query) | Q(email__icontains=query)
            )

        serializer = DataroomCollaboratorUserSerializer(users_qs[:50], many=True, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get', 'post'], url_path='banner-images')
    def banner_images(self, request, pk=None):
        dataroom = self.get_object()
        if request.method.lower() == 'get':
            if not is_dataroom_collaborator_or_above(request.user, dataroom):
                raise PermissionDenied("You do not have permission to view banner images for this dataroom.")
            images = dataroom.banner_images.all().order_by('position', 'created_at')
            serializer = DataroomBannerImageSerializer(images, many=True, context=self.get_serializer_context())
            return Response(serializer.data, status=status.HTTP_200_OK)

        # POST: upload banner image
        if not is_dataroom_owner_or_admin(request.user, dataroom):
            raise PermissionDenied("Only the dataroom owner or an organization admin can add banner images.")

        serializer = DataroomBannerImageSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            locked_dataroom = Dataroom.objects.select_for_update().get(id=dataroom.id)
            if locked_dataroom.banner_images.count() >= MAX_BANNER_IMAGES_PER_DATAROOM:
                return Response(
                    {"detail": f"Maximum of {MAX_BANNER_IMAGES_PER_DATAROOM} banner images allowed per dataroom."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            position = serializer.validated_data.get('position')
            if 'position' not in request.data or position is None:
                max_pos = locked_dataroom.banner_images.order_by('-position').values_list('position', flat=True).first()
                position = (max_pos + 1) if max_pos is not None else 0

            instance = serializer.save(dataroom=locked_dataroom, position=position)

        return Response(
            DataroomBannerImageSerializer(instance, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'], url_path='banner-images/reorder')
    def reorder_banner_images(self, request, pk=None):
        dataroom = self.get_object()
        if not is_dataroom_owner_or_admin(request.user, dataroom):
            raise PermissionDenied("Only the dataroom owner or an organization admin can reorder banner images.")

        items_data = request.data
        if isinstance(items_data, dict) and 'items' in items_data:
            items_data = items_data['items']

        if not isinstance(items_data, list):
            return Response(
                {"detail": "Request body must be a list of {id, position} items or an object with an 'items' list."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DataroomBannerImageReorderItemSerializer(data=items_data, many=True)
        serializer.is_valid(raise_exception=True)

        existing_images = {str(img.id): img for img in dataroom.banner_images.all()}
        seen_ids = set()
        seen_positions = set()
        for item in serializer.validated_data:
            item_id = str(item['id'])
            pos = item['position']
            if item_id in seen_ids:
                return Response(
                    {"detail": f"Duplicate banner image id '{item_id}' in reorder payload."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            seen_ids.add(item_id)
            if pos in seen_positions:
                return Response(
                    {"detail": f"Duplicate position '{pos}' in reorder payload."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            seen_positions.add(pos)
            if item_id not in existing_images:
                return Response(
                    {"detail": f"Banner image with id '{item_id}' not found in this dataroom."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        with transaction.atomic():
            for item in serializer.validated_data:
                img = existing_images[str(item['id'])]
                img.position = item['position']
                img.save(update_fields=['position', 'updated_at'])

        images = dataroom.banner_images.all().order_by('position', 'created_at')
        return Response(
            DataroomBannerImageSerializer(images, many=True, context=self.get_serializer_context()).data,
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['patch', 'delete'], url_path=r'banner-images/(?P<banner_id>(?!reorder/|reorder$)[^/.]+)')
    def banner_image_detail(self, request, pk=None, banner_id=None):
        dataroom = self.get_object()
        if not is_dataroom_owner_or_admin(request.user, dataroom):
            raise PermissionDenied("Only the dataroom owner or an organization admin can modify banner images.")

        banner_image = dataroom.banner_images.filter(id=banner_id).first()
        if not banner_image:
            return Response(
                {"detail": "Banner image not found in this dataroom."},
                status=status.HTTP_404_NOT_FOUND
            )

        if request.method.lower() == 'delete':
            if banner_image.image:
                banner_image.image.delete(save=False)
            banner_image.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # PATCH
        serializer = DataroomBannerImageSerializer(
            banner_image, data=request.data, partial=True, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        updated_instance = serializer.save()
        return Response(
            DataroomBannerImageSerializer(updated_instance, context=self.get_serializer_context()).data,
            status=status.HTTP_200_OK
        )


class DataroomDocumentViewSet(mixins.RetrieveModelMixin,

                              mixins.UpdateModelMixin,
                              viewsets.GenericViewSet):
    queryset = DataroomDocument.objects.all()

    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return DataroomDocumentUpdateSerializer
        return DataroomDocumentSerializer

    def get_queryset(self):
        accessible_datarooms = get_dataroom_queryset_for_user(self.request.user)
        return self.queryset.filter(dataroom__in=accessible_datarooms).annotate(
            dataroom_view_count=Count('dataroomvisit', distinct=True)
        )

    def perform_update(self, serializer):
        instance = self.get_object()
        new_name = serializer.validated_data.get('name')
        old_name = instance.name
        old_folder = instance.folder

        if new_name and new_name != old_name:
            if DataroomDocument.objects.filter(
                dataroom=instance.dataroom,
                folder=instance.folder,
                name=new_name
            ).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError({'name': _('A document with this name already exists in this location.')})

        saved_doc = serializer.save()
        if saved_doc.folder:
            touch_dataroom_folder_ancestors(saved_doc.folder)
        if old_folder and old_folder != saved_doc.folder:
            touch_dataroom_folder_ancestors(old_folder)

        if new_name and new_name != old_name:
            sync_dataroom_document_rename(instance, new_name)


@extend_schema(tags=['datarooms'])
class DataroomFolderViewSet(viewsets.ModelViewSet):
    queryset = DataroomFolder.objects.all()
    serializer_class = DataroomFolderSerializer

    def get_queryset(self):
        """
        Retrieves folders that belong to a specific dataroom.
        The dataroom must belong to the user's organization.
        """
        accessible_datarooms = get_dataroom_queryset_for_user(self.request.user)
        queryset = self.queryset.filter(dataroom__in=accessible_datarooms).select_related('created_by', 'dataroom', 'dataroom__created_by')
        dataroom_id = self.request.query_params.get('dataroom_id')
        if dataroom_id:
            queryset = queryset.filter(dataroom_id=dataroom_id)
        return queryset

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # Custom logic to include sub-folders and documents
        sub_folders = instance.children.all().select_related('created_by', 'dataroom', 'dataroom__created_by').order_by('created_at', 'id')
        documents = DataroomDocument.objects.filter(
            folder=instance, document__deleted_at__isnull=True
        ).select_related('document', 'document__created_by').annotate(
            dataroom_view_count=Count('dataroomvisit', distinct=True)
        ).order_by('created_at', 'id')

        data = self.get_serializer(instance).data
        sub_folder_data = DataroomFolderSerializer(sub_folders, many=True).data
        document_data = DataroomDocumentSerializer(documents, many=True).data
        data['sub_folders'] = sub_folder_data
        data['documents'] = document_data

        scope_rows = list(
            DataroomItemOrder.objects.filter(dataroom=instance.dataroom, parent_folder=instance)
            .order_by("position", "created_at", "id")
        )
        data['items'] = build_ordered_dataroom_items(scope_rows, sub_folder_data, document_data)
        return Response(data)

    def perform_create(self, serializer):
        dataroom = serializer.validated_data['dataroom']
        if not is_dataroom_collaborator_or_above(self.request.user, dataroom):
            raise PermissionDenied("You do not have permission to add folders to this dataroom.")

        name = serializer.validated_data['name']
        parent = serializer.validated_data.get('parent')

        if DataroomFolder.objects.filter(dataroom=dataroom, parent=parent, name=name).exists():
            raise serializers.ValidationError({'name': _('A folder with this name already exists in this location.')})

        saved_folder = serializer.save(created_by=self.request.user)
        if saved_folder.parent:
            touch_dataroom_folder_ancestors(saved_folder.parent)
        if dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, parent):
            self._append_item_order(
                dataroom=dataroom,
                parent_folder=parent,
                item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                folder=saved_folder,
            )

    def _scope_has_item_order_rows(self, dataroom, parent_folder):
        return DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=parent_folder).exists()

    def _append_item_order(self, dataroom, parent_folder, item_type, folder=None, dataroom_document=None):
        current_max = (
            DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=parent_folder)
            .order_by('-position')
            .values_list('position', flat=True)
            .first()
        )
        next_position = 0 if current_max is None else current_max + 1
        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=parent_folder,
            item_type=item_type,
            folder=folder,
            dataroom_document=dataroom_document,
            position=next_position,
        )

    def perform_update(self, serializer):
        instance = self.get_object()
        new_name = serializer.validated_data.get('name')
        old_name = instance.name
        old_parent = instance.parent
        new_parent = serializer.validated_data.get('parent', old_parent)
        effective_name = new_name or old_name

        if (new_name is not None and new_name != old_name) or (new_parent != old_parent):
            if DataroomFolder.objects.filter(
                dataroom=instance.dataroom,
                parent=new_parent,
                name=effective_name
            ).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError({'name': _('A folder with this name already exists in this location.')})

        saved_folder = serializer.save()
        if saved_folder.parent:
            touch_dataroom_folder_ancestors(saved_folder.parent)
        if old_parent and old_parent != saved_folder.parent:
            touch_dataroom_folder_ancestors(old_parent)

        if new_name and new_name != old_name:
            sync_dataroom_folder_rename(instance, old_name, new_name)

    def perform_destroy(self, instance):
        remove_dataroom_content(instance.dataroom, dataroom_doc_ids=[], dataroom_folder_ids=[instance.id])
