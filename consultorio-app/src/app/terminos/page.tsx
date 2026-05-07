export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-4xl mx-auto bg-card border border-border rounded-lg p-8 space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Términos y Condiciones</h1>
        <p className="text-sm text-muted-foreground">
          Versión vigente: v1 (documento de pruebas)
        </p>
        <p className="text-foreground">
          Este documento es un placeholder para ambiente de pruebas. Antes de producción debe ser reemplazado
          por la versión legal final aprobada por asesoría jurídica.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-foreground">
          <li>Uso permitido de la plataforma por profesionales de la salud.</li>
          <li>Responsabilidad del usuario sobre datos capturados y compartidos.</li>
          <li>Condiciones de suscripción, cobro y cancelación.</li>
          <li>Limitaciones de responsabilidad y soporte.</li>
        </ul>
      </div>
    </div>
  );
}
