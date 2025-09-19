from django.contrib.auth.models import UserManager as BaseUserManager


class UserManager(BaseUserManager):
    """
    Custom user manager that handles the creation of users and superusers,
    ensuring they are associated with the default organization.
    """
    def _get_default_organization(self):
        # Lazy import to avoid circular dependencies
        from .models import Organization
        org = Organization.objects.first()
        if not org:
            raise RuntimeError(
                "Default organization not found. Please run migrations before creating a user."
            )
        return org

    def create_user(self, username, email=None, password=None, **extra_fields):
        """
        Creates a user and assigns them to the default organization.
        """
        extra_fields.setdefault("organization", self._get_default_organization())
        # Since USERNAME_FIELD is 'email', the `username` argument will contain the email.
        return super().create_user(username, email, password, **extra_fields)

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        """
        Creates a superuser, assigns them to the default organization,
        and gives them the 'admin' role.
        """
        extra_fields.setdefault("role", "admin")
        return super().create_superuser(username, email, password, **extra_fields)
