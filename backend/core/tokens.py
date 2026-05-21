from django.contrib.auth.tokens import PasswordResetTokenGenerator


class SignupActivationTokenGenerator(PasswordResetTokenGenerator):
    """Token generator for signup activation links.

    Includes is_active in the hash payload so the token becomes invalid
    immediately after account activation.
    """

    def _make_hash_value(self, user, timestamp):
        base = super()._make_hash_value(user, timestamp)
        return f"{base}{user.is_active}"


signup_activation_token_generator = SignupActivationTokenGenerator()
