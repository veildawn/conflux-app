import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import type { ProxyStatus } from '@/types/proxy';

interface UsePortSettingsOptions {
  status: ProxyStatus;
  setPorts: (port: number, socksPort: number) => Promise<void>;
}

export function usePortSettings({ status, setPorts }: UsePortSettingsOptions) {
  const { toast } = useToast();
  const [httpPort, setHttpPort] = useState(String(status.port));
  const [socksPort, setSocksPort] = useState(String(status.socks_port));
  const [portsDirty, setPortsDirty] = useState(false);
  const [savingPorts, setSavingPorts] = useState(false);

  useEffect(() => {
    if (!portsDirty) {
      setHttpPort(String(status.port));
      setSocksPort(String(status.socks_port));
    }
  }, [status.port, status.socks_port, portsDirty]);

  const portError = useMemo(() => {
    const http = Number(httpPort);
    const socks = Number(socksPort);
    if (!Number.isInteger(http) || http < 1 || http > 65535) return 'HTTP 端口需在 1-65535';
    if (!Number.isInteger(socks) || socks < 1 || socks > 65535) return 'SOCKS5 端口需在 1-65535';
    return null;
  }, [httpPort, socksPort]);

  const handleSavePorts = async () => {
    if (portError) {
      toast({ title: '端口无效', description: portError, variant: 'destructive' });
      return;
    }
    try {
      setSavingPorts(true);
      await setPorts(Number(httpPort), Number(socksPort));
      setPortsDirty(false);
      toast({ title: '端口已保存' });
    } catch (error) {
      toast({ title: '保存失败', description: String(error), variant: 'destructive' });
    } finally {
      setSavingPorts(false);
    }
  };

  const handlePortBlur = () => {
    if (!portsDirty || savingPorts) return;
    void handleSavePorts();
  };

  const handleHttpPortChange = (value: string) => {
    setHttpPort(value);
    setPortsDirty(true);
  };

  const handleSocksPortChange = (value: string) => {
    setSocksPort(value);
    setPortsDirty(true);
  };

  return {
    httpPort,
    socksPort,
    portError,
    savingPorts,
    handleHttpPortChange,
    handleSocksPortChange,
    handlePortBlur,
  };
}
