Feature: User Authentication
  As a user of Coneshare
  I want to be able to log in and log out securely
  So that I can access my documents and protect my account.

  Scenario: Successful Login
    Given a registered user exists
    When I log in with the correct credentials
    Then I should receive an access and refresh token

  Scenario: Failed Login with incorrect password
    Given a registered user exists
    When I log in with an incorrect password
    Then the login attempt should fail with an unauthorized error

  Scenario: Successful Logout
    Given a registered user exists
    And I am logged in
    When I log out
    Then my refresh token should be invalidated
