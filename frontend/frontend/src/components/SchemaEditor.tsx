import React, { useState, useCallback, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  IconButton,
  Badge,
  Flex,
  Textarea,
  useToast,
  Divider,
} from '@chakra-ui/react';
import { AddIcon, EditIcon, DeleteIcon, SettingsIcon, ChevronDownIcon, ChevronRightIcon, ChevronLeftIcon } from '@chakra-ui/icons';

interface IntentNode {
  id: string;
  name: string;
  type: 'intent' | 'subintent';
  parentId?: string;
  children: string[];
  color: string;
  isExpanded?: boolean;
  level: number;
}

interface SchemaEditorProps {
  schema: Record<string, unknown>;
  onSchemaChange: (newSchema: Record<string, unknown>) => void;
  isOpen: boolean;
  onClose: () => void;
}

const COLORS = [
  'blue.500',
  'green.500',
  'purple.500',
  'orange.500',
  'red.500',
  'teal.500',
  'pink.500',
  'cyan.500',
];

const SUBINTENT_COLORS = [
  'blue.100',
  'green.100',
  'purple.100',
  'orange.100',
  'red.100',
  'teal.100',
  'pink.100',
  'cyan.100',
];

const LEVEL_COLORS = [
  'gray.100',
  'blue.50',
  'green.50',
  'purple.50',
  'orange.50',
  'red.50',
  'teal.50',
  'pink.50',
];

export const SchemaEditor: React.FC<SchemaEditorProps> = ({
  schema,
  onSchemaChange,
  isOpen,
  onClose,
}) => {
  const toast = useToast();
  const [nodes, setNodes] = useState<IntentNode[]>([]);
  const [draggedNode, setDraggedNode] = useState<IntentNode | null>(null);
  const [newIntentName, setNewIntentName] = useState('');
  const [editingNode, setEditingNode] = useState<IntentNode | null>(null);
  const [editName, setEditName] = useState('');
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  
  const {
    isOpen: isJsonModalOpen,
    onOpen: onJsonModalOpen,
    onClose: onJsonModalClose,
  } = useDisclosure();
  
  const [jsonText, setJsonText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Recursively convert schema to nodes with proper levels
  const convertSchemaToNodes = useCallback((schemaObj: Record<string, unknown>, level: number = 0, parentId?: string): IntentNode[] => {
    const nodes: IntentNode[] = [];
    let colorIndex = 0;

    Object.entries(schemaObj).forEach(([name, children]) => {
      const node: IntentNode = {
        id: parentId ? `${parentId}-${name}` : name,
        name,
        type: level === 0 ? 'intent' : 'subintent',
        parentId,
        children: Object.keys(children || {}),
        color: level === 0 ? COLORS[colorIndex % COLORS.length] : SUBINTENT_COLORS[colorIndex % SUBINTENT_COLORS.length],
        isExpanded: true,
        level,
      };
      nodes.push(node);
      colorIndex++;

      // Recursively add children
      if (children && typeof children === 'object' && children !== null && !Array.isArray(children)) {
        const childNodes = convertSchemaToNodes(children as Record<string, unknown>, level + 1, node.id);
        nodes.push(...childNodes);
      }
    });

    return nodes;
  }, []);

  // Convert schema to nodes on mount
  React.useEffect(() => {
    const schemaNodes = convertSchemaToNodes(schema);
    setNodes(schemaNodes);
  }, [schema, convertSchemaToNodes]);

  // Convert nodes back to schema (recursive)
  const nodesToSchema = useCallback((nodeList: IntentNode[]): Record<string, unknown> => {
    const buildNodeTree = (parentId?: string): Record<string, unknown> => {
      const children = nodeList.filter(node => node.parentId === parentId);
      const result: Record<string, unknown> = {};
      
      children.forEach(child => {
        result[child.name] = buildNodeTree(child.id);
      });
      
      return result;
    };
    
    return buildNodeTree();
  }, []);

  // Get all descendants of a node (recursive)
  const getDescendants = useCallback((nodeId: string, nodeList: IntentNode[]): string[] => {
    const descendants: string[] = [];
    const children = nodeList.filter(node => node.parentId === nodeId);
    
    children.forEach(child => {
      descendants.push(child.id);
      descendants.push(...getDescendants(child.id, nodeList));
    });
    
    return descendants;
  }, []);



  const handleAddIntent = () => {
    if (!newIntentName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an intent name',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const newIntent: IntentNode = {
      id: newIntentName,
      name: newIntentName,
      type: 'intent',
      children: [],
      color: COLORS[nodes.length % COLORS.length],
      isExpanded: true,
      level: 0,
    };

    const updatedNodes = [...nodes, newIntent];
    setNodes(updatedNodes);
    onSchemaChange(nodesToSchema(updatedNodes));
    setNewIntentName('');
  };

  const handleAddSubIntent = (parentNode: IntentNode) => {
    const subIntentName = prompt(`Enter sub-intent name for ${parentNode.name}:`);
    if (!subIntentName?.trim()) return;

    const newSubIntent: IntentNode = {
      id: `${parentNode.id}-${subIntentName}`,
      name: subIntentName,
      type: 'subintent',
      parentId: parentNode.id,
      children: [],
      color: SUBINTENT_COLORS[nodes.length % SUBINTENT_COLORS.length],
      level: parentNode.level + 1,
    };

    const updatedNodes = [...nodes, newSubIntent];
    const updatedParent = updatedNodes.find(n => n.id === parentNode.id);
    if (updatedParent) {
      updatedParent.children.push(newSubIntent.id);
      updatedParent.isExpanded = true;
    }

    setNodes(updatedNodes);
    onSchemaChange(nodesToSchema(updatedNodes));
  };

  const handleDeleteNode = (node: IntentNode) => {
    if (node.children.length > 0) {
      toast({
        title: 'Cannot delete',
        description: 'Please delete all sub-intents first',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // Get all descendants to remove
    const descendants = getDescendants(node.id, nodes);
    const nodesToRemove = [node.id, ...descendants];
    
    const updatedNodes = nodes.filter(n => !nodesToRemove.includes(n.id));
    
    // Remove from parent's children
    if (node.parentId) {
      const parent = updatedNodes.find(n => n.id === node.parentId);
      if (parent) {
        parent.children = parent.children.filter(childId => childId !== node.id);
      }
    }

    setNodes(updatedNodes);
    onSchemaChange(nodesToSchema(updatedNodes));
  };

  const handleEditNode = (node: IntentNode) => {
    setEditingNode(node);
    setEditName(node.name);
  };

  const handleSaveEdit = () => {
    if (!editingNode || !editName.trim()) return;

    const updatedNodes = nodes.map(node => 
      node.id === editingNode.id ? { ...node, name: editName } : node
    );

    setNodes(updatedNodes);
    onSchemaChange(nodesToSchema(updatedNodes));
    setEditingNode(null);
    setEditName('');
  };

  const handleToggleExpand = (node: IntentNode) => {
    const updatedNodes = nodes.map(n => 
      n.id === node.id ? { ...n, isExpanded: !n.isExpanded } : n
    );
    setNodes(updatedNodes);
  };

  const handleMoveLevel = (node: IntentNode, direction: 'up' | 'down') => {
    if (direction === 'up' && node.level === 0) {
      // Can't move up from level 0
      toast({
        title: 'Cannot move up',
        description: 'Already at the top level',
        status: 'warning',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    if (direction === 'down' && !node.parentId) {
      // Can't move down from level 0 without a target
      toast({
        title: 'Cannot move down',
        description: 'Select a parent intent to move under',
        status: 'warning',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    const updatedNodes = [...nodes];
    const descendants = getDescendants(node.id, updatedNodes);

    if (direction === 'up') {
      // Move up: become sibling of parent
      const parent = updatedNodes.find(n => n.id === node.parentId);
      if (!parent) return;

      const grandparent = updatedNodes.find(n => n.id === parent.parentId);
      
      // Update the moved node
      const nodeIndex = updatedNodes.findIndex(n => n.id === node.id);
      if (nodeIndex !== -1) {
        updatedNodes[nodeIndex] = {
          ...updatedNodes[nodeIndex],
          parentId: grandparent?.id,
          level: grandparent ? grandparent.level + 1 : 0,
          type: grandparent ? 'subintent' : 'intent',
          color: grandparent ? SUBINTENT_COLORS[node.level % SUBINTENT_COLORS.length] : COLORS[node.level % COLORS.length],
        };
      }

      // Update descendants
      descendants.forEach(descendantId => {
        const descIndex = updatedNodes.findIndex(n => n.id === descendantId);
        if (descIndex !== -1) {
          const descendant = updatedNodes[descIndex];
          updatedNodes[descIndex] = {
            ...descendant,
            level: descendant.level - 1,
            color: descendant.level - 1 === 0 ? COLORS[descendant.level % COLORS.length] : SUBINTENT_COLORS[descendant.level % SUBINTENT_COLORS.length],
          };
        }
      });

      // Update parent's children
      if (parent) {
        parent.children = parent.children.filter(childId => childId !== node.id);
      }

      // Add to grandparent's children
      if (grandparent) {
        grandparent.children.push(node.id);
      }

    } else {
      // Move down: need to select a new parent
      // For now, we'll move to the first available parent at the same level
      const currentParent = updatedNodes.find(n => n.id === node.parentId);
      if (!currentParent) return;

      const siblings = updatedNodes.filter(n => n.parentId === currentParent.parentId && n.id !== currentParent.id);
      
      if (siblings.length === 0) {
        toast({
          title: 'No target available',
          description: 'No other intents at this level to move under',
          status: 'warning',
          duration: 2000,
          isClosable: true,
        });
        return;
      }

      // Move to the first sibling
      const newParent = siblings[0];

      // Update the moved node
      const nodeIndex = updatedNodes.findIndex(n => n.id === node.id);
      if (nodeIndex !== -1) {
        updatedNodes[nodeIndex] = {
          ...updatedNodes[nodeIndex],
          parentId: newParent.id,
          level: newParent.level + 1,
          type: 'subintent',
          color: SUBINTENT_COLORS[node.level % SUBINTENT_COLORS.length],
        };
      }

      // Update descendants
      descendants.forEach(descendantId => {
        const descIndex = updatedNodes.findIndex(n => n.id === descendantId);
        if (descIndex !== -1) {
          const descendant = updatedNodes[descIndex];
          updatedNodes[descIndex] = {
            ...descendant,
            level: descendant.level + 1,
            color: SUBINTENT_COLORS[descendant.level % SUBINTENT_COLORS.length],
          };
        }
      });

      // Update old parent's children
      if (currentParent) {
        currentParent.children = currentParent.children.filter(childId => childId !== node.id);
      }

      // Add to new parent's children
      newParent.children.push(node.id);
    }

    setNodes(updatedNodes);
    onSchemaChange(nodesToSchema(updatedNodes));
  };

  const handleDragStart = (node: IntentNode) => {
    setDraggedNode(node);
  };

  const handleDragOver = (e: React.DragEvent, targetNode: IntentNode) => {
    e.preventDefault();
    
    // Prevent dropping on self or descendants
    if (draggedNode) {
      const descendants = getDescendants(draggedNode.id, nodes);
      if (targetNode.id === draggedNode.id || descendants.includes(targetNode.id)) {
        return;
      }
    }
    
    setDragOverTarget(targetNode.id);
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetNode: IntentNode) => {
    e.preventDefault();
    if (!draggedNode || draggedNode.id === targetNode.id) return;

    // Prevent dropping on descendants
    const descendants = getDescendants(draggedNode.id, nodes);
    if (descendants.includes(targetNode.id)) return;

    const updatedNodes = [...nodes];

    // Get all nodes that need to be moved (dragged node + all descendants)
    const nodesToMove = [draggedNode.id, ...getDescendants(draggedNode.id, updatedNodes)];
    
    // Remove dragged node from its current parent
    if (draggedNode.parentId) {
      const oldParent = updatedNodes.find(n => n.id === draggedNode.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter(childId => childId !== draggedNode.id);
      }
    }

    // Update all moved nodes
    nodesToMove.forEach(nodeId => {
      const nodeIndex = updatedNodes.findIndex(n => n.id === nodeId);
      if (nodeIndex !== -1) {
        const node = updatedNodes[nodeIndex];
        
        if (nodeId === draggedNode.id) {
          // Update the node itself
          updatedNodes[nodeIndex] = {
            ...node,
            parentId: targetNode.id,
            level: targetNode.level + 1,
            type: 'subintent',
            color: SUBINTENT_COLORS[node.level % SUBINTENT_COLORS.length],
          };
        } else {
          // Update all child nodes
          const newLevel = node.level + (targetNode.level + 1 - draggedNode.level);
          updatedNodes[nodeIndex] = {
            ...node,
            level: newLevel,
            color: newLevel === 0 ? COLORS[node.level % COLORS.length] : SUBINTENT_COLORS[node.level % SUBINTENT_COLORS.length],
          };
        }
      }
    });

    // Add to target's children
    targetNode.children.push(draggedNode.id);
    targetNode.isExpanded = true;

    setNodes(updatedNodes);
    onSchemaChange(nodesToSchema(updatedNodes));
    setDraggedNode(null);
    setDragOverTarget(null);
  };

  const handleJsonEdit = () => {
    setJsonText(JSON.stringify(schema, null, 2));
    onJsonModalOpen();
  };

  const handleJsonSave = () => {
    try {
      const newSchema = JSON.parse(jsonText);
      onSchemaChange(newSchema);
      onJsonModalClose();
      toast({
        title: 'Success',
        description: 'Schema updated from JSON',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Invalid JSON format',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const renderNode = (node: IntentNode) => {
    const isEditing = editingNode?.id === node.id;
    const isDragging = draggedNode?.id === node.id;
    const isDragOver = dragOverTarget === node.id;
    const children = nodes.filter(n => n.parentId === node.id);
    const descendants = getDescendants(node.id, nodes);
    const isDragValid = !draggedNode || !descendants.includes(draggedNode.id);

    return (
      <Box
        key={node.id}
        mb={2}
        transition="all 0.2s"
        transform={isDragOver && isDragValid ? 'scale(1.02)' : 'scale(1)'}
        ml={node.level * 4}
      >
        <Box
          p={3}
          border="2px solid"
          borderColor={isDragOver && isDragValid ? 'blue.400' : node.color}
          borderRadius="lg"
          bg={LEVEL_COLORS[node.level % LEVEL_COLORS.length]}
          cursor="grab"
          opacity={isDragging ? 0.5 : 1}
          draggable={isDragValid}
          onDragStart={() => handleDragStart(node)}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node)}
          _hover={{ 
            shadow: 'md',
            borderColor: isDragValid ? 'blue.300' : 'red.300',
            transform: 'translateY(-1px)'
          }}
          transition="all 0.2s"
          position="relative"
        >
          {isDragOver && isDragValid && (
            <Box
              position="absolute"
              top="-2px"
              left="-2px"
              right="-2px"
              bottom="-2px"
              border="2px dashed"
              borderColor="blue.400"
              borderRadius="lg"
              bg="blue.50"
              opacity={0.3}
              zIndex={-1}
            />
          )}

          {isDragOver && !isDragValid && (
            <Box
              position="absolute"
              top="-2px"
              left="-2px"
              right="-2px"
              bottom="-2px"
              border="2px dashed"
              borderColor="red.400"
              borderRadius="lg"
              bg="red.50"
              opacity={0.3}
              zIndex={-1}
            />
          )}

          <Flex justify="space-between" align="center">
            <HStack spacing={2}>
              {children.length > 0 && (
                <IconButton
                  aria-label={node.isExpanded ? "Collapse" : "Expand"}
                  icon={node.isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggleExpand(node)}
                />
              )}
              <Box>
                {isEditing ? (
                  <HStack>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      size="sm"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveEdit}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingNode(null)}>
                      Cancel
                    </Button>
                  </HStack>
                ) : (
                  <HStack>
                    <Text fontWeight="semibold" fontSize={node.level === 0 ? "lg" : "md"}>
                      {node.name}
                    </Text>
                    <Badge 
                      colorScheme={node.level === 0 ? "blue" : "green"} 
                      size="sm"
                    >
                      {node.level === 0 ? "Intent" : `Level ${node.level}`}
                    </Badge>
                    {children.length > 0 && (
                      <Badge colorScheme="gray" size="sm">
                        {children.length} child{children.length !== 1 ? 'ren' : ''}
                      </Badge>
                    )}
                  </HStack>
                )}
              </Box>
            </HStack>
            
            <HStack spacing={1}>
              <IconButton
                aria-label="Add sub-intent"
                icon={<AddIcon />}
                size="sm"
                colorScheme="green"
                onClick={() => handleAddSubIntent(node)}
              />
              <IconButton
                aria-label="Move up level"
                icon={<ChevronLeftIcon />}
                size="sm"
                colorScheme="blue"
                variant="outline"
                onClick={() => handleMoveLevel(node, 'up')}
                isDisabled={node.level === 0}
                title="Move up one level"
              />
              <IconButton
                aria-label="Move down level"
                icon={<ChevronRightIcon />}
                size="sm"
                colorScheme="blue"
                variant="outline"
                onClick={() => handleMoveLevel(node, 'down')}
                isDisabled={!node.parentId}
                title="Move down one level"
              />
              <IconButton
                aria-label="Edit"
                icon={<EditIcon />}
                size="sm"
                onClick={() => handleEditNode(node)}
              />
              <IconButton
                aria-label="Delete"
                icon={<DeleteIcon />}
                size="sm"
                colorScheme="red"
                onClick={() => handleDeleteNode(node)}
              />
            </HStack>
          </Flex>
        </Box>

        {node.isExpanded && children.length > 0 && (
          <Box mt={2}>
            {children.map(child => renderNode(child))}
          </Box>
        )}
      </Box>
    );
  };

  const topLevelNodes = nodes.filter(node => node.level === 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl">
      <ModalOverlay />
      <ModalContent maxH="90vh">
        <ModalHeader>
          <Flex justify="space-between" align="center" padding={4}>
            <Text>Visual Schema Editor</Text>
            <Button leftIcon={<SettingsIcon />} onClick={handleJsonEdit} size="sm">
              Edit JSON
            </Button>
          </Flex>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody overflow="auto" ref={containerRef}>
          <VStack spacing={6} align="stretch">
            <Box p={4} border="1px" borderColor="gray.200" borderRadius="lg" bg="gray.50">
              <HStack>
                <Input
                  placeholder="Enter new intent name"
                  value={newIntentName}
                  onChange={(e) => setNewIntentName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddIntent()}
                />
                <Button onClick={handleAddIntent} leftIcon={<AddIcon />} colorScheme="blue">
                  Add Intent
                </Button>
              </HStack>
            </Box>

            <Divider />

            <Box>
              <Text fontSize="lg" fontWeight="bold" mb={4}>
                Intent Structure
              </Text>
              <VStack spacing={1} align="stretch">
                {topLevelNodes.map(node => renderNode(node))}
              </VStack>
              
              {topLevelNodes.length === 0 && (
                <Box p={8} textAlign="center" color="gray.500">
                  <Text>No intents defined yet. Add your first intent above!</Text>
                </Box>
              )}
            </Box>
          </VStack>
        </ModalBody>
      </ModalContent>

      <Modal isOpen={isJsonModalOpen} onClose={onJsonModalClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Schema JSON</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={20}
              fontFamily="mono"
              fontSize="sm"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onJsonModalClose}>
              Cancel
            </Button>
            <Button onClick={handleJsonSave}>
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Modal>
  );
}; 