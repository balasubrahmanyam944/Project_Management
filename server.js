require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// JIRA Configuration
const jiraConfig = {
  email: process.env.JIRA_EMAIL,
  token: process.env.API_TOKEN,
  domain: process.env.JIRA_DOMAIN,
  projectKey: process.env.JIRA_PROJECT_KEY
};

// Validate JIRA configuration
if (!jiraConfig.email || !jiraConfig.token || !jiraConfig.domain || !jiraConfig.projectKey) {
  console.error('Missing JIRA configuration. Please check your .env file');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${jiraConfig.email}:${jiraConfig.token}`).toString('base64')}`;

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Test endpoint to verify server is running
app.get('/api/test', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Sprint issues endpoint
app.get('/api/jira/sprint/:sprintId/issues', async (req, res) => {
  try {
    const { sprintId } = req.params;
    
    if (!sprintId) {
      return res.status(400).json({ error: 'Sprint ID is required' });
    }

    console.log(`Fetching issues for sprint ${sprintId}`);
    
    // First get all issues in the sprint
    const sprintResponse = await axios.get(
      `https://${jiraConfig.domain}/rest/agile/1.0/sprint/${sprintId}/issue`,
      { 
        headers: { 
          Authorization: authHeader,
          'Content-Type': 'application/json'
        } 
      }
    );

    console.log(`Found ${sprintResponse.data.issues.length} issues in sprint`);

    if (!sprintResponse.data || !sprintResponse.data.issues) {
      return res.status(404).json({ error: 'No issues found in sprint' });
    }

    // Get details for each issue
    const issues = await Promise.all(
      sprintResponse.data.issues.map(async (issue) => {
        try {
          const issueResponse = await axios.get(
            `https://${jiraConfig.domain}/rest/api/3/issue/${issue.key}`,
            { 
              headers: { 
                Authorization: authHeader,
                'Content-Type': 'application/json'
              } 
            }
          );

          // Get transitions for the issue
          const transitionsResponse = await axios.get(
            `https://${jiraConfig.domain}/rest/api/3/issue/${issue.key}/transitions`,
            { 
              headers: { 
                Authorization: authHeader,
                'Content-Type': 'application/json'
              } 
            }
          );

          return {
            key: issue.key,
            summary: issueResponse.data.fields.summary,
            description: issueResponse.data.fields.description,
            status: issueResponse.data.fields.status.name,
            transitions: transitionsResponse.data.transitions,
            created: issueResponse.data.fields.created,
            updated: issueResponse.data.fields.updated
          };
        } catch (error) {
          console.error(`Error fetching issue ${issue.key}:`, error.message);
          return null;
        }
      })
    );

    // Filter out any failed issue fetches
    const validIssues = issues.filter(issue => issue !== null);

    console.log(`Successfully fetched ${validIssues.length} issues`);
    res.json(validIssues);
  } catch (error) {
    console.error('JIRA Sprint Issues Fetch Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch sprint issues',
      details: error.response?.data || error.message
    });
  }
});

app.post('/api/jira', async (req, res) => {
  try {
    // 1. Create the issue
    const issueResponse = await axios.post(
      'https://balusuntech.atlassian.net/rest/api/3/issue',
      req.body,
      { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
    );

    // 2. Add to sprint if needed
    if (req.body.sprint?.id) {
      await axios.post(
        `https://balusuntech.atlassian.net/rest/agile/1.0/sprint/${req.body.sprint.id}/issue`,
        { issues: [issueResponse.data.key] },
        { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
      );
    }

    res.json(issueResponse.data);
  } catch (error) {
    console.error('JIRA Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { 
      error: 'Jira API connection failed' 
    });
  }
});

app.post('/send-to-jira', async (req, res) => {
  try {
    const { testCase, sprintId } = req.body;

    // 1. Create the issue without status
    const issueResponse = await axios.post(
      `https://${jiraConfig.domain}/rest/api/3/issue`,
      {
        fields: {
          project: { key: jiraConfig.projectKey },
          summary: testCase.title,
          description: testCase.description,
          issuetype: { name: "Bug" }
        }
      },
      { headers: { Authorization: authHeader } }
    );

    const issueKey = issueResponse.data.key;

    // 2. Transition to "To Do" status
    try {
      // Get available transitions
      const transitionsResponse = await axios.get(
        `https://${jiraConfig.domain}/rest/api/3/issue/${issueKey}/transitions`,
        { headers: { Authorization: authHeader } }
      );

      // Find "To Do" transition ID
      const todoTransition = transitionsResponse.data.transitions.find(
        t => t.name === "To Do"
      );

      if (todoTransition) {
        await axios.post(
          `https://${jiraConfig.domain}/rest/api/3/issue/${issueKey}/transitions`,
          {
            transition: {
              id: todoTransition.id
            }
          },
          { headers: { Authorization: authHeader } }
        );
      }
    } catch (transitionError) {
      console.error('Transition error:', transitionError.response?.data);
    }

    // 3. Add to sprint if needed
    if (sprintId) {
      await axios.post(
        `https://${jiraConfig.domain}/rest/agile/1.0/sprint/${sprintId}/issue`,
        { issues: [issueKey] },
        { headers: { Authorization: authHeader } }
      );
    }

    res.json({ 
      message: "JIRA issue created and added to sprint",
      issue: issueResponse.data,
      key: issueKey
    });

  } catch (error) {
    console.error("JIRA API error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: "Failed to create JIRA issue",
      details: error.response?.data
    });
  }
});

app.get('/api/jira/statuses/:issueId', async (req, res) => {
  try {
    const { issueId } = req.params;

    // Fetch issue transitions (status options)
    const response = await axios.get(
      `https://${jiraConfig.domain}/rest/api/3/issue/${issueId}/transitions`,
      { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
    );

    res.json(response.data.transitions);
  } catch (error) {
    console.error('JIRA Status Fetch Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch statuses' });
  }
});

app.post('/api/jira/update-status', async (req, res) => {
  try {
    const { issueId, transitionId } = req.body;

    await axios.post(
      `https://${jiraConfig.domain}/rest/api/3/issue/${issueId}/transitions`,
      { transition: { id: transitionId } },
      { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
    );

    res.json({ message: 'Issue status updated successfully' });
  } catch (error) {
    console.error('JIRA Status Update Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to update status' });
  }
});

app.get('/api/jira/issue/:issueId', async (req, res) => {
  try {
    const { issueId } = req.params;
    const response = await axios.get(
      `https://${jiraConfig.domain}/rest/api/3/issue/${issueId}`,
      { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
    );

    res.json({
      status: response.data.fields.status.name,
      summary: response.data.fields.summary
    });
  } catch (error) {
    console.error('JIRA Issue Fetch Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch issue details' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('JIRA Configuration:', {
    domain: jiraConfig.domain,
    projectKey: jiraConfig.projectKey
  });
});
