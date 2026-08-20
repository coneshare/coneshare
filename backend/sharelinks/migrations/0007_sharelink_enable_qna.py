from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sharelinks', '0006_dataroomvisit_downloaded_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='sharelink',
            name='enable_qna',
            field=models.BooleanField(default=True),
        ),
    ]
