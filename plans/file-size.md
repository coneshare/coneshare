Here is the implementation plan for adding the file size feature.

Backend

 1 Update Model: In backend/documents/models.py, add a file_size field to the Document model to store the size of its primary version.

   class Document(BaseModel):
       # ...
       file_size = models.BigIntegerField(null=True, blank=True)
       # ...

 2 Update Services: In backend/documents/services.py, modify the _route_document_for_processing function to copy the file_size from the DocumentVersion to the parent Document.
 3 Update Serializer: In backend/documents/serializers.py, add file_size to the fields list in the DocumentSerializer's Meta class.
 4 Database Migration: Run makemigrations and migrate to apply the changes to the database schema.

Frontend

 1 Add Sort Option: In frontend/src/components/documents/filters/SortButton.jsx, add "File Size" as a new sorting option.
 2 Update Sorting Logic: In frontend/src/pages/DocumentsPage.jsx, update the sort logic within the useMemo hook to handle the new file_size key.
 3 Display File Size:
    • Create a utility function to format bytes into a human-readable string (e.g., "1.2 MB").
    • In frontend/src/components/documents/DocumentCard.jsx, use this utility to display the formatted file size.

Testing

 1 Backend: Add a unit test to backend/tests/documents/test_services.py to verify that the file_size is correctly set on the Document model when a new version is created.
 2 Frontend: In frontend/src/tests/pages/DocumentsPage.test.jsx, add a test to confirm that file sizes are displayed correctly and that sorting by file size works as expected.
