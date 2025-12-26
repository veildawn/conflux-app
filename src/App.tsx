import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';
import Overview from './pages/Overview';
import Proxy from './pages/Proxy';
import Rules from './pages/Rules';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import ExternalResources from './pages/ExternalResources';
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
          <Route path="proxy" element={<Proxy />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="rules" element={<Rules />} />
          <Route path="external-resources" element={<ExternalResources />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

export default App;

