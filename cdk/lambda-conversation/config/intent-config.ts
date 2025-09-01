export interface IntentConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: number;
  keyPhrases: string[];
  suggestedActions: string[];
  responseTemplates: string[];
  parameters: ParameterConfig[];
  isActive: boolean;
  metadata?: Record<string, any>;
  // FAQ-specific fields
  faqResponses?: FAQResponse[];
  isFAQ?: boolean;
}

export interface FAQResponse {
  triggerPhrases: string[];
  response: string;
  category: string;
  priority: number;
}

export interface ParameterConfig {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'phone';
  required: boolean;
  description: string;
  examples: string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    minValue?: number;
    maxValue?: number;
  };
}

export interface SystemConfig {
  intents: IntentConfig[];
  globalSettings: {
    defaultConfidenceThreshold: number;
    maxAlternatives: number;
    responseTimeout: number;
    maxRetries: number;
  };
  categories: {
    id: string;
    name: string;
    description: string;
    color: string;
  }[];
  trainingDefaults: {
    baseModel: string;
    learningRate: number;
    numEpochs: number;
    batchSize: number;
    maxLength: number;
    loraRank: number;
    loraAlpha: number;
    loraDropout: number;
  };
}

// Default system configuration
export const defaultSystemConfig: SystemConfig = {
  intents: [
    {
      id: 'account_inquiry',
      name: 'Account Inquiry',
      description: 'General questions about account status, billing, or account information',
      category: 'account',
      priority: 1,
      keyPhrases: [
        'account balance',
        'account status',
        'billing information',
        'account details',
        'my account',
        'account summary',
        'payment history',
        'account settings'
      ],
      suggestedActions: [
        'Check account balance',
        'View billing history',
        'Update account information',
        'Reset password',
        'Contact support'
      ],
      responseTemplates: [
        'I can help you with your account. What specific information do you need?',
        'Let me check your account details. What would you like to know?',
        'I have access to your account information. How can I assist you?'
      ],
      parameters: [
        {
          name: 'accountId',
          type: 'string',
          required: false,
          description: 'Account identifier',
          examples: ['ACC123456', 'user@email.com']
        }
      ],
      isActive: true
    },
    {
      id: 'billing_balance',
      name: 'Billing Balance',
      description: 'Questions about current balance, payments, or billing issues',
      category: 'billing',
      priority: 2,
      keyPhrases: [
        'current balance',
        'bill amount',
        'payment due',
        'outstanding balance',
        'how much do I owe',
        'billing statement',
        'payment amount',
        'balance due'
      ],
      suggestedActions: [
        'Check current balance',
        'View payment due date',
        'Make a payment',
        'Set up payment plan',
        'Dispute charges'
      ],
      responseTemplates: [
        'I can check your current billing balance. Let me look that up for you.',
        'Your billing information is available. What would you like to know?',
        'I can help with your billing questions. What do you need?'
      ],
      parameters: [
        {
          name: 'amount',
          type: 'number',
          required: false,
          description: 'Payment amount',
          examples: ['50.00', '100.00'],
          validation: {
            minValue: 0.01,
            maxValue: 10000.00
          }
        }
      ],
      isActive: true
    },
    {
      id: 'technical_support',
      name: 'Technical Support',
      description: 'Technical issues, troubleshooting, or service problems',
      category: 'support',
      priority: 3,
      keyPhrases: [
        'internet not working',
        'connection issues',
        'service down',
        'technical problem',
        'can\'t connect',
        'slow internet',
        'error message',
        'system issue'
      ],
      suggestedActions: [
        'Run diagnostics',
        'Reset equipment',
        'Schedule technician',
        'Check service status',
        'Update firmware'
      ],
      responseTemplates: [
        'I can help troubleshoot your technical issue. Let me start with some basic diagnostics.',
        'Technical support is available. What specific problem are you experiencing?',
        'I can assist with technical issues. Let me help you resolve this.'
      ],
      parameters: [
        {
          name: 'issueType',
          type: 'string',
          required: false,
          description: 'Type of technical issue',
          examples: ['connectivity', 'speed', 'equipment', 'software']
        },
        {
          name: 'equipmentId',
          type: 'string',
          required: false,
          description: 'Equipment identifier',
          examples: ['MODEM001', 'ROUTER123']
        }
      ],
      isActive: true
    },
    {
      id: 'payment_issue',
      name: 'Payment Issue',
      description: 'Problems with payments, declined transactions, or payment methods',
      category: 'billing',
      priority: 2,
      keyPhrases: [
        'payment declined',
        'can\'t pay',
        'payment failed',
        'card not working',
        'payment error',
        'transaction failed',
        'billing problem',
        'payment method'
      ],
      suggestedActions: [
        'Update payment method',
        'Verify card information',
        'Check payment status',
        'Contact bank',
        'Use alternative payment'
      ],
      responseTemplates: [
        'I can help resolve your payment issue. Let me check the details.',
        'Payment problems can be frustrating. I\'ll help you get this sorted out.',
        'I can assist with payment issues. What specific problem are you having?'
      ],
      parameters: [
        {
          name: 'paymentMethod',
          type: 'string',
          required: false,
          description: 'Type of payment method',
          examples: ['credit_card', 'debit_card', 'bank_transfer', 'paypal']
        },
        {
          name: 'errorCode',
          type: 'string',
          required: false,
          description: 'Payment error code',
          examples: ['DECLINED', 'INSUFFICIENT_FUNDS', 'EXPIRED_CARD']
        }
      ],
      isActive: true
    },
    {
      id: 'general_inquiry',
      name: 'General Inquiry',
      description: 'General questions, information requests, or non-specific inquiries',
      category: 'general',
      priority: 5,
      keyPhrases: [
        'help',
        'information',
        'question',
        'how to',
        'what is',
        'can you help',
        'need assistance',
        'support'
      ],
      suggestedActions: [
        'Provide information',
        'Direct to appropriate department',
        'Offer self-service options',
        'Connect to live agent'
      ],
      responseTemplates: [
        'I\'m here to help! What can I assist you with today?',
        'I\'d be happy to help with your inquiry. What do you need?',
        'How can I be of assistance to you today?'
      ],
      parameters: [],
      isActive: true
    },
    {
      id: 'wire_transfer_info',
      name: 'Wire Transfer Information',
      description: 'Information about wire transfers, fees, and international transfers',
      category: 'billing',
      priority: 3,
      keyPhrases: [
        'wire transfer',
        'international transfer',
        'transfer fee',
        'transfer cost',
        'international wire',
        'domestic wire'
      ],
      suggestedActions: [
        'Provide transfer fee information',
        'Explain transfer process',
        'Direct to transfer service'
      ],
      responseTemplates: [
        'International wire transfers typically cost $25-45 depending on the destination country and amount. Domestic wire transfers are usually $15-25.',
        'I can help you with wire transfer information. What specific details do you need?'
      ],
      parameters: [
        {
          name: 'transferType',
          type: 'string',
          required: false,
          description: 'Type of transfer (domestic/international)',
          examples: ['domestic', 'international']
        }
      ],
      isActive: true,
      isFAQ: true,
      faqResponses: [
        {
          triggerPhrases: ['wire transfer', 'international', 'fee', 'cost'],
          response: 'International wire transfers typically cost $25-45 depending on the destination country and amount. Domestic wire transfers are usually $15-25.',
          category: 'billing',
          priority: 1
        }
      ]
    },
    {
      id: 'account_balance_info',
      name: 'Account Balance Information',
      description: 'Information about checking account balance and balance inquiry methods',
      category: 'account',
      priority: 2,
      keyPhrases: [
        'account balance',
        'check balance',
        'balance inquiry',
        'how much do I have',
        'current balance'
      ],
      suggestedActions: [
        'Provide balance check methods',
        'Direct to online banking',
        'Explain mobile app features'
      ],
      responseTemplates: [
        'You can check your account balance by logging into your online banking portal, using the mobile app, or calling our customer service number at 1-800-BANK-123.',
        'I can help you check your balance. What method would you prefer?'
      ],
      parameters: [],
      isActive: true,
      isFAQ: true,
      faqResponses: [
        {
          triggerPhrases: ['account balance', 'check balance', 'balance'],
          response: 'You can check your account balance by logging into your online banking portal, using the mobile app, or calling our customer service number at 1-800-BANK-123.',
          category: 'account',
          priority: 1
        }
      ]
    },
    {
      id: 'password_reset_info',
      name: 'Password Reset Information',
      description: 'Information about password reset and account recovery',
      category: 'support',
      priority: 3,
      keyPhrases: [
        'password',
        'reset password',
        'forgot password',
        'can\'t login',
        'locked out'
      ],
      suggestedActions: [
        'Provide password reset steps',
        'Direct to password reset page',
        'Connect to support team'
      ],
      responseTemplates: [
        'To reset your password, go to the login page and click \'Forgot Password\', then follow the instructions sent to your email. You can also call our support team for assistance.',
        'I can help you reset your password. Would you like me to walk you through the process?'
      ],
      parameters: [],
      isActive: true,
      isFAQ: true,
      faqResponses: [
        {
          triggerPhrases: ['password', 'reset', 'forgot'],
          response: 'To reset your password, go to the login page and click \'Forgot Password\', then follow the instructions sent to your email. You can also call our support team for assistance.',
          category: 'support',
          priority: 1
        }
      ]
    },
    {
      id: 'security_info',
      name: 'Security Information',
      description: 'Information about account security and best practices',
      category: 'support',
      priority: 2,
      keyPhrases: [
        'security',
        'best practice',
        'two-factor',
        'authentication',
        'account safety'
      ],
      suggestedActions: [
        'Provide security best practices',
        'Explain two-factor authentication',
        'Direct to security settings'
      ],
      responseTemplates: [
        'Account security best practices include using strong passwords, enabling two-factor authentication, never sharing your credentials, and regularly monitoring your account activity. We also recommend using our mobile app\'s biometric login features.',
        'I can help you with security information. What specific aspect would you like to know about?'
      ],
      parameters: [],
      isActive: true,
      isFAQ: true,
      faqResponses: [
        {
          triggerPhrases: ['security', 'best practice', 'two-factor'],
          response: 'Account security best practices include using strong passwords, enabling two-factor authentication, never sharing your credentials, and regularly monitoring your account activity. We also recommend using our mobile app\'s biometric login features.',
          category: 'support',
          priority: 1
        }
      ]
    },
    {
      id: 'mobile_app_info',
      name: 'Mobile App Information',
      description: 'Information about mobile app features and capabilities',
      category: 'support',
      priority: 3,
      keyPhrases: [
        'mobile app',
        'app feature',
        'mobile banking',
        'app download',
        'mobile features'
      ],
      suggestedActions: [
        'Explain mobile app features',
        'Provide download instructions',
        'Direct to app support'
      ],
      responseTemplates: [
        'Our mobile app allows you to check balances, transfer funds, pay bills, deposit checks, and manage your account settings. It\'s available for both iOS and Android devices.',
        'I can tell you about our mobile app features. What would you like to know?'
      ],
      parameters: [],
      isActive: true,
      isFAQ: true,
      faqResponses: [
        {
          triggerPhrases: ['mobile app', 'app feature', 'mobile'],
          response: 'Our mobile app allows you to check balances, transfer funds, pay bills, deposit checks, and manage your account settings. It\'s available for both iOS and Android devices.',
          category: 'support',
          priority: 1
        }
      ]
    },
    {
      id: 'customer_service_info',
      name: 'Customer Service Information',
      description: 'Information about customer service and support options',
      category: 'support',
      priority: 2,
      keyPhrases: [
        'customer service',
        'support',
        'help',
        'contact us',
        'get help'
      ],
      suggestedActions: [
        'Provide contact information',
        'Explain support options',
        'Direct to appropriate department'
      ],
      responseTemplates: [
        'Our customer service team is available 24/7. You can reach us at 1-800-BANK-123, through our online chat, or by visiting any branch location.',
        'I can help you get in touch with our customer service team. What do you need help with?'
      ],
      parameters: [],
      isActive: true,
      isFAQ: true,
      faqResponses: [
        {
          triggerPhrases: ['customer service', 'support', 'help'],
          response: 'Our customer service team is available 24/7. You can reach us at 1-800-BANK-123, through our online chat, or by visiting any branch location.',
          category: 'support',
          priority: 1
        }
      ]
    },
    {
      id: 'branch_location_info',
      name: 'Branch and Location Information',
      description: 'Information about branch locations and ATMs',
      category: 'general',
      priority: 3,
      keyPhrases: [
        'branch',
        'location',
        'atm',
        'nearest branch',
        'branch locator'
      ],
      suggestedActions: [
        'Provide branch locator information',
        'Explain ATM network',
        'Direct to location finder'
      ],
      responseTemplates: [
        'We have over 500 branches nationwide and 2,000+ ATMs. You can find the nearest location using our branch locator on our website or mobile app.',
        'I can help you find the nearest branch or ATM. What location are you looking for?'
      ],
      parameters: [],
      isActive: true,
      isFAQ: true,
      faqResponses: [
        {
          triggerPhrases: ['branch', 'location', 'atm'],
          response: 'We have over 500 branches nationwide and 2,000+ ATMs. You can find the nearest location using our branch locator on our website or mobile app.',
          category: 'general',
          priority: 1
        }
      ]
    }
  ],
  globalSettings: {
    defaultConfidenceThreshold: 0.7,
    maxAlternatives: 3,
    responseTimeout: 30000,
    maxRetries: 3
  },
  categories: [
    {
      id: 'account',
      name: 'Account',
      description: 'Account-related inquiries and management',
      color: 'blue'
    },
    {
      id: 'billing',
      name: 'Billing',
      description: 'Billing, payments, and financial matters',
      color: 'green'
    },
    {
      id: 'support',
      name: 'Support',
      description: 'Technical support and troubleshooting',
      color: 'orange'
    },
    {
      id: 'general',
      name: 'General',
      description: 'General inquiries and information',
      color: 'gray'
    }
  ],
  trainingDefaults: {
    baseModel: 'distilbert-base-uncased',
    learningRate: 0.00002,
    numEpochs: 3,
    batchSize: 16,
    maxLength: 512,
    loraRank: 16,
    loraAlpha: 32,
    loraDropout: 0.1
  }
};

// Configuration management functions
export class IntentConfigManager {
  private config: SystemConfig;

  constructor(config?: Partial<SystemConfig>) {
    this.config = { ...defaultSystemConfig, ...config };
  }

  // Get all intents
  getAllIntents(): IntentConfig[] {
    return this.config.intents.filter(intent => intent.isActive);
  }

  // Get intent by ID
  getIntentById(id: string): IntentConfig | undefined {
    return this.config.intents.find(intent => intent.id === id);
  }

  // Get intents by category
  getIntentsByCategory(category: string): IntentConfig[] {
    return this.config.intents.filter(intent => intent.category === category && intent.isActive);
  }

  // Get all categories
  getAllCategories() {
    return this.config.categories;
  }

  // Get global settings
  getGlobalSettings() {
    return this.config.globalSettings;
  }

  // Get training defaults
  getTrainingDefaults() {
    return this.config.trainingDefaults;
  }

  // Add new intent
  addIntent(intent: IntentConfig): void {
    this.config.intents.push(intent);
  }

  // Update existing intent
  updateIntent(id: string, updates: Partial<IntentConfig>): boolean {
    const index = this.config.intents.findIndex(intent => intent.id === id);
    if (index !== -1) {
      this.config.intents[index] = { ...this.config.intents[index], ...updates };
      return true;
    }
    return false;
  }

  // Remove intent
  removeIntent(id: string): boolean {
    const index = this.config.intents.findIndex(intent => intent.id === id);
    if (index !== -1) {
      this.config.intents.splice(index, 1);
      return true;
    }
    return false;
  }

  // Get configuration as JSON
  exportConfig(): SystemConfig {
    return { ...this.config };
  }

  // Import configuration
  importConfig(config: SystemConfig): void {
    this.config = { ...config };
  }

  // Validate configuration
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for duplicate intent IDs
    const intentIds = this.config.intents.map(intent => intent.id);
    const duplicateIds = intentIds.filter((id, index) => intentIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      errors.push(`Duplicate intent IDs found: ${duplicateIds.join(', ')}`);
    }

    // Check for valid categories
    const validCategories = this.config.categories.map(cat => cat.id);
    this.config.intents.forEach(intent => {
      if (!validCategories.includes(intent.category)) {
        errors.push(`Intent '${intent.id}' has invalid category: ${intent.category}`);
      }
    });

    // Check confidence threshold
    if (this.config.globalSettings.defaultConfidenceThreshold < 0 || this.config.globalSettings.defaultConfidenceThreshold > 1) {
      errors.push('Confidence threshold must be between 0 and 1');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export default instance
export const intentConfigManager = new IntentConfigManager();
