export default function PrivacyPolicyPage() {
  const lastUpdatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <div className="prose prose-lg mx-auto text-gray-600">
          <h1 className="text-gray-900">Privacy Policy</h1>
          <p>
            <strong>Last Updated: {lastUpdatedDate}</strong>
          </p>

          <p>
            Coneshare, Inc. ("we," "us," or "our") is committed to protecting your privacy. This Privacy
            Policy explains how we collect, use, disclose, and safeguard your information when you visit our
            website, including any other media form, media channel, mobile website, or mobile application
            related or connected thereto (collectively, the "Site").
          </p>
          <p>
            This Privacy Policy applies only to our website and does not apply to the self-hosted
            Coneshare software product, which runs on your own infrastructure and does not transmit data to us.
          </p>

          <h2 className="text-gray-900">Collection of Your Information</h2>
          <p>
            We may collect information about you in a variety of ways. The information we may collect on
            the Site includes personally identifiable information, such as your name and email address, that
            you voluntarily give to us when you contact us or subscribe to our newsletter.
          </p>
          <p>
            We also automatically collect information when you access the Site, such as your IP address,
            browser type, operating system, and the pages you have viewed.
          </p>

          <h2 className="text-gray-900">Use of Your Information</h2>
          <p>
            Having accurate information about you permits us to provide you with a smooth, efficient, and
            customized experience. Specifically, we may use information collected about you via the Site
            to:
          </p>
          <ul>
            <li>Improve our website and services.</li>
            <li>Respond to your comments, questions, and provide customer service.</li>
            <li>Send you technical notices, updates, security alerts, and support messages.</li>
            <li>Communicate with you about products, services, offers, and events offered by us.</li>
          </ul>

          <h2 className="text-gray-900">Disclosure of Your Information</h2>
          <p>
            We do not share, sell, rent, or trade your information with third parties for their
            promotional purposes. We may share information we have collected about you in certain
            situations, such as with third-party service providers that perform services for us (e.g.,
            hosting, data analysis) or if required by law.
          </p>

          <h2 className="text-gray-900">Security of Your Information</h2>
          <p>
            We use administrative, technical, and physical security measures to help protect your personal
            information. While we have taken reasonable steps to secure the personal information you
            provide to us, please be aware that despite our efforts, no security measures are perfect or
            impenetrable.
          </p>

          <h2 className="text-gray-900">Changes to This Privacy Policy</h2>
          <p>
            We reserve the right to make changes to this Privacy Policy at any time and for any reason. We
            will alert you about any changes by updating the "Last Updated" date of this Privacy Policy.
          </p>

          <h2 className="text-gray-900">Contact Us</h2>
          <p>If you have questions or comments about this Privacy Policy, please contact us at:</p>
          <p>
            Coneshare, Inc.
            <br />
            Email: dev@coneshare.com
          </p>
        </div>
      </div>
    </div>
  );
}
