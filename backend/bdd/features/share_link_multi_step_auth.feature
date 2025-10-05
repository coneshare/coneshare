Feature: Share Link Multi-Step Authentication
  As a document owner
  I want to protect a share link with both a password and an email requirement
  So that I can enforce two-factor viewer verification

  Scenario: A viewer successfully navigates a password and email flow
    Given I am an authenticated user
    And I have a document with a share link that requires a password and email
    When a viewer first accesses the link
    Then they should be prompted for a password
    When they submit the correct password "password123"
    Then they should be prompted for an email
    When they submit the email "viewer@example.com"
    Then they should be granted access to the document
