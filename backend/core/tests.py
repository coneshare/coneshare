from django.contrib.auth import get_user_model
from django.test import TestCase

from core.models import Organization, UserGroup

User = get_user_model()


class CoreModelTests(TestCase):
    """
    Tests for the models in the core app.
    """

    def setUp(self):
        """
        Set up common objects for the tests.
        """
        self.organization = Organization.objects.create(name="Test Corp")

    def test_organization_creation(self):
        """
        Test that an Organization can be created with all fields.
        """
        self.assertEqual(self.organization.name, "Test Corp")
        self.assertEqual(self.organization.plan, "self-hosted")
        self.assertIsNotNone(self.organization.id)
        self.assertTrue(isinstance(self.organization.id, str))
        self.assertIsNotNone(self.organization.created_at)
        self.assertIsNotNone(self.organization.updated_at)
        self.assertEqual(str(self.organization), "Test Corp")

    def test_user_creation(self):
        """
        Test that a custom User can be created.
        """
        user = User.objects.create_user(
            username='test@example.com',
            email='test@example.com',
            password='password123',
            organization=self.organization,
            name="Test User",
            role="admin"
        )

        self.assertEqual(user.email, 'test@example.com')
        self.assertEqual(user.organization, self.organization)
        self.assertEqual(user.name, "Test User")
        self.assertEqual(user.role, "admin")
        self.assertTrue(user.check_password('password123'))

        # Test custom user model properties
        self.assertEqual(User.USERNAME_FIELD, 'email')
        self.assertIsNone(user.first_name)
        self.assertIsNone(user.last_name)
        self.assertEqual(str(user), 'test@example.com')

        # Test timestamps
        self.assertIsNotNone(user.date_joined) # From AbstractUser
        self.assertIsNotNone(user.updated_at)

    def test_user_group_creation(self):
        """
        Test that a UserGroup can be created.
        """
        group = UserGroup.objects.create(
            name="Developers",
            organization=self.organization
        )

        self.assertEqual(group.name, "Developers")
        self.assertEqual(group.organization, self.organization)
        self.assertEqual(str(group), "Developers")

    def test_model_relationships(self):
        """
        Test the relationships between models.
        """
        user = User.objects.create_user(
            username='test2@example.com',
            email='test2@example.com',
            organization=self.organization
        )
        group = UserGroup.objects.create(
            name="Admins",
            organization=self.organization
        )
        user.groups.add(group)

        # Test user relationship from organization
        self.assertEqual(self.organization.users.count(), 1)
        self.assertEqual(self.organization.users.first(), user)

        # Test group relationship from organization
        self.assertEqual(self.organization.user_groups.count(), 1)
        self.assertEqual(self.organization.user_groups.first(), group)

        # Test user's membership in group
        self.assertIn(group, user.groups.all())
        self.assertIn(user, group.user_set.all())
