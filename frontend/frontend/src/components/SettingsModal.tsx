import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  VStack,
  Box,
  Text,
  Input,
} from '@chakra-ui/react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tempApiUrl: string;
  onTempApiUrlChange: (url: string) => void;
  onSave: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  tempApiUrl,
  onTempApiUrlChange,
  onSave,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Settings</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <Box w="full">
              <Text mb={2} fontWeight="medium">API Endpoint</Text>
              <Input
                value={tempApiUrl}
                onChange={(e) => onTempApiUrlChange(e.target.value)}
                placeholder="https://your-api-id.execute-api.us-east-1.amazonaws.com/prod"
                size="md"
              />
              <Text fontSize="sm" color="gray.500" mt={1}>
                Your API Gateway endpoint without trailing slash
              </Text>
            </Box>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}; 