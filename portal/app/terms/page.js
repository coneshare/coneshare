export default function TermsOfServicePage() {
  const lastUpdatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <div className="prose prose-lg mx-auto text-gray-600">
          <h1 className="text-gray-900">Terms of Service</h1>
          <p>
            <strong>Last Updated: {lastUpdatedDate}</strong>
          </p>

          <h2 className="text-gray-900">1. Agreement to Terms</h2>
          <p>
            By using our website located at coneshare.com (the "Site"), you agree to be bound by these
            Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the
            Site. These Terms apply to all visitors, users, and others who access or use the Site.
          </p>
          <p>
            These Terms of Service do not apply to the self-hosted Coneshare software product, which is
            governed by the software license under which it is distributed.
          </p>

          <h2 className="text-gray-900">2. Intellectual Property Rights</h2>
          <p>
            The Site and its original content, features, and functionality are and will remain the
            exclusive property of Coneshare, Inc. and its licensors. The Site is protected by copyright,
            trademark, and other laws of both the United States and foreign countries. Our trademarks and
            trade dress may not be used in connection with any product or service without the prior
            written consent of Coneshare, Inc.
          </p>

          <h2 className="text-gray-900">3. User Representations</h2>
          <p>By using the Site, you represent and warrant that:</p>
          <ul>
            <li>All information you submit is truthful and accurate.</li>
            <li>You will maintain the accuracy of such information.</li>
            <li>
              Your use of the Site does not violate any applicable law or regulation.
            </li>
          </ul>

          <h2 className="text-gray-900">4. Prohibited Activities</h2>
          <p>
            You may not access or use the Site for any purpose other than that for which we make the Site
            available. The Site may not be used in connection with any commercial endeavors except those
            that are specifically endorsed or approved by us.
          </p>

          <h2 className="text-gray-900">5. Disclaimer</h2>
          <p>
            The Site is provided on an "AS IS" and "AS AVAILABLE" basis. You agree that your use of the
            Site and our services will be at your sole risk. To the fullest extent permitted by law, we
            disclaim all warranties, express or implied, in connection with the Site and your use thereof.
          </p>

          <h2 className="text-gray-900">6. Limitation of Liability</h2>
          <p>
            In no event will we or our directors, employees, or agents be liable to you or any third
            party for any direct, indirect, consequential, exemplary, incidental, special, or punitive
            damages arising from your use of the Site.
          </p>

          <h2 className="text-gray-900">7. Governing Law</h2>
          <p>
            These Terms shall be governed and construed in accordance with the laws of the State of
            Delaware, United States, without regard to its conflict of law provisions.
          </p>
          
          <h2 className="text-gray-900">8. Changes to These Terms</h2>
          <p>
            We reserve the right, in our sole discretion, to make changes or modifications to these Terms of
            Service at any time and for any reason. We will alert you about any changes by updating the
            "Last Updated" date of these Terms of Service.
          </p>

          <h2 className="text-gray-900">9. Contact Us</h2>
          <p>
            To resolve a complaint regarding the Site or to receive further information regarding use of
            the Site, please contact us at:
          </p>
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
