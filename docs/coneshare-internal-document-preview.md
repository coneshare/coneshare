# Coneshare Internal Document Preview Logic

This document details the backend logic for Coneshare's internal document preview, implemented in Python using the Django REST Framework. This feature allows a logged-in user to view a document directly within the application without creating a public share link.

The architecture is based on a dedicated API endpoint that provides the frontend with all the necessary data and secure URLs to render the document pages.

The core of this logic resides in an API endpoint defined in `coneshare/documents/urls.py`: `GET /api/documents/{document_id}/preview-data/`.

---

## The API Flow in 4 Steps

1.  **Authentication & Authorization**: Verify the user is logged in and is a member of the organization that owns the document.
2.  **Data Fetching**: Retrieve the document, its primary version, and all associated page data from the PostgreSQL database using Django's ORM.
3.  **Content Processing**: Generate secure, short-lived, pre-signed URLs for the page images stored in MinIO (or the configured storage backend).
4.  **Response Shaping**: Return a structured JSON object containing the document metadata and the secure URLs for the frontend to render.

---

### Implementation with Django REST Framework

The logic is implemented as a class-based view using Django REST Framework's `APIView` for clear, structured code.

**File**: `coneshare/documents/views.py`

```python
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from .models import Document, DocumentVersion
from .services import generate_presigned_url # A helper for storage

class DocumentPreviewDataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, document_id, *args, **kwargs):
        # Step 1: Authentication & Authorization.
        # The IsAuthenticated permission class ensures a valid user session.
        # We then filter by the user's organization for security.
        try:
            document = Document.objects.get(
                id=document_id,
                organization=request.user.organization
            )
        except Document.DoesNotExist:
            return Response(
                {"message": "Access denied or document not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Step 2: Data Fetching using Django's ORM.
        primary_version = document.versions.filter(is_primary=True).first()
        if not primary_version:
            return Response(
                {"message": "Document version not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Handle documents that are still processing.
        if document.status == 'processing':
            return Response(
                {"message": "Document is still processing. Please wait and try again."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Step 3 & 4: Content Processing and Response Shaping.
        pages_data = []
        if primary_version.has_pages:
            # Loop through pages and generate secure URLs.
            pages = primary_version.pages.order_by('page_number')
            for page in pages:
                page_url = generate_presigned_url(page.storage_key)
                pages_data.append({
                    "page_number": page.page_number,
                    "file": page_url,
                    "metadata": page.metadata,
                })
        
        # Prepare the final JSON response.
        response_data = {
            "documentId": document.id,
            "documentName": document.name,
            "documentType": document.type,
            "numPages": primary_version.num_pages,
            "pages": pages_data,
        }

        return Response(response_data, status=status.HTTP_200_OK)

```

### Generating Pre-signed URLs

A helper service function is required to generate secure, temporary URLs for files in storage. This prevents direct, unauthorized access to storage buckets.

**File**: `coneshare/documents/services.py`

```python
import boto3
from botocore.client import Config
from django.conf import settings

def generate_presigned_url(storage_key):
    """
    Generates a pre-signed URL for a file in MinIO/S3 using credentials
    from the project's settings.py file.
    """
    s3_client = boto3.client(
        's3',
        endpoint_url=settings.MINIO_ENDPOINT,
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        config=Config(signature_version='s3v4')
    )

    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': settings.MINIO_BUCKET_NAME, 'Key': storage_key},
            ExpiresIn=3600  # URL expires in 1 hour
        )
        return url
    except Exception as e:
        # It's good practice to log the error.
        print(f"Error generating pre-signed URL: {e}")
        return None
```

### Example Successful Response

A successful `GET` request to `/api/documents/doc_123abc/preview-data/` would return a JSON payload like this, which the frontend can use to render the document viewer.

```json
{
  "documentId": "doc_123abc",
  "documentName": "Annual Report.pdf",
  "documentType": "pdf",
  "numPages": 2,
  "pages": [
    {
      "pageNumber": 1,
      "file": "http://minio:9000/documents/page1.png?X-Amz-Algorithm=...",
      "metadata": { "width": 595, "height": 842 }
    },
    {
      "pageNumber": 2,
      "file": "http://minio:9000/documents/page2.png?X-Amz-Algorithm=...",
      "metadata": { "width": 595, "height": 842 }
    }
  ]
}
```
