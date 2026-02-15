import logging
import os
from pathlib import Path
from urllib.parse import urljoin

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Sum
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView


from core.services import get_dynamic_setting
from .models import (Document, Folder)
from .serializers import (DocumentSerializer, EnsureFolderPathsSerializer,
                          FolderSerializer)
from .fileserver import fileserver_client
from .services import (
    _get_unique_folder_name,
    _get_unique_document_name,
    QuotaExceededError,
    check_user_quota_on_upload,
    create_document_from_upload,
    create_new_document_version,
    delete_document_and_files,
    delete_folder_and_contents,
    generate_storage_key,
)


logger = logging.getLogger(__name__)


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 1000


def _get_folder_from_path(requesting_user, folder_path: str) -> Folder | None:
    """
    Finds a folder based on a path string for a specific user, starting from
    the organization's invisible root folder. Returns the final Folder instance or
    None if not found.
    """
    organization = requesting_user.organization
    try:
        parent = Folder.objects.get(
            organization=organization, name='__root__', parent=None
        )
    except Folder.DoesNotExist:
        logger.error(f"Invisible root folder not found for organization {organization.id}")
        return None

    path = Path(folder_path)
    target_folder = parent
    for part in path.parts:
        try:
            target_folder = Folder.objects.get(
                organization=organization,
                name=part,
                parent=parent,
                created_by=requesting_user
            )
            parent = target_folder
        except Folder.DoesNotExist:
            return None
    return target_folder


def _get_or_create_folders_from_path(requesting_user, folder_path: str) -> Folder:
    """
    Recursively finds or creates folders from a path string, starting from the
    organization's invisible root folder. Returns the final Folder instance.
    """
    try:
        parent = Folder.objects.get_root_for_org(requesting_user.organization)
    except Folder.DoesNotExist:
        logger.error(f"Invisible root folder not found for user {requesting_user.id}'s organization")
        # This is a critical failure, as the root folder should always exist.
        # We will let this fail hard, which will result in a 500 error.
        raise

    path = Path(folder_path)
    for part in path.parts:
        folder, _ = Folder.objects.get_or_create(
            organization=requesting_user.organization,
            name=part,
            parent=parent,
            defaults={'created_by': requesting_user}
        )
        parent = folder
    return parent


class DocumentUploadRequestView(APIView):
    """
    Requests a temporary, secure URL for uploading a document from the file server.
    """
    permission_classes = [permissions.IsAuthenticated]

    class DocumentUploadRequestSerializer(serializers.Serializer):
        file_name = serializers.CharField()
        file_size = serializers.IntegerField()
        path = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def post(self, request, *args, **kwargs):
        serializer = self.DocumentUploadRequestSerializer(data=request.data)
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

        parent_folder = None
        if relative_path:
            folder_path, file_name_from_path = os.path.split(relative_path)
            if folder_path:
                parent_folder = _get_folder_from_path(
                    request.user, folder_path
                )
                if parent_folder is None:
                    return Response(
                        {"detail": f"Folder path '{folder_path}' does not exist."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            if file_name_from_path:
                file_name = file_name_from_path
        else:
            parent_folder = Folder.objects.get_root_for_org(request.user.organization)

        unique_name = _get_unique_document_name(
            requesting_user=request.user,
            folder=parent_folder,
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


class DocumentUploadFinalizeView(APIView):
    """
    Finalizes a document upload after the file has been sent to the file server.
    Creates the Document records and triggers processing.
    """
    permission_classes = [permissions.IsAuthenticated]

    class DocumentUploadFinalizeSerializer(serializers.Serializer):
        storage_key = serializers.CharField()
        unique_name = serializers.CharField()
        file_size = serializers.IntegerField()
        content_type = serializers.CharField(allow_blank=True)
        path = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def post(self, request, *args, **kwargs):
        serializer = self.DocumentUploadFinalizeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        parent_folder = None
        relative_path = validated_data.get('path')

        if relative_path:
            folder_path, _ = os.path.split(relative_path)
            if folder_path:
                parent_folder = _get_folder_from_path(
                    request.user, folder_path
                )

        try:
            document = create_document_from_upload(
                requesting_user=request.user,
                folder=parent_folder,
                storage_key=validated_data['storage_key'],
                unique_name=validated_data['unique_name'],
                file_size=validated_data['file_size'],
                content_type=validated_data['content_type'],
            )
        except Exception as e:
            logger.error(f"Failed to finalize document upload: {e}")
            return Response(
                {"detail": f"Failed to finalize document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        doc_serializer = DocumentSerializer(document, context={'request': request})
        return Response(doc_serializer.data, status=status.HTTP_202_ACCEPTED)


class EnsureFolderPathsView(APIView):
    """
    A view to ensure multiple folder paths exist, creating them if necessary.
    This is designed to be called once before a batch of folder uploads.
    It's atomic, ensuring that if any path fails, the whole transaction is rolled back.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = EnsureFolderPathsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        paths = serializer.validated_data['paths']
        parent_path = serializer.validated_data.get('parent_path')
        requesting_user = request.user
        organization = requesting_user.organization

        # Determine the root folder for the operation. This could be the org's
        # root or a specific subfolder defined by parent_path.
        # TODO: N+1 query problem!
        try:
            if parent_path:
                path = Path(parent_path)
                current_folder = Folder.objects.get_root_for_org(organization)
                for part in path.parts:
                    current_folder = Folder.objects.get(
                        organization=organization,
                        name=part,
                        parent=current_folder,
                        created_by=requesting_user
                    )
                root_folder = current_folder
            else:
                root_folder = Folder.objects.get_root_for_org(organization)
        except Folder.DoesNotExist:
            return Response(
                {"detail": f"Parent path '{parent_path}' not found or you do not have permission to access it."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                # 1. Determine unique names for all top-level folders relative to the root_folder.
                top_level_dirs = {Path(p).parts[0] for p in paths if Path(p).parts}
                path_mappings = {}
                for original_name in top_level_dirs:
                    unique_name = _get_unique_folder_name(
                        created_by=requesting_user,
                        parent_folder=root_folder,
                        original_name=original_name
                    )
                    path_mappings[original_name] = unique_name

                # 2. Reconstruct all required paths with potentially renamed top-level folders.
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

                # 3. Sort paths to ensure parents are processed before children
                sorted_paths = sorted(list(all_required_paths), key=lambda p: p.count(os.sep))

                # Keep track of created/verified folders to avoid redundant lookups
                path_to_folder_map = {'': root_folder}

                for path_str in sorted_paths:
                    path = Path(path_str)
                    parent_path_str = str(path.parent) if path.parent != Path('.') else ''

                    parent_folder = path_to_folder_map.get(parent_path_str)
                    if not parent_folder:
                        # This should not happen due to sorting, but as a safeguard.
                        return Response(
                            {"detail": f"An error occurred: parent folder for '{path_str}' not found."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        )

                    # Permission check on the parent
                    if parent_folder.created_by is not None and parent_folder.created_by != requesting_user:
                        raise PermissionDenied(
                            {"detail": f"You do not have permission to create items in '{parent_path_str}'."},
                            status=status.HTTP_403_FORBIDDEN
                        )

                    folder_name = path.name
                    folder, created = Folder.objects.get_or_create(
                        organization=organization,
                        parent=parent_folder,
                        name=folder_name,
                        defaults={'created_by': requesting_user}
                    )

                    # If the folder already existed, verify ownership
                    if not created and folder.created_by != requesting_user:
                        raise PermissionDenied(
                            detail=f"You do not have permission to access or create subfolders in '{path_str}'."
                        )

                    path_to_folder_map[path_str] = folder

            return Response(
                {
                    "detail": "Folder structure ensured successfully.",
                    "path_mappings": path_mappings,
                },
                status=status.HTTP_201_CREATED
            )
        except PermissionDenied:
            # Re-raise to let DRF's exception handler create the 403 response.
            # The transaction is automatically rolled back when an exception
            # is raised from within the `atomic` block.
            raise
        except Folder.DoesNotExist:
            logger.error(f"Invisible root folder not found for user {requesting_user.id}'s organization")
            return Response(
                {"detail": "An unexpected error occurred: root folder missing."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception:
            logger.exception("Failed to ensure folder paths exist for paths: %s", paths)
            return Response(
                {"detail": "An unexpected error occurred while creating the folder structure."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class DocumentVersionUploadRequestView(APIView):
    """
    Requests a temporary, secure URL for uploading a new document version.
    """
    permission_classes = [permissions.IsAuthenticated]

    class RequestSerializer(serializers.Serializer):
        file_name = serializers.CharField()
        file_size = serializers.IntegerField()

    def post(self, request, document_id, *args, **kwargs):
        try:
            document = Document.objects.get(id=document_id, created_by=request.user)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.RequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data

        try:
            check_user_quota_on_upload(
                user=request.user,
                new_file_size=validated_data['file_size'],
                document_to_update=document
            )
        except QuotaExceededError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        file_name = validated_data['file_name']

        storage_key = generate_storage_key(request.user.organization.id, file_name)

        try:
            upload_url = fileserver_client.generate_upload_url(storage_key, is_internal=False)
        except APIException as e:
            logger.error(f"Failed to get upload URL from file server: {e}")
            return Response({"detail": str(e.detail)}, status=e.status_code)

        return Response({
            'upload_url': upload_url,
            'storage_key': storage_key,
        }, status=status.HTTP_200_OK)


class DocumentVersionUploadFinalizeView(APIView):
    """
    Finalizes a new document version upload after the file has been sent to the file server.
    """
    permission_classes = [permissions.IsAuthenticated]

    class FinalizeSerializer(serializers.Serializer):
        storage_key = serializers.CharField()
        file_size = serializers.IntegerField()
        content_type = serializers.CharField(allow_blank=True)

    def post(self, request, document_id, *args, **kwargs):
        try:
            document = Document.objects.get(id=document_id, created_by=request.user)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.FinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data

        try:
            create_new_document_version(
                document=document,
                requesting_user=request.user,
                storage_key=validated_data['storage_key'],
                file_size=validated_data['file_size'],
                content_type=validated_data['content_type'],
            )
        except Exception as e:
            logger.error(f"Failed to finalize document version upload for doc {document_id}: {e}")
            return Response(
                {"detail": f"Failed to finalize document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        doc_serializer = DocumentSerializer(document, context={'request': request})
        return Response(doc_serializer.data, status=status.HTTP_202_ACCEPTED)


def _prepare_pages_data(document, primary_version, share_link=None):
    """
    Prepares a list of page data with absolute URLs for a given document version.
    Handles both image types and paginated document types.
    If a share_link is provided, it generates secure, permission-checked URLs.
    """
    pages_data = []
    is_watermarked = share_link and share_link.enable_watermark and share_link.watermark_text

    if document.type == 'image':
        absolute_url = None
        if share_link:
            base_url_part = "render-page" if is_watermarked else "page"
            page_url = f"/api/v1/links/{share_link.slug}/{base_url_part}/1/"
            if share_link.dataroom:
                page_url += f"?document_id={document.id}"
            absolute_url = urljoin(settings.SITE_DOMAIN, page_url)
        else:
            absolute_url = fileserver_client.generate_download_url(primary_version.original_storage_key, is_internal=False)

        pages_data.append({
            'page_number': 1,
            'url': absolute_url,
            'metadata': {},
        })
    elif primary_version.has_pages:
        # For PDFs/Office docs, we have pre-generated page images.
        pages = primary_version.pages.order_by('page_number')
        for page in pages:
            absolute_url = None
            if share_link:
                base_url_part = "render-page" if is_watermarked else "page"
                page_url = f"/api/v1/links/{share_link.slug}/{base_url_part}/{page.page_number}/"
                if share_link.dataroom:
                    page_url += f"?document_id={document.id}"
                absolute_url = urljoin(settings.SITE_DOMAIN, page_url)
            else:
                absolute_url = fileserver_client.generate_download_url(page.storage_key, is_internal=False)

            pages_data.append({
                "page_number": page.page_number,
                "url": absolute_url,
                "metadata": page.metadata,
            })
    return pages_data


class DocumentDownloadView(APIView):
    """
    Provides a temporary, secure URL for downloading a document's original file.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, document_id, *args, **kwargs):
        try:
            document = Document.objects.get(
                id=document_id,
                organization=request.user.organization,
                created_by=request.user
            )
        except Document.DoesNotExist:
            return Response(
                {"detail": "Access denied or document not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        primary_version = document.versions.filter(is_primary=True).first()
        if not primary_version:
            return Response(
                {"detail": "Document version not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            download_url = fileserver_client.generate_download_url(
                primary_version.original_storage_key, is_internal=False
            )
            return Response({'download_url': download_url}, status=status.HTTP_200_OK)
        except APIException as e:
            logger.error(f"Failed to get download URL from file server for document {document_id}: {e}")
            return Response({"detail": str(e.detail)}, status=e.status_code)


class DocumentPreviewDataView(APIView):
    """
    Provides data for rendering an internal document preview.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, document_id, *args, **kwargs):
        # Authentication & Authorization is handled by DRF + this query
        try:
            document = Document.objects.get(
                id=document_id,
                organization=request.user.organization,
                created_by=request.user
            )
        except Document.DoesNotExist:
            return Response(
                {"detail": "Access denied or document not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Handle documents that are not ready for preview
        if document.status == 'processing':
            return Response(
                {"detail": "Document is still processing. Please wait and try again."},
                status=status.HTTP_400_BAD_REQUEST
            )
        elif document.status != 'ready':
             return Response(
                {"detail": "Document is not ready for preview."},
                status=status.HTTP_400_BAD_REQUEST
            )

        max_pages = get_dynamic_setting('MAX_PREVIEW_PAGES')
        if document.num_pages and document.num_pages > max_pages:
            return Response(
                {"detail": "This document has too many pages for an in-browser preview."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Data Fetching
        primary_version = document.versions.filter(is_primary=True).first()
        if not primary_version:
            return Response(
                {"detail": "Document version not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Content Processing and Response Shaping
        pages_data = _prepare_pages_data(document, primary_version)

        response_data = {
            "id": document.id,
            "name": document.name,
            "type": document.type,
            "num_pages": document.num_pages,
            "pages": pages_data,
        }

        return Response(response_data, status=status.HTTP_200_OK)


class FolderViewSet(viewsets.ModelViewSet):
    queryset = Folder.objects.all()
    serializer_class = FolderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _get_root_folder(self):
        """Helper to get the organization's invisible root folder."""
        try:
            return Folder.objects.get_root_for_org(self.request.user.organization)
        except Folder.DoesNotExist:
            logger.error(f"Invisible root folder not found for organization {self.request.user.organization.id}")
            raise APIException("An unexpected error occurred: root folder missing.",
                               code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_folder_contents(self, folder, request):
        """Helper to fetch and serialize sub-folders and documents for a given folder."""
        sub_folders = folder.children.filter(created_by=request.user)
        documents = folder.documents.filter(created_by=request.user).prefetch_related(
            'versions', 'share_links', 'share_links__view_sessions', 'uploaded_via_file_request'
        )

        sub_folders_serializer = self.get_serializer(sub_folders, many=True)
        documents_serializer = DocumentSerializer(documents, many=True, context={'request': request})

        return {
            'sub_folders': sub_folders_serializer.data,
            'documents': documents_serializer.data,
        }

    def list(self, request, *args, **kwargs):
        """
        Returns the contents of the user's root folder, including its
        subfolders and documents.
        """
        root_folder = self._get_root_folder()
        contents = self._get_folder_contents(root_folder, request)
        return Response({
            'current_folder': None,
            **contents,
        })

    def retrieve(self, request, *args, **kwargs):
        """
        Returns the contents of a specific folder, including its subfolders and documents.
        """
        instance = self.get_object()
        contents = self._get_folder_contents(instance, request)
        current_folder_serializer = self.get_serializer(instance)
        return Response({
            'current_folder': current_folder_serializer.data,
            **contents,
        })

    def get_queryset(self):
        """
        This queryset is used by get_object() to ensure users can only
        access folders they have created within their organization.
        """
        return self.queryset.filter(
            organization=self.request.user.organization,
            created_by=self.request.user
        )

    def perform_create(self, serializer):
        parent = serializer.validated_data.get('parent')
        if parent and parent.created_by != self.request.user:
            raise serializers.ValidationError(
                {'parent': "You can only create subfolders in your own folders."}
            )

        if not parent:
            parent = self._get_root_folder()
        serializer.save(
            created_by=self.request.user,
            organization=self.request.user.organization,
            parent=parent
        )

    def perform_update(self, serializer):
        parent = serializer.validated_data.get('parent')
        if parent and parent.created_by != self.request.user:
            raise serializers.ValidationError(
                {'parent': "You can only move folders to destinations you own."}
            )
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        folder = self.get_object()
        try:
            delete_folder_and_contents(folder)
        except Exception as e:
            logger.error(f"Error deleting folder {folder.id}: {e}")
            return Response(
                {"detail": "An error occurred while deleting the folder."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        This queryset is used for all actions. It ensures that users can only
        access documents they have created within their organization.
        Filtering by folder is handled in the `list` action.
        """
        return self.queryset.filter(
            organization=self.request.user.organization,
            created_by=self.request.user
        ).select_related('folder').prefetch_related(
            'versions', 'share_links', 'share_links__view_sessions', 'uploaded_via_file_request'
        )

    def list(self, request, *args, **kwargs):
        """
        Returns a list of documents for the currently authenticated user,
        optionally filtered by a parent folder.
        """
        queryset = self.get_queryset()
        organization = self.request.user.organization
        folder_id = self.request.query_params.get('folder')

        if folder_id:
            # Ensure the requested folder belongs to the user's org for security
            target_folder = get_object_or_404(Folder, id=folder_id, organization=organization)
        else:
            # Default to listing documents in the root folder
            target_folder = get_object_or_404(Folder, organization=organization, name='__root__', parent=None)

        queryset = queryset.filter(folder=target_folder)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        delete_document_and_files(document)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='view-sessions')
    def view_sessions(self, request, pk=None):
        from sharelinks.models import ViewSession
        from sharelinks.serializers import ViewSessionSerializer

        document = self.get_object()

        view_queryset = ViewSession.objects.filter(
            share_link__document=document
        ).order_by('-viewed_at').select_related('share_link').prefetch_related('page_views')

        # Optimization: pre-fetch all page image URLs for this document
        primary_version = document.versions.filter(is_primary=True).first()
        pages_map = {}
        if primary_version:
            if document.type == 'image':
                image_url = fileserver_client.generate_download_url(primary_version.original_storage_key, is_internal=False)
                pages_map[1] = image_url
            elif primary_version.has_pages:
                for page in primary_version.pages.values('page_number', 'storage_key').order_by('page_number'):
                    page_url = fileserver_client.generate_download_url(page['storage_key'], is_internal=False)
                    pages_map[page['page_number']] = page_url

        serializer_context = self.get_serializer_context()
        serializer_context['pages_map'] = pages_map

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(view_queryset, request, view=self)
        if page is not None:
            serializer = ViewSessionSerializer(page, many=True, context=serializer_context)
            return paginator.get_paginated_response(serializer.data)

        serializer = ViewSessionSerializer(view_queryset, many=True, context=serializer_context)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        from sharelinks.models import ViewSession

        document = self.get_object()
        aggregates = ViewSession.objects.filter(
            share_link__document=document
        ).aggregate(
            total_views=Count('id'),
            total_duration_seconds=Sum('duration_seconds'),
            total_downloads=Count('downloaded_at'),
        )

        total_views = aggregates['total_views']
        total_duration = aggregates['total_duration_seconds'] or 0
        avg_duration = total_duration / total_views if total_views > 0 else 0
        total_downloads = aggregates['total_downloads']

        return Response({
            'total_views': total_views,
            'total_duration_seconds': total_duration,
            'avg_duration_seconds': avg_duration,
            'total_downloads': total_downloads,
        })


class MoveItemsView(APIView):
    """
    A dedicated view for moving documents and folders to a new location.
    """
    permission_classes = [permissions.IsAuthenticated]

    class MoveItemsSerializer(serializers.Serializer):
        document_ids = serializers.ListField(
            child=serializers.CharField(), required=False, allow_empty=True
        )
        folder_ids = serializers.ListField(
            child=serializers.CharField(), required=False, allow_empty=True
        )
        destination_folder_id = serializers.CharField(allow_null=True)

    def post(self, request, *args, **kwargs):
        serializer = self.MoveItemsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        doc_ids = validated_data.get('document_ids', [])
        folder_ids = validated_data.get('folder_ids', [])
        dest_id = validated_data.get('destination_folder_id')
        user = request.user
        organization = user.organization

        if not doc_ids and not folder_ids:
            return Response(
                {"detail": "No items selected to move."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # 1. Get and validate destination folder
                if dest_id:
                    destination_folder = Folder.objects.get(id=dest_id, created_by=user)
                else:
                    destination_folder = Folder.objects.get_root_for_org(organization)

                # 2. Get and validate source items
                documents_to_move = Document.objects.filter(id__in=doc_ids, created_by=user)
                if documents_to_move.count() != len(doc_ids):
                    raise PermissionDenied("You do not have permission to move one or more of the selected documents.")

                folders_to_move = Folder.objects.filter(id__in=folder_ids, created_by=user)
                if folders_to_move.count() != len(folder_ids):
                    raise PermissionDenied("You do not have permission to move one or more of the selected folders.")

                # 3. Validation: Prevent moving a folder into itself or a descendant
                for folder in folders_to_move:
                    if folder.id == destination_folder.id:
                        raise serializers.ValidationError(
                            f"Cannot move folder '{folder.name}' into itself."
                        )

                    parent = destination_folder
                    while parent:
                        if parent.id == folder.id:
                            raise serializers.ValidationError(
                                f"Cannot move folder '{folder.name}' into one of its own subfolders."
                            )
                        parent = parent.parent

                # 4. Perform move for documents
                # TODO: This can lead to performance issues when moving a large number of items,
                # as it results in N database queries for updates. To improve efficiency,
                # you can collect the modified objects and use bulk_update to perform all updates
                # in a single query for documents and another for folders.
                for doc in documents_to_move:
                    doc.name = _get_unique_document_name(
                        requesting_user=user,
                        folder=destination_folder,
                        original_name=doc.name
                    )
                    doc.folder = destination_folder
                    doc.save()

                # 5. Perform move for folders
                for folder in folders_to_move:
                    folder.name = _get_unique_folder_name(
                        created_by=user,
                        parent_folder=destination_folder,
                        original_name=folder.name
                    )
                    folder.parent = destination_folder
                    folder.save()

            return Response({"detail": "Items moved successfully."}, status=status.HTTP_200_OK)

        except Folder.DoesNotExist:
            return Response({"detail": "Destination folder not found."}, status=status.HTTP_404_NOT_FOUND)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except serializers.ValidationError as e:
            # e.detail is a dict, so we convert it for a clean message
            error_message = next(iter(e.detail.values()))[0] if isinstance(e.detail, dict) else str(e.detail[0])
            return Response({"detail": error_message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("An error occurred during move operation.")
            return Response({"detail": "An unexpected error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RootFolderView(APIView):
    """
    Provides the ID of the user's root folder.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            root_folder = Folder.objects.get_root_for_org(request.user.organization)
            return Response({'id': root_folder.id})
        except Folder.DoesNotExist:
            return Response({'detail': 'Root folder not found.'}, status=status.HTTP_404_NOT_FOUND)
