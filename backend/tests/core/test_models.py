import pytest
from django.contrib.auth import get_user_model
from core.models import UserGroup

User = get_user_model()


@pytest.mark.django_db
def test_organization_creation(organization):
    """Test that an Organization can be created with all fields."""
    assert organization.name == "Default Organization"
    assert organization.plan == "self-hosted"
    assert organization.id is not None
    assert isinstance(organization.id, str)
    assert organization.created_at is not None
    assert organization.updated_at is not None
    assert str(organization) == "Default Organization"


@pytest.mark.django_db
def test_user_creation(organization):
    """Test that a custom User can be created."""
    user = User.objects.create_user(
        username='test@example.com',
        email='test@example.com',
        password='password123',
        organization=organization,
        name="Test User",
        role="admin"
    )

    assert user.email == 'test@example.com'
    assert user.organization == organization
    assert user.name == "Test User"
    assert user.role == "admin"
    assert user.check_password('password123')

    # Test custom user model properties
    assert User.USERNAME_FIELD == 'email'
    assert user.first_name is None
    assert user.last_name is None
    assert str(user) == 'test@example.com'

    # Test timestamps
    assert user.date_joined is not None  # From AbstractUser
    assert user.updated_at is not None


@pytest.mark.django_db
def test_user_group_creation(organization):
    """Test that a UserGroup can be created."""
    group = UserGroup.objects.create(
        name="Developers",
        organization=organization
    )

    assert group.name == "Developers"
    assert group.organization == organization
    assert str(group) == "Developers"


@pytest.mark.django_db
def test_model_relationships(organization):
    """Test the relationships between models."""
    user = User.objects.create_user(
        username='test2@example.com',
        email='test2@example.com',
        organization=organization
    )
    group = UserGroup.objects.create(
        name="Admins",
        organization=organization
    )
    user.groups.add(group)

    # Test user relationship from organization
    assert organization.users.count() == 1
    assert organization.users.first() == user

    # Test group relationship from organization
    assert organization.user_groups.count() == 1
    assert organization.user_groups.first() == group

    # Test user's membership in group
    assert group.id == user.groups.all()[0].id
    assert user in group.user_set.all()


def test_validate_branding_extras():
    """Test that validate_branding_extras correctly raises ValidationError for invalid schemas."""
    from core.models import validate_branding_extras
    from django.core.exceptions import ValidationError

    # Valid schema
    validate_branding_extras({'terms_url': 'https://example.com/terms', 'privacy_policy_url': 'https://example.com/privacy'})
    
    # Invalid type
    with pytest.raises(ValidationError, match="must be a dictionary"):
        validate_branding_extras("invalid")

    # Invalid key
    with pytest.raises(ValidationError, match="Invalid keys"):
        validate_branding_extras({'invalid_key': 'value'})

    # Invalid value type
    with pytest.raises(ValidationError, match="must be a string"):
        validate_branding_extras({'terms_url': 123})
