# AgentFlow

<div align="center">

![Main Dashboard](assets/main-dashboard.png)

**AI-powered customer service transcript classification and visualization system**

[![AWS CDK](https://img.shields.io/badge/AWS%20CDK-2.206.0-orange.svg)](https://aws.amazon.com/cdk/)
[![React](https://img.shields.io/badge/React-18.0.0-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue.svg)](https://www.typescriptlang.org/)
[![Amazon Bedrock](https://img.shields.io/badge/Amazon%20Bedrock-Nova%20Lite-green.svg)](https://aws.amazon.com/bedrock/)


</div>

## Overview

The Bedrock Transcript Classifier is a comprehensive system for automatically analyzing customer service conversations using Amazon Bedrock AI. It extracts intent classifications, identifies key parameters, and provides interactive visualizations to understand conversation flows and patterns.

### Key Features

- **AI-Powered Classification**: Uses LLM-based intent parsing on Amazon Bedrock to intelligently classify conversation intents
- **Interactive Visualizations**: Sankey diagrams showing conversation flow patterns
- **Parameter Extraction**: Automatically identifies customer-provided and agent-needed parameters
- **Visual Schema Editor**: Drag-and-drop interface for managing intent hierarchies
- **Flow Analytics**: Detailed statistics and insights for each conversation flow
- **Real-time Processing**: Automatic classification triggered by S3 uploads

## Architecture

### **Backend (AWS CDK)**
- **S3 Bucket**: Stores transcript files and triggers processing
- **Lambda Functions**: AI classification and API handling
- **DynamoDB Tables**: Stores schemas, results, and extracted parameters
- **API Gateway**: RESTful API for frontend integration
- **Amazon Bedrock**: AI model for intent classification and parameter extraction

### **Frontend (React + TypeScript)**
- **Visual Schema Editor**: Drag-and-drop intent management
- **Sankey Diagrams**: Interactive conversation flow visualization
- **Flow Analytics**: Detailed statistics and parameter analysis
- **Real-time Updates**: Live data synchronization

## Screenshots

### Main Dashboard
![Main Dashboard](assets/main-dashboard.png)
*The main dashboard showing schema management, and AI suggestions*

### Visual Schema Editor
![Visual Schema Editor](assets/schema-editor.png)
*Drag-and-drop interface for managing hierarchical intent structures with multi-level support*

### Sankey Flow Visualization
![Sankey Diagram](assets/sankey-diagram.png)
*Interactive Sankey diagram showing conversation flow patterns and frequencies*

### Flow Statistics
![Flow Statistics](assets/flow-stats.png)
*Detailed analytics showing top parameters, conversation counts, and insights for each flow*

## Quick Start

### Prerequisites
- AWS Account with Bedrock access
- Node.js 18+ and npm
- AWS CLI configured

### 1. Clone and Setup
```bash
git clone <repository-url>
cd bedrock-transcript-classifier
```

### 2. Deploy Backend
```bash
cd cdk
npm install
npm run build
npx cdk deploy
```

### 3. Start Frontend
```bash
cd ../frontend/frontend
npm install
npm run dev
```

### 4. Configure API Endpoint
- Open the frontend at `http://localhost:5173`
- Click the settings icon in the header
- Enter your API Gateway URL from the CDK deployment

## Further Documentation

- **[CDK Backend Setup](cdk/README.md)** - Complete backend deployment and configuration
- **[Frontend Development](frontend/frontend/README.md)** - Frontend development and component architecture

## Core Features

### **Intent Classification**
The system automatically classifies conversations into hierarchical intent structures

### **Parameter Extraction**
Automatically identifies two types of parameters:

**Input Parameters** (Customer Provides):
- Account numbers, passwords, addresses
- Personal information for authentication
- Request details and preferences

**Output Parameters** (Agent Needs):
- Backend system data requirements
- Information needed to fulfill requests
- System queries and lookups

### **Interactive Visualizations**
- **Sankey Diagrams**: Visual representation of conversation flows
- **Click-to-Explore**: Click any node to see detailed statistics
- **Flow Analytics**: Comprehensive metrics for each intent path
- **Parameter Analysis**: Top input/output parameters for each flow

### **Visual Schema Editor**
- **Drag-and-Drop**: Intuitive interface for managing intents
- **Multi-Level Support**: Handle unlimited sub-intent levels
- **JSON Sync**: Bidirectional synchronization with raw JSON
- **Real-time Validation**: Instant feedback on schema structure


## Data Flow

### 1. Transcript Upload
- User uploads a transcript file to the S3 bucket
- S3 automatically triggers the classification Lambda function
- The Lambda function reads the transcript content from S3

### 2. AI Classification
- The Lambda function sends the transcript text to Amazon Bedrock
- Bedrock analyzes the conversation and determines the intent category and subcategory
- The system stores the classification result with a confidence score

### 3. Parameter Extraction
- The system makes two separate calls to Bedrock for parameter extraction:
  - **Input Parameters**: Identifies information the customer provides (account numbers, passwords, addresses, etc.)
  - **Output Parameters**: Identifies information the agent needs from backend systems (account balances, service status, etc.)

### 4. Data Storage
- Classification results are stored in the `ParsedResultsTable`
- Input parameters are stored in the `InputParametersTable`
- Output parameters are stored in the `OutputParametersTable`
- Each transcript gets a unique ID that links all related data

### 5. Frontend Access
- The React frontend fetches data from the API Gateway
- API Gateway routes requests to the API Lambda function
- The Lambda function queries DynamoDB tables and returns the data
- The frontend displays the data in visualizations (Sankey diagrams, statistics, etc.)

## Upcoming Features

- [ ] Handling multiple intents per transcript
- [ ] Cleaning up the schema editor
- [ ] Proper data obfuscation for sensitive data
- [ ] Support for more cloud providers (Azure, GCP, etc.)
- [ ] Cleaner onboarding experience
- [ ] Better error handling
- [ ] Better testing (unit tests, integration tests, etc.)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
