'use client';

import { useEffect, useState } from 'react';
import { getAuditLogByTenant } from '@/lib/trust/actions';

interface AuditLogProps {
  tenantId: string;
}

export function AuditLogCard({ tenantId }: AuditLogProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAuditLogByTenant(tenantId);
        setLogs(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantId]);

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="border rounded-lg p-4">
      <h2 className="text-xl font-bold mb-4">Audit Log</h2>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {logs.map((log) => (
          <div key={log.id} className="border-b pb-2 text-sm">
            <p className="font-semibold text-blue-600">{log.action}</p>
            <p className="text-gray-600">{log.comment || log.reason}</p>
            <p className="text-xs text-gray-400">
              {new Date(log.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}