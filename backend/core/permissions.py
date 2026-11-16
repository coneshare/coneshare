from oauth2_provider.models import AccessToken
from rest_framework import permissions
from core.models import APIKey


def require_full_access(func):
    """Mark a ViewSet action as requiring the 'full_access' API key tier for unsafe methods."""
    setattr(func, 'requires_full_access', True)
    return func


class IsAdmin(permissions.BasePermission):
    """
    Allows access only to organization admin users.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and getattr(request.user, 'role', '') == 'admin')


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Allows read-only access to all authenticated users,
    but restricts mutating operations (POST, PUT, PATCH, DELETE) to organization admin users.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(getattr(request.user, 'role', '') == 'admin')


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

        if tier == 'read_write':
            if method == 'DELETE':
                self.message = "API key tier 'read_write' does not permit DELETE requests."
                return False

            # Destructive or privileged ViewSet actions invoked via non-DELETE methods (e.g. POST)
            action = getattr(view, 'action', None)
            action_handler = getattr(view, action, None) if action else None
            if (
                action_handler
                and getattr(action_handler, 'requires_full_access', False)
                and method not in permissions.SAFE_METHODS
            ):
                self.message = (
                    f"API key tier 'read_write' does not permit action '{action}'. "
                    "'full_access' tier is required."
                )
                return False

            # API key management requires 'full_access' tier
            if getattr(view, 'basename', None) == 'api-key' and method not in ('GET', 'HEAD', 'OPTIONS'):
                self.message = "API key tier 'read_write' does not permit managing API keys. 'full_access' tier is required."
                return False

            # Administrative mutations require 'full_access' tier
            view_module = getattr(view, '__module__', '')
            is_admin_view = 'admin_views' in view_module or any(
                perm is IsAdmin or (isinstance(perm, type) and issubclass(perm, IsAdmin))
                for perm in getattr(view, 'permission_classes', [])
            )
            if is_admin_view and method not in ('GET', 'HEAD', 'OPTIONS'):
                self.message = "API key tier 'read_write' does not permit administrative modifications. 'full_access' tier is required."
                return False

        return True


class OAuth2ScopePermission(permissions.BasePermission):
    """
    DRF permission class enforcing granular OAuth 2.1 scopes on AccessToken requests.
    Non-OAuth requests (JWT, Session, APIKey) are unaffected.
    """

    message = "The presented OAuth token lacks the required scope for this operation."

    _MODULE_SCOPE_RULES = {
        'analytics.': {
            'safe': ('analytics:read',),
            'write': (),
        },
        'documents.': {
            'safe': ('documents:read', 'documents:write'),
            'write': ('documents:write',),
        },
        'filerequests.': {
            'safe': ('documents:read', 'documents:write'),
            'write': ('documents:write',),
        },
        'cloudfiles.': {
            'safe': ('documents:read', 'documents:write'),
            'write': ('documents:write',),
        },
        'datarooms.': {
            'safe': ('datarooms:read', 'datarooms:write'),
            'write': ('datarooms:write',),
        },
        'sharelinks.': {
            'safe': ('documents:read', 'documents:write', 'datarooms:read', 'datarooms:write'),
            'write': ('datarooms:write', 'documents:write'),
        },
    }

    def _required_scopes_for(self, request, view) -> tuple[str, ...] | None:
        view_module = getattr(view, '__module__', '') or ''
        is_admin_view = 'admin_views' in view_module or any(
            perm is IsAdmin or (isinstance(perm, type) and issubclass(perm, IsAdmin))
            for perm in getattr(view, 'permission_classes', [])
        )
        if is_admin_view or getattr(view, 'basename', None) in ('api-key', 'trash'):
            return None

        action = getattr(view, 'action', None)
        if action in ('transfer_ownership', 'remove_collaborator'):
            return None

        is_safe = request.method.upper() in permissions.SAFE_METHODS
        if view_module.startswith('documents.') and action == 'stats':
            return ('analytics:read',) if is_safe else None

        for prefix, rules in self._MODULE_SCOPE_RULES.items():
            if view_module.startswith(prefix):
                return rules['safe'] if is_safe else rules['write']

        return None

    def has_permission(self, request, view):
        if not isinstance(request.auth, AccessToken):
            return True

        if not request.user or not getattr(request.user, 'is_active', False):
            self.message = "User inactive or deleted."
            return False

        accepted_scopes = self._required_scopes_for(request, view)
        if not accepted_scopes:
            self.message = "OAuth tokens are not permitted for this endpoint."
            return False

        token_scopes = set((request.auth.scope or '').split())
        if token_scopes & set(accepted_scopes):
            return True

        self.message = (
            f"OAuth token missing required scope (requires one of: {', '.join(accepted_scopes)})."
        )
        return False
