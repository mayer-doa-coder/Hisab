import { createContext, useContext } from 'react';

export const AppDataContext = createContext(null);

export const useAppData = () => {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error('useAppData must be used inside AppDataContext.Provider');
  }

  return context;
};
