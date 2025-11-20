Here are the pros and cons of changing the folder field on the Document model to use on_delete=models.CASCADE.

## Changing folder to on_delete=models.CASCADE

This would automatically delete all Document objects within a Folder when that Folder is deleted.

Pros:

 • Simplicity: The deletion logic is handled automatically by the database. You would not need the extra code in the delete_folder_and_contents service to find and delete documents, which would simplify
   the application code.
 • Prevents Orphaned Documents: It guarantees that you will never have documents left in the database with a folder field set to NULL, ensuring a cleaner data state.

Cons:

 • Bypasses Application Logic: This is the most significant drawback. A database-level cascade does not trigger Django's delete() methods or any related signals on the Document model. The current
   implementation relies on application-level logic to decrement the total_document_size on the User model when a document is deleted. If you switch to CASCADE, this logic will be bypassed, and the user's
   storage usage will become incorrect.
 • Accidental Data Loss: It is more destructive. If a user accidentally deletes a folder, all documents inside it are permanently and instantly deleted from the database. There is no recovery path.
 • Less Flexibility: It makes implementing a "trash" or "recycle bin" feature much more difficult in the future, as that feature typically relies on "soft-deleting" or moving items, not permanently
   deleting them.

## Keeping folder as on_delete=models.SET_NULL (The Current Approach)

This sets the folder field to NULL on all Document objects within a Folder when that Folder is deleted. The documents themselves are not deleted by the database.

Pros:

 • Data Safety: It prevents accidental data loss. When a folder is deleted, its documents are preserved and become "unfiled" (they would appear in the root).
 • Forces Application Logic: It requires you to handle deletion explicitly in your application code (as the fix you identified does). This ensures that custom logic, such as updating the user's
   total_document_size, is executed correctly.
 • Future-Proof: It keeps the door open for features like a "trash" can, where you might want to restore a deleted folder and have its documents reappear.

Cons:

 • More Complex Code: You must write and maintain the service-layer logic to manually find and delete the contents of a folder, as the database will not do it for you. This is why the initial
   implementation was buggy.
 • Potential for Orphans: If the application-level cleanup logic is not implemented correctly, you could end up with orphaned documents that are no longer accessible through the folder structure but still
   exist in the database.
