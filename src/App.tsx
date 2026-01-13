import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';

// 懒加载页面组件
const Home = lazy(() => import('./pages/Home'));
const Proxy = lazy(() => import('./pages/Proxy'));
const ProxyGroups = lazy(() => import('./pages/ProxyGroups'));
const ProxyServers = lazy(() => import('./pages/proxy-servers'));
const Rules = lazy(() => import('./pages/Rules'));
const Settings = lazy(() => import('./pages/Settings'));
const Subscription = lazy(() => import('./pages/Subscription'));
const SubStore = lazy(() => import('./pages/SubStore'));
const RuleDatabase = lazy(() => import('./pages/RuleDatabase'));
const Logs = lazy(() => import('./pages/Logs'));
const Sync = lazy(() => import('./pages/Sync'));
const Providers = lazy(() => import('./pages/Providers'));
const Requests = lazy(() => import('./pages/Requests'));
const Connections = lazy(() => import('./pages/Connections'));
const ProxyGroupEditWindow = lazy(() => import('./pages/proxy-groups/ProxyGroupEditWindow'));
const ProxyServerEditWindow = lazy(() => import('./pages/proxy-servers/ProxyServerEditWindow'));
const SubscriptionEditWindow = lazy(() => import('./pages/SubscriptionEditWindow'));
const RuleEditWindow = lazy(() => import('./pages/RuleEditWindow'));

// 加载中占位组件
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="text-center">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">加载中...</p>
    </div>
  </div>
);

function App() {
  // 代理内核的启动逻辑已移至 AppLayout 组件中，避免重复启动
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="proxy" element={<Proxy />} />
          <Route path="proxy-groups" element={<ProxyGroups />} />
          <Route path="proxy-servers" element={<ProxyServers />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="sub-store" element={<SubStore />} />
          <Route path="rules" element={<Rules />} />
          <Route path="rule-database" element={<RuleDatabase />} />
          <Route path="providers" element={<Providers />} />
          <Route path="logs" element={<Logs />} />
          <Route path="connections" element={<Connections />} />
          <Route path="requests" element={<Requests />} />
          <Route path="sync" element={<Sync />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="/proxy-group-edit" element={<ProxyGroupEditWindow />} />
        <Route path="/proxy-server-edit" element={<ProxyServerEditWindow />} />
        <Route path="/subscription-edit" element={<SubscriptionEditWindow />} />
        <Route path="/rule-edit" element={<RuleEditWindow />} />
      </Routes>
    </Suspense>
  );
}

export default App;
