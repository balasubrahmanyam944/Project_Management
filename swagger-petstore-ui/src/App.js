// App.js
import React, { useState, useRef, useEffect } from 'react';
import { openApiSpec } from './openapispecs';
import EndpointCard from './components/EndpointCard';
import PieCharts from './PieCharts';
import Modal from './components/Modal';
import './App.css';

const App = () => {
  
  // Use localStorage to persist sprintId
  const [sprintId, setSprintId] = useState(() => 
    localStorage.getItem('currentSprintId') || '34'
  );
  const [inputSprintId, setInputSprintId] = useState('');
  const [bugsData, setBugsData] = useState({
    totalBugs: 0,
    bugsByStatus: {}
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [allTestCases, setAllTestCases] = useState([]);
  const endpointRefs = useRef({});
  const [expandedModalTestCase, setExpandedModalTestCase] = useState(null);

  // Add theme state
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'light';
  });
useEffect(() => {
  handleBulkRefresh();
}, []);

useEffect(() => {
  handleModalRefresh();
}, [handleModalRefresh]);

  // Initialize refs for each endpoint
  useEffect(() => {
    const refs = {};
    Object.entries(openApiSpec.paths).forEach(([path, methods]) => {
      Object.keys(methods).forEach((method) => {
        refs[`${method}-${path}`] = React.createRef();
      });
    });
    endpointRefs.current = refs;
  }, []);

  useEffect(() => {
    const syncInterval = setInterval(() => {
      handleBulkRefresh();
      handleModalRefresh();
    }, 300000); // 5 minutes

    return () => clearInterval(syncInterval);
  }, []);
  useEffect(() => {
    const syncInterval = setInterval(() => {
      handleBulkRefresh();
      handleModalRefresh();
    }, 1000); // Changed from 300000 (5 minutes) to 1000 (1 second)
  
    return () => clearInterval(syncInterval);
  }, []);
  
  // Add theme toggle handler
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Set initial theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // const mergeStatuses = (oldStatuses, newStatuses) => {
  //   return {
  //     ...oldStatuses,
  //     ...newStatuses
  //   };
  // };
  const handleStatusChange = (totalBugs, bugsByStatus) => {
    setBugsData(prev => ({
      totalBugs: totalBugs || prev.totalBugs,
      bugsByStatus: {
        ...prev.bugsByStatus,
        ...bugsByStatus
      }
    }));
  };
  // Update localStorage when sprintId changes
  const handleSprintIdUpdate = () => {
    if (inputSprintId) {
      localStorage.setItem('currentSprintId', inputSprintId);
      setSprintId(inputSprintId);
    }
  };

  const handleBulkRefresh = useCallback(async () => {
    const refreshPromises = [];
    let totalBugs = 0;
    const bugsByStatus = {};
    
    // First, collect all refresh promises and update statuses
    for (const ref of Object.values(endpointRefs.current)) {
      if (ref.current) {
        const testCases = ref.current.getTestCases();
        if (testCases) {
          for (const tc of testCases) {
            if (tc.isBug && tc.jiraIssueId) {
              refreshPromises.push(
                ref.current.refreshStatus(tc.id).then(() => {
                  // Get updated test case after refresh
                  const updatedTestCase = ref.current.getTestCases().find(t => t.id === tc.id);
                  if (updatedTestCase) {
                    totalBugs++;
                    // Update bug count for this status
                    bugsByStatus[updatedTestCase.currentStatus] = 
                      (bugsByStatus[updatedTestCase.currentStatus] || 0) + 1;
                  }
                })
              );
            }
          }
        }
      }
    }

    // Wait for all refreshes to complete
    await Promise.all(refreshPromises);
    // Update bugs data with collected totals
    handleStatusChange(totalBugs, bugsByStatus);
    return true;
  };

  const handleShowAllTestCases = async () => {
    try {
      // Check if API URL is configured
      const apiUrl = process.env.REACT_APP_API_URL;
      if (!apiUrl) {
        console.error('API URL is not configured. Please check your environment variables.');
        alert('API URL is not configured. Please check your environment variables.');
        return;
      }

      // Check if sprint ID is set
      if (!sprintId) {
        alert('Please enter a Sprint ID before viewing test cases.');
        return;
      }

      // Get all existing test cases from endpoint refs
      const existingTestCases = [];
      Object.values(endpointRefs.current).forEach(ref => {
        if (ref.current) {
          const testCases = ref.current.getTestCases();
          if (testCases) {
            existingTestCases.push(...testCases.map(tc => ({
              ...tc,
              transitions: ref.current.getTransitions?.(tc.id)
            })));
          }
        }
      });

      // Create a map of existing test cases by JIRA issue ID
      const existingJiraMap = new Map(
        existingTestCases
          .filter(tc => tc.jiraIssueId)
          .map(tc => [tc.jiraIssueId, tc])
      );

      // Fetch JIRA issues
      const response = await fetch(`${apiUrl}/api/jira/sprint/${sprintId}/issues`);
      if (!response.ok) {
        throw new Error('Failed to fetch JIRA issues');
      }

      const jiraData = await response.json();

      // Create a set of current JIRA issue IDs
      const currentJiraIds = new Set(jiraData.map(issue => issue.key));

      // Remove test cases that no longer exist in JIRA
      const updatedExistingTestCases = existingTestCases.filter(tc => {
        if (!tc.jiraIssueId) return true; // Keep UI-generated test cases
        return currentJiraIds.has(tc.jiraIssueId); // Keep only if JIRA issue still exists
      });

      // Create new test cases for JIRA issues that don't exist in our UI
      const newTestCases = jiraData
        .filter(jiraIssue => !existingJiraMap.has(jiraIssue.key))
        .map(jiraIssue => {
          let requestData = 'No request data available';
          let responseData = 'No response data available';
          let bugDescription = 'No description available';

          if (jiraIssue.description) {
            let descriptionText = '';
            
            if (typeof jiraIssue.description === 'object') {
              if (jiraIssue.description.content) {
                descriptionText = jiraIssue.description.content
                  .map(content => {
                    if (content.content) {
                      return content.content
                        .map(c => c.text || '')
                        .join(' ');
                    }
                    return content.text || '';
                  })
                  .join('\n');
              } else if (jiraIssue.description.text) {
                descriptionText = jiraIssue.description.text;
              }
            } else {
              descriptionText = jiraIssue.description;
            }

            const requestMatch = descriptionText.match(/\{code:title=Request Data\}([\s\S]*?)\{code\}/);
            const responseMatch = descriptionText.match(/\{code:title=Response Data\}([\s\S]*?)\{code\}/);
            const descriptionMatch = descriptionText.match(/h3\. Bug Description:\s*([\s\S]*?)(?=\n\n|$)/);

            requestData = requestMatch ? requestMatch[1].trim() : 'No request data available';
            responseData = responseMatch ? responseMatch[1].trim() : 'No response data available';
            bugDescription = descriptionMatch ? descriptionMatch[1].trim() : descriptionText.trim();
          }

          return {
            id: `jira-${jiraIssue.key}`,
            title: jiraIssue.summary,
            message: bugDescription,
            request: requestData,
            response: responseData,
            isBug: true,
            jiraIssueId: jiraIssue.key,
            currentStatus: jiraIssue.status,
            transitions: jiraIssue.transitions,
            isJiraOnly: true
          };
        });

      // Merge existing test cases with new JIRA-only test cases
      const allCases = [...updatedExistingTestCases, ...newTestCases];

      // Update the modal's test cases with fresh data
      setAllTestCases(allCases);

      // Update bugs data for pie chart
      const totalBugs = allCases.filter(tc => tc.isBug).length;
      const bugsByStatus = {};
      allCases.forEach(tc => {
        if (tc.isBug && tc.currentStatus) {
          bugsByStatus[tc.currentStatus] = (bugsByStatus[tc.currentStatus] || 0) + 1;
        }
      });
      handleStatusChange(totalBugs, bugsByStatus);

      // Open the modal
      setIsModalOpen(true);

    } catch (error) {
      console.error('Error fetching test cases:', error);
      alert(`Error fetching test cases: ${error.message}`);
    }
  };

  const handleModalRefresh = async () => {
    try {
      // Wait for bulk refresh to complete
      await handleBulkRefresh();

      // Check if API URL is configured
      const apiUrl = process.env.REACT_APP_API_URL;
      if (!apiUrl) {
        console.error('API URL is not configured. Please check your environment variables.');
        alert('API URL is not configured. Please check your environment variables.');
        return;
      }

      // Check if sprint ID is set
      if (!sprintId) {
        alert('Please enter a Sprint ID before refreshing.');
        return;
      }

      // Fetch all JIRA issues from the sprint
      const response = await fetch(`${apiUrl}/api/jira/sprint/${sprintId}/issues`);
      
      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Invalid response type:', {
          contentType,
          response: text.substring(0, 200) // Log first 200 chars
        });
        throw new Error('Invalid response type from API');
      }

      const jiraData = await response.json();

      // Create a set of current JIRA issue IDs
      const currentJiraIds = new Set(jiraData.map(issue => issue.key));

      // Get all existing test cases from endpoint refs and update them
      const existingTestCases = [];
      Object.values(endpointRefs.current).forEach(ref => {
        if (ref.current) {
          const testCases = ref.current.getTestCases();
          if (testCases) {
            // Filter out test cases for deleted JIRA issues
            const updatedTestCases = testCases.filter(tc => {
              if (!tc.jiraIssueId) return true; // Keep UI-generated test cases
              return currentJiraIds.has(tc.jiraIssueId); // Keep only if JIRA issue still exists
            });

            // Update the test cases in the EndpointCard
            ref.current.setTestCases(updatedTestCases);

            // Add to our list for the modal
            existingTestCases.push(...updatedTestCases.map(tc => ({
              ...tc,
              transitions: ref.current.getTransitions?.(tc.id)
            })));
          }
        }
      });

      // Create new test cases for JIRA issues that don't exist in our UI
      const newTestCases = jiraData
        .filter(jiraIssue => !existingTestCases.some(tc => tc.jiraIssueId === jiraIssue.key))
        .map(jiraIssue => {
          let requestData = 'No request data available';
          let responseData = 'No response data available';
          let bugDescription = 'No description available';

          if (jiraIssue.description) {
            let descriptionText = '';
            
            if (typeof jiraIssue.description === 'object') {
              if (jiraIssue.description.content) {
                descriptionText = jiraIssue.description.content
                  .map(content => {
                    if (content.content) {
                      return content.content
                        .map(c => c.text || '')
                        .join(' ');
                    }
                    return content.text || '';
                  })
                  .join('\n');
              } else if (jiraIssue.description.text) {
                descriptionText = jiraIssue.description.text;
              }
            } else {
              descriptionText = jiraIssue.description;
            }

            const requestMatch = descriptionText.match(/\{code:title=Request Data\}([\s\S]*?)\{code\}/);
            const responseMatch = descriptionText.match(/\{code:title=Response Data\}([\s\S]*?)\{code\}/);
            const descriptionMatch = descriptionText.match(/h3\. Bug Description:\s*([\s\S]*?)(?=\n\n|$)/);

            requestData = requestMatch ? requestMatch[1].trim() : 'No request data available';
            responseData = responseMatch ? responseMatch[1].trim() : 'No response data available';
            bugDescription = descriptionMatch ? descriptionMatch[1].trim() : descriptionText.trim();
          }

          return {
            id: `jira-${jiraIssue.key}`,
            title: jiraIssue.summary,
            message: bugDescription,
            request: requestData,
            response: responseData,
            isBug: true,
            jiraIssueId: jiraIssue.key,
            currentStatus: jiraIssue.status,
            transitions: jiraIssue.transitions,
            isJiraOnly: true
          };
        });

      // Merge existing test cases with new JIRA-only test cases
      const allCases = [...existingTestCases, ...newTestCases];

      // Update the modal's test cases with fresh data
      setAllTestCases(allCases);

      // Update bugs data for pie chart
      const totalBugs = allCases.filter(tc => tc.isBug).length;
      const bugsByStatus = {};
      allCases.forEach(tc => {
        if (tc.isBug && tc.currentStatus) {
          bugsByStatus[tc.currentStatus] = (bugsByStatus[tc.currentStatus] || 0) + 1;
        }
      });
      handleStatusChange(totalBugs, bugsByStatus);

    } catch (error) {
      console.error('Error refreshing modal:', error);
      // Show error to user
      // alert(`Error refreshing data: ${error.message}`);
    }
  };
  const handleFullRefresh = async () => {
    try {
      const refreshPromises = [];
      let totalBugs = 0;
      const bugsByStatus = {};
  
      // 🔁 Step 1: Refresh test case statuses
      for (const ref of Object.values(endpointRefs.current)) {
        if (ref.current) {
          const testCases = ref.current.getTestCases();
          if (testCases) {
            for (const tc of testCases) {
              if (tc.isBug && tc.jiraIssueId) {
                refreshPromises.push(
                  ref.current.refreshStatus(tc.id).then(() => {
                    const updatedTestCase = ref.current.getTestCases().find(t => t.id === tc.id);
                    if (updatedTestCase) {
                      totalBugs++;
                      bugsByStatus[updatedTestCase.currentStatus] =
                        (bugsByStatus[updatedTestCase.currentStatus] || 0) + 1;
                    }
                  })
                );
              }
            }
          }
        }
      }
  
      await Promise.all(refreshPromises); // Wait for all refreshes
      handleStatusChange(totalBugs, bugsByStatus);
  
      // 🧠 Step 2: Fetch JIRA issues and sync
      const apiUrl = process.env.REACT_APP_API_URL;
      if (!apiUrl) {
        console.error('API URL is not configured. Please check your environment variables.');
        alert('API URL is not configured. Please check your environment variables.');
        return;
      }
  
      if (!sprintId) {
        alert('Please enter a Sprint ID before refreshing.');
        return;
      }
  
      const response = await fetch(`${apiUrl}/api/jira/sprint/${sprintId}/issues`);
  
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
  
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Invalid response type:', {
          contentType,
          response: text.substring(0, 200)
        });
        throw new Error('Invalid response type from API');
      }
  
      const jiraData = await response.json();
      const currentJiraIds = new Set(jiraData.map(issue => issue.key));
      const existingTestCases = [];
  
      // In the handleFullRefresh function, update the section where existing test cases are filtered:

// Inside the loop over endpointRefs:
Object.values(endpointRefs.current).forEach(ref => {
  if (ref.current) {
    const testCases = ref.current.getTestCases();
    if (testCases) {
      // Filter test cases to remove those linked to deleted JIRA issues
      const updatedTestCases = testCases.filter(tc => {
        // Keep test cases without a JIRA ID (UI-generated)
        if (!tc.jiraIssueId) return true;
        // Remove test cases whose JIRA issue no longer exists
        return currentJiraIds.has(tc.jiraIssueId);
      });

      // Logging to verify filtering (optional)
      console.log(`Endpoint ${ref.current.props.path} filtered cases:`, updatedTestCases);

      // Update the EndpointCard's test cases
      ref.current.setTestCases(updatedTestCases);

      // Collect remaining test cases for modal
      existingTestCases.push(...updatedTestCases.map(tc => ({
        ...tc,
        transitions: ref.current.getTransitions?.(tc.id)
      })));
    }
  }
});
  
      const newTestCases = jiraData
        .filter(jiraIssue => !existingTestCases.some(tc => tc.jiraIssueId === jiraIssue.key))
        .map(jiraIssue => {
          let requestData = 'No request data available';
          let responseData = 'No response data available';
          let bugDescription = 'No description available';
  
          if (jiraIssue.description) {
            let descriptionText = '';
            if (typeof jiraIssue.description === 'object') {
              if (jiraIssue.description.content) {
                descriptionText = jiraIssue.description.content
                  .map(content => {
                    if (content.content) {
                      return content.content
                        .map(c => c.text || '')
                        .join(' ');
                    }
                    return content.text || '';
                  })
                  .join('\n');
              } else if (jiraIssue.description.text) {
                descriptionText = jiraIssue.description.text;
              }
            } else {
              descriptionText = jiraIssue.description;
            }
  
            const requestMatch = descriptionText.match(/\{code:title=Request Data\}([\s\S]*?)\{code\}/);
            const responseMatch = descriptionText.match(/\{code:title=Response Data\}([\s\S]*?)\{code\}/);
            const descriptionMatch = descriptionText.match(/h3\. Bug Description:\s*([\s\S]*?)(?=\n\n|$)/);
  
            requestData = requestMatch ? requestMatch[1].trim() : requestData;
            responseData = responseMatch ? responseMatch[1].trim() : responseData;
            bugDescription = descriptionMatch ? descriptionMatch[1].trim() : descriptionText.trim();
          }
  
          return {
            id: `jira-${jiraIssue.key}`,
            title: jiraIssue.summary,
            message: bugDescription,
            request: requestData,
            response: responseData,
            isBug: true,
            jiraIssueId: jiraIssue.key,
            currentStatus: jiraIssue.status,
            transitions: jiraIssue.transitions,
            isJiraOnly: true
          };
        });
  
      const allCases = [...existingTestCases, ...newTestCases];
      setAllTestCases(allCases);
  
      const finalBugStats = {};
      const finalTotalBugs = allCases.filter(tc => tc.isBug).length;
  
      allCases.forEach(tc => {
        if (tc.isBug && tc.currentStatus) {
          finalBugStats[tc.currentStatus] = (finalBugStats[tc.currentStatus] || 0) + 1;
        }
      });
  
      handleStatusChange(finalTotalBugs, finalBugStats);
    } catch (error) {
      console.error('Error during full refresh:', error);
      alert(`Error refreshing data: ${error.message}`);
    }
  };
  
  const handleModalStatusUpdate = async (testCaseId, transitionId, statusName) => {
    try {
      // Find the test case
      const testCase = allTestCases.find(tc => tc.id === testCaseId);
      if (!testCase) {
        console.error('Test case not found:', testCaseId);
        return;
      }

      // Check if it's a JIRA-only issue
      if (testCase.isJiraOnly) {
        // Update status in JIRA
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/jira/update-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            issueId: testCase.jiraIssueId, 
            transitionId 
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update JIRA status');
        }

        // Update local state
        setAllTestCases(prevCases => 
          prevCases.map(tc => 
            tc.id === testCaseId 
              ? { ...tc, currentStatus: statusName }
              : tc
          )
        );

        // Update bugs data for pie chart
        const totalBugs = allTestCases.filter(tc => tc.isBug).length;
        const bugsByStatus = {};
        allTestCases.forEach(tc => {
          if (tc.isBug && tc.currentStatus) {
            bugsByStatus[tc.currentStatus] = (bugsByStatus[tc.currentStatus] || 0) + 1;
          }
        });
        handleStatusChange(totalBugs, bugsByStatus);

      } else {
        // Handle UI-generated test case
        const ref = Object.values(endpointRefs.current).find(ref => 
          ref.current?.getTestCases().some(t => t.id === testCaseId)
        );
        
        if (ref?.current?.updateStatus) {
          await ref.current.updateStatus(testCaseId, transitionId, statusName);
          
          // Update the test case status in modal
          setAllTestCases(prevCases => 
            prevCases.map(tc => 
              tc.id === testCaseId 
                ? { ...tc, currentStatus: statusName }
                : tc
            )
          );
        }
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  return (
    <div className="app">
    <h1>AIM 1.0</h1>
    <div style={{width:"100%", display:"flex", justifyContent:"center"}}><h2 style={{margin:"0"}}>Project Management</h2></div>
    <div className='top-header'>
    <div className="jira-info">
        {/* Using JIRA Board: SCRUM (ID: 1) */}
      </div>
      {/* <button 
          className="theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <span className="icon">
            {theme === 'light' ? '🌙' : '☀️'}
          </span>
        </button> */}
        </div>
    <div className="jira-config">
      <div className="jira-config-left">
        <input
          type="text"
          placeholder="Enter JIRA Sprint ID"
          value={inputSprintId}
          onChange={(e) => setInputSprintId(e.target.value)}
        />
        <button onClick={handleSprintIdUpdate}>
          Update Sprint ID
        </button>
        {sprintId && <span className="board-id-status">Using Sprint ID: {sprintId}</span>}
      </div>
      <div className="button-group">
        {/* <div className="refresh-action">
          <button 
            className="refresh-button modal-refresh"
            onClick={handleFullRefresh}
            title="Refresh All Statuses"
          >
            🔄
          </button>
          <span>Refresh All</span>
        </div> */}
        <button 
          className="theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <span className="icon">
            {theme === 'light' ? '🌙' : '☀️'}
          </span>
        </button>
        <button 
          className="show-testcases-btn"
          onClick={handleShowAllTestCases}
        >
          Show all Testcases
        </button>
      </div>
    </div>

    <Modal 
      isOpen={isModalOpen} 
      onClose={() => setIsModalOpen(false)} 
      onRefresh={handleFullRefresh}
      onStatusUpdate={handleModalStatusUpdate}
    >
      {allTestCases.map((tc) => (
        <div key={tc.id} className={`test-case ${tc.isBug ? 'bug-case' : ''}`}>
          <div 
            className="test-case-header"
            onClick={() => setExpandedModalTestCase(expandedModalTestCase === tc.id ? null : tc.id)}
          >
            <div className="test-case-header-left">
              <span className="test-case-title">{tc.title}</span>
              {/* <span className="test-case-message">{tc.message}</span> */}
            </div>
            <div className="test-case-header-right">
              {tc.isBug && <span className="bug-tag">BUG</span>}
              <span className="toggle">{expandedModalTestCase === tc.id ? '▼' : '▶'}</span>
            </div>
          </div>
          {expandedModalTestCase === tc.id && (
            <div className="test-case-content">
              {tc.isJiraOnly ? (
                // For JIRA-only issues, show description in a single block
                <div className="test-case-section">
                  <h4>Description:</h4>
                  <pre className="description-pre">{tc.message}</pre>
                  {tc.request !== 'No request data available' && (
                    <>
                      <h4>Request Data:</h4>
                      <pre className="request-pre">{tc.request}</pre>
                    </>
                  )}
                  {tc.response !== 'No response data available' && (
                    <>
                      <h4>Response Data:</h4>
                      <pre className="response-pre">{tc.response}</pre>
                    </>
                  )}
                </div>
              ) : (
                // For UI-generated test cases, show separate request and response
                <>
                  <div className="test-case-section">
                    <h4>Request:</h4>
                    <pre className="request-pre">{tc.request}</pre>
                  </div>
                  <div className="test-case-section">
                    <h4>Response:</h4>
                    <pre className="response-pre">{tc.response}</pre>
                  </div>
                </>
              )}
              {tc.isBug && tc.jiraIssueId && (
                <div className="status-section">
                  <div className="status-header">
                    <div className="status-header-left">
                      <h4>Update Status:</h4>
                      
                    </div>
                  </div>
                  <div className="status-buttons">
                    {tc.transitions?.map(status => (
                      <button
                        key={status.id}
                        onClick={() => handleModalStatusUpdate(tc.id, status.id, status.name)}
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
    </Modal>

    <PieCharts 
        totalBugs={bugsData.totalBugs}
        bugsByStatus={bugsData.bugsByStatus}
      />
      <div className="cards-container">
        {Object.entries(openApiSpec.paths).map(([path, methods]) =>
          Object.entries(methods).map(([method, operation]) => {
            const key = `${method}-${path}`;
            return (
              <EndpointCard
                key={key}
                ref={endpointRefs.current[key]}
                path={path}
                method={method}
                operation={operation}
                sprintId={sprintId}
                onStatusChange={handleStatusChange}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

export default App;
