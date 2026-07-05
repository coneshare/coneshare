Feature: Cloud Document Import
  As an authenticated user, I want to import documents from my connected cloud providers,
  upload new versions directly from the cloud, and refresh existing files to sync their latest contents.

  Scenario: User imports a document from cloud storage
    Given I am an authenticated user
    And I have connected a cloud provider "dropbox"
    When I import a cloud file "Report.pdf" of size 2048 bytes
    Then a new document should be created named "Report.pdf"
    And the document's latest version should have cloud import metadata for "dropbox"

  Scenario: User refreshes a document from cloud storage
    Given I am an authenticated user
    And I have a document named "Financials.pdf" imported from cloud provider "dropbox"
    When I trigger a cloud refresh on the document
    Then the document should have 2 versions
    And the document's latest version should be version number 2
    And the document's latest version should have cloud import metadata for "dropbox"

  Scenario: User imports a new version from cloud storage
    Given I am an authenticated user
    And I have a document named "Strategy.pdf" imported from cloud provider "dropbox"
    When I import a new version from cloud provider "dropbox" with file "Strategy_v2.pdf" of size 3072 bytes
    Then the document should have 2 versions
    And the document's latest version should be version number 2
    And the document's latest version should have cloud import metadata for "dropbox"

  Scenario: User uploads a new version of a cloud-imported document from local computer
    Given I am an authenticated user
    And I have a document named "Contract.pdf" imported from cloud provider "dropbox"
    When I upload a new version of the document named "Contract_local.pdf" from local computer
    Then the document should have 2 versions
    And the document's latest version should be version number 2
    And the document's latest version should not have cloud import metadata
    And version 1 should still have cloud import metadata for "dropbox"
