'use client';

import { useState, useEffect } from 'react';
import { VerificationRequirementsCard } from '@/components/trust/VerificationRequirements';
import { AuditLogCard } from '@/components/trust/AuditLog';

export default function TrustPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get tenant from session/user
    async function getTenant() {
      try {
        // This will be populated from the authenticated user
        setTenantId('current-tenant-id'); // Placeholder
      } finally {
        setLoading(false);
      }
    }
    getTenant();
  }, []);

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Trust Layer & Verificações</h1>
        <p className="text-gray-600">Gerir requisitos de verificação, bloqueios e audit log</p>
      </div>

      <VerificationRequirementsCard />
      
      {tenantId && <AuditLogCard tenantId={tenantId} />}
    </div>
  );
}