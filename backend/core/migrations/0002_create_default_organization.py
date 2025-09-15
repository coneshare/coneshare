from django.db import migrations

def create_default_organization(apps, schema_editor):
    """
    Creates a default Organization if one doesn't exist.
    """
    Organization = apps.get_model('core', 'Organization')
    if not Organization.objects.exists():
        Organization.objects.create(name="Default Organization")

class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_default_organization, reverse_code=migrations.RunPython.noop),
    ]
