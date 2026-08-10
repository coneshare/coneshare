from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import translation
from django.utils.translation import gettext as _


@shared_task
def send_signup_verification_email_task(email: str, verify_url: str, language: str = 'en'):
    with translation.override(language):
        context = {
            'verify_url': verify_url,
            'site_domain': settings.SITE_DOMAIN,
        }
        text_content = render_to_string('core/signup_verification_email.txt', context)
        html_content = render_to_string('core/signup_verification_email.html', context)

        send_mail(
            subject=_('Verify your Coneshare account'),
            message=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            html_message=html_content,
        )
