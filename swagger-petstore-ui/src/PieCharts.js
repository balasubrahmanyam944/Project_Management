import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const PieCharts = ({ bugsByStatus, totalBugs,isLoading  }) => {
  const statusColors = {
    'To Do': '#FF6384',
    'In Progress': '#36A2EB',
    'In Review': '#FFCE56',
    Done: '#4BC0C0',
    Closed: '#9966FF',
    // Add more status-color mappings as needed
  };
  const filteredStatuses = Object.entries(bugsByStatus)
  .filter(([_, count]) => count > 0);
  return (
    <div className="piecharts-container">
        
        <div style={{display:"flex", justifyContent:"center"}}>
        <h3>Bugs Status</h3></div>
      {Object.entries(bugsByStatus).map(([status, count]) => (
        <div key={status} className="piechart-item">
          <h4>{status}</h4>
          <div className="chart-wrapper">
          <Doughnut
            data={{
              labels: [status, 'Remaining Bugs'],
              datasets: [{
                data: [count, Math.max(totalBugs - count, 0)],
                backgroundColor: [statusColors[status] || '#CCCCCC', '#F0F0F0'],
                hoverBackgroundColor: [statusColors[status] || '#CCCCCC', '#F0F0F0']
              }]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom',labels: {
                    boxWidth: 15,
                    padding: 10
                  } },
                tooltip: {
                  callbacks: {
                    label: (context) => {
                      const label = context.label || '';
                      const value = context.raw || 0;
                      return `${label}: ${value} (${((value / totalBugs) * 100 || 0).toFixed(1)}%)`;
                    }
                  }
                }
              }
            }}
          />
          </div>
          <div className="chart-stats">
            <span className="status-count">{count}</span>
            <span className="total-count">of {totalBugs}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PieCharts;