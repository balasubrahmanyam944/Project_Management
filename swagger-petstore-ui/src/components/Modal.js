import React from 'react';

const Modal = ({ isOpen, onClose, onRefresh, children, onStatusUpdate }) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target.className === 'modal-overlay') {
      onClose();
    }
  };

  // Separate JIRA-only and UI-generated test cases
  const testCases = React.Children.toArray(children);
  const jiraOnlyCases = testCases.filter(tc => tc.props.testCase?.isJiraOnly);
  const uiGeneratedCases = testCases.filter(tc => !tc.props.testCase?.isJiraOnly);

  // Pass down onStatusUpdate to each TestCaseCard
  const enhancedChildren = testCases.map(child => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        onStatusUpdate
      });
    }
    return child;
  });

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title-group">
            <h2>All Test Cases</h2>
            <button
              className="refresh-button modal-refresh"
              onClick={onRefresh}
              title="Refresh All Statuses"
            >
              🔄
            </button>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {uiGeneratedCases.length > 0 && (
            <div className="test-cases-section">
              <h3>UI Generated Test Cases</h3>
              {uiGeneratedCases}
            </div>
          )}

          {jiraOnlyCases.length > 0 && (
            <div className="test-cases-section jira-only">
              <h3>JIRA Issues</h3>
              {jiraOnlyCases}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
