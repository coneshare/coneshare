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

  Scenario: Public signup in Chinese language sends Chinese verification email and activates account with Chinese preference
    Given public signup is enabled
    When I request signup in Chinese language with name "张三", email "zhangsan@example.com", and password "StrongPassword123!"
    Then a verification email in Chinese should be sent to "zhangsan@example.com"
    When I activate the account using the verification link from the email
    Then the account should be active with Chinese language preference

