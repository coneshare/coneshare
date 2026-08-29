Feature: Dataroom Internal Collaboration
  As a team member
  I want to collaborate on and co-manage datarooms with my colleagues
  So that our team can organize documents and distribute share links collectively

  Scenario: Dataroom owner invites an internal collaborator
    Given I am an authenticated user
    And a team member "collab@example.com" exists in my organization
    And I have a dataroom named "Project Titan"
    When I invite "collab@example.com" as a collaborator to "Project Titan"
    Then "collab@example.com" should be in the collaborators list for "Project Titan"
    And "Project Titan" should appear in "collab@example.com"'s accessible datarooms

  Scenario: Collaborator creates a folder and views dataroom content
    Given I am an authenticated user
    And a team member "collab@example.com" exists in my organization
    And I have a dataroom named "Project Titan"
    And "collab@example.com" is a collaborator in "Project Titan"
    When "collab@example.com" creates a folder named "Due Diligence" in "Project Titan"
    Then the folder "Due Diligence" should exist inside "Project Titan"
    And the folder "Due Diligence" should be visible to both the owner and "collab@example.com"

  Scenario: Collaborator creates a share link for the co-managed dataroom
    Given I am an authenticated user
    And a team member "collab@example.com" exists in my organization
    And I have a dataroom named "Project Titan"
    And "collab@example.com" is a collaborator in "Project Titan"
    When "collab@example.com" creates a share link named "Investor Pitch Link" for "Project Titan"
    Then the share link "Investor Pitch Link" should exist
    And both the owner and "collab@example.com" should see "Investor Pitch Link" in the dataroom share links

  Scenario: Collaborator cannot edit or delete another member's share link
    Given I am an authenticated user
    And a team member "collab@example.com" exists in my organization
    And I have a dataroom named "Project Titan"
    And "collab@example.com" is a collaborator in "Project Titan"
    And I have created a share link named "Owner Private Link" for "Project Titan"
    When "collab@example.com" attempts to rename share link "Owner Private Link"
    Then the rename request should be forbidden
    When "collab@example.com" attempts to delete share link "Owner Private Link"
    Then the delete request should be forbidden

  Scenario: Dataroom owner transfers ownership to a collaborator
    Given I am an authenticated user
    And a team member "collab@example.com" exists in my organization
    And I have a dataroom named "Project Titan"
    And "collab@example.com" is a collaborator in "Project Titan"
    When I transfer ownership of "Project Titan" to "collab@example.com"
    Then "collab@example.com" should be the owner of "Project Titan"
    And I should be listed as a collaborator in "Project Titan"

  Scenario: Collaborator leaves a co-managed dataroom
    Given I am an authenticated user
    And a team member "collab@example.com" exists in my organization
    And I have a dataroom named "Project Titan"
    And "collab@example.com" is a collaborator in "Project Titan"
    When "collab@example.com" removes themselves from "Project Titan"
    Then "collab@example.com" should no longer be a collaborator in "Project Titan"
    And "Project Titan" should not appear in "collab@example.com"'s accessible datarooms

  Scenario: Collaborator cannot delete the co-managed dataroom
    Given I am an authenticated user
    And a team member "collab@example.com" exists in my organization
    And I have a dataroom named "Project Titan"
    And "collab@example.com" is a collaborator in "Project Titan"
    When "collab@example.com" attempts to delete dataroom "Project Titan"
    Then the dataroom delete request should be forbidden
    And the dataroom "Project Titan" should still exist
