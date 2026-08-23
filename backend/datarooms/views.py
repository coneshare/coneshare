import logging
import os
from pathlib import Path

from django.utils.translation import gettext_lazy as _
from django.db import transaction

from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, APIException
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from backend.utils import get_unique_name
from documents.models import Document, Folder
from core.pagination import StandardResultsSetPagination
from documents.services import (
    delete_folder_and_contents,
    check_user_quota_on_upload,
    QuotaExceededError,
    generate_storage_key,
    create_document_from_upload
)
from documents.fileserver import fileserver_client
from sharelinks.models import ViewSession
from sharelinks.serializers import ViewSessionSerializer
from .models import Dataroom, DataroomDocument, DataroomFolder, DataroomItemOrder
from .services import delete_dataroom, remove_dataroom_content
from .utils import get_dataroom_storage_folder_name, build_ordered_dataroom_items
from .serializers import (
    AddContentSerializer, DataroomDetailSerializer,
    DataroomDocumentSerializer, DataroomDocumentUpdateSerializer,
    DataroomFolderSerializer, DataroomSerializer,
    MoveDataroomContentSerializer, RemoveContentSerializer,
    ReorderDataroomItemsSerializer, EnsureDataroomFolderPathsSerializer,
    DataroomUploadRequestSerializer, DataroomUploadFinalizeSerializer)


logger = logging.getLogger(__name__)


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
        This queryset ensures that users can only list, retrieve, update, or
        delete datarooms they have created.
        """
        return self.queryset.filter(created_by=self.request.user)

    def perform_create(self, serializer):
        """
        Automatically assign the organization and creator from the request user.
        """
        serializer.save(
            organization=self.request.user.organization,
            created_by=self.request.user
        )

    def perform_destroy(self, instance):
        delete_dataroom(instance)

    def perform_update(self, serializer):
        old_name = self.get_object().name
        instance = serializer.save()
        if old_name != instance.name:
            # Rename the library folder if it exists
            root_folder = Folder.objects.get_root_for_org(instance.organization)
            if root_folder:
                dataroom_uploads_folder = Folder.objects.filter(
                    organization=instance.organization,
                    parent=root_folder,
                    name="Dataroom Uploads",
                    created_by=instance.created_by
                ).first()
                if dataroom_uploads_folder:
                    dataroom_folder = Folder.objects.filter(
                        organization=instance.organization,
                        parent=dataroom_uploads_folder,
                        name=get_dataroom_storage_folder_name(old_name, instance),
                        created_by=instance.created_by
                    ).first()
                    if dataroom_folder:
                        dataroom_folder.name = get_dataroom_storage_folder_name(instance.name, instance)
                        dataroom_folder.save()

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
        )
        if dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, parent_dataroom_folder):
            self._append_item_order(
                dataroom=dataroom,
                parent_folder=parent_dataroom_folder,
                item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                folder=new_dataroom_folder,
            )

        # TODO: For folders with many documents, this will result in many individual
        # database queries, causing a performance bottleneck. Consider refactoring
        # this to use bulk_create and bulk_update for better performance.
        # We could gather all documents to be created or updated into lists and
        # perform the database operations in batches outside the loop.

        # Add documents from the source folder to the new dataroom folder.
        # If a document is already in the dataroom, its folder will be updated.
        for doc in source_folder.documents.filter(created_by=requesting_user):
            unique_name = self._get_unique_dataroom_document_name(
                dataroom, new_dataroom_folder, doc.name
            )
            created_doc = DataroomDocument.objects.create(
                dataroom=dataroom,
                document=doc,
                folder=new_dataroom_folder,
                name=unique_name,
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
                # Add individual documents.
                docs_to_add = Document.objects.active().filter(id__in=doc_ids, created_by=request.user)
                if docs_to_add.count() != len(doc_ids):
                    raise PermissionDenied("You do not have permission to add one or more of the selected documents.")

                for doc in docs_to_add:
                    unique_name = self._get_unique_dataroom_document_name(
                        dataroom, destination_folder, doc.name
                    )
                    created_doc = DataroomDocument.objects.create(
                        dataroom=dataroom,
                        document=doc,
                        folder=destination_folder,
                        name=unique_name,
                    )
                    if dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, destination_folder):
                        self._append_item_order(
                            dataroom=dataroom,
                            parent_folder=destination_folder,
                            item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
                            dataroom_document=created_doc,
                        )

                # Add folders and their contents recursively.
                folders_to_add = Folder.objects.active().filter(id__in=folder_ids, created_by=request.user)
                if folders_to_add.count() != len(folder_ids):
                    raise PermissionDenied("You do not have permission to add one or more of the selected folders.")

                for folder in folders_to_add:
                    self._replicate_folder_structure(dataroom, folder, destination_folder, request.user)

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

        existing_folders = DataroomFolder.objects.filter(dataroom=dataroom, parent=parent)
        existing_documents = DataroomDocument.objects.filter(dataroom=dataroom, folder=parent, document__deleted_at__isnull=True)

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

        with transaction.atomic():
            # Clear any existing order rows for these specific items to prevent
            # UniqueConstraint collisions and OneToOne validation errors.
            DataroomItemOrder.objects.filter(folder_id__in=folder_ids).delete()
            DataroomItemOrder.objects.filter(dataroom_document_id__in=doc_ids).delete()

            # Recreate them in the new sequence using bulk_create to avoid N+1 query overhead.
            orders_to_create = []
            for position, item in enumerate(ordered_items):
                if item["type"] == "folder":
                    orders_to_create.append(
                        DataroomItemOrder(
                            dataroom=dataroom,
                            parent_folder=parent,
                            item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                            folder_id=item["id"],
                            position=position,
                        )
                    )
                else:
                    orders_to_create.append(
                        DataroomItemOrder(
                            dataroom=dataroom,
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
                docs_to_move = DataroomDocument.objects.filter(id__in=doc_ids, dataroom=dataroom)
                for doc in docs_to_move:
                    doc.name = self._get_unique_dataroom_document_name(dataroom, destination_folder, doc.name)
                    doc.folder = destination_folder
                    doc.save()

                folders_to_move = DataroomFolder.objects.filter(id__in=folder_ids, dataroom=dataroom)
                for folder in folders_to_move:
                    if folder.id == dest_folder_id:
                        raise serializers.ValidationError("Cannot move a folder into itself.")
                    folder.name = self._get_unique_dataroom_folder_name(dataroom, destination_folder, folder.name)
                    folder.parent = destination_folder
                    folder.save()

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

    def _ensure_library_folder_path(self, requesting_user, dataroom, relative_path=None):
        """
        Ensures Dataroom Uploads/<Dataroom-Name>/<relative_path> exists as a standard Folder structure.
        """
        organization = requesting_user.organization
        root_folder = Folder.objects.get_root_for_org(organization)

        # 1. Ensure "Dataroom Uploads" folder at root
        dataroom_uploads_folder, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=requesting_user
        )

        # 2. Ensure "<Dataroom-Name> (<Dataroom-ID>)" folder inside "Dataroom Uploads"
        dataroom_folder, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=dataroom_uploads_folder,
            name=get_dataroom_storage_folder_name(dataroom.name, dataroom),
            created_by=requesting_user
        )

        current_folder = dataroom_folder

        # 3. Ensure any relative folder paths inside the Dataroom-Name folder
        if relative_path:
            folder_path, _ = os.path.split(relative_path)
            if folder_path:
                path_parts = Path(folder_path).parts
                for part in path_parts:
                    current_folder, _ = Folder.objects.get_or_create(
                        organization=organization,
                        parent=current_folder,
                        name=part,
                        defaults={'created_by': requesting_user}
                    )

        return current_folder

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
                    )
                    path_to_folder_map[path_str] = folder

                    if created and dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, parent_dataroom_folder):
                        self._append_item_order(
                            dataroom=dataroom,
                            parent_folder=parent_dataroom_folder,
                            item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                            folder=folder,
                        )

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

        try:
            check_user_quota_on_upload(
                user=request.user,
                new_file_size=validated_data['file_size']
            )
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
                document = create_document_from_upload(
                    requesting_user=request.user,
                    folder=library_folder,
                    storage_key=validated_data['storage_key'],
                    unique_name=validated_data['unique_name'],
                    file_size=validated_data['file_size'],
                    content_type=validated_data['content_type'],
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
                )

                if dataroom.show_file_index and self._scope_has_item_order_rows(dataroom, destination_folder):
                    self._append_item_order(
                        dataroom=dataroom,
                        parent_folder=destination_folder,
                        item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
                        dataroom_document=dataroom_doc,
                    )
        except Exception as e:
            logger.error(f"Failed to finalize dataroom document upload: {e}")
            return Response(
                {"detail": f"Failed to finalize dataroom document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        doc_serializer = DataroomDocumentSerializer(dataroom_doc, context={'request': request})
        return Response(doc_serializer.data, status=status.HTTP_202_ACCEPTED)


class DataroomDocumentViewSet(mixins.RetrieveModelMixin,

                              mixins.UpdateModelMixin,
                              viewsets.GenericViewSet):
    queryset = DataroomDocument.objects.all()

    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return DataroomDocumentUpdateSerializer
        return DataroomDocumentSerializer

    def get_queryset(self):
        return self.queryset.filter(dataroom__created_by=self.request.user).annotate(
            dataroom_view_count=Count('dataroomvisit', distinct=True)
        )

    def perform_update(self, serializer):
        instance = self.get_object()
        new_name = serializer.validated_data.get('name')
        old_name = instance.name

        if new_name and new_name != old_name:
            if DataroomDocument.objects.filter(
                dataroom=instance.dataroom,
                folder=instance.folder,
                name=new_name
            ).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError({'name': _('A document with this name already exists in this location.')})

        serializer.save()

        # Rename backing Document under "Dataroom Uploads" if it exists and is a direct upload
        if new_name and new_name != old_name:
            doc = instance.document
            if doc:
                root_folder = Folder.objects.get_root_for_org(doc.organization)
                if root_folder:
                    dataroom_uploads = Folder.objects.filter(
                        organization=doc.organization,
                        parent=root_folder,
                        name="Dataroom Uploads",
                        created_by=instance.dataroom.created_by
                    ).first()
                    if dataroom_uploads:
                        # Check if doc's folder is a descendant of 'Dataroom Uploads'
                        folder = doc.folder
                        is_direct_upload = False
                        while folder:
                            if folder == dataroom_uploads:
                                is_direct_upload = True
                                break
                            folder = folder.parent

                        if is_direct_upload:
                            doc.name = new_name
                            doc.save()


@extend_schema(tags=['datarooms'])
class DataroomFolderViewSet(viewsets.ModelViewSet):
    queryset = DataroomFolder.objects.all()
    serializer_class = DataroomFolderSerializer

    def get_queryset(self):
        """
        This queryset ensures that users can only access dataroom folders
        within datarooms they have created. It also allows filtering by a specific dataroom.
        """
        queryset = self.queryset.filter(dataroom__created_by=self.request.user)
        dataroom_id = self.request.query_params.get('dataroom_id')
        if dataroom_id:
            queryset = queryset.filter(dataroom_id=dataroom_id)
        return queryset

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # Custom logic to include sub-folders and documents
        sub_folders = instance.children.all().order_by('created_at', 'id')
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
        """
        Automatically assign the dataroom from the request data, after
        verifying the user has permission to access it.
        """
        dataroom = serializer.validated_data.get('dataroom')
        if not dataroom:
            raise serializers.ValidationError({'dataroom': 'This field is required.'})

        if dataroom.organization != self.request.user.organization:
            raise PermissionDenied("You do not have permission to add folders to this dataroom.")

        folder = serializer.save()
        if dataroom.show_file_index and DataroomItemOrder.objects.filter(
            dataroom=dataroom, parent_folder=folder.parent
        ).exists():
            current_max = (
                DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=folder.parent)
                .order_by("-position")
                .values_list("position", flat=True)
                .first()
            )
            DataroomItemOrder.objects.create(
                dataroom=dataroom,
                parent_folder=folder.parent,
                item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                folder=folder,
                position=(current_max + 1) if current_max is not None else 0,
            )

    def perform_update(self, serializer):
        instance = self.get_object()
        new_name = serializer.validated_data.get('name')
        old_name = instance.name

        if new_name and new_name != old_name:
            if DataroomFolder.objects.filter(
                dataroom=instance.dataroom,
                parent=instance.parent,
                name=new_name
            ).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError({'name': _('A folder with this name already exists in this location.')})

        serializer.save()

        # Rename the backing Folder under "Dataroom Uploads" if it exists
        if new_name and new_name != old_name:
            organization = instance.dataroom.organization
            root_folder = Folder.objects.get_root_for_org(organization)
            if root_folder:
                # Traverse up the visual folders to get the path names relative to dataroom
                names = []
                curr = instance.parent
                while curr:
                    names.insert(0, curr.name)
                    curr = curr.parent

                path_names = ["Dataroom Uploads", instance.dataroom.name] + names + [old_name]

                curr_folder = root_folder
                for i, name in enumerate(path_names):
                    target_name = get_dataroom_storage_folder_name(name, instance.dataroom) if i == 1 else name
                    curr_folder = Folder.objects.filter(
                        organization=organization,
                        parent=curr_folder,
                        name=target_name,
                        created_by=instance.dataroom.created_by
                    ).first()
                    if not curr_folder:
                        break

                if curr_folder:
                    curr_folder.name = new_name
                    curr_folder.save()

    def perform_destroy(self, instance):
        remove_dataroom_content(instance.dataroom, dataroom_doc_ids=[], dataroom_folder_ids=[instance.id])
