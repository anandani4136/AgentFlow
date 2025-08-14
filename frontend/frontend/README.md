# Bedrock Transcript Classifier - Frontend

A React-based web application for interfacing with the AI-powered customer service transcript classification and visualization backend hosted on AWS. This frontend provides an intuitive interface for managing intent schemas, viewing AI suggestions, and exploring conversation flows through interactive visualizations.

## 🚀 Features

### **Intent Schema Management**
- **Visual Schema Editor**: Drag-and-drop interface for creating and modifying hierarchical intent structures
- **JSON Editor**: Direct JSON editing with bidirectional synchronization
- **Multi-level Support**: Handle multiple levels of sub-intents with visual hierarchy
- **Real-time Validation**: Instant feedback on schema structure and syntax

### **AI-Powered Insights**
- **Smart Suggestions**: AI-generated recommendations for new intents based on transcript analysis
- **Confidence Scoring**: Each suggestion includes confidence levels and frequency data
- **Context Awareness**: Suggestions include relevant conversation context
- **One-click Integration**: Add suggestions directly to your schema with a single click

### **Interactive Visualizations**
- **Sankey Flow Diagrams**: Visual representation of intent flows and conversation paths
- **Click-to-Explore**: Click on any node to see detailed flow statistics
- **Parameter Analysis**: View top input/output parameters for each flow
- **Real-time Updates**: Visualizations update automatically as data changes

### **Advanced Analytics**
- **Flow Statistics**: Comprehensive metrics for each intent flow
- **Parameter Tracking**: Separate tracking of customer-provided (input) and agent-needed (output) parameters
- **Common Combinations**: Identify frequently occurring parameter patterns
- **Usage Analytics**: Track conversation frequency and parameter completeness


## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
# or
yarn install
```

### 2. Configure API Endpoint
The frontend connects to an AWS API Gateway endpoint. You'll need to configure this in the settings:

1. Start the development server
2. Click the settings icon in the header
3. Enter your API Gateway endpoint (e.g., `https://your-api-id.execute-api.your-region.amazonaws.com/prod`)

### 4. Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:5173`



### API Endpoint Configuration
The application stores your API endpoint in localStorage. You can change it anytime through the settings modal.


