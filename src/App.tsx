import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';
import Overview from './pages/Overview';
import Nodes from './pages/Nodes';
import Rules from './pages/Rules';
import Connections from './pages/Connections';
import Settings from './pages/Settings';
import { Toaster } from './components/ui/toaster';
import { useProxyStore } from './stores/proxyStore';

function App() {
  const { start, fetchStatus } = useProxyStore();
  const [initialized, setInitialized] = useState(false);

  // 应用启动时自动启动代理内核
  useEffect(() => {
    if (initialized) return;
    
    const initProxy = async () => {
      try {
        console.log('Starting proxy core...');
        await start();
        console.log('Proxy core started successfully');
      } catch (error) {
        console.error('Failed to start proxy core:', error);
        // 即使启动失败，也要获取状态
        await fetchStatus();
      }
      setInitialized(true);
    };

    initProxy();
  }, [initialized, start, fetchStatus]);

  return (
    <>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="overview" element={<Overview />} />
          <Route path="nodes" element={<Nodes />} />
          <Route path="rules" element={<Rules />} />
          <Route path="connections" element={<Connections />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

export default App;

