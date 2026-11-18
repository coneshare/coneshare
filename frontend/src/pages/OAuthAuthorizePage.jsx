import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useBranding } from '../contexts/BrandingProvider';
import { oauthService } from '../services/oauthService';
import { getLocalizedErrorMessage } from '../utils/errorTranslator';

const OAUTH_PARAM_KEYS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'nonce',
  'resource',
];

export function OAuthAuthorizePage({
  onRedirect = (url) => window.location.assign(url),
}) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const branding = useBranding();
  const brandName = branding?.brandName || 'Coneshare';
  const brandLogoUrl = branding?.brandLogoUrl;

  const oauthParamsKey = searchParams.toString();

  const oauthParams = useMemo(() => {
    const params = {};
    OAUTH_PARAM_KEYS.forEach((key) => {
      if (key === 'resource') {
        const resources = searchParams
          .getAll('resource')
          .filter((val) => val !== '');
        if (resources.length === 1) {
          params.resource = resources[0];
        } else if (resources.length > 1) {
          params.resource = resources;
        }
        return;
      }
      const val = searchParams.get(key);
      if (val !== null && val !== '') {
        params[key] = val;
      }
    });
    return params;
  }, [searchParams]);

  const [consentData, setConsentData] = useState(null);
  const [loadedParamsKey, setLoadedParamsKey] = useState(null);
  const [selectedScopes, setSelectedScopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const activeParamsKeyRef = useRef(oauthParamsKey);
  activeParamsKeyRef.current = oauthParamsKey;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setSubmitting(false);
    setError(null);
    setConsentData(null);
    setLoadedParamsKey(null);
    setSelectedScopes([]);

    oauthService
      .getConsentDetails(oauthParams)
      .then((data) => {
        if (!mounted) return;
        setConsentData(data);
        setLoadedParamsKey(oauthParamsKey);
        setSelectedScopes((data?.scopes || []).map((item) => item.name));
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setConsentData(null);
        setLoadedParamsKey(null);
        setSelectedScopes([]);
        setError(getLocalizedErrorMessage(err, 'oauth.invalidRequest'));
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [oauthParams, oauthParamsKey]);

  useEffect(() => {
    document.title = `${t('oauth.authorizeTitle')} - ${brandName}`;
  }, [brandName, t]);

  const toggleScope = (scopeName) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeName)
        ? prev.filter((item) => item !== scopeName)
        : [...prev, scopeName]
    );
  };

  const hasCurrentConsentData = Boolean(
    consentData && loadedParamsKey === oauthParamsKey
  );

  const handleDecision = async (allow) => {
    if (!hasCurrentConsentData) {
      return;
    }
    const requestParamsKey = oauthParamsKey;
    setSubmitting(true);
    setError(null);
    try {
      const result = await oauthService.submitConsentDecision({
        ...oauthParams,
        allow,
        scopes: allow ? selectedScopes : undefined,
      });
      if (activeParamsKeyRef.current !== requestParamsKey) {
        return;
      }
      const redirectUrl = result?.redirect_url;
      if (!redirectUrl) {
        setError(t('oauth.missingRedirectUrl'));
        setSubmitting(false);
        return;
      }
      const parsed = new URL(redirectUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        setError(t('oauth.invalidRedirectScheme'));
        setSubmitting(false);
        return;
      }
      onRedirect(parsed.toString());
    } catch (err) {
      if (activeParamsKeyRef.current !== requestParamsKey) {
        return;
      }
      setError(getLocalizedErrorMessage(err, 'oauth.decisionFailed'));
      setSubmitting(false);
    }
  };

  const isDynamicClient =
    consentData?.registration_source === 'dcr' ||
    consentData?.registration_source === 'cimd';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-800">
        <div className="flex flex-col items-center text-center">
          {brandLogoUrl ? (
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gray-100 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
              <img
                src={brandLogoUrl}
                alt={`${brandName} logo`}
                className="h-8 w-8 object-contain"
              />
            </div>
          ) : (
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
          )}

          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('oauth.authorizeTitle')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('oauth.connectWorkspace', { brandName })}
          </p>
        </div>

        {loading && (
          <div className="mt-8 flex flex-col items-center justify-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              {t('oauth.loadingDetails')}
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {!loading && hasCurrentConsentData && (
          <div className="mt-6 space-y-5">
            {isDynamicClient && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t('oauth.unverifiedAppWarning')}</span>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {consentData.application_name}
                </span>
                {isDynamicClient && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {t('oauth.dynamicClientBadge')}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('oauth.signedInAs', {
                  email: consentData.user?.email || '',
                })}
              </p>
              {consentData.redirect_uri && (
                <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
                  {t('oauth.redirectsTo', {
                    redirectUri: consentData.redirect_uri,
                  })}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('oauth.requestedPermissions')}
              </p>
              <div className="space-y-2">
                {(consentData.scopes || []).map((scope) => {
                  const checked = selectedScopes.includes(scope.name);
                  return (
                    <label
                      key={scope.name}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={submitting}
                        onChange={() => toggleScope(scope.name)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="text-sm">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {scope.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {scope.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={submitting || !hasCurrentConsentData}
                onClick={() => handleDecision(false)}
              >
                {t('oauth.deny')}
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={
                  submitting || !hasCurrentConsentData || selectedScopes.length === 0
                }
                onClick={() => handleDecision(true)}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {t('oauth.approve')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OAuthAuthorizePage;
