import React from 'react';
import {
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Box,
} from '@chakra-ui/react';

interface StatusAlertProps {
  apiError: string | null;
  isLoading: boolean;
}

export const StatusAlert: React.FC<StatusAlertProps> = ({ apiError, isLoading }) => {
  if (apiError) {
    return (
      <Alert status="error" mb={6} borderRadius="lg">
        <AlertIcon />
        <Box>
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>{apiError}</AlertDescription>
        </Box>
      </Alert>
    );
  }

  if (!isLoading) {
    return (
      <Alert status="success" mb={6} borderRadius="lg">
        <AlertIcon />
        <Box>
          <AlertTitle>Connected</AlertTitle>
          <AlertDescription>
            Successfully connected to API endpoint
          </AlertDescription>
        </Box>
      </Alert>
    );
  }

  return null;
}; 