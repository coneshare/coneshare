import logging

from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from backend.utils import get_unique_name
from documents.models import Document, Folder
from documents.views import StandardResultsSetPagination
from .models import Dataroom, DataroomDocument, DataroomFolder, DataroomItemOrder
from .serializers import (
    AddContentSerializer, DataroomDetailSerializer,
    DataroomDocumentSerializer, DataroomDocumentUpdateSerializer,
    DataroomFolderSerializer, DataroomSerializer,
    MoveDataroomContentSerializer, RemoveContentSerializer,
    ReorderDataroomItemsSerializer)

logger = logging.getLogger(__name__)


@extend_schema(tags=['datarooms'])
class DataroomViewSet(viewsets.ModelViewSet):
    queryset = Dataroom.objects.all()
    serializer_class = DataroomSerializer
    permission_classes = [permissions.IsAuthenticated]

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
                docs_to_add = Document.objects.filter(id__in=doc_ids, created_by=request.user)
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
                folders_to_add = Folder.objects.filter(id__in=folder_ids, created_by=request.user)
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

        with transaction.atomic():
            DataroomDocument.objects.filter(id__in=dataroom_doc_ids, dataroom=dataroom).delete()
            # Deleting a folder will cascade and delete its children and document references.
            DataroomFolder.objects.filter(id__in=dataroom_folder_ids, dataroom=dataroom).delete()

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
        existing_documents = DataroomDocument.objects.filter(dataroom=dataroom, folder=parent)

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
        from sharelinks.models import ViewSession
        from sharelinks.serializers import ViewSessionSerializer

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


class DataroomDocumentViewSet(mixins.RetrieveModelMixin,
                              mixins.UpdateModelMixin,
                              viewsets.GenericViewSet):
    queryset = DataroomDocument.objects.all()
    permission_classes = [permissions.IsAuthenticated]

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

        if new_name and new_name != instance.name:
            if DataroomDocument.objects.filter(
                dataroom=instance.dataroom,
                folder=instance.folder,
                name=new_name
            ).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError({'name': 'A document with this name already exists in this location.'})

        serializer.save()


@extend_schema(tags=['datarooms'])
class DataroomFolderViewSet(viewsets.ModelViewSet):
    queryset = DataroomFolder.objects.all()
    serializer_class = DataroomFolderSerializer
    permission_classes = [permissions.IsAuthenticated]

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
        documents = DataroomDocument.objects.filter(folder=instance).select_related('document', 'document__created_by').annotate(
            dataroom_view_count=Count('dataroomvisit', distinct=True)
        ).order_by('created_at', 'id')

        data = self.get_serializer(instance).data
        sub_folder_data = DataroomFolderSerializer(sub_folders, many=True).data
        document_data = DataroomDocumentSerializer(documents, many=True).data
        data['sub_folders'] = sub_folder_data
        data['documents'] = document_data

        if instance.dataroom.show_file_index:
            scope_rows = list(
                DataroomItemOrder.objects.filter(dataroom=instance.dataroom, parent_folder=instance)
                .order_by("position", "created_at", "id")
            )
            if scope_rows and len(scope_rows) == (len(sub_folder_data) + len(document_data)):
                folder_map = {item["id"]: item for item in sub_folder_data}
                doc_map = {item["id"]: item for item in document_data}
                merged = []
                for row in scope_rows:
                    if row.item_type == DataroomItemOrder.ITEM_TYPE_FOLDER and row.folder_id in folder_map:
                        merged.append({"type": "folder", **folder_map[row.folder_id], "position": row.position})
                    elif row.item_type == DataroomItemOrder.ITEM_TYPE_DOCUMENT and row.dataroom_document_id in doc_map:
                        merged.append({"type": "document", **doc_map[row.dataroom_document_id], "position": row.position})
            else:
                merged = (
                    [{'type': 'folder', **item} for item in sub_folder_data] +
                    [{'type': 'document', **item} for item in document_data]
                )
                merged.sort(key=lambda i: (i['type'] != 'folder', i.get('created_at', ''), i.get('id', '')))
        else:
            merged = (
                [{'type': 'folder', **item} for item in sub_folder_data] +
                [{'type': 'document', **item} for item in document_data]
            )
            merged.sort(key=lambda i: (i['type'] != 'folder', i.get('created_at', ''), i.get('id', '')))
        data['items'] = merged
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

        if new_name and new_name != instance.name:
            if DataroomFolder.objects.filter(
                dataroom=instance.dataroom,
                parent=instance.parent,
                name=new_name
            ).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError({'name': 'A folder with this name already exists in this location.'})

        serializer.save()
