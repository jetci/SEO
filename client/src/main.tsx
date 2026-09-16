import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Router } from 'wouter';
import App from './App';
import { trpc, createAppQueryClient, getTrpcClientConfig } from './trpc';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('[V2] #root element missing from index.html');

const queryClient = createAppQueryClient();
const trpcClient = trpc.createClient(getTrpcClientConfig());

createRoot(rootEl).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <Router>
        <React.StrictMode>
          <App />
          <Toaster position="top-right" richColors closeButton />
        </React.StrictMode>
      </Router>
    </QueryClientProvider>
  </trpc.Provider>,
);
