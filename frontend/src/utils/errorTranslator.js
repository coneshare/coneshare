import i18n from '../i18n';

const ERROR_STRING_MAPPINGS = {
  "Failed to access Google Drive. Your authorization token may have expired or been revoked. Please reconnect your account.":
    "errors.googleDriveTokenExpired",
  "Failed to refresh Google Drive token. Please try disconnecting and reconnecting your account.":
    "errors.googleDriveRefreshFailed",
  "This link requires an email address to view.":
    "errors.linkRequiresEmail",
  "This link is password-protected. Please enter the password to continue.":
    "errors.linkPasswordProtected",
  "NDA acceptance is required to view this content.":
    "errors.linkNdaRequired",
  "Verification token is valid. Please confirm access.":
    "errors.linkVerificationTokenValid",
  "This link has expired.":
    "errors.linkExpired",
  "Document is not yet ready for viewing.":
    "errors.documentNotReady",
  "This link is not password protected.":
    "errors.linkNotPasswordProtected",
  "Password verified successfully.":
    "errors.passwordVerified",
  "Invalid password.":
    "errors.invalidPassword",
  "This link does not require an NDA.":
    "errors.linkNoNdaRequired",
  "NDA accepted successfully.":
    "errors.ndaAccepted",
  "This link does not require an email address.":
    "errors.linkNoEmailRequired",
  "An unexpected error occurred: link target is missing.":
    "errors.linkTargetMissing",
  "Access granted.":
    "errors.accessGranted",
  "Could not send verification email. Please try again later.":
    "errors.verificationEmailFailed",
  "Verification link sent. Please check your email to continue.":
    "errors.verificationEmailSent",
  "Token is required.":
    "errors.tokenRequired",
  "Verification context mismatch. Please request a new verification link.":
    "errors.verificationContextMismatch",
  "The verification link has expired or is invalid.":
    "errors.verificationLinkExpired",
  "Access granted successfully.":
    "errors.accessGranted",
  "The verification link has already been used or is invalid.":
    "errors.verificationLinkUsed",
  "Authorization required to view this content.":
    "errors.authorizationRequired",
  "You do not have permission to view this document.":
    "errors.noPermissionToView",
  "Document has too many pages to generate a preview.":
    "errors.documentTooManyPages",
  "An error occurred during preview generation.":
    "errors.previewGenerationFailed",
  "The preview could not be generated.":
    "errors.previewCouldNotBeGenerated",
};

/**
 * Translates backend error messages or objects to current i18n language string.
 * @param {Error|string} errorOrDetail - Axios error object or raw message string.
 * @param {string} [fallbackKey] - Optional fallback key if message is unmapped.
 * @returns {string} Localized error message string.
 */
export function getLocalizedErrorMessage(errorOrDetail, fallbackKey) {
  let rawDetail = '';

  if (typeof errorOrDetail === 'string') {
    rawDetail = errorOrDetail;
  } else if (errorOrDetail?.response?.data?.detail) {
    rawDetail = errorOrDetail.response.data.detail;
  } else if (errorOrDetail?.response?.data?.message) {
    rawDetail = errorOrDetail.response.data.message;
  } else if (errorOrDetail?.message) {
    rawDetail = errorOrDetail.message;
  }

  if (rawDetail && ERROR_STRING_MAPPINGS[rawDetail]) {
    return i18n.t(ERROR_STRING_MAPPINGS[rawDetail]);
  }

  if (rawDetail) {
    return rawDetail;
  }

  if (fallbackKey) {
    return i18n.t(fallbackKey);
  }

  return i18n.t('common.errorOccurred', { defaultValue: 'An unexpected error occurred.' });
}
