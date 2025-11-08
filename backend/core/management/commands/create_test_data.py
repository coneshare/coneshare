from django.core.management.base import BaseCommand
from django.db import transaction
from core.models import User, Organization
from documents.models import Document, DocumentVersion, Folder

class Command(BaseCommand):
    help = 'Creates a test user and sample data for E2E testing.'

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write('Creating test data...')

        # Get or create the default organization
        org, _ = Organization.objects.get_or_create(name="Default Organization")

        # Create user
        user, created = User.objects.get_or_create(
            email='test@coneshare.com',
            defaults={
                'username': 'test@coneshare.com',
                'organization': org,
                'name': 'Test User',
            }
        )
        if created:
            user.set_password('password123')
            user.save()
            self.stdout.write(self.style.SUCCESS(f'Created user: {user.email}'))
        else:
            self.stdout.write(f'User {user.email} already exists.')

        # Get root folder
        root_folder = Folder.objects.get_root_for_org(org)

        # Create folder
        Folder.objects.get_or_create(
            name="Client Reports",
            created_by=user,
            parent=root_folder,
            organization=org
        )
        self.stdout.write('Created folder: Client Reports')

        # Create document
        doc, doc_created = Document.objects.get_or_create(
            name="Annual Report.pdf",
            created_by=user,
            folder=root_folder,
            organization=org,
            defaults={'status': 'ready', 'type': 'pdf'}
        )
        if doc_created:
            DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)
            self.stdout.write('Created document: Annual Report.pdf')

        # Create another document for dataroom tests
        doc2, doc2_created = Document.objects.get_or_create(
            name="Marketing Presentation.pdf",
            created_by=user,
            folder=root_folder,
            organization=org,
            defaults={'status': 'ready', 'type': 'pdf'}
        )
        if doc2_created:
            DocumentVersion.objects.create(document=doc2, version_number=1, is_primary=True)
            self.stdout.write('Created document: Marketing Presentation.pdf')

        self.stdout.write(self.style.SUCCESS('Test data created successfully.'))
