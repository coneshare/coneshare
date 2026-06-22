Feature: Share Link Email Protection
  As a document owner
  I want to protect my share links with email verification
  So that I can control and track who views my documents

  Scenario: A viewer accesses a link that requires email but no verification
    Given I am an authenticated user
    And I have a document with a share link that requires email
    When an anonymous viewer requests access with the email "viewer@example.com"
    Then they should be granted immediate access

  Scenario: A viewer accesses a link that requires email verification
    Given I am an authenticated user
    And I have a document with a share link that requires email verification
    When an anonymous viewer requests access with the email "viewer@example.com"
    Then a verification email should be sent to "viewer@example.com"
    And they should not be granted immediate access

  Scenario: A viewer uses a valid magic link to access a document
    Given I am an authenticated user
    And I have a document with a share link that requires email verification
    And a verification token exists for the email "viewer@example.com"
    When the viewer accesses the link with the valid verification token
    Then they should be granted access to the document
    And the verification token should be consumed

  Scenario: A viewer's email is recorded for a link that requires email
    Given I am an authenticated user
    And I have a document with a share link that requires email
    When an anonymous viewer requests access with the email "viewer@example.com"
    And they create a view session for the share link
    Then the view session should be associated with the email "viewer@example.com"

  Scenario: A viewer verifies their email with a 6-digit code
    Given I am an authenticated user
    And I have a document with a share link that requires email verification
    And a verification token exists for the email "viewer@example.com"
    When the viewer submits the correct verification code for "viewer@example.com"
    Then they should be granted access to the document
    And the verification token should be consumed
