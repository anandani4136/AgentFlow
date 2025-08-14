import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  IconButton,
  Tooltip,
  Flex,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { MoonIcon, SunIcon, SettingsIcon } from '@chakra-ui/icons';

interface HeaderProps {
  onSettingsClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onSettingsClick }) => {
  const { colorMode, toggleColorMode } = useColorMode();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  return (
    <Box 
      bg={bgColor} 
      borderBottom="1px" 
      borderColor={borderColor}
      px={6}
      py={4}
      position="sticky"
      top={0}
      zIndex={10}
    >
      <Flex align="center" justify="space-between">
        <VStack align="start" spacing={1}>
          <Heading size="lg" color={useColorModeValue('gray.800', 'white')}>
            Bedrock Transcript Classifier
          </Heading>
          <Text fontSize="sm" color={useColorModeValue('gray.600', 'gray.400')}>
            AI-powered intent classification and visualization
          </Text>
        </VStack>
        
        <HStack spacing={3}>
          <Tooltip label={`Switch to ${colorMode === 'light' ? 'dark' : 'light'} mode`}>
            <IconButton
              aria-label="Toggle color mode"
              icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
              onClick={toggleColorMode}
              variant="ghost"
              size="md"
            />
          </Tooltip>
          
          <Tooltip label="Settings">
            <IconButton
              aria-label="Settings"
              icon={<SettingsIcon />}
              onClick={onSettingsClick}
              variant="ghost"
              size="md"
            />
          </Tooltip>
        </HStack>
      </Flex>
    </Box>
  );
}; 