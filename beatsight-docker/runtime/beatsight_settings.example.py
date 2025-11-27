import os

DEBUG = False
SECRET_KEY = '!!changeme!!'
ALLOWED_HOSTS = [
    '127.0.0.1',
    'demo.beatsight.com',
    # Add other allowd host as needed
]
CSRF_TRUSTED_ORIGINS = [
    'https://demo.beatsight.com',
    # Add other trusted origins as needed
]

BEATSIGHT_DATA_DIR = '/data'

# Database settings
DATABASES = {
    'default': {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "postgres",
        "USER": "postgres",
        "PASSWORD": "",
        "HOST": "postgres",
        "PORT": "",
    }
}


# Email settings
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.mail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True  # Use TLS
EMAIL_HOST_USER = 'xxx@mail.com'  # Your email address
EMAIL_HOST_PASSWORD = 'yyy'  # Your email passwrod
DEFAULT_FROM_EMAIL = 'zzz'  # Default from email address


# Logging
LOG_DIR = '/home/beatsight/logs/beatsight'
LOGGING = {
    'version': 1,
    'disable_existing_loggers': True,
    'formatters': {
        'standard': {
            'format': '%(asctime)s %(pathname)s:%(lineno)d: %(levelname)-5s: %(funcName)s()- %(message)s'
        },
        'simple': {
            'format': '%(asctime)s [%(levelname)s] %(name)s:%(lineno)s %(funcName)s %(message)s'
        },
    },
    'filters': {
        'require_debug_false': {
            '()': 'django.utils.log.RequireDebugFalse'
        },
        'require_debug_true': {
            '()': 'django.utils.log.RequireDebugTrue'
        },
    },
    'handlers': {
        'mail_admins': {
            'level': 'ERROR',
            'filters': ['require_debug_false'],
            'class': 'django.utils.log.AdminEmailHandler',
            'include_html': True,
        },
        'beatsight_log_hdlr': {
            'level': 'DEBUG',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(LOG_DIR, 'beatsight.log'),
            'maxBytes': 1024 * 1024 * 500,  # 500 MB
            'backupCount': 10,
            'formatter': 'standard',
        },
        'beatsight_task_log_hdlr': {
            'level': 'DEBUG',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(LOG_DIR, 'task.log'),
            'maxBytes': 1024 * 1024 * 500,  # 500 MB
            'backupCount': 10,
            'formatter': 'standard',
        },
        'console': {
            'level': 'DEBUG',
            'filters': ['require_debug_true'],
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        'scprits_handler': {
            'level': 'DEBUG',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(LOG_DIR, 'script.log'),
            'maxBytes': 1024 * 1024 * 5,  # 5 MB
            'backupCount': 5,
            'formatter': 'standard',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True
        },
        'beatsight': {
            'handlers': [
                'console', 'beatsight_log_hdlr',
            ],
            'level': 'DEBUG',
            'propagate': True
        },
        'django.request': {
            'handlers': [
                'mail_admins', 'beatsight_log_hdlr',
            ],
            'level': 'DEBUG',
            'propagate': True
        },
        'tasks': {
            'handlers': [
                'console', 'beatsight_task_log_hdlr',
            ],
            'level': 'DEBUG',
            'propagate': True
        },
        'scripts': {
            'handlers': ['scprits_handler'],
            'level': 'ERROR',
            'propagate': False
        },
    }
}
