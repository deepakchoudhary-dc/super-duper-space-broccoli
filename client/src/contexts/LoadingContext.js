import React, { createContext, useContext, useReducer } from 'react';

const LoadingContext = createContext();

const initialState = {
  isLoading: false,
  loadingMessage: 'Loading...',
  operations: new Set()
};

const loadingReducer = (state, action) => {
  switch (action.type) {
    case 'START_LOADING':
      const newOperations = new Set(state.operations);
      newOperations.add(action.operationId);
      return {
        ...state,
        isLoading: true,
        loadingMessage: action.message || 'Loading...',
        operations: newOperations
      };
    
    case 'STOP_LOADING':
      const updatedOperations = new Set(state.operations);
      updatedOperations.delete(action.operationId);
      return {
        ...state,
        isLoading: updatedOperations.size > 0,
        operations: updatedOperations
      };
    
    case 'STOP_ALL_LOADING':
      return {
        ...state,
        isLoading: false,
        operations: new Set()
      };
    
    default:
      return state;
  }
};

export const LoadingProvider = ({ children }) => {
  const [state, dispatch] = useReducer(loadingReducer, initialState);

  const startLoading = (operationId = 'default', message = 'Loading...') => {
    dispatch({ type: 'START_LOADING', operationId, message });
  };

  const stopLoading = (operationId = 'default') => {
    dispatch({ type: 'STOP_LOADING', operationId });
  };

  const stopAllLoading = () => {
    dispatch({ type: 'STOP_ALL_LOADING' });
  };

  return (
    <LoadingContext.Provider value={{
      ...state,
      startLoading,
      stopLoading,
      stopAllLoading
    }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};
