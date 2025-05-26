import React, { useState, useEffect } from 'react';
import './App.css';
import { Doughnut } from 'react-chartjs-2';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import FileUploadSection from './FileUploadSection';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

const codeString = `import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.testng.Assert;
import org.testng.annotations.Test;

public class PetStoreApiTest {
    private static final String BASE_URL = "https://petstore.swagger.io/v2";
    
    @Test
    public void testGetPetById() {
        int petId = 1; // Replace with an existing pet ID
        Response response = RestAssured.given()
            .baseUri(BASE_URL)
            .when()
            .get("/pet/" + petId)
            .then()
            .extract().response();
        
        System.out.println(response.getBody().asString());
        Assert.assertEquals(response.getStatusCode(), 200, "Status code should be 200");
        Assert.assertTrue(response.getBody().asString().contains("\"id\":" + petId), "Response should contain pet ID");
    }
}`;

function TestCases() {
    // State management
    const [specUrl, setSpecUrl] = useState("");
    const [testCases, setTestCases] = useState({ llm: [], ruleBased: [] });
    const [selectedCases, setSelectedCases] = useState([]);
    const [cardData, setCardData] = useState({});
    const [submittedData, setSubmittedData] = useState([]);
    const [expandedCards, setExpandedCards] = useState({});
    
    // Chart data state
    const [chartData, setChartData] = useState({
        labels: ["Selected", "Remaining"],
        datasets: [{
            label: "Test Cases",
            data: [0, 100],
            backgroundColor: ["rgb(13, 184, 39)", "rgb(255, 99, 132)"],
            hoverOffset: 4,
        }],
    });

    // Effect for updating chart data
    useEffect(() => {
        const totalTestCases = testCases.llm.length + testCases.ruleBased.length;
        const selectedPercentage = (selectedCases.length / totalTestCases) * 100;
        const remainingPercentage = 100 - selectedPercentage;
        
        setChartData({
            labels: ["Selected", "Remaining"],
            datasets: [{
                label: "Test Cases",
                data: [selectedPercentage, remainingPercentage],
                backgroundColor: ["rgb(13, 184, 39)", "rgb(255, 99, 132)"],
                hoverOffset: 4,
            }],
        });
    }, [selectedCases, testCases]);

    // Generate test cases function
    const generateTestCases = async () => {
        if (!specUrl) return alert("Please enter a valid OpenAPI spec URL.");
        setTestCases({ llm: [], ruleBased: [] });
        
        try {
            const response = await fetch("http://localhost:9081/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spec_url: specUrl }),
            });
            
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();
            setTestCases({ 
                llm: data.llm_descriptions, 
                ruleBased: data.rule_based_descriptions 
            });
        } catch (error) {
            console.error("Error:", error);
            alert(`An error occurred while generating test cases: ${error.message}`);
        }
    };

    // Handle checkbox changes
    const handleCheckboxChange = (description, checked, index, type) => {
        setSelectedCases(prev => 
            checked ? [...prev, description] : prev.filter(item => item !== description)
        );
        setExpandedCards(prev => ({
            ...prev, 
            [`${type}-${index}`]: !prev[`${type}-${index}`]
        }));
    };

    // Handle card expansion
    const handleExpand = (index, type) => {
        setExpandedCards(prev => ({
            ...prev, 
            [`${type}-${index}`]: !prev[`${type}-${index}`]
        }));
    };

    // Card content component
    const CardContent = ({ inputCount, fileUploadCount, description, onSubmit }) => {
        const [inputValues, setInputValues] = useState(Array(inputCount).fill(""));

        const handleInputChange = (index, value) => {
            const newInputValues = [...inputValues];
            newInputValues[index] = value;
            setInputValues(newInputValues);
        };

        const handleSubmit = () => {
            onSubmit(description, inputValues);
        };

        return (
            <div className="card-content">
                {Array.from({ length: inputCount }, (_, index) => (
                    <input
                        key={`input-${index}`}
                        type="text"
                        id={`spec-urls-${index}`}
                        placeholder="Enter"
                        value={inputValues[index]}
                        onChange={(e) => handleInputChange(index, e.target.value)}
                    />
                ))}
                {Array.from({ length: fileUploadCount }, (_, index) => (
                    <FileUploadSection key={`file-upload-${index}`} />
                ))}
                <div className="buttons1">
                    <button className="view1" onClick={handleSubmit}>
                        Submit
                    </button>
                </div>
            </div>
        );
    };

    // Handle input changes for cards
    const handleInputChange = (cardId, inputIndex, value) => {
        setCardData(prev => ({
            ...prev,
            [cardId]: {
                ...prev[cardId],
                inputs: {
                    ...(prev[cardId]?.inputs || {}),
                    [inputIndex]: value,
                },
            },
        }));
    };

    // Handle file upload changes
    const handleFileUploadChange = (cardId, fileIndex, file) => {
        setCardData(prev => ({
            ...prev,
            [cardId]: {
                ...prev[cardId],
                files: {
                    ...(prev[cardId]?.files || {}),
                    [fileIndex]: file,
                },
            },
        }));
    };

    // Handle submit for cards
    const handleSubmit = (description, inputValues) => {
        setSubmittedData(prev => [
            ...prev,
            { description, inputValues },
        ]);
        console.log("Submitted Data:", { description, inputValues });
    };

    // Render test cases
    const renderTestCases = (testCases, type) => (
        testCases.map((description, index) => (
          <div key={`${type}-${index}`} className="card">
            <div className="card-header">
              <input
                type="checkbox"
                checked={selectedCases.includes(description)}
                onChange={(e) => handleCheckboxChange(description, e.target.checked, index, type)}
              />
              <span className="description">{description}</span>
              <div className="buttons">
                <button className="edit">Test</button>
                <button className="delete">Playwright</button>
                <button className="view">Selenium</button>
              </div>
            </div>
            {/* Fixed conditional rendering */}
            {expandedCards[`${type}-${index}`] && (
              <CardContent
                inputCount={3}
                fileUploadCount={2}
                description={description}
                onSubmit={handleSubmit}
              />
            )}
          </div>
        ))
      );

    return (
        <div>
            {/* <div style={{ display: "flex", justifyContent: "center", backgroundColor: "#000", alignItems: "center" }}>
                <div className="title">
                    <h1>API Test Case Generator</h1>
                </div>
            </div> */}
            
            <div style={{ display: "flex", justifyContent: "center", marginLeft: "5vh" }}>
                <div className="titles">
                    <input
                        type="text"
                        id="spec-url"
                        placeholder="Enter OpenAPI spec URL (e.g., https://petstore.swagger.io/v2/swagger.json)"
                        value={specUrl}
                        onChange={(e) => setSpecUrl(e.target.value)}
                    />
                    <button onClick={generateTestCases}>Generate</button>
                </div>
            </div>
            
            <div style={{ display: "flex", width: "100%" }}>
                <div className="container">
                    <div className="item-list">
                        <div id="llm-test-cases">
                            {renderTestCases(testCases.llm, "llm")}
                            {renderTestCases(testCases.ruleBased, "rule")}
                        </div>
                    </div>
                </div>
                
                {/* <div className="piechart">
                    <div className="sidecontainer">
                        <p style={{ margin: "0 0 0 50%" }}>CODE</p>
                        <div className="pieitem1">
                            <div className="code-scroll">
                                <SyntaxHighlighter language="java" style={oneDark}>
                                    {codeString}
                                </SyntaxHighlighter>
                            </div>
                        </div>
                    </div>
                    
                    <div className="sidecontainer1">
                        <div className="pieitem">
                            <p>Open</p>
                            <Doughnut
                                data={chartData}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        tooltip: {
                                            callbacks: {
                                                label: (context) => {
                                                    if (context.label === "Selected") 
                                                        return `Selected Test Cases: ${selectedCases.length}`;
                                                    if (context.label === "Remaining") 
                                                        return `Remaining Test Cases: ${testCases.llm.length + testCases.ruleBased.length - selectedCases.length}`;
                                                    return "";
                                                },
                                            },
                                        },
                                    },
                                }}
                                className="doughnut"
                            />
                        </div>
                        
                        <div className="pieitem">
                            <p>Pass</p>
                            <Doughnut
                                data={chartData}
                                className="doughnut"
                            />
                        </div>
                        
                        <div className="pieitem">
                            <p>Fail</p>
                            <Doughnut
                                data={chartData}
                                className="doughnut"
                            />
                        </div>
                    </div>
                </div> */}
            </div>
        </div>
    );
}

export default TestCases;