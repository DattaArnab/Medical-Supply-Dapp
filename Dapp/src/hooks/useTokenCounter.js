// Hook to track next token ID
import { useState, useEffect } from 'react';

export const useTokenCounter = (contract) => {
  const [nextTokenId, setNextTokenId] = useState(1);
  
  useEffect(() => {
    const fetchNextTokenId = async () => {
      if (!contract) return;
      
      try {
        // Get next token ID directly from contract
        const nextId = await contract.getNextTokenId();
        setNextTokenId(parseInt(nextId.toString()));
      } catch (error) {
        console.error('Error fetching next token ID:', error);
        // Default to 1 if error
        setNextTokenId(1);
      }
    };

    fetchNextTokenId();
  }, [contract]);

  const incrementTokenId = () => {
    setNextTokenId(prev => prev + 1);
  };

  return { nextTokenId, incrementTokenId };
};
