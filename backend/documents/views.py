import logging
import os
import posixpath
from pathlib import Path
from urllib.parse import unquote, urljoin

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Sum, Value, CharField, BigIntegerField, F, Q
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import permissions, serializers, status, viewsets, throttling
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter

from core.pagination import StandardResultsSetPagination


from .models import (Document, Folder, DocumentVersion)
from .serializers import (DocumentSerializer, EnsureFolderPathsSerializer,
                          FolderSerializer, DocumentVersionListSerializer,
                          TrashItemSerializer, TrashRestoreResponseSerializer)
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
    soft_delete_document,
    soft_delete_folder,
    restore_item,
    empty_trash,
    generate_storage_key,
    copy_document,
    enqueue_server_preview_render,
    preview_mode_for_version,
    preview_status_for_render_status,
    promote_document_version,
    touch_folder_ancestors,
)


logger = logging.getLogger(__name__)


def get_document_queryset_for_user(user):
    """
    Returns a queryset of active documents accessible to the given user.
    - An Org Admin has overarching supervisor access to all documents in their organization.
    - A standard user has access to:
      1) Documents they created within their organization.
      2) Documents included in any active Dataroom where they are an Owner or Collaborator.
    """
    base_qs = Document.objects.active().filter(organization=user.organization)
    if getattr(user, 'role', '') == 'admin':
        return base_qs

    return base_qs.filter(
        Q(created_by=user) |
        Q(dataroomdocument__dataroom__organization=user.organization, dataroomdocument__dataroom__collaborators__user=user) |
        Q(dataroomdocument__dataroom__organization=user.organization, dataroomdocument__dataroom__created_by=user)
    ).distinct()


def _get_folder_from_path(requesting_user, folder_path: str) -> Folder | None:
    """
    Finds a folder based on a path string for a specific user, starting from
    the organization's invisible root folder. Returns the final Folder instance or
    None if not found.
    """
    organization = requesting_user.organization
    try:
        parent = Folder.objects.active().get(
            organization=organization, name='__root__', parent=None
        )
    except Folder.DoesNotExist:
        logger.error(f"Invisible root folder not found for organization {organization.id}")
        return None

    path = Path(folder_path)
    target_folder = parent
    for part in path.parts:
        try:
            target_folder = Folder.objects.active().get(
                organization=organization,
                name=part,
                parent=parent,
                created_by=requesting_user
            )
            parent = target_folder
        except Folder.DoesNotExist:
            return None
    return target_folder


# def _get_or_create_folders_from_path(requesting_user, folder_path: str) -> Folder:
#     """
#     Recursively finds or creates folders from a path string, starting from the
#     organization's invisible root folder. Returns the final Folder instance.
#     """
#     try:
#         parent = Folder.objects.get_root_for_org(requesting_user.organization)
#     except Folder.DoesNotExist:
#         logger.error(f"Invisible root folder not found for user {requesting_user.id}'s organization")
#         # This is a critical failure, as the root folder should always exist.
#         # We will let this fail hard, which will result in a 500 error.
#         raise

#     path = Path(folder_path)
#     for part in path.parts:
#         folder, _ = Folder.objects.active().get_or_create(
#             organization=requesting_user.organization,
#             name=part,
#             parent=parent,
#             defaults={'created_by': requesting_user}
#         )
#         parent = folder
#     return parent


@extend_schema(tags=['documents'])
class DocumentUploadRequestView(APIView):
    """
    Requests a temporary, secure URL for uploading a document from the file server.
    """

    class DocumentUploadRequestSerializer(serializers.Serializer):
        file_name = serializers.CharField()
        file_size = serializers.IntegerField()
        # Upload path contract: `path` is root-relative (no leading slash),
        # e.g. "foo.txt" or "folder/sub/file.pdf".
        path = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class DocumentUploadRequestResponseSerializer(serializers.Serializer):
        upload_url = serializers.CharField()
        storage_key = serializers.CharField()
        unique_name = serializers.CharField()

    @extend_schema(
        request=DocumentUploadRequestSerializer,
        responses={200: DocumentUploadRequestResponseSerializer, 400: dict},
    )
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
        root_folder = Folder.objects.get_root_for_org(request.user.organization)
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
            parent_folder = root_folder

        # If path contains only a filename (e.g. "foo.txt"), treat it as root upload.
        if parent_folder is None:
            parent_folder = root_folder

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


@extend_schema(tags=['documents'])
class DocumentUploadFinalizeView(APIView):
    """
    Finalizes a document upload after the file has been sent to the file server.
    Creates the Document records and triggers processing.
    """

    class DocumentUploadFinalizeSerializer(serializers.Serializer):
        storage_key = serializers.CharField()
        unique_name = serializers.CharField()
        file_size = serializers.IntegerField()
        content_type = serializers.CharField(allow_blank=True)
        # Must follow the same root-relative contract used in request step.
        path = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    @extend_schema(
        request=DocumentUploadFinalizeSerializer,
        responses={202: DocumentSerializer, 400: dict, 500: dict},
    )
    def post(self, request, *args, **kwargs):
        serializer = self.DocumentUploadFinalizeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        storage_key = validated_data['storage_key']
        expected_prefix = f"{request.user.organization.id}/"
        normalized_key = posixpath.normpath(unquote(storage_key))
        if not normalized_key.startswith(expected_prefix) or ".." in normalized_key:
            return Response(
                {"detail": "Invalid or unauthorized storage key for organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        parent_folder = None
        relative_path = validated_data.get('path')
        root_folder = Folder.objects.get_root_for_org(request.user.organization)

        if relative_path:
            folder_path, _ = os.path.split(relative_path.strip('/'))
            if folder_path:
                parent_folder = _get_folder_from_path(request.user, folder_path)
                if parent_folder is None:
                    return Response(
                        {"detail": f"Destination folder path '{folder_path}' does not exist or is unauthorized."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                parent_folder = root_folder
        else:
            parent_folder = root_folder

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


@extend_schema(tags=['documents'])
class EnsureFolderPathsView(APIView):
    """
    A view to ensure multiple folder paths exist, creating them if necessary.
    This is designed to be called once before a batch of folder uploads.
    It's atomic, ensuring that if any path fails, the whole transaction is rolled back.
    """

    class EnsureFolderPathsResponseSerializer(serializers.Serializer):
        detail = serializers.CharField()
        path_mappings = serializers.DictField(child=serializers.CharField())

    @extend_schema(
        request=EnsureFolderPathsSerializer,
        responses={201: EnsureFolderPathsResponseSerializer, 400: dict, 403: dict, 500: dict},
    )
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
                    current_folder = Folder.objects.active().get(
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

                any_created = False
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
                    folder, created = Folder.objects.active().get_or_create(
                        organization=organization,
                        parent=parent_folder,
                        name=folder_name,
                        created_by=requesting_user
                    )
                    if created:
                        any_created = True

                    path_to_folder_map[path_str] = folder

                if any_created and root_folder:
                    touch_folder_ancestors(root_folder)

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


@extend_schema(tags=['documents'])
class DocumentVersionUploadRequestView(APIView):
    """
    Requests a temporary, secure URL for uploading a new document version.
    """

    class DocumentVersionUploadRequestSerializer(serializers.Serializer):
        file_name = serializers.CharField()
        file_size = serializers.IntegerField()

    class DocumentVersionUploadResponseSerializer(serializers.Serializer):
        upload_url = serializers.CharField()
        storage_key = serializers.CharField()

    @extend_schema(
        request=DocumentVersionUploadRequestSerializer,
        responses={200: DocumentVersionUploadResponseSerializer, 400: dict, 404: dict},
    )
    def post(self, request, document_id, *args, **kwargs):
        try:
            document = Document.objects.active().get(id=document_id, created_by=request.user)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.DocumentVersionUploadRequestSerializer(data=request.data)
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


@extend_schema(tags=['documents'])
class DocumentVersionUploadFinalizeView(APIView):
    """
    Finalizes a new document version upload after the file has been sent to the file server.
    """

    class FinalizeSerializer(serializers.Serializer):
        storage_key = serializers.CharField()
        file_size = serializers.IntegerField()
        content_type = serializers.CharField(allow_blank=True)

    @extend_schema(
        request=FinalizeSerializer,
        responses={202: DocumentSerializer, 400: dict, 404: dict, 500: dict},
    )
    def post(self, request, document_id, *args, **kwargs):
        try:
            document = Document.objects.active().get(id=document_id, created_by=request.user)
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


def prepare_pages_data(
    document,
    primary_version,
    share_link=None,
    dataroom_document_id=None,
    enable_watermark_override=None
):
    """
    Prepares a list of page data with absolute URLs for a given document version.
    Handles both image types and paginated document types.
    If a share_link is provided, it generates secure, permission-checked URLs.
    """
    pages_data = []
    if share_link:
        watermark_enabled = (
            enable_watermark_override
            if enable_watermark_override is not None
            else share_link.enable_watermark
        )
        is_watermarked = watermark_enabled and bool(share_link.watermark_text)
    else:
        is_watermarked = False

    if document.type == 'image':
        absolute_url = None
        if share_link:
            base_url_part = "render-page" if is_watermarked else "page"
            page_url = f"/api/v1/links/{share_link.slug}/{base_url_part}/1/"
            if share_link.dataroom:
                page_url += f"?dataroom_document_id={dataroom_document_id}"
            absolute_url = urljoin(settings.SITE_DOMAIN, page_url)
        else:
            absolute_url = fileserver_client.generate_download_url(
                primary_version.original_storage_key, is_internal=False, filename=document.name
            )

        pages_data.append({
            'page_number': 1,
            'url': absolute_url,
            'metadata': {},
            'page_links': {'links': []},
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
                    page_url += f"?dataroom_document_id={dataroom_document_id}"
                absolute_url = urljoin(settings.SITE_DOMAIN, page_url)
            else:
                absolute_url = fileserver_client.generate_download_url(page.storage_key, is_internal=False)

            pages_data.append({
                "page_number": page.page_number,
                "url": absolute_url,
                "metadata": page.metadata,
                "page_links": page.page_links if isinstance(page.page_links, dict) else {"links": []},
            })
    return pages_data


@extend_schema(tags=['documents'])
class DocumentDownloadView(APIView):
    """
    Provides a temporary, secure URL for downloading a document's original file.
    """

    class DocumentDownloadResponseSerializer(serializers.Serializer):
        download_url = serializers.CharField()

    @extend_schema(
        responses={200: DocumentDownloadResponseSerializer, 404: dict},
    )
    def get(self, request, document_id, *args, **kwargs):
        try:
            document = get_document_queryset_for_user(request.user).get(id=document_id)
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
                primary_version.original_storage_key, is_internal=False, filename=document.name
            )
            return Response({'download_url': download_url}, status=status.HTTP_200_OK)
        except APIException as e:
            logger.error(f"Failed to get download URL from file server for document {document_id}: {e}")
            return Response({"detail": str(e.detail)}, status=e.status_code)


@extend_schema(tags=['documents'])
class DocumentPreviewDataView(APIView):
    """
    Provides data for rendering an internal document preview.
    """

    class DocumentPreviewResponseSerializer(serializers.Serializer):
        id = serializers.CharField()
        name = serializers.CharField()
        type = serializers.CharField()
        num_pages = serializers.IntegerField(allow_null=True)
        preview_mode = serializers.CharField()
        preview_status = serializers.CharField()
        render_status = serializers.CharField()
        render_error = serializers.CharField(allow_blank=True, allow_null=True)
        pages = serializers.ListField(child=serializers.DictField())
        pdf_preview_url = serializers.CharField(allow_null=True)
        video_preview_url = serializers.CharField(allow_null=True)
        download_url = serializers.CharField(allow_null=True)

    @extend_schema(
        responses={200: DocumentPreviewResponseSerializer, 400: dict, 404: dict},
    )
    def get(self, request, document_id, *args, **kwargs):
        # Authentication & Authorization is handled by DRF + this query
        try:
            document = get_document_queryset_for_user(request.user).get(id=document_id)
        except Document.DoesNotExist:
            return Response(
                {"detail": "Access denied or document not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        version_id = request.query_params.get('version_id')
        if version_id:
            if document.status == 'uploading':
                return Response(
                    {"detail": "Document is not ready for preview."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        elif document.status != 'ready':
            return Response(
                {"detail": "Document is not ready for preview."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Data Fetching
        if version_id:
            primary_version = get_object_or_404(document.versions, id=version_id)
        else:
            primary_version = document.versions.filter(is_primary=True).first()

        if not primary_version:
            return Response(
                {"detail": "Document version not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        preview_mode = preview_mode_for_version(primary_version)
        render_status = enqueue_server_preview_render(primary_version)

        preview_status = preview_status_for_render_status(render_status)
        if preview_mode == 'client_pdf':
            preview_status = 'ready'

        # Content Processing and Response Shaping
        pages_data = []
        if (preview_mode == 'image' or render_status == 'ready') and document.type != 'video':
            pages_data = prepare_pages_data(document, primary_version)

        download_url = None
        if preview_mode == 'image' and pages_data:
            download_url = pages_data[0]['url']
        elif primary_version.original_storage_key:
            try:
                download_url = fileserver_client.generate_download_url(
                    primary_version.original_storage_key, is_internal=False
                )
            except APIException:
                download_url = None

        pdf_preview_url = None
        if preview_mode == 'client_pdf':
            try:
                pdf_preview_url = fileserver_client.generate_preview_url(
                    primary_version.original_storage_key, is_internal=False
                )
            except APIException as e:
                logger.warning(f"Failed to generate client PDF URL for version {primary_version.id}: {e}")
                pdf_preview_url = None

        video_preview_url = None
        if preview_mode == 'video' and render_status == 'ready':
            try:
                playlist_url = fileserver_client.generate_preview_url(
                    primary_version.storage_key, is_internal=False
                )
                video_preview_url = f"{playlist_url}/playlist.m3u8"
            except APIException as e:
                logger.warning(f"Failed to generate client video URL for version {primary_version.id}: {e}")
                video_preview_url = None

        response_data = {
            "id": document.id,
            "name": document.name,
            "type": document.type,
            "num_pages": document.num_pages,
            "preview_mode": preview_mode,
            "preview_status": preview_status,
            "render_status": render_status,
            "render_error": primary_version.render_error,
            "pages": pages_data,
            "pdf_preview_url": pdf_preview_url,
            "video_preview_url": video_preview_url,
            "download_url": download_url,
        }

        return Response(response_data, status=status.HTTP_200_OK)


@extend_schema(tags=['documents'])
class FolderViewSet(viewsets.ModelViewSet):
    queryset = Folder.objects.active().all()
    serializer_class = FolderSerializer

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
        logging.debug('get root folder contents...')
        sub_folders = list(folder.children.active().filter(created_by=request.user))
        logging.debug(f'folders: {sub_folders}')
        documents = list(folder.documents.active().filter(created_by=request.user).prefetch_related(
            'versions', 'share_links', 'share_links__view_sessions'
        ).annotate(share_link_view_count=Count('share_links__view_sessions', distinct=True)))
        logging.debug(f'documents: {documents}')

        sub_folders_serializer = FolderSerializer(sub_folders, many=True)
        sub_folders_data = sub_folders_serializer.data
        logging.debug(f'sub_folders_data: {sub_folders_data}')
        documents_serializer = DocumentSerializer(documents, many=True, context={'request': request})
        documents_data = documents_serializer.data
        logging.debug(f'documents_data: {documents_data}')

        return {
            'sub_folders': sub_folders_data,
            'documents': documents_data,
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
        if parent and (parent.created_by != self.request.user or parent.deleted_at is not None):
            raise serializers.ValidationError(
                {'parent': "You can only create subfolders in your own folders."}
            )

        if not parent:
            parent = self._get_root_folder()
        folder = serializer.save(
            created_by=self.request.user,
            organization=self.request.user.organization,
            parent=parent
        )
        touch_folder_ancestors(folder.parent)

    def perform_update(self, serializer):
        parent = serializer.validated_data.get('parent')
        if parent and (parent.created_by != self.request.user or parent.deleted_at is not None):
            raise serializers.ValidationError(
                {'parent': "You can only move folders to destinations you own."}
            )
        old_parent = serializer.instance.parent
        folder = serializer.save()
        touch_folder_ancestors(folder.parent)
        if old_parent and old_parent != folder.parent:
            touch_folder_ancestors(old_parent)

    def destroy(self, request, *args, **kwargs):
        folder = self.get_object()
        try:
            soft_delete_folder(folder, request.user)
        except Exception as e:
            logger.error(f"Error soft deleting folder {folder.id}: {e}")
            return Response(
                {"detail": "An error occurred while deleting the folder."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentCopyRateThrottle(throttling.UserRateThrottle):
    scope = 'document_copy'


@extend_schema(tags=['documents'])
class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.active().all()
    serializer_class = DocumentSerializer

    def get_queryset(self):
        """
        For 'list' action, only return documents created by the current user to keep
        the personal document library strictly personal.
        For detail actions ('retrieve', 'stats', 'view_sessions', 'versions'),
        include co-managed documents accessible through shared Datarooms.
        """
        if self.action == 'list':
            return self.queryset.filter(
                organization=self.request.user.organization,
                created_by=self.request.user
            ).select_related('folder').annotate(
                share_link_view_count=Count('share_links__view_sessions', distinct=True)
            ).prefetch_related(
                'versions', 'share_links', 'share_links__view_sessions'
            )

        return get_document_queryset_for_user(self.request.user).select_related('folder').annotate(
            share_link_view_count=Count('share_links__view_sessions', distinct=True)
        ).prefetch_related(
            'versions', 'share_links', 'share_links__view_sessions'
        )

    def perform_update(self, serializer):
        if serializer.instance.created_by != self.request.user and getattr(self.request.user, 'role', '') != 'admin':
            raise PermissionDenied("You do not have permission to modify this document.")
        old_folder = serializer.instance.folder
        document = serializer.save()
        touch_folder_ancestors(document.folder)
        if old_folder and old_folder != document.folder:
            touch_folder_ancestors(old_folder)

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
            target_folder = get_object_or_404(Folder.objects.active(), id=folder_id, organization=organization)
        else:
            # Default to listing documents in the root folder
            target_folder = get_object_or_404(Folder.objects.active(), organization=organization, name='__root__', parent=None)

        queryset = queryset.filter(folder=target_folder)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        if document.created_by != request.user and getattr(request.user, 'role', '') != 'admin':
            raise PermissionDenied("You do not have permission to delete this document.")
        soft_delete_document(document, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """
        Returns a lightweight status object containing only status and status_message.
        """
        document = get_object_or_404(
            get_document_queryset_for_user(request.user).only('status', 'status_message'),
            id=pk
        )
        return Response({
            'status': document.status,
            'status_message': document.status_message
        })

    @action(detail=True, methods=['post'], throttle_classes=[DocumentCopyRateThrottle])
    def copy(self, request, *args, **kwargs):
        """
        Creates a copy of the document.
        """
        original_document = self.get_object()
        try:
            new_document = copy_document(original_document, request.user)
            serializer = self.get_serializer(new_document)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except QuotaExceededError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except APIException as e:
            return Response({'detail': str(e.detail)}, status=e.status_code)
        except Exception:
            logger.exception(f"An unexpected error occurred while copying document {original_document.id}")
            return Response(
                {"detail": "An unexpected error occurred during the copy operation."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['get'], url_path='view-sessions')
    def view_sessions(self, request, pk=None):
        from sharelinks.models import ViewSession
        from sharelinks.serializers import ViewSessionSerializer

        document = self.get_object()
        if document.created_by != request.user and getattr(request.user, 'role', '') != 'admin':
            raise PermissionDenied("Only the document owner or an organization admin can view access sessions.")

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
        # Calculate high-level engagement metrics for the document.
        # Note: total_views includes ALL sessions (including 0-second bounces) so owners know
        # the link was clicked. However, avg_duration_seconds filters out 0-second bounces to prevent
        # brief bounces from artificially deflating the actual reading duration of engaged viewers.
        aggregates = ViewSession.objects.filter(
            share_link__document=document
        ).aggregate(
            total_views=Count('id'),
            total_duration_seconds=Sum('duration_seconds'),
            total_downloads=Count('downloaded_at'),
            engaged_views=Count('id', filter=Q(duration_seconds__gt=0)),
        )

        total_views = aggregates['total_views']
        total_duration = aggregates['total_duration_seconds'] or 0
        engaged_views = aggregates['engaged_views'] or 0
        avg_duration = total_duration / engaged_views if engaged_views > 0 else 0
        total_downloads = aggregates['total_downloads']

        return Response({
            'total_views': total_views,
            'total_duration_seconds': total_duration,
            'avg_duration_seconds': avg_duration,
            'total_downloads': total_downloads,
        })

    @action(detail=True, methods=['post'])
    def promote_version(self, request, pk=None):
        """
        Promotes a specific DocumentVersion to be the active (primary) version of the Document.
        """
        document = self.get_object()
        if document.created_by != request.user and getattr(request.user, 'role', '') != 'admin':
            raise PermissionDenied("You do not have permission to modify versions of this document.")

        version_id = request.data.get('version_id')
        if not version_id:
            return Response({'detail': 'version_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        version = get_object_or_404(document.versions, id=version_id)

        try:
            promote_document_version(document, version, request.user)
        except QuotaExceededError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as e:
            return Response(
                {'detail': e.message if hasattr(e, 'message') else str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception:
            logger.exception(f"Failed to promote version {version_id} for document {document.id}")
            return Response(
                {'detail': 'An internal error occurred. Please try again later.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        serializer = self.get_serializer(document)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='rebuild-preview')
    def rebuild_preview(self, request, pk=None):
        """
        Forces a rebuild of the document preview by clearing existing pages and enqueuing render.
        """
        document = self.get_object()
        if document.created_by != request.user and getattr(request.user, 'role', '') != 'admin':
            raise PermissionDenied("You do not have permission to rebuild preview for this document.")

        version_id = request.data.get('version_id')
        if version_id:
            primary_version = get_object_or_404(document.versions, id=version_id)
        else:
            primary_version = document.versions.filter(is_primary=True).first()

        if not primary_version:
            return Response(
                {"detail": "Document version not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Concurrency race guard: reject if rendering is already in progress
        if primary_version.render_status in {DocumentVersion.RENDER_QUEUED, DocumentVersion.RENDER_PROCESSING}:
            return Response(
                {"detail": "A preview generation is already in progress. Please wait."},
                status=status.HTTP_409_CONFLICT
            )

        # Collect storage keys before deleting database rows
        page_storage_keys = list(primary_version.pages.values_list('storage_key', flat=True))

        with transaction.atomic():
            primary_version.render_status = DocumentVersion.RENDER_NOT_GENERATED
            primary_version.render_error = ''
            primary_version.has_pages = False
            primary_version.num_pages = None
            primary_version.save(update_fields=['render_status', 'render_error', 'has_pages', 'num_pages', 'updated_at'])
            primary_version.pages.all().delete()

        # Clean up fileserver storage outside database transaction
        for storage_key in page_storage_keys:
            try:
                fileserver_client.delete_file(storage_key)
            except Exception as e:
                logger.error(f"Failed to delete page file {storage_key} during force rebuild: {e}")

        # Re-enqueue the background task
        render_status = enqueue_server_preview_render(primary_version)
        preview_status = preview_status_for_render_status(render_status)

        return Response({
            "preview_status": preview_status,
            "render_status": render_status,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        """
        Retrieves a list of DocumentVersions for the given Document.
        """
        document = self.get_object()
        versions = document.versions.all().order_by('-version_number')
        
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(versions, request, view=self)
        if page is not None:
            serializer = DocumentVersionListSerializer(page, many=True, context={'request': request})
            return paginator.get_paginated_response(serializer.data)
            
        serializer = DocumentVersionListSerializer(versions, many=True, context={'request': request})
        return Response(serializer.data)


@extend_schema(tags=['documents'])
class MoveItemsView(APIView):
    """
    A dedicated view for moving documents and folders to a new location.
    """

    class MoveItemsSerializer(serializers.Serializer):
        document_ids = serializers.ListField(
            child=serializers.CharField(), required=False, allow_empty=True
        )
        folder_ids = serializers.ListField(
            child=serializers.CharField(), required=False, allow_empty=True
        )
        destination_folder_id = serializers.CharField(allow_null=True)

    class MoveItemsResponseSerializer(serializers.Serializer):
        detail = serializers.CharField()

    @extend_schema(
        request=MoveItemsSerializer,
        responses={200: MoveItemsResponseSerializer, 400: dict, 403: dict, 404: dict, 500: dict},
    )
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
                    destination_folder = Folder.objects.active().get(id=dest_id, created_by=user)
                else:
                    destination_folder = Folder.objects.get_root_for_org(organization)

                # 2. Get and validate source items
                documents_to_move = Document.objects.active().filter(id__in=doc_ids, created_by=user)
                if documents_to_move.count() != len(doc_ids):
                    raise PermissionDenied("You do not have permission to move one or more of the selected documents.")

                folders_to_move = Folder.objects.active().filter(id__in=folder_ids, created_by=user)
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
                source_folders = set()
                for doc in documents_to_move:
                    if doc.folder:
                        source_folders.add(doc.folder)
                for folder in folders_to_move:
                    if folder.parent:
                        source_folders.add(folder.parent)

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

                for src_folder in source_folders:
                    touch_folder_ancestors(src_folder)
                touch_folder_ancestors(destination_folder)

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


@extend_schema(tags=['documents'])
class RootFolderView(APIView):
    """
    Provides the ID of the user's root folder.
    """

    class RootFolderResponseSerializer(serializers.Serializer):
        id = serializers.CharField()

    @extend_schema(
        responses={200: RootFolderResponseSerializer, 404: dict},
    )
    def get(self, request, *args, **kwargs):
        try:
            root_folder = Folder.objects.get_root_for_org(request.user.organization)
            return Response({'id': root_folder.id})
        except Folder.DoesNotExist:
            return Response({'detail': 'Root folder not found.'}, status=status.HTTP_404_NOT_FOUND)


@extend_schema(tags=['trash'])
class TrashViewSet(viewsets.ViewSet):
    serializer_class = TrashItemSerializer

    @extend_schema(
        summary="List trash items",
        responses={200: TrashItemSerializer(many=True)}
    )
    def list(self, request):
        """
        List top-level soft-deleted documents and folders via DB-level SQL UNION ALL pagination.
        Only items whose parent folder is active (or null) are shown as top-level trash entries.
        """
        folders_qs = Folder.objects.deleted().filter(
            deleted_by=request.user
        ).filter(
            Q(parent__isnull=True) | Q(parent__deleted_at__isnull=True) | Q(deleted_at__lt=F('parent__deleted_at'))
        ).annotate(
            item_type=Value('folder', CharField()),
            file_type=Value('folder', CharField()),
            size=Value(None, BigIntegerField()),
            parent_name=F('parent__name'),
            view_count=Value(0, BigIntegerField())
        ).values('id', 'name', 'item_type', 'file_type', 'size', 'deleted_at', 'deleted_by_id', 'parent_name', 'parent_id', 'view_count')

        docs_qs = Document.objects.deleted().filter(
            deleted_by=request.user
        ).filter(
            Q(folder__isnull=True) | Q(folder__deleted_at__isnull=True) | Q(deleted_at__lt=F('folder__deleted_at'))
        ).annotate(
            item_type=Value('document', CharField()),
            file_type=F('type'),
            size=F('file_size'),
            parent_name=F('folder__name'),
            parent_id=F('folder_id'),
            view_count=Count('share_links__view_sessions', distinct=True)
        ).values('id', 'name', 'item_type', 'file_type', 'size', 'deleted_at', 'deleted_by_id', 'parent_name', 'parent_id', 'view_count')

        combined_qs = folders_qs.union(docs_qs).order_by('-deleted_at')

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(combined_qs, request, view=self)
        if page is not None:
            return paginator.get_paginated_response(page)

        return Response(list(combined_qs))

    @extend_schema(
        summary="Restore a soft-deleted document or folder",
        parameters=[
            OpenApiParameter(name="id", type=str, location=OpenApiParameter.PATH, description="Item ID to restore")
        ],
        responses={
            200: TrashRestoreResponseSerializer,
            400: OpenApiResponse(description="Bad Request"),
            404: OpenApiResponse(description="Item not found in trash"),
        }
    )
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore a soft-deleted document or folder."""
        # Check both Document and Folder
        item = Folder.objects.deleted().filter(id=pk, deleted_by=request.user).first()
        item_type = 'folder'
        if not item:
            item = Document.objects.deleted().filter(id=pk, deleted_by=request.user).first()
            item_type = 'document'
            if not item:
                return Response({"detail": "Item not found in trash."}, status=status.HTTP_404_NOT_FOUND)

        try:
            restored_item, original_name, was_renamed = restore_item(item, item_type, request.user)
            detail_msg = f'Restored as "{restored_item.name}"' if was_renamed else "Item restored successfully."
            return Response({
                "detail": detail_msg,
                "id": str(restored_item.id),
                "name": restored_item.name,
                "original_name": original_name,
                "was_renamed": was_renamed,
            })
        except (DjangoValidationError, APIException) as e:
            if hasattr(e, 'messages') and e.messages:
                msg = e.messages[0]
            elif hasattr(e, 'detail'):
                msg = e.detail
            else:
                msg = str(e)
            return Response({"detail": str(msg)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Failed to restore item {pk}: {e}")
            return Response({"detail": "An error occurred during restoration."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Permanently hard-delete an item and its storage binary",
        parameters=[
            OpenApiParameter(name="id", type=str, location=OpenApiParameter.PATH, description="Item ID to permanently delete")
        ],
        responses={
            204: OpenApiResponse(description="No Content"),
            404: OpenApiResponse(description="Item not found in trash"),
        }
    )
    @action(detail=True, methods=['delete'])
    def permanent(self, request, pk=None):
        """Permanently hard-delete an item and its storage binary."""
        item = Folder.objects.deleted().filter(id=pk, deleted_by=request.user).first()
        item_type = 'folder'
        if not item:
            item = Document.objects.deleted().filter(id=pk, deleted_by=request.user).first()
            item_type = 'document'
            if not item:
                return Response({"detail": "Item not found in trash."}, status=status.HTTP_404_NOT_FOUND)

        try:
            if item_type == 'folder':
                delete_folder_and_contents(item)
            else:
                delete_document_and_files(item)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            logger.error(f"Failed to permanently delete item {pk}: {e}")
            return Response({"detail": "An error occurred during permanent deletion."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        summary="Permanently hard-delete all items in trash",
        responses={
            204: OpenApiResponse(description="No Content"),
        }
    )
    @action(detail=False, methods=['delete'], url_path='empty')
    def empty(self, request):
        """Permanently hard-delete all items in trash."""
        try:
            empty_trash(request.user)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            logger.error(f"Failed to empty trash for user {request.user.id}: {e}")
            return Response({"detail": "An error occurred while emptying trash."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
