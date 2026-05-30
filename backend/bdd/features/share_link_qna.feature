Feature: Share Link Q&A
  As a viewer and document owner
  I want to exchange contextual Q&A on shared content
  So that discussion stays attached to the share link

  Scenario: Viewer asks Q&A on a single-document share link
    Given I am an authenticated user
    And I have a document with a share link for Q&A
    When a viewer creates a view session for the Q&A share link
    And the viewer creates a Q&A thread with subject "Clarification needed" and message "Can you explain this section?"
    Then a Q&A thread should exist for the share link with subject "Clarification needed"
    And the Q&A thread should contain the message "Can you explain this section?"

  Scenario: Owner replies to a viewer's Q&A thread
    Given I am an authenticated user
    And I have a document with a share link for Q&A
    And a viewer has opened a Q&A thread with subject "Follow up"
    When the owner replies to the Q&A thread with message "Here is the answer."
    Then the Q&A thread history should contain messages in order:
      | message                  |
      | Initial viewer question. |
      | Here is the answer.      |

  Scenario: Viewer cannot create Q&A using another link's session
    Given I am an authenticated user
    And I have two document share links for Q&A
    And a viewer session exists for the second Q&A share link
    When the viewer tries to create Q&A on the first share link using the second link session
    Then the Q&A request should fail with bad request
    And no Q&A thread should be created

  Scenario: Viewer cannot ask Q&A on invisible dataroom content
    Given I am an authenticated user
    And I have a dataroom share link with a hidden document for Q&A
    When a viewer tries to create Q&A for the hidden dataroom document
    Then the Q&A request should be forbidden
    And no Q&A thread should be created

  Scenario: Viewer cannot reply to a closed Q&A thread
    Given I am an authenticated user
    And I have a document with a share link for Q&A
    And a viewer has opened a Q&A thread with subject "Resolved question"
    And the owner closes the Q&A thread
    When the viewer tries to reply to the closed Q&A thread
    Then the Q&A request should be forbidden
    And the Q&A thread should contain 1 message

  Scenario: Q&A creation dispatches an automation notification
    Given I am an authenticated user
    And I have a document with a share link for Q&A
    And automation dispatch is monitored
    When a viewer creates a view session for the Q&A share link
    And the viewer creates a Q&A thread with subject "Notify owner" and message "Please review this."
    Then a "qna_thread_created" automation event should be dispatched for the Q&A thread
