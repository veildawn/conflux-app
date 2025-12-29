import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';
import Overview from './pages/Overview';
import Proxy from './pages/Proxy';
import ProxyGroups from './pages/ProxyGroups';
import ProxyServers from './pages/ProxyServers';
import Rules from './pages/Rules';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import SubStore from './pages/SubStore';
import RuleDatabase from './pages/RuleDatabase';
import Logs from './pages/Logs';
import Providers from './pages/Providers';

function App() {
  // 代理内核的启动逻辑已移至 AppLayout 组件中，避免重复启动
  return (
    <>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="overview" element={<Overview />} />
          <Route path="proxy" element={<Proxy />} />
          <Route path="proxy-groups" element={<ProxyGroups />} />
          <Route path="proxy-servers" element={<ProxyServers />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="sub-store" element={<SubStore />} />
          <Route path="rules" element={<Rules />} />
          <Route path="rule-database" element={<RuleDatabase />} />
          <Route path="providers" element={<Providers />} />
          <Route path="logs" element={<Logs />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
