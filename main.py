import os
import json
import csv
import time
import threading
import yaml
import requests
import openai
from flask import Flask, jsonify, request, render_template, send_file
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.utils import secure_filename
from openapi_spec_validator import validate_spec

# --- OpenAPILoader --------------------------------------------------
class OpenAPILoader:
    """
    Loads an OpenAPI specification from a local file or URL.
    """
    def __init__(self, source: str):
        self.source = source
        self.spec = None

    def load(self) -> dict:
        if self.source.startswith("http"):
            response = requests.get(self.source)
            if response.status_code != 200:
                raise Exception("Failed to load OpenAPI spec from URL")
            try:
                self.spec = response.json()
            except json.JSONDecodeError:
                self.spec = yaml.safe_load(response.text)
        else:
            with open(self.source, "r") as file:
                try:
                    self.spec = json.load(file)
                except json.JSONDecodeError:
                    self.spec = yaml.safe_load(file)
        return self.spec

# --- OpenAPIValidator --------------------------------------------------
class OpenAPIValidator:
    """
    Validates the OpenAPI spec using an open-source validator.
    """
    def __init__(self, spec: dict):
        self.spec = spec

    def validate(self) -> bool:
        validate_spec(self.spec)
        return True

# --- OpenAPIExtractor --------------------------------------------------
class OpenAPIExtractor:
    """
    Extracts endpoints and authentication details from the OpenAPI spec.
    """
    def __init__(self, spec: dict):
        self.spec = spec

    def extract_endpoints(self) -> list:
        endpoints = []
        paths = self.spec.get("paths", {})
        for path, methods in paths.items():
            for method, details in methods.items():
                endpoint_info = {
                    "endpoint": path,
                    "method": method.upper(),
                    "summary": details.get("summary", ""),
                    "parameters": details.get("parameters", []),
                    "request_body": details.get("requestBody", {}),
                    "responses": details.get("responses", {})
                }
                endpoints.append(endpoint_info)
        return endpoints

    def extract_authentication(self) -> dict:
        components = self.spec.get("components", {})
        return components.get("securitySchemes", {})

# --- RuleBasedTestCaseGenerator --------------------------------------------------
class RuleBasedTestCaseGenerator:
    """
    Generates basic test cases using a rule-based approach.
    For each endpoint, it creates multiple test cases per category:
    - A configurable number of positive test cases.
    - A configurable number of negative test cases.
    - A configurable number of edge test cases.
    """
    def __init__(self, endpoints: list, positive_count: int = 3, negative_count: int = 3, edge_count: int = 3):
        self.endpoints = endpoints
        self.positive_count = positive_count
        self.negative_count = negative_count
        self.edge_count = edge_count

    def generate_test_cases(self) -> list:
        test_cases = []
        for endpoint in self.endpoints:
            base_case = {
                "endpoint": endpoint["endpoint"],
                "method": endpoint["method"],
                "request_body": endpoint.get("request_body", {})
            }

            # Generate multiple positive cases
            for i in range(1, self.positive_count + 1):
                pos = base_case.copy()
                pos.update({
                    "scenario": f"positive_variant_{i}",
                    "description": f"Rule-based positive test variant {i}: Verify {endpoint['method']} {endpoint['endpoint']} returns a successful response.",
                    "expected_status": 200
                })
                test_cases.append(pos)

            # Generate multiple negative cases
            for i in range(1, self.negative_count + 1):
                neg = base_case.copy()
                neg.update({
                    "scenario": f"negative_variant_{i}",
                    "description": f"Rule-based negative test variant {i}: Verify {endpoint['method']} {endpoint['endpoint']} returns an error when required inputs are missing or invalid.",
                    "expected_status": 400  # Adjust as needed
                })
                test_cases.append(neg)

            # Generate multiple edge cases
            for i in range(1, self.edge_count + 1):
                edge = base_case.copy()
                edge.update({
                    "scenario": f"edge_variant_{i}",
                    "description": f"Rule-based edge test variant {i}: Verify {endpoint['method']} {endpoint['endpoint']} handles boundary condition inputs appropriately.",
                    "expected_status": 200  # Adjust if needed
                })
                test_cases.append(edge)
        return test_cases

# --- LLMTestCaseGenerator --------------------------------------------------
class LLMTestCaseGenerator:
    """
    Uses OpenAI's API to generate richer, LLM-driven test cases.
    For each endpoint, the LLM is instructed to generate multiple test cases.
    It expects the LLM to return a JSON array of test cases.
    """
    def __init__(self, openai_api_key: str, model: str = "gpt-3.5-turbo", positive_count: int = 3, negative_count: int = 3, edge_count: int = 3):
        openai.api_key = "AFASFAFASGAGASF"
        self.model = model
        self.positive_count = positive_count
        self.negative_count = negative_count
        self.edge_count = edge_count

    def generate_test_cases(self, endpoint_details: dict) -> list:
        prompt = self._construct_prompt(endpoint_details)
        print("generating  data for ", endpoint_details, "\n")
        try:
            response = openai.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are an expert API tester.Generate test scenarios as a JSON array. Please output raw JSON without any markdown formatting or extra text"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1000,
            )
            generated_text = response.choices[0].message.content.strip()
            cleaned_text = re.sub(r"^```(?:json)?", "", generated_text)
            cleaned_text = re.sub(r"```$", "", cleaned_text).strip()
            print(cleaned_text)
            # Attempt to parse the generated text as a JSON array
            test_cases = json.loads(cleaned_text)
            if not isinstance(test_cases, list):
                test_cases = [test_cases]
        except Exception as e:
            print(f"Error parsing JSON for endpoint {endpoint_details.get('endpoint')}: {e}")
            # Print the raw generated_text if available
            try:
                print("Raw response:", cleaned_text)
            except Exception:
                print("No raw response available.")
            # Fallback: create a default test case with error details.
            test_cases = [{
                "scenario": "default",
                "endpoint": endpoint_details.get("endpoint", ""),
                "method": endpoint_details.get("method", ""),
                "description": f"LLM generated test case (parsing error): {str(e)}",
                "expected_status": 200,
                "request_body": endpoint_details.get("request_body", {})
            }]
        return test_cases

    def _construct_prompt(self, endpoint_details: dict) -> str:
        total = self.positive_count + self.negative_count + self.edge_count
        prompt = (
            "Generate a JSON array of test cases for the given API endpoint. "
            f"There should be {self.positive_count} positive test cases, {self.negative_count} negative test cases, and {self.edge_count} edge test cases (a total of {total}).\n"
            "Each test case should be a JSON object with the following keys: 'scenario', 'endpoint', 'method', 'description', 'expected_status', and optionally 'request_body'.\n\n"
        )
        prompt += f"Endpoint: {endpoint_details.get('endpoint')}\n"
        prompt += f"Method: {endpoint_details.get('method')}\n"
        if endpoint_details.get("parameters"):
            prompt += f"Parameters: {json.dumps(endpoint_details.get('parameters'), indent=2)}\n"
        if endpoint_details.get("request_body"):
            prompt += f"Request Body: {json.dumps(endpoint_details.get('request_body'), indent=2)}\n"
        if endpoint_details.get("responses"):
            prompt += f"Responses: {json.dumps(endpoint_details.get('responses'), indent=2)}\n"
        prompt += (
            "\nGenerate the test cases as described:\n"
            "- Positive: Use valid inputs and expect a successful response (e.g., status 200).\n"
            "- Negative: Use invalid or missing inputs and expect an error response (e.g., status 400).\n"
            "- Edge: Use boundary or unusual inputs and expect an appropriate response.\n"
            "Return the result as a valid JSON array."
        )
        return prompt

# --- EnhancedAPITestExecutor --------------------------------------------------
class EnhancedAPITestExecutor:
    """
    Executes API tests based on the generated test cases.
    Supports GET, POST, PUT, and DELETE methods.
    """
    def __init__(self, base_url: str, test_cases: list):
        self.base_url = base_url
        self.test_cases = test_cases

    def run_tests(self) -> list:
        results = []
        for test in self.test_cases:
            method = test["method"]
            url = f"{self.base_url}{test['endpoint']}"
            payload = test.get("request_body", {}) or {}
            try:
                if method == "GET":
                    response = requests.get(url)
                elif method == "POST":
                    response = requests.post(url, json=payload)
                elif method == "PUT":
                    response = requests.put(url, json=payload)
                elif method == "DELETE":
                    response = requests.delete(url)
                else:
                    results.append({
                        "endpoint": test["endpoint"],
                        "method": method,
                        "expected_status": test["expected_status"],
                        "actual_status": "N/A",
                        "scenario": test.get("scenario", "N/A"),
                        "result": "SKIPPED (unsupported HTTP method)"
                    })
                    continue
                status_code = response.status_code
                passed = (status_code == test["expected_status"])
                result = {
                    "endpoint": test["endpoint"],
                    "method": method,
                    "scenario": test.get("scenario", "N/A"),
                    "expected_status": test["expected_status"],
                    "actual_status": status_code,
                    "result": "PASS" if passed else "FAIL"
                }
            except Exception as e:
                result = {
                    "endpoint": test["endpoint"],
                    "method": method,
                    "scenario": test.get("scenario", "N/A"),
                    "expected_status": test["expected_status"],
                    "actual_status": None,
                    "result": f"ERROR: {str(e)}"
                }
            results.append(result)
        return results

# --- Utility: Export to CSV --------------------------------------------------
def export_to_csv(data: list, filename: str):
    """
    Exports a list of dictionaries to a CSV file.
    """
    if not data:
        print("No data to export.")
        return
    keys = data[0].keys()
    with open(filename, 'w', newline='', encoding='utf-8') as output_file:
        dict_writer = csv.DictWriter(output_file, fieldnames=keys)
        dict_writer.writeheader()
        dict_writer.writerows(data)
    print(f"Exported {len(data)} records to '{filename}'.")

# --- Utility: Get Base URL from Spec ------------------------------------------
def get_base_url(spec: dict) -> str:
    """
    Determines the base URL from the OpenAPI spec.
    Supports both OpenAPI 3 (servers) and Swagger 2 (host, schemes, basePath).
    """
    if "servers" in spec and spec["servers"]:
        return spec["servers"][0]["url"].rstrip("/")
    elif "host" in spec:
        schemes = spec.get("schemes", ["https"])
        scheme = "https" if "https" in schemes else schemes[0]
        host = spec["host"]
        basePath = spec.get("basePath", "")
        return f"{scheme}://{host}{basePath}".rstrip("/")
    else:
        raise Exception("No server information found in the spec.")

# --- Flask Server ------------------------------------------------------------
# Flask and SocketIO Initialization
app = Flask(__name__)
CORS(app, resources={r"/generate": {"origins": "http://localhost:3000"}})
socketio = SocketIO(app, async_mode='gevent')

# Directory Configuration
UPLOAD_FOLDER = "D:/in"
DOWNLOAD_FOLDER = "D:/out"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['DOWNLOAD_FOLDER'] = DOWNLOAD_FOLDER

# Function to read CSV and extract descriptions
def read_csv_descriptions(filename):
    descriptions = []
    with open(filename, mode='r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            descriptions.append(row['description'])
    return descriptions

# OpenAPI Test Case Generation
@app.route('/generate', methods=['POST'])
def generate():
    spec_url = request.json.get('spec_url')
    if not spec_url:
        return jsonify({"error": "No spec_url provided"}), 400
    try:
        # Load the OpenAPI spec
        loader = OpenAPILoader(spec_url)
        spec = loader.load()
        # Extract endpoints
        extractor = OpenAPIExtractor(spec)
        endpoints = extractor.extract_endpoints()
        # Generate rule-based test cases
        rule_generator = RuleBasedTestCaseGenerator(endpoints)
        rule_test_cases = rule_generator.generate_test_cases()
        rule_descriptions = [tc['description'] for tc in rule_test_cases]
        # Placeholder LLM-generated test cases
        llm_descriptions = [
            "LLM Test Case 1: Verify GET /pet/{petId} returns a successful response.",
            "LLM Test Case 2: Verify POST /pet returns an error when required inputs are missing."
        ]
        return jsonify({
            "llm_descriptions": llm_descriptions,
            "rule_based_descriptions": rule_descriptions
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# File Upload API
@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    if filename.endswith('.json'):
        processed_filepath = os.path.join(app.config['DOWNLOAD_FOLDER'], filename)
        with open(filepath, "r") as f:
            file_data = f.read()
        with open(processed_filepath, "w") as f:
            f.write(file_data)
        socketio.emit('file_uploaded', {'filename': filename})
    return '', 204

# File Download API
@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    filepath = os.path.join(app.config['DOWNLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({"error": "File not found"}), 404
    return send_file(filepath, as_attachment=True)

# File Delete API
@app.route('/delete/<filename>', methods=['DELETE'])
def delete_file(filename):
    filepath = os.path.join(app.config['DOWNLOAD_FOLDER'], filename)
    if os.path.exists(filepath):
        os.remove(filepath)
        socketio.emit('file_deleted', {'filename': filename})
        return jsonify({"success": True})
    return jsonify({"error": "File not found"}), 404

# Monitor Download Folder
def monitor_download_folder():
    previous_files = set(os.listdir(DOWNLOAD_FOLDER))
    while True:
        time.sleep(1)
        current_files = set(os.listdir(DOWNLOAD_FOLDER))
        deleted_files = previous_files - current_files
        for file in deleted_files:
            socketio.emit('file_deleted', {'filename': file})
        new_files = current_files - previous_files
        for file in new_files:
            if file.endswith('.json'):
                socketio.emit('file_uploaded', {'filename': file})
        previous_files = current_files

if __name__ == '__main__':
    thread = threading.Thread(target=monitor_download_folder)
    thread.daemon = True
    thread.start()
    socketio.run(app, debug=True, host='0.0.0.0', port=9081)


# URL: https://petstore.swagger.io/v2/swagger.json