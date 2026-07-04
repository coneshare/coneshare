import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authService } from "../services/authService";
import { isSafeUrl } from "../lib/utils";

const BrandingContext = createContext(null);

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState({
    brandName: "Coneshare",
    brandLogoUrl: "/logo.svg",
    brandWebsiteUrl: "",
    termsUrl: "https://www.coneshare.com/terms",
    privacyPolicyUrl: "https://www.coneshare.com/privacy-policy",
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    try {
      const data = await authService.getPublicSettings();
      const websiteUrl = data?.brand_website_url;
      const terms = data?.terms_url;
      const privacy = data?.privacy_policy_url;

      setBranding({
        brandName: data?.brand_name || "Coneshare",
        brandLogoUrl: data?.brand_logo_url || "/logo.svg",
        brandWebsiteUrl: (websiteUrl && isSafeUrl(websiteUrl)) ? websiteUrl : "",
        termsUrl: (terms && isSafeUrl(terms)) ? terms : "https://www.coneshare.com/terms",
        privacyPolicyUrl: (privacy && isSafeUrl(privacy)) ? privacy : "https://www.coneshare.com/privacy-policy",
      });
    } catch (error) {
      console.error("Failed to fetch public settings/branding:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  useEffect(() => {
    const faviconElement = document.querySelector("link[rel~='icon']");
    if (faviconElement) {
      faviconElement.href = branding.brandLogoUrl || "/logo.svg";
    }
  }, [branding.brandLogoUrl]);

  const value = {
    ...branding,
    isLoading,
    refetchBranding: fetchBranding,
  };

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === null) {
    return {
      brandName: "Coneshare",
      brandLogoUrl: "/logo.svg",
      brandWebsiteUrl: "",
      termsUrl: "https://www.coneshare.com/terms",
      privacyPolicyUrl: "https://www.coneshare.com/privacy-policy",
      isLoading: false,
      refetchBranding: async () => {},
    };
  }
  return context;
}
