from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sharelinks', '0011_add_scroll_percentage_to_pageview'),
    ]

    operations = [
        migrations.AddField(
            model_name='viewsession',
            name='email_verification_method',
            field=models.CharField(blank=True, choices=[('verified', 'Verified'), ('self_reported', 'Self-reported'), ('owner', 'Owner'), ('account', 'Account')], db_default='', default='', max_length=20),
        ),
    ]
