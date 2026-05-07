export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-4xl mx-auto bg-card border border-border rounded-lg p-8 space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Aviso de Privacidad</h1>
        <p className="text-sm text-muted-foreground">
          Versión vigente: v1 (documento de pruebas)
        </p>
        <p className="text-foreground">
          Este aviso es provisional para entorno de pruebas. En producción debe publicarse la versión legal definitiva
          con tratamiento de datos personales y datos sensibles de salud.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-foreground">
          <li>Finalidad del tratamiento de datos clínicos y administrativos.</li>
          <li>Medidas de seguridad para protección de información.</li>
          <li>Derechos ARCO y mecanismos de contacto.</li>
          <li>Políticas de retención y eliminación de expedientes.</li>
        </ul>
      </div>
    </div>
  );
}
