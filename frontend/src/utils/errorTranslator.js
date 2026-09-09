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
  "A document with this name already exists in this location.":
    "errors.documentNameExists",
  "A folder with this name already exists in this location.":
    "errors.folderNameExists",
};

const DYNAMIC_ERROR_PATTERNS = [
  {
    pattern: /^Uploading this file would exceed your storage quota of (\d+(?:\.\d+)?) MB\.$/,
    handler: (match) => i18n.t('errors.storageQuotaExceeded', { quota: match[1] }),
  },
  {
    pattern: /^Uploading this file would exceed the Dataroom storage limit of (\d+(?:\.\d+)?) MB\.$/,
    handler: (match) => i18n.t('errors.dataroomStorageLimitExceeded', { limit: match[1] }),
  },
];

/**
 * Translates backend error messages or objects to current i18n language string.
 * @param {Error|string|Array} errorOrDetail - Axios error object or raw message string.
 * @param {string} [fallbackKey] - Optional fallback key if message is unmapped.
 * @returns {string} Localized error message string.
 */
export function getLocalizedErrorMessage(errorOrDetail, fallbackKey) {
  let rawDetail = '';
  const resData = errorOrDetail?.response?.data;

  if (typeof errorOrDetail === 'string') {
    rawDetail = errorOrDetail;
  } else if (Array.isArray(errorOrDetail)) {
    rawDetail = errorOrDetail.flat().join(' ');
  } else if (typeof resData === 'string') {
    rawDetail = resData;
  } else if (Array.isArray(resData)) {
    rawDetail = resData.flat().join(' ');
  } else if (resData && typeof resData === 'object') {
    if (resData.detail && typeof resData.detail === 'string') {
      rawDetail = resData.detail;
    } else if (resData.message && typeof resData.message === 'string') {
      rawDetail = resData.message;
    } else if (resData.name && Object.keys(resData).length === 1) {
      rawDetail = [resData.name].flat().join(' ');
    } else {
      const fieldErrors = [];
      for (const [key, val] of Object.entries(resData)) {
        const messages = Array.isArray(val) ? val.flat() : [val];
        const text = messages
          .map((m) => (typeof m === 'object' && m !== null ? JSON.stringify(m) : String(m)))
          .join(', ');
        if (key === 'non_field_errors' || key === 'error') {
          fieldErrors.push(text);
        } else {
          const formattedKey = key.replace(/_/g, ' ');
          fieldErrors.push(`${formattedKey}: ${text}`);
        }
      }
      if (fieldErrors.length > 0) {
        rawDetail = fieldErrors.join(' | ');
      }
    }
  } else if (errorOrDetail?.message) {
    rawDetail = errorOrDetail.message;
  }

  if (rawDetail) {
    if (ERROR_STRING_MAPPINGS[rawDetail]) {
      return i18n.t(ERROR_STRING_MAPPINGS[rawDetail]);
    }

    for (const { pattern, handler } of DYNAMIC_ERROR_PATTERNS) {
      const match = rawDetail.match(pattern);
      if (match) {
        return handler(match);
      }
    }

    return rawDetail;
  }

  if (fallbackKey) {
    return i18n.t(fallbackKey);
  }

  return i18n.t('common.errorOccurred', { defaultValue: 'An unexpected error occurred.' });
}
