import { Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Rules() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            规则管理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Shield className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">规则管理功能</p>
            <p className="text-sm">将在阶段二实现</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}




