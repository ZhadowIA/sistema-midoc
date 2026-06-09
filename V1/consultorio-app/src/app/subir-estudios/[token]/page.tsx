"use client";
import { use, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toast } from "sonner";

export default function ExternalUploadPage(props: { params: Promise<{ token: string }> }) {
  const { token } = use(props.params);
  const [valid, setValid] = useState<boolean | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    fetch(`/api/public/uploads/${token}`).then(async (r) => {
      const data = await r.json();
      setValid(Boolean(data.valid));
      setDoctorName(data.doctorName ?? "");
      setPatientName(data.patientName ?? "");
    }).catch(() => setValid(false));
  }, [token]);
  const submit = async () => {
    if (!file) return toast.error("Selecciona un archivo");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/public/uploads/${token}`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "No se pudo cargar");
    toast.success("Archivo cargado");
    setFileName(""); setFile(null);
  };
  if (valid === null) return <div className="p-6">Validando enlace...</div>;
  if (!valid) return <div className="p-6">El enlace expiró o es inválido.</div>;
  return <div className="max-w-xl mx-auto p-6 space-y-4"><h1 className="text-2xl font-semibold">Carga de estudios</h1><p className="text-sm text-muted-foreground">Médico: {doctorName}<br />Paciente: {patientName}</p><Input label="Nombre del archivo" value={fileName} onChange={(e) => setFileName(e.target.value)} /><input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) setFileName(f.name); }} className="block w-full text-sm" /><Button onClick={submit}>Subir estudio</Button></div>;
}
