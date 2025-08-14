import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  Box,
  VStack,
  Text,
  Progress,
  Icon,
} from '@chakra-ui/react';
import { ResponsiveSankey } from '@nivo/sankey';
import { ViewIcon } from '@chakra-ui/icons';

interface SankeyData {
  nodes: Array<{ id: string }>;
  links: Array<{ source: string; target: string; value: number }>;
}

interface VisualizationCardProps {
  sankeyData: SankeyData;
  isLoading: boolean;
  onSankeyClick: (nodeOrLink: any) => void;
}

export const VisualizationCard: React.FC<VisualizationCardProps> = ({
  sankeyData,
  isLoading,
  onSankeyClick,
}) => {
  return (
    <Card>
      <CardHeader>
        <Heading size="md">Intent Flow Visualization</Heading>
      </CardHeader>
      <CardBody>
        <Box h="600px" w="100vw">
          {isLoading ? (
            <VStack spacing={4} justify="center" h="full">
              <Progress size="sm" isIndeterminate w="full" />
              <Text color="gray.500">Loading visualization...</Text>
            </VStack>
          ) : sankeyData.nodes.length > 0 ? (
            <ResponsiveSankey
              data={sankeyData}
              margin={{ top: 40, right: 160, bottom: 40, left: 50 }}
              align="justify"
              colors={{ scheme: 'category10' }}
              nodeOpacity={1}
              nodeThickness={20}
              nodeSpacing={16}
              labelPosition="outside"
              labelOrientation="vertical"
              linkBlendMode="multiply"
              animate={true}
              onClick={onSankeyClick}
            />
          ) : (
            <VStack spacing={4} justify="center" h="full">
              <Icon as={ViewIcon} w={12} h={12} color="gray.400" />
              <Text color="gray.500">No data available for visualization</Text>
            </VStack>
          )}
        </Box>
      </CardBody>
    </Card>
  );
}; 