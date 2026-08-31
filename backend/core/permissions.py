from rest_framework import permissions
from core.models import APIKey


class APIKeyTierPermission(permissions.BasePermission):
    """
    DRF permission class that enforces API key scope tiers (read_only, read_write, full_access).
    Placed in the Permission phase to guarantee HTTP 403 response without breaking 401 challenge headers.
    """
    message = "API key tier permissions do not permit this operation."

    def has_permission(self, request, view):
        if not isinstance(request.auth, APIKey):
            return True  # Request not authenticated via API Key (e.g. Session/JWT)

        tier = request.auth.tier
        method = request.method.upper()

        if tier == 'read_only' and method not in ('GET', 'HEAD', 'OPTIONS'):
            self.message = f"API key tier 'read_only' does not permit {method} requests."
            return False

        if tier == 'read_write' and method == 'DELETE':
            self.message = "API key tier 'read_write' does not permit DELETE requests."
            return False

        return True


class IsAdmin(permissions.BasePermission):
    """
    Allows access only to admin users.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and getattr(request.user, 'role', '') == 'admin')
