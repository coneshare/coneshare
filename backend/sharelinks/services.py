import os
import re

from documents.models import Document
from .models import ShareLink


def _get_unique_name(model_class, original_name: str, filter_kwargs: dict, has_extension: bool) -> str:
    """
    Generates a unique name for a model instance within a given scope.
    If 'name' exists, it will suggest 'name (2)', 'name (3)', etc.
    This is optimized to use a single database query.

    Args:
        model_class: The Django model class to query (e.g., Document, Folder).
        original_name: The desired name for the instance.
        filter_kwargs: A dictionary of filters to define the uniqueness scope
                       (e.g., {'organization': org, 'folder': folder}).
        has_extension: A boolean indicating if the name has a file extension
                       that should be preserved.
    """
    if not original_name:
        return ""

    # Check if the original name is available. If so, use it.
    initial_check_kwargs = filter_kwargs.copy()
    initial_check_kwargs['name'] = original_name
    if not model_class.objects.filter(**initial_check_kwargs).exists():
        return original_name

    if has_extension:
        base, ext = os.path.splitext(original_name)
    else:
        base, ext = original_name, ""

    # Fetch all names that could be duplicates in a single query to process in memory.
    queryset_filter_kwargs = filter_kwargs.copy()
    queryset_filter_kwargs['name__startswith'] = base
    if has_extension:
        # This makes the query more efficient for names with extensions
        queryset_filter_kwargs['name__endswith'] = ext

    queryset = model_class.objects.filter(**queryset_filter_kwargs).values_list('name', flat=True)
    existing_names = set(queryset)

    # Regex to find ' (number)' at the end of the name. It handles names with and without extensions.
    pattern_str = rf'^{re.escape(base)}(?: \((\d+)\))?{re.escape(ext)}$'
    pattern = re.compile(pattern_str)

    highest_num = 0
    # The original name exists, so we start counting from 1.
    if original_name in existing_names:
        highest_num = 1

    for name in existing_names:
        match = pattern.match(name)
        if match:
            # group(1) will be the number string if it exists.
            num_str = match.group(1)
            if num_str:
                num = int(num_str)
                if num > highest_num:
                    highest_num = num

    # The new name will have the next number in sequence.
    return f"{base} ({highest_num + 1}){ext}"


def _get_unique_share_link_name(document: Document, original_name: str) -> str:
    """Generates a unique name for a share link within a document to avoid duplicates."""
    filter_kwargs = {'document': document}
    return _get_unique_name(ShareLink, original_name, filter_kwargs, has_extension=False)
