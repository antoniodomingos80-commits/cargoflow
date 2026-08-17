'use client';

import { useEffect, useState } from 'react';
import { getVerificationRequirements } from '@/lib/trust/actions';

export function VerificationRequirementsCard() {
  const [requirements, setRequirements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getVerificationRequirements();
        setRequirements(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="border rounded-lg p-4">
      <h2 className="text-xl font-bold mb-4">Requisitos de Verificação</h2>
      <div className="space-y-2">
        {requirements.map((req) => (
          <div key={req.id} className="border-l-4 border-blue-500 pl-3 py-2">
            <p className="font-semibold">{req.document_type}</p>
            <p className="text-sm text-gray-600">{req.description}</p>
            <p className="text-xs text-gray-500">
              Role: {req.role} | Obrigatório: {req.is_required ? 'Sim' : 'Não'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}