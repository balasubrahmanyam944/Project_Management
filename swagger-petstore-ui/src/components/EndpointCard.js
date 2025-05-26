//Endpointcard.js
import React, { useState,useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { openApiSpec } from '../openapispecs';
import PropTypes from 'prop-types';

const generateExample = (schema, definitions, visited = new Set()) => {
  if (!schema) return {};

  if (schema.$ref) {
    const refName = schema.$ref.replace('#/definitions/', '');
    if (visited.has(refName)) {
      // avoid infinite recursion if there's a circular reference
      return {};
    }
    visited.add(refName);
    const defSchema = definitions[refName];
    if (!defSchema) return {};
    return generateExample(defSchema, definitions, visited);
  }

  switch (schema.type) {
    case 'object': {
      const result = {};
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          result[propName] = generateExample(propSchema, definitions, visited);
        }
      }
      return result;
    }
    case 'array': {
      if (!schema.items) return [];
      const item = generateExample(schema.items, definitions, visited);
      return [item];
    }
    case 'string': {
      if (schema.enum && schema.enum.length > 0) {
        return schema.enum[0];
      }
      if (schema.default !== undefined) {
        return schema.default;
      }
      return "string";
    }
    case 'integer':
    case 'number': {
      if (schema.enum && schema.enum.length > 0) {
        return schema.enum[0];
      }
      if (schema.default !== undefined) {
        return schema.default;
      }
      return 0;
    }
    case 'boolean': {
      if (schema.default !== undefined) {
        return schema.default;
      }
      return false;
    }
    default:
      return {};
  }
};

const EndpointCard = ({ path, method, operation,sprintId,testCase,onStatusChange }, ref) => {
  const storageKey = `testCases-${method}-${path}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [requestData, setRequestData] = useState('');
  const [responseData, setResponseData] = useState('');
  const [formValues, setFormValues] = useState({});
  const [testCases, setTestCases] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : [];
  });
  const [expandedTestCase, setExpandedTestCase] = useState(null);
  const [testCaseCount, setTestCaseCount] = useState(1);
  const [statuses, setStatuses] = useState({});
  const markAsBug = (testCaseId) => {
    setTestCases(tests => {
      const updatedTests = tests.map(tc => 
        tc.id === testCaseId ? { ...tc, isBug: true, isSentToJira: false } : tc
      );
      
      // Calculate new bug statuses after update
      const totalBugs = updatedTests.filter(tc => tc.isBug).length;
      const allStatuses = Object.keys(statuses).flatMap(s => statuses[s]?.transitions?.map(t => t.name) || []);
      const bugsByStatus = allStatuses.reduce((acc, status) => {
        acc[status] = updatedTests.filter(tc => tc.isBug && tc.currentStatus === status).length;
        return acc;
      }, {});
  
      // Update parent component with new bug data
      onStatusChange(totalBugs, bugsByStatus);
      
      return updatedTests;
    });
  };
  const fetchStatuses = async (jiraIssueId, testCaseId) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/jira/statuses/${jiraIssueId}`);
      const data = await response.json();
      setStatuses(prev => ({
        ...prev,
        [testCaseId]: { ...prev[testCaseId], transitions: data }
      }));
    } catch (error) {
      console.error('Error fetching statuses:', error);
    }
  };
  const fetchIssueStatus = async (jiraIssueId, testCaseId) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/jira/issue/${jiraIssueId}`);
      const data = await response.json();
      
      setTestCases(prevTestCases => 
        prevTestCases.map(tc => 
          tc.id === testCaseId 
            ? { ...tc, currentStatus: data.status }
            : tc
        )
      );
      
      setStatuses(prev => ({
        ...prev,
        [testCaseId]: { ...prev[testCaseId], currentStatus: data.status }
      }));
    } catch (error) {
      console.error('Error fetching issue status:', error);
    }
  };
  const updateStatus = async (testCaseId, transitionId, statusName) => {
    const testCase = testCases.find(tc => tc.id === testCaseId);
    if (!testCase?.jiraIssueId) return;
  
    try {
      // Update status in JIRA
      await fetch(`${process.env.REACT_APP_API_URL}/api/jira/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          issueId: testCase.jiraIssueId, 
          transitionId 
        }),
      });
  
      // Update local state
      const updatedTestCases = testCases.map(tc =>
        tc.id === testCaseId
          ? { ...tc, currentStatus: statusName }
          : tc
      );
      
      setTestCases(updatedTestCases);
  
      // Get all possible statuses from UI buttons
      const allStatuses = [
        ...new Set(
          Object.values(statuses)
            .flatMap(s => s.transitions?.map(t => t.name) || [])
        )
      ];
  
      // Calculate totals
      const totalBugs = updatedTestCases.filter(tc => tc.isBug).length;
      const bugsByStatus = allStatuses.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
      }, {});
      
      // Count actual bugs per status
      updatedTestCases
        .filter(tc => tc.isBug)
        .forEach(tc => {
          if (tc.currentStatus && bugsByStatus.hasOwnProperty(tc.currentStatus)) {
            bugsByStatus[tc.currentStatus]++;
          }
        });
        onStatusChange(totalBugs, bugsByStatus);
      // Logging implementation
      const timestamp = new Date().toISOString();
      console.log(`🔄 Status Update Log:
      📅 Time: ${timestamp}
      🐞 Test Case ID: ${testCaseId}
      📌 JIRA Issue: ${testCase.jiraIssueId}
      🏷️ New Status: ${statusName}
      🐛 Total Bugs: ${totalBugs}
      📊 Bugs by Status:`, bugsByStatus);
  
      // Detailed debug log
      console.debug('Full status breakdown:', {
        timestamp,
        allPossibleStatuses: allStatuses,
        bugsByStatus,
        totalBugs
      });
  
    } catch (error) {
      console.error('🚨 Status Update Error:', error);
      console.error('Error context:', {
        totalBugs: testCases.filter(tc => tc.isBug).length,
        affectedBug: testCaseId,
        currentStatus: testCase.currentStatus,
        attemptedStatus: statusName
      });
      alert('Failed to update status');
    }
  };

  const refreshStatus = async (testCaseId) => {
    const testCase = testCases.find(tc => tc.id === testCaseId);
    if (testCase?.jiraIssueId) {
      try {
        await fetchStatuses(testCase.jiraIssueId, testCaseId);
        await fetchIssueStatus(testCase.jiraIssueId, testCaseId);
        
        // Calculate new status counts after refresh
        const totalBugs = testCases.filter(tc => tc.isBug).length;
        const allStatuses = Object.keys(statuses).flatMap(s => 
          statuses[s]?.transitions?.map(t => t.name) || []
        );
        
        const bugsByStatus = allStatuses.reduce((acc, status) => {
          acc[status] = testCases.filter(tc => 
            tc.isBug && tc.currentStatus === status
          ).length;
          return acc;
        }, {});

        // Update parent component with new status data
        onStatusChange(totalBugs, bugsByStatus);
      } catch (error) {
        console.error('Error refreshing status:', error);
      }
    }
  };

  // Add bulk refresh method
  const refreshAllTestCases = async () => {
    for (const tc of testCases) {
      if (tc.isBug && tc.jiraIssueId) {
        await refreshStatus(tc.id);
      }
    }
  };

  const sendToJira = async (testCaseId) => {
    const apiUrl = process.env.REACT_APP_API_URL;
    if (!apiUrl) {
      alert("JIRA API endpoint is missing. Check environment variables.");
      return;
    }
  
    const testCase = testCases.find(tc => tc.id === testCaseId);
    if (!testCase) {
      alert("Test case not found.");
      return;
    }
  
    if (!sprintId) {
      alert("Please enter a Sprint ID before sending to JIRA.");
      return;
    }
  
    try {
      // Optimistically update UI first
      setTestCases(tests => {
        const updatedTests = tests.map(tc => 
          tc.id === testCaseId ? { 
            ...tc, 
            isBug: true,
            isSentToJira: true,
            currentStatus: 'To Do' // Immediate status update
          } : tc
        );
  
        // Calculate new bug counts including the new "To Do" status
        const totalBugs = updatedTests.filter(tc => tc.isBug).length;
        const bugsByStatus = {
          'To Do': updatedTests.filter(tc => tc.isBug && tc.currentStatus === 'To Do').length,
          ...Object.keys(statuses).reduce((acc, statusKey) => {
            const statusName = statuses[statusKey]?.name;
            if (statusName && statusName !== 'To Do') {
              acc[statusName] = updatedTests.filter(tc => 
                tc.isBug && tc.currentStatus === statusName
              ).length;
            }
            return acc;
          }, {})
        };
  
        // Update parent component with new status data
        onStatusChange(totalBugs, bugsByStatus);
  
        return updatedTests;
      });
  
      // Format the description in Atlassian Document Format (ADF)
      // ... existing code ...
      // Format the description in Atlassian Document Format (ADF)
      const description = {
        version: 1,
        type: "doc",
        content: [
          {
            type: "panel",
            attrs: {
              panelType: "info"
            },
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Test Case Details"
                  }
                ]
              }
            ]
          },
          {
            type: "heading",
            attrs: {
              level: 3
            },
            content: [
              {
                type: "text",
                text: "Request"
              }
            ]
          },
          {
            type: "codeBlock",
            attrs: {
              language: "json"
            },
            content: [
              {
                type: "text",
                text: testCase.request
              }
            ]
          },
          {
            type: "heading",
            attrs: {
              level: 3
            },
            content: [
              {
                type: "text",
                text: "Response"
              }
            ]
          },
          {
            type: "codeBlock",
            attrs: {
              language: "json"
            },
            content: [
              {
                type: "text",
                text: testCase.response
              }
            ]
          },
          {
            type: "heading",
            attrs: {
              level: 3
            },
            content: [
              {
                type: "text",
                text: "Bug Description"
              }
            ]
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: testCase.message
              }
            ]
          }
        ]
      };
 
      // Parse the request data to get the body
      let requestBody = '';
      try {
        const requestData = JSON.parse(testCase.request);
        requestBody = requestData.body ? JSON.stringify(requestData.body) : '';
      } catch (error) {
        console.error('Error parsing request data:', error);
        requestBody = testCase.request;
      }
 
      // Truncate request body to 100 characters for the summary
      const truncatedBody = requestBody.length > 100 
        ? requestBody.substring(0, 100) + '...' 
        : requestBody;
 
      // Send request to backend
      const response = await fetch(`${apiUrl}/send-to-jira`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testCase: {
            title: `${operation.summary} - ${truncatedBody}`,
            description: description,
            request: testCase.request,
            response: testCase.response
          },
          sprintId,
        })
      });
// ... existing code ...
  
      // Handle non-JSON responses
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Invalid response: ${text.substring(0, 100)}`);
      }
  
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'JIRA integration failed');
      }
  
      // Final update with JIRA data
      setTestCases(tests => tests.map(tc => 
        tc.id === testCaseId ? { 
          ...tc, 
          jiraIssueId: data.key,
          isSentToJira: true,
          currentStatus: 'To Do' 
        } : tc
      ));
  
      // Calculate updated status counts
      const updatedTests = testCases.map(tc => 
        tc.id === testCaseId ? { ...tc, currentStatus: 'To Do' } : tc
      );
      
      const totalBugs = updatedTests.filter(tc => tc.isBug).length;
      const bugsByStatus = Object.keys(statuses).reduce((acc, statusKey) => {
        const statusName = statuses[statusKey]?.name || statusKey;
        acc[statusName] = updatedTests.filter(tc => 
          tc.isBug && tc.currentStatus === statusName
        ).length;
        return acc;
      }, {});
  
      // Update parent component with new status data
      onStatusChange(totalBugs, bugsByStatus);
  
      // Fetch fresh status data from JIRA
      await fetchStatuses(data.key, testCaseId);
      await fetchIssueStatus(data.key, testCaseId);
  
      alert("JIRA issue created successfully and added to sprint!");
  
    } catch (error) {
      // Rollback on error
      setTestCases(tests => tests.map(tc => 
        tc.id === testCaseId ? { 
          ...tc, 
          isSentToJira: false,
          currentStatus: undefined 
        } : tc
      ));
  
      // Update pie chart to remove the failed status
      const updatedTests = testCases.filter(tc => tc.id !== testCaseId);
      const totalBugs = updatedTests.filter(tc => tc.isBug).length;
      const bugsByStatus = Object.keys(statuses).reduce((acc, statusKey) => {
        const statusName = statuses[statusKey]?.name;
        if (statusName) {
          acc[statusName] = updatedTests.filter(tc => 
            tc.isBug && tc.currentStatus === statusName
          ).length;
        }
        return acc;
      }, {});
      onStatusChange(totalBugs, bugsByStatus);
  
      console.error('Full client-side error:', error);
      alert(`Error: ${error.message}`);
    }
  };
  useEffect(() => {
    if (testCase) {
      fetchStatuses(testCase.jiraIssueId, testCase.id);
      fetchIssueStatus(testCase.jiraIssueId, testCase.id);
    }
  }, [testCase]);
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(testCases));
  }, [testCases, storageKey]);
  const generateRequest = () => {
    const requestObj = {
      method: method.toUpperCase(),
      url: `https://${openApiSpec.host}${openApiSpec.basePath}${path}`,
      pathParams: {},
      queryParams: {},
      headers: {},
      body: null,
      formData: {},
      consumes: operation.consumes || []
    };

    operation.parameters?.forEach(param => {
      const value = formValues[param.name] || '';
      
      if (param.in === 'body') {
        try {
          requestObj.body = JSON.parse(value);
        } catch {
          requestObj.body = value;
        }
      } else if (param.in === 'formData') {
        requestObj.formData[param.name] = value;
      } else {
        switch (param.in) {
          case 'path':
            requestObj.pathParams[param.name] = value;
            break;
          case 'query':
            requestObj.queryParams[param.name] = value;
            break;
          case 'header':
            requestObj.headers[param.name] = value;
            break;
        }
      }
    });

    // Replace path parameters
    let finalUrl = requestObj.url;
    Object.entries(requestObj.pathParams).forEach(([key, value]) => {
      finalUrl = finalUrl.replace(`{${key}}`, value);
    });

    // Add query parameters
    const queryString = new URLSearchParams(requestObj.queryParams).toString();
    if (queryString) finalUrl += `?${queryString}`;

    setRequestData(JSON.stringify({ ...requestObj, url: finalUrl }, null, 2));
  };

  const sendRequest = async () => {
    try {
      const request = JSON.parse(requestData);
      const options = {
        method: request.method,
        headers: { ...request.headers },
        body: request.body ? JSON.stringify(request.body) : undefined
      };

      const response = await fetch(request.url, options);
      const text = await response.text();
      try {
        setResponseData(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponseData(text);
      }
    } catch (error) {
      setResponseData(`Error: ${error.message}`);
    }
  };
  const generateTestCases = () => {
    if (!requestData || !responseData) return;
    
    const newTestCase = {
      id: Date.now(),
      title: `Test Case `,
      message: extractResponseMessage(responseData),
      request: requestData,
      response: responseData,
    };
    
    setTestCases([...testCases, newTestCase]);
    
  };

  const extractResponseMessage = (response) => {
    try {
      // Handle both raw JSON responses and formatted responses with status line
      const responseBody = response.includes('\n\n') 
        ? response.split('\n\n')[1] 
        : response;
      
      const res = JSON.parse(responseBody);
      
      // Handle different error formats
      if (res.message) {
        return res.message;
      }
      if (res.error && res.error.message) {
        return res.error.message;
      }
      return JSON.stringify(res, null, 2);
    } catch {
      // Fallback for non-JSON responses
      const match = response.match(/message":\s*"([^"]+)/);
      return match ? match[1] : 'Unknown error format';
    }
  };

  // Add method to get test cases
  const getTestCases = () => {
    return testCases;
  };

  // Add method to get transitions for a test case
  const getTransitions = (testCaseId) => {
    return statuses[testCaseId]?.transitions || [];
  };

  // Update useImperativeHandle
  useImperativeHandle(ref, () => ({
    getTestCases,
    getOperation: () => operation,
    addTestCase: (newCase) => {
      setTestCases(prev => [...prev, newCase]);
    },
    updateStatus,
    refreshStatus,
    getTransitions,
    setTestCases: (newTestCases) => {
      setTestCases(newTestCases);
    }
  }));

  return (
    <div className="endpoint-card">
      <div className="header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className={`method ${method}`}>{method.toUpperCase()}</span>
        <span className="path">{path}</span>
        <span className="summary">{operation.summary}</span>
        <span className="toggle">{isExpanded ? '▼' : '▶'}</span>
      </div>
      
      {isExpanded && (
        <div className="content">
          {operation.parameters?.map(param => (
            <div key={param.name} className="param-row">
              <label>
                [{param.in}] {param.name}
                {param.required && <span className="required">*</span>}
              </label>
              {param.in === 'body' ? (
                <textarea
                  value={formValues[param.name] || ''}
                  onChange={e => setFormValues({ ...formValues, [param.name]: e.target.value })}
                  placeholder={JSON.stringify(generateExample(param.schema, openApiSpec.definitions), null, 2)}
                />
              ) : param.type === 'file' ? (
                <input
                  type="file"
                  onChange={e => setFormValues({ ...formValues, [param.name]: e.target.files[0] })}
                />
              ) : (
                <input
                  type="text"
                  value={formValues[param.name] || ''}
                  onChange={e => setFormValues({ ...formValues, [param.name]: e.target.value })}
                  placeholder={param.description}
                />
              )}
            </div>
          ))}
          
          <div className="actions">
          <div className="left-actions">
            <button onClick={generateRequest}>Generate Request</button>
            <button onClick={sendRequest}>Send Request</button>
            </div>
            <button 
              className="generate-testcases" 
              onClick={generateTestCases}
              disabled={!requestData || !responseData}
            >
              Generate Testcases
            </button>
          </div>
          
          {requestData && (
            <div className="request">
              <h4>Generated Request:</h4>
              <pre>{requestData}</pre>
            </div>
          )}
          
          {responseData && (
            <div className="response">
              <h4>Response:</h4>
              <pre>{responseData}</pre>
            </div>
          )}
          {testCases.map((tc) => (
         <div key={tc.id} className={`test-case ${tc.isBug ? 'bug-case' : ''}`}>
          <div 
            className="test-case-header"
            onClick={() => setExpandedTestCase(tc.id === expandedTestCase ? null : tc.id)}
          >
            <div className="test-case-header-left">
              <span className="test-case-title">{tc.title}</span>
              {/* <span className="test-case-message">{tc.message}</span> */}
            </div>
            <span className="toggle">
              {expandedTestCase === tc.id ? '▼' : '▶'}
            </span>
            {tc.isBug && <span className="bug-tag">BUG</span>}
          </div>
          
          {expandedTestCase === tc.id && (
            <div className="test-case-content">
              <div className="test-case-section">
                <h4>Request:</h4>
                <pre className="request-pre">{tc.request}</pre>
              </div>
              <div className="test-case-section">
                <h4>Response:</h4>
                <pre className="response-pre">{tc.response}</pre>
              </div>
              <div className="test-case-actions">
              <button 
                  className={`mark-as-bug ${tc.isBug ? 'marked' : ''}`}
                  onClick={() => !tc.isBug && markAsBug(tc.id)}
                  disabled={tc.isBug}
                >
                  {tc.isBug ? 'Marked as Bug ✅' : 'Mark as Bug'}
                </button>

                {tc.isBug && (
                  <button 
                    className={`send-to-jira ${tc.isSentToJira ? 'sent' : ''}`}
                    onClick={() => !tc.isSentToJira && sendToJira(tc.id)}
                    disabled={tc.isSentToJira}
                  >
                    {tc.isSentToJira ? 'Sent to JIRA ✅' : 'Send to JIRA'}
                  </button>
                )}
              </div>
              {statuses[tc.id]?.transitions?.length > 0 && (
                <div className="status-section">
                  {/* <div className="status-header">
                    
                    <h4>Update Status:</h4>
                    <button 
                      className="refresh-button modal-refresh"
                      onClick={() => refreshStatus(tc.id)}
                      title="Refresh Status"
                    >
                      🔄
                    </button>
                  </div> */}
                  <div className="status-buttons">
                    {statuses[tc.id].transitions.map(status => (
                      <button 
                        key={status.id} 
                        onClick={() => updateStatus(tc.id, status.id, status.name)}
                        className={`status-btn ${tc.currentStatus === status.name ? 'active' : ''}`}
                      >
                        {status.name} {tc.currentStatus === status.name ? '✅' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
        </div>
      )}
    </div>
  );
};
EndpointCard.propTypes = {
  path: PropTypes.string.isRequired,
  method: PropTypes.string.isRequired,
  operation: PropTypes.object.isRequired,
  sprintId: PropTypes.string,
  testCase: PropTypes.object,
  onStatusChange: PropTypes.func.isRequired // This is the new line
};
export default forwardRef(EndpointCard);
