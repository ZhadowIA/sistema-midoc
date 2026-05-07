'use client'

import { useEffect, useState } from 'react'
import { DoctorLayout } from '@/components/DoctorLayout'
import { ClinicalCreditsCard } from '@/components/dashboard/ClinicalCreditsCard'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Transaction {
  id: string
  type: string
  amount: number
  description: string | null
  createdAt: string
}

export default function CreditsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/clinical/credits?action=history&limit=100')
      .then((res) => res.json())
      .then((data) => setTransactions(data.transactions || []))
      .catch((err) => {
        console.error('Failed to load transaction history:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <DoctorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Créditos Clínicos IA</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona tu saldo de créditos para usar IA en tus consultas
          </p>
        </div>

        <ClinicalCreditsCard />

        <div className="border rounded-md overflow-hidden">
          <div className="bg-card border-b border-border p-4">
            <h2 className="font-semibold text-foreground">Historial de transacciones</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando historial...</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No hay transacciones de créditos aún
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Fecha</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tipo</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Descripción</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Créditos</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">
                        {format(new Date(tx.createdAt), 'dd MMM yyyy HH:mm', { locale: es })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            tx.type === 'MONTHLY_ALLOCATION'
                              ? 'bg-green-100 text-green-700'
                              : tx.type === 'USAGE'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {tx.type === 'MONTHLY_ALLOCATION'
                            ? 'Asignación mensual'
                            : tx.type === 'USAGE'
                              ? 'Uso'
                              : tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{tx.description || '—'}</td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-semibold ${
                          tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DoctorLayout>
  )
}
