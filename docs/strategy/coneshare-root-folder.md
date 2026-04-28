# Coneshare: Root Folder Strategy Implementation

This document outlines the architectural approach for handling root folders in Coneshare's document management system, using an invisible `__root__` folder as the parent for all user-visible "root" folders.

---

## Why This Solution?

1. **Database Constraint Reliability**: Ensures the `unique_together = ('organization', 'parent', 'name')` constraint works consistently across all database backends (including SQLite)
2. **Improved Data Integrity**: Eliminates ambiguous NULL parent references
3. **Performance Benefits**: Simplifies queries for root-level folders by having them all under a single parent

---

## Implementation Details

### 1. Invisible Root Folder Creation

Automatically created for each organization via `post_migrate` signal:

```python
@receiver(post_migrate)
def create_invisible_root_folders(sender, **kwargs):
    from core.models import Organization
    from .models import Folder

    for org in Organization.objects.all():
        Folder.objects.get_or_create(
            organization=org,
            parent=None,
            name='__root__',
            defaults={'created_by': None}
        )
```

Key characteristics:
- Has `name='__root__'` and `parent=None`
- Not associated with any specific user (`created_by=None`)
- Automatically created during application startup

### 2. Folder Operations

All folder operations are modified to work within this structure:

#### Creating Folders
- User requests to create "root" folders are automatically placed under `__root__`
- Subfolder creation remains unchanged

#### Listing Folders
- The default queryset returns folders where `parent=__root__`
- The invisible `__root__` folder is never shown to users

#### Path-Based Operations
- Path resolution starts from `__root__` instead of NULL

### 3. Backend Changes

Key modifications were made to:

1. `FolderFromPathView`: Path resolution now starts from `__root__`
2. `_get_or_create_folders_from_path`: Initializes from `__root__`
3. `FolderViewSet`: Modified queryset and creation logic
4. Tests: Updated to verify the new structure

---

## Benefits

1. **Consistent Constraints**: Now reliably enforces uniqueness at the database level
2. **Clear Hierarchy**: All folders have explicit parent relationships
3. **Backend Simplification**: Removes special NULL parent cases
4. **Future Flexibility**: Makes it easier to implement features like:
   - Organization-wide trash/recycle bin
   - Cross-folder operations
   - Bulk permission changes

---

## Testing Strategy

Added tests to verify:
1. The automatic creation of `__root__` folders
2. Prevention of duplicate folder names at the same level
3. Correct path resolution through multiple levels
4. Proper scoping to the organization
5. That the invisible root does not appear in user-facing API responses

Example test case:
```python
def test_create_duplicate_root_folder_fails(api_client):
    data = {'name': 'Unique Root'}
    response1 = api_client.post('/api/v1/folders/', data)
    assert response1.status_code == status.HTTP_201_CREATED
    
    response2 = api_client.post('/api/v1/folders/', data)
    assert response2.status_code == status.HTTP_400_BAD_REQUEST
    assert "already exists" in str(response2.data['non_field_errors'])
```
